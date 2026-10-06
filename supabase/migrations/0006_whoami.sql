-- ===========================================================================
-- 0006 — Make the database say which role a key arrives as
--
-- Written the day the health panel finally produced the real error:
--
--     permission denied for table profiles — key is 41 characters,
--     starts sb_secret_…
--
-- That sentence ended a week of looking in the wrong place. Everyone,
-- including me, had assumed the service-role key was being REJECTED — that it
-- was wrong, stale, or pasted badly. It is not. "permission denied" means the
-- connection succeeded and the credential was accepted: the key is valid, the
-- project is right, the network is fine. What failed is authorisation. The
-- key arrives as a Postgres role that has no privileges on these tables.
--
-- "Invalid API key" and "permission denied" are one word apart in a log and
-- two completely different faults, and the fix for one does nothing for the
-- other. Re-copying the key — which is what everybody does — cannot help,
-- because the key was never the problem.
--
-- So this file adds the one question nobody could ask: who am I connected as?
-- Without it the next person with this symptom repeats the same week.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- whoami() — the role, and whether it can see past row level security.
--
-- Deliberately executable by everybody, including anon.
--
-- That looks careless and is not. The function returns the name of the role
-- the CALLER is already using and two booleans about it. Nobody can call it
-- without a key, and anybody holding a key already knows which key they are
-- holding; the function tells them nothing they could not work out by trying
-- a query and reading the error. What it does do is give a one-word answer
-- instead of an inference, which is the whole point.
--
-- It reads no table, takes no argument, and returns nothing about any person.
-- ---------------------------------------------------------------------------

create or replace function public.whoami()
returns table (
  role_name text,
  is_superuser boolean,
  bypasses_rls boolean
)
language sql
stable
-- NOT security definer. This one must run as the caller — a definer function
-- would report the owner's role every time and answer the wrong question
-- perfectly. That mistake would be invisible, because the output would look
-- entirely plausible.
security invoker
set search_path = ''
as $$
  select
    current_user::text,
    coalesce((select rolsuper from pg_roles where rolname = current_user), false),
    coalesce((select rolbypassrls from pg_roles where rolname = current_user), false);
$$;

grant execute on function public.whoami() to public;


-- ---------------------------------------------------------------------------
-- And make the privileges explicit for the role the server is meant to use.
--
-- Standard Supabase gives `service_role` privileges on everything in `public`
-- through default grants, so these lines are usually redundant. They are here
-- because "usually" is doing too much work in a file that exists to end a
-- week of guessing: if the privileges are present, this changes nothing, and
-- if they are missing, this is the line that would have saved the week.
--
-- Written out table by table rather than as `grant all on all tables`, so
-- that a table added later does not silently inherit a privilege nobody
-- decided to give it.
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'subscriptions', 'payments', 'usage_logs', 'tool_events',
    'page_views', 'admin_settings', 'payment_claims', 'entitlement_grants',
    'admin_audit_log', 'admin_notes', 'contact_messages'
  ]
  loop
    if to_regclass('public.' || target) is not null then
      execute format('grant select, insert, update, delete on public.%I to service_role', target);
    end if;
  end loop;
end $$;

-- The audit log stays append-only even for the server. 0005 revoked UPDATE and
-- DELETE from service_role on purpose, and the loop above just handed them
-- back, so they are taken away again here. A log the application can edit
-- proves nothing, and that rule outranks the convenience above.
do $$
begin
  if to_regclass('public.admin_audit_log') is not null then
    revoke update, delete on public.admin_audit_log from service_role;
    revoke update, delete on public.admin_audit_log from public;
  end if;
end $$;

grant usage on all sequences in schema public to service_role;
