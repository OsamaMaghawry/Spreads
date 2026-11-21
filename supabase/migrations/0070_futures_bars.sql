-- CME futures candles for the terminal's practice replay (21 Nov 2026, the
-- owner: "I need to do some training on Futures ... simulate the futures as
-- is even with the contract sizes and points values. As, I want to take prop
-- firms challenges"). Alpaca carries no futures, so the replay reads
-- Databento's GLBX.MDP3 (functions/terminal "replay" with a "/ES" symbol),
-- continuous front contract by volume. Every finished UTC day read is kept
-- here, so a day is paid for once. Practice only: nothing here is an order
-- or an account.
-- Read and written by the server only (service role).

create table if not exists public.futures_bars (
  -- The contract's root, "ES", "MNQ", "6E" (_shared/futuresSpecs.js).
  root text not null check (root ~ '^[A-Z0-9]{1,4}$'),
  -- Databento's schema: '1m' (ohlcv-1m) or '1h' (ohlcv-1h).
  schema text not null check (schema in ('1m', '1h')),
  -- The UTC day the candles fall in.
  day date not null,
  -- [{ time, open, high, low, close, volume }], oldest first; [] for a day with none (a weekend).
  bars jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (root, schema, day)
);

alter table public.futures_bars enable row level security;
revoke all on table public.futures_bars from anon, authenticated;
create policy connector_no_insert on public.futures_bars as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.futures_bars as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.futures_bars as restrictive for delete to authenticated
  using (not public.is_connector_session());
