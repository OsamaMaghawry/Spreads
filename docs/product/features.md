# Every feature, and what it is worth — 2026-09-02, **re-checked 2026-09-22**

Owned by `vp-product`. Originally read from the code on `main` at `3a22207`.
**Re-checked against `main` at `280e9ce` (2026-09-22)**: rows that changed are
marked `↑2026-09-22`, and the file-path columns were wrong throughout because
`src/components/screener/` became `src/components/scanner/` and
`src/pages/Screener.jsx` became `src/pages/Scanner.jsx` on 14 Sep (`8a51f95`).
This is the inventory the pricing page, the Alpaca fee schedule and the Tuesday
product run read. Categories use the canonical names in
`docs/context/brand.md`.

Calls: **FREE** — needed for activation or trust, never gated. **PAID on
live** — worth money, gated by the live-account line. **NOT YET** — built
but not sellable as it stands, with the reason. **owner-only** — exists,
admin-gated, not a product.

Two things found on the original walk that outrank the table: the published
pricing page (Paper $0 / Pro $39 / Desk $99) was false against the code on seven
rows, and the watch on `main` threw on every account (fixed the same day,
`a7db799`).

**The three things the 2026-09-22 re-check found that outrank the table:**

1. **The whole Live column is administratively switched off.** `paper_only`
   (migration `0040`, 12 Sep, **seeded ON**) excludes every live account from
   `syncTrades`, `equityHistory`, `positionWatch` and `weeklyDigest`, and
   `demo_mode` (`0035`, also ON) makes `openPosition` refuse any order on a live
   account. Every row below marked "PAID on live" is, today, reachable by nobody.
   That is deliberate — the owner: *"I don't want live accounts. I want the
   paper accounts inside the production"* — but it means this file describes a
   product whose paid half is dormant. See `pricing.md` decision 10.
2. **Billing shipped.** Stripe checkout, portal, a `subscriptions` table written
   only by the webhook, and `_shared/entitlement.ts` gating exactly one thing
   (opening a position on a live account). Two switches, both off:
   `billing_visible` (can a plan be bought), `billing_enforced` (is one
   required). New section below.
3. **The pricing page is off the site** (12 Sep, owner's instruction). Nothing
   in this inventory is being sold to anyone.

## Scanner

Renamed from "Screener" on 14 Sep — nav, headings and copy — and to **Strategy
Scanner** rather than Market Scanner, because two of its six strategies sweep
the account's own held shares rather than the market.

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| S1 | Sweep a universe for credit setups, four tickers a batch, results streaming in ranked | `src/pages/Scanner.jsx`, `scanner/useMarketScan.js`, `scanEntries/index.ts`, `_shared/optionScan.ts` | main | FREE `↑2026-09-22` paths |
| S2 | Universe: top 50 mega caps, ~500 S&P names, **every listed US equity**, or a custom list. Still no ETFs and no indices | `src/lib/sp500.js`, `_shared/universe.ts`, `scanner/ScannerConfig.jsx` | main | FREE `↑2026-09-22` **changed** |
| S2b | **NEW** — the whole-market sieve that makes S2's third option finishable: one cheap snapshot per hundred names, and only survivors get a chain. Filters: share price at most / at least, shares traded today at least (default 1,000,000), **share quote no wider than %** (default 1), capital per contract at most % of account equity | `scanUniverse/index.ts`, `_shared/universe.ts` `screenUniverse()`, `ScannerConfig.jsx`; called only when universe is `market` (`Scanner.jsx`) | main | FREE `↑2026-09-22` **new row** |
| S3 | Five strategies — put spread, call spread, iron condor, cash-secured put, covered call — and a Wheel scan that runs the last two together; covered calls scan the shares the account holds at their cost basis | `scanEntries`, `findEntry`, `_shared/optionScan.ts` `buildSingle()`, `_shared/heldShares.ts`, `open/StrategyPicker.jsx` | **main** | FREE `↑2026-09-22` was staging |
| S4 | Filters: DTE, short delta, wing width, min credit, max risk per unit, min return on risk, put/call ratio. **Still no option volume, OI, option bid-ask or IV filter** — S2b's volume and quote-width floors are on the *share*, not the contract, and run only on the `market` universe | `ScannerConfig.jsx`, `ScanFilters.jsx` | main | FREE `↑2026-09-22` clarified |
| S5 | Exact wing width or skip — never a wider spread than asked | `optionScan.ts` `pickWing()` | main | FREE |
| S6 | One ranking metric, return on risk, top 25; client re-sort by RoR / credit / max risk — **still exactly three sorts, and no probability column**. Columns: #, Ticker, Expiry, Structure, Spot, Short Δ, Width (strike distance), RoR, Credit, Max Risk. **Every leg carries `bid` and `ask` and neither is rendered** | `optionScan.ts`, `scanner/ResultsTable.jsx` | main | FREE — backlog #2 |
| S7 | Credit priced at short bid minus long ask — the executable side, not the mid | `optionScan.ts` | main | FREE (what makes free trustworthy) |
| S8 | Spot-price trust ladder: trade print leads, quote corroborates, weaker is refused | `_shared/marketPrice.ts` | main | FREE |
| S9 | Put-call parity check refuses a chain implying a spot more than 1 % off the feed | `optionScan.ts` `impliedSpotFromParity()` | main | FREE |
| S10 | Every skipped ticker says why | `optionScan.ts` | main | FREE |
| S11 | Earnings-before-expiry flag on every candidate, a fact not a filter | `_shared/earnings.ts`, `common/EarningsWarning.jsx` | main | FREE |
| S12 | Named presets and "last scan" restore | `src/lib/scanPresets.js`, `ScanPresets.jsx` | main | FREE |
| S13 | Continuous scan loop, retry every 20 s, audible alert on a hit | `open/useScanLoop.js`, `src/lib/beep.js` | main | FREE — the old page sold it as Pro-only |
| S14 | *Absent:* no scan is recorded anywhere. Re-checked 2026-09-22: still true — no `scan_runs` table (migrations run to `0054`), `scanEntries` and `findEntry` insert nothing, `scan_last_used` is one upserted row per user | — | — | **killed from the backlog 2026-09-22** at n=4 users; in `ideas.md` with a trigger |
| S15 | *Constraint:* the Scanner needs a connected account for market data | `Scanner.jsx` | main | shapes the funnel: connect is step one |
| S16 | *Absent:* index and cash-settled products cannot be scanned or traded, although `_shared/tradeReconstruction.ts` already knows twelve cash-settled roots (SPX, SPXW, XSP, NDX, RUT, VIX, DJX…) on the history side. Alpaca turned on **live** index options 2026-09-02 | `src/lib/sp500.js`, `_shared/universe.ts` (equities only) | — | **backlog #3** `↑2026-09-22` **new row** |

## Trading

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| T1 | Trade a ranked row directly, or build a setup by hand — spreads, condors, and now a single short put or a covered call sent as a plain option order under the wheel prefix. A Condor opens 1:1 by default in the Open Position ticket too, not a silent 2:1 | `scanner/ResultsTable.jsx`, `scanner/TradeDialog.jsx`, `open/OpenPositionDialog.jsx`, `openPosition/index.ts` | **main** | PAID on live `↑2026-09-22` was staging |
| T1b | **NEW** — every strike on an underlying's full chain is tradeable from its own page: all expiries including LEAPS, legs picked across different expiries, a priced payoff curve for calendar structures (Black-Scholes), unbounded downside refused a false $0.00 max risk, GTC offered, stale-quote and after-hours warnings that reach the ticket with "Send it anyway" | `src/pages/OptionChain.jsx`, `openPosition/index.ts` | main | PAID on live `↑2026-09-22` **new row** |
| T1c | **NEW** — any order, open or close, can be parked and reopened in the real ticket; a Saved tab that refreshes; the button hidden on an order we would refuse; the saved ticket stores the setup itself, so reopening shows real strikes, deltas, credit and risk instead of "No ceiling" and "Delta NaN" | `_shared/savedOrders`, migrations `0051`–`0053` | main | FREE `↑2026-09-22` **new row** |
| T2 | Server preflight on every open and every walk resubmit: adjusted contracts, no or untrusted price, spot drift, short leg through the strike | `openPosition/index.ts` `preflight()` | main | PAID on live |
| T3 | Market or limit on open | `openPosition`, `open/OpenPricing.jsx` | main | PAID on live |
| T4 | Price walking on the open: 34 % of the remaining gap toward the bid every 30 s, never past the floor, requoted each step, resubmits only the unfilled remainder | `src/lib/openWalk.js`, `open/useOpenOrder.js` | main | PAID on live |
| T5 | A floor the trader sets, defaulting to the credit the scanner showed | `OpenPricing.jsx`, `openWalk.js` `creditFloor()` | main | PAID on live |
| T6 | Manual price on the open: rests, is never walked or cancelled by us | `useOpenOrder.js` `watchResting()` | main | PAID on live |
| T7 | Draggable price slider with live P/L and a plain-English crossing verdict; bid/mid/ask/last chips, stepper, typed field, all one number | `common/PriceControl.jsx`, `src/lib/priceVerdict.js` | main | PAID on live |
| T8 | Price walking on the close: ceiling ask + $0.05, 34 % per step, requoted every 30 s, 10-min timeout | `src/lib/closeWalk.js`, `close/useCloseOrder.js` | main | FREE — never gate a close |
| T9 | Manual price on the close | `close/CloseDialog.jsx` | main | FREE |
| T10 | Partial fills reported as partial on both sides, remainder resubmitted | `useOpenOrder.js`, `useCloseOrder.js` | main | FREE |
| T11 | Close the whole structure or individual legs | `close/LegPicker.jsx`, `closeSpread` | main | FREE — the old page sold it as Pro-only |
| T12 | Close a single-leg position as one leg | `useCloseOrder.js`, `src/lib/spreadLegs.js` | main | FREE |
| T13 | Spread quote refreshed every second while the ticket is open | `CloseDialog.jsx`, `spreadQuote` | main | FREE |
| T14 | Resume from the highest limit already tried, read from the broker's order history | `spreadQuote/index.ts` | main | FREE |
| T15 | Two-step confirm with earnings and account-share warnings at the moment of commitment | `common/ConfirmSubmit.jsx` | main | FREE |
| T16 | Pre-trade risk meter, banded; says "unavailable" rather than guessing | `common/PreTradeRisk.jsx`, `src/lib/risk.js` | main | FREE |
| T17 | Orders tab: every working order and everything that ended today, grouped as sent, per-leg fills, partial progress, reject reason, cancel | `dashboard/OrderGroup.jsx`, `syncAccounts` `orderView()` | main | PAID on live |
| T18 | Cancel a working order from the close ticket | `close/OpenOrdersPanel.jsx`, `manageOrder` | main | FREE |
| T19 | Timestamped order log per walk step | `close/OrderLog.jsx` | main | FREE |
| T20 | `order_attempts` audit written server-side | `_shared/orderAttempts.ts`, migration 0021 | main | NOT YET — **re-checked 2026-09-22: still no user screen**; closes only, opens are not recorded. In `ideas.md`, needs a user asking |
| T21 | **NEW** — the Orders card shows the live market price without opening the price editor, labels it debit or credit, and confirms only what actually reaches the broker. A closing order's quantity reads the true broker ceiling, holds Alpaca's nine decimal places, and no longer collapses a sub-1-share holding to 1 | `dashboard/OrderGroup.jsx`, `manageOrder` | main | PAID on live `↑2026-09-22` **new row** |
| T22 | **NEW** — a crash shows what broke and a way out, instead of a blank page. Closing a position was broken in production by a close ticket reading `qty` before it existed; both fixed | `c576da7`, `b9c2555`, `c835e0f` | main | FREE (trust) `↑2026-09-22` **new row** |

## Positions Monitor

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| P1 | Combined equity, cash, options BP, open positions, credit, max risk and % of equity, unrealised P/L across accounts | `dashboard/MasterSummary.jsx` | main | FREE — the old page sold it as Desk-only |
| P2 | Per-account cards | `AccountSummaryCard.jsx` | main | FREE |
| P3 | Continuous refresh, one sync in flight, 429 backoff, pauses when hidden | `src/lib/useLiveSync.js` | main | FREE — "60-second auto-refresh" no longer exists |
| P4 | Live streaming underlying prices, server-side relay, read-only by construction | `marketStream/index.ts`, `src/lib/marketStreamRegistry.js` | main | PAID on live |
| P5 | Provenance-based leg pairing; unpaired legs never guessed into a condor | `_shared/spreadPairing.ts` | main | FREE |
| P6 | Single-leg positions: cash-secured puts, covered calls, shares from assignment, long options, naked calls flagged | `_shared/positionKinds.ts`, `src/lib/positionKind.js` | main | PAID on live |
| P7 | Risk that refuses to lie: a naked call's max loss is null and the account reads "X %+" | `positionKinds.ts` `totalRisk()`, `AccountSection.jsx` | main | FREE |
| P8 | Wheel adjusted cost basis: assignment strike minus every credit collected on the name, labelled adjusted or broker | `_shared/wheelBasis.ts` | main | PAID on live |
| P9 | Stress-loss risk model: stock-like positions at a 15 % adverse move; stock-to-zero shown separately as Notional | `positionKinds.ts` `stressLossOfKind()`, migration 0023 | main | PAID on live |
| P10 | Capital tied up: CSP strike × 100 plus covered-call shares at market | `positionKinds.ts` `collateralOfKind()` | main | PAID on live |
| P11 | A wheel position leads with its break-even, a spread with its credit | `dashboard/PositionCard.jsx` | main | PAID on live |
| P12 | Simple cards and a 21-column detailed table | `PositionCards.jsx`, `SpreadTable.jsx` | main | FREE |
| P13 | Strike ladder with zones, live marker and collision-aware labels | `dashboard/StrikeLadder.jsx` | main | FREE |
| P14 | Per-leg strip with live bid/ask, per-leg P/L and close-this-leg | `CardLegs.jsx`, `useLegQuotes.js` | main | FREE |
| P15 | Moneyness withheld without a trusted price; adjusted contracts withhold width, risk and break-even | `syncAccounts/index.ts` | main | FREE |
| P16 | Equity at expiration | `syncAccounts/index.ts` | main | FREE |
| P17 | Condor-aware risk netting per ticker | `syncAccounts/index.ts` | main | FREE |

## Trade History

"Journal" is not the word: `docs/context/brand.md` names this surface **Trade
History** and bans "journal" and "log".

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| H1 | Closed history rebuilt from the broker's own activity feed: assignment, exercise, expiry, cash-settled index roots, settlement skew, nearest-long pairing | `_shared/tradeReconstruction.ts`, `tradeHistory/index.ts` | main | PAID on live |
| H2 | Self-syncing, 15-minute staleness, no buttons | `tradeHistory/index.ts` | main | FREE |
| H3 | Three-part P/L: premium, early close, from assignment | `AccountHistory.jsx`, `src/lib/strategies.js` | main | PAID on live |
| H4 | Strategy tabs: spreads, cash-secured puts, covered calls, wheel, untagged | `history/StrategyTabs.jsx` | main | PAID on live |
| H5 | 19-column trade table with result badges | `history/TradeHistoryTable.jsx` | main | PAID on live |
| H6 | Shares-from-assignment ledger, FIFO, with the tax-basis non-claim | `history/StockLotsTable.jsx` | main | PAID on live |
| H7 | Provisional, unpaired, adjusted, paper and components-missing banners | `AccountHistory.jsx` | main | FREE |
| H8 | Tax non-claim stated where the figures are | `AccountHistory.jsx` | main | FREE (compliance) |
| H9 | Pre-sync snapshots, listable and downloadable | migrations 0013/0016, `tradeHistory` | main | owner-only |
| H10 | Audit against the broker feed, writing nothing | `history/RebuildPreview.jsx` | main | owner-only |
| H11 | Raw broker activity export | `tradeHistory` `includeRaw` | main | owner-only |
| H12 | *Absent:* no user notes, tags or free text anywhere | — | — | gap |

## Analysis

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| A1 | ~40 statistics from closed records | `src/lib/analytics.js` `computeStats()` | main | PAID on live |
| A2 | One population rule: win/loss on settled rows only, money booked on every row, and the cards say which | `analytics.js`, `analysis/StatCards.jsx` | main | FREE (integrity) |
| A3 | Peak concurrent capital at risk | `analytics.js` | main | PAID |
| A4 | Annualised and CAGR withheld below 30 trades and 90 days | `analytics.js`, `StatCards.jsx` | main | FREE (compliance) |
| A5 | Credit-capture breakdown by bucket, held vs closed early | `analysis/CaptureBreakdown.jsx` | main | PAID |
| A6 | Equity curve of realised P/L | `analysis/EquityCurveChart.jsx` | main | PAID |
| A7 | By-month and by-ticker tables | `analysis/BreakdownTable.jsx` | main | PAID |
| A8 | Strategy comparison | `analysis/StrategyComparison.jsx` | main | PAID |
| A9 | Date range filter; ROE withheld on a filtered view | `analysis/DateRangeFilter.jsx` | main | PAID |
| A10 | PDF export, A4, paginated, paper banner, full disclaimer on every page | `analysis/ExportPdfButton.jsx` | main | PAID — the old page sold it as Desk-only |

## Accounts

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| C1 | Connect through the broker's own consent screen | `src/lib/alpacaOAuth.js`, `alpacaOAuthCallback` | main | FREE (activation) |
| C2 | One live and one paper account per authorisation, said in the UI | `pages/Accounts.jsx` | main | FREE |
| C3 | Rename and delete | `accounts/AccountForm.jsx`, `saveAccount` | main | FREE |
| C4 | Credentials encrypted at rest, columns revoked from the browser role | `_shared/crypto.ts`, migration 0004 | main | FREE (trust) |
| C5 | Connection diagnostics and a live credential test | `Accounts.jsx`, `oauthDiag` | main | FREE |
| C6 | Manual API keys | `_shared/settings.ts`, migration 0010 | main | owner-only, off by default |
| C7 | Register, login, forgot, reset | `pages/*.jsx` | main | FREE |
| C8 | Site-wide disclaimer footer | `components/DisclaimerFooter.jsx` | main | FREE (compliance) |

## Watch

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| W1 | Rules over the raw broker positions: short through strike, short near strike, earnings before expiry, position oversized, price untrusted, account unreadable, naked short call | `positionWatch/index.ts`, `_shared/watchRules.ts` | main | PAID — the most paid-shaped thing built |
| W2 | Thresholds in data, never literals | `watch_settings`, migrations 0017/0023 | main | owner-only |
| W3 | Alerts deduped by condition, escalated on severity, resolved when no longer true | migrations 0017/0022 | main | PAID |
| W4 | Every 15 min in session, daily report after the close, weekdays | migrations 0017/0018 | main | — |
| W5 | After-close daily report: headline, "Needs a look", "Everything else", judged on closing prices | `_shared/watchReport.ts` | main | PAID |
| W6 | Recipient is **still** one global address — the owner's. No per-user recipient, no screen reads `alerts`. Re-checked 2026-09-22: `positionWatch/index.ts` loads **every** account and sends the whole run to `settings.recipient_email`, so with four connected users three strangers' short-strike breaches arrive in the owner's inbox (handed to `compliance-gate` / `agent-manager`) | `watch_settings.recipient_email` | main | NOT YET SELLABLE until W6 is decided — **now backlog #1**, and a port rather than a design: see W8 |
| W7 | `sendDigest`, the agents' path to the owner | `sendDigest/index.ts` | main | internal |
| W8 | **NEW — the per-user email path exists and is proven.** The weekly digest resolves each user's own address (`auth.admin.getUserById`), honours `profiles.weekly_digest_opt_out`, carries a working `/settings?email=off` unsubscribe, and keeps an owner-preview `mode` beside the real one; it opens on the account's own total value, states a plain `support@` sender, and covers all four parts of the week. Backed by a corrected daily equity series (every stored day had been labelled to the session after the one it belonged to) and an audit framework that withholds a disputed figure instead of freezing an account's history | `weeklyDigest/index.ts`, `_shared/email.ts`, migrations `0036`–`0039`, `0049`, `0054` | main | PAID-shaped `↑2026-09-22` **new row** |
| W9 | **NEW** — history is frozen: a rebuild may add days, may not change the past, and says so. Analysis draws the close its window is measured from and shows where the figure came from; one baseline, one rule, one sentence joining Analysis and the digest. Found because one spread leg blanked 52 days of history and an email reporting $2.7k had no record behind it | `equityHistory`, `7386f6b`, `0dd5122`, `e8787b0`, `294175c` | main | PAID on live `↑2026-09-22` **new row** |

## Billing — new section, `↑2026-09-22`

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| B1 | A Billing screen: two buttons to Stripe's hosted Checkout ($29/month "First 30 days free", $290/year "Ten months for twelve"), then the plan as the webhook recorded it and a button into Stripe's portal. No card is ever entered on our domain | `src/pages/Billing.jsx`, `createCheckoutSession`, `billingPortal` | main | **invisible** — `billing_visible` is seeded off, so the entry is not rendered and both functions refuse |
| B2 | One `subscriptions` row per user, written **only** by the Stripe webhook under the service role, readable by its owner. Stripe's own status vocabulary stored as sent; `trialing` and `active` grant entitlement, `past_due` holds until the period ends | migration `0025`, `_shared/entitlement.ts` | main | — |
| B3 | What a plan gates is exactly one thing: **opening a position on a live account**. Closing, cancelling, quoting, reading, exporting and everything on paper are never behind a plan | `openPosition`, `_shared/entitlement.ts` | main | the tier boundary, in one function |
| B4 | `grandfathered_until` per account, set by an administrator: entitlement holds until that moment regardless of Stripe | migration `0025` | main | owner-only — this is `pricing.md` decision 3's mechanism |
| B5 | Two switches, both seeded off and both treated as off when the row is missing: `billing_visible` (a plan can be bought), `billing_enforced` (a plan is required) | migrations `0025`, `0027`, `admin/SettingsPanel.jsx` | main | owner-only |
| B6 | *Constraint:* `paper_only` and `demo_mode` are both ON, so no live position can be opened at all — which means B3's gate currently has nothing to gate | migrations `0035`, `0040` | main | see `pricing.md` decision 10 |

## Back-office (not sellable)

Admin with server re-authorisation; activation funnel (signed up → connected
→ traded → traded live; "traded" includes trades placed outside DeltaMint);
signups chart; users table with CRM notes, status, tags and connection
issues; role management; blog CMS and the publish workflow; operator
switches; credential migration and key rotation; earnings refresh; broker-feed
dump (`dumpBrokerFeed`, migration 0024 on staging); last-active stamping via
a security-definer RPC. `oauthDiag` is reachable by any signed-in user —
handed to systems-engineer.

## What this inventory says about packaging

- Everything that activates a user — screening, connecting, placing and
  closing on paper, reading the book — is free, and stays free.
- Everything that only a live book needs — single-leg and wheel positions,
  adjusted basis, the stress model, streaming, the Orders tab, history and
  analysis of real money — is what a live subscription buys.
- Closing is never behind a plan. A user can always see, price and close
  what they hold.
- The watch is the most obviously paid feature and cannot be sold until
  it emails the subscriber rather than the owner (W6). **As of 2026-09-22 the
  mechanism for doing so exists and is proven in production (W8); the watch was
  simply never ported to it.** That is backlog #1.
- ~~The wheel's reading half is complete; its writing half is the next product
  build.~~ **Both halves are now on `main`** (S3, T1): single-leg setups in the
  Scanner and in the Open Position ticket. `pricing.md` decision 5 is therefore
  no longer a promise about future work.
- **The paid half of this inventory is dormant.** `paper_only` and `demo_mode`
  are both on, so every "PAID on live" row above is unreachable, and
  `billing_visible` is off so no plan can be bought. Nothing here is being sold
  to anyone, and the sequencing question that unblocks it is `pricing.md`
  decision 10 — not a price.

See `pricing.md` for the tiers and the numbers.
