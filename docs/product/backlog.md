# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

## Open proposals

Three of five slots used, all fed by
`teardowns/barchart-options-screener.md` (2026-08-31). Ranked by expected
activation effect ÷ effort; ties break toward the cheaper test.

### 1. Liquidity floor on scan results (open interest / volume)

- **User problem:** "The screener told me to sell this spread, but when I
  sent the order nothing filled — and when it finally did, it was nowhere
  near the price the scan showed." (Constructed from the mechanism, not a
  quote — no user has said this yet, which the smallest test will check.)
- **Evidence:** teardown evidence row E3 — Barchart refuses to show any US
  option with volume < 100 or OI < 500 as baseline hygiene — plus our code:
  `supabase/functions/_shared/optionScan.ts` filters on price fields only;
  no liquidity field exists anywhere in the scan or the results table. A
  thin contract can rank first, and the UI gives no way to notice.
- **Why activation:** the first trade is the last activation step; a first
  order that hangs unfilled or fills badly is the worst possible first-run
  experience, and it is our default behaviour today.
- **Smallest test:** Alpaca's `/options/contracts` response already carries
  `open_interest` — log it for one week of scans (no UI change) and measure
  what share of top-10 results would fail Barchart's floors.
- **Kill criterion:** under 10% of top-10 results affected over the week —
  the problem is theoretical; kill.
- **Cost guess:** test ~half a day; full feature (floor + OI column +
  filter field) ~2–3 days, no new data source.

### 2. Universe demand instrumentation (before any universe expansion)

- **User problem:** "I trade SPY and QQQ spreads — your screener doesn't
  even have ETFs, so there's nothing here for me." (Constructed; the test
  below is exactly the check on whether real users hit this wall.)
- **Evidence:** teardown evidence row E8 — Barchart sweeps the full
  optionable US+Canada universe including ETFs and indices — against
  `src/lib/sp500.js`: our built-in universes are 50 or ~500 S&P names, no
  ETFs; only hand-typed custom lists escape it. Promotes the "expand scan
  universe" entry waiting in `ideas.md`, which now has a verified
  competitor fact behind it.
- **Smallest test:** query the `scan_last_used` / `scan_presets` tables
  (already recording every scan's config) for the share of scans using
  `custom` universes and the share of custom tickers outside the S&P 500.
  Commission `funnel-instrumentation`. No code ships.
- **Kill criterion:** under 10% of scans over a month touch non-S&P-500
  names — expansion returns to `ideas.md` and this slot frees up.
- **Cost guess:** hours (a query and a readout).

### 3. Probability-of-profit column and sort

- **User problem:** "The top result is always the spread right next to the
  money — I can't tell which of these I'd actually win." (Constructed from
  the ranking math; the offline test checks whether ranking would really
  change.)
- **Evidence:** teardown evidence row E4 — Barchart's spread screeners sort
  by descending break-even probability by default and show probability of
  loss per row — against `scanCandidates` in
  `supabase/functions/_shared/optionScan.ts`: our only ranking is
  `credit/maxRisk` descending, which by construction fronts the
  closest-to-the-money (riskiest) candidates, and `ResultsTable.jsx` offers
  no probability sort.
- **Smallest test:** compute POP offline from a week of scan logs — we
  already back-solve IV per contract (`impliedVol`), so this is arithmetic
  on data in hand; compare POP-ranked vs RoR-ranked top-10s.
- **Kill criterion:** POP ranking reorders the RoR top-10 by fewer than two
  positions on average — the column adds nothing a user can act on; kill.
- **Cost guess:** test ~a day; full feature (column + sort + preset field)
  ~2 days, no new data source.


## Killed

*(none yet)*
