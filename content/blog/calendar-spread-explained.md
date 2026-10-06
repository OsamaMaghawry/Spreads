---
title: "Calendar spread explained: one strike, two dates, long vega"
slug: calendar-spread-explained
excerpt: A calendar spread sells a near expiration and buys a later one at the same strike, so it profits from the gap between two rates of decay and carries a payoff shaped like a hill, not a ramp.
meta_description: "Calendar spread explained on one hypothetical call: the debit paid, the hill-shaped payoff, and why an IV drop hurts it at the strike."
author: DeltaMint
category: income
series_order: 25
tags: calendar spread, time spread, long vega, theta, call options
---

A **calendar spread** is two options of the same type and the same strike on different expirations: one is sold on the nearer date and one is bought on the later date, so the trader pays a net debit rather than collecting a credit. It is also called a time spread or a horizontal spread. It earns from the nearer option losing time value faster than the later one, and it is exposed to implied volatility much more than a credit spread is.

This post continues the [income series](/blog/income) from [selling options before earnings](/blog/selling-options-before-earnings). It prices one hypothetical calendar on the XYZ call used across the series, shows where the position is worth most and least, and states what it leaves exposed. It describes how the structure behaves and does not suggest anyone open one.

## Key takeaways

- A calendar spread is a **debit** position: the later option costs more than the nearer one earns, and in the model here the difference paid is the most the position can lose.
- Its value comes from a gap between two [time values](/blog/intrinsic-vs-extrinsic-value-options). The nearer leg decays faster, so with the stock still the gap widens.
- The payoff at the near expiration is a **hill**, highest with the stock at the strike and lower on both sides. A [credit spread](/blog/put-credit-spread-explained) is a ramp with a flat floor and ceiling; a calendar is not.
- The position is **long vega**: a rise in [implied volatility](/blog/implied-volatility-options-explained) helps it and a fall hurts it, which is the reverse of the short leg's own exposure.
- The top of the hill has no fixed figure. It depends on what the later option is worth when the nearer one expires, and that depends on implied volatility on that day.

## What is a calendar spread, and what does it cost?

Every structure so far in this series has used one expiration. A [credit spread](/blog/credit-spread-width) is two strikes on a single date, and the width between them sets the risk. A calendar turns that around: one strike, two dates, and the distance in time takes the place of the distance in price.

The worked example uses the hypothetical XYZ, trading at $50, with a Black-Scholes fit at 40% implied volatility, no interest rate and no dividend. Each price is a model's estimate and every figure is per share; one contract is 100 shares. The 30-day 50 call is the same $2.29 used in earlier posts.

| Leg | Action | Days to expiration | Price |
| --- | --- | --- | --- |
| 50 call, near | Sell | 30 | 2.29 |
| 50 call, far | Buy | 60 | 3.23 |
| Net | **Debit** | | **0.94** |

The trader pays 3.23 and receives 2.29, a net debit of 0.94, or $94 per spread. Both prices are model values standing in for the midpoint marks. Real fills cross the [bid-ask spread](/blog/options-bid-ask-spread) twice, once on each leg, so the debit actually paid is usually a little higher than the figure here.

Because the far option expires later than the near one, a broker can treat the pair as a spread. The [buying power post](/blog/options-buying-power-requirement) lists that condition for spreads. The amount held is commonly the debit paid, with no extra collateral for the short call, but the broker's own rule governs.

## Why does the near leg lose value faster?

The 60-day call is worth more than the 30-day call for one reason: it has more time value, the part of the price above intrinsic value. At the strike, all of the premium is time value. The [theta post](/blog/theta-decay-explained) showed that time value does not drain at a constant rate; it drains faster as expiration approaches.

That makes the two legs behave differently over the same 30 days. The near leg goes from 2.29 to nothing. The far leg goes from 3.23 to 2.29, the price the near leg had at the start, because it is now the 30-day option. If the stock has not moved, the gap between them has widened.

![With XYZ unchanged at 50, the short 30-day call falls from 2.29 to 0.00 and the long 60-day call falls from 3.23 to 2.29, so the gap between the two legs grows from 0.94 at the start to 2.29 thirty days later.](/assets/blog/calendar-spread-time-value-gap.svg)

The spread is then worth 2.29 − 0.00 = 2.29, against 0.94 paid, a gain of 1.35 or $135 per spread. That figure needs two conditions to hold: XYZ is at exactly $50, and implied volatility is still 40%. Both are assumptions, and the rest of this post is what happens when they are not.

- **The stock sits at the strike.** The gap is widest where the near leg has the most time value to lose, which is at the money.
- **Nothing else has repriced.** The model gives each expiration the same 40%. On a real chain each date carries its own implied volatility, and the two legs can move apart.
- **The near leg runs to expiration.** A position closed earlier realizes less of the gap, since the near leg's last stretch of decay is the steepest.

## Why is the payoff a hill, and where does it break even?

At the near expiration the short call is worth only its intrinsic value: what it costs to buy back, or, if it is left open in the money, the shares its assignment leaves the trader short. The long call is still alive with 30 days left. The spread's value is the long call's remaining price less whatever the short call is worth in intrinsic value. Priced at 40% for each stock price, that gives the table.

| XYZ at near expiration | Long call, 30 days left | Short call, intrinsic | Spread value | Gain or loss vs 0.94 |
| --- | --- | --- | --- | --- |
| 44 | 0.36 | 0.00 | 0.36 | −0.58 |
| 46 | 0.75 | 0.00 | 0.75 | −0.19 |
| 48 | 1.38 | 0.00 | 1.38 | +0.44 |
| 50 | 2.29 | 0.00 | 2.29 | +1.35 |
| 52 | 3.47 | 2.00 | 1.47 | +0.53 |
| 54 | 4.89 | 4.00 | 0.89 | −0.05 |
| 56 | 6.52 | 6.00 | 0.52 | −0.42 |

![At the near expiration the hypothetical calendar spread is a hill: a 1.35 gain with XYZ at 50, break-evens near 46.70 and 53.80, and a loss that flattens toward the 0.94 debit on both sides.](/assets/blog/calendar-spread-payoff.svg)

Below the strike the short call expires worthless and the long call loses value as the stock falls away from it, so the loss grows toward the debit. Above the strike the two intrinsic values cancel and what is left is the far call's time value, which shrinks the deeper in the money it goes. In both directions the spread's value runs down toward zero, and never past it, so while both legs are held the debit is the most that can be lost.

The break-evens fall at about 46.70 and 53.80, found by pricing each stock price at 40%. Between them the spread is ahead of the debit. A reader who knows the [credit spread](/blog/credit-spread-max-loss) will notice what is missing: no strike fixes the maximum gain. The peak is a model result at one implied volatility, which is the next section's subject.

## How does implied volatility change a calendar spread?

The far call has more time left, so it carries more vega, the price change per point of implied volatility, than the near call. At the start the far leg's vega is about 0.081 per point and the near leg's about 0.057, so the spread is net long about 0.0235 per share, roughly $2.35 per spread for each point. A credit spread keeps both legs on one date, so their vega largely offsets.

When the near leg expires, only the far leg is left, and it carries all of the exposure. Hold XYZ at $50 and move implied volatility on that day:

| Implied volatility at near expiration | Long call, 30 days left | Spread value | Gain vs 0.94 |
| --- | --- | --- | --- |
| 30% | 1.72 | 1.72 | +0.78 |
| 40% | 2.29 | 2.29 | +1.35 |
| 50% | 2.86 | 2.86 | +1.92 |

Ten points of implied volatility move the result by 0.57, or $57 per spread, in either direction. This is the same mechanism as the [IV crush](/blog/selling-options-before-earnings) that helped the short put on the morning after earnings, working here in reverse. A calendar built around an announcement can be hurt by the very drop in implied volatility that a seller of premium collects.

The model changes only the far leg's volatility on the final day. In practice the two expirations rarely move by the same amount, since the nearer date's implied volatility usually swings further, so the real result has a term-structure effect that this table leaves out.

## What can go wrong with the legs?

A calendar has a defined worst case, but it has a few mechanics that a single-expiration spread does not, all of them about the two dates not matching:

- **The short call can be assigned early.** The risk peaks just before an ex-dividend date, when the dividend exceeds the time value left on the short call, as in the [early exercise post](/blog/early-exercise-options). The trader is then short 100 shares with the far call still open. Assigned before the ex-date, the trader also owes the dividend on those shares, which can take the loss past the debit. Covering with the far call by exercising it gives up its time value, and holding the short shares carries its own margin and borrowing terms.
- **The structure changes at the near expiration.** If the short call expires out of the money, or is bought back, what remains is a plain long call. If it is left open in the money, it is assigned and the trader is short 100 shares against the far call. Either way, what to do next is a new decision with a new risk profile; rolling is a later post in this series.
- **Two legs mean two spreads to cross.** Each leg has its own bid and ask, and the far leg is usually the less liquid of the two. A debit of 0.94 at the marks can be a larger number to the person actually opening it.
- **Closing early realizes less.** The hill's peak is at the near expiration. Before then the position is marked to the market with the near leg still holding time value, so the value in between is below the peak.

## Frequently asked questions

- **Is a calendar spread a debit or a credit spread?** A long calendar, the kind described here, is a debit: the option bought expires later and costs more than the option sold. Selling the far date and buying the near one is a short calendar, which is a credit and has a different risk.
- **What is the most a long calendar spread can lose?** The debit paid, in this model, while both legs are held, because the far call is always worth at least what the near call can owe in intrinsic value. Early assignment of the short call, especially around a dividend, can change that.
- **Why is it called a calendar or horizontal spread?** The two legs differ in expiration, the horizontal axis of an option chain, rather than in strike.
- **Does a calendar spread need a call?** No. The same structure can be built with puts, at the same strike, and it has a similar hill shape.

## The bottom line

A long calendar spread pays a debit, which is its maximum loss while both legs are held as a spread. It gains when the near leg's time value drains faster than the far leg's, and it is worth most with the stock at the strike on the near expiration.

On the hypothetical XYZ, a 0.94 debit became a 1.35 gain with the stock unchanged at 50 and implied volatility at 40%, and a 0.58 loss with the stock at 44. The same position moved by 0.57 for ten points of implied volatility, which is an exposure a credit spread largely offsets. The [income series](/blog/income) continues with diagonal spreads, which change the strike as well as the date.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
