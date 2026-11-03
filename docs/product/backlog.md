# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-11-03** (vp-product, Tuesday cadence). Previous: 2026-09-01.

## Reconciliation — 2026-11-03 (read first)

Read against `docs/ops/shipped.md`, `git log origin/main`, `git log origin/staging`
and `docs/product/features.md`. There are no daily product notes after 2026-09-04.

**The headline fact: `main` has shipped no product code since early September.**
`git log origin/main --since=2026-09-05 -- src supabase/functions` returns one
commit, a metrics snapshot (`0d6a91e`, 16 Oct). Everything since is blog posts.
Meanwhile `origin/staging` carries 298 commits to `src/` and `supabase/functions/`
over the same period — `git diff --stat main staging -- src supabase` is 168
files, ~24,900 lines added: a trading terminal (charts, replay, hotkeys, order
book, tape, news, protect/repair, stop guard, SnapTrade/Tradier account
plumbing, migrations 0060–0065). None of it is live, and billing is still
hidden (`billing_visible` off, shipped 3 Sep). The 100-paying-users target is
31 Dec; the product a stranger can pay for today is the 4 Sep product.

Proposal by proposal:

| # | Proposal | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Quoted width on scan results | **Left.** | `src/components/scanner/ResultsTable.jsx` still shows strike *Width* only; no bid/ask or quoted-width column. Not in staging's scanner either (the new terminal screener, `src/components/terminal/Screener.jsx`, shows no width — I did not read its filters end to end; see unverified). |
| 2 | Probability-of-profit | **Left.** | No POP anywhere in `src/` or `_shared/optionScan.ts`; `impliedVol()` fallback unchanged. |
| 3 | `scan_runs` log | **Killed.** | No migration; see Killed. |
| new | Release path for staging's work | **Opened (#1).** | See below. |

## Open proposals

**Three of five slots used (2026-11-03).** #1 is new this run; the two
screener proposals below it are unchanged and now rank #2 and #3 by the
activation criterion (a product nobody can pay for scores zero on everything
else). Their numbering inside the text below is the old one: old #1 = width, old #2 = POP.

### 1. Decide what part of staging becomes the product people can pay for — and release it

- **User problem:** none stated by a user. This is a gap in our own pipeline, and
  the owner should decide it knowingly. The first activation step (a live
  account paying) cannot happen on code that is not on `main`.
- **Evidence — our repo, read 2026-11-03:** `git log origin/main --since=2026-09-05
  -- src supabase/functions` is one metrics commit; `origin/staging` has 298
  commits over the same span and ~24,900 added lines across 168 files (terminal,
  replay, hotkeys, SnapTrade/Tradier plumbing, migrations 0060–0065). Billing
  stays hidden (`billing_visible`, 3 Sep). `plan-100.md` sets 100 paying users
  by 31 Dec. `docs/ops/queue.md` holds open head-of-trading findings on the
  terminal (W44: N2 protect resizes a 10-share limit into a 100-share OCO; N6,
  N7 share sales ignore short calls the shares cover, N9 priced hotkeys off a
  15-minute-delayed quote, N10 no half-day calendar) — so "release staging"
  is not free either.
- **Smallest test:** the owner (not an agent) names the *one* thing a stranger
  should be able to do on day one of Live — e.g. the 4 Sep Positions Monitor +
  ticket, or the terminal — and the open money-path findings against *that* scope
  are closed or cut. No new build; a scoping decision.
- **Kill criterion:** if the owner would rather keep building on staging and
  hold the 31 Dec target, kill this and move the target in `plan-100.md` to a
  date that has a release in front of it. Either is fine; drifting is not.
- **Cost guess:** the decision is an hour. Release verification is
  agent-manager's gate, outside this file.

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

### ~~3. Record what was scanned~~ — KILLED 2026-11-03 (text kept for the record; see Killed)

- **User problem:** none. This is not a user-facing proposal and scores zero
  on the ranking criterion. It is here because this run discovered that we
  cannot answer *any* question about how the screener is actually used, and
  the owner should decide that knowingly rather than inherit it.
- **Evidence — our code, read 2026-09-01:**
  - `supabase/functions/scanEntries/index.ts` and `findEntry/index.ts` insert
    **nothing**. A scan leaves no trace on the server.
  - `scan_last_used` (migration `0006`) has primary key `(user_id, scope)` and
    is **upserted on every scan** (`src/lib/scanPresets.js` `saveLastUsed`).
    It is one row per user, overwritten each time — the most recent
    configuration, never a history.
  - Consequence: "what share of scans use a custom universe", "what share of
    top-10 results are illiquid", "does POP ranking change what people trade"
    are all unanswerable from the database. `funnel-instrumentation` cannot be
    commissioned on any screener question today. This is what killed the
    universe proposal below.
- **Smallest test:** there isn't one — this *is* the instrument. The smallest
  **version** is one table and one insert: `scan_runs(user_id, scope, strategy,
  universe, ticker_count, candidate_count, top jsonb, created_at)`, where
  `top` is the first ten candidates with legs, bid, ask and RoR. Written from
  `scanEntries` with its own failure swallowed, exactly the pattern
  `_shared/orderAttempts.ts` already established for `order_attempts`.
- **Kill criterion:** if the owner would not act differently on any of the
  three answers above, it is measurement for its own sake — kill it and accept
  that screener proposals stay argued from competitor behaviour rather than
  our own usage.
- **Cost guess:** ~half a day of code. **Not free:** it is a migration plus an
  edge-function deploy, so it needs the owner's explicit approval and the
  staging path, per `AGENTS.md`. Ranked last precisely because its direct
  effect on activation is zero.

## Killed

### Record what was scanned (`scan_runs`) — killed 2026-11-03

Its own kill criterion was "if the owner would not act differently on any of
the answers, kill it." Evidence it now meets that: 28-day Search Console shows
2 clicks and 143 impressions for the whole site (`docs/growth/metrics/2026-11-03.json`);
`plan-100.md` and `pricing.md` §4 describe a base of about two customers; billing is not open.
A scan log on that base is the same trap that killed universe instrumentation:
no denominator, no time dimension, a sample of roughly the number of people who
ever ran the screener. Proposals #1 and #2 are tested offline from the payload
the browser already receives, so neither needs it. A second screener now exists
on staging (the terminal's), so a log written for the old one would be
instrumenting the thing about to be superseded. Revisit only if a screener
decision needs usage data AND there are enough users for it to mean anything.


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
