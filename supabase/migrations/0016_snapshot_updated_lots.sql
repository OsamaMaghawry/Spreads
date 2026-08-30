-- The half of a snapshot that was never taken.
--
-- 0013 records rows a sync is about to delete and trade records it is about to
-- rewrite, and stops the write if it cannot. It does not record share lots it
-- is about to rewrite: those are upserted in place on (account_id, lot_key),
-- so a lot's basis, disposal price or result can be replaced with no copy of
-- what was there.
--
-- That made the runbook's own claim -- "the rows are gone and there is no
-- snapshot is not a state this code can reach" -- false for share lots. A lot
-- keeps its key while its figures change, which is the case that leaves no
-- trace at all.
alter table public.history_snapshots
  add column if not exists updated_lots_before jsonb not null default '[]'::jsonb;
