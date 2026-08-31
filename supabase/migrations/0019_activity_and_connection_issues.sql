-- Two back-office blind spots, both of which showed the owner something untrue.
--
-- 1. "Last seen" on the admin dashboard read auth.users.last_sign_in_at, which
--    Postgres/GoTrue only stamps on a *fresh authentication*. A user who signed
--    in yesterday, kept the session, and used the product all of today still
--    read "yesterday" — so an active user looked dormant. Sign-in time is a real
--    thing, but it is not "last seen", and nothing recorded actual use.
--
-- 2. When Alpaca refused one of a token's environments, the OAuth callback
--    swallowed it: a refused live account was indistinguishable from "this token
--    has no live account". The user was told the connection succeeded, only the
--    paper account appeared, and nobody — user or owner — could see that Alpaca
--    had said no.

-- ---------------------------------------------------------------------------
-- profiles.last_active_at — actual use, not authentication
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists last_active_at timestamptz;

-- Stamped by the app on authenticated use. A SECURITY DEFINER function rather
-- than an RLS update policy on purpose: `profiles` also carries `role`, and a
-- policy letting a user update their own row is a policy letting them set
-- role = 'admin'. This function can only ever touch one column of one row —
-- the caller's own — so the privilege it lends out is exactly the one needed.
create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_active_at = now() where id = auth.uid();
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;

-- ---------------------------------------------------------------------------
-- broker_connection_issues — what the broker refused, kept rather than dropped
-- ---------------------------------------------------------------------------
--
-- One row per environment the broker would not hand us during a connect. This
-- is deliberately a record of a *refusal*, not of an account: there is no
-- account row to hang it on, which is precisely why it used to vanish.
create table if not exists public.broker_connection_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null default 'alpaca',
  environment text not null,                  -- 'live' | 'paper'
  status integer,                             -- HTTP status; null when unreachable
  detail text,                                -- the broker's own words, truncated
  created_at timestamptz not null default now()
);

create index if not exists broker_connection_issues_user_idx
  on public.broker_connection_issues (user_id, created_at desc);

-- The owner reads their own; the admin panel reads across users over the
-- service role, which bypasses RLS. Writes are the callback's, also service role.
alter table public.broker_connection_issues enable row level security;
revoke all on public.broker_connection_issues from anon, authenticated;
grant select on public.broker_connection_issues to authenticated;
drop policy if exists "own connection issues readable" on public.broker_connection_issues;
create policy "own connection issues readable" on public.broker_connection_issues
  for select to authenticated using (user_id = auth.uid());
