# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-10-06** (vp-product, Tuesday cadence; first full run since 2026-09-01).

## Open proposals

**Two of five slots used.** Reconciled 2026-10-06 against `docs/ops/shipped.md`
(2 Sep – 24 Sep, 129 lines) and the code on `main`. Nothing was added: no new
proposal has evidence, and the funnel says why (below).

### Reconciliation — what the five weeks did to each proposal

| Proposal | Verdict | Evidence |
| --- | --- | --- |
| #1 Exit cost (quoted width) on scan results | **Left — one adjacent half-ship** | 2026-09-09 whole-market scan (`scanUniverse`, `_shared/universe.ts`) added a `maxSpreadPct` sieve (default 1%, "Quote no wider than (%)" in `ScannerConfig.jsx`). That is the **underlying stock's** quote width, read from one snapshot, applied before any chain is fetched. It does not touch the option legs. `ResultsTable.jsx` still has no bid, ask or width-of-leg column and no option-width filter. The AMD incident was an option spread, so the problem as written is not addressed. `closeWalk.js` ceiling (ask + $0.05) unchanged. |
| #2 POP column and sort | **Left** | No POP anywhere in `src`/`supabase`; `optionScan.ts` ranking and the three client sorts (RoR, credit, max risk) unchanged; `impliedVol()` still returns hard-coded 0.25 on a failed bracket (lines 33, 36). |
| #3 Record what was scanned | **Killed** — see below | Not shipped (no `scan_runs`; `scanEntries` and `scanUniverse` insert nothing). The reason to kill is the denominator, not the code. |

Side effect worth knowing: the 2026-09-22 fix made a cash-secured put or
covered-call scan default to a 0% return-on-risk floor and the 09-23 covered-call
changes added a "cover in use" flag. Neither changes #1 or #2; #2's POP column
would now also have to be defined for single-leg strategies.

### Why only two, and why not more scanner work

Funnel snapshot 2026-10-06 (`docs/growth/metrics/2026-10-06.json`): **4 signups
ever, 0 in the last 7 days, 3 connected, 3 traded, 1 traded live, 0 paying; all
four source "unknown".** Activation is not what is failing — three of four who
signed up connected and traded. Reach is. Every proposal below is ranked on
activation, and activation has no measurable problem at n=4. That is why the
two that remain are kept on competitor and incident evidence only, ranked
lowest-risk, and why no new scanner proposal is opened. The acquisition
question belongs to `vp-growth`; handed off, not investigated.

### 1. Show the executable exit cost on scan results (quoted width), and let the user floor it

- **User problem:** *"I could not close my AMD spread. I watched it for five
  minutes with the price on screen sitting right where I wanted, and nothing
  happened."* — a real user, reported to the owner, quoted in
  `supabase/migrations/0021_order_attempts.sql` and in commit `76fbdeb`.
  This is no longer a constructed quote.
- **Evidence:**
  - **Support conversation (verified, ours).** The AMD incident above. The
    diagnosis written into `src/lib/closeWalk.js` is explicit: *"The mid on
    screen looked right the whole time, because the mid IS what was on screen;
    the executable price was never within reach."* The spread was quoted wider
    than the walk could ever cross.
  - **Our code.** `_shared/optionScan.ts` `scanChain()` already fetches `bid`
    and `ask` for every contract and already puts both on every leg of every
    candidate — and `src/components/screener/ResultsTable.jsx` renders none of
    it. The scan therefore knows the width, and the user never sees it.
    There is still no volume, open-interest, bid/ask-spread or IV filter
    anywhere in the scan.
  - **Our code, the other half.** Entry is *not* the problem: `buildSetup`
    prices credit as `short.bid − long.ask`, the pessimistic executable side,
    so the credit on screen is achievable. The cost of a wide contract lands
    entirely on the **exit**, and commit `76fbdeb` just made that cost
    unbounded in steps: `nextLimit()` now walks the close price to `ask +
    $0.05` with no step cap, recomputed from a live quote every 30s. The user
    gets out — and pays the whole width to do it, having never been shown the
    width at entry.
  - **Teardown row E3** (`teardowns/barchart-options-screener.md`): Barchart
    refuses to display any US option with volume < 100 or OI < 500. Their
    floor is a proxy for the thing our own incident names directly.
- **Why activation:** the first trade is the last activation step, and a
  position the user cannot get out of at a price they recognise is what stops
  the second one. A row that says "credit $45, max risk $55" while the
  round-trip give-up is $40 is a number we published without its cost.
- **Smallest test — now needs no production change at all.** Run the screener
  from the owner's own paper account across the S&P 500 preset, capture the
  candidate payload the browser already receives, and compute
  `(ask − bid)` summed across legs for the top 10 by return-on-risk. Express
  it as a share of the credit. Nothing ships; nothing is logged; the numbers
  are already in the response. Repeat on three different days.
  *(The previous version of this test — "log OI for one week of scans" —
  assumed a scan log. There isn't one. See proposal #3.)*
- **Kill criterion:** if the summed quoted width on the median top-10
  candidate is under 15% of the credit, the exit give-up is noise against the
  trade's own economics and the column earns nothing — kill, and the AMD
  incident is a close-dialog problem that `76fbdeb` already fixed.
- **Cost guess:** test ~half a day, zero production risk. Feature (width
  column + "max width" filter field + the top-10 sort unchanged) ~2 days, no
  new data source. An OI floor on top of that is a further day and *does*
  need a new field plumbed from `/options/contracts`; propose it only if the
  width test comes back positive and width alone proves insufficient.
- **Hand-off, not mine:** whether `ask + $0.05` with no step cap is the right
  ceiling is a money-path question for `head-of-trading` / `agent-manager`,
  not a product one. Flagged, not investigated.

### 2. Probability-of-profit column and sort

- **User problem:** "The top result is always the spread right next to the
  money — I can't tell which of these I'd actually win." (Still constructed.
  No user has said this; the test below is what checks whether ranking would
  really change.)
- **Evidence:** teardown row E4 — Barchart's spread screeners sort by
  descending break-even probability by default and show probability of loss
  per row — against `scanCandidates` in `_shared/optionScan.ts`, whose only
  ranking is `returnOnRisk` descending, which by construction fronts the
  closest-to-the-money candidate; `ResultsTable.jsx` offers exactly three
  sorts (RoR, credit, max risk) and no probability of anything.
  Newly relevant: `positionWatch` (shipped 2026-08-31) now fires a
  `short_through_strike` **critical** alert whenever a short leg goes in the
  money. Whatever our ranking fronts, the watch will be emailing about it.
- **Smallest test:** the same captured payload as #1 — every candidate already
  carries `spot`, `strike`, `mid`, `expiry` per leg, and `impliedVol()` is an
  exported pure function. Compute POP offline and compare the POP-ranked
  top-10 against the RoR-ranked top-10. No new data, no logging, no deploy.
- **Kill criteria — two now:**
  1. POP ranking reorders the RoR top-10 by fewer than two positions on
     average: the column adds nothing a user can act on. Kill.
  2. **New, from our code.** `impliedVol()` returns a hard-coded `0.25`
     whenever the bisection cannot bracket a root — silently, with no marker
     on the result. If more than a small share of top-10 legs hit that
     fallback, a POP column would be publishing a number we cannot stand
     behind, which is exactly what `AGENTS.md` forbids ("never return a number
     without its provenance"). Kill, or the proposal becomes "give `impliedVol`
     a provenance flag first", which is a different and larger piece of work.
- **Cost guess:** test ~a day; feature ~2 days, no new data source — *if*
  kill criterion 2 does not fire.

## Killed

### Record what was scanned (`scan_runs`) — killed 2026-10-06

Opened 2026-09-01 as the instrument three screener questions needed. The
evidence that supported it has gone: it was justified by "we cannot answer any
question about screener use", but with **4 signups ever and 0 in the past
week** a scan log would hold a handful of rows from the owner's own testing.
Its kill criterion — "would the owner act differently on any of the three
answers" — now answers itself: no answer from n≈4 could change a decision, and
it costs a migration plus an edge-function deploy that needs the owner's
approval. Revisit when there are roughly 30 active scanners, not before.
Returns to `ideas.md`.

### Universe demand instrumentation — killed 2026-09-01

Opened 2026-08-31 from teardown row E8 (Barchart sweeps the full optionable
US + Canada universe including ETFs and indices) against `src/lib/sp500.js`
(we ship a 50-name and a ~500-name S&P list, no ETFs, no indices). The
observation still stands. The **proposal** does not.

Its smallest test was: *"query the `scan_last_used` / `scan_presets` tables
(already recording every scan's config) for the share of scans using `custom`
universes."* Reading migration `0006_scan_presets.sql` and
`src/lib/scanPresets.js` this run shows that premise is false.
`scan_last_used` is keyed `(user_id, scope)` and upserted, so it holds one
overwritten row per user — the last configuration, not a scan history. Nothing
else records a scan at all. The most that query can yield is "how many of our
handful of users happened to have a custom universe set the last time they
scanned", which is a sample of roughly the number of people who have ever run
the screener, with no denominator and no time dimension.

So the test cannot disprove the proposal, and a proposal whose test cannot run
is not a proposal — it is an opinion holding a slot. Producing the data it
needs is proposal #3, which is now ranked on its own merits rather than
smuggled in as somebody else's test.

**Returned to `ideas.md`** ("Expand scan universe beyond the S&P 500 list"),
where it keeps the verified competitor fact E8 attached to it. It comes back
to this file when either proposal #3 ships and the number clears the bar, or a
user says it in their own words in `growth/queue/`.
