# Barchart options screener vs our scanner

Study date: 2026-08-31. Author: vp-product.

Research route: `barchart.com` and `www.barchart.com` are both EGRESS_BLOCKED
at the proxy (recorded in `docs/context/reachable.md`, with the workaround).
Every Barchart fact below therefore came through WebSearch, which returns page
substance from Barchart's own pages and from third-party reviews. Confidence
is graded accordingly in the evidence table; the two claims only a screenshot
would settle are named in the closing section, with exact filenames for the
owner's drop-box.

## 1. Capability inventory (Barchart)

Decomposed from the evidence rows in part 2 — a claim without a row is not
listed.

**Screeners offered.** A generic options screener plus dedicated
strategy screeners: long call/put, covered calls, naked puts, the four
vertical spreads (bull put, bull call, bear put, bear call), long and short
iron condors, condor and butterfly variants. Each strategy screener builds
multi-leg candidates itself; the user does not assemble legs. [E1]

**Filters.** Generic screener: delta, days-to-expiration, volume, open
interest — each with greater-than / less-than / between operators. Premier
members can add or remove filters from a larger library that extends past
option fields into stock and company data (financials, technicals) and can
reorder them. [E2] Baseline hygiene floors applied before anything else:
US options must have volume ≥ 100 and open interest ≥ 500 (Canada: 5 / 25).
[E3] Bull-put default view: short-leg delta < 0.60, long-leg delta < 0.30,
risk/reward between 2 and 5. [E4]

**Ranking / output.** Bull-put results ship sorted by descending
**break-even probability**; columns include the legs, max profit, max loss,
probability of loss, break-even and max-risk probability, net delta,
moneyness, and a "Max Annualized Return" figure computed as
`(((MaxProfit/(StrikeDiff−MaxProfit))/DTE)×365)×100`. Three result views:
Main (volume/OI), Dividend & Earnings, and a Filter view showing whatever
fields the user added. [E4][E11]

**Earnings awareness.** A "Flag Earnings" checkbox adds a green "E" icon on
rows where the underlying's next earnings date falls on or before the
option's expiration. Flag, not filter. [E9]

**Universe.** Optionable US and Canadian stocks, ETFs, and indices (e.g.
$SPX has its own vertical-spread pages) — the whole optionable list, not a
curated subset. Exact instrument count unverified. [E8]

**Freshness.** Options data is delayed — Barchart's own pages state both
"minimum 15 minutes, updated continuously" and "approximately 25–30 minutes,
updated approximately every 5 minutes" in different places. Either way: not
live, and no real-time options data on the free site. [E5]

**Actionability.** The screener shows setups; it does not route equity
options orders. Barchart Trader (a separate futures platform) integrates
futures brokers only. Inferred, not verified — see closing. [E10]

**Export / alerting.** CSV download of up to 1,000 results; automatic
screener emails (top 10/25/50, optional CSV) at 12:00pm, 3:00pm and 4:45pm
CT weekdays — Premier only. [E7]

**Price tiers.** Options screeners sit behind Premier, reported at
$29.95/month in 2026 (Plus at $9.99/month excludes all options tools). Free
accounts are capped at 5 saved screeners / watchlists / custom views;
Premier is unlimited. Exact current price is a reported figure — screenshot
requested. [E6][E7]

## 2. Evidence table

| # | Claim | Source | Confidence |
| --- | --- | --- | --- |
| E1 | Barchart runs a generic options screener plus dedicated strategy screeners incl. bull put spread, bull/bear call & put verticals, long/short iron condors, naked puts, long calls | Barchart's own pages surfaced via WebSearch: barchart.com/options/options-screener, /options/vertical-spreads/bull-put-spread, /options/condor-strategies/short-iron-condor, /options/income-strategies/naked-puts, /options/long-call-options-screener | verified (vendor pages, via WebSearch) |
| E2 | Generic screener filters: delta, DTE, volume, OI with >/</between operators; Premier can add filters from a wider library incl. stock financials and technicals, and reorder them | Barchart education pages (barchart.com/education/site-features/premier-advOptions and screener help) via WebSearch | verified (vendor docs, via WebSearch) |
| E3 | Hygiene floors: US options screened only if volume ≥ 100 and OI ≥ 500 (Canada 5 / 25) | Barchart screener education page via WebSearch | verified (vendor docs, via WebSearch) |
| E4 | Bull-put screener default view: short delta < 0.6, long delta < 0.3, risk/reward 2–5; default sort = descending break-even probability; columns incl. max profit/loss, probability of loss, break-even & max-risk probabilities, net delta, moneyness, Max Annualized Return (formula published) | barchart.com/options/vertical-spreads/bull-put-spread page content via WebSearch | verified (vendor page, via WebSearch) |
| E5 | Options data delayed (one vendor page: min 15 min, continuous updates; another: ~25–30 min, ~5-min update cycle); no real-time options on the free site | Barchart FAQ/help pages via WebSearch — the two numbers are the vendor's own inconsistency | verified (vendor docs, via WebSearch); exact delay ambiguous |
| E6 | Options screeners are Premier-only; Premier reported at $29.95/mo, Plus $9.99/mo without options tools | Third-party 2026 reviews (purepowerpicks.com, bullishbears.com, comparebestai.com) via WebSearch; Premier-gating corroborated by Barchart's own education pages ("Barchart Premier subscribers can add or modify different filters") | price: reported; Premier-gating: verified |
| E7 | CSV export up to 1,000 rows; automatic screener emails (top 10/25/50 + optional CSV) at 12:00pm/3:00pm/4:45pm CT, Premier only; free accounts capped at 5 saved screeners/watchlists/views | Barchart education pages via WebSearch | verified (vendor docs, via WebSearch) |
| E8 | Universe: optionable US + Canadian stocks, ETFs and indices ($SPX and per-ticker spread pages exist); i.e. the full optionable list, thousands of underlyings | Vendor pages via WebSearch (stocks-by-sector optionable list, $SPX vertical-spread pages, ETF coverage in condor docs); exact count not found | verified for breadth; count inferred |
| E9 | "Flag Earnings" checkbox marks rows where next earnings ≤ expiration with a green E icon | Barchart bull-put screener page via WebSearch | verified (vendor page, via WebSearch) |
| E10 | Screener results are not routable to an equity-options broker from Barchart's site; Barchart Trader integrates ~50 futures brokers, futures only | Barchart Trader help pages + broker pages (ampfutures, cannontrading) via WebSearch describe futures routing only; absence of an equities path is inferred from no vendor page describing one | inferred — from futures-only trading docs |
| E11 | Results pages have three views (Main: volume/OI; Dividend & Earnings; Filter view of user-added fields) | Barchart screener education via WebSearch | verified (vendor docs, via WebSearch) |

## 3. Our side, from our code

Read on 2026-08-31: `supabase/functions/_shared/optionScan.ts`,
`supabase/functions/scanEntries/index.ts`,
`supabase/functions/findEntry/index.ts`, `src/pages/Screener.jsx`,
`src/lib/scanPresets.js`, `src/lib/sp500.js`, plus the components Screener
renders: `src/components/screener/ScreenerConfig.jsx`,
`useMarketScan.js`, `ResultsTable.jsx`.

**Strategies.** Exactly three: `put_spread`, `call_spread`, `iron_condor`
(whitelisted in `scanEntries/index.ts` and `findEntry/index.ts`). Condors
accept put/call ratios ≥ 1. Nothing else — no debit spreads, covered calls,
naked options, butterflies, calendars.

**Universe.** Three choices in `Screener.jsx`: `TOP50` (50 mega caps),
`SP500` (~500 names, dot-class shares omitted), or a custom comma-separated
list — both lists hardcoded in `src/lib/sp500.js`. No ETFs or indices in the
built-in lists (no SPY, QQQ, IWM); a user can only reach them by typing
tickers. Strikes are fetched only within ±20% of spot (`scanChain`).

**Filters exposed** (`ScreenerConfig.jsx`, defaults in
`SCREENER_DEFAULTS`): DTE min/max (0–5), short-delta band (0.12–0.22,
swept at 0.01), wing width min/max ($1–$3, swept at $0.50, **exact-match
enforced** — a chain without a strike at the requested distance is a skip,
never a wider spread), min credit ($0.20), max risk per unit (optional),
min return-on-risk % (client-side post-filter, default 15), condor ratios.

**What we do not have:** no volume filter, no open-interest filter, no
bid/ask-spread filter, no IV or IV-rank filter, no probability metric, no
moneyness filter, no stock fundamentals/technicals, no annualized-return
figure, no result export, no scheduled scans, no screener emails or alerts.

**Ranking.** One metric: `returnOnRisk = credit×100 / maxRisk`, descending
(`scanCandidates`). The client can re-sort by RoR, credit, or max risk only
(`ResultsTable.jsx`).

**Limits.** Server returns top 25 per call; the client sweeps in batches of
4 tickers and caps the merged, deduped list at 100 (`useMarketScan.js`).

**Freshness and integrity** — where our code is strongest:
- Live quotes at scan time from the user's own Alpaca account; spot carries
  provenance (`{price, source, asOf, trusted}`) and an untrusted spot is a
  refusal, not a number (`spotOrReason`).
- Put-call parity cross-checks spot against the option chain itself when
  both chains are in hand; divergence rejects the scan
  (`impliedSpotFromParity`).
- An ITM short leg is refused (`itmShortReason`); credit > width is refused
  as a stale quote (`validate`).
- Every skipped ticker returns its reasons instead of vanishing.

**Actionability.** Every result row has a Trade button opening
`TradeDialog`; `openPosition` re-checks spot and short strikes at submit and
409s if the market moved. Scan → order in one flow, on the user's own
account.

**Earnings.** `scanEntries` annotates (never filters) each candidate whose
underlying reports on or before expiry, with date, session, and days away;
`ResultsTable` shows the warning.

**Persistence.** Named per-user presets and last-used config per scanner
(`scanPresets.js`), RLS-scoped. No cap in code. No export of results.

## 4. Parameter-level matrix

Every line cites its evidence row(s); our side cites the file.

| Dimension | Barchart | Us | User consequence |
| --- | --- | --- | --- |
| Universe | Full optionable US+Canada list, ETFs and indices [E8] | S&P 500 lists or hand-typed tickers (`sp500.js`, `Screener.jsx`) | A trader hunting premium in SPY, QQQ, small caps or Canadian names gets nothing from our built-in scan; they must already know the ticker and type it — which defeats the point of a screener for discovery |
| Liquidity screening | Volume ≥ 100 and OI ≥ 500 enforced before anything shows [E3] | No volume or OI filter anywhere (`optionScan.ts` filters only on price fields) | Our top-ranked row can be a spread whose legs barely trade; a new user's *first* order can sit unfilled or fill far from mid — the worst possible first-trade experience, and invisible in our UI because we never show volume or OI |
| Ranking metric | Default sort: break-even **probability**, descending; probability-of-loss shown per row [E4] | Single metric: return on risk, descending (`scanCandidates`) | Our default top row is structurally the riskiest candidate in the sweep (highest credit per dollar of risk = closest to the money); a newcomer who trusts row 1 systematically takes the lowest-probability trades. Barchart's user sees odds first, payoff second |
| Strategy coverage | ~15+ strategy screeners incl. covered calls, naked puts, all four verticals, condors, butterflies [E1] | 3 strategies: put/call credit spreads and iron condors (`scanEntries`) | A covered-call or debit-spread trader cannot use our screener at all; within defined-risk credit strategies, we cover the core |
| Filter depth | Delta/DTE/volume/OI plus a Premier library reaching into fundamentals and technicals [E2] | Tight risk-parameter set: DTE, delta band, exact width, credit, max risk, RoR (`ScreenerConfig.jsx`) | A trader who screens "IV rank > 50, price > $20, above 200-day" has no way to express any of it with us; a trader who thinks in delta-band credit-spread terms gets a more direct tool from us than Barchart's generic form |
| Width handling | Strike-difference is an output/filter; nothing suggests exact-width enforcement [E4] | Requested width is exact or the ticker is skipped, with the reason (`pickWing`, `WIDTH_EPSILON`) | Our user never gets a $2.50 spread when they asked for $1 (2.5× the max risk); that silent substitution is exactly what generic screeners permit |
| Data freshness | Delayed 15–30 min, ~5-min refresh; no real-time options on free site [E5] | Live Alpaca quotes at scan time; provenance-checked spot; parity cross-check; re-check at submit (`optionScan.ts`, `openPosition`) | Barchart's user prices a credit off quotes up to half an hour old and discovers the real market at their broker; our user's numbers are the market, and a moved market is a refusal, not a bad fill |
| Acting on a result | Look only; no equity-options routing from the screener [E10, inferred] | Trade button → order on the user's own account, re-validated at submit (`ResultsTable.jsx`, `TradeDialog`) | Barchart's user re-keys four legs into a broker by hand — every re-key a chance to fat-finger a strike; ours goes from row to routed order in one dialog. This is our single biggest advantage and it is activation itself |
| Earnings risk | Flag on request (checkbox) [E9] | Always annotated, never filtered (`scanEntries`) | Parity in substance; ours is on by default, so a user cannot forget to check the box before selling a spread through an earnings print |
| Alerting / scheduling | Screener emails 3×/day with top 10/25/50 + CSV, Premier [E7] | Nothing — a scan exists only while the user watches it (`useMarketScan.js`) | Their user gets candidate trades pushed to their inbox at midday and close; ours must remember to open the app and press Scan — for a daily-income workflow that difference is daily |
| Export | CSV up to 1,000 rows [E7] | None (`ResultsTable.jsx` renders only) | A spreadsheet-driven trader (journaling, backtesting) cannot get our results out except by hand |
| Result depth | 1,000 rows exportable; paginated views [E7][E11] | Top 25 per batch, 100 overall (`scanCandidates`, `useMarketScan.js`) | Barchart supports market-wide research sessions; we hand back a shortlist. For "give me tradable candidates now" 100 is plenty; for research it is a wall |
| Saved setups | 5 saved screeners free, unlimited Premier [E7] | Unlimited named presets, free (`scanPresets.js`) | Our user never hits a save cap; Barchart's free user hits it at 5 |
| Price of entry | Screener behind Premier, reported $29.95/mo [E6] | Included in the product | A defined-risk options screener that also executes, at anything under $30/mo, undercuts the incumbent's screener-only price — pricing input, held for `pricing.md` when our packaging moves |

## 5. So what — three proposals, fed to the backlog

Fed to `../backlog.md` (empty before this run; 3 of 5 slots now used).
Ranked by expected activation effect ÷ effort.

1. **Liquidity floor on scan results (OI/volume).** Rests on E3 + the
   absence of any liquidity field in `optionScan.ts`. Barchart refuses to
   show a contract with OI < 500; we happily rank one first. Smallest test:
   log OI (already returned by Alpaca's contracts endpoint) for one week of
   scans and measure what share of top-10 results would fail Barchart's
   floors. Kill: under 10%, the problem is theoretical — kill it.

2. **Universe demand instrumentation.** Rests on E8 + the waiting
   `ideas.md` entry ("Expand scan universe"). Before building anything,
   query `scan_last_used` for how many scans choose `custom` or type
   non-S&P-500 tickers. Kill: under 10% of scans over a month, expansion
   stays in `ideas.md` and this slot frees up.

3. **Probability column and sort.** Rests on E4. Barchart leads with
   break-even probability; our only sort is return-on-risk, which fronts
   the riskiest candidates. We already back-solve IV per contract, so POP
   costs no new data. Smallest test: compute POP offline for a week of scan
   logs; if POP-ranking reorders the RoR top-10 by less than two positions
   on average, the column adds nothing — kill.

Not proposed, deliberately: screener emails (retention, not activation — and
`positionWatch` alerting already waits in `ideas.md`), CSV export (no user
evidence), strategy expansion (debit spreads already in `ideas.md` awaiting
evidence). A teardown that generates ten ideas has failed the discipline.

## What could not be verified, and what would settle it

- **Barchart's full Premier filter list for the bull-put screener** (the
  SET FILTERS tab). WebSearch surfaces categories, not the enumerated list.
  Settled by one owner screenshot of
  `www.barchart.com/options/vertical-spreads/bull-put-spread` with the SET
  FILTERS tab open on a Premier account →
  `docs/product/research/barchart-bull-put-screener-filters.png`.
- **Current Premier price.** $29.95/mo is from 2026 third-party reviews
  (E6), not Barchart's own pricing page (site unreachable — see
  `docs/context/reachable.md`). Settled by one screenshot of Barchart's
  pricing/subscribe page →
  `docs/product/research/barchart-premier-pricing.png`. Needed before any
  `pricing.md` move leans on the number.
- **Exact options-data delay** — Barchart's own pages say both "15 min"
  and "25–30 min" (E5). The matrix verdict survives either number, so no
  action needed; noted so the ambiguity is on record.
- **Whether any Barchart surface routes an equity-options order** (E10 is
  inferred from futures-only Trader docs). Settled by the same Premier
  screenshot — if a route-to-broker button exists on the results page it
  will be on it. If one exists, the "Acting on a result" verdict weakens
  and must be revisited.
- **Universe count** (how many optionable underlyings Barchart actually
  sweeps). Breadth is verified, the number is not; nothing in the matrix
  depends on the number.
