-- What the app actually tried, on whose behalf, and at what price.
--
-- A user could not close an AMD spread and asked what happened. Nothing in this
-- database could answer. `trade_records` holds trades reconstructed from the
-- broker feed AFTER they complete, so an order that never fills leaves no trace
-- at all — and the detailed log the close dialog builds on screen is React
-- state, discarded the moment the dialog closes. The only surviving record of a
-- five-minute attempt was in Alpaca's own order history.
--
-- For a product that places orders on people's behalf, that is a hole. This is
-- the record: one row per order submitted, with the price chosen and the market
-- the app believed it was choosing against.
create table if not exists public.order_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,

  -- Groups every order in one walk, so a ladder reads as a single sequence
  -- rather than unrelated rows. Chosen by the client at the start of a run.
  run_key text,
  intent text not null default 'close',   -- 'close' | 'open'
  step integer,                           -- which reprice within the run

  ticker text,
  legs jsonb not null default '[]'::jsonb,
  qty numeric,
  order_type text,                        -- 'limit' | 'market'
  limit_price numeric,

  -- The quote the price was derived from. Without it a limit price is just a
  -- number: this is what makes "was it ever marketable?" answerable later.
  quote jsonb,

  broker_order_id text,
  status text,
  filled_qty numeric,
  filled_avg_price numeric,
  error text,                             -- the broker's refusal, when there is one

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_attempts_account_idx
  on public.order_attempts (account_id, created_at desc);
create index if not exists order_attempts_run_idx
  on public.order_attempts (run_key, created_at);
create index if not exists order_attempts_broker_order_idx
  on public.order_attempts (broker_order_id);

-- The owner reads their own attempts; support reads across users over the
-- service role, which bypasses RLS. Writes are the edge functions' only.
alter table public.order_attempts enable row level security;
revoke all on public.order_attempts from anon, authenticated;
grant select on public.order_attempts to authenticated;
drop policy if exists "own order attempts readable" on public.order_attempts;
create policy "own order attempts readable" on public.order_attempts
  for select to authenticated using (user_id = auth.uid());
