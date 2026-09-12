---
title: "Option delta explained: what it measures and what it's for"
slug: option-delta-explained
excerpt: Delta estimates how much an option's price moves for a $1 move in the stock, and it is the number traders use to compare strikes across different stocks and expirations.
meta_description: Delta estimates an option's price move for a $1 move in the stock. What the sign means, and why strike distance is quoted in delta, not dollars.
author: DeltaMint
published_at: 2026-09-12T10:20:00+00:00
category: foundations
series_order: 6
tags: delta, option greeks, moneyness, strike selection, foundations
---

**Delta** is the estimated change in an option's price for a $1 change in the
price of the underlying stock. A call showing a delta of 0.30 is expected to
gain about $0.30 a share if the stock rises $1, with everything else held
still.

It sits on the same chain row as the bid and the ask, and like them it is a
live number rather than a fixed property of the contract. Delta itself changes
as the stock does.

## Key takeaways

- Delta estimates the option's price change for a $1 move in the stock, per share — about $30 on one contract at 0.30.
- Calls carry delta between 0 and 1, puts between 0 and −1. The sign is a direction, not a size.
- The estimate holds for a small move only, because delta drifts as the stock moves.
- Delta near 0.50 means the strike sits near the stock price; near 1 or near 0 means deep in or far out of the money.
- Delta is often read as a rough estimate of finishing in the money, but it is model output and says nothing about what will happen.

## What does delta measure?

Delta measures sensitivity, and it is quoted per share like the premium. A
delta of 0.30 on one contract, covering 100 shares, is about $30 for a $1 move
in the stock.

"Everything else held still" is doing real work in that definition. Neither the
calendar nor the market's expectation of future movement stands still, so the
price change over an actual afternoon mixes delta with everything else at once.

- **It is model output, not a rule.** Delta is computed from live inputs; change an input and the number changes.
- **It is local.** As the stock rises a call's delta rises with it, so an estimate made at the start of a $5 move is stale by the end of it.
- **It moves with time too.** The same strike on the same stock shows a different delta a week later.

A displayed delta is itself computed from a price, and on a wide quote that
price is usually the midpoint — the number the [bid-ask
spread](/blog/options-bid-ask-spread) post described as one nobody offered.

## Why do calls and puts carry opposite signs?

A call gains value when the stock rises, so its delta is positive. A put gains
value when the stock falls, so its delta is negative. Nothing deeper is
happening than the direction the contract points.

Selling flips the exposure a trader tracks. A sold option is the mirror of the
bought one — the side covered in [calls and puts from both
sides](/blog/call-vs-put-option-explained) — so the position's delta carries
the opposite sign to the contract's.

| Position | The contract's delta | Position gains when | Position delta |
| --- | --- | --- | --- |
| Long call | 0 to +1 | The stock rises | Positive |
| Short call | 0 to +1 | The stock falls | Negative |
| Long put | 0 to −1 | The stock falls | Negative |
| Short put | 0 to −1 | The stock rises | Positive |

Read the last column and the four rows collapse into two behaviours: a long
call and a short put both carry positive position delta, a short call and a
long put both carry negative.

That is why delta is often quoted as share-equivalent exposure. A short put on
a contract showing −0.20 leaves the position at +0.20, which behaves like
roughly 20 shares of stock — for the next small move, and no further.

## Example: one call's delta at three stock prices

Take the hypothetical 50-strike call from the [intrinsic and extrinsic
value](/blog/intrinsic-vs-extrinsic-value-options) post, with 30 days left. Strike
and expiration stay put; only the stock price changes.

![The same 50-strike call shows a delta of 0.15 far out of the money, about 0.50 at the money, and 0.85 deep in the money.](/assets/blog/delta-across-moneyness.svg)

| Stock price | The strike is | Delta | Estimated move on a $1 rise |
| --- | --- | --- | --- |
| $44 | Far out of the money | 0.15 | $0.15 a share, $15 a contract |
| $50 | At the money | 0.50 | $0.50 a share, $50 a contract |
| $56 | Deep in the money | 0.85 | $0.85 a share, $85 a contract |

Check the middle row. With the stock sitting at the strike, the contract moves
at roughly half the pace of the stock underneath it.

The outer rows bracket it. At $44 a one-dollar rise leaves the right to buy at
$50 still out of reach, so little of the move reaches the premium; at $56 the
contract already behaves much like the shares it controls.

Each figure is true only at that moment. Walk the stock from $44 to $56 and the
delta climbed the whole way; no single number describes the trip.

## Is delta the probability of expiring in the money?

It is commonly read as a rough stand-in for that, and the reading has limits
worth stating plainly. The closest quantity comes out of the same model that
prices the option, from the same inputs.

- **It is model output.** Change the volatility input and the number moves without the stock moving at all.
- **It is not the same quantity.** The textbook probability of finishing in the money is a related but distinct figure that delta approximates rather than equals.
- **It is not a forecast.** An estimate drawn from today's prices says nothing about what a particular stock will do.

So a strike showing 0.15 delta is sometimes described as roughly a 15-in-100
chance of finishing in the money. That is a rough label and nothing more — not
a promise, and not a measurement of anything.

## How do traders use delta to compare strikes?

Distance in dollars does not travel between stocks. A strike $5 below a $60
stock and one $5 below a $400 stock are not comparable distances, and both are
different again with two weeks left instead of two months.

Delta collapses that into one figure. It already reflects the stock price, the
time remaining and the expected movement, so a 0.20-delta strike on one name
and a 0.20-delta strike on another are comparable in a way dollar distance
never is.

That is why strike distance is usually discussed in delta. Traders commonly
describe short strikes in the 15 to 20 delta range, or an at-the-money leg as
"the 50 delta".

The same number states a trade-off rather than settling it. A strike further
from the stock shows a smaller delta in magnitude and carries a smaller
premium; a nearer strike shows a larger delta and a larger premium — for a put
as much as a call, since a −0.10 delta is smaller in magnitude than a −0.30
one. Which of those a trader wants is not something delta answers.

## Frequently asked questions

- **Is delta quoted per share or per contract?** Per share, like the premium. Multiply by 100 for a standard contract: 0.30 is about $30 per $1 of stock movement.
- **Why is my put showing a negative delta?** Because a put gains value when the stock falls. A put at −0.30 is expected to lose about $0.30 a share on a $1 rise.
- **Is an at-the-money delta always exactly 0.50?** No. It sits near 0.50 and drifts with the time remaining and other inputs, so treat it as an approximation.
- **Can one option's delta exceed 1?** No. A share behaves like a delta of 1, and an option cannot outrun the shares it is written on.
- **Does delta change as the stock moves?** Yes, continuously. It is a snapshot at one stock price rather than a fixed property of the contract, and the rate at which it drifts is its own number, later in this series.

## The bottom line

Delta is one number on a chain row doing two jobs: it estimates the next small
price move, and it rescales distance-from-the-stock into something comparable
across names and expirations. Both are approximations that change as the stock
and the calendar do.

It is also the first of the sensitivities the [foundations
series](/blog/foundations) takes one at a time. What the passage of a day alone
does to a price comes next.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
