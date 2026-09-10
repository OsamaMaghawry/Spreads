---
title: "Options bid-ask spread: what crossing it costs"
slug: options-bid-ask-spread
excerpt: The bid is what a seller receives and the ask is what a buyer pays — so the gap between them is a real cost on the way in and again on the way out.
meta_description: A buyer pays the ask, a seller receives the bid, and the gap between them is a real cost. What one round trip costs per contract, and why spreads widen.
author: DeltaMint
category: foundations
series_order: 5
tags: bid ask spread, liquidity, premium, limit order, foundations
---

The **bid-ask spread** on an option is the gap between the highest price anyone
is currently bidding for the contract and the lowest price anyone is offering to
sell it at. Nobody charges it and it appears on no statement, but it is money
all the same.

It costs something because those two quotes are the prices that actually trade.
A buyer pays the ask, a seller receives the bid, and every number between them
is a reference rather than an offer.

## Key takeaways

- The bid is what a seller receives right now; the ask is what a buyer pays right now.
- The midpoint is the average of the two. Nobody has offered it, and an order resting there may never fill.
- Crossing the spread on the way in and again on the way out costs the whole spread, multiplied by the 100 shares a contract covers.
- Spreads widen on thinly traded contracts, distant strikes and distant expirations — and a multi-leg order meets one on every leg.
- A limit order caps the price you accept. It does not promise a fill.

## What is the bid-ask spread on an option?

The **bid** is the highest price someone is currently willing to pay for the
contract. The **ask** is the lowest price someone is currently willing to sell
it at. The spread is the difference between them, and it exists because those
two people have not agreed yet.

On a widely held stock that gap is often a cent; on an option it is frequently
much wider, because every strike and expiration is a separate contract with
its own small pool of interested traders.

The spread is quoted per share, exactly like the premium, so a 20-cent spread
is $20 on one standard contract of 100 shares. That is the unit worth thinking
in, because it is the unit the cash moves in.

## Do you get the bid or the ask?

The one on the side you are trading toward, if you want the fill now: an order
to buy immediately fills at the ask, an order to sell immediately fills at the
bid. [Strike, expiration and
premium](/blog/option-strike-price-expiration-premium) introduced both
numbers — selling to open takes the bid, and buying to close later pays the
ask, so a credit taken at the quote is the bid figure, not the friendlier
number halfway up.

The midpoint is the average of the two and a reasonable estimate of what the
contract is worth. It is not a price anyone has offered, and for a seller it
matters beyond the moment of the fill: record a credit at the midpoint instead
of the bid, and every figure worked out from it carries the difference along.

![The bid and the ask are the two prices that trade, and the midpoint sitting between them is nobody's offer.](/assets/blog/options-bid-ask-spread.svg)

## Example: what one round trip costs

Take the hypothetical XYZ 50-strike call from the earlier post, quoted bid 2.10
and ask 2.30. All figures on this page are hypothetical and are there to show
the arithmetic.

Buy one contract at the ask and $230 leaves the account: 2.30 × 100. Sell the
same contract a moment later at the bid, with the quote unchanged, and $210
comes back: 2.10 × 100. Twenty dollars is gone and the stock has not moved a
cent.

Measured against the midpoint of 2.20 the same $20 splits in half. Paying 2.30
is ten dollars above mid; receiving 2.10 is ten dollars below it. Both framings
give one answer — a round trip in and out costs the spread once, per contract.

The seller's version is the mirror image. Sell to open at 2.10 for $210,
buy to close at 2.30 for $230, and the position ends flat on an unchanged quote
with the account $20 behind.

A real quote does not hold still, and the gap can widen at the open, in a fast
market, or on a contract nobody wants — so the spread paid on the way out is
whatever is quoted then, not whatever was quoted at entry.

## Why are some bid-ask spreads wider than others?

Width tracks how actively a contract is quoted, not whether it is priced
fairly. Whoever sits on the other side of the trade has to hedge and carry the
position, and the harder that is, the further apart the two quotes sit.

- **Volume and open interest.** A contract few people trade attracts few competing quotes, and the gap has nothing pressing it closed.
- **Distance from the money.** Strikes far from the current stock price — deep in the money or far out of it — trade rarely, and cheap out-of-the-money contracts often carry spreads that are large next to the premium itself.
- **Time to expiration.** A contract expiring in two years is riskier to carry than one expiring on Friday, and it is usually quoted more loosely.
- **The underlying.** Options on heavily traded large-cap names and major index funds are quoted tightly; options on small, quiet stocks are not.

The same 20 cents also weighs differently depending on what it sits next to. It
is a small piece of a 6.40 premium and a large piece of a 0.65 one, which is
why the cheapest contracts on a chain are rarely the cheapest to trade.

| | Liquid contract | Thin contract |
| --- | --- | --- |
| Bid | 2.10 | 1.80 |
| Ask | 2.30 | 2.60 |
| Spread | 0.20 | 0.80 |
| Round trip, one contract | $20 | $80 |

Both rows describe the same hypothetical strike on two different underlyings.
The premium is roughly comparable; the cost of getting in and back out is four
times larger on the right.

## Does a limit order avoid the spread?

A limit order names the worst price you will accept, and fills at that price
or better, in full, in part, or not at all — it does not promise that a fill
happens, and a partial fill can leave the rest to chase a quote that has moved.

So the cost is not avoidable, only negotiable, and the negotiation has its own
cost: a limit priced at the far side of the quote fills about as readily as
taking what is available, up to the size showing at that price, and does not
chase the quote if it moves first. One resting between the bid and the ask can
instead wait while the quote drifts away from it.

## Frequently asked questions

- **Is the bid-ask spread a fee?** No. It is the difference between the price a contract is bought at and the price it is sold at, and it compensates whoever takes the other side.
- **Why is the midpoint shown everywhere if nobody has offered it?** Because it is the simplest single-number estimate of what a contract is worth, so quote screens and open-position marks usually use it. A mark is an estimate; a fill is a fact.
- **Does a wide spread mean the option is overpriced?** Not on its own. Width measures how thinly a contract is quoted rather than whether the premium is fair — but it does mean entering and exiting costs more.
- **Do the spreads on a multi-leg order add up?** Broadly, but legging in separately means meeting each spread by itself. Quoted as one combination order the same position is often tighter than the sum of the legs, because the price is set on the net risk rather than on two contracts individually.

## The bottom line

An option has two prices at all times: buyers pay the ask, sellers receive the
bid, and the midpoint they quote at each other is nobody's price.

That gap is the first cost of any option position and the last one on the way
out, and it is charged in dollars per contract rather than as a percentage of
anything. The rest of the [foundations series](/blog/foundations) turns to what
moves the premium itself, starting with delta. If the split inside the premium
is still unclear, [intrinsic and extrinsic
value](/blog/intrinsic-vs-extrinsic-value-options) covers it.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
