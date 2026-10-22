---
title: "Rolling a protective put: two legs, one debit, a new floor"
slug: roll-protective-put
excerpt: Rolling a protective put sells the put that hedges a stock position and buys a later one, for a net debit that buys a new floor at that day's price.
meta_description: "Rolling a protective put sells the old put and buys a later one. A worked example: the net debit, the new break-even, and the gap if the legs fill apart."
author: Osama Safwat Maghawry
category: hedging
series_order: 38
tags: protective put, rolling options, hedging, put option, net debit
---

**Rolling a protective put** means selling the put that hedges a stock position before it expires and buying a later-dated put in its place, usually on one order that costs a net debit. The sale ends one floor and the purchase starts another, at whatever the new put costs that day.

This post continues the [hedging series](/blog/hedging) with the lot from the [protective put post](/blog/protective-put-explained): 100 XYZ shares bought at $48.00 and a 46 put bought for 0.79. That post ended on renewing the floor. This one prices the roll leg by leg, and it describes the mechanics without suggesting anyone roll anything.

## Key takeaways

- **A roll is two legs.** A sell to close on the old put and a buy to open on the new one, netted into one debit.
- **The debit is a bid against an ask.** What the old put fetches at its bid is subtracted from what the new one costs at its ask.
- **It is a new hedge, not the old one continued.** The old put's loss or gain is realized on the roll, and the new floor is bought at that day's price.
- **The running premiums move the numbers.** Break-even and maximum loss carry every premium paid on the lot, less what the sale brought back.
- **Legs filled apart leave a gap.** Between the two fills the lot holds no put or two, and the debit is not known until both are done.

## What does it mean to roll a protective put?

A protective put is one long put held against 100 shares of the same stock. Rolling it is two trades on the same contract count:

- **Sell to close the old put.** The account sells the put it holds, at the bid, and receives whatever value is left in it.
- **Buy to open a new put.** The account buys a put with a later expiration, at the ask, often at the same strike and sometimes at another.
- **Net the two.** The difference between the two prices is the roll's cost, shown on a combined ticket as one debit.

At the same strike, a later put is worth at least as much as a nearer one, so a same-strike roll of a long put is a debit. That is the reverse of the short-option roll in the [rolling options post](/blog/rolling-options-explained), where the later option is sold and the ticket can show a credit. The legs here are the ones a [calendar spread](/blog/calendar-spread-explained) uses: sell the nearer contract, buy the later one.

On one ticket, a roll looks like the old hedge extended. In the account it is not. The old put is closed, and its result, the price paid against the price sold, is realized that day.

The new put is a separate contract with its own premium, its own expiration and its own break-even, bought at the price the market sets that morning. Nothing about the first purchase carries into the second except the cash it cost.

## What does rolling a protective put cost?

The numbers below are hypothetical, priced with the series' Black-Scholes fit at 40% implied volatility, no interest rate and no dividend. The quotes are model estimates, not market data.

The trader bought the 30-day 46 put for 0.79 with XYZ at $50.00. Twenty-five days later XYZ trades at $47.00 and the put has five days left. The chain shows two quotes:

- **The old 46 put, five days left.** 0.42 bid, 0.50 ask, around a model value of 0.46.
- **A new 46 put, 35 days out.** 1.78 bid, 1.88 ask, around a model value of 1.83.

At the natural price, selling at the bid and buying at the ask, the roll costs 1.88 − 0.42 = 1.46 a share, or $146 for the contract. At the midpoints it would be 1.83 − 0.46 = 1.37. The 0.09 between the two is the [bid-ask spread](/blog/options-bid-ask-spread) crossed once on each leg: 0.04 on the old put and 0.05 on the new one.

![A hypothetical protective put roll nets a 0.42 sale of the old five-day put against a 1.88 purchase of a new 35-day put, for a 1.46 debit a share.](/assets/blog/roll-protective-put-two-legs.svg)

With XYZ at $47.00, both puts are out of the money, so neither has [intrinsic value](/blog/intrinsic-vs-extrinsic-value-options). Every cent of both prices is time value, and the roll gives back a little of it to buy a lot more:

- **The old put has about 0.46 of time value left.** It is losing value fastest in its last days, as [theta](/blog/theta-decay-explained) does near expiration, and with XYZ above 46 at the close it would expire worth nothing. Selling it recovers that remainder, less the spread.
- **The new put's 1.83 is 35 days of time value.** It is set by the stock's distance from the strike and by [implied volatility](/blog/implied-volatility-options-explained) on the day of the roll, not by what the first put cost.
- **The ticket is the difference.** The 1.46 debit is the price of 35 days of new cover, less what the old put's last five days were still worth.

The old put's own result is booked separately. The account paid 0.79 for it and sold it for 0.42, a realized loss of 0.37 a share, or $37, on the day of the roll. The ticket shows only the net debit, but the account history carries the two legs as two trades.

## What changes after the roll?

The floor stays at $46.00, and almost everything around it is new. Premiums on the lot now total 0.79 − 0.42 + 1.88 = 2.25 a share, or $225: the first put's cost, less what its sale returned, plus the new put's cost.

The table sets the lot before the roll beside two versions of it. The second roll goes down to a 35-day 43 put, quoted 0.73 bid and 0.81 ask around a model value of 0.77, so its debit is 0.81 − 0.42 = 0.39.

| Against the $48.00 share cost | Old 46 put held | Rolled to the 35-day 46 put | Rolled to the 35-day 43 put |
| --- | --- | --- | --- |
| Roll ticket | None | 1.46 debit, $146 | 0.39 debit, $39 |
| Net premiums paid on the lot | 0.79 | 2.25 | 1.18 |
| Floor | $46.00 | $46.00 | $43.00 |
| Cover ends | In 5 days | In 35 days | In 35 days |
| Maximum loss | $2.79 a share, $279 | $4.25 a share, $425 | $6.18 a share, $618 |
| Break-even | $48.79 | $50.25 | $49.18 |

Read down the same-strike column and four things have moved:

- **The expiration.** The floor now runs for 35 more days instead of five.
- **The break-even.** It rises by the debit, from $48.79 to $50.25, because the shares now have to recover every premium paid on the lot.
- **The maximum loss.** It rises by the same 1.46, from $2.79 to $4.25 a share. The gap from cost to the floor is unchanged; the cost of holding the floor has grown.
- **The price of the floor.** The new put was bought with XYZ $1.00 above the strike, not $4.00 above it as with the first. At $47.00 a 30-day 46 put would be about 1.66 at the model, against about 0.75 at $50.00, so most of the jump comes from the stock's fall, and the five extra days add the rest.

The 43 column shows a trade-off, not a better choice. The lower strike costs less because it covers less: the debit falls to 0.39, and $5.00 a share below cost is left with the account before the floor, against $2.00 at the 46 strike. The break-even comes out lower and the maximum loss higher, in the same move.

Repeated at each expiration, these premiums become the kind of running cost the [tail risk hedge cost post](/blog/tail-risk-hedge-cost) adds up over a year.

## What if the two legs fill apart?

A roll entered as one combined order, at a net limit, fills both legs together or not at all. (With several contracts, a combined order can fill some rolls and not others, but each filled roll has both legs.) Many brokers accept that form for a long-put roll, the same order type as a calendar spread, though whether a given account can use it, and on what terms, is set by the broker.

A combined order has its own limit. A net limit of 1.46 fills only if the two quotes still allow it, and if they move apart the order sits unfilled. Meanwhile the lot keeps the old put, its five-day clock still running, and nothing about the roll has happened yet.

Entered as two separate orders, the legs fill at different moments. For the time between them, the lot is hedged differently from both the position before the roll and the one after it.

![Filled as one order the old put hands straight over to the new one, while legs filled apart leave either a stretch with no floor or a stretch with two puts.](/assets/blog/roll-protective-put-legging-gap.svg)

Two cases, both starting from XYZ at $47.00 with the quotes above:

- **Old put sold first, then XYZ falls.** The 0.42 is in the account and the lot has no put. If XYZ drops to $45.00 before the new order fills, the shares lose $200 with nothing against them, and the 35-day 46 put is now quoted 2.73 bid and 2.83 ask (model 2.78), 0.95 more at the ask. Bought there, net premiums on the lot come to 3.20, the maximum loss against cost to $5.20 and the break-even to $51.20. Held instead, the old put would be worth about 1.44 at the model.
- **New put bought first, then XYZ rises.** The 1.88 has gone out, and for a while the lot holds two puts: one against the shares and one with nothing under it, a plain long put that gains as XYZ falls. If XYZ rises to $49.00 before the old put is sold, its bid drops to about 0.06 (model 0.09). Net premiums come to 2.61, the maximum loss to $4.61 and the break-even to $50.61.

Neither direction is a rule. The stock could as easily move the other way between the fills, and the second leg would come out cheaper. What the gap does is leave the net debit, and in the first case the floor itself, unsettled until the second leg fills.

With more than one contract the same thing can happen in smaller pieces. A separate order can fill partly, leaving some shares under the new put, some under the old one and, in the first case, some with no put at all.

## Frequently asked questions

- **What happens if a protective put is left to expire instead?** If XYZ closes above 46, the put expires worthless, its remaining value is not recovered, and the account holds 100 unhedged shares until another put is bought, as the [protective put post](/blog/protective-put-explained) shows. Below the strike it is usually exercised and the shares sold at 46, under the rules in [what happens at options expiration](/blog/what-happens-options-expiration).
- **Is rolling a protective put a credit or a debit?** At the same strike and a later date it is a debit, because the later put is worth at least as much. A roll down to a lower strike costs less and, with the old put deep in the money, can occasionally bring in a credit.
- **Does rolling keep the protection continuous?** Only if both legs fill at once, and even then one floor ends and another starts at a new price, with an expiration as fixed as the first.
- **Can the strike change in a roll?** Yes. A higher strike costs more and raises the floor; a lower strike costs less and lowers it, as the 43 column shows.
- **Is the old put's loss realized on the roll?** Selling to close realizes that put's gain or loss on the day of the sale. How it is treated for tax is a question for a tax professional.

## The bottom line

Rolling a protective put sells what is left of one hedge and buys another. The net debit is the old put's bid against the new put's ask. On the hypothetical lot above, it moved the break-even from $48.79 to $50.25 and the maximum loss from $2.79 to $4.25 a share, with the floor unchanged at $46.

The roll is a new hedge, not the old one extended: the first put's loss is realized, and the second is bought at that day's price. Filled together, the legs leave no gap. Filled apart, they leave the lot unhedged or hedged twice between the fills, and the debit unknown until both are done.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
