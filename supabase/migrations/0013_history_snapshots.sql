-- A snapshot that cannot drift away from the thing it protects.
--
-- `trade_records_backup` was created in 0008 with `like public.trade_records`,
-- which copied the column list *at that moment*. Migration 0011 then added
-- premium_pl, early_close_pl and stock_pl to trade_records and not to the
-- backup, so every insert into it failed:
--
--   ERROR 42703: column "premium_pl" of relation "trade_records_backup"
--                does not exist
--
-- The table holds zero rows on both databases. The snapshot taken before
-- history is deleted -- the feature's only reversibility guarantee -- had
-- never once succeeded, and because the failure was swallowed downstream the
-- sync reported success while doing nothing.
--
-- Storing the rows as jsonb removes the failure mode rather than patching this
-- instance of it: a snapshot of whatever the row was cannot go out of date
-- when a column is added. Restoring is a read of the payload, which is the
-- rare operation; not breaking is the common one.
create table if not exists public.history_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  taken_at timestamptz not null default now(),
  -- What the sync was about to do, so a restore knows what it is looking at.
  reason text not null,
  -- Rows as they stood immediately before the write. Deletions and updates
  -- both: an in-place update destroys the old figures just as completely as a
  -- delete does, and 0008's backup covered only deletes.
  deleted_trades jsonb not null default '[]'::jsonb,
  updated_trades_before jsonb not null default '[]'::jsonb,
  deleted_lots jsonb not null default '[]'::jsonb
);

create index if not exists history_snapshots_account_taken_idx
  on public.history_snapshots (account_id, taken_at desc);

-- Service-role only, like trade_records_backup: RLS on with zero policies. A
-- snapshot is an operator's tool, and it holds the figures a user has already
-- been shown -- there is nothing here the browser needs to read.
alter table public.history_snapshots enable row level security;
revoke all on public.history_snapshots from anon, authenticated;

-- Why the last sync did not finish, and when it last tried.
--
-- `trades_synced_at` is set only on success, so a failing sync left it null
-- forever: every page load saw stale history and re-ran the whole broker
-- sweep -- roughly 112 requests -- while the response still returned 200 and
-- the reader was told nothing. The attempt timestamp is what breaks that
-- loop; the error text is what makes the failure sayable.
alter table public.trading_accounts
  add column if not exists trades_sync_attempted_at timestamptz;
alter table public.trading_accounts
  add column if not exists trades_sync_error text;

grant select (trades_sync_attempted_at, trades_sync_error)
  on public.trading_accounts to authenticated;
