# Pricing — the proposal, 2026-09-02 · **reconciled 2026-09-22**

Owned by `vp-product`; decided by the owner; a standing item at the Friday
board. **No agent, including this one, ever sets or publishes a price.** The
number here becomes live only when the owner flips `billing_visible` (can a
plan be bought) and `billing_enforced` (is one required) in Admin and the page
ships through the normal release path.

Supersedes the 1 Sep pitch ("The Nineteen Dollar Case"). What changed, and
why, is in §3. §1 was rewritten on 2026-09-22: four of its five bullets had
gone false.

## 1. Current state — rewritten 2026-09-22

- **Billing now exists, end to end, and it already carries $29 / $290.**
  `subscriptions` table with the Stripe webhook as its only writer (migration
  `0025`), `_shared/entitlement.ts`, `src/pages/Billing.jsx` with two hosted-
  Checkout buttons priced `money(29)` "First 30 days free" and `money(290)`
  "Ten months for twelve", and a Stripe portal button. What a plan gates is
  exactly one thing: **opening a position on a live account** (`openPosition`).
  Closing, cancelling, quoting, reading, exporting and everything on paper are
  never behind a plan. **Two switches, both seeded off**: `billing_visible`
  (migration `0027`) says a plan can be *bought*; `billing_enforced` (`0025`)
  says a plan is *required*. Nothing is being charged.
- **The pricing page is off the site**, removed 2026-09-12 at the owner's
  instruction, not replaced: *"I need to make the integration is Demo only,
  hide the pricing page, I want to share with people and I don't want to have
  the pricing on something doesn't exist yet. Also, the product increased, so
  we may revise the pricing again."* (`landing/drafts/README.md`.) The file
  was **moved out of the Worker's asset directory** rather than redirected,
  because production runs the Worker only for `/blog`, `/blog/*` and
  `/sitemap.xml` — a redirect in `src/index.js` would have worked on staging
  and silently done nothing on the live site. `/pricing` now returns the 404
  page; nav, footer and sitemap links are gone. This **answers decision 1**
  (the owner chose "reduce it to nothing", not "replace it"), and the second
  half of his sentence **reopens the price level** with the best evidence this
  file has ever had: the owner's own words.
- **The Live tier's contents are currently unreachable on a live account, by
  design.** `paper_only` (migration `0040`, 2026-09-12, **seeded ON**) excludes
  every live account from `syncTrades`, `equityHistory`, `positionWatch` and
  `weeklyDigest`; `demo_mode` (`0035`, also seeded ON) makes `openPosition`
  refuse any order on a live account and holds prices back site-wide. The
  owner's framing: *"Differentiate between production as an environment and the
  live account. I don't want live accounts. I want the paper accounts inside
  the production."* **Consequence for this file: the $29 line cannot be sold
  today at any price, and not because of W6.** Everything it lists — wheel
  positions, adjusted basis, the stress model, streaming, Orders, history and
  analysis of real money, the watch — is switched off for the account type the
  tier is defined by. Sequencing, not pricing, is the binding constraint. See
  decision 10.
- **Zero paying, and zero arriving.** `docs/growth/metrics/2026-09-22.json`:
  4 signed up → 4 connected → 4 traded → 2 traded live → **0 paying**, with
  **no new signup in the 15 days the series covers**. The $19-vs-$29 question
  is downstream of a funnel with no top.
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
| Barchart Premier | **$29.95/mo — re-confirmed.** Annual is now **disputed**: the 2 Sep direct fetch read $239.95/yr ($419.95/2yr); WebSearch on 2026-09-22 returns $199.95/yr and $368.00/2yr from Barchart's own help article. 30-day trial; every options tool in this one tier | **was** verified (direct fetch, 2026-09-01) → **now `reported`**: the vendor page went behind an AWS WAF challenge (HTTP 202 + `challenge.js`) some time after 01 Sep and cannot be re-fetched. See `docs/context/reachable.md` | **2026-09-22** |
| Barchart Plus | $9.99/mo — no options tools at all | verified 2026-09-01 (direct fetch); not re-verifiable since | 2026-09-01 |
| Barchart Free | $0, metered at 20 page views a day | verified 2026-09-01 (direct fetch); not re-verifiable since | 2026-09-01 |
| Tiblio | $34.95/mo, $349.50/yr, $1 for 7 days; screen → order → hold on Alpaca | reported — host blocked; **re-confirmed unchanged by WebSearch 2026-09-22** | **2026-09-22** |
| Option Alpha | from $39/mo, bot builder included | reported — host unreachable (`www.` 301s to a non-allowlisted apex) | 2026-09-02 |
| OptionStrat | $39.99/mo Live Tools | reported — host unreachable (same `www.`→apex trap) | 2026-08-31 |
| QuantWheel | ~$37/mo Advanced; sources disagree ($19/$31 elsewhere) | reported, self-inconsistent; apex confirmed 403 at CONNECT 2026-09-22 | 2026-09-02 |
| TradeSteward | from $4.99/mo per bot to $139.99/mo | reported — host blocked | 2026-09-02 |
| **PutHouse** | **No price found anywhere.** Capability, however, is now `verified`: automated covered calls and cash-secured puts *"from entry to exit without requiring manual order placement"*, on Alpaca's Trading and Market Data APIs, with auto position sizing, volatility-risk-premium / RSI / earnings-and-corporate-event checks, preset or user-defined modes, and **AI-generated explanations of why each trade was placed or skipped** | **verified (the broker's own announcement)** — `alpaca.markets/blog/puthouse-integrates-with-alpacas-trading-api-to-automate-options-income-strategies`, 27 Jul 2026, fetched directly | **2026-09-22** |

**One anchor moved, and it moved against us.** If Barchart's annual really is
$199.95, the incumbent's yearly is **6.7 months for twelve** and ours is ten
for twelve — making our annual the *shallowest* discount in the set rather than
the disciplined middle this file argued for. That does not change the
recommendation on its own (Barchart is a two-year data business amortising
costs, as §2 already says), but it does mean the "17 % is the disciplined
number" sentence rests on a figure we can no longer fetch. **An owner
screenshot of `www.barchart.com/membership-comparison` settles it in one
image** — named here rather than left as a soft spot.

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

**Correction, 2026-09-22 — the automation slot is already occupied, on our own
broker.** This section's anchor sentence was *"QuantWheel's whole business is
this at ~$37 and does not route to Alpaca."* That is still true of QuantWheel
and is no longer the relevant fact. **PutHouse automates exactly the wheel half
— covered calls and cash-secured puts, entry to exit, no manual order placement
— through Alpaca's own Trading API**, verified from Alpaca's announcement of
the integration (27 Jul 2026; see the anchors table). It sizes trades
automatically, screens on volatility risk premium, RSI and upcoming earnings,
and explains each trade it placed *or skipped* to its own user.

What that does and does not change:

- It does **not** change the recommendation. "Automation is a price rise at
  $59, after 40 paid Live subs" still holds, and holds harder: shipping
  unattended orders into a market where a funded competitor already does it,
  from a base of zero paying users, is the worst possible order of operations.
- It **does** kill one line of argument. Automation on Alpaca is no longer
  white space we are choosing when to enter; it is contested space we would be
  entering second, against something whose guardrails the broker has publicly
  vouched for. Any automation plan that assumed first-mover on this broker is
  void.
- It **sharpens the human-clicked wheel case above.** PutHouse's own pitch is
  *"without needing to manually trade every day"* — the opposite posture to
  ours. `positioning.md` already warns that look-and-decide is a preference,
  not a moat. It is, however, a *different product*, and the honest version of
  the $29 line is "you decide, we do the arithmetic and the execution", not
  "cheaper automation".
- **PutHouse has no published price we can find.** That is the one number that
  would tell us whether automation on Alpaca clears $59 or is being given
  away, and no reachable source has it.

Wording, per compliance rule 5: **"Rules you configure, executed at your
direction."** Never "the software decides", "AI", "signals", "our strategy".

## 5. What "paying" means

For the 100-paying-users target: **one Stripe subscription in `active`
status, past its first successful invoice, on Live, one per account owner.**
Excluded: paper users, trials, the grandfather window, the owner's own
accounts. A $59 subscriber counts once.

## 6. Decisions for the owner

Status re-checked 2026-09-22. **Nothing decided is reopened without new
evidence**; where shipped work answered a decision, it is marked and closed.

1. ~~Replace the live pricing page at the Stripe switch, or reduce it now to
   one line. Not leave it.~~ **ANSWERED 2026-09-12 by the owner, in action:**
   the page was removed from the site entirely (`landing/drafts/pricing/`),
   with nav, footer and sitemap links taken out. Closed. What returns in its
   place is part of decision 10, not this one.
2. Live at $29 / $290, held for 60 days. **Still standing, and now wired into
   the product** (`Billing.jsx`, both buttons, `money(29)` / `money(290)`),
   behind two off switches. **Not reopened here** — but the owner has himself
   said *"the product increased, so we may revise the pricing again"*, which is
   new evidence and is decision 11 rather than a reversal of this one.
3. Charge from the first live connection after the switch date; 30 days free on
   Live; everyone connected before the switch free for 90 days. **Standing, and
   the mechanism exists**: `subscriptions.grandfathered_until`, settable by an
   administrator, and entitlement holds until that moment regardless of Stripe.
4. Kill test: fewer than 8 paid Live subscriptions at day 60 → $19. **Standing,
   and currently unstartable** — the clock begins at the switch, and the switch
   is behind decision 10.
5. Wheel execution inside Live, no separate price. **Standing.** The writing
   half has shipped (single-leg setups in the Scanner and the Open Position
   ticket, on `main`), so this is no longer a promise about future work.
6. No bot yet; "Automation — in development"; revisit at 40 paid, at $59.
   **Standing, and strengthened** — see §4's 2026-09-22 correction. One premise
   under it is void: automation on Alpaca is contested, not white space.
7. ~~Fix the watch before the page mentions the daily report.~~ **Done**
   (`a7db799`). Closed.
8. Decide who the watch emails — subscribers' own alerts or the owner's inbox.
   Until decided, "alerts" stays off the page. **STILL OPEN, and now cheap.**
   Not answered by what shipped, but the pattern it needs *was* built and
   proven: `weeklyDigest` (13 Sep) resolves each user's own address via
   `auth.admin.getUserById`, honours `profiles.weekly_digest_opt_out`, and
   carries a working `/settings?email=off` unsubscribe. `positionWatch` still
   sends the whole run to one global `watch_settings.recipient_email`. This is
   now backlog **#1**, ranked first, and it is a port of about half a day. It
   also has a non-pricing edge — with four connected users, three people's
   short-strike breaches arrive in the owner's inbox — which has been handed to
   `compliance-gate` / `agent-manager` and is **not** for this file to judge.
9. Allowlist additions. **Re-scoped 2026-09-22 — the list was partly wrong.**
   The precise asks are now: **`marketchameleon.com`, `optionalpha.com`,
   `optionstrat.com`, `wingmantracker.com`** (in each case the `www.` host is
   already allowlisted and 301/308s to a refused apex, so one addition per site
   turns a dead redirect into a real page), plus **`tiblio.com`,
   `puthouse.com`, `quantwheel.com`** (refused outright), plus our own
   `deltamint.app` / `dashboard.deltamint.app`. **`barchart.com` is no longer an
   allowlist question** — it is allowlisted and reachable, and its origin now
   answers every GET with an AWS WAF challenge, so no allowlist change helps.
   Ranked by value to this file: `tiblio.com` first, `marketchameleon.com`
   second (it is the ATM-bid-ask-spread comparison row in backlog #2).
10. **NEW — the sequencing decision, and the one that blocks the other nine.**
    Decide whether `paper_only` and `demo_mode` come off before any price is
    charged, or whether the product is priced as a paper-only tool. As it
    stands the $29 tier is defined by a live account and every one of its listed
    features is switched off for live accounts, so the tier cannot be sold at
    any number. The recommendation: **leave both switches on, do not turn
    `billing_visible` on, and treat "Alpaca live approval + `paper_only` off" as
    the single gate the price waits behind** — because charging for a tier whose
    contents are administratively disabled is the one pricing mistake that
    produces refunds and a chargeback history before it produces revenue.
11. **NEW — whether $29 is re-opened, and on what evidence.** The owner has
    said the product has grown and the figures may be revised. This file's
    recommendation is to **hold $29 / $290 and not re-derive it now**: the
    growth since 2 Sep (whole-market universe scan, the option chain made
    tradeable end to end, index-option-aware history, saved order tickets, the
    Orders card rebuild, per-account digests, a corrected daily equity series)
    is real and would support a higher number against Tiblio's $34.95 — but
    with **zero paying users and no new signups in three weeks** there is no
    demand signal to price against, and a number revised upward on features
    rather than on willingness to pay is the same mistake as the old $39 page
    in the other direction. **Re-open it at the first three paid
    subscriptions, not before.** If the owner wants a figure revised now, the
    honest lever is the *annual* discount, not the monthly.

## 7. What would move this file

- Any of the blocked hosts allowlisted → a `reported` row becomes
  `verified` in one fetch. (`barchart.com` excepted — see decision 9.)
- **An owner screenshot of `www.barchart.com/membership-comparison`** → settles
  the disputed annual price, which is the only anchor number in this file that
  moved since 2 Sep.
- **A price on PutHouse's automation** → the only figure that tells us whether
  $59 for automation on Alpaca is under or over the market.
- The first three live connections after the switch → the first demand
  signal this file has ever had.
- The published fee schedule read → a schedule saying anything but $29 is
  a launch blocker.
- **Any new signup at all.** Four users and no arrivals in three weeks is the
  fact that makes every number in this file theoretical; the ranking criterion
  in `backlog.md` is degenerate for the same reason.
