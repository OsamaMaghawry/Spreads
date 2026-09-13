-- An unsubscribe link that actually unsubscribes.
--
-- `0036_weekly_digest.sql` added `profiles.weekly_digest_opt_out` and the
-- digest has honoured it since: a user with the flag set is skipped in every
-- mode. What never shipped was any way for a person to SET it. The email's
-- footer links to `/settings?email=off`, a route that did not exist, and
-- `profiles` carried a single policy -- "select own profile" -- so nothing in
-- the browser could have written the column even if a page had asked.
--
-- That was survivable while `weekly_digest_delivery` was "owner" and the only
-- recipient was the person who could change the setting by hand. The moment
-- it becomes "users" it is bulk email to real people with a dead opt-out,
-- which is a legal problem before it is a product one.
--
-- WHY AN RPC AND NOT AN UPDATE POLICY. `profiles` holds `role`. An
-- `update using (auth.uid() = id)` policy would let any signed-in user set
-- their own row's `role` to 'admin' -- RLS gates WHICH ROWS, not which
-- COLUMNS, so "let them turn off an email" would have granted the admin panel
-- to everybody. A security-definer function that writes exactly one boolean on
-- exactly the caller's row is the narrow version of the same grant, and it is
-- the difference between an unsubscribe link and a privilege escalation.
--
-- Revoked from `anon`: turning this off is an account setting, so it requires
-- a session. The link in the email lands on a page behind the login, which is
-- the same door every other account setting is behind.
create or replace function public.set_weekly_digest_opt_out(p_opt_out boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  update public.profiles
     set weekly_digest_opt_out = coalesce(p_opt_out, false)
   where id = v_uid;
  return coalesce(p_opt_out, false);
end;
$$;

revoke all on function public.set_weekly_digest_opt_out(boolean) from public, anon;
grant execute on function public.set_weekly_digest_opt_out(boolean) to authenticated;
