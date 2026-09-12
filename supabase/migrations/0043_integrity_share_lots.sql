-- The share half of the audit layer.
--
-- Migration 0042 put `integrity_code` on `trade_records` only, and the bench
-- found the gap that leaves: the impossible-loss check's own reason for
-- existing is an assignment or exercise misattributing a SHARE result onto the
-- wrong option row -- so the money at the heart of the defect stayed published
-- in `stock_lots`. The lots table showed it, the share walk summed it, and the
-- equity chart's two modes ended up reading different facts: "Account value"
-- is the broker's and includes the money, "Performance" is reconstructed and
-- excluded it, so one toggle moved the endpoint with nothing explaining why.
--
-- A lot is attributed to a chain by `disposed_chain_id`, so a withheld trade's
-- chain names exactly the disposals carrying the disputed money.
--
-- ONLY DISPOSED LOTS ARE EVER FLAGGED, and the distinction is deliberate. What
-- is in doubt is the ATTRIBUTION of a realised result -- which trade a closed
-- lot's gain or loss belongs to. A lot still HELD has no attribution question:
-- its quantity is the broker's and its mark is a real closing price, so
-- withholding it would remove a fact nobody disputes from the open book and
-- from the account's own value. See _shared/integrity.ts.

alter table public.stock_lots
  add column if not exists integrity_code text,
  add column if not exists integrity_detail jsonb;

comment on column public.stock_lots.integrity_code is
  'Null when this lot''s realised result is trustworthy. Non-null means the lot '
  'is a disposal attributed to a trade whose computed result its own strikes '
  'cannot reach: the lot is still shown, its money is withheld from every total, '
  'and the screen says so. Never set on an open lot -- a held lot''s quantity and '
  'mark are the broker''s facts, not our attribution.';

create index if not exists stock_lots_integrity_idx
  on public.stock_lots (account_id)
  where integrity_code is not null;
