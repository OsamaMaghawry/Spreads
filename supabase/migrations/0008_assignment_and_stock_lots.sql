-- Assignment, exercise, and the shares they produce.
--
-- Trade reconstruction had three defects, all confirmed against live records
-- rather than inferred:
--
--   1. `OPASN`/`OPEXC` were never fetched from Alpaca, so an assigned spread
--      produced no record at all — its lots simply stayed open forever.
--   2. Stock fills were discarded, so the shares delivered on assignment and
--      their later disposal never entered the system.
--   3. A short paired to the *first* protective long rather than the nearest,
--      which built spreads that were never traded, orphaned real shorts into
--      "naked" losses, and dropped the leftover long's cost entirely.
--
-- Fixing them needs three things the schema could not express: a close reason
-- for assignment, somewhere to put shares, and a link from those shares back
-- to the option that produced them.

-- 1. Assignment and exercise are distinct outcomes from closing or expiring.
--    Both keep the full premium on the option itself; the economics land on
--    the shares, which is exactly why they need separate rows.
alter table public.trade_records
  drop constraint if exists trade_records_close_reason_check;

alter table public.trade_records
  add constraint trade_records_close_reason_check
  check (close_reason in ('closed', 'expired', 'assigned', 'exercised'));

-- 2. Premium and share P/L stay separate and are linked, never merged. A
--    merged cost basis can be derived from this later; going the other way is
--    impossible, and the separate figures are what make a wheel cycle legible
--    (premium collected, then stock movement, then the combined total).
--
--    Text rather than uuid on purpose: the value is derived deterministically
--    from the option symbol and the assignment date, so re-running a sync
--    produces the same chain id instead of a fresh random one that would
--    orphan the link on every rebuild.
alter table public.trade_records add column if not exists chain_id text;

-- 3. A leg the reconstruction could not pair is evidence of a defect, not
--    something to hide. Previously an unpaired short became a naked position
--    and an unpaired long vanished with its cost unaccounted for; now both are
--    written down and flagged.
alter table public.trade_records add column if not exists unpaired boolean not null default false;

create index if not exists trade_records_chain_id_idx on public.trade_records (chain_id);

-- Shares, as lots. One row per acquisition slice: a 100-share lot sold in two
-- 50-share sales becomes two rows, so every disposal has its own basis.
--
-- `disposed_*` and `realized_pl` are nullable, and that is the whole point:
-- stock still held is unrealized and must never be counted as realized P/L.
-- A row with a null disposal is a position, not a result.
create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  lot_key text not null,
  -- Ties this lot to the option whose assignment or exercise created it.
  chain_id text,
  ticker text not null,
  qty numeric not null,
  -- Null when the shares were acquired before the activity window we can see,
  -- or sold short. Recorded honestly rather than guessed at.
  acquired_date date,
  acquired_price numeric,
  acquired_source text check (acquired_source in ('assignment', 'exercise', 'trade')),
  disposed_date date,
  disposed_price numeric,
  disposed_source text check (disposed_source in ('assignment', 'exercise', 'trade')),
  realized_pl numeric,
  created_at timestamptz not null default now(),
  unique (account_id, lot_key)
);

create index if not exists stock_lots_account_id_idx on public.stock_lots (account_id);
create index if not exists stock_lots_user_id_idx on public.stock_lots (user_id);
create index if not exists stock_lots_chain_id_idx on public.stock_lots (chain_id);

-- Written by the tradeHistory edge function under the service role, which
-- bypasses RLS. These policies govern direct client reads only, and mirror
-- trade_records exactly.
alter table public.stock_lots enable row level security;

create policy "select own stock lots" on public.stock_lots
  for select using (auth.uid() = user_id);
create policy "insert own stock lots" on public.stock_lots
  for insert with check (auth.uid() = user_id);
create policy "update own stock lots" on public.stock_lots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own stock lots" on public.stock_lots
  for delete using (auth.uid() = user_id);

-- A rebuild recomputes history that was produced by the broken logic, so past
-- figures change. Every row is copied here first — the nightly pg_dump is a
-- second net, but it should not be the only one when the destructive step is
-- deliberate.
--
-- `like` copies columns and defaults but no constraints or primary key, which
-- is what a snapshot table wants: it must accept whatever was there, including
-- rows written under the old close_reason check, and accept them repeatedly.
create table if not exists public.trade_records_backup (like public.trade_records including defaults);

alter table public.trade_records_backup add column if not exists backed_up_at timestamptz not null default now();

-- RLS on with zero policies: reachable by the service role only. This is an
-- operator artifact, not something a customer's client should read.
alter table public.trade_records_backup enable row level security;
