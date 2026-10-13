# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-10-13** (vp-product, Tuesday cadence). Previous: 2026-09-01.

## Reconciliation, 2026-10-13 — what six weeks of shipping did to each proposal

Read against `docs/ops/shipped.md` (1 Sep to 13 Oct), the commit log, and the
scanner code on `main` (`src/components/scanner/`, `supabase/functions/_shared/optionScan.ts`).

| Proposal | Verdict | Evidence |
| --- | --- | --- |
| #1 Quoted exit width on scan rows | **Left, half-adjacent.** Not shipped. What shipped is a *stock*-level quote-width filter in the whole-market first pass (9 Sep, `dcf0f17`; `ScannerConfig.jsx` `maxSpreadPct`, default 1 %). That screens the underlying, not the option legs. `ResultsTable.jsx`'s "Width" column is the strike distance, not the quoted width. No option bid/ask width, volume or OI filter exists. | grep of `src/components/scanner`, `optionScan.ts` |
| #2 Probability-of-profit column | **Left.** No POP anywhere in the scanner. `impliedVol()` still falls back to 0.25 silently (`optionScan.ts:31-36`), so kill criterion 2 still stands untested. | same |
| #3 Record what was scanned | **Left, now killed** (below). No `scan_runs`, no migration past `0059` touches scans. | `supabase/migrations/` |
| (ideas) Expand the scan universe | **Shipped.** The Scanner can sweep the whole listed market (9 Sep). Removed from `ideas.md`. The option-level OI floor half is still unbuilt. | shipped.md 2026-09-09, 2026-09-22 |

The one fact that changes the ranking arithmetic, from the 13 Oct funnel
snapshot (`docs/growth/metrics/2026-10-13.json`): **4 signups ever, 3 connected,
3 traded, 1 on a live account, 0 signups in the last 7 days, 0 paying.**
Activation (signup → connected → first trade) is 3 of 4. The binding
constraint is the top of the funnel, not the middle. Every proposal below is
ranked by its effect on activation, and its honest value today is small
because the denominator is three people. They stay because their tests cost
nothing and run on the owner's own paper account, not because they will move
the number this month. Acquisition is `vp-growth`'s question; it is handed
over, not investigated here.

## Open proposals

**Two of five slots used.** Fewer, better-tested entries beat five padded ones.
A third was killed this run; no new proposal had evidence. Not filling the slots
is deliberate.

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

### Record what was scanned (`scan_runs`) — killed 2026-10-13

Opened 2026-09-01 as the instrument the other screener questions needed. Its
own kill criterion was: *"if the owner would not act differently on any of
the answers, it is measurement for its own sake."* The evidence that now
stops supporting it:

- The funnel (13 Oct) is 4 signups ever and 3 users who have traded. A scan
  log over three people answers "what share of scans use a custom universe" or
  "what share of top-10 results are illiquid" with an anecdote, not a rate.
  Nothing the owner could decide would differ on a sample that small.
- Proposals #1 and #2 were rewritten on 1 Sep to need no scan log at all;
  their tests run on the owner's own paper account.
- It costs a migration plus a deploy, so owner approval and the staging
  path, for a measurement with no reader.

**Returned to `ideas.md`.** It comes back when there are roughly 20 users
running scans a week, or when a proposal appears whose test cannot be run any
other way.

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
