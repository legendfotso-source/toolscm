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
