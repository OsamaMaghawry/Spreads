---
title: "Selling puts to buy stock: what a put does that a limit order does not"
slug: sell-puts-to-buy-stock
excerpt: Selling a put to buy stock is often compared to a limit order that pays you, but it fills on a different rule, cannot be cancelled for free, and ends differently when the stock falls hard.
meta_description: "Selling puts to buy stock vs a limit order on a hypothetical XYZ: the put usually buys at expiration, at the strike even on a gap, and costs money to cancel."
search_title: "Sell Puts to Buy Stock: How It Differs From a Limit Order"
author: Osama Safwat Maghawry
category: investing
series_order: 44
tags: sell puts to buy stock, cash-secured put, limit order, assignment, investing
---

**Selling a put to buy stock** means selling a [cash-secured put](/blog/cash-secured-put-explained) at a strike below the current price, with the cash for 100 shares set aside, so that assignment would deliver the shares at that strike; the premium is received when the put is sold and is kept if the put expires or is assigned. It is often described as a limit order that pays you. The description is close, and the places where it is wrong are the whole subject of this post.

This is the fourth post in the [options for investors](/blog/investing) series. It uses the hypothetical from the earlier ones: XYZ at $50.00, no dividend, implied volatility 30% and a 4% rate. These are teaching figures from a pricing model, not quotes, and nothing here says that anyone should sell a put.

**Key takeaways**

- **A short put is a limit order with different terms.** It pays a premium up front, it is judged at expiration rather than the moment the price is touched, and it cannot be cancelled for free.
- **The premium lowers the cost only if the shares arrive.** If they do not, the premium is all there is, and a rising stock leaves the seller with that and no shares.
- **The obligation does not care why the stock fell.** Assignment is at the strike, even when the stock has gapped well below it.

## Selling a put vs a limit order: what differs

A resting buy order at $47 says: buy 100 shares if XYZ trades down to $47. A short 47 put says something close: pay $47 a share for 100 shares if the put is exercised against you, and receive a premium today for agreeing. In both cases the cash for the purchase, $4,700, has to be there.

Side by side:

| | Buy 100 now | Resting buy at 47 | Sell the 47 put |
| --- | --- | --- | --- |
| Price paid if it fills | 50.00 | 47.00 or better | 47.00 exactly |
| Cash set aside | $5,000 | $4,700 | $4,700 |
| Premium received | none | none | $81 |
| What triggers the purchase | now | XYZ trades at or through 47 | assignment, usually at expiration |
| Cancel for free | not applicable | yes | no |

The $81 is a model value for a 45-day 47 put with XYZ at 50: 0.81 a share, and a number that moves every minute the market is open. It is the price of a later trigger and of giving up free cancellation, not a discount on the stock.

## When does a short put buy the shares?

A good-till-cancelled order at 47 is filled the first time the stock trades at or through 47. A put is assigned when its holder exercises, and holders overwhelmingly wait. In the usual case that means the stock is below 47 at the close on expiration day, 45 days from now, [by which time](/blog/what-happens-options-expiration) the holder's exercise is automatic, unless the holder instructs otherwise, for any put in the money by a cent or more.

![A hypothetical XYZ path that dips to 46 around day 20 and ends at 52 crosses the 47 strike around day 16, where a resting buy order fills at 47, while a short 47 put expires worthless on day 45 because the stock finished above 47.](/assets/blog/sell-put-vs-limit-order-path.svg)

The same stock path gives two different accounts. The order bought at the dip and holds shares worth 52. The put's seller was never assigned, kept the $81, and holds only cash. Early exercise of a put does happen, but it is [uncommon](/blog/early-exercise-options), though it is likelier for a deep in-the-money put, such as one with the stock at 40, and it would not change the 47 purchase price.

This is the sense in which the put "fills later": it needs the stock to be below the strike on the last day, not merely to visit it.  Four paths, with shares valued at the day-45 price:

| XYZ over 45 days | Buy now | Resting buy at 47 | Short 47 put |
| --- | --- | --- | --- |
| Rises steadily to 56 | +$600 | $0, never filled | +$81 |
| Dips through 47, ends at 52 | +$200 | +$500 | +$81 |
| Trades through 47, closes at 46 | -$400 | -$100 | -$19 |
| Trades through 47, closes at 40 | -$1,000 | -$700 | -$619 |

Each row is profit or loss on cash and shares combined, before interest and commissions. The put's last two rows: (47 - 46) × 100 = $100 lost on the shares, less the $81 premium, is -$19; (47 - 40) × 100 = $700, less $81, is -$619.

Read the rows against each other and no column wins them all:

- **Rising steadily.** The put seller keeps $81 against the buyer's $600, because no shares were bought.
- **A dip, then a recovery.** The order is ahead by $419. The put is behind because the dip ended before expiration.
- **A close below 47.** When the order also filled at 47, the put is ahead of it by exactly $81, and both are well ahead of buying at 50.

## Does the premium lower the cost of the stock?

An assigned put's effective cost per share is the strike less the premium: 47.00 less 0.81 is **46.19**. That is the break-even, and it is the number the "buying below the market" description is built on. It is only a cost if assignment happens, and assignment is the outcome in which the stock is below 47.

That makes the premium a payment for a commitment more than a cut in price. Look at the outcomes at expiration:

- **If assigned at expiration with the stock at 46,** the shares cost 47.00 and are worth 46.00. The seller is down $1.00 a share before the premium and $0.19 after it.
- **If the stock is at 52,** nothing was bought, and the $81 is the entire result of the trade.

For what follows assignment, selling a call on the shares, see [the wheel](/blog/wheel-strategy-explained) and its [cost-basis bookkeeping](/blog/wheel-strategy-cost-basis).

## Can a short put be cancelled like an order?

A resting order is a request the investor can withdraw. If XYZ announces something that changes the thesis, the order is cancelled and nothing has been lost. A short put is a contract with the market, and the exit has a price:

- **Buying the put back costs whatever it is quoted at.** After bad news at 43, a 47 put with a month left is worth far more than the $81 collected, and the closing order pays the difference as a loss.
- **A gap makes the two diverge.** A resting buy at 47 that meets an overnight open of 40 fills at roughly 40, better than its limit, and is about even if XYZ stays there. The put still buys at 47 whenever it is assigned, so it loses $619 at a $40 close. The table's last row is the kinder case for the put: there the stock trades down through 47, the order also fills at 47, and the put is ahead by its $81 premium.
- **The cash stays reserved.** The $4,700 is held until the put expires, closes or is assigned, as in the [buying power post](/blog/options-buying-power-requirement).
- **Rolling does not cancel the obligation.** [Rolling the put](/blog/rolling-options-explained) to a later date or lower strike closes one commitment and opens another, often for a different premium.

None of this says a put is worse than an order. It says the put cannot be changed for free.

Related: [hedging cash-secured puts](/blog/hedge-cash-secured-puts), for the fall the reserved cash does not cover.

## Frequently asked questions

- **Is selling a put the same as a limit order to buy?** Not quite. Both reserve the purchase cash, but the order fills when the price touches the limit and can be cancelled free, while the put is generally assigned at expiration and costs money to close early.
- **What price do I pay if a put is assigned?** The strike, 47.00 here, regardless of where the stock is trading. The premium reduces the effective cost, to 46.19, but the shares are bought at 47.00.
- **Does a put let me buy at a discount?** Only if assigned, and then only by the premium; the discount is only the premium, so a close below 46.19 is still a loss, as in the last row.

## The bottom line

A short put and a resting buy order both set aside cash to buy shares at a lower price. The order fills when the price touches its limit, can be cancelled free and, on a gap, fills at the better price. The put brings in $81 up front, is judged at expiration, buys at the strike whatever the stock has done, and costs the market's price to leave early.

On the hypothetical XYZ, the table shows +$81 against the order's nothing when the stock rises, +$81 against +$500 on a dip and recovery, and -$619 against -$700 on a fall to 40 if the order filled at 47 (on a gap the order fills near 40 and is about even). Every figure is illustrative and there to show the mechanics.

For where this started, the [cash-secured put post](/blog/cash-secured-put-explained) covers the same put in more detail, and [stock replacement](/blog/stock-replacement-strategy) covers the way of owning exposure without buying shares at all. This post is educational and is not investment advice.
