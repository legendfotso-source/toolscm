-- ===========================================================================
-- Tools.cm — TOUTES LES MIGRATIONS, DANS L'ORDRE
--
-- Tout coller dans l'éditeur SQL de Supabase, appuyer sur Run, une fois.
--
-- Si une fenêtre « Potential issue detected » apparaît, c'est normal : ce
-- fichier remplace des politiques de sécurité et retire des droits au rôle
-- anonyme. Cliquez sur « Run query ».
--
-- Chaque migration est réexécutable sans danger : les repasser alors qu'elles
-- sont déjà passées ne change rien. En cas de doute, repassez tout.
--
-- NE PAS MODIFIER À LA MAIN — ce fichier est produit par
-- `npm run paste-file` et `npm run test:db` échoue s'il a dérivé.
-- ===========================================================================

-- ===========================================================================
-- Tools.cm — initial schema
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- It is written to be safely re-runnable.
--
-- What this database does NOT hold, and never will: user files, file contents,
-- extracted text, or filenames. Tools run in the browser; this database only
-- knows who has paid and how many operations an anonymous device has run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, created automatically on signup
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Free use requires no account, so most visitors never appear here.';

-- ---------------------------------------------------------------------------
-- subscriptions — the single source of truth for Pro access
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.subscription_status as enum ('active', 'expired', 'cancelled', 'pending');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_provider as enum ('notchpay', 'campay', 'stripe', 'manual');
exception when duplicate_object then null;
end $$;

-- Adding a provider later must not need the type dropped and recreated, which
-- would mean dropping every column that uses it. `add value if not exists` is
-- safe to re-run and is how a new provider joins an existing database.
do $$ begin
  alter type public.payment_provider add value if not exists 'campay';
exception when others then null;
end $$;

create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  provider    public.payment_provider not null,
  status      public.subscription_status not null default 'pending',
  start_date  timestamptz,
  end_date    timestamptz,
  -- The provider's own identifier for the subscription or the order, so a
  -- webhook can find the right row without trusting anything from the browser.
  provider_ref text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_active_idx
  on public.subscriptions (user_id, end_date desc) where status = 'active';
create unique index if not exists subscriptions_provider_ref_idx
  on public.subscriptions (provider, provider_ref) where provider_ref is not null;

-- ---------------------------------------------------------------------------
-- payments — an immutable record of every payment notification we accepted
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider        public.payment_provider not null,
  -- Minor units (XAF has none, so 2000 XAF is stored as 2000; USD 5.00 as 500).
  amount          integer not null check (amount >= 0),
  currency        text not null check (char_length(currency) = 3),
  transaction_id  text not null,
  status          public.payment_status not null default 'pending',
  -- The provider's payload, kept for reconciliation and dispute handling.
  raw             jsonb,
  created_at      timestamptz not null default now()
);

-- THE idempotency guarantee. A provider that delivers the same webhook twice
-- (they all do) cannot create two payments or two subscriptions, because the
-- second insert violates this constraint and the handler treats that as
-- "already processed" rather than as an error.
create unique index if not exists payments_provider_transaction_idx
  on public.payments (provider, transaction_id);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

comment on index public.payments_provider_transaction_idx is
  'Idempotency key for webhooks: a repeated notification cannot be applied twice.';

-- ---------------------------------------------------------------------------
-- usage_logs — the free daily allowance
--
-- Two subjects are counted, for different reasons:
--   device  — an anonymous id the browser keeps. This carries the real limit.
--   network — a salted hash of IP + user agent. Mobile networks in Cameroon
--             share IP addresses heavily, so this can NEVER carry the per-user
--             limit; it exists only as a much looser abuse ceiling for someone
--             scripting the site. Raw IP addresses are never stored.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.usage_subject as enum ('device', 'network');
exception when duplicate_object then null;
end $$;

create table if not exists public.usage_logs (
  id           bigint generated always as identity primary key,
  subject_type public.usage_subject not null,
  subject      text not null,
  day          date not null default (now() at time zone 'utc')::date,
  tool         text not null,
  count        integer not null default 0 check (count >= 0),
  updated_at   timestamptz not null default now()
);

create unique index if not exists usage_logs_subject_day_tool_idx
  on public.usage_logs (subject_type, subject, day, tool);
create index if not exists usage_logs_day_idx on public.usage_logs (day);

comment on column public.usage_logs.subject is
  'An opaque device id or a salted hash of network information. Never a raw IP address.';

-- ---------------------------------------------------------------------------
-- tool_events — product analytics, deliberately contentless
-- ---------------------------------------------------------------------------
create table if not exists public.tool_events (
  id           bigint generated always as identity primary key,
  anonymous_id text,
  tool         text,
  event        text not null,
  -- Small facts only: a duration, an error key, a preset name. Never a
  -- filename, never file contents.
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists tool_events_created_idx on public.tool_events (created_at desc);
create index if not exists tool_events_tool_idx on public.tool_events (tool, created_at desc);

comment on table public.tool_events is
  'Counts of what happened, never what was in the file. No filenames, no contents.';

-- ---------------------------------------------------------------------------
-- page_views — how many people came, never which people
--
-- The admin needs to know whether anybody is arriving and which pages they
-- land on. That is a legitimate question and it can be answered honestly,
-- because answering it does not require knowing who anyone is.
--
-- `visitor` is a salted hash that includes TODAY'S DATE. The same person
-- visiting tomorrow hashes to something completely different, so "visitors
-- today" is countable while "what did this person do last week" is not a
-- question this table can answer — not by us, not by anyone who obtains it.
-- That is a deliberate limit, not an oversight: a site that promises files
-- never leave the device should not quietly build a profile of the person
-- holding the device.
--
-- One row per (day, path, visitor) with a counter, rather than one row per
-- view. It keeps the table small, and it means the raw data is already the
-- aggregate — there is no detailed history sitting underneath waiting to be
-- mined.
-- ---------------------------------------------------------------------------
create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  day        date not null default (now() at time zone 'utc')::date,
  -- A path from our own site, never a full URL and never a query string:
  -- query strings are where personal data ends up by accident.
  path       text not null,
  visitor    text not null,
  -- Two-letter country from the hosting layer. Coarse on purpose.
  country    text,
  -- 'mobile' or 'desktop'. The whole product is built for cheap Android
  -- phones, so knowing the split is the difference between guessing and
  -- knowing.
  device     text,
  -- The HOST that linked here (google.com, web.whatsapp.com), never the full
  -- referring URL, which can carry someone's search terms.
  referrer   text,
  views      integer not null default 1 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists page_views_day_path_visitor_idx
  on public.page_views (day, path, visitor);
create index if not exists page_views_day_idx on public.page_views (day desc);

comment on table public.page_views is
  'Visit counts. The visitor hash is re-salted daily and cannot be linked across days.';
comment on column public.page_views.visitor is
  'sha256(salt | date | ip | user agent), truncated. Not reversible, and different tomorrow.';

-- ---------------------------------------------------------------------------
-- admin_settings — values the admin can change without a deployment
-- ---------------------------------------------------------------------------
create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (key, value) values
  ('free_daily_limit',    '3'::jsonb),
  ('network_daily_limit', '60'::jsonb),
  ('price_xaf',           '2000'::jsonb),
  ('price_usd',           '5'::jsonb),
  ('payments_enabled',    'false'::jsonb),
  ('limits_enabled',      'false'::jsonb),
  ('ads_enabled',         'false'::jsonb),
  ('maintenance_mode',    'false'::jsonb)
on conflict (key) do nothing;

comment on column public.admin_settings.value is
  'limits_enabled and payments_enabled both default to false: the site behaves exactly as it does today until they are deliberately switched on.';

-- ===========================================================================
-- Row level security
--
-- Default posture: deny everything. A table with RLS enabled and no policy is
-- unreadable by the anon and authenticated roles, which is what we want for
-- usage and analytics. The service role bypasses RLS entirely and is the only
-- thing that ever writes them — from server code, never from the browser.
-- ===========================================================================

alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.payments       enable row level security;
alter table public.usage_logs     enable row level security;
alter table public.tool_events    enable row level security;
alter table public.page_views     enable row level security;
alter table public.admin_settings enable row level security;

-- profiles: a user sees and edits only their own row.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- subscriptions: read-only to their owner. Only the service role writes them,
-- and only after a provider signature has been verified.
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- payments: same.
drop policy if exists "payments: read own" on public.payments;
create policy "payments: read own" on public.payments
  for select using (auth.uid() = user_id);

-- usage_logs, tool_events, admin_settings: no client policy at all.
-- Deliberate. If the browser could write usage_logs, the daily limit would be
-- decorative.

-- ===========================================================================
-- Functions
-- ===========================================================================

-- Create a profile the moment a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is this user Pro right now? Evaluated in the database so that no browser
-- state is involved in the answer.
create or replace function public.has_active_subscription(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and status = 'active'
      and (end_date is null or end_date > now())
  );
$$;

-- Mark subscriptions whose term has run out. Called from a scheduled job, and
-- also defensively before any Pro check, so an expired subscription cannot
-- keep granting access just because no cron ran.
create or replace function public.expire_subscriptions()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.subscriptions
       set status = 'expired', updated_at = now()
     where status = 'active' and end_date is not null and end_date <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

/*
 * Consume one free operation, atomically.
 *
 * Returns the new count and whether it was allowed. The increment and the
 * check happen in a single statement so two requests racing from the same
 * device cannot both see "2 used" and both be allowed through.
 *
 * p_limit of -1 means unlimited (a Pro user, or limits switched off).
 */
create or replace function public.consume_operation(
  p_subject_type public.usage_subject,
  p_subject      text,
  p_tool         text,
  p_limit        integer
)
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
begin
  if p_limit < 0 then
    return query select true, 0, -1;
    return;
  end if;

  -- The daily allowance is across all tools, so usage is counted against a
  -- single row per subject per day. The tool name is kept on that row purely
  -- to show which tool was used most recently.
  insert into public.usage_logs (subject_type, subject, day, tool, count)
  values (p_subject_type, p_subject, v_today, p_tool, 1)
  on conflict (subject_type, subject, day, tool)
  do update set count = usage_logs.count + 1,
                updated_at = now()
  -- Qualified: "count" is also an aggregate name, and the RETURNING clause
  -- must be unambiguous about which one is meant.
  returning usage_logs.count into v_used;

  return query
    select v_used <= p_limit,
           v_used,
           greatest(p_limit - v_used, 0);
end;
$$;

-- How many operations has this subject used today, without consuming one?
create or replace function public.peek_usage(
  p_subject_type public.usage_subject,
  p_subject      text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(count), 0)::integer
    from public.usage_logs
   where subject_type = p_subject_type
     and subject = p_subject
     and day = (now() at time zone 'utc')::date;
$$;

-- Count one visit.
--
-- The upsert is what makes this cheap: a person reading eight tool pages adds
-- eight rows on their first day and then only increments them, however many
-- times they come back that day.
--
-- The country, device and referrer are written once, when the row is created,
-- and never overwritten. A second visit from the same person on the same day
-- is the same visit for our purposes, and re-writing those columns would turn
-- a counter into a "where were they last seen" log, which is exactly what this
-- table is designed not to be.
create or replace function public.record_page_view(
  p_path     text,
  p_visitor  text,
  p_country  text default null,
  p_device   text default null,
  p_referrer text default null
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.page_views (path, visitor, country, device, referrer)
  values (p_path, p_visitor, p_country, p_device, p_referrer)
  on conflict (day, path, visitor) do update
    set views      = public.page_views.views + 1,
        updated_at = now();
$$;

-- ---------------------------------------------------------------------------
-- These functions must only ever run from server code holding the secret key.
--
-- READ THIS BEFORE CHANGING IT. The obvious spelling is wrong:
--
--     revoke execute on function ... from anon, authenticated;   -- DOES NOTHING
--
-- PostgreSQL grants EXECUTE to the PUBLIC pseudo-role on every new function.
-- `anon` and `authenticated` inherit it from PUBLIC, so revoking from them by
-- name removes a privilege they were never granted directly and leaves the
-- inherited one untouched. This project shipped that mistake, and probing the
-- live database with nothing but the public publishable key proved it: all
-- four functions answered 200 to an anonymous caller.
--
-- It mattered because these functions are `security definer` — they run with
-- the owner's rights and so ignore both the table grants below and row level
-- security. usage_logs is unreachable from the browser, but consume_operation
-- writes it, so any visitor could have burned another device's daily allowance
-- or simply passed p_limit = -1 and been told "allowed" forever. The lock was
-- on the door; the window was open.
--
-- So: revoke from PUBLIC, where the privilege actually lives, then grant it
-- back to exactly one role.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- And for functions added later, so this cannot quietly come back.
alter default privileges in schema public
  revoke execute on functions from public;

grant execute on function
  public.consume_operation(public.usage_subject, text, text, integer)
  to service_role;

grant execute on function
  public.peek_usage(public.usage_subject, text)
  to service_role;

grant execute on function public.expire_subscriptions()        to service_role;
grant execute on function public.has_active_subscription(uuid) to service_role;

grant execute on function
  public.record_page_view(text, text, text, text, text)
  to service_role;

-- handle_new_user runs from a trigger on auth.users. PostgreSQL checks EXECUTE
-- when a trigger is created rather than when it fires, so this is
-- belt-and-braces — but signup breaking is not worth risking to save a line.
grant execute on function public.handle_new_user()
  to service_role, supabase_auth_admin;

-- ===========================================================================
-- Explicit privileges
--
-- The project is created with "automatically expose new tables" OFF, which is
-- Supabase's own recommendation. Nothing in the public schema is reachable
-- through the Data API unless it is granted here — so these few lines are the
-- complete list of what a browser can even attempt, before row level security
-- then decides which rows it may see.
--
-- usage_logs, tool_events, page_views and admin_settings appear nowhere below.
-- They are unreachable from the browser by privilege, not merely by policy:
-- two independent locks on the tables that decide who has paid, who has used
-- their allowance, and how many people came.
-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select on public.profiles      to authenticated;
grant update (email)  on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.payments      to authenticated;

-- The anonymous role gets nothing at all. A visitor who has not signed in has
-- no reason to read any table, and the tools do not need one.


-- Tools.cm — plan tiers
--
-- Until now a subscription was binary: you had one or you did not, and having
-- one meant Pro. Max needs a third answer, so the row has to say WHICH plan
-- was bought rather than only that something was.
--
-- Safe to run more than once, and safe to run on a database with live
-- subscriptions in it: every existing paid row is backfilled to 'pro', because
-- every subscription sold before this migration was a Pro subscription and
-- reading them as anything else would take away something people paid for.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'pro', 'max');
  end if;
end $$;

alter table public.subscriptions
  add column if not exists tier public.plan_tier not null default 'pro';

-- Belt and braces: the default above only covers rows written from now on.
update public.subscriptions set tier = 'pro' where tier is null;

comment on column public.subscriptions.tier is
  'Which plan this subscription buys. Read by getEntitlement(); never sent by a browser.';

-- The payments table records what was bought, so a refund or a dispute can be
-- traced to a tier without joining through a subscription that may since have
-- been extended to a different one.
alter table public.payments
  add column if not exists tier public.plan_tier;

comment on column public.payments.tier is
  'The tier this payment was for, as it was at the time of payment.';


-- Tools.cm — the approval queue, and the unlimited account
--
-- Two things that were missing, and one property they share: neither of them
-- may be settable from a browser.
--
-- 1. `profiles.is_unlimited` — an account with no caps at all. Granted, never
--    sold. `authenticated` already holds `update (email)` on profiles and
--    nothing else (see the grants at the end of 0001), so a signed-in user
--    cannot write this column even though they can read their own row. That
--    read is on purpose: /account has to be able to say what the account is.
--
-- 2. `payment_claims` — "I have paid, here is the reference". Somebody who
--    sends 2,000 FCFA by Mobile Money had no way to tell the site about it;
--    they had to reach Fortune on WhatsApp and he had to type the reference
--    into /admin himself. A claim is a REQUEST and grants nothing: the row
--    carries no access, and the only thing that turns one into a subscription
--    is an admin pressing Approuver, which runs the same idempotent grant
--    code as a real webhook.
--
-- Safe to run more than once, and safe on a database with live rows in it.

-- ---------------------------------------------------------------------------
-- Prerequisite: the plan_tier type
-- ---------------------------------------------------------------------------
-- 0002 creates it. This file needs it, for payment_claims.tier.
--
-- Repeated here because on 1 October 2026 this file was pasted into the
-- Supabase SQL editor of the live project and died on line 39 with
-- `ERROR: 42704: type "public.plan_tier" does not exist` — 0002 had been
-- written, tested and committed, and then never run against production. The
-- file that depends on a step somebody has to remember will eventually be run
-- without it, and "it failed with a type error halfway through" is the worst
-- possible way to find that out.
--
-- So this file now stands on its own. It does NOT make 0002 unnecessary:
-- 0002 also adds `tier` to subscriptions and payments, without which no
-- customer can ever be on Max. Run both.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'pro', 'max');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The unlimited flag
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_unlimited boolean not null default false;

comment on column public.profiles.is_unlimited is
  'No caps at all for this account: no daily quota, no batch limit, no file-size limit. Written only by the service role; read by getEntitlement().';

-- ---------------------------------------------------------------------------
-- payment_claims — a declared payment waiting for a human to confirm it
-- ---------------------------------------------------------------------------
create table if not exists public.payment_claims (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  -- What they say they bought. The PRICE is never taken from the browser: the
  -- server recomputes it from this tier and this many days at claim time.
  tier            public.plan_tier not null default 'pro',
  days            integer not null default 30 check (days between 1 and 3650),
  amount          integer not null check (amount >= 0),
  currency        text not null default 'XAF',
  operator        text,
  phone           text,
  -- The Mobile Money reference from their SMS. This is the whole point of the
  -- row: it is what Fortune checks against his own statement.
  transaction_id  text not null check (length(btrim(transaction_id)) >= 3),
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  note            text,
  -- Filled in when a decision is made.
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  decision_note   text,
  payment_id      uuid references public.payments (id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.payment_claims is
  'A payment a user says they made, waiting for an admin to confirm it. Carries no access on its own.';

-- One claim per transaction reference, case-insensitively.
--
-- Not a nicety. Without it, somebody who taps "J'ai payé" four times because
-- the page felt slow leaves four identical claims, and an admin working
-- through the queue approves the same 2,000 FCFA four times. The grant code
-- is idempotent on (provider, transaction_id) so no extra access would be
-- handed out — but the queue would be a mess and the duplicates would look
-- like four customers.
create unique index if not exists payment_claims_reference
  on public.payment_claims (lower(btrim(transaction_id)));

-- The queue is read in one order only: oldest pending first, because that is
-- the order somebody waiting has been waiting in.
create index if not exists payment_claims_pending
  on public.payment_claims (status, created_at);

create index if not exists payment_claims_by_user
  on public.payment_claims (user_id, created_at desc);

alter table public.payment_claims enable row level security;

-- A user may see their own claims — so the page can say "waiting for
-- confirmation" instead of nothing — and may create one for themselves.
-- Nobody may update or delete one from the browser: a claim's status is the
-- admin's decision, and `status` has no update grant at all.
drop policy if exists "claims: read own" on public.payment_claims;
create policy "claims: read own" on public.payment_claims
  for select using (auth.uid() = user_id);

drop policy if exists "claims: create own" on public.payment_claims;
create policy "claims: create own" on public.payment_claims
  for insert with check (auth.uid() = user_id and status = 'pending');

grant select on public.payment_claims to authenticated;
grant insert (user_id, tier, days, amount, currency, operator, phone, transaction_id, note)
  on public.payment_claims to authenticated;

-- The anonymous role gets nothing, as everywhere else in this schema.
revoke all on public.payment_claims from anon;


-- ===========================================================================
-- 0004 — Close two ways a user could grant themselves access
--
-- Both were found by auditing the privileges rather than the code, which is
-- the only way either of them was ever going to be found: the application
-- code is correct in both cases. What was wrong is that the application was
-- not the only door.
--
-- Safe to run twice. Safe to run before or after the matching code deploy —
-- the code no longer depends on either grant existing or not existing.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A user could write their own claim, with their own price and their own
--    number of days.
--
--    `createClaim` computes `days` and `amount` from the server's settings and
--    never reads them from the request. But 0003 also handed `authenticated` a
--    direct INSERT grant on those columns, and the RLS policy only asked that
--    the row be the caller's own and start as 'pending'. So the route was not
--    the only way in: a signed-in user could POST to the Data API with the
--    public anon key and insert
--
--        { tier: 'max', days: 3650, amount: 2000 }
--
--    which the column CHECKs allow — `days between 1 and 3650` was written to
--    bound a typo, not an attacker. The row then sat in the admin queue
--    looking exactly like a genuine 2,000 FCFA Mobile Money transfer, and
--    approving it granted ten years of Max.
--
--    The fix is to stop granting the columns that decide what is being bought.
--    A user still creates claims — that is the whole feature — but only
--    through the route, which prices them. INSERT itself is revoked rather
--    than narrowed: PostgreSQL column grants cannot say "you may insert this
--    column but only with a value I choose", and a grant on the harmless
--    columns alone would make the route's own insert fail on the others.
-- ---------------------------------------------------------------------------

-- Guarded, because every migration here has to stand on its own: the test
-- harness applies each one onto a database holding only 0001, and a bare
-- `revoke ... on public.payment_claims` fails outright when 0003 has not run.
-- A migration that only works in one order is a migration that will one day be
-- run in the other — which is exactly how this deployment broke in September.
do $$
begin
  if to_regclass('public.payment_claims') is null then
    raise notice 'payment_claims does not exist yet; 0003 will create it already closed.';
    return;
  end if;
  revoke insert on public.payment_claims from authenticated;
  -- The policy goes too. A policy with no grant behind it is dead weight that
  -- reads, to the next person, as if inserting were still allowed.
  drop policy if exists "payment_claims: insert own pending" on public.payment_claims;
end $$;

-- SELECT stays: people must be able to see their own claims and whether they
-- were approved. That is the one thing the browser legitimately reads here.


-- ---------------------------------------------------------------------------
-- 2. A user could change the address that admin grants are addressed to.
--
--    `profiles.email` was user-writable (`grant update (email)`, 0001) and
--    nullable, non-unique, and never re-checked against auth.users. Every
--    admin action — grant Pro, grant Max, grant unlimited — resolves its
--    subject by matching that column:
--
--        findUserIdByEmail() → profiles.email ilike <address>
--
--    So a user who set their own `profiles.email` to an address the owner was
--    about to activate received that grant instead, including `is_unlimited`,
--    which is owner-level access. And a user who merely COPIED an existing
--    address broke the legitimate activation: two matching rows make
--    `maybeSingle()` return nothing, so the grant fails as "no such account"
--    and the person who actually paid is told they do not exist.
--
--    The fix is NOT to take the column away: correcting your own address is a
--    feature people use. It is to stop treating a copy as an identity.
--    findUserIdByEmail now resolves through auth.users — written only by
--    Supabase Auth, verified, unique — and the trigger below keeps the display
--    copy honest so the admin list shows the real address rather than a
--    stale or invented one.
-- ---------------------------------------------------------------------------

-- The grant STAYS. Correcting your own address on the account page is a real
-- feature and removing it would be fixing the wrong thing: the vulnerability
-- was never that the copy is writable, it was that admin grants resolved their
-- subject against the copy. That is fixed in findUserIdByEmail, which now asks
-- Supabase Auth — the address somebody can actually sign in with, written only
-- by Auth, and unique. The column goes back to being what it always should
-- have been: a display copy, with no authority.
--
-- Keep the copy in step with the real address. 0001 copies it on INSERT; this
-- adds the UPDATE half, so an address changed in Supabase Auth stops silently
-- disagreeing with the one the admin page shows.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
-- An empty search_path, set explicitly: a security definer function that
-- inherits the caller's search_path can be made to call a different `public`.
-- Every object below is therefore schema-qualified.
set search_path = ''
as $$
begin
  update public.profiles
     set email = btrim(new.email)
   where id = new.id
     and coalesce(email, '') is distinct from btrim(coalesce(new.email, ''));
  return new;
end;
$$;

-- Revoked from PUBLIC, then granted back to the one role that needs it.
-- `revoke ... from public` alone would leave service_role without EXECUTE as
-- well — it holds the privilege through PUBLIC, not in its own right — and the
-- trigger would then be uncallable by the server. 0001 learned this the hard
-- way and db-checks.sql asserts it; the same rule applies to every function
-- added afterwards, including this one.
revoke all on function public.sync_profile_email() from public;
grant execute on function public.sync_profile_email() to service_role;

drop trigger if exists sync_profile_email on auth.users;
create trigger sync_profile_email
  after update of email on auth.users
  for each row execute function public.sync_profile_email();


-- ---------------------------------------------------------------------------
-- 3. Repair what the two holes may already have left behind.
--
--    Run as part of the migration rather than left as an instruction, because
--    an instruction in a comment is a step somebody does not do. Both repairs
--    are idempotent and both are no-ops on a clean database.
-- ---------------------------------------------------------------------------

-- Any profile address that disagrees with auth.users is replaced by the real
-- one. This is where a spoofed address gets corrected.
update public.profiles p
   set email = btrim(u.email)
  from auth.users u
 where u.id = p.id
   and coalesce(p.email, '') is distinct from btrim(coalesce(u.email, ''));

-- Pending claims whose numbers could not have come from createClaim are
-- marked rather than deleted: deleting them would hide that it happened, and
-- the note is what tells the reviewer not to trust the figures on the row.
-- (Approval reprices from the tier regardless, so these grant nothing extra;
-- this only makes them visible.)
do $$
begin
  if to_regclass('public.payment_claims') is null then return; end if;
  update public.payment_claims
     set note = coalesce(nullif(btrim(note), '') || ' | ', '')
                || 'ATTENTION : valeurs non calculees par le serveur, a verifier'
   where status = 'pending'
     -- 360 is the longest plan that exists (12 x 30). A row longer than that
     -- could not have come from createClaim, whatever it claims to be.
     and days > 360
     and position('ATTENTION' in coalesce(note, '')) = 0;
end $$;


-- ===========================================================================
-- 0005 — Account status, entitlement grants, audit trail, notes, contact
--
-- The foundations the admin system needs, and nothing else. Every table here
-- exists because something in the brief cannot be built without it:
--
--   profiles.status       suspending and blocking accounts
--   entitlement_grants    "manually granted Max" as a different thing from
--                         "bought Max" — the brief is explicit that a manual
--                         grant must not fabricate a financial transaction
--   admin_audit_log       what happened on the platform, and who did it
--   admin_notes           private notes on an account
--   contact_messages      the contact form, which currently reaches nobody
--
-- Nothing existing is dropped or renamed. Every column added is nullable or
-- has a default, so the code deploy and this file can land in either order —
-- the mistake that broke this deployment in September.
--
-- Safe to run twice.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Account status
--
-- Four states, and the distinction between the middle two is the point.
-- `suspended` is a pause an administrator applies and expects to lift.
-- `blocked` is a decision. `deactivated` is the person's own choice and must
-- stay reversible, which is why nothing here deletes a row: payment history,
-- audit entries and revenue figures all reference it, and a deleted user
-- turns every one of those into a dangling number.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum
      ('active', 'suspended', 'blocked', 'deactivated');
  end if;
end $$;

alter table public.profiles
  add column if not exists status public.account_status not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles (id)
    on delete set null,
  -- Soft delete. A timestamp rather than a boolean so "when" is answerable,
  -- which is what a restore needs and what an audit asks first.
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_status_idx on public.profiles (status)
  where status <> 'active';

-- Deliberately NOT granted to `authenticated`. A user who could write their
-- own status could unblock themselves, and the whole point of blocked is that
-- it is not up to them. The existing `grant update (email)` is unchanged, so
-- correcting your own address still works.


-- ---------------------------------------------------------------------------
-- 2. Entitlement grants
--
-- Access that was GIVEN rather than bought.
--
-- The brief asks for this in as many words: a manual grant must not create a
-- fake financial transaction, and the system must tell a paid subscription
-- from an admin grant from promotional access. Until now the only way to give
-- somebody Pro was to write a `payments` row marked `succeeded` with provider
-- `manual` — which put a sale in the revenue figures that nobody paid for. A
-- platform that cannot tell its own gifts from its income cannot report either.
--
-- A grant is a row that says: this person has this tier, from this moment,
-- until this moment or for ever, because of this, given by this administrator.
-- Revoking sets `revoked_at` rather than deleting, so the history of what was
-- given and taken away survives — that is most of what an audit wants to know.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'grant_kind') then
    create type public.grant_kind as enum
      ('admin', 'promotional', 'trial', 'compensation', 'staff');
  end if;
end $$;

create table if not exists public.entitlement_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- 'pro' | 'max' | 'unlimited'. Text with a CHECK rather than plan_tier,
  -- because `unlimited` is not a plan and must never be sellable: putting it
  -- in plan_tier would make `tier = 'unlimited'` writable onto a subscription
  -- row, which is the escalation this whole file is trying to avoid.
  tier        text not null check (tier in ('pro', 'max', 'unlimited')),
  kind        public.grant_kind not null default 'admin',
  reason      text,
  starts_at   timestamptz not null default now(),
  -- null means for ever. Checked at read time, never by a cron job that may
  -- not have run — the same rule the subscription expiry already follows.
  expires_at  timestamptz,
  granted_by  uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  revoke_reason text,
  created_at  timestamptz not null default now(),

  -- An expiry before the start is a grant that never applies, which is a typo
  -- rather than an intention.
  constraint entitlement_grants_window check (expires_at is null or expires_at > starts_at)
);

-- The read path asks "what live grants does this user have", on every request
-- that needs an entitlement. This is the index that question uses.
create index if not exists entitlement_grants_live_idx
  on public.entitlement_grants (user_id, revoked_at, expires_at);

alter table public.entitlement_grants enable row level security;

-- A user may SEE what they were given — the account page shows
-- "Unlimited — Lifetime" and that has to come from somewhere. They may not
-- write it: no INSERT, UPDATE or DELETE grant exists, so there is nothing for
-- a policy to permit.
drop policy if exists "entitlement_grants: read own" on public.entitlement_grants;
create policy "entitlement_grants: read own" on public.entitlement_grants
  for select using (auth.uid() = user_id);

grant select on public.entitlement_grants to authenticated;


-- ---------------------------------------------------------------------------
-- 3. The audit trail
--
-- Append-only, enforced by privilege rather than by intention: no role holds
-- UPDATE or DELETE on this table, service_role included. An audit log that the
-- application can edit is a log that proves nothing, and the one thing it has
-- to survive is somebody wanting to tidy it.
--
-- `actor_email` is stored alongside `actor_id` on purpose, denormalised. The
-- address at the time is part of the record: if an account is later deleted,
-- or its address changed, the log must still say who did it rather than
-- showing a null and a uuid.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_email  text,
  actor_role   text not null default 'admin',
  action       text not null,
  target_user  uuid references public.profiles (id) on delete set null,
  target_email text,
  reason       text,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_log_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user, created_at desc);

alter table public.admin_audit_log enable row level security;
-- No policy and no grant for anon or authenticated. The browser cannot read
-- this at all; /admin reads it with the service role.

revoke update, delete on public.admin_audit_log from public;
revoke update, delete on public.admin_audit_log from service_role;


-- ---------------------------------------------------------------------------
-- 4. Private notes on an account
--
-- "Granted unlimited because this user is a tester." Never visible to the
-- person it is about: no policy, no grant, service role only.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  author_email text,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists admin_notes_user_idx on public.admin_notes (user_id, created_at desc);

alter table public.admin_notes enable row level security;


-- ---------------------------------------------------------------------------
-- 5. Contact messages
--
-- The contact form currently opens the visitor's own mail client and sends
-- nothing. These rows are what makes a message survive the visitor closing
-- the tab, and what the admin inbox reads.
--
-- Stored as well as emailed, deliberately. Email delivery fails — a provider
-- outage, a bounce, a spam folder — and a contact form whose only record is an
-- email that did not arrive is a contact form that silently loses customers.
-- The row is the record; the email is the notification.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contact_status') then
    create type public.contact_status as enum ('new', 'read', 'replied', 'closed');
  end if;
end $$;

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  -- Null when the sender was not signed in, which is the common case.
  user_id    uuid references public.profiles (id) on delete set null,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  email      text not null check (char_length(btrim(email)) between 3 and 320),
  subject    text not null check (char_length(btrim(subject)) between 1 and 200),
  message    text not null check (char_length(btrim(message)) between 1 and 5000),
  status     public.contact_status not null default 'new',
  -- A salted hash, never an address. Enough to rate-limit a sender and to see
  -- that forty messages came from one place; not enough to be a record of who
  -- visited from where.
  sender_hash text,
  -- Did the notification email actually go out? A null means it was never
  -- attempted; false means it failed and the message is sitting here unread
  -- by anybody, which is the case worth seeing.
  emailed    boolean,
  email_error text,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_sender_idx
  on public.contact_messages (sender_hash, created_at desc);

alter table public.contact_messages enable row level security;

-- No grant for anon or authenticated, in either direction.
--
-- The form posts to an API route which writes with the service role, rather
-- than the browser inserting directly. That is the lesson of 0004: a direct
-- INSERT grant is a second door, and the route is where the validation, the
-- rate limit and the spam check live. A browser that could write this table
-- could fill it at whatever speed it liked.


-- ---------------------------------------------------------------------------
-- 6. The owner's account is protected from ordinary operations
--
-- The brief asks that the owner never be accidentally downgraded, blocked or
-- deleted by an ordinary admin operation. The application enforces this too,
-- but the application is not the only door — that is the whole lesson of 0004
-- — so the rule is also written here, where no request can get past it.
--
-- Which accounts are owners is NOT stored: it comes from OWNER_EMAILS, a
-- deployment variable, so that no in-app write can change who the owner is.
-- The trigger therefore asks the one question the database can answer on its
-- own — is this row flagged as the platform owner — using a flag only the
-- service role can set.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

create or replace function public.protect_owner_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_owner and (
       new.status <> 'active'
    or new.deleted_at is not null
    or new.is_admin = false
    or new.is_owner = false
  ) then
    raise exception
      'the owner account cannot be blocked, deactivated, deleted or demoted here';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_owner_account() from public;
grant execute on function public.protect_owner_account() to service_role;

drop trigger if exists protect_owner_account on public.profiles;
create trigger protect_owner_account
  before update on public.profiles
  for each row execute function public.protect_owner_account();


-- ---------------------------------------------------------------------------
-- 7. Back-fill
--
-- Existing accounts become 'active', which the column default already did for
-- new rows. Stated explicitly so re-running this file on a database where the
-- column was added by hand still ends up consistent.
-- ---------------------------------------------------------------------------

update public.profiles set status = 'active' where status is null;
