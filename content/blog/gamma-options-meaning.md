---
title: "Gamma in options explained: how fast delta itself changes"
slug: gamma-options-meaning
excerpt: Gamma is the rate at which an option's delta changes as the stock moves, which is the reason a delta reading is only good for the next small move.
meta_description: Gamma measures how fast an option's delta changes when the stock moves. Where it is largest, why it grows into expiration, and when it can be ignored.
author: DeltaMint
published_at: 2026-09-15T10:00:00+00:00
category: foundations
series_order: 9
tags: gamma, option greeks, delta, expiration, foundations
---

**Gamma** is the estimated change in an option's delta for a $1 change in the
price of the underlying stock. A contract showing a delta of 0.52 and a gamma of
0.07 is expected to show a delta of about 0.59 once the stock has risen a
dollar, with everything else held still.

That makes gamma the answer to a question [the delta
post](/blog/option-delta-explained) left open. Delta estimates the next small
move in the premium; gamma is the reason the word "small" was in that sentence
at all.

It sits on the same chain row as delta, theta and vega, and like them it is
recomputed from live inputs rather than fixed at the fill.

## Key takeaways

- Gamma estimates how much delta changes for a $1 move in the stock, quoted per share like delta itself.
- A held option carries positive gamma, a sold one negative — for calls and puts alike, and a call and a put on the same strike carry the identical figure.
- Gamma is largest for strikes sitting near the stock price and falls away above and below them.
- At the money it grows as expiration nears, so the same strike's delta travels further per dollar in its last week than in its first month.
- Gamma explains why a delta reading goes stale. It is not a separate force acting on the premium.

## What does gamma measure?

Gamma measures the rate at which delta changes, which makes it a sensitivity of
a sensitivity. Delta answers "what does the premium do if the stock moves a
dollar"; gamma answers "what does that first answer do if the stock moves a
dollar".

It is quoted per share, the same way delta and the premium are. Multiply by 100
and it reads as share-equivalents: a gamma of 0.07 means one contract's exposure
shifts by roughly seven shares' worth for each dollar the stock moves.

- **It is second order.** Nothing on the chain moves the premium except the inputs delta, theta and vega already describe. Gamma describes how one of those sensitivities — delta — is itself shifting while the move happens.
- **It is local, exactly as delta is.** Gamma has its own rate of change, so you cannot add it up dollar by dollar across a large move and expect the arithmetic to hold.
- **It is model output.** It comes from the same pricing model that produces delta and theta, from the same live inputs, and it says nothing about what any stock will do.

The practical consequence is a limit on how long a delta reading stays usable. A
strike whose gamma is small keeps roughly the delta it showed this morning; a
strike whose gamma is large may not resemble its morning self by the close.

![The delta of one hypothetical 50-strike call plotted against the stock price forms an S-curve that is steepest where the stock sits at the strike, and gamma is the slope of that curve at any point.](/assets/blog/gamma-is-deltas-slope.svg)

The 0.52 marked at the strike is the same number the delta post rounded to
0.50 — both are correct readings of the same curve, and this post keeps the
extra digit because gamma is the size of the change in it.

## Why do held options carry positive gamma and sold ones negative?

A held call gains delta as the stock rises and loses it as the stock falls. A
held put does the same thing in its own units: its delta runs from 0 toward −1
as the stock falls, which is still an increase in the direction the contract
points. The contract's gamma is positive for both.

Selling flips it, the same way selling flips the sign on
[theta](/blog/theta-decay-explained) and
[vega](/blog/implied-volatility-options-explained). What the sign describes is
whether the position's directional exposure grows in the direction that is
helping it or the direction that is hurting it.

| Position | Position gamma | What happens as the stock moves |
| --- | --- | --- |
| Long call | Positive | Delta climbs toward 1 as the stock rises, drains toward 0 as it falls |
| Long put | Positive | Delta runs toward −1 as the stock falls, drains toward 0 as it rises |
| Short call | Negative | The position gets shorter the further the stock rises |
| Short put | Negative | The position gets longer the further the stock falls |

Read the last column and the pattern is the mirror of the theta table. A held
option's exposure grows into the move that favours it and shrinks out of the one
that does not; a sold option's exposure does the opposite, and does it without
anybody placing an order.

A position carrying positive gamma is described as long gamma; one carrying
negative gamma, short gamma.

## Example: how much delta changes on a $1 move

Take the hypothetical 50-strike call used earlier in this series, with 30 days
left and the stock at $50. Only the stock price changes; the strike, the
calendar and the volatility assumption stay put.

- **Stock at $50.** Delta about 0.52, gamma about 0.07 — one contract behaving like roughly 52 shares.
- **Stock at $51.** Delta about 0.59, or roughly 59 shares' worth of exposure.
- **Stock at $49.** Delta about 0.45, or roughly 45 shares' worth.

The delta post called this contract's at-the-money delta "about 0.50", and for
estimating a premium move that rounding costs nothing. Here it is worth carrying
the extra hundredths, because the whole subject is a change of about seven of
them.

Now follow the premium through the same dollar. At $50 this call is worth
$2.2862, the figure the [implied
volatility](/blog/implied-volatility-options-explained) post rounds to $2.29;
at $51 it is worth $2.8434. The gain is $0.5572 a share, where the starting
delta of 0.5229 on its own would have predicted $0.5229 — a gap of about
three and a half cents.

That gap is the curvature. Delta was not 0.5229 for the whole trip — it
climbed toward 0.591 on the way up, so the premium collected slightly more
than a straight-line estimate allowed for. On a $1 move it is small change;
the point is that it is there, and that it grows with the square of the move
rather than in step with it.

## Why is gamma highest at the money?

Delta has to travel from near 0 to near 1 over the life of a call, and almost
all of that travel happens while the stock is near the strike. Far below it,
delta is already close to 0 and a dollar barely disturbs it; far above, delta is
close to 1 and there is little room left to move.

| Stock price | The strike is | Delta | Gamma |
| --- | --- | --- | --- |
| $44 | Far out of the money | 0.15 | 0.045 |
| $50 | At the money | 0.52 | 0.069 |
| $56 | Deep in the money | 0.85 | 0.036 |

The middle row is the largest — it sits inside the steep, highlighted section
of the S-curve the diagram above draws. The outer rows are lower but not
dramatically so, and the reason is worth stating:
30 days at this volatility spreads the distribution of outcomes wide enough that
$44 and $56 are both still live. Shorten the calendar or lower the volatility
and the same three figures separate much further.

## Why does gamma grow as expiration approaches?

At expiration a call's delta is not a curve at all. It is a step: 1 if the stock
finishes above the strike, 0 if below. Every day closer to that date bends the
curve nearer to the step, and gamma is what the bending looks like as a number.

| Days to expiration | Gamma, at the money | Exposure change per $1 move, one contract |
| --- | --- | --- |
| 60 | 0.049 | about 5 shares |
| 30 | 0.069 | about 7 shares |
| 14 | 0.102 | about 10 shares |
| 7 | 0.144 | about 14 shares |

This is the same last-week steepening that theta shows from the other side, on
the same contract. An at-the-money option in its final days is where both
numbers are at their most extreme, which is why that week behaves so unlike the
month before it.

Away from the strike the shape is different, in the same way theta's was. A
strike sitting well out of the money sees its gamma peak somewhere in the middle
of its life and then fall toward zero, because as the days run out there is no
longer time for delta to travel anywhere.

## When does gamma matter, and when does it not?

Gamma earns attention in a narrow set of circumstances and can be left alone in
most of the rest. The honest version is that it is a correction term, not a
headline.

- **It matters where delta is moving fastest.** A strike near the stock price with days rather than months left is one whose exposure can change materially in an afternoon.
- **It matters least far from the strike with time to run.** There, delta drifts slowly and this morning's reading is still roughly this afternoon's.
- **It compounds on a sold option, up to a point.** Negative gamma means the exposure grows in whichever direction is going against the position, so each dollar does a bit more than the last — until the option is deep enough in the money that its delta approaches 1 and the damage tops out at the stock's own rate.
- **It never acts alone.** Theta and vega pull on the same premium in the same session, so no single day's price change is attributable to gamma by itself.
- **It is not a forecast.** Like delta, it is arithmetic on today's prices and carries no information about direction.

The number also stops being a single reading once more than one position is
open. Every short option on the book has its own gamma, and the exposures they
carry shift together whenever the underlying moves, so an account's net
direction can change while nobody is looking at it — which is a problem of scale
rather than of gamma, and is taken up in the [after the
fill](/blog/managing) posts.

## Frequently asked questions

- **Is gamma quoted per share or per contract?** Per share, like delta and the premium. Multiply by 100 to read it as share-equivalents: 0.07 is about seven shares of exposure per $1 move on one contract.
- **Do calls and puts have different gamma?** No. A call and a put on the same strike and expiration carry the same gamma, because a put's delta is the call's delta minus one and the two therefore change at an identical rate.
- **Can gamma be negative?** Not for the contract itself — a listed option's own gamma is positive. A position is described as negative-gamma when the option has been sold, because the holder of that position inherits the opposite sign.
- **What is a gamma squeeze?** It is a market-structure term for a feedback loop in the underlying, where participants who are short options buy or sell stock to stay hedged and their hedging pushes the price further. It describes what other people's hedging does, not a property of the number on your own chain row.

## The bottom line

Gamma is the rate at which delta changes, and its main practical use is negative:
it tells you how quickly the rest of the chain row goes out of date. It is
largest near the strike, grows there as expiration approaches, and fades to
almost nothing far above or below.

It is the fourth of the sensitivities the [foundations
series](/blog/foundations) takes one at a time, after
[delta](/blog/option-delta-explained), [theta](/blog/theta-decay-explained) and
[implied volatility](/blog/implied-volatility-options-explained). What actually
lands in an account when a short option is assigned comes next.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
