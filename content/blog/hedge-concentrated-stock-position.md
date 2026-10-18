---
title: "Hedge a concentrated stock position with options: what each tool covers"
search_title: "Hedge a concentrated stock position with options: example"
slug: hedge-concentrated-stock-position
excerpt: Options can put a floor under a large stock holding for one expiration, but they change the size of the loss, not the size of the position.
meta_description: "How options hedge a concentrated stock position: a protective put, a collar and a put spread on one 1,000-share lot, and what each leaves unprotected."
author: Osama Safwat Maghawry
category: hedging
series_order: 34
tags: concentrated stock, hedging, protective put, collar, put spread
---

A **concentrated stock position** is a holding so large, compared with the rest of an account, that one company's price decides most of the account's result. Hedging it with options means buying or selling contracts on the same stock so that a fall in its price is partly offset, for as long as those contracts last.

This is the fourth post in the [hedging series](/blog/hedging). It takes the three tools from the [protective put](/blog/protective-put-explained), [collar](/blog/collar-option-strategy) and [put spread hedge](/blog/put-spread-hedge) posts and puts them on one larger lot of the same made-up stock, XYZ, to show what changes when the position is the account.

## Key takeaways

- **Concentration is about size.** The same stock is a small risk at 5% of an account and a dominant one at 50%.
- **Options hedge the loss, not the position.** The shares stay in the account, so the holding is as large a part of the account after the hedge as before. What changes is how much a fall can cost, and only until expiration.
- **Each tool pays for itself differently.** A put costs a premium, a collar gives up the upside, and a put spread gives up the protection below its lower strike.
- **Contracts come in lots of 100.** A holding that is not a multiple of 100 shares always has some shares outside the hedge.
- **Every hedge expires.** The account holds the same shares, unprotected, the day after, unless new contracts are bought at that day's prices.

## A fall does not fix a concentrated position

Concentration is a statement about proportion, so it is easy to misread after a loss. When the big holding falls, it gets smaller, and so does the account, but the holding usually stays large.

Take a hypothetical $100,000 account: $50,000 in 1,000 shares of XYZ, which trades at $50.00, and $50,000 in everything else. XYZ is half the account. If XYZ falls 30% to $35.00, the position is worth $35,000 and the account $85,000.

![A hypothetical $100,000 account holds 50 percent in XYZ; after XYZ falls from 50 to 35 the account is $85,000 and XYZ is still about 41 percent of it.](/assets/blog/concentration-share-after-fall.svg)

That is about 41% of the account, down from 50%, after a loss of $15,000. A loss that size is the arithmetic of the position: 30% of half the account is 15% of the account. Two consequences follow:

- **The exposure survives the loss.** One stock still decides roughly 41 cents of every account dollar.
- **The hedge question is about what a fall would cost.** It is not about how large the position looks today.

Selling shares is the other way to shrink a position, and it works differently: it ends the exposure to the part sold and realizes a gain or loss on it. This post covers the option route only.

The proportion also explains why a single stock needs its own hedging post. A 100-share holding in a $100,000 account is 5% of it, so a hedge on it is a small decision. At 1,000 shares the same hedge is ten contracts, a premium of hundreds or thousands of dollars, and a real share of what the account can lose in a month.

## How do options hedge a concentrated stock position?

Each tool was priced on 100 shares in its own post. On 1,000 shares the same tool is **ten contracts**, because one equity option controls 100 shares. The structures do not change, only the multiplier.

- **The protective put.** Ten long puts below the stock set a floor under the lot. The cost is the premium, spent whether or not the stock falls. See the [protective put](/blog/protective-put-explained) post.
- **The collar.** The same puts, plus ten short calls above the stock. The call premium pays some or all of the put premium, and the cap on the upside is the price of that. See the [collar](/blog/collar-option-strategy) post.
- **The put spread hedge.** Ten long puts and ten short puts at a lower strike. The saving on premium is paid for with a gap: the shares are exposed again below the lower strike. See the [put spread hedge](/blog/put-spread-hedge) post.

All three use options on the same stock, with one expiration date that sets how long the hedge lasts. None of them changes what the shares are; they are separate contracts that pay or cost money alongside them. The shares are still owned, still voted and still collect any dividend, and the options sit beside them in the account as extra lines.

## Protective put, collar or put spread: 1,000 XYZ shares at three closing prices

The numbers below are hypothetical. XYZ trades at $50.00, and the quotes are the same model estimates, at 40% implied volatility with no interest rate and no dividend, used in the three posts above. They are not market data. Each hedge is opened at the worse side of the quote and held to one expiration, 30 days out:

- **Protective put.** Buy ten 46 puts at the 0.79 ask: 10 × 0.79 × 100 = $790 paid.
- **Collar.** Buy ten 46 puts at 0.79 and sell ten 54 calls at the 0.85 bid: $850 received less $790 paid is $60 received.
- **Put spread.** Buy ten 48 puts at the 1.43 ask and sell ten 44 puts at the 0.32 bid: $1,430 paid less $320 received is $1,110 paid.

The table shows the result on the lot, measured from today's $50.00 value, with the premium included, at three closing prices.

| At expiration | XYZ closes at $55 | XYZ closes at $45 | XYZ closes at $35 |
| --- | --- | --- | --- |
| Shares alone | +$5,000 | −$5,000 | −$15,000 |
| Shares + ten 46 puts | +$4,210 | −$4,790 | −$4,790 |
| Shares + 46/54 collar | +$4,060 | −$3,940 | −$3,940 |
| Shares + 48/44 put spread | +$3,890 | −$3,110 | −$12,110 |

Reading the table column by column shows the pattern. In the first column, where XYZ rises, the shares alone win and every hedge gives some of that back. In the middle column the hedges matter, and the put spread loses $3,110 at $45, against $3,940 for the collar and $4,790 for the put. Those are the prices the spread was built around, and inside its band it does exactly what it was bought to do.

In the last column the order changes completely: the spread falls from first place to a distant last among the hedges, and the lesson is that a hedge has to be judged at the prices it was built for and at the prices it was not. Neither of the last two columns is the forecast; both are cases the lot can be in.

The last row is the one to read twice. At $35 the put spread loses $12,110 against $15,000 unhedged, because its protection ended at $44. The collar and the put have flat floors, and the collar has a flat ceiling too, which the put does not.

![On a 1,000-share lot, a fall to 35 costs $15,000 unhedged, $12,110 with a 48/44 put spread, $4,790 with a 46 put and $3,940 with a 46/54 collar.](/assets/blog/concentration-hedge-loss-at-35.svg)

At $55 every hedge trails the shares alone, by its net cost or, for the collar, by the $1,000 given up above $54 less the $60 credit, which is $940. That difference is what the hedge cost for a month in which the stock did not fall, and it is the part of the picture that is easiest to forget when only the bad column is in view. These figures describe mechanics, not a forecast, and none of the structures is better in general.

## Contracts come in 100s, so some shares sit outside the hedge

A position built over years rarely lands on a round number. Options come only in whole contracts, so the hedge has to be rounded, and the rounding always leaves shares uncovered.

Suppose the holding is 1,250 shares instead of 1,000:

- **Twelve contracts cover 1,200 shares.** The other 50 shares have no floor.
- **Thirteen contracts cover 1,300 shares.** That is 50 shares more than the account holds, so part of the thirteenth put gains value when the stock falls with nothing to offset it. A collar with thirteen short calls has the matching problem: the thirteenth call has only 50 shares behind it, and a broker treats a call without 100 shares behind it as uncovered, with the margin and approval that requires.

Rounding down leaves a small unhedged piece. Rounding up creates a small position in its own right, and an uncovered short call is a very different risk from a covered one. The same count has to be checked on both legs of a collar. A hedge that looks complete on a summary line can still have 50 shares outside it, which is why the contract count and the share count are worth reading side by side before and after any change to the holding.

## What a hedge leaves open: expiry, assignment, rules and cost

The example above stops at expiration. A real holding keeps going, and a large one runs into things a 100-share example hides:

- **Expiry ends it.** The options last one expiration. The day after, the account holds the same 1,000 shares with no floor, and a new hedge means new contracts at that day's prices. See [options expiration](/blog/what-happens-options-expiration).
- **A collar can sell the shares.** If XYZ closes above 54, the ten short calls are very likely to be [assigned](/blog/option-assignment-what-happens), and 1,000 shares are delivered at $54. Assignment can also come early, most often just before an ex-dividend date. A holder who wanted to keep the shares ends up with cash.
- **Early assignment needs cash or margin.** The short 44 puts in a put spread can be assigned before expiration. Ten assigned early buy 1,000 more shares at $44, which needs $44,000 in cash or margin and leaves the ten 48 puts covering only half of 2,000 shares. See [options buying power](/blog/options-buying-power-requirement).
- **Bid-ask costs scale.** Ten contracts pay the spread on every contract, and a thinly traded strike can cost more than the quote suggests.
- **Rules outside the options.** A holding that came from an employer may carry restrictions on hedging or trading windows, and some hedges can have tax consequences. Both are questions for the employer's compliance team and a tax professional, not for this post.

## Frequently asked questions

- **What is a concentrated stock position?** A holding large enough, relative to the whole account, that one company's price dominates the account's result. There is no official threshold.
- **How do you hedge a concentrated stock position with options?** With contracts on the same stock, one per 100 shares: long puts, a collar, or a put spread. Each offsets part of a fall until expiration, and none reduces the number of shares held.
- **How does a collar hedge a concentrated stock position?** Ten 46 puts set a floor under 1,000 shares and ten 54 calls pay for them, so in the example a fall to $35 costs $3,940 and any gain stops at $54, where the shares are likely to be called away.
- **Which of the three hedges has the lowest net premium on the example quotes?** The put cost $790, the put spread $1,110, and the collar took in $60. Each price is paid differently: the collar with its cap above $54, the put spread with no cover below $44, and the put with the premium itself.
- **Does a hedge reduce concentration?** No. The shares stay in the account, so the proportion is unchanged; the hedge limits what a fall costs, for one expiration.

## The bottom line

Options can limit how much a fall in one stock costs, for a single expiration, and how much depends on the structure. On the example lot, a fall to $35 costs $15,000 unhedged, $4,790 with a put and $3,940 with a collar, and still $12,110 with a put spread, because its cover ends at $44.

Whichever tool is used, the account is as concentrated afterwards as before, the contracts cover whole lots of 100 shares, and the cover ends at expiration.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
