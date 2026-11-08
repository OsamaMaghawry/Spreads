-- Gamma exposure for the screener (8 Nov 2026, the owner, approving the
-- design: "let's try this combination and see"). Each weekday from 7:00 New
-- York, after the 6:30 open interest, functions/terminal "gexScreenJob" lists
-- the 300 optionable shares and funds that traded the most dollars in the last
-- full session, then works out gamma for a few of them a minute (Alpaca's free
-- data plan allows about 200 requests a minute). The screener reads the day's
-- figures (terminal "gexScreen") and follows the price with them.
-- Read and written by the server only (service role).

create table if not exists public.gex_daily (
  symbol text not null,
  day date not null,
  -- 1 for the most dollars traded the session before.
  rank integer not null,
  dollar_vol numeric,
  -- queued, working, done or error.
  status text not null default 'queued',
  claimed_at timestamptz,
  at timestamptz,
  -- _shared/gexScreen.js screenSummary: net gamma, flip, walls and the profile.
  summary jsonb,
  error text,
  primary key (symbol, day)
);
create index if not exists gex_daily_day_status on public.gex_daily (day, status, rank);

alter table public.gex_daily enable row level security;
revoke all on table public.gex_daily from anon, authenticated;
create policy connector_no_insert on public.gex_daily as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.gex_daily as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.gex_daily as restrictive for delete to authenticated
  using (not public.is_connector_session());

-- The next shares to work out, taken so two runs never take the same one: the
-- queued, and any left working over four minutes (a run that stopped).
create or replace function public.gex_daily_claim(p_day date, p_n integer)
returns setof text
language sql
set search_path = public
as $$
  update public.gex_daily d set status = 'working', claimed_at = now()
  where (d.symbol, d.day) in (
    select symbol, day from public.gex_daily
    where day = p_day and (status = 'queued' or (status = 'working' and claimed_at < now() - interval '4 minutes'))
    order by rank
    limit p_n
    for update skip locked
  )
  returning d.symbol
$$;
revoke all on function public.gex_daily_claim(date, integer) from public, anon, authenticated;
grant execute on function public.gex_daily_claim(date, integer) to service_role;

-- Each share's latest figures (a new morning's run fills in over the hour;
-- until then the day before's stand), for the screener.
create or replace function public.gex_daily_latest()
returns table (symbol text, day date, at timestamptz, summary jsonb)
language sql
stable
set search_path = public
as $$
  select distinct on (symbol) symbol, day, at, summary
  from public.gex_daily
  where status = 'done' and day >= ((now() at time zone 'America/New_York')::date - 5)
  order by symbol, day desc
$$;
revoke all on function public.gex_daily_latest() from public, anon, authenticated;
grant execute on function public.gex_daily_latest() to service_role;

-- The minute job, 11:00 to 14:59 UTC on weekdays. From 7:00 New York (after
-- the 6:30 open interest): one run lists the day's shares; after that, one
-- run for each share left, up to six a minute, each working out one share
-- (a share's chain is most of a request's two seconds of processor time).
create or replace function public.trigger_gex_screen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_time time := (now() at time zone 'America/New_York')::time;
  v_runs integer;
begin
  if extract(isodow from v_day) > 5 or v_time < time '07:00' then
    return;
  end if;
  if not exists (select 1 from public.gex_daily where day = v_day) then
    v_runs := 1;
  else
    select least(6, count(*)) into v_runs from public.gex_daily
    where day = v_day and (status = 'queued' or (status = 'working' and claimed_at < now() - interval '4 minutes'));
  end if;
  if v_runs = 0 then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'gex_screen: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  for i in 1..v_runs loop
    perform net.http_post(
      url := v_url || '/functions/v1/terminal',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('action', 'gexScreenJob', 'ticket', public.mint_cron_ticket('gex_screen')),
      timeout_milliseconds := 120000
    );
  end loop;
end;
$$;
revoke all on function public.trigger_gex_screen() from public, anon, authenticated;

select cron.schedule('gex-screen', '* 11-14 * * 1-5', $$select public.trigger_gex_screen();$$)
where not exists (select 1 from cron.job where jobname = 'gex-screen');
