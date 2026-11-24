# Product backlog — five slots, no more

Owned by `vp-product`. Ranked by expected effect on **activation** (signup →
broker connected → first trade) divided by effort; ties break toward the
cheaper test. To add a sixth proposal, one of these ships or dies. Kills are
recorded below, as prominently as additions.

Every entry carries: the user problem in the user's words, its evidence, the
smallest test that could disprove it, the kill criterion, and a cost guess.

Last run: **2026-11-24** (vp-product, Tuesday cadence). Previous: 2026-11-17
(merged into this branch with the 16–23 Nov end-of-day notes; none had
reached `main`). Last ranked run on `main`: 2026-09-01.

## Reconciliation — 2026-11-24 (read first)

**What shipped this week (17–24 Nov).** Read from `git log origin/main`,
`git log origin/staging`, `docs/ops/shipped.md` and the daily notes in
`docs/product/daily/` (16–23 Nov, folded in from their session branches).

- **`main`:** blog posts 63–66 (premium capture, annualized return on small
  samples, screener limitations, debit vs credit spread) and SEO edits. **No
  product code.** `_shared/optionScan.ts` and
  `src/components/screener/ResultsTable.jsx` are unchanged on `main`.
- **`staging`:** all in the administrator-only Terminal
  (`src/App.jsx:79`, `LAB && <AdminOnly>`): Playbook phase 1 (plays,
  checklists, R, per-play results; migration 0069), part-share and
  several-account sizing, P/L tab periods, and on 21 Nov a **futures
  practice replay with a prop-style challenge** (`43b7326`…`90e4934`,
  `docs/context/terminal-handoff.md`). Plus one CI fix (metrics push
  retry, PR #22). Nothing for the credit-spread screener or desk.
- **Staging is 1,672 commits ahead of `main`** (1,571 on 17 Nov: +101 in a
  week, all Terminal).
- **Funnel** (`docs/growth/metrics/2026-11-23.json`): 4 signups ever, 0 in 7
  days, 3 connected, 3 traded, 1 live, **0 paying**. Search Console 28 days:
  2 clicks, 446 impressions. Unchanged for three weeks.

| # | Proposal | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Release path: what of staging a stranger can pay for | **Left — and the case got stronger** | Nothing promoted. This week's staging work opened a *third* candidate product (futures practice) beside the credit-spread desk and the stock terminal. `plan-100.md` 31 Dec target: 37 days left, paying 0 |
| 2 | Quoted exit width on scan results | **Left.** Not shipped, not half-shipped | No bid/ask/width in `ResultsTable.jsx` on `main` or `staging`; no change to `optionScan.ts`. Test still unrun (see below) |
| 3 | Probability-of-profit column | **Killed this run** | See Killed |

**Why the width test is still unrun, recorded rather than called blocked.**
Tried to run it from this session on live delayed data:
`cdn.cboe.com/api/global/delayed_quotes` is 403 at CONNECT, and the session
has no Alpaca data key (`.env.production` carries only the OAuth client id).
Logged in `docs/context/reachable.md`. It needs the owner's paper scan (as
the test always said) or an Alpaca paper data key in the scheduled
environment, which would let this run do it unattended.

## Reconciliation — 2026-11-17 (read before the proposals)

**First, a process fault this run found.** The Tuesday runs of 3 Nov
(`origin/claude/youthful-hypatia-s80cvu`, `92cd176`) and 10 Nov
(`origin/claude/youthful-hypatia-ekhtg5`, `0d799aa`), and every weekday
end-of-day run (`magical-bohr-*`), pushed to their own session branches and
**none was merged to `main`**. Each run started from `main`, so each began
from the 1 Sep backlog: 3 Nov killed `scan_runs` and opened a release
proposal; 10 Nov, not seeing that, kept `scan_runs` open and opened nothing.
This file folds both in and is the current state. Unless product docs get a
merge path (as content has), next Tuesday will repeat it — owner decision 1
in the email.

**What shipped this week (10–17 Nov).** Read from `git log origin/main`,
`origin/staging:docs/ops/shipped.md` and the end-of-day notes on the
branches above.

- **`main`:** blog posts 55–63 and SEO edits only. The last commit to
  `src/` or `supabase/functions/` on `main` that changed product behaviour
  predates October; `optionScan.ts` and `ResultsTable.jsx` on `main` are
  what the 1 Sep run read.
- **`staging`:** 19 shipped lines dated 8–16 Nov. Fifteen are the
  administrator-only trading terminal (`/terminal`, behind `AdminOnly` and
  the `LAB` flag, `src/App.jsx:79`): gamma screens, overnight hotkeys, the
  P/L tab, self-test tooling. Two touch the credit-spread product a user
  could buy: a covered call partly backed by a long call no longer shows the
  shares' break-even (`f10088f`), and option-chain days-to-expiry count on
  New York's calendar (`944798c`). Both are correctness fixes on staging,
  not on `main`.
- **Staging is 1,571 commits ahead of `main`** (was ~1,416 on 5 Nov).

**Funnel** (`docs/growth/metrics/2026-11-16.json`): 4 signed up ever, 0 in the
last 7 days, 3 connected, 3 traded, 1 traded live, **0 paying**. Search
Console 28 days: 2 clicks, 418 impressions. Unchanged since 2 Nov.

Proposal by proposal:

| # | Proposal | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Release path: what of staging a stranger can pay for | **Left** (opened 3 Nov on an unmerged branch; carried here) | Nothing promoted from staging this week; billing still hidden (`billing_visible`, 3 Sep). Staging gap grew by ~155 commits in 12 days, almost all admin-only |
| 2 | Quoted exit width on scan results | **Left.** Not shipped, not half-shipped | `git diff origin/main origin/staging -- _shared/optionScan.ts` is empty; the only `ResultsTable.jsx` change hides the Trade button for read-only accounts. No width, bid or ask column on either branch. `wideQuote()` (`src/lib/holdingStrategies.js`, staging) flags wide quotes on the held-position Protect/Repair dialog only — the after-fill half, not the scan half |
| 3 | Probability-of-profit column | **Left** | No POP in `src/` or `optionScan.ts` on either branch; `impliedVol()` still falls back to a silent `0.25` (`optionScan.ts:31-33`, staging) |
| — | Record what was scanned (`scan_runs`) | **Killed** (3 Nov kill confirmed) | See Killed. Four users ever; a scan log has no denominator |

End-of-day reconciliation **2026-11-16**: nothing shipped against #1–#3. Today's only product change (staging, admin-only terminal P/L tab, `6075269`/`cc6d59c`) touches none of them; `ResultsTable.jsx` still renders no width or POP, and no `scan_runs` table exists on `main` or `staging`. No status changes.

Daily reconciliation **2026-11-18**: no proposal moved. `main` took one blog
post; `staging` took admin-only Terminal work (std dev channel on chart and
Scanner, part-share and percent hotkeys, several-account sizing) and a brand
tidy-up. None touches #1 (no bid/ask width shown in `ResultsTable.jsx`), #2
(no probability column; `optionScan.ts` still ranks by return on risk only)
or #3 (no `scan_runs` table on `main` or `staging`). Evidence:
`git grep scan_runs origin/staging` empty.

Daily reconcile 2026-11-20: nothing shipped against #1–#3. Today's shipments
(Terminal Playbook phase 1, % of equity sizing, overnight holiday clock, folded
P/L notes) are all staging-only and all in the Terminal, which no proposal
covers. The scan is still not recorded (#3 open); the screener still has no width
or POP column (#1, #2 open). This backlog has not had a Tuesday run since
2026-09-01.

## Open proposals

**As of 2026-11-24: two of five slots used** (#1 release path, #2 quoted
width). #3 killed below. No addition: `docs/product/research/` still holds
only its README, `growth/queue/` has had nothing since 29 Aug, and the funnel
has not moved, so nothing carries the evidence a third slot needs.

*17 Nov text:* **Three of five slots used.** No addition: nothing new in funnel data,
support or the owner's research folder (`docs/product/research/` holds only
its README) supports a fourth, and any user-facing feature reaches a user only through #1
anyway. No teardown this run — Tiblio, the one that matters, is still
unreachable (`reachable.md`, retested today).

Ranking note: #1 scores on activation because nothing on staging can count
toward "first trade" or "paying" until it reaches `main`; #2 and #3 are
cheap offline tests that need no release, so they keep their places.

### 1. Decide what part of staging becomes the product people can pay for — and release it

- **User problem:** none in a user's words; four users exist. This is a gap
  in our own pipeline. The last step of activation — a live account, paying —
  cannot happen on code that is not on `main`, and billing is not visible.
- **Evidence — our repo, read 2026-11-17:** staging 1,571 commits ahead of
  `main`; this week 15 of 19 staging lines are the admin-only terminal, a
  stock day-trading tool that serves a different customer from the
  credit-spread trader the positioning, pricing and blog are written for.
  Two fixes this week (`f10088f` break-even, `944798c` DTE) correct numbers
  a Live subscriber would see, and they sit unreleased. `plan-100.md`
  targets 100 paying users by 31 Dec; 44 days remain, paying = 0.
  `docs/ops/queue.md` on staging carries open head-of-trading findings
  against the terminal, so "release all of staging" is not free.
- **Added 2026-11-24.** This week staging gained a futures practice replay
  with a prop-style evaluation challenge (`43b7326`…`90e4934`) and a trade
  Playbook/journal (`1117b68`…). That is three candidate products on one
  branch: the credit-spread desk (what `positioning.md`, `pricing.md`, the
  homepage and 66 blog posts sell), the stock day-trading terminal, and
  futures practice. Each faces a different competitor set (spread screeners;
  trading terminals and journals such as Tradervue/TraderSync; prop-firm
  evaluation simulators) and none of the latter two has a teardown, a price,
  or a user quote in `growth/queue/`. The decision is therefore no longer
  only *when* to release, but *which one is the product* — the backlog,
  pricing and positioning can only be ranked against one.
- **Smallest test:** the owner names the one thing a stranger can do on day
  one of Live (the credit-spread desk as it stands, with this week's two
  fixes; or the terminal), and agent-manager gates *that* scope. A scoping
  decision; no build.
- **Kill criterion:** the owner prefers to keep building on staging — then
  kill this and move the 31 Dec date in `plan-100.md` to one with a release
  in front of it. Either is a decision; drifting is not.
- **Cost guess:** the decision, an hour. Release verification is
  agent-manager's gate.

### 2. Show the executable exit cost on scan results (quoted width), and let the user floor it

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
  assumed a scan log. There isn't one, and the log proposal is now killed.)*
- **Kill criterion:** if the summed quoted width on the median top-10
  candidate is under 15% of the credit, the exit give-up is noise against the
  trade's own economics and the column earns nothing — kill, and the AMD
  incident is a close-dialog problem that `76fbdeb` already fixed.
- **Cost guess:** test ~half a day, zero production risk. Feature (width
  column + "max width" filter field + the top-10 sort unchanged) ~2 days, no
  new data source. An OI floor on top of that is a further day and *does*
  need a new field plumbed from `/options/contracts`; propose it only if the
  width test comes back positive and width alone proves insufficient.
- **Note carried from the 10 Nov end-of-day run (unmerged branch).** On
  staging, the admin terminal reads open interest from Cboe's delayed-quotes
  file (`8b12742`, `_shared/openInterest.ts`) because Alpaca's contract OI is
  two sessions stale in the morning, and that file is personal-use only.
  So an OI floor has no clean source for paying users; width-first stands.
- **Hand-off, not mine:** whether `ask + $0.05` with no step cap is the right
  ceiling is a money-path question for `head-of-trading` / `agent-manager`,
  not a product one. Flagged, not investigated.

## Killed

### Probability-of-profit column and sort — killed 2026-11-24

Its user problem was constructed and labelled so ("No user has said this").
Twelve weeks later still nobody has: `growth/queue/` holds one file
(2026-08-29) with no mention of probability, and the funnel has four users,
none new in three weeks. Its only evidence is a competitor behaviour
(teardown E4, Barchart sorts by probability) — which also means it is
available free elsewhere, the "commodity" verdict `positioning.md` already
gives screening. Its second kill criterion (`impliedVol()`'s silent `0.25`
fallback) was never cleared, so the column could not ship without a
provenance fix first. And it cannot reach a user before #1 is decided.
A slot held by an idea with no user and no runnable test is the thing the cap
exists to stop. **Returned to `ideas.md`** with E4 attached; it comes back if a
user asks for it in their own words, or if #2's captured payload (same data)
shows POP reranking the top 10 materially.

### Record what was scanned (`scan_runs`) — killed 2026-11-03, confirmed 2026-11-17

Its own kill criterion: "if the owner would not act differently on any of
the three answers, kill it." The 3 Nov run killed it on a branch that never
reached `main`; this run confirms it with this week's numbers. The funnel
holds **four signups ever, none in the last seven days**
(`docs/growth/metrics/2026-11-16.json`), and billing is not open. A scan log
on that base is the trap that killed universe instrumentation: no
denominator, no time dimension. Proposals #2 and #3 are tested offline from
the payload the browser already receives and do not need it. Revisit only
if a screener decision needs usage data and there are enough users for it to
mean something. The proposal text is in git history (`main`, this file
before 2026-11-17).


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
needs was the `scan_runs` proposal (itself killed 2026-11-03), which was ranked on its own merits rather than
smuggled in as somebody else's test.

**Returned to `ideas.md`** ("Expand scan universe beyond the S&P 500 list"),
where it keeps the verified competitor fact E8 attached to it. It comes back
to this file when either a scan log ships and the number clears the bar, or a
user says it in their own words in `growth/queue/`.
