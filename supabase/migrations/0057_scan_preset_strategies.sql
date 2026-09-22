-- Scan presets could only be saved for three of the six strategies the app offers.
--
-- The owner, saving a preset: "Couldn't save preset — new row for relation
-- "scan_presets" violates check constraint "scan_presets_strategy_check"".
--
-- The constraint was written when the Scanner swept spreads only:
--
--   CHECK (strategy = ANY (ARRAY['put_spread','call_spread','iron_condor']))
--
-- Cash-secured puts, covered calls and the wheel were added to StrategyPicker
-- afterwards and nothing widened the column that stores them. So a preset for
-- half the product's strategies was rejected by the database, and the trader
-- got a constraint name where an explanation belongs.
--
-- `scan_last_used` carries the same list and the same gap, and is worse for
-- being invisible: the Scanner writes it through `saveLastUsed(...).catch(() =>
-- {})` -- deliberately, so recording a scan can never stop one -- which means
-- "remember what I last scanned" has been failing silently for those three
-- strategies for as long as they have existed. Nobody would have reported it.
--
-- Both are widened to exactly the set StrategyPicker can produce. That list is
-- the scanner's own vocabulary and is NOT the one in src/lib/strategies.ts,
-- which categorises closed trade records and says "spreads" where this says
-- put_spread and call_spread. Anything added to StrategyPicker needs a
-- migration here too; this is the second time that has been true and the first
-- time it was noticed.

alter table public.scan_presets drop constraint if exists scan_presets_strategy_check;
alter table public.scan_presets
  add constraint scan_presets_strategy_check
  check (strategy = any (array[
    'put_spread', 'call_spread', 'iron_condor',
    'cash_secured_put', 'covered_call', 'wheel'
  ]));

alter table public.scan_last_used drop constraint if exists scan_last_used_strategy_check;
alter table public.scan_last_used
  add constraint scan_last_used_strategy_check
  check (strategy = any (array[
    'put_spread', 'call_spread', 'iron_condor',
    'cash_secured_put', 'covered_call', 'wheel'
  ]));

-- The scope lists are correct and are left alone: SCOPE in src/lib/scanPresets.js
-- is { SCANNER: "screener", OPEN: "open" }, which both constraints already
-- allow. Checked rather than assumed, because "screener" and "scanner" differing
-- by one word is exactly the shape of the bug above.
