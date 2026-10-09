---
title: "Credit spread strike selection by delta: what it tells you"
slug: credit-spread-delta-strike-selection
excerpt: Delta lets a trader describe a credit spread's short strike on a scale that travels between stocks, but it belongs to one leg, it is a model's estimate, and it moves.
meta_description: "A short strike's delta is not the spread's probability of profit; the break-even and long strike differ. What delta does tell you, on one example chain."
author: DeltaMint
category: income
series_order: 22
tags: credit spread delta, strike selection, option delta, put credit spread, short strike
---

Credit spread strike selection by delta means describing the short strike by its
**delta**, such as "a 30-delta put spread", instead of by a price. Delta is the
estimated change in an option's price for a $1 move in the stock. The short
strike's delta is not the spread's probability of profit, and the sections
below show why.

This post continues the [income series](/blog/income) from [credit spread
width](/blog/credit-spread-width). Width was the gap between the two strikes;
this is the other choice, how far down the whole spread sits. It uses the same
hypothetical XYZ put chain, and it describes what a delta label tells a reader,
not which delta anyone should pick.

## Key takeaways

- A short strike's delta puts its distance from the stock on a scale that is comparable across stocks, expirations and volatility levels. A dollar distance is not.
- With the width held at $2, moving the short strike down shrinks the credit and raises the maximum loss, because the short put loses more premium than the long put below it, so less credit offsets the same width.
- "A 30-delta spread" names the short leg only. In size, the spread's own delta is the short leg's less the long leg's; as a position it is positive and smaller.
- Delta is model output, and it only roughly stands in for the chance of finishing in the money. It is not the chance of a profit or a loss on the spread.
- The delta a strike shows today is not the delta it shows next week. The stock and the calendar both move it.

## What does a short strike's delta tell you?

A price says nothing about distance on its own. A short put $4 below a $50 stock is 8% away, and the same $4 below a $400 stock is 1% away. Time matters as much: $4 below the stock is a long way with two days left and a short way with two months.

Delta already folds in the stock price, the days left and the expected movement. That is why the [delta post](/blog/option-delta-explained) describes it as the figure that makes strike distance portable.

The portability is easiest to see by holding the delta fixed and letting the volatility change. The hypothetical XYZ trades at $50 with 30 days left, and the put whose delta is −0.20 sits at a different strike depending on how much movement the market expects.

![The put with a delta of 0.20 on a $50 stock with 30 days left sits $2.81 below the stock at 25% implied volatility, $4.30 below at 40% and $6.09 below at 60%.](/assets/blog/delta-strike-distance-by-iv.svg)

- **At 25% implied volatility** the 0.20-delta put is at 47.19 and is worth about 0.41.
- **At 40%** it is at 45.70, worth about 0.68.
- **At 60%** it is at 43.91, worth about 1.04.

The label "20 delta" never changed, while the dollar distance more than doubled. A trader who talks in delta is quoting something that adjusts for [implied volatility](/blog/implied-volatility-options-explained) and the calendar without being told to, and a trader who talks in dollars is not.

## Moving the short strike down trades credit for risk

Take the 30-day puts on the hypothetical chain, with XYZ at $50.00. The 50, 48 and 46 rows are the ones from the [width post](/blog/credit-spread-width); the 44 and 42 rows follow the same pattern near a Black-Scholes fit at 40% implied volatility with no interest rate. Delta is the model's, rounded to two places.

| Put strike | Bid | Ask | Delta |
| --- | --- | --- | --- |
| 50 | 2.24 | 2.34 | −0.48 |
| 48 | 1.33 | 1.43 | −0.34 |
| 46 | 0.71 | 0.79 | −0.22 |
| 44 | 0.32 | 0.40 | −0.12 |
| 42 | 0.11 | 0.19 | −0.06 |

Now build four put credit spreads, each $2 wide, each starting from a different short strike. An order that fills at the quote sells the short leg at its bid and buys the long leg at its ask, as in the [put credit spread post](/blog/put-credit-spread-explained).

| $2-wide put spread | 50/48 | 48/46 | 46/44 | 44/42 |
| --- | --- | --- | --- | --- |
| Short put delta | −0.48 | −0.34 | −0.22 | −0.12 |
| Credit (bid less ask) | 2.24 − 1.43 = 0.81 | 1.33 − 0.79 = 0.54 | 0.71 − 0.40 = 0.31 | 0.32 − 0.19 = 0.13 |
| Maximum loss | $119 | $146 | $169 | $187 |
| Break-even | $49.19 | $47.46 | $45.69 | $43.87 |

Maximum loss is the width times 100 less the credit, as in the [max loss post](/blog/credit-spread-max-loss): ($2.00 − $0.31) × 100 = $169 on the 46/44. The break-even is the short strike less the credit.

![Four hypothetical $2-wide put credit spreads as the short strike moves down the chain: the short put delta falls from 0.48 to 0.12, the credit falls from $81 to $13, and the maximum loss rises from $119 to $187.](/assets/blog/credit-spread-delta-ladder.svg)

Read across the table and the width never changes, yet the position does. Each step down takes a larger share of the credit than the one before (0.81 to 0.54, then to 0.31, then to 0.13), and the maximum loss climbs toward the full $200 of width, because the credit that offsets it is shrinking.

## What is a credit spread's net delta?

A spread has two legs and each has its own delta. The label usually carries the short leg's, which is the leg that sets how close the position sits to the stock. The position's own sensitivity is a different number, because the long put is also in the account and it moves the other way.

For the 46/44, the arithmetic uses the position's sign, as the delta post set out:

- **The short 46 put contributes +0.22.** A sold put gains when the stock rises, so its position delta is the opposite sign to the contract's −0.22.
- **The long 44 put contributes −0.12.** A bought put keeps the contract's sign.
- **The spread's delta is about +0.10.** The long put gives back more than half of what the short put adds.

Run the same sum down the table and the four spreads sit near +0.14, +0.12, +0.10 and +0.06, while the labels read −0.48 through −0.12. So the short strike's delta compares strikes; it does not say how much the whole position moves for $1 in the stock, and the gap between the two shrinks the further the long leg sits from the short one. This is also why a wider spread has a larger delta than a narrow one from the same short strike: the long put is further out and offsets less.

## Is the short strike's delta a credit spread's probability of profit?

Delta is often read as the probability that the option finishes in the money, and the delta post already said where that reading holds up and where it does not. For a spread there is a second gap, because finishing in the money is not the event a trader's result depends on.

- **It is model output.** Change the volatility input and the delta changes without the stock moving. The model's number is not a measurement of any real stock's behaviour.
- **The short strike is not the break-even.** The spread starts losing money below the break-even, which is the short strike less the credit. On the 46/44 that is $45.69, not $46, so "finishing in the money" and "losing money" are different events.
- **The maximum loss starts at the long strike.** Finishing below the long strike is a narrower event than finishing below the short one. The short put's delta describes neither.
- **Neither number is a forecast.** An estimate drawn from today's prices says nothing about where a particular stock will finish.

So a 0.22 delta can be read as "roughly a 22-in-100 label on finishing below the short strike" (for the 46 put the model's own probability of finishing below the strike is about 25 in 100 on these inputs, an output of the assumed volatility and not a forecast for any stock). It is a way to rank strikes against each other on one chain. It was never a promise about outcomes, and it is not the odds of the spread paying.

## Why does the short strike's delta change after you open the spread?

Delta is a snapshot at one stock price and one date. The 46 put keeps its strike for the whole life of the spread, but the number attached to it does not.

| 46 put, 30 days left, 40% volatility | Stock at 52 | Stock at 50 | Stock at 48 | Stock at 46 |
| --- | --- | --- | --- | --- |
| Delta | −0.13 | −0.22 | −0.33 | −0.48 |

Time moves it as well. With the stock still at $50, the same 46 put shows −0.22 with 30 days left, −0.14 with 15 and −0.06 with 7. Both effects come from the same place: delta measures how close the strike is to the stock, in units of how far the stock is expected to travel, and either input can change that. The rate at which delta moves is its own number, [gamma](/blog/gamma-options-meaning), and it is largest when a short strike is close to the stock and the expiration is near.

The practical consequence is about the word "chosen". A strike picked at 0.22 delta on the day of the fill is a statement about that day. After a $2 fall in the stock the short put in this example shows −0.33, and a trader reading the label again is looking at a different position than the one described at the fill. The [bid-ask post](/blog/options-bid-ask-spread) is the reminder that the price attached is a quote, and so is the delta calculated from it.

## Frequently asked questions

- **What does a 30-delta credit spread mean?** Usually that the short strike's delta is about 0.30 in magnitude. The long strike's delta is a separate number, and the spread's own delta is the difference between them.
- **Is the delta of a credit spread the same as its short leg's?** No. The long leg offsets part of it. On the 46/44 the short leg adds +0.22, the long leg −0.12, and the spread is about +0.10.
- **Is delta the probability of profit on a credit spread?** No. It is a model figure often read as the rough chance of finishing in the money at one strike, and the spread's break-even and its long strike are different points.
- **Why does the same delta mean a different strike on different stocks?** Because delta reflects the stock price, the days left and the implied volatility. On the hypothetical chain the 0.20-delta put moved from $2.81 to $6.09 below the stock across three volatility levels.
- **Does delta change after the spread is opened?** Yes, with every move in the stock and with every day. The 46 put went from −0.22 to −0.33 when the stock fell $2 in the example.
- **How is delta different from width?** Width is the distance between the two strikes and sets the maximum loss. Delta places the short strike relative to the stock, and sets how large the credit is against that width.

## The bottom line

Delta describes a short strike's position on a scale that survives a change of stock, expiration or volatility, which a dollar distance cannot. On the hypothetical chain, a $2-wide spread's credit fell from 0.81 to 0.13 as the short delta fell from 0.48 to 0.12, and its maximum loss rose from $119 to $187.

The label also leaves things out: it names one leg, it is a model's output, and it changes every day. The [income series](/blog/income) continues from where the short strike sits to [when it expires, and how the time left changes what the same spread is](/blog/credit-spread-dte).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
