# Positioning and market

Where DeltaMint sits, and why. Written from public evidence rather than
ambition — the uncomfortable findings are kept deliberately.

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
| Price walking on limit orders | **Table stakes** — real, but a competitor already markets it as a headline feature |
| Portfolio statistics | **Conditional** — commodity if it is profit and loss; differentiated only when structure-aware |
| Opportunity screening | **Commodity** — every player has a scanner |
| Pre-trade return on risk | **Commodity** — a competitor gives this away free |

The through-line: competitors optimise the **single-trade lifecycle** — find,
evaluate, place. DeltaMint's differentiated features all sit on the **portfolio
lifecycle** — hold, manage, exit. Those are different products, and only one of
those halves is contested.

## Honest weaknesses

- **No data moat.** No historical archive, so no credible backtesting story.
  Defensibility must come from integration depth and operational trust, both
  earned slowly and neither purchasable.
- **Alpaca is a smaller pond.** Every competing automation product integrates
  tastytrade, Tradier, Schwab or TradeStation; none leads with Alpaca. That is
  genuine white space, but the retail options traders with real size are
  concentrated on the other platforms. Being first can mean uncontested or it can
  mean fishing where there are fewer fish — worth establishing empirically before
  betting the roadmap.
- **Squeezed from both sides.** Brokers ship features downward for free; data
  vendors price upward. Switching costs are near zero for analysis tools and only
  moderate for automation.
