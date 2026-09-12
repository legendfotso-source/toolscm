-- ===========================================================================
-- Tools.cm — close the security definer bypass
--
-- WHY THIS EXISTS
--
-- 0001 ended with:
--
--   revoke execute on function public.consume_operation(...) from anon, authenticated;
--
-- That looked like it locked the functions down. It did not, and live probing
-- with nothing but the public publishable key proved it: every one of them
-- answered 200 to an anonymous browser.
--
-- The reason is a PostgreSQL default that is easy to miss. When a function is
-- created, EXECUTE on it is granted to the PUBLIC pseudo-role automatically.
-- `anon` and `authenticated` are members of PUBLIC like every other role, so
-- revoking from them by name removes a privilege they were never granted
-- directly, and leaves the inherited one untouched.
--
-- Why it mattered. These functions are `security definer`: they run with the
-- owner's rights and therefore ignore both the table grants and row level
-- security. usage_logs is unreachable from the browser — but consume_operation
-- writes it, so any visitor could have called the function directly to burn
-- another device's daily allowance, or simply pass p_limit = -1 and be told
-- "allowed" forever. The lock was on the door; the window was open.
--
-- The fix is to revoke from PUBLIC, which is where the privilege actually
-- lives, and then grant EXECUTE back to exactly one role: service_role, which
-- only ever holds the secret key on the server.
-- ===========================================================================

-- Everything in the schema, including anything added later by mistake.
revoke execute on all functions in schema public from public, anon, authenticated;

-- And for functions created from now on, so a future migration cannot quietly
-- reintroduce the same hole.
alter default privileges in schema public
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Grant back, one role, by name.
-- ---------------------------------------------------------------------------
grant execute on function
  public.consume_operation(public.usage_subject, text, text, integer)
  to service_role;

grant execute on function
  public.peek_usage(public.usage_subject, text)
  to service_role;

grant execute on function public.expire_subscriptions()            to service_role;
grant execute on function public.has_active_subscription(uuid)     to service_role;

-- handle_new_user runs from a trigger on auth.users. PostgreSQL checks EXECUTE
-- when the trigger is created rather than when it fires, so this grant is
-- belt-and-braces — but signup breaking is not a failure worth risking to save
-- one line.
grant execute on function public.handle_new_user()
  to service_role, supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Remove the rows the probe wrote while demonstrating the hole.
-- ---------------------------------------------------------------------------
delete from public.usage_logs where subject = 'probe';
