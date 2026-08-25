-- Saved scan parameters.
--
-- Two tables rather than one, because they answer different questions:
--   scan_presets   — named sets the trader deliberately saved and re-picks.
--   scan_last_used — the single most recent set per scanner, written on every
--                    scan so parameters survive a reload without the trader
--                    having to remember to save anything.
--
-- `scope` separates the two scanners: the market screener sweeps a universe
-- (top50 / sp500 / custom list) while the open-position dialog takes an
-- explicit ticker list, so their configs are not interchangeable and a preset
-- saved in one should not appear in the other.
--
-- `config` is jsonb rather than a column per parameter: the filter set changes
-- as strategies are added, and a schema migration per new filter would be a
-- lot of ceremony for what is a per-user UI preference with no server-side
-- reads. Nothing in an edge function queries inside it — the client sends the
-- values explicitly on every scan, exactly as before.

create table public.scan_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scope text not null check (scope in ('screener', 'open')),
  name text not null,
  strategy text not null check (strategy in ('put_spread', 'call_spread', 'iron_condor')),
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Re-saving under an existing name overwrites that preset rather than
  -- creating a second one the trader can't tell apart.
  unique (user_id, scope, name)
);

create table public.scan_last_used (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scope text not null check (scope in ('screener', 'open')),
  strategy text not null check (strategy in ('put_spread', 'call_spread', 'iron_condor')),
  config jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

create index scan_presets_user_scope_idx on public.scan_presets (user_id, scope);

alter table public.scan_presets enable row level security;
alter table public.scan_last_used enable row level security;

create policy "select own scan presets" on public.scan_presets
  for select using (auth.uid() = user_id);
create policy "insert own scan presets" on public.scan_presets
  for insert with check (auth.uid() = user_id);
create policy "update own scan presets" on public.scan_presets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own scan presets" on public.scan_presets
  for delete using (auth.uid() = user_id);

create policy "select own last used scan" on public.scan_last_used
  for select using (auth.uid() = user_id);
create policy "insert own last used scan" on public.scan_last_used
  for insert with check (auth.uid() = user_id);
create policy "update own last used scan" on public.scan_last_used
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own last used scan" on public.scan_last_used
  for delete using (auth.uid() = user_id);
