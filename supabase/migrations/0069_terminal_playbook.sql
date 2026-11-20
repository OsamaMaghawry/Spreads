-- The staging trading terminal's Playbook (20 Nov 2026, the owner: "I need to
-- implement the Playbook too", then "Yes start phase 1, load the four example
-- plays"; the design is the DeltaMint Playbook prototype of 16 Nov).
--
-- Three tables, all the person's own:
--   terminal_plays          their plays: the rules they trade by, a checklist
--                           ticked on each trade in review, archived not deleted;
--   terminal_order_marks    what an order sent from the terminal was for: the
--                           play active when it went (an entry), or a stop on a
--                           position (for the trade's initial stop). A trade's
--                           play is its opening fill's order's play, matched by
--                           Alpaca's order id, so it holds on every account and
--                           device without relying on Alpaca keeping our ids;
--   terminal_trade_reviews  the person's review of one round trip: its play if
--                           changed by hand, the stop typed in, whether the plan
--                           was followed, mistakes, the checklist ticked, notes.
--
-- Only functions/terminal (service role, behind the terminal_lab switch and
-- the admin check) reads or writes them; no policy grants a user anything.
-- Applied to staging only; dropping the tables removes the feature's data.

create table if not exists public.terminal_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{1,6}$'),
  name text not null check (char_length(name) between 1 and 80),
  side text not null check (side in ('Long', 'Short', 'Both')),
  timeframe text not null check (char_length(timeframe) between 1 and 20),
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  entry text not null default '' check (char_length(entry) <= 1000),
  stop text not null default '' check (char_length(stop) <= 1000),
  exit text not null default '' check (char_length(exit) <= 1000),
  risk text not null default '' check (char_length(risk) <= 300),
  invalid text not null default '' check (char_length(invalid) <= 300),
  notes text not null default '' check (char_length(notes) <= 4000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.terminal_order_marks (
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  order_id text not null check (char_length(order_id) between 1 and 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 24),
  kind text not null check (kind in ('entry', 'stop')),
  play_id uuid references public.terminal_plays(id) on delete set null,
  stop numeric check (stop is null or stop > 0),
  at timestamptz not null default now(),
  primary key (account_id, order_id)
);
create index if not exists terminal_order_marks_stops on public.terminal_order_marks (account_id, symbol, at) where kind = 'stop';

create table if not exists public.terminal_trade_reviews (
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  -- The symbol and the second the trade opened (and its place among trades
  -- opened in that same second, after the first).
  trip_key text not null check (trip_key ~ '^[A-Z0-9./]{1,24}\|[0-9]{9,11}(\|[1-9])?$'),
  opened_at timestamptz not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  play_id uuid references public.terminal_plays(id) on delete set null,
  play_none boolean not null default false,
  stop numeric check (stop is null or stop > 0),
  followed text check (followed is null or followed in ('yes', 'partly', 'no')),
  mistakes jsonb not null default '[]'::jsonb check (jsonb_typeof(mistakes) = 'array'),
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  -- The play the checklist was answered for: only then is an unticked item a "no".
  checks_play uuid references public.terminal_plays(id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (account_id, trip_key)
);
create index if not exists terminal_trade_reviews_opened on public.terminal_trade_reviews (account_id, opened_at);

alter table public.terminal_plays enable row level security;
alter table public.terminal_order_marks enable row level security;
alter table public.terminal_trade_reviews enable row level security;
revoke all on public.terminal_plays from anon, authenticated;
revoke all on public.terminal_order_marks from anon, authenticated;
revoke all on public.terminal_trade_reviews from anon, authenticated;

-- No user policy grants a write, but the tables still carry the connector
-- guards (connectorToken.test.ts), so a future write policy cannot quietly
-- open them to a Claude connector token.
create policy connector_no_insert on public.terminal_plays as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_plays as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_plays as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.terminal_order_marks as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_order_marks as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_order_marks as restrictive for delete to authenticated
  using (not public.is_connector_session());

create policy connector_no_insert on public.terminal_trade_reviews as restrictive for insert to authenticated
  with check (not public.is_connector_session());
create policy connector_no_update on public.terminal_trade_reviews as restrictive for update to authenticated
  using (not public.is_connector_session()) with check (not public.is_connector_session());
create policy connector_no_delete on public.terminal_trade_reviews as restrictive for delete to authenticated
  using (not public.is_connector_session());
