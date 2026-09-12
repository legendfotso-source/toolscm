-- ===========================================================================
-- What the database itself guarantees.
--
-- Run by tests/run-db-tests.mjs against a throwaway PostgreSQL cluster with
-- the REAL migration applied — not a copy of it, and not a mock. Everything
-- that decides who has paid and who has used their allowance lives in SQL, so
-- this is the layer where being wrong costs money.
--
-- Each check raises an exception on failure, so the first broken guarantee
-- stops the run and names itself.
-- ===========================================================================

\set ON_ERROR_STOP on

create or replace function test_assert(condition boolean, what text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FAILED: %', what;
  end if;
  raise notice 'PASS  %', what;
end;
$$;

-- ---------------------------------------------------------------------------
-- The security definer bypass that was shipped once and must never return.
-- ---------------------------------------------------------------------------
do $$
declare
  leaky text;
begin
  select string_agg(p.proname, ', ')
    into leaky
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('consume_operation', 'peek_usage', 'expire_subscriptions',
                       'has_active_subscription', 'handle_new_user')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  perform test_assert(
    leaky is null,
    'no security definer function is callable by anon or authenticated'
  );
end $$;

do $$
declare
  missing text;
begin
  select string_agg(p.proname, ', ')
    into missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('consume_operation', 'peek_usage', 'expire_subscriptions',
                       'has_active_subscription')
     and not has_function_privilege('service_role', p.oid, 'EXECUTE');

  perform test_assert(missing is null, 'the server can still call every function it needs');
end $$;

-- A revoke that also broke signup would be a worse bug than the hole it fixed.
-- This is the claim that PostgreSQL checks EXECUTE when a trigger is CREATED
-- rather than when it fires — asserted in a comment in the migration, proven
-- here.
do $$
declare
  new_id uuid := gen_random_uuid();
  created integer;
begin
  insert into auth.users (id, email) values (new_id, 'signup-test@example.com');
  select count(*) into created from public.profiles where id = new_id;
  perform test_assert(created = 1, 'signing up still creates a profile after the revoke');
end $$;

-- ---------------------------------------------------------------------------
-- The free daily limit
-- ---------------------------------------------------------------------------
do $$
declare
  device text := 'db-test-' || gen_random_uuid()::text;
  verdict record;
  allowed boolean[] := '{}';
begin
  for i in 1..4 loop
    select * into verdict
      from public.consume_operation('device', device, 'compress-pdf', 3);
    allowed := allowed || verdict.allowed;
  end loop;

  perform test_assert(
    allowed = array[true, true, true, false],
    'the fourth operation of the day is refused'
  );

  -- A Pro caller passes -1 and must not move the counter, or their usage would
  -- eat into the free allowance of whoever shares that device later.
  select * into verdict from public.consume_operation('device', device, 'compress-pdf', -1);
  perform test_assert(verdict.allowed, 'an unlimited caller is allowed');
  perform test_assert(
    public.peek_usage('device', device) = 4,
    'an unlimited call does not increment the counter'
  );

  delete from public.usage_logs where subject = device;
end $$;

-- ---------------------------------------------------------------------------
-- Idempotency: the guarantee that stops one payment buying two months
-- ---------------------------------------------------------------------------
do $$
declare
  reference text := 'dup-' || gen_random_uuid()::text;
  failed boolean := false;
begin
  insert into public.payments (provider, amount, currency, transaction_id, status)
  values ('manual', 2000, 'XAF', reference, 'succeeded');

  begin
    insert into public.payments (provider, amount, currency, transaction_id, status)
    values ('manual', 2000, 'XAF', reference, 'succeeded');
  exception when unique_violation then
    failed := true;
  end;

  perform test_assert(failed, 'the same transaction id cannot be recorded twice');
  delete from public.payments where transaction_id = reference;
end $$;

-- The conditional update that settlePayment relies on. Two webhooks racing both
-- run this statement; exactly one may come back with a row.
do $$
declare
  reference text := 'settle-' || gen_random_uuid()::text;
  first_claim integer;
  second_claim integer;
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (user_id, reference || '@example.com');

  insert into public.payments (user_id, provider, amount, currency, transaction_id, status)
  values (user_id, 'notchpay', 2000, 'XAF', reference, 'pending');

  with claimed as (
    update public.payments set status = 'succeeded'
     where provider = 'notchpay' and transaction_id = reference and status = 'pending'
    returning 1
  ) select count(*) into first_claim from claimed;

  with claimed as (
    update public.payments set status = 'succeeded'
     where provider = 'notchpay' and transaction_id = reference and status = 'pending'
    returning 1
  ) select count(*) into second_claim from claimed;

  perform test_assert(first_claim = 1, 'the first settlement claims the payment');
  perform test_assert(second_claim = 0, 'a second settlement claims nothing');

  delete from public.payments where transaction_id = reference;
  delete from auth.users where id = user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security: one customer must never see another's
-- ---------------------------------------------------------------------------
do $$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (alice, 'alice@example.com'), (bob, 'bob@example.com');

  insert into public.subscriptions (user_id, provider, status, end_date)
  values (alice, 'manual', 'active', now() + interval '30 days'),
         (bob,   'manual', 'active', now() + interval '30 days');

  insert into public.payments (user_id, provider, amount, currency, transaction_id, status)
  values (alice, 'manual', 2000, 'XAF', 'rls-alice', 'succeeded'),
         (bob,   'manual', 9999, 'XAF', 'rls-bob',   'succeeded');
end $$;

-- Act as Alice, through the `authenticated` role and its policies.
--
-- Wrapped in an explicit transaction: psql is in autocommit, and SET LOCAL
-- outside a transaction block is silently discarded with a warning — which
-- would leave this running as the superuser and quietly "passing" a test of
-- row level security that never left superuser context. The identity is read
-- first, as postgres, precisely because Alice cannot look herself up until she
-- is Alice.
begin;

do $$
declare
  alice uuid;
begin
  select id into alice from public.profiles where email = 'alice@example.com';
  perform set_config('test.user_id', alice::text, true);
end $$;

set local role authenticated;

do $$
declare
  seen integer;
begin
  -- Proof that the role switch actually happened. Without this, every check
  -- below could pass as the superuser and prove nothing.
  perform test_assert(current_user = 'authenticated', 'the checks below really run as a signed-in user');
  perform test_assert(
    nullif(current_setting('test.user_id', true), '') is not null,
    'an identity is in place'
  );

  select count(*) into seen from public.profiles;
  perform test_assert(seen = 1, 'a signed-in user sees exactly one profile: their own');

  select count(*) into seen from public.subscriptions;
  perform test_assert(seen = 1, 'a signed-in user sees only their own subscription');

  select count(*) into seen from public.payments;
  perform test_assert(seen = 1, 'a signed-in user sees only their own payments');

  select count(*) into seen from public.payments where amount = 9999;
  perform test_assert(seen = 0, 'a signed-in user cannot see another customer''s payment');
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Privilege, not just policy: the browser roles were never granted these at all
-- ---------------------------------------------------------------------------
do $$
declare
  reachable text;
begin
  select string_agg(tablename, ', ')
    into reachable
    from pg_tables
   where schemaname = 'public'
     and tablename in ('usage_logs', 'tool_events', 'admin_settings')
     and (has_table_privilege('anon', schemaname || '.' || tablename, 'SELECT')
       or has_table_privilege('authenticated', schemaname || '.' || tablename, 'SELECT')
       or has_table_privilege('anon', schemaname || '.' || tablename, 'INSERT')
       or has_table_privilege('authenticated', schemaname || '.' || tablename, 'INSERT'));

  perform test_assert(
    reachable is null,
    'usage, analytics and settings are unreachable by privilege, not only by policy'
  );
end $$;

-- A user may correct their email. They may NOT make themselves an admin.
do $$
begin
  perform test_assert(
    not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
    'a signed-in user cannot grant themselves admin'
  );
  perform test_assert(
    has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE'),
    'a signed-in user can still correct their own email'
  );
end $$;

-- The anonymous role holds nothing at all.
do $$
declare
  granted text;
begin
  select string_agg(tablename, ', ')
    into granted
    from pg_tables
   where schemaname = 'public'
     and (has_table_privilege('anon', schemaname || '.' || tablename, 'SELECT')
       or has_table_privilege('anon', schemaname || '.' || tablename, 'INSERT')
       or has_table_privilege('anon', schemaname || '.' || tablename, 'UPDATE'));

  perform test_assert(granted is null, 'a visitor who has not signed in can reach no table at all');
end $$;

-- ---------------------------------------------------------------------------
-- Settings ship switched off
-- ---------------------------------------------------------------------------
do $$
declare
  settings jsonb;
begin
  select jsonb_object_agg(key, value) into settings from public.admin_settings;

  perform test_assert(settings->'limits_enabled'   = 'false'::jsonb, 'limits ship switched off');
  perform test_assert(settings->'payments_enabled' = 'false'::jsonb, 'payments ship switched off');
  perform test_assert(settings->'free_daily_limit' = '3'::jsonb,     'the free allowance is three a day');
end $$;

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
do $$
declare
  who uuid := gen_random_uuid();
  expired integer;
begin
  insert into auth.users (id, email) values (who, 'lapsed@example.com');
  insert into public.subscriptions (user_id, provider, status, end_date)
  values (who, 'manual', 'active', now() - interval '1 day');

  perform test_assert(
    not public.has_active_subscription(who),
    'a subscription past its end date does not count as active, even before any cron runs'
  );

  select public.expire_subscriptions() into expired;
  perform test_assert(expired >= 1, 'expire_subscriptions marks lapsed rows');
end $$;
