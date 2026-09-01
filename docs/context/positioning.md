# Positioning and market

Where DeltaMint sits, and why. Written from public evidence rather than
ambition — the uncomfortable findings are kept deliberately.

Competitor prices, integrations and feature sets below were checked against
public sources in August 2026, with Tiblio, Puthouse, QuantWheel, Unusual
Whales and Barchart's screener count re-checked September 2026. They age;
re-check before planning against them.
The `market-watch` agent (`.claude/agents/market-watch.md`) exists to do exactly
that on a schedule and propose edits here — this file is its output, and nobody
should be planning against a figure it has not re-verified.

**One correction, August 2026:** the note below that Puthouse is "already
through Alpaca's OAuth compliance review" was inferred, not checked. Approval is
not what makes an OAuth app function — see `compliance.md` — so a competitor
running the flow proves only that their app is published. Treat their approval
status as unknown.

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

Its documented limit *was* the opening: its P/L-alerts docs still describe
credit and debit spreads logged **leg by leg**, with alerts configured per
component — but its v2 rebuild (launched 1 Apr 2026) says the trade journal
now "supports stocks, single options, multi-leg spreads, and crypto."
**Unresolved as of September 2026** — `tiblio.com` is unreachable from this
environment (see `reachable.md`), so this could not be read directly. Do not
market the "cannot hold the spread as one object" claim until someone opens
`tiblio.com/docs/trade-journal/` in a browser.

**But its broker link is a bot, not a button.** Tiblio sends orders to the
connected broker "every 10 minutes, on your rules" — unattended automation on a
timer. No screener documented here puts an order control on a ranked row for a
person to look at and press. That distinction is checkable and it is where the
"ease" claim actually lives.

**Puthouse** is a second Alpaca-connected options tool, connecting via Alpaca's
Trading API (confirmed by Alpaca's own 27 Jul 2026 blog post); its OAuth
compliance approval status is unknown, per the correction above. Two
Alpaca-connected competitors either way means the "first on Alpaca" framing is
gone entirely — plan on the assumption that broker choice confers no
advantage.

Adjacent: **QuantWheel** has repositioned broker-agnostic across 10+ brokers,
**read-only by default, not an autotrader** — it sells roll management,
journaling and automatic assignment detection (cycling cash-secured put →
covered call), i.e. post-fill portfolio management, not rule-running
(re-checked September 2026; was "routes to tastytrade" as of August). **Option
Alpha** runs entries, exits and rolls through Tradier and TradeStation, free to
users who route there; **TradeSteward** builds bots for Schwab, tastytrade,
Tradier and TradeStation.

Tiblio, Option Alpha and TradeSteward are **rule runners** — the user
configures conditions and the software fires on a schedule. DeltaMint is a
place the user looks and decides. That is a real difference in posture, but it
is a preference, not a moat; do not plan against it as defensibility.

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
| Opportunity screening (filtering chains) | **Commodity** — and more so than assumed. Barchart alone gives away 27 dedicated multi-leg screeners (6 butterfly, 6 condor, 6 horizontal, 4 vertical, 4 straddle/strangle, 1 collar — verified at source September 2026, was undercounted at "~10") with legs, max profit, max loss and probability of loss; Market Chameleon covers 18 spread types at $69–99/mo |
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
computed against peak concurrent collateral — was the claim no competitor's own
documentation contradicted. **Contested as of September 2026:** QuantWheel and
Unusual Whales' Portfolio Manager both now ship post-fill position tracking
across a broker link; neither is yet confirmed to compute structure-aware
statistics against peak concurrent collateral specifically, so the narrow claim
may still hold, but the category is no longer empty and this needs a closer
look before it ships in marketing again. Lead with what happens *after* the
fill only once that comparison is redone; the completeness-of-the-chain claim
remains falsifiable in one search.

## Honest weaknesses

- **No data moat.** No historical archive, so no credible backtesting story.
  Defensibility must come from integration depth and operational trust, both
  earned slowly and neither purchasable.
- **Alpaca is a smaller pond, and it is not empty.** Every competing automation
  product integrates tastytrade, Tradier, Schwab or TradeStation, and none of
  them *leads* with Alpaca — but Tiblio already supports it via OAuth, so the
  white space is narrower than previously recorded. The retail options traders
  with real size remain concentrated on the other platforms. Being first can mean
  uncontested or it can mean fishing where there are fewer fish — worth
  establishing empirically before betting the roadmap.
- **Squeezed from both sides.** Brokers ship features downward for free; data
  vendors price upward. Switching costs are near zero for analysis tools and only
  moderate for automation.
