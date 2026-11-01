---
title: "Buy-write strategy: buying shares and selling the call in one order"
slug: buy-write-strategy
excerpt: A buy-write buys 100 shares and sells a call against them in one order at one net price, and once filled it is a covered call with a new lot of shares underneath.
meta_description: "Buy-write strategy on one hypothetical stock: one net debit, the break-even and cap, the price risk of legging in, and which lot is called away."
search_title: "Buy-Write Strategy: Net Debit, Break-Even and Assignment"
author: Osama Safwat Maghawry
category: investing
series_order: 45
tags: buy write, covered call, assignment, cost basis, investing
---

The **buy-write strategy** is the purchase of 100 shares and the sale of one call option on those same shares, entered together as a single order priced as one net debit: the share price paid less the call premium received. Once it fills, the account holds a [covered call](/blog/covered-call-explained). What makes a buy-write its own thing is how it opens, and what the new shares mean for an account that already holds the stock.

This is the fifth post in the [options for investors](/blog/investing) series. It uses the same hypothetical as the earlier ones: XYZ at $50.00, no dividend, implied volatility 30% and a 4% rate. The call prices are model values, not quotes, and nothing here says that anyone should open a buy-write.

**Key takeaways**

- **One order, one price.** Each package of 100 shares and one call fills at the net debit or not at all: the legs of a package are never split.
- **The net debit is the break-even.** Shares at 50.00 less a 1.38 call is 48.62.
- **The upside stops at the strike.** Above 52, the shares' rise belongs to the call holder.
- **On a long-term holding, the new lot is not the only lot.** If the call is assigned, the account's lot method decides which 100 shares leave, and that can be the oldest ones.

## How a buy-write order works: one net debit for both legs

A buy-write ticket has two legs: buy 100 XYZ, sell one XYZ call. It carries one limit, stated as a net debit per share. A limit of 48.62 says: buy the shares and sell the call, provided the shares cost no more than 48.62 after the call premium is subtracted.

The alternative is **legging in**: buying the shares with one order and selling the call with another. Nothing is wrong with that, but the two prices are set at different moments, and the call's price moves with the stock in between. Here is what the gap does in the hypothetical, with the shares bought at 50.00 and a 45-day 52 call sold afterwards:

- **The stock holds at 50.00.** The call is sold at 1.38, and the net is 48.62, the same as the package.
- **The stock slips to 49.00 first.** The call is worth about 1.02 by then. The net becomes 48.98, and the most the position can make at expiration falls from $338 to $302.
- **The stock rises to 51.00 first.** The call is worth about 1.81. The net becomes 48.19, and the maximum at expiration rises to $381.

The two moves land on opposite sides of the package: a dip before the call is sold leaves a higher net and a lower maximum, a rise leaves a lower net and a higher one, because the shares were already bought at 50.00 and only the call's price moved. Nobody knows which way the stock will go between the orders, and the gap might be seconds or a week; only its length changes, not the arithmetic.

The combination order removes that uncertainty by refusing to fill one leg without the other. It does not remove the bid-ask spread, which a buy-write still pays on both legs (see [the options bid-ask spread](/blog/options-bid-ask-spread)), and how a broker routes the two legs is set out in its own order-type documentation.

## Worked example: a 48.62 break-even and a cap at 52

Take the package at the model prices. A hypothetical investor buys 100 XYZ at $50.00, paying $5,000, and sells one 45-day 52 call at 1.38, receiving $138, in a single buy-write order. The net debit is $5,000 - $138 = $4,862, or 48.62 per share. That is the cash that leaves the account for the pair, and the cost every figure below is measured from.

Three numbers follow from that. The break-even at expiration is 48.62. The most the position can end ahead is (52.00 - 48.62) × 100 = $338, reached at 52 and unchanged above it. And the shares alone would do better than the buy-write only above 53.38, the strike plus the premium.

![At expiration on a hypothetical XYZ, the buy-write crosses zero at 48.62, rises to +338 at the 52 strike and stays flat there, while 100 shares alone keep rising and pass it above 53.38.](/assets/blog/buy-write-payoff.svg)

At five closing prices on expiration day, before commissions:

| XYZ at expiration | The call | Buy-write | 100 shares alone |
| --- | --- | --- | --- |
| 40 | Expires worthless | -$862 | -$1,000 |
| 45 | Expires worthless | -$362 | -$500 |
| 50 | Expires worthless | +$138 | $0 |
| 52 | At the money; normally not exercised | +$338 | +$200 |
| 56 | Assigned at 52 | +$338 | +$600 |

The premium cushions the fall by exactly $138, and nothing more: at 40 the buy-write is still down $862. At 56 the shares leave at 52, the $400 between 52 and 56 goes to the call holder, and the account holds $5,200 in cash and no XYZ, as in [covered calls after assignment](/blog/covered-call-after-assignment). The [assignment post](/blog/option-assignment-what-happens) covers how the notice arrives.

## Buy-write vs covered call: the same position, different shares

The account does not remember how the position was opened. The day after the fill it shows 100 shares and one short call, and every mechanic in the [covered call post](/blog/covered-call-explained) applies: the cap, the premium kept however the call ends, and the three ways the call can leave. A covered call written on shares already held is the same pair of lines.

What differs is the shares underneath:

| | Buy-write | Legging in | Call on shares already held |
| --- | --- | --- | --- |
| Orders | One, priced as a net debit | Two, priced separately | One, the call alone |
| Price risk between legs | None: both fill or neither | The call can move before it is sold | None: shares already held |
| Cost of the shares | Today's price, 50.00 | Today's price | Whatever was paid, perhaps years ago |
| Holding period of the shares | Starts today | Starts today | Already running |
| If assigned at 52 | A gain or loss measured from 50.00, with no other XYZ in the account | The same | A gain or loss measured from the old cost |

From the moment the call is sold, all three move the same way with the stock. The last two rows are where a long-term holder's account differs, and they are about records, not the payoff.

## Which shares are called away when a buy-write is assigned?

A buy-write on a stock the account already holds adds a new lot beside the old one. Say a hypothetical investor has held 100 XYZ for several years at a cost of $30.00 a share, and opens the buy-write above. The account now shows 200 shares, two lots, and one short 52 call.

![Two lots of 100 XYZ, an old lot at cost 30 and a new lot at cost 50, sit under one short 52 call, and assignment delivers 100 shares from whichever lot the account's lot method selects.](/assets/blog/buy-write-which-lot.svg)

The call does not belong to the new lot. A short call is covered by any 100 shares in the account, and if it is assigned, the shares delivered are relieved from a lot chosen by the account's cost-basis method. Many accounts default to first in, first out, which would take the old lot, unless the holder designates a specific lot in time under the broker's rules.

The two outcomes are the same in cash and different on paper:

- **The old lot is delivered.** The sale at 52 realises $2,200 on the shares bought at 30, plus the $138 premium, which on assignment is generally added to the sale proceeds: $2,338, generally long-term if the shares were held more than a year. The new lot stays, at a cost of 50.
- **The new lot is delivered.** The sale realises $200 on the shares, plus the same $138 premium: $338, generally short-term for shares held 45 days. The old lot stays, with its unrealised gain intact.
- **Either way, 100 shares are gone.** Keeping the same exposure afterwards means buying shares again at the market price, which at 56 is above the 52 the call delivered them for.

Two more tax points exist, and this post does not settle them. The premium is treated differently if the call expires or is bought back instead: it is then generally a short-term gain or loss on its own. And a call that is not a "qualified covered call", for example one with 30 days or fewer to expiration or one too deep in the money, can bring in the US straddle rules, which can affect the shares' holding period. This post is not tax advice; how any of this applies to one person is a question for a tax professional.

Related: the [married put tax post](/blog/married-put-tax) works through the put-side version of the same question: one lot, an option added beside it, and the dates and fills a tax professional will ask for.

XYZ pays no dividend here. A dividend changes both the arithmetic and the [early exercise](/blog/early-exercise-options) question, and it gets its own post in this series.

## Frequently asked questions

- **Is a buy-write the same as a covered call?** Once it fills, yes. "Buy-write" names the way it opens: shares bought and the call sold together in one order.
- **What is the break-even on a buy-write?** The net debit: the share price less the call premium, 48.62 in the example, before commissions.
- **Can one leg of a buy-write fill without the other?** Not as a combination order: it fills as a package or not at all, though a multi-lot order can fill some whole packages and not others. Legging in, with two separate orders, can leave the shares bought and the call unsold.

## The bottom line

A buy-write buys 100 shares and sells a call against them at one net price. In the hypothetical, 50.00 less 1.38 gave a 48.62 break-even, a $338 most at expiration, and a cap that leaves the shares alone ahead above 53.38. Legging in reaches the same structure at a price set by whatever the stock does between the two orders.

After the fill it is a covered call. On an account that already holds the stock, it is also a second lot, and an assignment takes 100 shares from whichever lot the account's method selects. Every figure on this page is hypothetical and there to show the mechanics.

For the income view of the same position, see [covered call explained](/blog/covered-call-explained); for the put-side route into shares, see [selling puts to buy stock](/blog/sell-puts-to-buy-stock). This post is educational and is not investment advice.
