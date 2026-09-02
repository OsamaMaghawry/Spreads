# Pricing — the proposal, 2026-09-02

Owned by `vp-product`; decided by the owner; a standing item at the Friday
board. **No agent, including this one, ever sets or publishes a price.** The
number here becomes live only when the owner flips `billing_enforced` in
Admin and the page ships through the normal release path.

Supersedes the 1 Sep pitch ("The Nineteen Dollar Case"). What changed, and
why, is in §3.

## 1. Current state

- **No billing exists.** No Stripe code, no plan column, no subscription
  table. (Being built on staging, 2 Sep — see `docs/ops/queue.md`.)
- **A pricing page is published** at `/pricing` with Paper $0 / Pro $39 /
  Desk $99 and a nine-row matrix of which at least seven rows are false
  against the code: position caps, account caps, condors Pro-only,
  single-leg closing Pro-only, risk aggregation Desk-only, PDF Desk-only,
  "60-second auto-refresh". All three buttons go to `/register`. It is
  replaced by the two-tier page below at the Stripe switch.
- Pre-revenue; Alpaca live-trading approval pending. Paper is free by design.
- Our marginal cost per free user is Supabase invocations, not broker data:
  every broker call runs on the user's own token or keys, and the price
  stream is the free IEX feed. The earlier premise that "free costs us
  broker traffic" was wrong.

## 2. The packages — two tiers

Three tiers divided by capability we do not implement. Two divide by the one
thing that can be gated in one function and that a buyer recognises before
paying: **a live account**.

### Paper — $0, forever, unmetered

The whole desk against a paper account. No page limit, no position limit, no
expiry.

- Screener — put spreads, call spreads and iron condors across the S&P 500
  or your own list
- Ranked by return on risk, priced at what you would actually get filled at
- Earnings flagged before you are exposed to them
- Positions Monitor — every position grouped as it was traded, priced live
- Place and work orders on your own account, with the price walking or
  resting where you put it
- Trade History and Analysis, rebuilt from your broker's own records
- PDF export

Why free: the activation metric is signup → broker connected → first trade.
Every step of it must be free, or the criterion the backlog is ranked by is
the thing we charged for.

### Live — $29/month or $290/year, first 30 days free

Everything in Paper, on a live account, plus what only a live book needs:

- Cash-secured puts, covered calls and shares from assignment, held as what
  they are
- Cost basis adjusted for every premium collected on the name
- Risk sized at a 15 % adverse move — the shock clearing engines use — with
  stock-to-zero shown separately as notional
- Streaming underlying prices while a position is open
- Orders — what was sent to the broker, grouped as it was sent, including
  partial fills

Flat monthly. Nothing per contract, nothing per order, no share of anything
you make. Cancel any month. **You can always close a position, on any plan.**

Annual is ten months for twelve (17 % off) — Tiblio's structure, not
Barchart's 33 %, which is a two-year data business amortising costs; 17 %
buys the cash without teaching the first cohort that list price is soft.

### Automation — in development

One line on the page, no price, no date. See §4.

## 3. Why $29, and what moved since the $19 case

| 1 Sep claim | Today |
| --- | --- |
| Paper free forever | Holds, and is cheaper than assumed (§1) |
| Live is the paid line | Holds — the only boundary that is one condition in one function |
| $19 / $190 | **Replaced by $29 / $290.** The 1–2 Sep shipments (wheel positions, adjusted basis, stress model, Orders tab, manual pricing and walking on both sides) moved the product into Tiblio's and QuantWheel's category ($34.95–$37, reported). $19 sits in the dead band under Barchart's $9.99 → $29.95 options line. And the page already says $39: cutting to $19 before a first customer reads as doubt |
| Switch on after 25 live activations | **Dropped.** Not reachable before approval; the trigger guarantees the gap the owner is closing. Charge from the first live connection after the switch date |
| Existing live users free 90 days | Kept — one `grandfathered_until` timestamp per account |
| Kill test: < 10 % conversion at day 60 | **Replaced.** The denominator does not exist (the funnel's "traded live" counts trades placed outside DeltaMint). New test: **fewer than 8 paid Live subscriptions 60 days after the switch → cut to $19 before adding a feature** |
| Gaps: no alerts to users, no journal, one ranking metric, 3 strategies / 1 broker | Partial-close tracking shipped; notes still absent; alerts still go to the owner only (`watch_settings.recipient_email`); one metric and one broker still true |

### Anchors

| Competitor | Number | Confidence | Checked |
| --- | --- | --- | --- |
| Barchart Premier | $29.95/mo; $239.95/yr; 30-day trial; every options tool in this one tier | **verified** — vendor page | 2026-09-02 |
| Barchart Plus | $9.99/mo — no options tools at all | **verified** — same page | 2026-09-02 |
| Barchart Free | $0, metered at 20 page views a day | **verified** — same page | 2026-09-02 |
| Tiblio | $34.95/mo, $349.50/yr, $1 for 7 days; screen → order → hold on Alpaca | reported — host blocked | 2026-09-02 |
| Option Alpha | from $39/mo, bot builder included | reported — host blocked | 2026-09-02 |
| OptionStrat | $39.99/mo Live Tools | reported — host blocked | 2026-08-31 |
| QuantWheel | ~$37/mo Advanced; sources disagree ($19/$31 elsewhere) | reported, self-inconsistent | 2026-09-02 |
| TradeSteward | from $4.99/mo per bot to $139.99/mo | reported — host blocked | 2026-09-02 |

$39 is the number of tools with backtesting or visualisation depth we do not
have; `positioning.md` says we have no data moat. $29 sits a dollar under the
incumbent's options tier and six under the only direct competitor: the price
of a product that does one thing they do not, not one claiming more than
they do.

### Words on the page

- "Journaling" → **Trade History** (`brand.md` bans "journal" and "log").
- "Options account management" → **Positions Monitor** for the book,
  **Accounts** for the connection screen.
- **Trading** as a section heading only; the line item is "Place and work
  orders on your own account", so the page never reads as if we trade.

### Compliance

Flat monthly, identical whatever is traded, nothing per contract or order,
no share of profit (rule 6). The broker is named only where the integration
is described, never in a headline (rule 1). No performance figures. The tier
boundary is "a live account", not "how much you trade" — a position or
order cap would put the price on trading activity, which is why the old
matrix goes.

## 4. The wheel and the automation

**Wheel execution, human-clicked** (sell the put, take assignment, sell the
call against the shares): **inside Live at $29, on ship, no price change.**
A strategy is not a tier; the monitor already shows the wheel with an
adjusted basis; charging separately to place what we display is the shape
of a feature that gets refunded. The reading half is complete; the writing
half (single-leg setups in the scanner and open ticket) is the next product
build. Anchor: QuantWheel's whole business is this at ~$37 and does not
route to Alpaca.

**The automated bot** (wheel, cash-secured puts, covered calls, as rules the
user configured): **a price rise, not an add-on or a tier — "Live +
Automation, $59/month, $590/year" — introduced after 40 paid Live
subscriptions.** Reasons: it answers the one problem attention cannot solve
(the market's test for what it rewards); an add-on splits the riskiest code
across two SKUs and creates "why didn't my bot fire — is that my plan?";
it multiplies liability, and unattended orders on a base of two customers is
not a pricing decision. Every competitor prices automation above analysis
(TradeSteward per bot to $139.99; Option Alpha from $39; Tiblio fires every
10 minutes at $34.95). Until then: "Automation — in development", no price,
no date — honest, and the cheapest demand test available.

Wording, per compliance rule 5: **"Rules you configure, executed at your
direction."** Never "the software decides", "AI", "signals", "our strategy".

## 5. What "paying" means

For the 100-paying-users target: **one Stripe subscription in `active`
status, past its first successful invoice, on Live, one per account owner.**
Excluded: paper users, trials, the grandfather window, the owner's own
accounts. A $59 subscriber counts once.

## 6. Decisions for the owner

1. Replace the live pricing page at the Stripe switch, or reduce it now to
   one line. Not leave it.
2. Live at $29 / $290, held for 60 days.
3. Charge from the first live connection after the switch date; 30 days
   free on Live; everyone connected before the switch free for 90 days.
4. Kill test: fewer than 8 paid Live subscriptions at day 60 → $19.
5. Wheel execution inside Live, no separate price.
6. No bot yet; "Automation — in development"; revisit at 40 paid, at $59.
7. Fix the watch before the page mentions the daily report (done, `a7db799`).
8. Decide who the watch emails — subscribers' own alerts or the owner's
   inbox. Until decided, "alerts" stays off the page.
9. Allowlist `tiblio.com`, `optionstrat.com`, `optionalpha.com`,
   `quantwheel.com`, and our own `deltamint.app` / `dashboard.deltamint.app`
   (403 at CONNECT since 31 Aug).

## 7. What would move this file

- Any of the blocked hosts allowlisted → a `reported` row becomes
  `verified` in one fetch.
- The first three live connections after the switch → the first demand
  signal this file has ever had.
- The published fee schedule read → a schedule saying anything but $29 is
  a launch blocker.
