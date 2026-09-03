# Every feature, and what it is worth — 2026-09-02

Owned by `vp-product`. Read from the code on `main` at `3a22207` plus the
`staging` delta (`git diff --stat main staging` = one migration and the
generated context file; everything shipped on 2 Sep is on `main`). This is the
inventory the pricing page, the Alpaca fee schedule and the Tuesday product
run read. Categories use the canonical names in `docs/context/brand.md`.

Calls: **FREE** — needed for activation or trust, never gated. **PAID on
live** — worth money, gated by the live-account line. **NOT YET** — built
but not sellable as it stands, with the reason. **owner-only** — exists,
admin-gated, not a product.

Two things found on the walk that outrank the table: the published pricing
page (Paper $0 / Pro $39 / Desk $99) was false against the code on seven
rows, and the watch on `main` threw on every account (fixed the same day,
`a7db799`).

## Screener

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| S1 | Sweep a universe for credit setups, four tickers a batch, results streaming in ranked | `src/pages/Screener.jsx`, `screener/useMarketScan.js`, `scanEntries/index.ts`, `_shared/optionScan.ts` | main | FREE |
| S2 | Universe: top 50 mega caps, ~500 S&P names, or a custom list. No ETFs or indices | `src/lib/sp500.js`, `screener/ScreenerConfig.jsx` | main | FREE |
| S3 | Five strategies — put spread, call spread, iron condor, cash-secured put, covered call — and a Wheel scan that runs the last two together; covered calls scan the shares the account holds at their cost basis | `scanEntries`, `findEntry`, `_shared/optionScan.ts` `buildSingle()`, `_shared/heldShares.ts`, `open/StrategyPicker.jsx` | staging | FREE |
| S4 | Filters: DTE, short delta, wing width, min credit, max risk per unit, min return on risk, put/call ratio. No volume, OI, bid-ask or IV filter | `ScreenerConfig.jsx`, `ScanFilters.jsx` | main | FREE |
| S5 | Exact wing width or skip — never a wider spread than asked | `optionScan.ts` `pickWing()` | main | FREE |
| S6 | One ranking metric, return on risk, top 25; client re-sort by RoR / credit / max risk | `optionScan.ts`, `ResultsTable.jsx` | main | FREE |
| S7 | Credit priced at short bid minus long ask — the executable side, not the mid | `optionScan.ts` | main | FREE (what makes free trustworthy) |
| S8 | Spot-price trust ladder: trade print leads, quote corroborates, weaker is refused | `_shared/marketPrice.ts` | main | FREE |
| S9 | Put-call parity check refuses a chain implying a spot more than 1 % off the feed | `optionScan.ts` `impliedSpotFromParity()` | main | FREE |
| S10 | Every skipped ticker says why | `optionScan.ts` | main | FREE |
| S11 | Earnings-before-expiry flag on every candidate, a fact not a filter | `_shared/earnings.ts`, `common/EarningsWarning.jsx` | main | FREE |
| S12 | Named presets and "last scan" restore | `src/lib/scanPresets.js`, `ScanPresets.jsx` | main | FREE |
| S13 | Continuous scan loop, retry every 20 s, audible alert on a hit | `open/useScanLoop.js`, `src/lib/beep.js` | main | FREE — the old page sold it as Pro-only |
| S14 | *Absent:* no scan is recorded anywhere | — | — | backlog #3 |
| S15 | *Constraint:* the screener needs a connected account for market data | `Screener.jsx` | main | shapes the funnel: connect is step one |

## Trading

| # | What the user gets | Where | Live | Call |
| --- | --- | --- | --- | --- |
| T1 | Trade a ranked row directly, or build a setup by hand — spreads, condors, and now a single short put or a covered call sent as a plain option order under the wheel prefix | `ResultsTable.jsx`, `screener/TradeDialog.jsx`, `open/OpenPositionDialog.jsx`, `openPosition/index.ts` | staging | PAID on live |
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
| T20 | `order_attempts` audit written server-side | `_shared/orderAttempts.ts`, migration 0021 | main | NOT YET — no user screen; closes only, opens are not recorded |

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
| W6 | Recipient is one global address — the owner's. No per-user recipient, no screen reads `alerts` | `watch_settings.recipient_email` | main | NOT YET SELLABLE until W6 is decided |
| W7 | `sendDigest`, the agents' path to the owner | `sendDigest/index.ts` | main | internal |

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
  it emails the subscriber rather than the owner (W6).
- The wheel's reading half is complete; its writing half (single-leg setups
  in the scanner and the open ticket) is the next product build and ships
  inside the same live plan.

See `pricing.md` for the tiers and the numbers.
