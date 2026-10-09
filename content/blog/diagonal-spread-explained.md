---
title: "Diagonal spread explained: a calendar with a tilt"
slug: diagonal-spread-explained
excerpt: A diagonal spread sells a near expiration and buys a later one at a different strike, which keeps a calendar's time decay but tilts its payoff toward one side of the stock price.
meta_description: "A diagonal spread priced on one hypothetical call: the debit, a payoff that tilts, a break-even found by pricing, and how it differs from a calendar."
author: DeltaMint
category: income
series_order: 26
tags: diagonal spread, calendar spread, time decay, long vega, call options
---

A **diagonal spread** is two options of the same type on different expirations and different strikes: one is sold on the nearer date and one is bought on the later date. It sits between two structures already covered in this series. Keep the strike the same and it is a calendar spread; keep the date the same and it is a vertical, such as a [call credit spread](/blog/call-credit-spread-explained). The diagonal changes both, so it carries a calendar's time-value gap and a vertical's lean toward one direction.

This post continues the [income series](/blog/income) from [calendar spreads](/blog/calendar-spread-explained). It prices one hypothetical diagonal on the series' XYZ call, sets its payoff beside the calendar's and states what it leaves exposed. It describes the structure and does not suggest anyone open one.

## Key takeaways

- A diagonal spread changes **both** the strike and the date. The date supplies a [time-value](/blog/intrinsic-vs-extrinsic-value-options) gap between the legs, and the strike supplies a lean.
- The version here is a **debit** position: the long call, which has more time and a lower strike, costs more than the short call earns.
- Its payoff at the near expiration is **tilted**, not a hill. A calendar falls back on both sides of its strike; in the model, this diagonal is below its cost only at lower stock prices. The model leaves out dividends and early assignment.
- The tilt costs a **larger debit**, about three times the calendar's in the example, so a fall in the stock costs it more.
- It is still **long vega**: a drop in [implied volatility](/blog/implied-volatility-options-explained) hurts it with the stock unchanged.

## What is a diagonal spread, and how is it priced?

The worked example uses the hypothetical XYZ, trading at $50, with a Black-Scholes fit at 40% implied volatility, no interest rate and no dividend. Every price is a model's estimate and every figure is per share; one contract is 100 shares.

The legs are a long 60-day call at the 48 strike and a short 30-day call at the 52 strike. The long call starts in the money and the short call starts out of the money.

| Leg | Action | Strike | Days to expiration | Price |
| --- | --- | --- | --- | --- |
| Far call | Buy | 48 | 60 | 4.27 |
| Near call | Sell | 52 | 30 | 1.47 |
| Net | **Debit** | | | **2.80** |

The trader pays 4.27 and receives 1.47, a net debit of 2.80, or $280 per spread. These are model values standing in for midpoint marks. A real fill crosses the [bid-ask spread](/blog/options-bid-ask-spread) on each leg, so the debit actually paid is usually somewhat higher.

The legs also differ in how they respond to the stock. At the start the long 48 call has a delta of about 0.63 and the short 52 call about 0.39, so the pair is net long roughly 0.24 per share, or $24 per spread for each $1 the stock moves. That figure changes as the stock moves and as time passes. A calendar at the strike starts closer to zero, the first sign the two structures differ.

## Why does the payoff tilt, and where does it break even?

At the near expiration the short 52 call is worth only its intrinsic value, if any, while the long call still has 30 days left. The spread is worth the difference. Priced at 40% for each stock price:

| XYZ at near expiration | Long 48 call, 30 days left | Short 52 call, intrinsic | Spread value | Gain or loss vs 2.80 |
| --- | --- | --- | --- | --- |
| 44 | 0.68 | 0.00 | 0.68 | −2.12 |
| 46 | 1.30 | 0.00 | 1.30 | −1.50 |
| 48 | 2.19 | 0.00 | 2.19 | −0.61 |
| 50 | 3.38 | 0.00 | 3.38 | +0.58 |
| 52 | 4.82 | 0.00 | 4.82 | +2.02 |
| 54 | 6.46 | 2.00 | 4.46 | +1.66 |
| 58 | 10.12 | 6.00 | 4.12 | +1.32 |

![At the near expiration the hypothetical diagonal spread is a 2.49 loss with XYZ at 42, breaks even near 49.08, peaks at a 2.02 gain at the 52 short strike, and then levels off near a 1.2 gain in the model instead of turning into a loss.](/assets/blog/diagonal-spread-payoff.svg)

Below the long strike, the long call loses value as the stock falls away and the loss grows toward the debit. Between the strikes the spread gains as the stock rises, because the long call gains faster than the short call, which is still worthless. The peak comes with the stock at the short strike, 52, where the short call has given up all of its time value and the long call keeps its own.

Above 52 the two calls move one-for-one, so the intrinsic parts cancel and what is left is 4.00, the [distance between the strikes](/blog/credit-spread-width), plus whatever time value the long call still holds. That time value shrinks the deeper in the money the stock goes, so the value eases down toward 4.00 and the gain toward 1.20.

This is the part that differs from a calendar. The long call always covers the short call's intrinsic value and holds 4.00 of its own, which is more than the 2.80 paid, so in the model the position stays above its entry cost on the upside while both legs are held. A debit larger than the 4.00 gap would not have that floor.

The break-even is near 49.08, found by pricing the long call at each stock price at 40%. The shortcut some pages quote, long strike plus debit, gives 50.80 here: it leaves out the time value the long call still holds, which also moves with implied volatility.

## How does a diagonal spread differ from a calendar spread?

A calendar at the same 50 strike cost 0.94 in the [calendar spread post](/blog/calendar-spread-explained). Setting the two next to each other at the same near expiration shows what moving the strikes does:

| XYZ at near expiration | Calendar, 50/50, debit 0.94 | Diagonal, 48/52, debit 2.80 |
| --- | --- | --- |
| 44 | −0.58 | −2.12 |
| 50 | +1.35 | +0.58 |
| 56 | −0.42 | +1.45 |

![On the same 30-day short leg the calendar is a hill worth most at 50 and below zero further out on both sides, while the diagonal gives up more on the downside and in the model stays above zero past the short strike.](/assets/blog/diagonal-vs-calendar-payoff.svg)

- **The tilt is bought with premium.** The diagonal pays 2.80 against the calendar's 0.94 because the long call is struck lower and the short call higher: 1.04 more paid and 0.82 less received. That extra money is also at risk, which is why the left side is deeper.
- **The peak moves.** The calendar peaks at its strike, 50. The diagonal peaks at the short strike, 52, so the position is worth most at a different stock price.
- **The right side changes sign.** At 56 the calendar is behind and the diagonal is ahead, because the long 48 call keeps its intrinsic advantage over the short 52 call.
- **The exposure to direction is larger.** The starting net delta of about 0.24 is the cost of that tilt, and it means the position moves with the stock far more than a calendar does.

None of this makes one structure better. They answer different questions about the stock; the table compares shapes, not results.

## How does implied volatility change a diagonal spread?

The long 60-day call carries more vega than the short 30-day call: about 0.077 against 0.055 per point at the start. The spread is net long about 0.022 per share, roughly $2.20 per spread for each point of implied volatility. A credit spread, with both legs on one date, largely offsets that exposure.

When the near leg expires, only the long call is left and it carries all of it. Hold XYZ at $50 on that day, with the short 52 call worthless, and move implied volatility:

| Implied volatility at near expiration | Long 48 call, 30 days left | Spread value | Gain vs 2.80 |
| --- | --- | --- | --- |
| 30% | 2.87 | 2.87 | +0.07 |
| 40% | 3.38 | 3.38 | +0.58 |
| 50% | 3.91 | 3.91 | +1.11 |

Ten points of implied volatility move the result by about 0.5, or $50 per spread, in either direction. That is the same mechanism as in the [selling options before earnings](/blog/selling-options-before-earnings) post, seen from the buyer's side: the drop in implied volatility that helps a short option hurts a long one.

The model moves one volatility on the final day. In practice each expiration has its own, and the two rarely move together, so a real position also has a term-structure effect that this table leaves out.

## What can go wrong with the legs?

With the long strike below the short strike, the position has a defined worst case, but it has mechanics a single-expiration spread does not:

- **The short call can be assigned early.** The risk is greatest just before an ex-dividend date, when the dividend exceeds the time value left on the short call, as in the [early exercise post](/blog/early-exercise-options). The trader is then short 100 shares at 52. Exercising the long 48 call delivers the shares and settles the position, but it gives up the long call's remaining time value. Assigned before the ex-date, the trader also owes the dividend.
- **The strike order matters.** If the long call's strike were *above* the short call's, assignment of the short call would leave shares short with protection only above the higher strike. The worst case would then exceed the debit. This post covers only the version where the long strike is lower.
- **The structure changes at the near expiration.** If the short call expires out of the money, what remains is a plain long call. If it finishes in the money it is usually assigned. Either way, the next step is a new decision with its own risk; rolling is a later post in this series.
- **Two legs mean two spreads to cross.** Each leg has its own bid and ask, and the long call, being later-dated, is usually the less liquid. The [buying power post](/blog/options-buying-power-requirement) covers how a broker treats a spread whose long leg expires later; the broker's own rule governs how much is held.

## Frequently asked questions

- **Is a diagonal spread a debit or a credit spread?** It depends on the strikes and dates. The version here, buying the later, lower-strike call and selling the nearer, higher-strike call, is a debit. Other arrangements can be a credit and have different risks.
- **What is the most a long diagonal spread can lose?** The debit paid, in this model, while both legs are held and the long strike is below the short strike. A dividend owed after early assignment can change that.
- **Is a diagonal spread the same as a poor man's covered call?** The structure is related: a long, later-dated, deep in-the-money call against a nearer short call. That use is a later post in this series.

## The bottom line

A diagonal spread changes both the strike and the date, keeping a calendar's time-value gap and adding a lean. The long-strike-below-short version pays a larger debit and, in the model at the near expiration, stays ahead of its cost at higher stock prices where a calendar is behind.

On the hypothetical XYZ, a 2.80 debit became a 2.02 gain at the short strike of 52 and a 2.12 loss at 44, and moved about 0.5 for ten points of implied volatility. The [income series](/blog/income) continues with the poor man's covered call, which is a diagonal built around a deep in-the-money long call.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
