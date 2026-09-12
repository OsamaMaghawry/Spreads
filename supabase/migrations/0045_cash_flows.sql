-- Deposits and withdrawals, which this product has never been able to see.
--
-- The owner, on his live account: *"the analysis or the P/L doesn't take into
-- account the deposits and withdrawals. It says the pl 500 while it should be
-- more but because I deposited 700 last week. It got reduced!!"*
--
-- Every return percentage divided the account's result by the broker's CURRENT
-- equity, which contains every deposit ever made. A $700 deposit into a
-- roughly $500 account more than doubled the denominator, for money that had
-- been there five days and had never been in a position -- so Return on
-- equity, Annualized, CAGR and both day-return figures read about half what
-- they should.
--
-- The root cause was not the arithmetic. `fetchBrokerData` asked Alpaca for
-- FILL, OPEXP, OPASN and OPEXC. A transfer is none of those, so a deposit was
-- not mishandled: it was invisible. This table is where it becomes visible.
--
-- Signed amounts: deposits positive, withdrawals negative, taken from the
-- broker's own `net_amount` rather than inferred from the activity type -- a
-- cash journal goes either way depending on which side of it this account is.
create table if not exists public.cash_flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The broker's own activity id, so a re-sync updates rather than duplicates.
  -- A doubled deposit halves a return, which is the defect this table exists
  -- to fix, arriving through the table itself.
  activity_id text not null,
  day date not null,
  amount numeric not null,
  kind text not null,

  captured_at timestamptz not null default now(),
  unique (account_id, activity_id)
);

comment on table public.cash_flows is
  'The trader''s own money entering and leaving an account. Used as the denominator '
  'for every return figure: a result is divided by the capital that earned it, '
  'weighted for when each dollar arrived, not by the closing balance.';

create index if not exists cash_flows_account_day_idx
  on public.cash_flows (account_id, day);

-- Same posture as trade_records: a user reads their own, nobody writes from
-- the browser. These are bank movements, and the only writer is the sync.
alter table public.cash_flows enable row level security;

drop policy if exists "read own cash flows" on public.cash_flows;
create policy "read own cash flows" on public.cash_flows
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.cash_flows from anon, authenticated;
