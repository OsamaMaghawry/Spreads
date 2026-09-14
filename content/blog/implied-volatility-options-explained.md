---
title: "Implied volatility explained: why a chain reprices before earnings"
slug: implied-volatility-options-explained
excerpt: Implied volatility is the movement an option's own price implies, and because every contract on a chain is priced from the same expectation, they reprice together.
meta_description: Implied volatility is the movement an option's price implies, not a forecast. What vega turns it into in dollars, and why premiums move when the stock doesn't.
author: DeltaMint
published_at: 2026-09-14T10:00:00+00:00
category: foundations
series_order: 8
tags: implied volatility, vega, option greeks, earnings, foundations
---

**Implied volatility** is the amount of future movement in the underlying
stock that an option's current price implies, quoted as an annualised
percentage. It is not measured from the stock's history and it is not a
forecast: it is the volatility figure that makes a pricing model return the
price the contract is actually trading at.

**Vega** is the sensitivity that goes with it — the estimated change in an
option's price for a one-point change in implied volatility, quoted per share
like the premium.

Because implied volatility is solved backwards out of the price, the two move
together by construction. A premium that changes while the stock and the
calendar both stand still is, in this language, an implied volatility change
— over a longer stretch the passage of time moves the price too, which is
what [the previous post](/blog/theta-decay-explained) covers on its own.

## Key takeaways

- Implied volatility is derived from the option's price, not from the stock's past. It is often shortened to IV on a chain.
- Vega estimates the price change for one point of IV, per share — about $6 on one contract at 0.06.
- IV only moves extrinsic value, so a rise lifts every premium on the chain at once while intrinsic value sits unchanged.
- Vega is largest at the money in dollar terms; strikes far out of the money hold less premium but move more in proportion, while deep in-the-money strikes move least in proportion because most of their premium is intrinsic.
- A scheduled event inside an option's remaining life raises the movement priced into every contract covering it, and the same contracts reprice down once the outcome is known.

## What does implied volatility actually measure?

It measures what the market is charging for uncertainty, expressed in the
units a pricing model takes as an input. Every other input — stock price,
strike, days remaining, rates — is observable, so implied volatility is the
one left over when the model is run in reverse from the traded price.

- **It is derived, not observed.** Nobody quotes IV directly. A price is quoted, and IV is what falls out of it.
- **It is annualised.** A chain showing 40% is stating a yearly figure, which the model scales down to the days the contract actually has left.
- **It is not historical volatility.** Historical, or realised, volatility is measured backwards from moves that already happened. The two can sit far apart.
- **It has no direction.** A high number says a large move is priced, not which way it is expected to go.

Annualising is what makes the figure portable. A 30-day contract and a 90-day
contract cover very different amounts of calendar, and putting both
expectations on one yearly scale is what allows a trader to say that one
expiration is priced higher than another at all.

That comparability is the same job [delta](/blog/option-delta-explained) does
for strike distance. Implied volatility is a size and not a sign, so a call
and a put on the same strike and expiration are priced off the same
expectation of movement, in the same units, whatever the stock is worth.

## What is vega, and how does it turn IV into dollars?

Vega does for IV what delta does for the stock price: it converts a change in
one input into an estimated change in the premium. A contract showing a vega
of 0.06 is expected to gain about $0.06 a share — $6 on 100 shares — for each
point IV rises, with everything else held still.

- **It touches extrinsic value only.** Intrinsic value is arithmetic against the strike, described in the [intrinsic and extrinsic value](/blog/intrinsic-vs-extrinsic-value-options) post, and no volatility figure changes it.
- **The contract's vega is positive.** Both calls and puts gain value when more movement is priced in, because more movement means more ways the contract finishes with something in it.
- **The position's sign depends on the side.** A bought option marks up as IV rises; a sold option marks down on the same move.

| Position | The contract's vega | What a rise in IV does, all else equal |
| --- | --- | --- |
| Long call | Positive | Marks up |
| Long put | Positive | Marks up |
| Short call | Positive | Marks down |
| Short put | Positive | Marks down |

Read the last column and it mirrors the theta table from the [previous
post](/blog/theta-decay-explained): the contract carries one sign, and which
side of the fill you are on decides whether that sign helps or hurts.

Vega is not the same size everywhere on a chain. At-the-money strikes hold the
most extrinsic value at a given expiration, so there is most there for a
volatility change to act on, and contracts with more days left hold more of it
again.

It also shrinks as expiration approaches. With a day to go there is little
extrinsic value left to revalue, so even a large move in implied volatility
changes that contract's price very little in dollar terms — though what
extrinsic value remains can still swing hard in percentage terms.

## Example: one hypothetical chain priced at two volatility levels

Take three calls on the hypothetical 50-strike series used earlier in this
series, all with 30 days left and the stock sitting at $50. Only the
volatility assumption changes — 40% in one column, 60% in the other. The
stock price, the strikes and the calendar are identical in both.

![The same three strikes on one hypothetical chain all cost more at 60 percent implied volatility than at 40 percent, with the stock price unchanged.](/assets/blog/iv-reprices-the-chain.svg)

| Strike | At 40% IV | At 60% IV | Difference |
| --- | --- | --- | --- |
| $45 (in the money) | $5.53 | $6.35 | +$0.82 |
| $50 (at the money) | $2.29 | $3.43 | +$1.14 |
| $55 (out of the money) | $0.68 | $1.64 | +$0.96 |

Check the middle row against vega. The at-the-money call's vega is about 0.06
a share, and 20 points of IV at roughly $0.057 a point comes to about $1.14 —
which is exactly the gap between the two columns, or $114 on one contract.
That estimate lands this cleanly only because vega itself barely moves across
this 20-point range at the money; away from the money vega shifts more as IV
changes, so a single point figure is a local estimate, the same limitation
[delta](/blog/option-delta-explained) carries.

The top row moved least in dollars, and the reason is in the split. With the
stock at $50, the 45-strike call holds $5.00 of intrinsic value and $0.53 of
extrinsic on top of it, and the whole $0.82 landed on that second figure —
$0.53 became $1.35, while the intrinsic $5.00 did not move at all.

The bottom row moved least in dollars after it, but most in proportion: $0.68
to $1.64 is more than double, on a contract that is entirely extrinsic value.
Same chain, same move in the input, three different-sized answers.

## Why does a whole chain reprice before earnings?

An earnings announcement is a scheduled release of information with an unknown
outcome, sitting on a date every trader can see. Contracts whose lives span
that date all cover the same event, so the movement priced into them rises
together rather than one strike at a time.

- **The event belongs to the calendar, not to a strike.** Any strike expiring after the date covers the announcement, which is why the repricing is chain-wide.
- **The stock does not have to move at all.** IV is an input alongside the stock price; raise it with the stock unchanged and every premium on the chain rises, as the table above shows.
- **The near expiration usually rises most in IV terms.** One announcement is a larger share of the movement expected over a week than of the movement expected over a quarter, so the front expirations lift further in percentage terms.
- **The longer expiration usually carries more vega.** More days left means more extrinsic value at stake, so a smaller IV move there can still be worth more in dollars.
- **The same inputs unwind afterwards.** Once the result is public the uncertainty it carried is gone, IV falls back, and the contracts reprice down on that alone — a move traders call IV crush, or a volatility
crush.

The last point is the one that surprises people, because it can happen on a
day the stock barely moves. Both legs of the repricing are mechanical: an
input went up on the calendar, and it came down on the news.

An IV move also arrives everywhere at once on a book of more than one
position. Contracts on the same underlying share an expectation, so someone
holding several of them sees one input revalue every line in the same moment
rather than line by line — a problem of scale taken up in the [after the
fill](/blog/managing) posts rather than this one.

## Does high implied volatility mean the stock will move?

No. It means a large move is priced into the contracts today, which is a
statement about prices rather than about the stock.

- **It is a price, not a prediction.** IV describes what buyers and sellers are currently transacting at, and their expectation can turn out too high or too low.
- **It is not a direction.** The same figure prices upside and downside movement, which is why calls and puts on one strike share it.
- **It is not stable.** The number changes as the quotes change, so the IV shown now is a reading of this moment, not a property of the contract.

What actually happens afterwards is realised movement, measured later from
prices that have already printed. Whether that lands above or below what was
implied is unknown at the time the premium is agreed, which is the whole
reason the premium is negotiated at all.

## Frequently asked questions

- **Does implied volatility scale by 100 like the premium?** No. It is an annualised percentage that already applies to the whole quote; vega, delta and the premium itself are the figures quoted per share and multiplied by 100 for one contract.
- **Where does the IV on my chain come from?** It is back-solved from the option's price with a model, usually from the midpoint of the [bid and the ask](/blog/options-bid-ask-spread) — a price nobody actually offered.
- **Why did my option lose value when the stock moved my way?** One possibility is that IV fell by enough to outweigh what [delta](/blog/option-delta-explained) added. Both inputs pull on the same premium at once.
- **Does every strike on one expiration show the same IV?** No. Strikes usually show different figures, a pattern called the volatility skew or smile, even though they all cover the same period.

## The bottom line

Implied volatility is the movement an option's price implies, and vega is what
one point of it is worth in dollars on that contract. Because the whole chain
is priced off the same expectation, a change in it lifts or drops every
premium covering the same period, with the stock price contributing nothing.

It is the third of the sensitivities the [foundations
series](/blog/foundations) takes one at a time, after [delta](/blog/option-delta-explained)
and [theta](/blog/theta-decay-explained). How fast delta itself changes comes
next.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
