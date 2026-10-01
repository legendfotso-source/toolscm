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
  -- Every security definer function in the schema, not a list written by
  -- hand. A hand-written list is only correct until somebody adds a function
  -- and forgets to add it here, which is exactly how the original hole would
  -- have come back: record_page_view was added later and this check caught it
  -- for free.
  select string_agg(p.proname, ', ')
    into leaky
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
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
     and p.prosecdef
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

-- ---------------------------------------------------------------------------
-- Counting visitors without being able to follow one
--
-- The privacy policy promises two things about this table, and both are
-- structural rather than a matter of good intentions:
--   1. a repeat visit increments a counter instead of adding a row, so the
--      table never becomes a timeline;
--   2. nothing in the browser can read it, by privilege and not merely by
--      policy.
-- ---------------------------------------------------------------------------
do $$
declare
  rows_after integer;
  views_after integer;
  distinct_visitors integer;
begin
  perform public.record_page_view('/pricing', 'visitor-a', 'CM', 'mobile', 'web.whatsapp.com');
  perform public.record_page_view('/pricing', 'visitor-a', 'CM', 'mobile', 'web.whatsapp.com');
  perform public.record_page_view('/pricing', 'visitor-a', 'CM', 'mobile', 'web.whatsapp.com');

  select count(*), sum(views) into rows_after, views_after
    from public.page_views
   where path = '/pricing' and visitor = 'visitor-a';

  perform test_assert(
    rows_after = 1,
    'three visits to one page by one visitor stay a single row'
  );
  perform test_assert(
    views_after = 3,
    'the counter actually counts rather than silently ignoring repeats'
  );
end $$;

do $$
declare
  visitors integer;
  paths integer;
begin
  perform public.record_page_view('/pricing', 'visitor-b', 'FR', 'desktop', null);
  perform public.record_page_view('/tool/compress-pdf', 'visitor-a', 'CM', 'mobile', null);

  select count(distinct visitor) into visitors from public.page_views;
  select count(*) into paths from public.page_views where visitor = 'visitor-a';

  perform test_assert(visitors = 2, 'two different visitors are two different people');
  perform test_assert(paths = 2, 'one visitor reading two pages is two rows, one per page');
end $$;

-- The country, device and referrer describe the first visit and are never
-- rewritten. Overwriting them on every return would turn a counter into a
-- "where were they last seen" log, which is precisely what this table exists
-- not to be.
do $$
declare
  seen_country text;
  seen_referrer text;
begin
  perform public.record_page_view('/pricing', 'visitor-a', 'US', 'desktop', 'google.com');

  select country, referrer into seen_country, seen_referrer
    from public.page_views
   where path = '/pricing' and visitor = 'visitor-a';

  perform test_assert(
    seen_country = 'CM' and seen_referrer = 'web.whatsapp.com',
    'a later visit does not rewrite where the first one came from'
  );
end $$;

-- Unreachable from the browser, like usage_logs and tool_events before it.
do $$
begin
  perform test_assert(
    not has_table_privilege('anon', 'public.page_views', 'SELECT')
      and not has_table_privilege('authenticated', 'public.page_views', 'SELECT'),
    'nobody signed in or anonymous can read the visit counts'
  );
  perform test_assert(
    not has_table_privilege('anon', 'public.page_views', 'INSERT')
      and not has_table_privilege('authenticated', 'public.page_views', 'INSERT'),
    'and nobody in a browser can write to them either'
  );
end $$;

-- ===========================================================================
-- 0003 — the unlimited flag, and the approval queue
-- ===========================================================================

-- The flag exists, and it is OFF by default. A column that defaulted to true
-- would hand the whole site to everybody who signs up.
do $$
declare
  default_expression text;
begin
  select column_default into default_expression
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_unlimited';

  perform test_assert(default_expression is not null, 'profiles.is_unlimited exists');
  perform test_assert(default_expression like 'false%', 'a new account is not unlimited by default');
end $$;

-- The one guarantee the whole feature rests on: a signed-in user can READ the
-- flag (so /account can say what the account is) and cannot WRITE it. The
-- grant on profiles is `update (email)` and nothing else, so this must hold
-- for every column except email.
do $$
begin
  perform test_assert(
    has_column_privilege('authenticated', 'public.profiles', 'is_unlimited', 'SELECT'),
    'a signed-in user can read their own unlimited flag'
  );
  perform test_assert(
    not has_column_privilege('authenticated', 'public.profiles', 'is_unlimited', 'UPDATE'),
    'nobody can give themselves unlimited access from a browser'
  );
  perform test_assert(
    not has_column_privilege('anon', 'public.profiles', 'is_unlimited', 'SELECT'),
    'and an anonymous visitor cannot read it at all'
  );
  -- The same hole, one column over. is_admin was already protected; a new
  -- column being protected only by accident is not protection.
  perform test_assert(
    not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
    'nor make themselves an administrator'
  );
end $$;

-- A claim grants nothing, so the browser may create one. It may not decide
-- one: `status` has no UPDATE grant, and neither has anything else on the row.
do $$
begin
  -- Column-level, deliberately: the grant names the columns a customer may
  -- write and no others, so table-level INSERT is false here and SHOULD be.
  perform test_assert(
    has_column_privilege('authenticated', 'public.payment_claims', 'transaction_id', 'INSERT')
      and has_column_privilege('authenticated', 'public.payment_claims', 'tier', 'INSERT'),
    'a signed-in customer can declare a payment'
  );
  perform test_assert(
    has_table_privilege('authenticated', 'public.payment_claims', 'SELECT'),
    'and can read back what they declared'
  );
  perform test_assert(
    not has_table_privilege('authenticated', 'public.payment_claims', 'UPDATE'),
    'and cannot approve it themselves'
  );
  perform test_assert(
    not has_column_privilege('authenticated', 'public.payment_claims', 'status', 'INSERT'),
    'nor insert one that is already approved'
  );
  perform test_assert(
    not has_table_privilege('authenticated', 'public.payment_claims', 'DELETE'),
    'nor delete a refused one and try again'
  );
  perform test_assert(
    not has_table_privilege('anon', 'public.payment_claims', 'SELECT')
      and not has_table_privilege('anon', 'public.payment_claims', 'INSERT'),
    'an anonymous visitor cannot touch the queue'
  );
  perform test_assert(
    (select relrowsecurity from pg_class where oid = 'public.payment_claims'::regclass),
    'row level security is on for the queue'
  );
end $$;

-- One claim per Mobile Money reference, case- and space-insensitively. Without
-- this, a customer tapping the button four times leaves four claims and an
-- admin working through the queue approves the same transfer four times.
do $$
declare
  user_a uuid;
  clashed boolean := false;
begin
  insert into auth.users (email) values ('claimer@example.com') returning id into user_a;

  insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
  values (user_a, 'pro', 30, 2000, 'MP260930.1432.A1');

  begin
    insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
    values (user_a, 'max', 90, 5000, '  mp260930.1432.a1  ');
  exception when unique_violation then
    clashed := true;
  end;

  perform test_assert(clashed, 'the same reference cannot be claimed twice, whatever the case');
  perform test_assert(
    (select count(*) from public.payment_claims where user_id = user_a) = 1,
    'and only one row survives'
  );
end $$;

-- The row refuses nonsense on its own, without any application code.
do $$
declare
  user_b uuid;
  rejected integer := 0;
begin
  insert into auth.users (email) values ('badclaims@example.com') returning id into user_b;

  begin
    insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
    values (user_b, 'pro', 30, 2000, ' x ');
  exception when check_violation then rejected := rejected + 1;
  end;

  begin
    insert into public.payment_claims (user_id, tier, days, amount, transaction_id, status)
    values (user_b, 'pro', 30, 2000, 'ref-weird-status', 'granted');
  exception when check_violation then rejected := rejected + 1;
  end;

  begin
    insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
    values (user_b, 'pro', 30, -5, 'ref-negative');
  exception when check_violation then rejected := rejected + 1;
  end;

  begin
    insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
    values (user_b, 'pro', 99999, 2000, 'ref-forever');
  exception when check_violation then rejected := rejected + 1;
  end;

  perform test_assert(
    rejected = 4,
    'a two-character reference, an invented status, a negative amount and a 273-year term are all refused'
  );
end $$;

-- A signed-in customer sees their own claims and nobody else's. This is the
-- policy, exercised as two different users rather than read off the catalogue.
do $$
declare
  user_c uuid;
  user_d uuid;
  seen integer;
begin
  insert into auth.users (email) values ('mine@example.com') returning id into user_c;
  insert into auth.users (email) values ('theirs@example.com') returning id into user_d;

  insert into public.payment_claims (user_id, tier, days, amount, transaction_id)
  values (user_c, 'pro', 30, 2000, 'ref-mine'), (user_d, 'pro', 30, 2000, 'ref-theirs');

  set local role authenticated;
  perform set_config('test.user_id', user_c::text, true);

  select count(*) into seen from public.payment_claims;
  perform test_assert(seen = 1, 'a customer sees only their own payment requests');

  select count(*) into seen from public.payment_claims where transaction_id = 'ref-theirs';
  perform test_assert(seen = 0, 'and not somebody else''s reference');

  reset role;
end $$;
