---
title: "Gamma explained: how fast an option's delta changes"
slug: gamma-options-meaning
excerpt: Gamma is the rate at which an option's delta changes as the stock moves, and it is the number that says how quickly a delta reading goes stale.
meta_description: Gamma is how fast an option's delta changes for a $1 move in the stock. Why it peaks at the money, and when it matters and when it does not.
author: DeltaMint
category: foundations
series_order: 9
tags: gamma, option greeks, delta, convexity, foundations
---

**Gamma** is the estimated change in an option's delta for a $1 change in the
price of the underlying stock. A call showing a delta of 0.50 and a gamma of
0.07 is expected to show a delta of about 0.57 once the stock has risen a
dollar.

That makes it a second-order number, and the only one in this series that
measures another Greek rather than the premium.
[Delta](/blog/option-delta-explained) says how fast the option's price moves;
gamma says how fast delta moves.

That earlier post called delta a local estimate, good for a small move and
stale after a large one. Gamma is the number that says how quickly it goes
stale.

## Key takeaways

- Gamma estimates the change in delta for a $1 move in the stock, quoted per share in delta units.
- Gamma is positive on calls and puts alike; a bought option carries it, a sold one is short it.
- Gamma is highest at the money and falls away both deep in the money and far out of it.
- At the money it rises sharply into expiration; away from the money it shrinks toward zero.
- It is why a delta reading describes a moment rather than the contract.

## What does gamma measure?

Gamma measures the rate of change of delta, which is why it answers a
different question from every other sensitivity on the chain row. Delta,
theta and vega each estimate what happens to the *price*; gamma estimates
what happens to *delta*.

It is quoted the same way delta is — per share, in delta units, for a $1 move
in the stock. A gamma of 0.07 means a dollar of stock movement is expected to
change the contract's delta by about 0.07, in the direction the stock went.

- **It is an estimate of an estimate.** Delta approximates the next price move; gamma approximates how delta shifts.
- **It carries no dollars of its own.** Gamma is delta per dollar, so reaching money takes a second step through delta.
- **It changes too.** Gamma moves as the stock, the calendar and implied volatility move.
- **It is symmetrical for a small move.** A $1 fall shifts delta by roughly the same amount the other way.

The practical content of that is one sentence: a delta read off a chain is true
at the price the stock trades at now, and gamma says whether the reading
survives the next dollar.

## Why is gamma highest at the money?

Because that is where a dollar of stock movement changes the most about the
contract's situation. Deep in the money, the option already behaves much like
the shares, and another dollar barely changes that; far out of the money, it
behaves like almost nothing, and another dollar barely changes that either.

At the strike, the same dollar moves the contract between two genuinely
different states. That is the curvature traders mean when they call an
option's price curve convex: delta is not a straight line in the stock price,
and gamma is the bend in it.

The consequence for a reader of chains is that gamma is not monotonic the way
delta is. Delta climbs steadily as a call goes from far out of the money to
deep in it; gamma rises to a peak near the strike and then falls away again on
the other side.

## Do calls and puts carry the same gamma?

Yes, and this is where gamma parts company with delta. A call's delta is
positive and a put's is negative, but both contracts carry positive gamma —
the delta of each moves in the same direction the stock does.

What splits the sign is the side of the fill, exactly as it did for
[theta](/blog/theta-decay-explained) and vega in the two previous posts. A
bought option gives the holder that positive gamma; a sold one hands it to the
other party and leaves the seller short it.

| Position | Contract's gamma | Position's gamma | The position's delta then |
| --- | --- | --- | --- |
| Long call | Positive | Positive | Moves with the stock |
| Long put | Positive | Positive | Moves with the stock |
| Short call | Positive | Negative | Moves against the position |
| Short put | Positive | Negative | Moves against the position |

Read the last column and the phrase "long gamma" stops being jargon. A long
call's delta rises as the stock rises, so the position gains exposure as the
move continues in its favour, and sheds exposure as the stock falls away.

A short option does the reverse. A sold call picks up negative exposure as the
stock climbs toward and through the strike; a sold put picks up positive
exposure as the stock falls. That is the whole meaning of the complaint that a
position is short gamma.

## Example: gamma at three stock prices

Take the same hypothetical 50-strike call from the [delta
post](/blog/option-delta-explained), with 30 days left, at the same three
stock prices and the same deltas. Only gamma is added.

![The same 50-strike call carries its highest gamma at the money and lower gamma both far out of the money and deep in the money.](/assets/blog/gamma-across-moneyness.svg)

| Stock price | Delta | Gamma | Estimated delta after a $1 rise |
| --- | --- | --- | --- |
| $44 (far out of the money) | 0.15 | 0.05 | about 0.20 |
| $50 (at the money) | 0.50 | 0.07 | about 0.57 |
| $56 (deep in the money) | 0.85 | 0.04 | about 0.89 |

The arithmetic in the last column is just addition. At the money, 0.50 plus a
gamma of 0.07 estimates a delta of about 0.57 after the next dollar; far out
of the money, 0.15 plus 0.05 estimates about 0.20; deep in the money, 0.85
plus 0.04 estimates about 0.89.

The middle row shows the largest delta change of the three. Delta cannot pass
1, so the deep in-the-money row is running out of room, and its gamma reflects
that.

Two cautions on those figures. Stack four of them to walk the stock from $50
to $54 and the estimate drifts, because gamma changed at every step. And
raising the movement priced into that chain, as [the previous
post](/blog/implied-volatility-options-explained) describes, flattens the peak
and spreads it across more strikes.

## Gamma concentrates at the money as expiration approaches

This is the part worth stating precisely, because it is usually passed along
as a vague warning about holding into expiration. The pattern is specific and
checkable. Hold the same hypothetical call, and watch two stock prices as the
days run out.

| Days to expiration | Gamma at the money ($50 stock) | Gamma far out of the money ($44 stock) |
| --- | --- | --- |
| 30 | 0.07 | 0.05 |
| 7 | 0.14 | 0.01 |
| 1 | 0.38 | about 0.00 |

The at-the-money column roughly doubles from 30 days to 7, and then roughly
doubles again and more into the final day. On that last day a gamma of 0.38
puts a delta of 0.50 at about 0.88 after a dollar up and about 0.12 after a
dollar down — an estimate that is itself only good for a far smaller move,
since gamma is moving that fast too.

The far-from-the-money column does the opposite over exactly the same stretch.
At $44 with a week left there is very little chance of the stock reaching $50,
so a dollar of movement changes delta almost not at all, and by the last day
it changes nothing.

- **"Gamma risk" describes a strike, not a date.** The same calendar quietens a strike sitting well away from the stock.
- **It is two-sided.** Delta can improve as fast as it deteriorates; direction decides which.
- **Distance is not fixed.** A strike that was far away when it was sold can be at the money a fortnight later.
- **It compounds across a book.** Several positions can approach the money in one session, all speeding up together.

That last point is where a single chain row stops being enough. Adding delta
across a book of positions is a sum that quietly assumes nothing is curving —
which is precisely what gamma denies.

## Frequently asked questions

- **Is gamma the same for calls and puts?** On one strike and expiration, both carry positive gamma of the same size. Delta differs in sign; gamma does not.
- **Can gamma be negative?** Not on a bought contract. A *position* is short gamma when the option was sold, and a multi-leg structure can be net short it.
- **Does gamma stay constant?** No. It moves with the stock, the days remaining and implied volatility, so it is a reading rather than a property.
- **Why do traders say a position is short gamma?** Because a sold option's delta moves against the position, so exposure grows in the direction already working against it.

## The bottom line

Gamma is the rate of change of delta: a small number in ordinary conditions, a
large one when a strike sits near the stock with little time left. The
contract's gamma is positive, call or put; the position's is negative when the
option was sold.

It is the last of the sensitivities the [foundations
series](/blog/foundations) takes one at a time, after
[delta](/blog/option-delta-explained), theta and [implied
volatility](/blog/implied-volatility-options-explained). It is also why those
three are read as a snapshot: on a book of several positions, every delta on
the screen drifts at its own speed. The series continues with what happens
when a short option is assigned.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
