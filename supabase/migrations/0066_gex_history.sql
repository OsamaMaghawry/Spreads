-- Gamma exposure on past days, for backtesting (8 Nov 2026, the owner: "let's
-- go with just 1 month of TSLA. I just want to test some things first").
-- One row per symbol and trading day, worked out by functions/terminal
-- ("gexBackfill") from Databento's options record (OPRA): the day's chain in
-- the live Gamma page's shape (so the page's own math reads it), and the
-- figures a backtest compares with what the price did next.
-- Read and written by the server only (service role); no client access.

create table if not exists public.gex_history (
  symbol text not null,
  day date not null,
  -- The stock's price at `at`, a minute before the close.
  spot numeric not null,
  at timestamptz not null,
  -- When OPRA published the open interest used (6:30 New York that morning).
  oi_published timestamptz,
  -- The 30-day window, the Gamma page's default.
  net_gex numeric,
  flip numeric,
  call_wall numeric,
  put_wall numeric,
  -- Every window (nearest, week, month, all) and gamma by expiry.
  summary jsonb not null,
  chain jsonb not null,
  counts jsonb,
  source text not null default 'databento',
  -- What Databento charged for the day.
  usd numeric,
  created_at timestamptz not null default now(),
  primary key (symbol, day)
);

alter table public.gex_history enable row level security;
revoke all on table public.gex_history from anon, authenticated;

-- The Claude connector writes nothing (connectorToken.test.ts checks every table).
create policy connector_no_insert on public.gex_history as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.gex_history as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.gex_history as restrictive for delete to authenticated
  using (not public.is_connector_session());
