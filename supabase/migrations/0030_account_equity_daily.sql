-- Every day's portfolio value, stored.
--
-- The owner, 10 Sep, on the Analysis chart: *"in order to do a good equity
-- chart or a performance chart, you need to get every day's portfolio value
-- from our database — should be stored. The one I have right now is just an
-- adjustment from yesterday to today, it became like a pole, and this doesn't
-- work like this. Equity chart means equity chart."*
--
-- He is right, and the reason the chart was a pole is this table's absence.
-- Nothing in this product had ever recorded what an account was worth on a
-- given day. `trade_records` says what a closed position made; `stock_lots`
-- says what a lot cost and, once sold, what it made; neither says anything
-- about any day in between. So the chart could only accumulate closed trades
-- in the order they closed — a per-trade line drawn on a date axis, with one
-- dashed step bolted on the end for the shares still held. That step was the
-- pole.
--
-- The owner again, on what the fix has to be: *"we should recalculate that
-- portfolio since the beginning and get all the stocks that were in there,
-- plus the premium and everything… you need to get every day's portfolio value
-- plus any income and get a value. And the other day, same thing."*
--
-- So each row carries TWO answers to "what was this account worth that day",
-- from two independent sources, and never mixes them:
--
--   `equity`        the broker's own end-of-day account value. GET
--                   /v2/account/portfolio/history with timeframe=1D returns it
--                   back to inception, net of every fill, assignment, dividend
--                   and fee. This is the account-value line — the $140,000 to
--                   $151,000 path — and no reconstruction of ours can beat it.
--
--   `performance`   what the option strategy itself did, recalculated day by
--                   day: option legs closed by that day, plus the result of
--                   share lots already sold, plus the mark on lots still held
--                   at THAT DAY'S closing price. Unlike equity it is blind to
--                   deposits and withdrawals, which is exactly what makes it a
--                   performance line rather than a bank balance.
--
-- The mark on held lots is the piece that never existed before. Daily closes
-- come from GET /v2/stocks/bars — one request covers every ticker over the
-- whole span — so there is a real price for every held lot on every day, and
-- the chart no longer has to jump from nothing to everything at the right edge.
--
-- Two reasons the series is stored rather than recomputed on each page load:
--
--   1. The broker's window is finite and its history is not ours. Alpaca
--      serves a bounded lookback and an account can be disconnected,
--      re-keyed, or closed. Once a day is written here it survives all three.
--   2. A chart that refetches is a chart that can change under the reader
--      between two loads with nothing to explain why. What was shown
--      yesterday is still on file.
create table if not exists public.account_equity_daily (
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The session date the value closed on, in US market terms — the broker's
  -- own bucket, not a timezone we picked.
  day date not null,
  -- --- the broker's answer -------------------------------------------------
  -- End-of-day total account value: cash plus the market value of everything
  -- held. The broker's figure, stored as given. Null on a day the broker's
  -- series has a gap — never a zero, which would draw the account emptying.
  equity numeric,
  -- The broker's own profit/loss for that day and the base it measured from,
  -- kept so a reader can reconcile our line against the broker's screen
  -- without us recomputing a difference and calling it theirs.
  profit_loss numeric,
  base_value numeric,

  -- --- our recalculation, from the trades and lots up ------------------------
  -- Option legs closed on or before this day: credits taken and debits paid,
  -- SIGNED. This is the Premium only line.
  premium_cum numeric,
  -- The result of every share lot already sold by this day.
  shares_booked numeric,
  -- The mark on lots still HELD on this day, at that day's closing price:
  -- market value less cost. Null when any held lot could not be valued.
  shares_open numeric,
  shares_cost numeric,
  shares_value numeric,
  -- premium_cum + shares_booked + shares_open. The Whole view line. Null,
  -- never zero, on a day any part of the book could not be valued: zero is a
  -- statement about a portfolio and "not priced" is not that statement.
  performance numeric,
  -- Tickers whose contribution to this day could not be established, so the
  -- screen can say WHICH position rather than showing an unexplained gap.
  unpriced text[],

  -- Where the row came from. The column exists so a reconstructed value can
  -- never be mistaken for one the broker reported.
  source text not null default 'broker',
  captured_at timestamptz not null default now(),
  primary key (account_id, day)
);

comment on table public.account_equity_daily is
  'One row per session day per account: the broker''s end-of-day account value, and the option strategy''s cumulative result recalculated from the trades and lots. The Analysis chart is drawn from this and nothing else.';
comment on column public.account_equity_daily.equity is
  'Total account value at the close of that session, as the broker reported it. Never derived from trade records.';
comment on column public.account_equity_daily.performance is
  'Cumulative strategy result on that day: option legs closed by then, plus lots already sold, plus the mark on lots still held at that day''s close. Blind to deposits and withdrawals by design.';

create index if not exists account_equity_daily_account_day_idx
  on public.account_equity_daily (account_id, day);

-- The owner reads their own account's history; the app draws it. Writes belong
-- to the sync function over the service role, which bypasses RLS — the same
-- shape as `alerts`. A user must not be able to edit what their account was
-- worth on a past day.
alter table public.account_equity_daily enable row level security;
revoke all on public.account_equity_daily from anon, authenticated;
grant select on public.account_equity_daily to authenticated;
drop policy if exists "own equity history readable" on public.account_equity_daily;
create policy "own equity history readable" on public.account_equity_daily
  for select to authenticated using (user_id = auth.uid());

-- When this account's equity history was last pulled, so a page load can serve
-- what is stored and refresh only when it is stale — the same self-syncing
-- shape trade history already uses, rather than a button for the reader to
-- press or a broker call on every render.
alter table public.trading_accounts
  add column if not exists equity_synced_at timestamptz;

grant select (equity_synced_at) on public.trading_accounts to authenticated;
