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
