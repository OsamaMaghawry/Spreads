-- broker_feed_dumps: the repo catching up with production.
--
-- dumpBrokerFeed captures a broker activity feed so a refused sync can be
-- diagnosed off-box: three accounts stopped syncing because reconstruction
-- computed a loss beyond what the strikes can lose and the write guard
-- correctly refused to store it. Finding that defect needed the exact feed,
-- and reaching the feed needs the credential decryption key that lives only in
-- an edge function's environment. So the function fetches and stores, and the
-- pure reconstruction is re-run against the stored copy.
--
-- This table was created straight against PRODUCTION over MCP during that
-- diagnosis (see the note on commit 60814dc), and no migration was written.
-- The repo therefore did not describe a table production depends on, staging
-- had no table at all -- dumpBrokerFeed failed there at the insert -- and a
-- fresh environment built from these files would have been missing it.
--
-- Everything below is production's live schema as read on 2026-09-02, not a
-- reconstruction from the function's insert. Every statement is idempotent:
-- on staging it creates; on production it no-ops and registers this file in
-- the migration history so the two stop disagreeing.
--
-- Access: revoked from the browser roles entirely. The function's comment says
-- "nothing sensitive crosses the wire even though any valid project key can
-- trigger a capture", and this is what makes that true -- the feed lands
-- somewhere only the service role can read.
create table if not exists public.broker_feed_dumps (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  activities jsonb not null,
  activity_count integer,
  created_at timestamptz not null default now()
);

create index if not exists broker_feed_dumps_account_idx
  on public.broker_feed_dumps (account_id, created_at desc);

alter table public.broker_feed_dumps enable row level security;
revoke all on public.broker_feed_dumps from anon, authenticated;
