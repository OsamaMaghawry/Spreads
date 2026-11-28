---
title: "How to calculate expected move from options: three methods on one chain"
slug: expected-move-options
excerpt: The expected move is the range the options market prices a stock to move within by one expiration, and the common ways of reading it off a chain give ranges from ±2.92 to ±4.30.
meta_description: "Expected move from IV, the straddle and 85% of it on one hypothetical chain: ±2.92 to ±4.30, and why the shortcuts land inside one standard deviation."
search_title: "How to Calculate Expected Move From Options: 3 Methods"
author: Osama Safwat Maghawry
category: foundations
series_order: 70
tags: expected move, implied volatility, straddle, option pricing, foundations
---

The **expected move** is the range the options market prices a stock to move within by a given expiration, read either from implied volatility or from the price of the at-the-money straddle. To calculate the expected move from options, multiply the stock price by the implied volatility and by the square root of the days to expiration over 365; that gives one standard deviation either way. Several readings built on the straddle circulate beside it, and on the same chain the readings run from ±2.92 to ±4.30, because they do not all measure the same thing.

This [foundations](/blog/foundations) post works all three on one hypothetical chain, after [implied volatility](/blog/implied-volatility-options-explained) and [how to read an option chain](/blog/how-to-read-an-option-chain). The [expected move calculator](/tools/expected-move-calculator) gives readings 1 and 2 below; it does not compute the shortcuts.

Key Takeaways:

- **The formula is price x IV x the square root of time.** It gives one standard deviation either way.
- **The straddle is smaller than that move.** It prices the average move, about 0.8 of one standard deviation.
- **It is a price, not a forecast.** It describes what options cost today, and changes daily.

## The expected move formula: price times IV times the square root of time

Implied volatility is quoted as a yearly standard deviation. To use it for one expiration, it has to be scaled down to the time that is left, and volatility scales with the square root of time, not with time itself:

    expected move = S x IV x sqrt(days / 365)

where S is the stock price, IV the implied volatility of that expiration as a decimal, and days the calendar days to expiration. Some traders use trading days over 252 instead; either gives a close result for one expiration, as long as the IV was annualised on the same basis, but mixing them, such as trading days over 365, does not.

Take a hypothetical XYZ at $50.00 with implied volatility of 30% and 30 days to run. The square root of 30/365 is about 0.287, so the move is 50 x 0.30 x 0.287, or about $4.30 either way. The one standard deviation range is $45.70 to $54.30.

Because of the square root:

- **A quarter of the time is half the move.** On the same stock, 60 days prices ±6.08 and 15 days prices ±3.04.
- **One day is not a thirtieth of a month.** At 30% IV, one day prices about ±0.79, nearly a fifth of the 30-day move.

![On a hypothetical $50 stock at 30% implied volatility, the one standard deviation move is ±6.08 at 60 days, ±4.30 at 30 days and ±3.04 at 15 days, so a quarter of the time gives half the move.](/assets/blog/expected-move-by-dte.svg)

## The straddle method prices the average move, not one standard deviation

The second method reads the move straight off prices. Add the at-the-money call and the at-the-money put of one expiration: that sum, the straddle, is what the market charges for a move in either direction. The [call and put from both sides](/blog/call-vs-put-option-explained) shows why one of the two finishes with value if the stock moves.

The straddle prices the average size of the move, which under the standard model is about 0.798 of one standard deviation (the square root of 2 divided by pi). So it is always narrower than the IV formula's range. Three readings of it circulate:

- **The straddle as it is.** The raw price, used as the range.
- **The straddle divided by 0.798.** One standard deviation, as the IV formula gives; the calculator's straddle mode does this.
- **85% of the straddle.** A rule of thumb that lands narrower still.

A third method weights several strikes instead of one: 60% of the at-the-money straddle, plus 30% of the first out-of-the-money strangle, plus 10% of the second. It folds in some of the chain beyond one strike, and it too lands well inside one standard deviation.

## Worked example: three methods on one hypothetical XYZ chain give ±2.92 to ±4.30

XYZ is hypothetical, trading at $50.00, 30 days to expiration, implied volatility 30% at every strike and interest at 4%. These are invented mid prices, there to show the mechanics and nothing about any result. The chain is priced at 30% IV, not the 40% some earlier posts in this series use, so its deltas and distances do not match theirs.

| XYZ, 30 days | Put mid | Call mid | Pair |
| --- | --- | --- | --- |
| 50 straddle | 1.63 | 1.80 | 3.43 |
| 49/51 strangle, first | 1.18 | 1.34 | 2.52 |
| 48/52 strangle, second | 0.82 | 0.98 | 1.80 |

The call sits above the put at 50 by about the interest on the strike, as [put-call parity](/blog/put-call-parity) says it should. Now the three methods, five readings in all:

1. **IV formula.** 50 x 0.30 x 0.287 = ±4.30, from 45.70 to 54.30.
2. **Straddle divided by 0.798.** 3.43 / 0.798 = ±4.30, the same range: both measure one standard deviation.
3. **Straddle as it is.** ±3.43, from 46.57 to 53.43.
4. **Weighted strangle.** 0.6 x 3.43 + 0.3 x 2.52 + 0.1 x 1.80 = ±2.99, from 47.01 to 52.99.
5. **85% of the straddle.** 0.85 x 3.43 = ±2.92, from 47.08 to 52.92.

The narrowest is about two-thirds of the widest, on the same chain at the same moment. Nothing in the chain explains the gap; only the arithmetic applied to it differs.

Under the model's bell curve, the ±4.30 range holds about 68% of outcomes, the raw straddle about 57%, and the two shortcuts about half. Those shares come from the model's assumptions, not from any record of how stocks have moved.

![On a hypothetical XYZ at 50 with 30 days left, the IV formula gives ±4.30, the straddle ±3.43, the weighted strangle ±2.99 and 85% of the straddle ±2.92, and a 46 strike sits inside only the widest.](/assets/blog/expected-move-three-methods.svg)

The disagreement matters most when a strike is described against the range. A 46 put is $4.00 below the stock. Measured against the IV formula it sits inside the expected move, at about 0.93 of a standard deviation. Measured against either shortcut it sits well outside.

The strike and the chain have not changed; only the method has. A sentence such as "the short strike is outside the expected move" means little until it names which one.

## The expected move is the market's price, not a forecast of where the stock lands

The range is built from what options cost, so it carries the same limits as the prices it comes from:

- **Earnings widen it.** The first expiration after an earnings date carries the report's move in its IV; the [earnings post](/blog/selling-options-before-earnings) shows the chain repricing.
- **Real moves have fatter tails.** Large gaps on news happen more often than the bell curve allows, so the range is a poor guide to the extremes.
- **It is symmetric only as an approximation.** The model treats price as lognormal, so the one standard deviation range in log terms on XYZ runs about 45.88 to 54.49, not 45.70 to 54.30.
- **It reprices daily.** Tomorrow's IV, price and days left give a new range, which shrinks as expiration nears.

That last point is where the expected move meets an open position. A spread opened with its short strike outside the range is measured against a different range a week later: the stock may have moved toward the strike while the range narrowed around the new price. Comparing a strike to the move once, at the fill, describes the fill.

Comparing it each day describes the position, the after-the-fill view the [managing multiple option positions](/blog/managing-multiple-option-positions) post works through for a whole book. Delta is a related measure of the same distance, strike to stock in units of the priced move, and [choosing a strike by delta](/blog/credit-spread-delta-strike-selection) works it through on that series' own chain. Neither figure says where the stock will finish; each says how far away a strike sits by today's prices.

## Frequently asked questions

**How do you calculate the expected move from a straddle?** Add the at-the-money call and put of one expiration. That price is the average move; divide it by 0.798 to get one standard deviation, the measure the IV formula gives.

**Is the implied move the same as the expected move?** The two names are used for the same idea. "Implied move" often means the straddle reading around an earnings date, so it is worth checking which method a page is quoting.

**Why does 85% of the straddle differ from the IV formula?** They measure different things. The IV formula gives one standard deviation; 85% of the straddle is about two-thirds of that, a range that holds about half of outcomes under the model.

**Is the expected move the probability of profit?** No. It describes where options price the stock. A position's chance of finishing profitable depends on its own strikes, credit or debit and break-even.

## The bottom line

The expected move is price times implied volatility times the square root of time, one standard deviation either way. The straddle and the shortcuts built on it price smaller moves, so on one chain the "expected move" can mean anything from ±2.92 to ±4.30. A comparison means little until it names the method, and the range is different again on each day a position is open.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
