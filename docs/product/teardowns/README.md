# The competitive teardown standard

The bar: what a PM at Stripe or Amazon would put in front of a room.
"Barchart has a scanner" is not a finding. What the scanner *does*, parameter
by parameter, against what our code does, is.

One file per study: `<competitor>-<capability>.md`. Five parts, in order.

## 1. Capability inventory

The feature decomposed, not described. For a scanner: every filter it exposes
and its range; every output column; the universe it scans; result limits; data
freshness (live / 15-minute / EOD); the ranking metric; whether a result can
be acted on or only looked at; alerting; export; and which price tier each of
those sits behind.

## 2. Evidence table

One row per claim: the claim, its source, and its confidence —

- `verified` — a screenshot (ours via Playwright, or the owner's in
  `../research/`), the vendor's own docs or pricing page, a demo video
- `reported` — a review site, forum comment, third-party writeup
- `inferred` — and inferred from what

**A claim with no row does not enter the comparison.** Where the decisive
evidence would be a screen we cannot reach (behind a login or paywall), name
the exact screen and ask the owner for one screenshot.

## 3. Our side, from our code

Never from memory, never from our own marketing. Read the modules that
implement the capability and enumerate what they actually do — filters,
ranking, universe, limits — **including what we do not have**. For the
scanner: `supabase/functions/_shared/optionScan.ts`,
`supabase/functions/scanEntries/`, `supabase/functions/findEntry/`,
`src/pages/Screener.jsx`, `src/lib/scanPresets.js`, `src/lib/sp500.js`.

## 4. Parameter-level matrix

Their row against ours, one verdict per line, stated as the **user
consequence** — never a tick. "They scan the full optionable universe; we scan
the S&P 500 list in `sp500.js` — a trader hunting IV in small caps gets
nothing from us."

## 5. So what

At most **three** proposals into `../backlog.md`, each citing the evidence row
it rests on, the smallest test, and its kill criterion. A teardown that
generates ten ideas has failed the discipline, not demonstrated diligence.

## Closing, always

**What could not be verified, and what would settle it.** Silence about a gap
reads as clearance — the same rule agent-manager enforces on releases.
