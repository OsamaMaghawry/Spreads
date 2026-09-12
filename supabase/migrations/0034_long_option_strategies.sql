-- A bought put is a bought put, not a spread.
--
-- The owner, 11 Sep: *"I don't see the long put in the trade history."* It was
-- there, filed under Spreads, which is where he was never going to look. Two
-- rows on his own live account — TSLA 365P long 1, twice, −$128 and −$249 —
-- each with an EMPTY `short_symbol`, because there is no short leg.
--
-- Then: *"Don't we have a design just for regular puts and calls?"* We did not,
-- and this constraint was the proof: every category the product could express
-- was a strategy that SELLS something, plus a leftover bucket. A directional
-- single-leg position — one of the most ordinary things a trader holds — had
-- nowhere to go, so the reconstruction stamped it `spreads` for want of any
-- other value this check would accept.
--
-- Split into puts and calls rather than one "long options", to match the
-- granularity already set by cash_secured_put and covered_call: the product
-- tells the two halves of a wheel apart, so it should tell a bought put from a
-- bought call.
--
-- Existing rows are NOT rewritten here. Every trade record is recomputed from
-- the broker's activity feed on the next sync, so the rows reclassify
-- themselves — and nothing rewrites a user's history in a migration.
alter table public.trade_records
  drop constraint if exists trade_records_strategy_check;

alter table public.trade_records
  add constraint trade_records_strategy_check
  check (strategy = any (array[
    'spreads'::text,
    'cash_secured_put'::text,
    'covered_call'::text,
    'long_put'::text,
    'long_call'::text,
    'wheel'::text,
    'unknown'::text
  ]));
