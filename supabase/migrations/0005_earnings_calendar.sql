-- Earnings calendar.
--
-- Alpaca's corporate actions API covers dividends, mergers, spinoffs and splits
-- but not earnings announcements, so scheduled report dates come from a third
-- party (see supabase/functions/_shared/earnings.ts) and are cached here.
--
-- Caching matters for latency, not cost: a scan sweeps tickers in batches of
-- four and already makes several chain requests per batch, so a per-ticker HTTP
-- lookup during the scan would be felt. This table is refreshed on a schedule
-- and read locally.
--
-- The data is public market information, identical for every user, so rows are
-- not scoped to auth.uid() the way the rest of the schema is. Reads are open to
-- any signed-in user; writes happen only through the service role.

create table if not exists public.earnings_calendar (
  symbol      text not null,
  report_date date not null,
  -- "bmo" before market open, "amc" after market close, "dmh" during hours.
  -- Null when the provider has the date but not the session.
  session     text,
  fetched_at  timestamptz not null default now(),
  primary key (symbol, report_date)
);

create index if not exists earnings_calendar_report_date_idx
  on public.earnings_calendar (report_date);

alter table public.earnings_calendar enable row level security;

drop policy if exists "read earnings calendar" on public.earnings_calendar;
create policy "read earnings calendar"
  on public.earnings_calendar
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.earnings_calendar from authenticated, anon;
