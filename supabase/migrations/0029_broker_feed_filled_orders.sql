-- A dump without the filled orders cannot reproduce the grouping it captured.
--
-- `pairSpreads` takes three inputs: positions, activities AND filled orders.
-- The third is the provenance — it is what proves that four legs were one
-- ticket, and it is where every condor, every debit vertical and every
-- order-proven ratio comes from. Replaying a dump that carries only the first
-- two regroups those legs by shape and gets a different answer than production
-- produced, so the fixture disagrees with the bug it was captured to explain.
--
-- Added now because "one order, one position" is about to be proven against
-- real dumps rather than argued about: without this column the comparison is
-- between the new engine and an artefact of the capture.
alter table public.broker_feed_dumps
  add column if not exists filled_orders jsonb,
  add column if not exists filled_order_count integer;

comment on column public.broker_feed_dumps.filled_orders is
  'Raw GET /v2/orders?status=closed&nested=true at capture time — the same request syncAccounts makes. The provenance the pairing groups by; a dump without it regroups differently than production did.';
