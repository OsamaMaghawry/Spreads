---
title: "Gamma options meaning: what it measures, and when it matters"
slug: gamma-options-meaning
excerpt: Gamma is the rate at which delta itself changes as the stock moves, and it is largest for a strike sitting right at the money.
meta_description: Gamma is how fast an option's delta changes as the stock moves. Why it peaks at the money, why it doesn't flip sign like delta, and when to ignore it.
author: DeltaMint
category: foundations
series_order: 9
tags: gamma, option greeks, delta, moneyness, foundations
---

**Gamma** is the rate at which an option's delta changes for a $1 move in the
underlying stock. If [delta](/blog/option-delta-explained) is the speed at
which an option's price reacts to the stock, gamma is how fast that speed
itself is changing.

It shares a chain row with delta but is quoted far less often, because most of
what it says is already visible in how delta behaves as the stock moves. Read
on its own, a gamma number is a small decimal that says little; read next to
delta, it says exactly how stale that delta estimate is about to become.

## Key takeaways

- Gamma measures how fast delta itself moves, in delta per $1 of stock movement — not a price, and not a probability.
- It is largest for a strike sitting at the money and smallest for one sitting deep in or far out of the money.
- Unlike delta, gamma does not flip sign between calls and puts: it is positive for anything you are long and negative for anything you are short.
- A short time to expiration concentrates gamma into a narrower band around the strike, which is also the window where short theta is largest.
- Gamma is model output, a snapshot at one stock price and one moment, not a forecast of what the stock will do next.

## Gamma is delta's own rate of change

Delta already answers "how much does the price move." Gamma answers a
different question: how quickly does that answer change as the stock keeps
moving. A 0.30-delta call is not the same 0.30 an hour later if the stock has
moved $2 — delta drifted, and gamma is the number that says by how much.

The two sit at different levels of the same idea. Delta estimates the price
change for the next $1 move; gamma estimates how much delta itself will move
over that same dollar. Read together, they say whether a delta taken from the
chain right now is still good for the next dollar of movement, or already
stale after the stock has covered half of it.

None of this is a forecast. Both numbers come out of the same pricing model,
recomputed from the current stock price, strike, time left and [implied
volatility](/blog/implied-volatility-options-explained) — change any one input
and both numbers move without the stock doing anything at all.

## Gamma is largest at the money, and fades toward either extreme

Take the hypothetical 50-strike call already used to show [delta across
moneyness](/blog/option-delta-explained), 30 days to expiration, priced off a
40% implied volatility assumption. Delta at seven stock prices, and how much
it moved from the row above:

| Stock price | Delta | Delta's change from the row above |
| --- | --- | --- |
| $40 | 0.05 | — |
| $44 | 0.15 | +0.03 per $1, over a $4 move |
| $48 | 0.35 | +0.05 per $1, over a $4 move |
| $50 | 0.50 | +0.08 per $1, over a $2 move |
| $52 | 0.65 | +0.08 per $1, over a $2 move |
| $56 | 0.85 | +0.05 per $1, over a $4 move |
| $60 | 0.95 | +0.03 per $1, over a $4 move |

Read the third column on its own and the shape is the whole point: it climbs
from $40 to the strike, peaks either side of $50, and falls away again toward
$60. That climb-and-fall is gamma. Delta moves fastest for a $1 move while the
stock sits near the strike, and progressively slower the further the stock
already is from it.

![Five bars showing how much a hypothetical at-the-money call's delta moves per $1 of stock price, rising from 0.03 near $40 to a peak of 0.08 around the $50 strike and falling back to 0.03 near $60.](/assets/blog/gamma-across-moneyness.svg)

That peak is also where delta is least trustworthy as a static number. Far out
at $40, a $1 move barely changes delta, so last quote's 0.05 is still close to
right. Right at $50, the same $1 move can shift delta by 0.08 — an estimate
taken before the move is meaningfully out of date by the end of it.

The intuition behind the shape is simpler than the arithmetic. Near the
strike, the question the option is actually answering — will this finish
above $50 or below it — is genuinely open, so a small move in the stock shifts
the odds baked into delta by a real amount. Far from the strike in either
direction, that question is close to already decided: the $40 call is close
to worthless whatever a single extra dollar does, and the $60 call already
behaves close to the stock itself. A $1 move changes little about an outcome
that has mostly already resolved, and gamma is small there for exactly that
reason.

## Being long always means positive gamma, whether the option is a call or a put

Delta's sign depends on whether the contract is a call or a put. Gamma's sign
does not — it depends only on which side of the trade you are on.

| Position | Gamma sign | What that means as the stock approaches the strike |
| --- | --- | --- |
| Long call | Positive | Delta rises faster; a favorable move accelerates |
| Long put | Positive | Delta falls (more negative) faster; a favorable move accelerates |
| Short call | Negative | Delta moves against the seller faster |
| Short put | Negative | Delta moves against the seller faster |

A long call and a long put are opposite bets on direction, yet both carry
positive gamma. Buying either one means delta moves in your favor faster as
the stock approaches the strike from either side. Selling either one carries
the same number with the sign flipped: delta moves against the seller faster,
right where it matters most.

The mechanism behind that is worth stating plainly, because it looks like it
should not work. A call's delta rises as the stock rises — more positive. A
put's delta also rises as the stock rises — moving from something like −0.65
toward −0.35, which is an increase even though the put is still negative. Both
deltas move the same direction on the same move in the stock, and gamma is
just the size of that shared movement. Delta's sign depends on the contract;
gamma depends only on which way delta is currently sliding.

That is also why a book built from short options is described as "short
gamma" as a whole, regardless of whether the short legs are calls, puts, or
both sides of a spread. The sign comes from being short, not from which type
of contract it is.

## A short time to expiration concentrates gamma right at the strike

Gamma does not sit still as expiration approaches. The same at-the-money
strike shows a smaller gamma with two months left and a much larger one with
two days left, because there is less remaining time for the stock to prove
which side of the strike it will finish on — so delta swings harder between
"probably worthless" and "probably in the money" as the stock crosses it.

That is the same calendar window covered in [theta
decay](/blog/theta-decay-explained): the days when a short option's daily
decay is largest are the same days its gamma is largest. A seller collecting
the fastest theta in the final days before expiration is, at the same time,
holding the option whose delta moves the hardest against a stock price
crossing the strike. Neither number cancels the other; they are two different
costs of the same position, both largest in the same window.

Away from that window, gamma mostly fades into the background. Months from
expiration, at-the-money gamma is small even though delta itself already sits
near 0.50, because there is still plenty of time for the stock to move back
across the strike either way. Deep in or out of the money, gamma stays small
at almost any expiration, since delta there has little room left to move
regardless of how much time remains. Put the two together and gamma matters
most to a short, near-dated, at-the-money book, watched day to day — a single
long-dated position, held and rarely adjusted, rarely needs anyone to track it
at all.

## What a chain's gamma figure is not

A displayed gamma inherits every limit that applies to delta, because it comes
from the identical model. It is a rate, computed at one stock price and one
moment, and reading it as anything sturdier than that is where the number
stops being useful and starts being misleading.

- **It is not a price.** It says how fast delta moves, not what the option or the stock is worth.
- **It is not a probability.** Nothing about gamma estimates the odds of the strike being reached.
- **It is not fixed.** A change in implied volatility or time remaining moves gamma the same way it moves delta, with the stock unchanged.
- **It does not price a gap.** The whole idea of a rate of change assumes the stock moves in small steps; a large overnight jump crosses the zone gamma describes in one move, and the smooth relationship it implies does not hold across that jump.

The gap point is worth sitting with, because it is the one place the whole
framework quietly breaks. Delta and gamma both describe how a position
behaves as the stock creeps from one price to a nearby one, a dollar or two at
a time. A stock that opens $8 lower after an overnight announcement did not
creep anywhere — it never traded at any price in between the close and the
open, so delta never had a step-by-step move to update against.

The position simply wakes up somewhere else, at a delta the previous day's
gamma never had a chance to walk it to.

## Frequently asked questions

- **Is gamma quoted per share or per contract?** Per share, like delta. Multiply by 100 for one standard contract's total change in delta.
- **Can gamma be negative for a long option?** No. A long call or a long put is always positive gamma; only being short flips the sign.
- **Does gamma have a fixed maximum, the way delta is capped at 1?** No fixed ceiling exists, but for the ordinary strikes and expirations most traders hold, gamma stays a small fraction — the values in the table above are typical of the size involved.
- **Why do people worry more about gamma near expiration than earlier in a trade?** Because that is when it is largest for an at-the-money strike, and the delta it is attached to is changing the fastest right where the outcome is still undecided.

## The bottom line

Gamma is delta's own rate of change: largest at the money, smaller toward
either extreme, and largest of all in the final days before an at-the-money
option expires. It does not flip sign between calls and puts the way delta
does — only being long or short decides that.

It closes out the sensitivities the [foundations
series](/blog/foundations) has taken one at a time: delta, theta, implied
volatility, and now the rate at which delta itself moves. What happens next in
an account has nothing to do with a live number at all — it is what actually
lands on the statement when a contract is exercised or assigned.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
