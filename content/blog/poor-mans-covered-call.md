---
title: "Poor man's covered call: a long call in place of 100 shares"
slug: poor-mans-covered-call
excerpt: A poor man's covered call sells a near-dated call against a long, deep in-the-money call instead of 100 shares, a diagonal spread that copies part of a covered call and not all of it.
meta_description: "A poor man's covered call priced on one hypothetical stock: the debit against 100 shares, the strike-gap rule checked by pricing, and what it does not copy."
author: DeltaMint
category: income
series_order: 27
tags: poor mans covered call, diagonal spread, covered call, deep in the money call, extrinsic value
---

A **poor man's covered call** is a short, near-dated call sold against a long, later-dated, deep in-the-money call on the same stock, where a [covered call](/blog/covered-call-explained) would sell it against 100 shares. The long call stands in for the shares. Structurally it is a [diagonal spread](/blog/diagonal-spread-explained): two calls, two strikes, two expirations, the lower strike bought and the higher one sold.

This post continues the [income series](/blog/income) from diagonal spreads. It prices one hypothetical poor man's covered call (often shortened to PMCC) beside a covered call on the same stock and the same short call, and states what the long call does not copy. It describes the structure and does not suggest anyone open one.

## Key takeaways

- A **deep in-the-money call** stands in for 100 shares.
- It costs **far less cash at the fill**. In this model, with no dividend, that debit is the most it can lose.
- Far above the short strike, its gain sits **below the covered call's** by the time value paid for the long call at the fill.
- If the strike gap is **smaller than the net debit**, a large rise can end in a loss.
- It gets **no dividends or votes**, and it decays and expires.

## What is a poor man's covered call, and what does it cost?

The worked example uses the series' hypothetical XYZ at $50, priced with a Black-Scholes fit at 40% implied volatility, no interest rate and no dividend. Every price is a model estimate per share; one contract is 100 shares. The model values stand in for midpoint marks, and a real fill crosses the [bid-ask spread](/blog/options-bid-ask-spread) on each leg.

The covered call buys 100 shares at $50 and sells the 30-day 52 call for 1.47. The poor man's covered call buys the 120-day 40 call for 10.90 instead of the shares and sells the same 52 call.

| | Covered call | Poor man's covered call |
| --- | --- | --- |
| Stands in for the stock | 100 shares at 50.00 | Long 120-day 40 call at 10.90 |
| Net cash out at the fill | $5,000 − $147 = $4,853 | $1,090 − $147 = $943 |
| Net delta at the fill | about 0.61 | about 0.47 |

The 40 call's price splits into 10.00 of intrinsic value, the stock's $10 lead over the strike, and 0.90 of [extrinsic value](/blog/intrinsic-vs-extrinsic-value-options). That 0.90 is the part the shares do not cost. Its [delta](/blog/option-delta-explained) of about 0.86 means it moves roughly 86 cents for each dollar the stock moves near $50, so the pair responds to the stock less than the covered call does.

The $943 is paid in full. In a margin account the short call is commonly treated as covered by the long call, which is struck lower and expires later. Cash accounts and retirement accounts may not give a diagonal that treatment at all, since the legs expire on different dates. The [buying power post](/blog/options-buying-power-requirement) covers how spreads are reserved, and the broker's own rule governs.

## How does it compare with a covered call when the short call expires?

On day 30 the short 52 call is worth its intrinsic value, if any. The shares are worth what the stock is worth, and the 40 call still has 90 days left, so it is priced at 40% for each stock price:

| XYZ when the short call expires | Covered call, gain or loss | Poor man's covered call, gain or loss |
| --- | --- | --- |
| 40 | −8.53 | −6.27 |
| 50 | +1.47 | +1.15 |
| 52 | +3.47 | +2.96 |
| 56 | +3.47 | +2.74 |

![When the short call expires, the covered call levels off at 3.47, while the poor man's covered call eases toward 2.57 and falls more slowly below 50.](/assets/blog/pmcc-vs-covered-call-payoff.svg)

Three differences follow:

- **The upside ends lower.** Far above 52 the pair settles toward the 12.00 strike gap, a 2.57 gain against the covered call's 3.47. The 0.90 between them is the long call's extrinsic value at the fill.
- **A still stock leaves less.** At 50 the long call lost 0.32 of time value, so 1.15 is left of the 1.47 credit.
- **Further down, the loss is smaller in dollars.** At 40 it is 6.27 against 8.53: the long call's delta starts below 1 and falls with the stock.

The break-evens are close: 48.53 for the covered call and about 48.69 for the poor man's covered call, the second found by pricing the long call rather than by formula. Below 48.53, both positions lose money. In the narrow band between 48.53 and about 48.69, the covered call is slightly ahead and the poor man's covered call is slightly behind, because the long call has already shed some time value.

The smaller loss below 50 has a limit with a date on it. If the short call expires worthless and XYZ is below 40 when the long call expires, that call is worthless too and the whole $943 is gone. Shares that fell to the same price would still be held.

## Why must the strike gap be larger than the debit?

A rule often quoted for this structure is that the long strike plus the net debit should sit below the short strike. It is the same as saying the short strike plus the short call's credit should sit above the long strike plus the long call's price. Here: 40 + 9.43 = 49.43, below 52; equivalently 52 + 1.47 = 53.47, above 40 + 10.90 = 50.90.

Pricing shows why it matters. Far above the short strike, and at any assignment settled by exercising the long call, the pair is worth the strike gap, or very close to it. A gap of 12.00 against a 9.43 debit leaves 2.57 per share.

Now take a shallower version on the same stock. The 120-day 46 call costs 6.67 with a delta of about 0.68, and the 30-day 50 call brings in 2.29. The net debit is 4.38, against a strike gap of 4.00, so 46 + 4.38 = 50.38 sits above the 50 short strike.

![Settled by exercise after assignment, the 40/52 version's 12.00 gap covers its 9.43 debit; the 46/50 version's 4.00 gap does not cover 4.38.](/assets/blog/pmcc-strike-gap-vs-debit.svg)

Priced at the short call's expiration, that version is up about 1.75 per share with XYZ at 50 and 0.06 at 60, then down 0.31 at 70. Assigned and settled by exercising the long 46 call, it locks in 4.00 − 4.38, a 0.38 loss per share. A large rise in the stock, the case a covered call handles best, is the case this version loses on.

The rule covers the upside and the settlement by exercise, in a model with no dividends. It says nothing about the downside, where the long call can still lose all of its value.

## What happens if the short call is assigned?

A covered call that is assigned delivers shares the account already holds. A poor man's covered call has no shares, so [assignment](/blog/option-assignment-what-happens) of the short 52 call leaves the account short 100 shares at $52, held against a long call. Take XYZ at $56 on the short call's expiration day, with the long 40 call worth 16.17 and 90 days left.

- **Exercise the long call.** Paying $4,000 for shares at 40 closes the short stock. The pair settles at 12.00, a 2.57 gain, and the long call's 0.17 of extrinsic value is thrown away.
- **Buy shares, sell the long call.** If XYZ is still at 56 when the orders fill, shares bought at 56 close the short at 52, a 4.00 cost; the call sells for 16.17. Net 12.17, a 2.74 gain. At a different price that day, this route's result moves with it; the exercise route's does not.
- **Early assignment can come first.** It is most likely just before an ex-dividend date, as in the [early exercise post](/blog/early-exercise-options), and the account then owes the dividend.

The difference between the first two routes, 0.17, is exactly the extrinsic value that exercising gives up. Either route needs the account to fund or margin a share position for at least a moment, and the broker's own rules govern how that is handled.

## What does a poor man's covered call not copy from 100 shares?

The long call tracks the stock only part of the way:

- **No dividends.** A call holder receives none; expected dividends lower the call's price instead.
- **No votes.** Shareholder rights belong to the shares.
- **It decays.** The 0.90 of extrinsic value runs to zero by expiration, even with XYZ at $50.
- **It expires.** In 120 days the long call is gone; shares have no date.
- **It is long volatility.** A drop in [implied volatility](/blog/implied-volatility-options-explained) lowers its price.
- **It can lose the whole debit.** Below 40 at the long call's expiration, all $943 is gone.

Hold XYZ at $50 on the short call's expiration day and change only implied volatility; the long 40 call is worth 10.20, 10.58 and 11.11:

| Implied volatility that day | Poor man's covered call | Covered call |
| --- | --- | --- |
| 30% | +0.77 | +1.47 |
| 40% | +1.15 | +1.47 |
| 50% | +1.68 | +1.47 |

The covered call's result at that date does not depend on implied volatility; the shares have no time value to reprice. The poor man's covered call's does, by 0.38 to 0.53 per share for each ten points.

## Frequently asked questions

- **Is a poor man's covered call a diagonal spread?** Yes, a call diagonal with a deep in-the-money long leg.
- **What is the max loss on a poor man's covered call?** The net debit, in this model. A dividend owed after early assignment can add to it.
- **What if the short call is assigned?** The account is short 100 shares, settled by exercising the long call or buying shares.

## The bottom line

A poor man's covered call swaps 100 shares for a deep in-the-money call, so it ties up a debit rather than the share price. On the hypothetical XYZ that was $943 against $4,853 for the covered call, both after the same 1.47 credit.

The swap changes the position. Its upside ends lower by the long call's time value, it decays and expires, it is exposed to implied volatility, and a large rise loses money if the strike gap is smaller than the debit. The [income series](/blog/income) continues with rolling a short option.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
