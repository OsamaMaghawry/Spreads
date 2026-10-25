-- The staging trading terminal's per-person settings: the watchlist, each
-- symbol's chart drawings, indicators, which chart events show, and hotkeys.
--
-- The owner, 25 Oct 2026: "The watchlist doesn't get saved after adding a new
-- stock - I have to add it everytime ... The chart drawings don't get saved
-- when existing and come back. I need to keep the drawing of each ticker."
-- Both lived only in the browser, so a second device, a private window or a
-- cleared browser started over. Here they belong to the person.
--
-- One row per setting, and one per symbol's drawings, so saving one never
-- rewrites another. Only functions/terminal (service role, behind the
-- terminal_lab switch) reads or writes it; no policies are granted to users.
-- Applied to staging only; dropping the table removes the feature's data.

create table if not exists public.terminal_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z]+(:[A-Z0-9./]{1,24})?$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.terminal_prefs enable row level security;

-- No user policy grants a write, but the table still carries the connector
-- guards (connectorToken.test.ts), so a future write policy cannot quietly
-- open it to a Claude connector token.
create policy connector_no_insert on public.terminal_prefs as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_prefs as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_prefs as restrictive for delete to authenticated
  using (not public.is_connector_session());
