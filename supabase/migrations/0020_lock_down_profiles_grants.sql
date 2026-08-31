-- Take away the privileges on `profiles` that nothing uses.
--
-- The table was created in 0001 and kept PostgREST's default grants: SELECT,
-- INSERT, UPDATE and DELETE to both `anon` and `authenticated`. Today nothing
-- is exploitable, because RLS is on and the only policy is "select own
-- profile" — with no UPDATE policy, no update passes.
--
-- But `profiles` carries `role`, which is what `_shared/admin.ts` reads to
-- decide who is an administrator. The single thing standing between a user and
-- `role = 'admin'` is the continued absence of an UPDATE policy, and "users may
-- edit their own profile" is one of the most natural policies anyone would ever
-- add. That is a trap set for a future change, so the grant goes now rather
-- than the day someone springs it.
--
-- Nothing legitimate loses anything: every read is a SELECT, and the only write
-- (adminData's role change) runs over the service role, which is not subject to
-- these grants. `touch_last_active` from 0019 is SECURITY DEFINER for the same
-- reason — it was written this way so this grant would not be needed.
revoke insert, update, delete, truncate, references on public.profiles from anon, authenticated;

-- Reads stay as they were: RLS still limits them to the caller's own row.
grant select on public.profiles to authenticated;
