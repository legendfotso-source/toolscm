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
