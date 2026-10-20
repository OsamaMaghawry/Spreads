# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-10-20** (vp-product, Tuesday cadence). Previous: 2026-09-01.
Seven weeks between ranked runs; the reconciliation is in
`docs/product/daily/2026-10-20.md`.

## Read this first: the funnel the ranking is measured against

`docs/growth/metrics/2026-10-20.json`: **4 signed up (0 in the last seven
weeks) → 3 connected → 3 traded → 1 traded live → 0 paying.** Connected fell
from 4 to 3 between the 23 and 27 Sep snapshots and has not recovered; the
cause is unknown (see "not verified" in the daily note).

Activation is 3 of 4. The constraint is the top of the funnel, which is
vp-growth's question, not this file's. The honest consequence here: every
proposal below has an expected activation effect measured on three people.
**Nothing in this file should be built before its test has run.** Both
remaining tests now cost the owner one Claude prompt each (below), not a
browser capture.

## Open proposals

**Two of five slots used.** One killed this run, none added. Three empty slots
are the honest state: no new proposal this run met the evidence bar, and the
ideas that came close are in `ideas.md` with what would promote them.

What changed, one line each:

- **#1 left, not shipped; re-scoped cheaper.** The whole-market sieve (22 Sep)
  filters on the *stock's* quote width, not the option's, and only on the
  "Entire market" universe. Scan rows still show no option width. The test
  now runs through the Claude connector, and the open-interest half now has
  code to copy (`_shared/chainRead.ts`).
- **#2 left, not shipped; its second kill criterion now has a cheap remedy.**
  The broker's own implied volatility is already read by the option chain;
  the scanner still uses our fallback-prone `impliedVol()`.
- **#3 (record what was scanned): half-shipped, then killed.** The connector
  half shipped as `connector_calls` (migration 0059); the Scanner half did
  not, and four users cannot answer the questions it was built to answer.

### 1. Show the executable exit cost on scan results (quoted width), and let the user floor it

- **User problem:** *"I could not close my AMD spread. I watched it for five
  minutes with the price on screen sitting right where I wanted, and nothing
  happened."* — a real user, reported to the owner, quoted in
  `supabase/migrations/0021_order_attempts.sql` and commit `76fbdeb`.
- **Evidence:**
  - **Support conversation (verified, ours).** The AMD incident above; the
    diagnosis in `src/lib/closeWalk.js` is that the mid was on screen and the
    executable price was never within reach.
  - **Our code, read 2026-10-20.** `_shared/optionScan.ts` `scanChain()`
    still puts `bid` and `ask` on every leg of every candidate, and
    `src/components/scanner/ResultsTable.jsx` still renders neither (its
    columns: width or collateral, RoR, credit, max risk). There is still no
    option-level volume, open-interest, width or IV filter in the scan.
  - **What shipped near it, and why it is not this.** `scanUniverse` +
    `_shared/universe.ts` (22 Sep) drop names whose *stock* quote is wider
    than a set percent or whose share volume is thin. Its own comment makes
    this proposal's argument — *"a $30 stock whose options are quoted
    0.40/2.40 costs a third of its own premium to enter and may not be
    closable"* — and then measures the stock, not the option. It also only
    runs on the "Entire market" universe; Top 50, S&P 500 and custom lists
    get no liquidity screen at all. The option chain (12 Sep) shows bid, ask,
    open interest and volume per strike, so a user *can* see the width — on a
    different screen from the one that ranked the trade.
  - **Teardown row E3** (`teardowns/barchart-options-screener.md`): Barchart
    hides any US option with volume < 100 or OI < 500.
- **Why activation:** the first trade is the last activation step; a
  position the user cannot exit at a price they recognise is what stops the
  second one.
- **Smallest test — now one prompt, no capture.** The connector's
  `find_trades` (`_shared/connectorTools.ts`) returns live bid and ask per leg
  for up to 25 matches, five tickers a call. The owner asks Claude, against
  his paper account, in session: *"find put spreads on AAPL, MSFT, NVDA, AMD,
  TSLA, default filters, 25 results"*, twice more on other tickers, on three
  different days. Sum `(ask − bid)` across legs for the top 10 by RoR and
  express it as a share of the credit. Nothing ships.
- **Kill criterion:** median summed width under 15 % of the credit on the
  top 10 → kill; the AMD incident was a close-ticket problem `76fbdeb`
  already fixed.
- **Cost guess:** test, ~30 minutes of the owner's time plus an hour of
  arithmetic. Feature (width column + "max width" field) ~2 days, no new
  data. An OI floor on top is now ~half a day, not a day: `chainRead.ts`
  `fetchContracts()` already pages open interest from `/options/contracts`.
- **Hand-off, not mine:** the close walk's `ask + $0.05` ceiling with no step
  cap is head-of-trading's question. Still flagged, still not investigated.

### 2. Probability-of-profit column and sort

- **User problem:** "The top result is always the spread right next to the
  money — I can't tell which of these I'd actually win." (Constructed. No
  user has said it. The test is what checks it.)
- **Evidence:** teardown row E4 — Barchart's spread screeners sort by
  break-even probability and show probability of loss per row — against
  `scanCandidates()`, whose only ranking is still `returnOnRisk` descending
  (`optionScan.ts`, read 2026-10-20). `ResultsTable.jsx` sorts by RoR, credit
  and max risk only. The connector ranks the same way (`connector.md`).
- **Smallest test:** the same `find_trades` output as #1 carries spot,
  strike, mid and expiry per leg. Compute POP offline; compare the POP-ranked
  top 10 with the RoR-ranked top 10. No deploy.
- **Kill criteria:**
  1. POP reorders the RoR top 10 by fewer than two positions on average →
     kill.
  2. `impliedVol()` still returns a hard-coded `0.25` whenever bisection
     cannot bracket a root, with no marker. If a material share of top-10
     legs hit it, a POP column would publish a number without provenance.
     **New this run:** that is no longer a dead end. The option chain already
     reads the broker's own implied volatility and Greeks from
     `/v1beta1/options/snapshots` (`_shared/chainRead.ts`,
     `_shared/optionChain.ts`), and Alpaca documents chains "with Greeks".
     If criterion 2 fires, the proposal becomes "price POP from the broker's
     IV", not "fix our solver".
- **Cost guess:** test ~a day. Feature ~2 days on our IV; ~3 if it reads the
  broker's.
- **Hand-off, not mine:** the Scanner computes delta from its own IV while
  the option chain shows the broker's delta for the same contract. Whether
  the two screens can show a trader different deltas for one strike is a
  head-of-trading question.

## Killed

### 3. Record what was scanned — half-shipped, then killed 2026-10-20

Opened 2026-09-01 as the instrument three screener questions needed: a
`scan_runs` table written from `scanEntries`.

**What shipped (the connector half).** Migration `0059_connector_usage.sql`
(9 Oct) records every Claude-connector tool call in `connector_calls`, with
the filters and tickers asked for, kept 90 days, shown in Admin → AI
connector. A scan run through Claude is now recorded.

**What did not (the Scanner half).** `scanEntries` → `_shared/entryScan.ts`
still inserts nothing; `scan_last_used` is still one overwritten row per user;
neither table keeps the *results*, which were the point (what share of top-10
rows are illiquid).

**Why it dies rather than waits.** Its kill criterion was "the owner would
not act differently on the answers". With four users, three connected and no
signup in seven weeks, a scan log describes three people the owner can simply
ask. And #1 and #2 no longer need it: their tests run on the connector's live
output. A migration and a deploy that answer nothing a conversation can't is
measurement for its own sake. **Returned to `ideas.md`** with its trigger.

### Universe demand instrumentation — killed 2026-09-01; the feature then shipped anyway

Killed because its test could not run (no scan history). On 9 and 22 Sep the
owner asked for and shipped the whole-market universe directly (`dcf0f17`,
`daf0282`, `bc97286`). Recorded so the record is straight: it shipped on the
owner's request, not on evidence from this file, and nothing yet measures
whether anyone uses it.
