---
title: "Tail risk hedge cost: what always being hedged adds up to"
slug: tail-risk-hedge-cost
excerpt: A permanent hedge pays its premium every quarter and collects in only some falls, so its cost is best read over a full year, not one crash.
meta_description: "Tail risk hedge cost on one hypothetical lot: $480 of puts in a calm year, dearer puts after a crash, and a slow slide where the hedge adds to the loss."
search_title: "Tail risk hedge cost: what a year of puts costs and pays"
author: Osama Safwat Maghawry
category: hedging
series_order: 37
tags: hedging, tail risk, protective put, hedge cost, volatility
---

A **tail risk hedge** is an option position held in case of a rare, large fall in the market, the far end ("tail") of the range of outcomes. The cost of a tail risk hedge is not the premium on any one day. It is the premium paid again at each expiration, whether or not the fall arrives, which on the hypothetical lot below comes to $480 in a calm year.

This is the seventh post in the [hedging series](/blog/hedging). Earlier posts priced one hedge at one expiration. This one holds the same hedge for a year, which is how the [protective put](/blog/protective-put-explained) works when it is kept on permanently.

## Key takeaways

- **The premium recurs.** A put that expires worthless is gone, and the next one costs the same again or more. Four quarterly puts are four premiums.
- **The cost is certain, the payout is not.** A calm year costs the full premium and returns nothing. A crash pays more than a year's premium, once.
- **A slow decline can leave the hedge worse than none.** If the stock slides without ever reaching the strikes, the account loses on the shares and on the puts, and ends below the unhedged lot.
- **A lower strike is cheaper because it pays less.** The saving comes from the cover that was dropped, not from a better price for the same cover.
- **Hedges cost more after the fall.** Volatility rises in a selloff, so insurance bought then is dearer than it was before.

## How much does a tail risk hedge cost over a year?

The numbers below are hypothetical. An account holds 100 shares of XYZ at $100.00, a $10,000 position. At the start of each quarter it buys a three-month put struck 10% below the stock, a 90 strike, at an ask of 1.20. Each put costs 1.20 × 100 = **$120**, and four of them cost **$480** a year. The price is a round number chosen for the arithmetic, not a quote.

A permanent hedge is a decision about timing that gets made once and then repeated. The account does not choose a quarter to be protected in. It buys cover every quarter so that the quarter it needed is covered, and it accepts that most of the cover will expire unused. That is the whole mechanism, and the cost follows from it directly.

Three paths for the year show what that $480 does.

| Year | Stock at each quarter end | Shares | Four puts | Account |
| --- | --- | --- | --- | --- |
| Calm | 100, 100, 100, 100 | $0 | -$480 | -$480 |
| Crash in the second quarter | 100, 70, 70, 70 | -$3,000 | +$1,280 | -$1,720 |
| Slow slide | 97.50, 95, 92.50, 90 | -$1,000 | -$480 | -$1,480 |

![Grouped bars show a hypothetical 100-share lot over one year: unhedged it ends at zero in a calm year, down 3,000 in a crash and down 1,000 in a slow slide, while the same lot with four quarterly puts ends down 480, down 1,720 and down 1,480.](/assets/blog/tail-hedge-three-paths.svg)

The calm row is the cost on its own. Nothing went wrong, and the account is $480 behind an account that bought no puts. That figure does not appear on any single day, which is why a permanent hedge can feel free for a quarter at a time. It shows up only when the quarters are added together, and an account that looks at one expiration at a time never sees the sum.

The crash row is where the puts earn their place. In the second quarter the stock falls from 100 to 70, and the 90 put is sold just before expiration for about its intrinsic value of 20, which is 20 × 100 = **$2,000**, so the shares stay in the account. Left to expire, it would be exercised automatically and the shares sold at 90, the same $2,000 in a different form. After that quarter's own premium of $120, that is a gain of $1,880 on the put, against a $3,000 loss on the shares.

## Why the puts cost more after a crash

The crash row reads +$1,280, not +$1,880, because the hedge keeps being bought. A permanent hedge does not stop after it pays, and an account that stays covered has to re-hedge after the fall. The price of that is not the price it paid before the fall.

- **The first quarter is a plain premium.** The put expires worthless and costs $120.
- **The second quarter is the payout.** The put pays $2,000 for a net $1,880 after its $120.
- **The third and fourth quarters cost more.** The stock is at 70, so the new puts are struck at 63, 10% below. After a fall, [implied volatility](/blog/implied-volatility-options-explained) is higher, so assume each costs 2.40, or $240. Both expire worthless, and the year's hedge costs $120 + $120 + $240 + $240 = **$720**.

The ledger below follows the running total of the puts alone. The calm path steps down by $120 each quarter. The crash path steps down once, jumps by $1,880 in the second quarter, then steps down by $240 twice.

![Two lines show the running total of the puts alone across four quarters: in a calm year it falls by 120 each quarter to minus 480, and in a crash year it falls to minus 120, jumps to plus 1,760 after the second quarter, then falls by 240 twice to plus 1,280.](/assets/blog/tail-hedge-running-ledger.svg)

Two readings of that ledger are common, and both leave something out. Looking only at the jump suggests the hedge paid for itself. Looking only at the calm line suggests it never does. The ledger is both: a recurring cost, and a payout in some years, with the repurchase price moving against the account after the payout.

The ledger also hides what the shares did. The puts finished the crash year ahead by $1,280 and the account finished $1,720 behind, because the lot lost $3,000. A hedge reduces the loss in the quarter it was built for. It does not remove it, and a result that is better than the unhedged lot is still a loss.

## Why a tail hedge can lose in a slow decline

A fall is not the same as a fall past the strike, and the difference is where an always-on hedge is most often misread. In the slow slide the stock ends the year at 90, down 10, and the account lost $1,000 on the shares.

Each quarter's put was struck 10% below that quarter's starting price: 90 first, then 87.75, 85.50 and 83.25 as the stock stepped down. The stock closed each quarter above its own strike, so all four puts expired worthless. The account paid $480 for puts that never paid (the price is held at 1.20 for simplicity), on top of the $1,000, for a total of **$1,480**.

That is more than the unhedged $1,000, in a year the stock fell. Three things produce the result:

- **The strike resets.** A put struck below each new price never sees the decline that happened before it was bought. Each quarter starts the clock again.
- **The fall was gradual.** Ten points over four quarters is 2.5 points a quarter, a little over 2% of the price each time, well inside the 10% gap between the stock and its put's strike.
- **The cost is not gated by the outcome.** The premium is due whether the stock rose, fell a little or fell a lot.

A hedge on the [VIX](/blog/vix-hedge-explained) has the same shape. It pays on the speed and the size of the move, not on the direction alone, and a patient decline can leave both the stock and the hedge on the wrong side of the account.

## A cheaper strike buys less cover, not the same cover for less

The obvious way to cut the $480 is to buy puts further out of the money, with strikes further below the stock. That works as arithmetic. It changes what the hedge does as well, and it moves the question from "what does it cost" to "what does it cover".

Same lot, same 100 start, three strikes for a three-month put. The prices are hypothetical, and the premiums fall as the strike moves away from the stock.

| Put strike | Premium per quarter | Cost over four quarters | Pays at 92 | Pays at 85 | Pays at 70 |
| --- | --- | --- | --- | --- | --- |
| 95 | 2.60 ($260) | $1,040 | $300 | $1,000 | $2,500 |
| 90 | 1.20 ($120) | $480 | $0 | $500 | $2,000 |
| 80 | 0.45 ($45) | $180 | $0 | $0 | $1,000 |

Compare the rows and the saving shows up as cover given up. The 80 put costs $180 a year and pays nothing until the stock is below 80, so it leaves the first 20 points of any fall, $2,000 on the lot, with the account. The 95 put costs more than five times as much and starts paying within five points.

A put spread, covered in the [put spread hedge post](/blog/put-spread-hedge), lowers the cost further by selling a lower put, and gives up the payout below that second strike. The pattern holds throughout: every reduction in the premium is a reduction in what the hedge covers. A reader comparing two quotes for the same expiration is therefore comparing two different amounts of protection, and the cheaper one is not the better price for the same thing.

The [theta](/blog/theta-decay-explained) of a long put works against the account in every row, and most in the dearest one. The longer the account holds the puts, the more time value it has paid for and let decay, which is the recurring part of the cost.

## Frequently asked questions

- **What is the cost of hedging tail risk?** It is the sum of the premiums paid over the period, less whatever the puts paid. In the example, the premiums were $480 in a calm year and $720 in the crash year, against a $2,000 payout in the second quarter, a net gain of $1,280 on the puts.
- **Does a tail hedge pay in every selloff?** No. The slow slide above fell 10% and the puts paid nothing. Held to expiration, a put pays only if the stock finishes below its strike. Sold earlier, it returns whatever value it has left, which in a slow slide is mostly time value that has already decayed.
- **Why does the hedge cost more after a crash?** Implied volatility rises when stocks fall, and option prices rise with it. The same 10% below the stock costs more when the market is already shaken.
- **Is a tail hedge the same as a protective put?** The structure is the same: a long put under a long position. "Tail" describes the intent and the usual choice of a strike well below the stock.
- **Can the premium be recovered?** Only by the puts paying. A sold call, as in the [collar](/blog/collar-option-strategy), offsets it by giving up the upside, which is a different trade.

## The bottom line

A tail risk hedge has a price per year, and it is paid in every year. The price is easy to state in advance and the payout is not, which is why the cost is the part that can be examined before the fact. On the hypothetical lot above, one 90 put each quarter cost $480 in a calm year, returned $1,280 net in a crash and lost more than the unhedged lot in a slow slide. A lower strike cost less because it covered less, and a hedge bought after a fall cost more than one bought before it.

To compare this with a hedge held against a short-put book, see [hedging cash-secured puts](/blog/hedge-cash-secured-puts). The cost of staying hedged is not an argument for or against it. It is the figure the choice turns on.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
