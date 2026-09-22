# Positioning and market

Where DeltaMint sits, and why. Written from public evidence rather than
ambition — the uncomfortable findings are kept deliberately.

Competitor prices, integrations and feature sets below were checked against
public sources in August 2026. They age; re-check before planning against them.
The `market-watch` agent (`.claude/agents/market-watch.md`) exists to do exactly
that on a schedule and propose edits here — this file is its output, and nobody
should be planning against a figure it has not re-verified.

**Re-check, 22 September 2026 (vp-product).** Two facts in this file changed and
are corrected below: what PutHouse actually is, and what Alpaca now lists. One
thing about *how* this file can be maintained changed too, and it is worth
knowing before anyone plans a re-verification: **no competitor site is directly
fetchable from this environment today.** Barchart — the only vendor page we had
ever fetched at source — went behind an AWS WAF challenge after 1 September;
Market Chameleon, OptionStrat, Option Alpha and Wingman are all allowlisted on
`www.` and redirect to an apex that is not, so the redirect dies at the hop;
Tiblio, PutHouse and QuantWheel are refused outright. See
`docs/context/reachable.md`. Everything competitor-side is therefore `reported`
via WebSearch until an apex is allowlisted — with one exception worth
remembering: **`alpaca.markets` is reachable, and Alpaca publishes capability
write-ups of the apps that integrate its API**, which is how a blocked
competitor's behaviour can still be sourced `verified` from the broker.

**One correction, August 2026, kept because the reasoning still binds:** this
file used to say PutHouse was "already through Alpaca's OAuth compliance
review". That was inferred, not checked, and the sentence is gone (see the
rewritten PutHouse entry below). Approval is not what makes an OAuth app
function — see `compliance.md` — so a competitor running the flow proves only
that their app is published. **Treat any competitor's Alpaca approval status as
unknown** unless a source states it.

## The market, honestly sized

There is no measurable "multi-leg options strategies market"; nobody clears or
reports that as a category. What exists is a very large *activity* and a very
small *software revenue pool*, and conflating them is how this analysis usually
goes wrong.

**The activity is large and growing.** Complex and multi-leg orders are roughly
30–40% of US options volume — a third of everything traded, not a niche. Zero
days to expiry reached 24.1% of 2025 volume, up from 21.5% in 2024, and a record
110 million contracts cleared in a single day in October 2025.

**The revenue is not where the volume is.** Robinhood earns roughly $300M from
options in a single quarter. tastytrade did $58.2M in exchange-traded
derivatives in three months to November 2025, growing 46% year on year, inside
IG Group's £1.12B. The entire independent retail options tooling layer prices at
$9–99 per month. Brokers capture the value of the volume that tools help create.

Anyone building here is selling a subscription against a hobby budget, not
taking a share of a large flow. That is a real business, but a thin-margin one.

## Who else is in it

| Segment | Who | How they earn |
| --- | --- | --- |
| Execution and custody | tastytrade, Interactive Brokers, Schwab, Robinhood, Webull | Order flow, commissions, margin |
| API / embedded brokerage | Alpaca, Tradier, Interactive Brokers | Per-account and per-trade fees |
| Visualisation and analytics | OptionStrat, Market Chameleon, Barchart, ORATS | $9–29/mo subscription |
| Flow and sentiment | Unusual Whales, Cheddar Flow | $29–99/mo subscription |
| Backtest and automation | Option Alpha, Option Omega, TradeSteward | Tiered subscription |

No revenue, share or subscriber figures exist publicly for that software layer —
every player is private with no disclosure obligation. Any figure quoted for them
is scraped-traffic guesswork and should not be planned against.

Note also that brokers ship this functionality downward for free: thinkorswim,
tastytrade's own platform and IBKR all bundle strategy builders and analytics.
Independent tools live in the gap between what brokers bundle and what serious
traders want, and that gap narrows each year.

### The closest competitor, named

**Tiblio**, roughly $35/month, is the nearest thing to a direct competitor and
should be treated as one. It screens spreads and iron condors, connects by OAuth
to Schwab, Tradier, TradeStation, tastytrade **and Alpaca**, routes orders to the
connected broker, and tracks open and closed positions with profit and loss and
per-strategy win rates. That is screen → order → hold → measure, on our broker,
already shipping and cheaper than most of the analytics layer.

Its documented limit is the opening: credit and debit spreads must be logged
**leg by leg**, with alerts configured per component. The tool that will fire the
spread order for you cannot hold the spread as one object once it fills.

**But its broker link is a bot, not a button.** Tiblio sends orders to the
connected broker "every 10 minutes, on your rules" — unattended automation on a
timer. No screener documented here puts an order control on a ranked row for a
person to look at and press. That distinction is checkable and it is where the
"ease" claim actually lives.

**PutHouse** — corrected 22 September 2026, and it is more than a second name on
the list. It is **an automated wheel bot on Alpaca**: covered calls and
cash-secured puts run *"from entry to exit without requiring manual order
placement"*, through Alpaca's Trading and Market Data APIs, sizing trades
automatically and screening on volatility risk premium, RSI and upcoming
earnings and corporate events, under preset modes or user-defined criteria, with
AI-generated explanations of why each trade was placed **or skipped**. Source:
Alpaca's own announcement of the integration, 27 July 2026, fetched directly
(`alpaca.markets/blog/puthouse-integrates-with-alpacas-trading-api-to-automate-options-income-strategies`)
— `verified`, and the vendor's own site is unreachable from here.

Three consequences, none of them comfortable:

- The **automation** roadmap slot — `docs/product/pricing.md` §4's "Live +
  Automation, $59" — is occupied on our own broker, by something the broker
  itself has publicly vouched for. Any plan that assumed first-mover on
  automation-via-Alpaca is void.
- It competes for the **wheel** user specifically, which is the strategy whose
  reading *and* writing halves we have just finished building.
- The "first on Alpaca" framing was already gone; what is new is that broker
  choice now confers a *disadvantage* in one category — a prospect comparing
  wheel tools on Alpaca finds an automated one and a manual one.

Its **price is unknown** — no reachable source publishes one. Its **OAuth and
approval status remain unknown too**: Alpaca's post describes the *Trading API*,
which is keys, not necessarily Alpaca Connect. The August correction below
(approval was inferred, not checked) still stands and is not superseded by this
one.

Adjacent: **QuantWheel** routes to tastytrade; **Option Alpha** runs entries,
exits and rolls through Tradier and TradeStation, free to users who route there;
**TradeSteward** builds bots for Schwab, tastytrade, Tradier and TradeStation.

All three, and Tiblio, are **rule runners** — the user configures conditions and
the software fires on a schedule. DeltaMint is a place the user looks and
decides. That is a real difference in posture, but it is a preference, not a
moat; do not plan against it as defensibility.

## What the market rewards

- **Removing a constraint, not adding a view.** Execution and management, not
  signals or opinions. Automation is the only category answering a problem the
  customer cannot solve by paying more attention.
- **Proprietary data with real acquisition cost.** Historical option chains are
  expensive to license and painful to serve; an archive is the only genuine moat
  visible in the retail layer.
- **Broker integration breadth.** Each one is slow and compliance-gated, which is
  precisely why it is defensible once held.
- **Reliability as the feature.** Once software places real orders, trust
  dominates the purchase decision and is earned slowly.

## Where DeltaMint's edge actually is

Scored against the above, not against effort spent.

| Feature | Verdict |
| --- | --- |
| Real-time comprehension of many holdings | **Real edge** — removes a scaling constraint; pain grows with position count, so per-trade tools never feel it |
| End-of-session assignment de-risking | **Real edge** — runs when the user cannot, against a quantifiable loss; more valuable as 0DTE share rises. **Not yet built.** |
| Grouping legs into structures | **Foundation** — the primitive the two above depend on; pairing by order provenance rather than guessing strikes is a genuine technical position |
| Price walking on limit orders | **Table stakes, and that understates it** — Schwab ships WALK LIMIT® as a native order type on thinkorswim, built for multi-leg orders with wide spreads. Not a competitor's feature to be beaten; a broker's order type to be matched |
| Portfolio statistics | **Conditional** — commodity if it is profit and loss; differentiated only when structure-aware |
| Constructing candidates from ranges | **Commodity output, better plumbing** — the sweep builds structures from delta and width targets rather than filtering a chain, and prices them at short bid − long ask rather than mid. Real engineering, but Market Chameleon exposes per-leg delta filters over pre-enumerated spreads, so the *customer-visible output* is the same thing: a ranked list of spreads matching delta and width criteria. Do not market this as a differentiator. The executable pricing is the only part a user would feel, and it only shows up as fills matching the screen |
| Opportunity screening (filtering chains) | **Commodity** — and more so than assumed. Barchart alone gives away ~10 dedicated multi-leg screeners (short and long iron condor, all four verticals) with legs, max profit, max loss and probability of loss; Market Chameleon covers 18 spread types at $69–99/mo. **Updated 22 Sep 2026:** the *universe* half of the gap is closed — we now sweep every listed US equity behind a price band, a shares-traded floor, a share-quote-width cap and a capital-per-contract cap (`_shared/universe.ts`), not just an S&P 500 list. The *liquidity* half is not: Market Chameleon exposes **ATM bid-ask spread** as a screener filter and Barchart shows bid and ask per spread leg (both `reported`, WebSearch), while our results table shows neither and our width sieve measures the **share's** quote, not the option's. Closing a universe gap did not make this less of a commodity |
| Pre-trade return on risk | **Commodity** — a competitor gives this away free |

The through-line: competitors optimise the **single-trade lifecycle** — find,
evaluate, place. DeltaMint's differentiated features all sit on the **portfolio
lifecycle** — hold, manage, exit. Those are different products, and only one of
those halves is contested.

### The chain is not the differentiator

It is tempting to argue that the features above undercount the product because
customers buy the *chain* — screen → order → grouped position → worked exit —
and that no competitor closes that loop. The evidence does not support it.
Tiblio closes it today, on Alpaca, for $35. Price walking is a broker order
type. Screening is free at Barchart. Every individual link, and the fact of the
links being joined, is already purchasable.

What survives scrutiny is narrower and better: competitors are strong from
screen to fill and weak immediately after it. The structural, portfolio-level
view of many concurrent positions — legs paired by order provenance, statistics
computed against peak concurrent collateral — is the claim no competitor's own
documentation contradicts. Marketing should lead with what happens *after* the
fill, not with the completeness of the chain, because the second claim is
falsifiable in one search and the first is not.

## Honest weaknesses

- **No data moat.** No historical archive, so no credible backtesting story.
  Defensibility must come from integration depth and operational trust, both
  earned slowly and neither purchasable.
- **Alpaca is a smaller pond, it is not empty, and it is deepening.** Every
  competing automation product integrates tastytrade, Tradier, Schwab or
  TradeStation, and none of them *leads* with Alpaca — but Tiblio already
  supports it via OAuth and PutHouse automates the wheel on it, so the white
  space is narrower than previously recorded. **The pond itself grew on 2 Sep
  2026:** Alpaca turned on **live** trading for index options via the Trading
  API — SPX, SPXW, VIX, VIXW, DJX and XSP — cash-settled, European-style (no
  early assignment), with Section 1256 tax treatment on certain broad-based
  contracts (verified: `alpaca.markets/blog/alpaca-launches-index-options-via-trading-api`,
  fetched directly 22 Sep). That is the first thing in a year to make broker
  choice an *advantage* rather than a tax: it removes assignment — the risk this
  file names as our un-built edge — and §1256 is the only tax-shaped reason a
  trader moves a book. Our history reconstruction already knows the cash-settled
  roots; the Scanner cannot reach them. Backlog #3. The retail options traders
  with real size remain concentrated on the other platforms. Being first can mean
  uncontested or it can mean fishing where there are fewer fish — worth
  establishing empirically before betting the roadmap.
- **Squeezed from both sides.** Brokers ship features downward for free; data
  vendors price upward. Switching costs are near zero for analysis tools and only
  moderate for automation.
