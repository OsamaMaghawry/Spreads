-- The money-safety watch: where alerts live, and the schedule that raises them.
--
-- A person cannot watch their own positions every fifteen minutes, and an agent
-- session is ephemeral. So a scheduled server-side check reads the broker's
-- positions on a cadence, applies head-of-trading's rules, and records anything
-- that is off. The record is the durable part; email is a delivery of it.

-- ---------------------------------------------------------------------------
-- alerts — one row per condition raised
-- ---------------------------------------------------------------------------
--
-- The dedupe_key carries account, rule, position and trading-day, so a standing
-- condition (a short leg through its strike all afternoon) is one row that gets
-- raised once, not one every fifteen minutes. The watch upserts on it and only
-- emails when the row is new or its severity climbed.
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  rule text not null,                       -- 'short_through_strike', 'position_oversized', ...
  severity text not null default 'warning', -- 'info' | 'warning' | 'critical'
  symbol text,                              -- the option or underlying it concerns
  title text not null,                      -- one line, human, e.g. "AMD 150P is $2 through its strike"
  detail jsonb not null default '{}'::jsonb,-- the numbers behind the title
  dedupe_key text not null,                 -- account · rule · position · trading-day
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  emailed_at timestamptz,                   -- null until delivered; set when the email goes
  resolved_at timestamptz,                  -- set when a later run no longer sees it
  created_at timestamptz not null default now()
);

create unique index if not exists alerts_dedupe_idx on public.alerts (dedupe_key);
create index if not exists alerts_account_open_idx
  on public.alerts (account_id, last_seen_at desc) where resolved_at is null;

-- The owner reads their own alerts; the app shows them. Writes are the
-- function's, over the service role, which bypasses RLS.
alter table public.alerts enable row level security;
revoke all on public.alerts from anon, authenticated;
grant select on public.alerts to authenticated;
drop policy if exists "own alerts readable" on public.alerts;
create policy "own alerts readable" on public.alerts
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- watch_settings — one row, the knobs
-- ---------------------------------------------------------------------------
--
-- Recipient and thresholds live in data, not code, so head-of-trading can tune
-- the rules without a deploy. Single row, id = true.
create table if not exists public.watch_settings (
  id boolean primary key default true,
  recipient_email text not null default 'osamamaghawry@gmail.com',
  -- thresholds, all overridable; the function reads these, never a literal
  strike_proximity_pct numeric not null default 0.01,   -- "near" its strike within 1%
  position_max_pct numeric not null default 0.25,       -- a single position past 25% of equity
  earnings_within_days integer not null default 3,      -- earnings this close before expiry
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint watch_settings_singleton check (id)
);

alter table public.watch_settings enable row level security;
revoke all on public.watch_settings from anon, authenticated;

insert into public.watch_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
--
-- pg_cron runs the jobs; pg_net makes the async HTTP call to the edge function.
-- The service-role key and the project URL come from Vault, so no secret is
-- written into a job definition.
--
-- Windows are UTC and deliberately wide enough to cover the US session in both
-- EST and EDT (13:30 or 14:30 ET open, 20:00 or 21:00 ET-equivalent close), so
-- daylight saving never needs a migration. The function is idempotent — it
-- dedupes — so the hourly job overlapping the 15-minute one during the session
-- costs nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: fire the function in a given mode. Reads url + key from Vault secrets
-- 'project_url' and 'service_role_key', which are set once per project (below,
-- as a no-op if already present — the actual values are inserted out of band so
-- they are never committed).
create or replace function public.trigger_position_watch(p_mode text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'position_watch: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/positionWatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', p_mode)
  );
end;
$$;

-- Every 15 minutes through the weekday session (wide UTC window for both DST states).
select cron.schedule('position-watch-session', '*/15 13-21 * * 1-5',
  $$ select public.trigger_position_watch('watch'); $$);

-- Hourly the rest of the time — quieter, but still watching overnight and weekends.
select cron.schedule('position-watch-hourly', '0 * * * *',
  $$ select public.trigger_position_watch('watch'); $$);

-- One daily report after the close, every weekday, whether or not anything fired.
select cron.schedule('position-watch-daily', '15 21 * * 1-5',
  $$ select public.trigger_position_watch('daily'); $$);
