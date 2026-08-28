-- Operator switches: settings that change what the product allows, set by an
-- administrator rather than by a customer.
--
-- The first one turns manual API-key entry on and off. Connecting a brokerage
-- account through Alpaca's OAuth flow is the supported path; pasting a raw key
-- and secret into a third-party form is not something to put in front of
-- customers. It stays in the codebase because it is genuinely useful for
-- testing against an account the OAuth app cannot reach — so it becomes a
-- switch, defaulted off, and reachable only by an administrator even when on.
--
-- RLS is on with no policies at all: that denies every client role outright
-- and leaves the service role — meaning an edge function that has already
-- passed requireAdmin — as the only way in. A customer's browser cannot read
-- this table, let alone write it, and no policy needs to be right for that to
-- hold.

create table if not exists public.app_settings (
  key text primary key,
  -- jsonb rather than text so a later setting can hold a list or an object
  -- without another migration.
  value jsonb not null,
  updated_at timestamptz not null default now(),
  -- Who flipped it. Nullable so deleting an admin's account does not delete
  -- the setting they changed.
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;

-- Off by default, and seeded rather than left absent so the row exists to be
-- read. Reading code still treats a missing row as false — the default has to
-- be the closed one in both places.
insert into public.app_settings (key, value)
values ('manual_api_keys', 'false'::jsonb)
on conflict (key) do nothing;
