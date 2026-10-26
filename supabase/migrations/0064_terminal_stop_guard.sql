-- Stops outside regular hours, for the staging trading terminal.
--
-- The owner, 26 Oct 2026, 490 RENT held with a stop and a take profit before
-- the open: "The stop loss price was hit but never executed." Alpaca triggers
-- stop orders from 9:30 to 16:00 New York only. Asked how to cover the rest,
-- the owner chose both watchers (the open terminal's relay, and a job every
-- minute while it is closed), and a sell limit at the stop price.
--
-- terminal_stop_fires: one row per stop the terminal fired itself. Its key is
-- the broker's order id, so the two watchers cannot both fire one stop: the
-- first insert wins. It is also the record of what was done and why, and of
-- the stop to put back if the limit has not filled by the open.
--
-- terminal_guard_seen: when an open terminal last watched an account's stops;
-- the minute job leaves those accounts to it.
--
-- Only functions/terminal and functions/marketStream (service role) read or
-- write them; no policies are granted to users. Applied to staging only;
-- dropping the two tables and the job removes the feature's data.

create table if not exists public.terminal_stop_fires (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  qty numeric,
  stop_price numeric not null,
  limit_price numeric,
  target_price numeric,
  trigger_price numeric not null,
  via text not null check (via in ('relay', 'server')),
  -- firing, then: sent (the limit is out), gone (nothing to do), failed;
  -- and for a sent one: done (filled), returned (unfilled at the open or the
  -- end of its day, the stop put back), cancelled (the limit cancelled by hand).
  status text not null check (status in ('firing', 'sent', 'gone', 'failed', 'done', 'returned', 'cancelled')),
  exit_order_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists terminal_stop_fires_user_recent on public.terminal_stop_fires (user_id, created_at desc);

create table if not exists public.terminal_guard_seen (
  account_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.terminal_stop_fires enable row level security;
alter table public.terminal_guard_seen enable row level security;

-- No user policy grants a write, but the tables still carry the connector
-- guards (connectorToken.test.ts), so a future write policy cannot quietly
-- open them to a Claude connector token.
create policy connector_no_insert on public.terminal_stop_fires as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_stop_fires as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_stop_fires as restrictive for delete to authenticated
  using (not public.is_connector_session());
create policy connector_no_insert on public.terminal_guard_seen as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_guard_seen as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_guard_seen as restrictive for delete to authenticated
  using (not public.is_connector_session());

-- The minute job. It runs every minute; the function itself decides whether
-- it is pre-market or after hours, and returns at once otherwise.
create or replace function public.trigger_terminal_stop_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'terminal_stop_guard: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/terminal?forceFunctionRegion=us-east-1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('action', 'guardStops', 'ticket', public.mint_cron_ticket('terminal_stop_guard')),
    timeout_milliseconds := 70000
  );
end;
$$;

revoke all on function public.trigger_terminal_stop_guard() from public, anon, authenticated;

select cron.schedule('terminal-stop-guard', '* * * * *', $$select public.trigger_terminal_stop_guard();$$)
where not exists (select 1 from cron.job where jobname = 'terminal-stop-guard');
