# Tiblio Trade Desk vs our screen → order → hold flow

Study date: 2026-09-01. Author: vp-product.

Research route: `tiblio.com` and `www.tiblio.com` are `EGRESS_BLOCKED` at the
proxy — not on the allowlist at all, unlike Barchart's site-side 403 (recorded
in `docs/context/reachable.md`). Every Tiblio fact below came through
WebSearch, cross-checked against `docs/context/positioning.md`'s existing
claims and against `market-watch`'s same-day re-verification of that file
(commissioned in parallel with this study; its findings are folded into part 2
and superseded this study's own first-pass pricing search — see T8).
Confidence is graded per claim; the one figure a screenshot would still settle
is named in the closing section.

Tiblio is named in `positioning.md` as **the closest direct competitor** — it
screens spreads, connects to Alpaca among five brokers, and routes orders —
so it is the overdue teardown, not a new one invented to fill backlog slots.

## 1. Capability inventory (Tiblio)

**Positioning.** Tiblio v2 ("rebuilt from the ground up") is a premium-selling
income platform built around **Roger**, an automation layer for the wheel,
covered calls and put writing — not a look-and-decide screener like Barchart.
[T1]

**Screener.** A single-leg options screener plus a nightly "Vol Crush"
screener that prices every optionable S&P 500 name off pure historical
volatility, ranked against the name's own 52-week vol history, layering in
earnings proximity, SEC insider-filing activity, analyst actions and trend
confirmation. [T2] Spread width is set by choosing the long leg's delta, or
left off entirely to trade naked. [T3]

**Brokers.** Five, via OAuth, no stored passwords: Schwab, Tradier,
TradeStation (live + paper), tastytrade, Alpaca. Connecting a broker unlocks
live quotes, real-time greeks, 2-minute alert-check intervals, and Roger
automation. [T4]

**Automation (Roger).** Discovery, order placement, monitoring and closing as
one lifecycle: scans for matching contracts and sends orders to the connected
broker **every 10 minutes**, checks profit targets **every 5 minutes** and
closes winners automatically, on user-configured DTE/delta/profit-target/
capital rules with per-symbol overrides. [T5]

**Alerts.** P/L threshold alerts by email and Telegram, checked every 2
minutes with a broker connected. [T6]

**Trade journal.** Manual logging for stocks, single options, multi-leg
spreads and crypto, with strategy labels, notes and partial closes. **Unresolved
whether a spread still holds as one object**: the P/L-alerts docs describe
per-leg alerts on separately logged legs, but the v2 changelog (1 Apr 2026)
says the rebuilt journal "supports... multi-leg spreads" — the two pages were
not reconcilable through WebSearch alone. [T7]

**Pricing.** One paid tier, reported at $34.95/mo or $349.50/yr, with a $1
seven-day trial. [T8]

## 2. Evidence table

| # | Claim | Source | Confidence |
| --- | --- | --- | --- |
| T1 | Tiblio v2 rebuilt around Roger, an automation layer for premium-selling strategies (wheel, covered calls, put writing) | `tiblio.com/changelog/tiblio-v2-launch` content via WebSearch | verified (vendor changelog, via WebSearch) |
| T2 | Vol Crush screener runs nightly across the full S&P 500 on historical vol vs. 52-week own-history, plus earnings/insider/analyst/trend signals | Vendor blog/research pages (`tiblio.com/research/options`, `tiblio.com/blog/...`) via WebSearch | verified (vendor pages, via WebSearch) |
| T3 | Spread width set by long-leg delta choice, or naked | Vendor docs via WebSearch | verified (vendor docs, via WebSearch) |
| T4 | Five brokers via OAuth (Schwab, Tradier, TradeStation, tastytrade, Alpaca), no stored passwords | `tiblio.com/docs/brokers/`, `tiblio.com/docs/reference/supported-brokers` via WebSearch — matches `positioning.md`'s existing (pre-this-run) claim | verified (vendor docs, via WebSearch); consistent with prior positioning.md entry |
| T5 | Roger scans every 10 min, checks profit targets every 5 min, auto-closes winners | Vendor docs + `aichief.com`/`declom.com` reviews via WebSearch — the "every 10 minutes" figure matches `positioning.md`'s prior claim verbatim | verified for the 10-min figure (matches a claim `positioning.md` already carried); 5-min profit-check detail is **reported**, not vendor-primary |
| T6 | P/L alerts via email/Telegram, 2-minute check interval with broker connected | Vendor docs via WebSearch | verified (vendor docs, via WebSearch) |
| T7 | Whether a multi-leg spread holds as one journal object, or logs as separate legs | `tiblio.com/docs/p-l-alerts/` (per-leg alerts on separately-logged legs) vs. `tiblio.com/changelog/tiblio-v2-launch` ("journal... supports... multi-leg spreads") via WebSearch — the two pages read as contradictory and neither could be opened directly (`tiblio.com` proxy-blocked) | **could not verify** — market-watch attempted the same reconciliation and also came up short; treat "leg by leg" as unconfirmed, not disproven, until a browser opens `/docs/trade-journal/` |
| T8 | $34.95/mo or $349.50/yr, $1 seven-day trial | `tiblio.com/pricing` via WebSearch, corroborated by `market-watch`'s independent same-day check — matches `positioning.md`'s prior "~$35/month" anchor exactly | verified (vendor pricing page, via WebSearch, cross-checked by a second independent search). **Correction:** this study's own first WebSearch pass returned a stale/wrong $97–297/mo two-tier figure from a third-party review (`aichief.com`); market-watch's vendor-page-sourced number is the one used throughout this file |

## 3. Our side, from our code

Read 2026-09-01: `src/pages/Screener.jsx`, `src/components/screener/TradeDialog.jsx`,
`src/components/open/OpenPositionDialog.jsx`, `src/pages/AccountHistory.jsx`,
`supabase/functions/positionWatch/index.ts`, `supabase/functions/tradeHistory/index.ts`,
`docs/context/compliance.md`. Scanner internals (universe, filters, ranking) were
read fresh for last week's Barchart teardown and are not re-derived here.

**Brokers.** One: Alpaca, OAuth only, per `compliance.md` — by design (the DDQ
constrains us to Alpaca; no multi-broker code path exists). Tiblio's five-broker
breadth is not a gap we can close without a compliance-gated new integration,
not a product tweak.

**Automation.** None. Every order in `TradeDialog.jsx` / `OpenPositionDialog.jsx`
is a user click, re-validated against live spot at submit
(`openPosition` 409s if the market moved). No scheduled scan, no
autonomous order placement, no auto-close on a profit target. This is
deliberate positioning (`positioning.md`: "a place the user looks and decides"
vs. Tiblio/Option Alpha/TradeSteward's rule-runner posture), not an
oversight.

**Alerts.** `positionWatch` exists but is a **risk-safety watch for the
owner**, not a user-facing feature: it reads raw Alpaca positions on a cron,
applies head-of-trading's moneyness/naked-leg/earnings rules, and emails the
owner. No P/L-threshold alert, no Telegram channel, no per-user surface.
`docs/product/ideas.md` already notes the alerts table "will need a surface" —
unevidenced, sitting in the waiting room.

**Trade journal.** No manual logging, no strategy labels, no partial-close
notes anywhere in `src/`. `AccountHistory.jsx` / `tradeHistory` reconstruct
closed trades from the broker feed itself (not a user-entered journal) — a
different thing done well (`docs/product-context.md`'s trust ladder), not a
lesser version of Tiblio's journal.

**Screener ranking.** One metric, RoR descending (unchanged since last week's
teardown) — no vol-history ranking, no earnings/insider/analyst overlay like
Vol Crush.

**Pricing.** No published price (`pricing.md`) — pre-revenue.

## 4. Parameter-level matrix

| Dimension | Tiblio | Us | User consequence |
| --- | --- | --- | --- |
| Broker breadth | 5 brokers via OAuth [T4] | Alpaca only (`compliance.md`) | A trader already on Schwab or tastytrade has to open a new brokerage relationship to use us at all; Tiblio meets them where they already are |
| Order automation | Roger scans/orders every 10 min, closes winners on a timer, no human click required [T5] | Every order is a user click, re-validated at submit (`TradeDialog.jsx`, `openPosition`) | Tiblio's user can walk away; ours cannot set-and-forget. This is a stated posture difference, not a bug — but it means we are not a substitute for a wheel-strategy trader who wants unattended premium selling |
| P/L alerting | Email + Telegram, 2-min checks, user-facing, self-serve [T6] | `positionWatch` is an owner-only risk watch, no per-user alert surface | A Tiblio user is told when a position hits target without opening the app; our user must open the app and look — the exact posture we've chosen, but it has a real retention cost we are naming, not building against this run (retention, not activation) |
| Trade journal | Manual log across stocks/options/crypto; whether multi-leg holds as one object is unresolved [T7] | No journal; `tradeHistory` auto-reconstructs closed trades from the broker feed | Tiblio's user does more manual data entry but can annotate; ours does zero entry but cannot add notes/labels. Neither side's gap is evidenced by a user complaint this run |
| Screener ranking | Vol Crush: historical-vol percentile + earnings/insider/analyst signals, full S&P 500, nightly batch [T2] | RoR descending only, on-demand, three strategies (`scanCandidates`) | Different jobs: Tiblio's screener finds premium-selling candidates across the whole market; ours ranks candidates the user has already framed as a specific spread. Not a direct substitute either way |
| Pricing | $34.95/mo, $1 trial [T8] | No published price | Tiblio sits inside the analytics layer's normal $9–99/mo band despite being an automation tool, not above it as first assumed — it is a live, working anchor for `pricing.md`, not a weak one |

## 5. So what

**Zero proposals fed to `../backlog.md` this run.** Every real gap found is
either (a) out of strategy — order automation is the one thing Tiblio does
that we deliberately do not do, and building it would contradict the
"look and decide" posture `positioning.md` states as our differentiator, or
(b) retention, not activation — P/L alerting and a trade journal both help a
user who already made their first trade, not the signup → broker → first-trade
path the backlog is ranked against (the same rule that kept screener emails
out of last week's Barchart teardown). Naming these here, rather than forcing
a fourth or fifth backlog slot, is the discipline the cap exists to enforce.

The one item worth flagging outside the backlog: **Tiblio is not the
activation-funnel competitor Barchart is.** It competes on unattended premium
income at a normal analytics-layer price. That is a positioning fact for
`head-of-branding`/growth messaging, not a build decision, and is handed off
rather than investigated further here.

## What could not be verified, and what would settle it

- **Whether a Tiblio spread still logs leg-by-leg post-v2** (T7) — the P/L
  alerts docs and the v2 changelog read as contradictory and `tiblio.com` is
  unreachable from this environment. Settled by one screenshot of
  `tiblio.com/docs/trade-journal/` → `docs/product/research/tiblio-journal.png`,
  or by allowlisting `tiblio.com`/`www.tiblio.com`. Already flagged in
  `positioning.md` as unresolved; do not market DeltaMint's "holds the spread
  as one object" claim against Tiblio specifically until this is settled.
- **Whether Roger can trade credit spreads at all**, vs. single-leg
  premium-selling only — T5's sourcing describes single-leg wheel/covered-call
  automation; nothing found confirms or denies multi-leg automated entries.
  Settled by the same journal-page screenshot or a Tiblio demo video review.
- **Puthouse's Alpaca approval status** — `positioning.md` already flags this
  as corrected-to-unknown; confirmed again this week by `market-watch`, no
  change.
