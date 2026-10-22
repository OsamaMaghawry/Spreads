-- The public /expected-move pages: one row per stock, refreshed all day.
--
-- The owner, 22 Oct 2026: one page per stock answering the question people
-- search, "make sure it's updated ... no one needs an outdated piece of news".
-- functions/tickerPages writes each row from the live option chain; the
-- landing Worker reads it with the anon key and renders it. Nothing here is
-- about a user: the table is public by design, and only the service role can
-- write it.

create table if not exists public.ticker_pages (
  ticker text primary key,
  name text not null,
  spot numeric,
  spot_as_of timestamptz,
  -- expectedMove.ts expiryRow: { expiry, days, straddle, move, movePct, low,
  -- high, iv, strikes, wide } or { expiry, days, error }.
  week jsonb,
  month jsonb,
  earnings_date date,
  earnings_session text,
  -- Why the last refresh could not price this stock, in words; null when it did.
  error text,
  -- Refreshed while the market was open. The first run after the close
  -- refreshes each live row once more at closing prices and clears this, so a
  -- page never shows a mid-afternoon number all evening.
  live boolean not null default false,
  refreshed_at timestamptz not null default now()
);

alter table public.ticker_pages enable row level security;

drop policy if exists ticker_pages_public_read on public.ticker_pages;
create policy ticker_pages_public_read on public.ticker_pages
  for select to anon, authenticated using (true);

grant select on public.ticker_pages to anon, authenticated;

-- No signed-in user writes here at all, but every RLS table carries the
-- connector guards (connectorToken.test.ts), so a future write policy cannot
-- quietly open it to a Claude connector token.
create policy connector_no_insert on public.ticker_pages as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.ticker_pages as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.ticker_pages as restrictive for delete to authenticated
  using (not public.is_connector_session());

create or replace function public.trigger_ticker_pages()
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
    raise notice 'ticker_pages: Vault secrets project_url/service_role_key not set; skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/tickerPages',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('ticket', public.mint_cron_ticket('ticker_pages')),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.trigger_ticker_pages() from public, anon, authenticated;

-- Every five minutes across the hours that contain the session in both
-- daylight-saving states, and the hour after the close. The function asks the
-- broker's clock whether the market is open: open, it refreshes the stalest
-- rows; closed, it gives each row refreshed during the session one last
-- reading at the close, then does nothing until the next open.
select cron.schedule('ticker-pages', '*/5 13-22 * * 1-5', $$select public.trigger_ticker_pages();$$)
where not exists (select 1 from cron.job where jobname = 'ticker-pages');
