---
title: "Rolling options explained: one ticket, two trades"
slug: rolling-options-explained
excerpt: Rolling a short option means buying it back and selling a later one on the same ticket, and the credit on that ticket is not a profit, because the loss on the closed option has already happened.
meta_description: "Rolling an option closes it and opens another on one ticket. The leg bought back realizes its gain or loss, so a roll's net credit is not a profit."
author: Osama Maghawry
category: income
series_order: 28
tags: rolling options, short put, credit, assignment, income
---

**Rolling** an option means closing it and opening a similar one in the same order, usually with a later expiration and sometimes at a different strike. For a short option, the account buys back the option it sold, sells a new one, and the broker nets the two prices into a single credit or debit.

This post continues the [income series](/blog/income) from the [poor man's covered call](/blog/poor-mans-covered-call). It prices one roll on one hypothetical short put, beside the position it replaces, to show what a roll is and what it is not. It describes the mechanics and does not suggest anyone roll anything.

## Key takeaways

- A roll is **two trades on one ticket**: a buy to close and a sell to open.
- The ticket's **credit is the difference of two prices**, not a gain.
- Rolling at the market **does not change today's profit or loss**. It moves the loss into the closing leg and carries on.
- The new option is a **new position** with its own date, strike and collateral, and a break-even that carries the loss already taken.
- A roll can be a **debit**, and the extra credit from a later date is payment for more days of risk.

## What does it mean to roll an option?

A short option has one way out that keeps the account in the same kind of position: buy it back, then sell another. Done on one ticket, that is a roll. Done as two separate orders, it is the same thing with a gap between the fills.

The worked example uses the series' hypothetical XYZ, priced with a Black-Scholes fit at 40% implied volatility, no interest rate and no dividend. Every price is a model estimate per share, standing in for a midpoint mark; one contract is 100 shares.

The account sold one 30-day 50 put for 2.29 with XYZ at $50, backed by $5,000 in cash as in the [cash-secured put post](/blog/cash-secured-put-explained). Twenty days later XYZ is at 47 and the put has 10 days left.

- **Buy to close.** The 10-day 50 put is now worth 3.30, so closing it costs 3.30 and books a 1.01 loss against the 2.29 received.
- **Sell to open.** A new put is sold, here the 40-day 50 put at 4.33.
- **Net on the ticket.** 4.33 received less 3.30 paid is a 1.03 credit, $103 per contract.

A same-strike roll is a calendar spread run backwards. A [calendar spread](/blog/calendar-spread-explained) buys the later option and sells the nearer one, which costs money. A roll buys the nearer one and sells the later one, which pays money, because the later put holds more time value. It is the same pair of options with the opposite sides.

## Why is the credit on a roll not a profit?

The 1.03 is what is left after the closing leg's cost is subtracted from the new option's price. The 1.01 loss on the old put is already in it. It was not erased; it was netted away inside the arithmetic of the ticket.

Compare the position before and after, at the same prices:

| | Before the roll | After the roll |
| --- | --- | --- |
| Short put | 10-day 50 | 40-day 50 |
| Premium kept in total | 2.29 | 2.29 − 3.30 + 4.33 = 3.32 |
| Cost to close right now | 3.30 | 4.33 |
| Profit or loss if closed right now | −1.01 | −1.01 |

![Before and after a same-strike roll on the hypothetical XYZ put, 2.29 kept against 3.30 to close and 3.32 kept against 4.33 to close both leave the position 1.01 behind.](/assets/blog/rolling-pl-before-after.svg)

The bottom row is the point. At midpoint prices, rolling changes the mark of the position by nothing. What it changes is everything that comes after: how long the put lives, what it can still lose, and how much premium is left to collect.

Real fills are not at midpoint. A roll crosses the [bid-ask spread](/blog/options-bid-ask-spread) on both legs, so the account gives up a little on each side on top of the 1.01.

## What does a roll change about the position?

Take the same-strike roll above and compare the new total premium of 3.32 with the old 2.29. Three things move, and none of them is a repair:

- **The date.** The put now expires in 40 days, not 10. [Time value](/blog/intrinsic-vs-extrinsic-value-options) is what the seller is paid for holding risk, as the [theta post](/blog/theta-decay-explained) shows, and a 40-day put holds more of it, which is why the roll paid a credit.
- **The break-even.** Counting both puts together, total premium kept is now 3.32, so the whole-trade break-even at expiration is 50 − 3.32 = 46.68, against 47.71 for the put as first sold. The new put on its own, from its 4.33, breaks even at 45.67. XYZ has to finish above the whole-trade figure, 30 days later than before.
- **The exposure.** The strike is unchanged, so the [cash backing the put](/blog/options-buying-power-requirement) is still $5,000, and the stock is still 3 points below the strike. The seller is 3 points in the money with more days ahead, not fewer.

![At expiration, the rolled XYZ put sits 1.03 above the original put's line at every stock price, with a whole-trade break-even at 46.68 rather than 47.71, but expires 30 days later.](/assets/blog/rolling-same-strike-payoff.svg)

The two lines are parallel. Below 50 each loses a dollar for each dollar the stock falls; above it each keeps its premium. The rolled line is higher by exactly the ticket's 1.03 credit, and the extra 1.03 is what the market pays for the extra 30 days of the same obligation.

## What if the roll changes the strike too?

A roll can move the strike as well as the date. Lowering a short put's strike costs premium, so the new put brings in less. Here, with XYZ at 47 and 40 days to run:

| Version of the roll | New put sold | Net on the ticket | Total premium kept | Whole-trade break-even | Cash backing it |
| --- | --- | --- | --- | --- | --- |
| Same strike: 50 | 4.33 | +1.03 credit | 3.32 | 46.68 | $5,000 |
| Lower strike: 47 | 2.48 | −0.82 debit | 1.47 | 45.53 | $4,700 |
| No new put, close only | none | −3.30 debit | −1.01 | none | none |

Lowering the strike turned a credit into a debit of 0.82, and it cut the total premium kept from 3.32 to 1.47. In return the strike sits at the stock, the break-even is lower, and $300 less cash is reserved. Neither version is better in the abstract; each is a different bundle of price, risk and time.

The bottom row is a roll with the second leg left off. The loss is the same 1.01 and the account holds no put afterward. That is the cleanest way to see that the closing leg is a trade of its own.

## Does rolling an option realize a loss?

A roll feels like a continuation because the account still shows a short put at the same strike. It is not one:

- **The loss is realized.** Buying back at 3.30 what was sold for 2.29 is a closed trade with a 1.01 loss. The new put starts from its own 4.33, and the old put's result is final.
- **The records show two things.** The broker's history carries a closing fill and an opening fill, two lines. How a tool groups them is a [separate question](/blog/options-journal-splits-spreads-into-legs) from what happened in the account.
- **It can be a debit.** Nothing says a roll pays. Lowering the strike, or moving to any strike or date where the new option is worth less than the one bought back, costs money.
- **It resets the clock.** The put's decay, its [assignment](/blog/option-assignment-what-happens) risk and its [expiration](/blog/what-happens-options-expiration) are now those of the new put, with the old date gone.
- **It does not remove the risk.** If XYZ keeps falling, a put in the money can still be assigned at 50, and is exercised if it finishes in the money, and the account still buys shares at a price above the market.
- **The tax treatment is its own question.** The closing trade is a closed loss, and how a loss is treated depends on rules this post does not cover.

A covered call rolls the same way: buy back the short call, sell a later one, and let the shares collateralize it. The arithmetic of the ticket is identical, with a call's price in place of a put's. The covered call's own mechanics are in the [covered call post](/blog/covered-call-explained).

## Frequently asked questions

- **Does rolling a short option lose money?** Apart from the bid-ask spread and commissions, it does not change the mark at the moment of the roll. The loss on the closed option is real and stays in the record.
- **What does "rolling for a credit" mean?** The new option sold brought in more than the old one cost to buy back. The credit is the ticket's net, and says nothing about the position's total.
- **Is rolling an option the same as closing it and opening a new one?** One ticket and two trades: a closing fill and an opening fill, which fill and report as separate lines.
- **Can a roll be a debit?** Yes. A lower strike, an earlier expiration or a wide market on the two legs can all turn it into a debit.

## The bottom line

A roll closes one short option and opens another on one ticket. On the hypothetical XYZ put, a same-strike roll paid a 1.03 credit and left the position exactly 1.01 behind, where it was before.

What the roll does is trade days for premium: 30 more days of the same obligation, a break-even moved from 47.71 to 46.68, and the same $5,000 behind it. Whether that is a credit or a debit depends on the strike and the date chosen, and the loss already taken stays taken. The [income series](/blog/income) continues with covered calls on shares that were assigned.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
