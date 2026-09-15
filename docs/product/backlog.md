# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-09-15** (vp-product, Tuesday cadence).

## Reconciliation against two weeks of shipping (2026-09-01 → 2026-09-15)

`docs/ops/shipped.md` records roughly forty shipped changes since the last
run. None of them touch any of the three open proposals below. Read in
order of what actually shipped, against each proposal:

- **#1 (quoted exit width) — left, not shipped.** The Scanner (renamed from
  Screener, `8a51f95`) gained a whole-market pre-filter with a field called
  "Quote no wider than (%)" (`maxSpreadPct`, shipped `dcf0f17`, 2026-09-09).
  **This is not the same thing and should not be read as partial progress:**
  it filters the *stock's* own bid/ask spread, only inside the `universe ===
  "market"` sieve, to keep the whole-market chain sweep finishable
  (`supabase/functions/_shared/universe.ts`). It never touches an option
  contract's quote and is invisible on Top-50/S&P-500 scans, which is where
  most scanning still happens. Proposal #1 is about the *option* leg's bid/ask
  width on the results a user already sees — still absent from
  `src/components/scanner/ResultsTable.jsx`, which shows the same *strike*
  width it did on 2026-09-01, not a quoted-price width. The AMD incident's
  immediate cause was fixed by close-side walk clamping since (`closeWalk.js`
  `walkStart`/`nextLimit`, hardened further `2ca653f`/multi-close work), but
  that fixes the *getting out* mechanics, not the *never being shown the cost
  going in* problem this proposal names. Evidence unchanged; re-verified
  against current code.
- **#2 (POP column) — left, not shipped.** `ResultsTable.jsx` still offers
  exactly three sorts (RoR, credit, max risk). `impliedVol()` in
  `_shared/optionScan.ts` still returns a silent hard-coded `0.25` when the
  bisection can't bracket a root, with no provenance flag on the result —
  kill criterion 2 is exactly as live as it was on 2026-09-01. `positionWatch`
  still fires `short_through_strike`. No change to evidence.
- **#3 (record what was scanned) — left, not shipped.** `scanEntries/index.ts`
  and `findEntry/index.ts` still insert nothing; no `scan_runs` table exists.
  Every question this would answer is still unanswerable. No change.

No kills this run — nothing new disproves any of the three, and nothing new
supports promoting anything from `ideas.md`. `docs/growth/queue/` and
`docs/product/research/` are both empty; there is no fresh user evidence to
add a fourth proposal on, and manufacturing one to fill an open slot is the
failure mode the cap exists to prevent. Two slots stay empty.

**One decision resolved since the last run, not a backlog item:** pricing.md
decision #1 ("replace the live pricing page … or reduce it now to one line,
not leave it") is done. The old `/pricing` page — Paper $0/Pro $39/Desk $99,
false on seven rows — no longer exists; `landing/src/index.js` explicitly
keeps it out of the sitemap while the product is a demo, and there is no
static asset behind the route any more. See `pricing.md` §1 for the
corrected current-state text.

**Also worth naming, not a proposal:** the wheel's "writing half" — single-leg
setups in the scanner and open ticket — that `pricing.md` §4 called "the next
product build" is not next, it already shipped (cash-secured puts and covered
calls have opened from the ticket since `e982774`/`dcf0f17`-era work on
2026-09-02, ahead of even the last Tuesday run). `pricing.md` doesn't need a
number change for this — the price already assumed it inside Live at $29 with
no separate charge — but the "next build" framing in §4 is now describing
something already live, corrected there.

## Open proposals

**Three of five slots used.** Unchanged in substance from 2026-09-01; file
paths corrected for the Screener → Scanner rename (`8a51f95`, 2026-09-14).

### 1. Show the executable exit cost on scan results (quoted width), and let the user floor it

- **User problem:** *"I could not close my AMD spread. I watched it for five
  minutes with the price on screen sitting right where I wanted, and nothing
  happened."* — a real user, reported to the owner, quoted in
  `supabase/migrations/0021_order_attempts.sql` and in commit `76fbdeb`.
- **Evidence:**
  - **Support conversation (verified, ours).** The AMD incident above. The
    diagnosis written into `src/lib/closeWalk.js` is explicit: *"The mid on
    screen looked right the whole time, because the mid IS what was on screen;
    the executable price was never within reach."* The spread was quoted wider
    than the walk could ever cross.
  - **Our code.** `_shared/optionScan.ts` `scanChain()` fetches `bid` and
    `ask` for every contract and puts both on every leg of every candidate —
    `src/components/scanner/ResultsTable.jsx` (moved from
    `components/screener/`, same file) renders none of it. There is still no
    volume, open-interest, bid/ask-spread or IV filter on an *option*
    contract anywhere in the scan. (The whole-market universe sieve added
    2026-09-09 filters the *stock's* spread, one layer earlier and a
    different quantity — see the reconciliation note above.)
  - **Our code, the other half.** Entry is *not* the problem: `buildSetup`
    prices credit as `short.bid − long.ask`, the pessimistic executable side,
    so the credit on screen is achievable. The cost of a wide contract lands
    entirely on the **exit**, and `nextLimit()` walks the close price to
    `ask + $0.05` — now clamped consistently at both the start and every step
    (`walkStart`, `2ca653f` and later hardening) — but the user still never
    sees the width at entry, only pays it at exit.
  - **Teardown row E3** (`teardowns/barchart-options-screener.md`): Barchart
    refuses to display any US option with volume < 100 or OI < 500. Their
    floor is a proxy for the thing our own incident names directly.
- **Why activation:** the first trade is the last activation step, and a
  position the user cannot get out of at a price they recognise is what stops
  the second one.
- **Smallest test — still needs no production change.** Run the Scanner from
  the owner's own paper account across the S&P 500 preset, capture the
  candidate payload the browser already receives, and compute
  `(ask − bid)` summed across legs for the top 10 by return-on-risk. Express
  it as a share of the credit. Nothing ships; nothing is logged; the numbers
  are already in the response. Repeat on three different days. **Not run this
  cycle** — it needs a live paper-account session in a browser, which this
  environment cannot drive (Playwright/Chromium is still non-functional here,
  see `reachable.md`); it is a task for the owner or a session with a working
  browser, not a research gap.
- **Kill criterion:** if the summed quoted width on the median top-10
  candidate is under 15% of the credit, the exit give-up is noise against the
  trade's own economics and the column earns nothing — kill.
- **Cost guess:** test ~half a day, zero production risk. Feature (width
  column + "max width" filter field + the top-10 sort unchanged) ~2 days, no
  new data source. An OI floor on top of that is a further day and *does*
  need a new field plumbed from `/options/contracts`; propose it only if the
  width test comes back positive and width alone proves insufficient.
- **Hand-off, not mine:** whether `ask + $0.05` is the right ceiling is a
  money-path question for `head-of-trading` / `agent-manager`, not a product
  one. Flagged, not investigated; head-of-trading's queue already carries
  several open close-path items from this same code region.

### 2. Probability-of-profit column and sort

- **User problem:** "The top result is always the spread right next to the
  money — I can't tell which of these I'd actually win." (Still constructed.
  No user has said this; the test below is what checks whether ranking would
  really change.)
- **Evidence:** teardown row E4 — Barchart's spread screeners sort by
  descending break-even probability by default and show probability of loss
  per row — against `scanCandidates` in `_shared/optionScan.ts`, whose only
  ranking is `returnOnRisk` descending, which by construction fronts the
  closest-to-the-money candidate; `ResultsTable.jsx` still offers exactly
  three sorts (RoR, credit, max risk) and no probability of anything.
  `positionWatch` still fires a `short_through_strike` **critical** alert
  whenever a short leg goes in the money — whatever our ranking fronts, the
  watch is still the one emailing about it.
- **Smallest test:** the same captured payload as #1 — every candidate already
  carries `spot`, `strike`, `mid`, `expiry` per leg, and `impliedVol()` is an
  exported pure function. Compute POP offline and compare the POP-ranked
  top-10 against the RoR-ranked top-10. No new data, no logging, no deploy.
  **Not run this cycle**, same browser-session constraint as #1.
- **Kill criteria — two:**
  1. POP ranking reorders the RoR top-10 by fewer than two positions on
     average: the column adds nothing a user can act on. Kill.
  2. `impliedVol()` still returns a hard-coded `0.25` whenever the bisection
     cannot bracket a root — silently, with no marker on the result,
     unchanged since 2026-09-01. If more than a small share of top-10 legs
     hit that fallback, a POP column would be publishing a number we cannot
     stand behind. Kill, or the proposal becomes "give `impliedVol` a
     provenance flag first," a different and larger piece of work.
- **Cost guess:** test ~a day; feature ~2 days, no new data source — *if*
  kill criterion 2 does not fire.

### 3. Record what was scanned (the measurement three questions need)

- **User problem:** none. This is not a user-facing proposal and scores zero
  on the ranking criterion. It stays because we still cannot answer any
  question about how the Scanner is actually used, and the owner should keep
  deciding that knowingly rather than inherit it by default.
- **Evidence — our code, re-read 2026-09-15:**
  - `supabase/functions/scanEntries/index.ts` and `findEntry/index.ts` still
    insert **nothing**. A scan leaves no trace on the server. Unchanged since
    2026-09-01 despite the whole-market universe feature and the Screener →
    Scanner rename both touching this exact code path.
  - `scan_last_used` (migration `0006`) is still one row per user, upserted,
    never a history.
  - Consequence unchanged: "what share of scans use a custom universe" (now
    also "what share use the new whole-market filter"), "what share of top-10
    results are illiquid", "does POP ranking change what people trade" are
    all unanswerable from the database.
- **Smallest test:** there isn't one — this *is* the instrument. One table,
  one insert: `scan_runs(user_id, scope, strategy, universe, ticker_count,
  candidate_count, top jsonb, created_at)`, where `top` is the first ten
  candidates with legs, bid, ask and RoR. Written from `scanEntries` with its
  own failure swallowed, the pattern `_shared/orderAttempts.ts` already
  established for `order_attempts`.
- **Kill criterion:** if the owner would not act differently on any of the
  three answers above, it is measurement for its own sake — kill it and accept
  that Scanner proposals stay argued from competitor behaviour rather than
  our own usage.
- **Cost guess:** ~half a day of code. **Not free:** it is a migration plus an
  edge-function deploy, so it needs the owner's explicit approval and the
  staging path, per `AGENTS.md`. Ranked last precisely because its direct
  effect on activation is zero.

## Killed

### Universe demand instrumentation — killed 2026-09-01

Opened 2026-08-31 from teardown row E8 (Barchart sweeps the full optionable
US + Canada universe including ETFs and indices) against `src/lib/sp500.js`
(we ship a 50-name and a ~500-name S&P list, no ETFs, no indices). The
observation still stands. The **proposal** does not.

Its smallest test was: *"query the `scan_last_used` / `scan_presets` tables
(already recording every scan's config) for the share of scans using `custom`
universes."* Reading migration `0006_scan_presets.sql` and
`src/lib/scanPresets.js` showed that premise is false. `scan_last_used` is
keyed `(user_id, scope)` and upserted, so it holds one overwritten row per
user — the last configuration, not a scan history. Nothing else records a
scan at all.

**Returned to `ideas.md`** ("Expand scan universe beyond the S&P 500 list"),
where it keeps the verified competitor fact E8 attached to it. It comes back
to this file when either proposal #3 ships and the number clears the bar, or
a user says it in their own words in `growth/queue/`.

Still parked there as of 2026-09-15 — `growth/queue/` remains empty and
proposal #3 is still unshipped, so nothing has changed to bring it back.
