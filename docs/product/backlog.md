# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-09-22** (vp-product, Tuesday cadence). Previous run
2026-09-01. **Three weeks unreconciled** — see "What the gap cost" below.

## The ranking criterion is currently degenerate — a decision, not a quibble

Funnel, `docs/growth/metrics/2026-09-22.json`, verified: **4 signed up → 4
connected → 4 traded → 2 traded live → 0 paying**, and **0 new signups in the
15 days the snapshot series covers**. Every user who arrives already completes
every activation step. So "expected effect on activation" is approximately
**zero for every candidate on this file**, and dividing zero by effort ranks
nothing.

This run therefore ranks by the criterion as written, notes that it separates
nothing, and falls to the two things that do discriminate: the file's own
tie-break (cheaper test first) and the **next binding constraint after
activation, which is the first paid subscription** — the half of this agent's
question that reads "at what price".

Arrival is `vp-growth`'s question and is not investigated here. The criterion
itself is decision **D1** in the report: activation is saturated at n=4, and a
criterion that cannot separate five proposals is not doing its job.

## Open proposals

**Three of five slots used.** Two deliberately empty. This run killed two
proposals outright and promoted one from `ideas.md` on evidence that arrived.

What changed this run, in one line each:

- **#1 is new, and it is the top of the file.** The watch — the most
  paid-shaped feature in the product — still emails one global address. The
  *mechanism* to email each user their own copy shipped on 13 Sep in the
  weekly digest and was never ported.
- **#2 (was #1) re-scoped again, and narrowed.** A stock-level quote-width
  sieve shipped inside the new whole-market universe scan. The option-leg
  width — the half that cost the AMD user money — is still not shown or
  filtered anywhere.
- **#3 is promoted from `ideas.md`** on a verified broker fact: Alpaca turned
  on **live** index options on 2026-09-02.
- **POP column and sort: killed.** See below.
- **`scan_runs` instrumentation: killed.** See below.

### 1. Point the watch at the person whose position it is (W6)

- **User problem, in the user's words:** none, and this entry says so rather
  than inventing one. It is defect-shaped, not demand-shaped: the product
  sends one person's position alerts to a different person's inbox.
- **Evidence:**
  - **Funnel data (verified).** `docs/growth/metrics/2026-09-22.json`: four
    users, four connected accounts. Read against
    `supabase/functions/positionWatch/index.ts` — it loads **every** account
    via `loadAllAccounts(admin, …)` and sends the whole run to one address,
    `settings.recipient_email` (`watch_settings`, migration `0017`, defaulting
    to the owner's own address). With four connected users, the owner's inbox
    is where three other people's short-strike breaches arrive. Whether that
    is acceptable is **`compliance-gate`'s and `agent-manager`'s question, not
    this agent's** — flagged, not investigated.
  - **Our code, the other half — the work is already done once.**
    `supabase/functions/weeklyDigest/index.ts` (shipped 13 Sep, `b13e9cc`,
    `8328baf`) resolves each user's own address through
    `admin.auth.admin.getUserById(userId)`, honours
    `profiles.weekly_digest_opt_out`, and carries a working unsubscribe link
    to `/settings?email=off` (the route that `d4d9648` created). A `mode`
    switch keeps an owner-preview path alongside the real one. That is the
    entire shape W6 needs, proven in production on the same email transport
    (`_shared/email.ts`).
  - **Verified competitor fact.** PutHouse — the second Alpaca-connected
    competitor named in `docs/context/positioning.md` — tells **its own user**
    why each trade was placed or skipped, per Alpaca's own announcement of the
    integration (alpaca.markets/blog, 27 Jul 2026; fetched directly
    2026-09-22, see `reachable.md`). Per-user notification is table stakes in
    this category, not a differentiator.
  - **Our own pricing file.** `pricing.md` §6 decision **8** has been open
    since 2 Sep, and `features.md` row **W6** reads "NOT YET SELLABLE until W6
    is decided". The watch and the after-close report (W1, W5) are the two
    features that file calls "the most paid-shaped thing built", and they are
    the reason the $29 line has content a buyer recognises.
- **Why it ranks first:** activation effect is zero (it is post-first-trade),
  the same as every other entry — so the tie-break decides, and this is both
  the cheapest build on the file and the only one that removes a stated
  blocker on the paid tier. It is a port, not a design.
- **Smallest test that could disprove it:** run `weeklyDigest` with
  `mode: "owner"` and `dryRun` against the four production users and count how
  many alert-grade lines the last 30 days of `alerts` rows would have produced
  **per user**. If the median user would receive fewer than one alert a month,
  the watch is not a feature anybody would pay for and the recipient question
  is moot — no code changes, no deploy, reads two existing tables.
- **Kill criterion:** median user under one alert per month → kill, and W6
  becomes "delete the watch from the pricing page" rather than "port it".
  Second kill: if the owner decides the watch stays an operator tool (a
  legitimate answer to decision 8), this entry dies and `features.md` W6
  changes from "NOT YET" to "owner-only".
- **Cost guess:** test ~2 hours, zero production risk. Port ~half a day,
  reusing `weeklyDigest`'s recipient and opt-out code. **Not free:** it is an
  edge-function deploy and touches who receives email, so it needs the owner's
  explicit approval and the staging path per `AGENTS.md`.

### 2. Show the executable exit cost of the option legs, and let the user floor it

- **User problem:** *"I could not close my AMD spread. I watched it for five
  minutes with the price on screen sitting right where I wanted, and nothing
  happened."* — a real user, reported to the owner, quoted in
  `supabase/migrations/0021_order_attempts.sql` and in commit `76fbdeb`.
- **Evidence:**
  - **Support conversation (verified, ours).** The AMD incident. The diagnosis
    in `src/lib/closeWalk.js`: *"The mid on screen looked right the whole time,
    because the mid IS what was on screen; the executable price was never
    within reach."*
  - **Our code, re-read 2026-09-22 — half the problem was solved, at the wrong
    level.** A whole-market universe scan shipped (`_shared/universe.ts`,
    on `main` by 09-09) with a genuine liquidity sieve: price band, a
    shares-traded floor, a **"Quote no wider than (%)"** filter, and a
    capital-per-contract cap (`src/components/scanner/ScannerConfig.jsx`,
    defaults `minVolume: 1000000`, `maxSpreadPct: 1`). Its own comment names
    the exact failure mode this proposal is about: *"an option quoted forty
    cents by two-forty costs a third of its own premium to get into and may not
    be closable on the day it matters."* But `screenUniverse()` measures the
    **share's** quote, not the option's, and it runs **only** when universe is
    `market` — the `top50`, `sp500` and `custom` paths get no sieve at all.
  - **Our code, the gap.** `_shared/optionScan.ts` `scanChain()` still fetches
    `bid` and `ask` for every contract and still puts both on every leg of
    every candidate. `src/components/scanner/ResultsTable.jsx` (renamed from
    `screener/` on 09-14, `8a51f95`) renders **neither**: its columns are #,
    Ticker, Expiry, Structure, Spot, Short Δ, Width, RoR, Credit, Max Risk —
    and "Width" is the *strike distance*, not the quoted spread. Sorts are
    still exactly three (RoR, Credit, Max Risk). There is still no volume,
    open-interest, option-bid/ask or IV filter anywhere in the scan.
  - **Entry is still not the problem.** `buildSetup` prices credit as
    `short.bid − long.ask`. The cost of a wide contract lands entirely on the
    **exit**, and `nextLimit()` walks the close to `ask + $0.05` with no step
    cap.
  - **Verified competitor fact (teardown row E3).** Barchart refuses to display
    any US option with volume < 100 or OI < 500.
  - **Reported competitor fact, new 2026-09-22 (WebSearch; both vendor sites
    are now unfetchable — see `reachable.md`).** Market Chameleon exposes **ATM
    bid-ask spread** as a first-class screener filter, described on its own
    pages as a liquidity measure; Barchart's vertical-spread screeners show
    bid and ask **for each leg** of the spread. Confidence `reported`, and it
    does not carry the proposal on its own — the AMD conversation does.
- **Smallest test — needs no production change.** Run the Scanner from the
  owner's paper account across the S&P 500 preset, capture the candidate
  payload the browser already receives, and compute `(ask − bid)` summed across
  legs for the top 10 by return-on-risk, expressed as a share of the credit.
  Repeat on three different days. Nothing ships; nothing is logged.
- **Kill criterion:** if the summed quoted width on the median top-10 candidate
  is under 15% of the credit, the exit give-up is noise against the trade's own
  economics — kill, and the AMD incident is a close-dialog problem `76fbdeb`
  already fixed. **Second kill, new:** if the shipped `maxSpreadPct` share-quote
  sieve turns out to filter out the wide-option names as a side effect (test it
  on the `market` universe alongside `sp500`), then the option-level column is
  redundant on the path that matters and this becomes "apply the existing sieve
  to the other three universe paths" — a much smaller piece of work.
- **Cost guess:** test ~half a day, zero production risk. Feature (a quoted-width
  column + a "max option quote width" filter field) ~2 days, no new data source.
  An OI floor on top is a further day and needs a new field plumbed from
  `/options/contracts`.
- **Hand-off, not mine:** whether `ask + $0.05` with no step cap is the right
  ceiling is a money-path question for `head-of-trading` / `agent-manager`.

### 3. Index options in the Scanner and the ticket (SPX, XSP, VIX)

- **User problem:** none in a user's words yet. Promoted from `ideas.md` on the
  evidence its own entry named as the trigger ("once Alpaca takes them out of
  paper-only"), which has now arrived.
- **Evidence:**
  - **Verified vendor fact, fetched at source 2026-09-22.**
    `alpaca.markets/blog/alpaca-launches-index-options-via-trading-api`, dated
    **2026-09-02**: *"Today, index options are available for live trading
    through the our Trading API and dashboard! Available indexes include SPX,
    SPXW, VIX, VIXW, DJX, and XSP."* Cash settlement, no early assignment
    (European exercise), and *"certain broad-based index options may receive
    Section 1256 tax treatment… 60% long-term and 40% short-term."*
    `alpaca.markets` is directly fetchable; this is a `verified` row, not a
    search summary.
  - **Our code already knows the roots, on the reading side only.**
    `_shared/tradeReconstruction.ts` carries an explicit cash-settled root list
    — `"SPX", "SPXW", "XSP", "NDX", "NDXP", "RUT", "RUTW", "VIX", "VIXW",
    "DJX", "MRUT", "NANOS"` — added because *"an assigned SPX spread produced a
    100-share 'SPX' lot with the strike as its cost"*. So history reconstructs
    an index spread correctly and the Scanner cannot find one: our universe is
    equities only (`src/lib/sp500.js`, plus `_shared/universe.ts`, which
    screens equity snapshots).
  - **Positioning (own file, Aug 2026 sourcing).** 0DTE reached 24.1% of 2025
    volume, up from 21.5%; `positioning.md` lists "end-of-session assignment
    de-risking" as a real edge and index options remove assignment entirely.
    §1256 is the only tax-shaped reason a wheel or spread trader would move a
    book to a new tool, and it is the broker's own claim, not ours.
- **Smallest test — one request, no code.** Ask Alpaca's option-chain endpoint
  for `SPX` (and `XSP`) on the owner's own paper account with the credentials
  the product already holds, and see whether a chain comes back with quotes. If
  it does, the plumbing question is bounded; if it 403s or returns an empty
  chain, index options need a market-data entitlement we do not have and the
  whole proposal is a spend decision, not a build.
- **Kill criterion:** the chain probe returns no quotes without an additional
  paid data subscription → kill this slot and return the entry to `ideas.md`
  with the price of that subscription attached, because a per-month data cost
  against zero paying users is not a product decision. **Second kill:** if the
  owner does not want the product near cash-settled index products while
  `paper_only` and `demo_mode` are on, kill now — that is a cheaper answer than
  a probe.
- **Cost guess:** probe ~1 hour. Build is the largest item on this file and is
  deliberately not estimated past the probe: the universe, the `pickWing`
  strike geometry, `openPosition`'s preflight and the tax surface all change,
  and two of those are `head-of-trading`'s and `tax-accountant`'s questions.
  Section 1256 in particular goes to **`tax-accountant`** before any copy is
  written — flagged, not investigated.

## Killed

### Probability-of-profit column and sort — killed 2026-09-22

Opened 2026-08-31 (as #3), re-scoped 2026-09-01 (as #2). Killed on evidence
that the thing it would fix is not costing anything.

- **Its user problem was never a user's.** Both prior versions of this entry
  said so in the entry itself: *"(Still constructed. No user has said this.)"*
  Three weeks later that is still true — nothing in `growth/queue/2026-08-29.md`
  or `growth/log.md` asks for probability of profit; the four verified threads
  there ask for **trade tracking that groups spreads** and for **fills on
  spreads**, which is what the product already does.
- **The funnel removed its premise.** The proposal's mechanism was that
  RoR-first ranking fronts the closest-to-the-money candidate and therefore
  stops the *second* trade. With 4 signed up → 4 connected → 4 traded, no user
  has stopped. There is no drop-off for a reordered top 10 to recover.
- **Its own second kill criterion is still armed and unrun.**
  `_shared/optionScan.ts` `impliedVol()` still returns a hard-coded `0.25`
  when the bisection cannot bracket a root — twice, at lines 33 and 36, with no
  marker on the result. Publishing a POP built on that number is exactly what
  `AGENTS.md` forbids ("never return a number without its provenance"). The
  honest version of this proposal was always "give `impliedVol` a provenance
  flag first", which is a different and larger piece of work and has no user
  asking for it.
- **The competitor fact survives the proposal.** Teardown row E4 (Barchart's
  bull-put screener defaults to descending break-even probability and shows
  probability of loss per row) is verified and unchanged. It goes back to
  `ideas.md` attached to the idea, per the rule that a fact outlives the
  proposal built on it.

**Returned to `ideas.md`.** It comes back when a user asks for it in their own
words, or when `impliedVol` gets provenance for some other reason and the
column becomes nearly free.

### `scan_runs` — record what was scanned — killed 2026-09-22

Opened 2026-09-01 (as #3) because no scan is recorded anywhere. **The
observation is still exactly true** — there is no `scan_runs` table (migrations
run to `0054`), `scanEntries/index.ts` and `findEntry/index.ts` still insert
nothing, and `scan_last_used` is still one upserted row per user. It is killed
on its **own stated kill criterion**, which the funnel now answers.

- Its kill criterion: *"if the owner would not act differently on any of the
  three answers, it is measurement for its own sake."* The three answers it
  would buy are shares and rates — "what share of scans use a custom
  universe", "what share of top-10 results are illiquid", "does POP ranking
  change what people trade" — computed over **four users with zero new signups
  in three weeks**. At n=4 every one of those shares is one user's habit with a
  denominator of four, and no owner action turns on it. The instrument would be
  built, deployed, and then read as noise.
- The cheaper substitute exists and needs no migration: there are four users
  and the owner can ask them, and proposal #2's test reads the scan payload
  the browser already receives without storing anything.
- **It was also outranked by its own cost shape.** It is a migration plus an
  all-functions deploy (`_shared` changes force every function to redeploy —
  `AGENTS.md`), needing owner approval and the staging path, to answer
  questions that no longer have a population.

**Returned to `ideas.md`** with an explicit trigger: it comes back the month
signups exceed ~25, when a share computed from scans stops being one person's
afternoon.

## What the gap cost — findings from three weeks unreconciled

Recorded here because the next run should not have to rediscover them.

1. **The daily 20:30 vp-product cadence has not run since 2026-09-04.**
   `docs/product/daily/` holds three files (09-02, 09-03, 09-04) against
   roughly 13 missing weekdays. No files were invented for the gap; this run
   reconciled from `docs/ops/shipped.md` and `git log main` directly. Whether
   that cadence is restored or retired is decision **D2** — `org.md` already
   says "a cadence whose output stops being worth reading gets cut, not
   defended", and three files then silence is not a judgement anybody made.
2. **`docs/ops/shipped.md` is stale against `main`.** Newest entry is
   2026-09-14; `main`'s head is `280e9ce` (2026-09-22). Missing entirely, all
   on `main`: the production close-ticket crash (`b9c2555`, `c835e0f`), the
   crash boundary that replaced a blank page (`c576da7`), the whole 17 Sep
   history-freeze and Analysis-baseline release (`7386f6b`, `0dd5122`,
   `e8787b0`, `294175c`, `a9dbf8b`), and the deploy-auth fix (`2a2287c`). It
   also labels `3ab139a` "(staging)" when that commit is on `main`. Ticketed to
   `docs/ops/queue.md` for `duty-engineer`, whose ledger it is — not fixed
   here.
3. **A killed proposal shipped anyway.** "Universe demand instrumentation" was
   killed on 2026-09-01 and returned to `ideas.md` because nothing could
   measure demand for a wider universe. Within about eight days the **whole
   feature** shipped — `_shared/universe.ts` sweeps every listed US equity
   behind a price/volume/quote-width/capital sieve — without passing through
   this file. That is not a complaint about the shipment (it is good, and it
   closes teardown row E8's gap). It is a finding about the loop: this backlog
   did not inform what got built, so its cap bought ranking discipline and no
   influence. Decision **D3**.
4. **`features.md` was stale on its own file paths**, because `screener/`
   became `scanner/` on 09-14. Re-checked and revised this run.
