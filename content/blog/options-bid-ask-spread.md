---
title: "Options bid-ask spread: what crossing it costs"
slug: options-bid-ask-spread
excerpt: The bid is what a seller receives and the ask is what a buyer pays — so the gap between them is a real cost on the way in and again on the way out.
meta_description: The bid-ask spread on an option is the gap between the two prices that actually trade. What it costs per contract, why it widens, and what a limit order does.
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

On a widely held stock that gap is often a cent. On an option it is frequently
much wider, because every strike and every expiration is a separate contract
with its own small pool of interested traders. One stock can list several
hundred contracts, each quoted on its own.

The spread is quoted per share, exactly like the premium, so a 20-cent spread
is $20 on one standard contract of 100 shares. That is the unit worth thinking
in, because it is the unit the cash moves in.

## Which of the two prices do you actually get?

The one on the side you are trading toward. An order to buy that takes what is
available fills at the ask; an order to sell that takes what is available fills
at the bid. [Strike, expiration and
premium](/blog/option-strike-price-expiration-premium) introduced both numbers;
what matters here is that only one of them applies to you at any moment.

That has a specific consequence for anyone selling a contract rather than
buying one. Selling to open receives the bid, and buying to close later pays
the ask — so the credit that lands in the account is the bid figure, not the
friendlier number halfway up.

The midpoint is the average of the two and a reasonable estimate of what the
contract is worth. It is not a price anyone has offered. A trade recorded at
the midpoint shows a credit larger than the one received and a debit smaller
than the one paid.

That matters more for a seller than it first looks, because the credit received
is the number the rest of the position gets measured against. The strikes are
fixed the moment the contract is chosen; the credit is the part the executable
price moves. Record it at the midpoint and every figure worked out from it
carries the difference along.

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

None of that is billed. It shows up only as the difference between two fill
prices, which is why it is easy to overlook when a position is reviewed weeks
later.

The example also holds the quote still, and a real one does not. Both sides
move, and the gap between them can be wider at the open, in a fast market, or
on the day a contract nobody wants is finally being closed. The spread paid on
the way out is whatever is quoted then, not whatever was quoted at entry.

## Why are some option spreads wider than others?

Width tracks how actively a contract is quoted, not whether it is priced
fairly. Whoever sits on the other side of the trade has to hedge and carry the
position, and the harder that is, the further apart the two quotes sit.

- **Volume and open interest.** A contract few people trade attracts few competing quotes, and the gap has nothing pressing it closed.
- **Distance from the money.** Strikes far from the current stock price trade rarely, and cheap contracts often carry spreads that are large next to the premium itself.
- **Time to expiration.** A contract expiring in two years is harder to hedge than one expiring on Friday, and it is usually quoted more loosely.
- **The underlying.** Options on heavily traded large-cap names and major index funds are quoted tightly; options on small, quiet stocks are not.
- **The number of legs.** A two-leg position meets a bid and an ask on each contract, and a combination order is quoted on the net of both.

The same 20 cents also weighs differently depending on what it sits next to. It
is a small piece of a 6.40 premium and a large piece of a 0.65 one, which is
why the cheapest contracts on a chain are rarely the cheapest to trade.

| | Actively traded contract | Thinly traded contract |
| --- | --- | --- |
| Bid | 2.10 | 1.80 |
| Ask | 2.30 | 2.60 |
| Spread | 0.20 | 0.80 |
| Round trip, one contract | $20 | $80 |

Both rows describe the same hypothetical strike on two different underlyings.
The premium is roughly comparable; the cost of getting in and back out is four
times larger on the right.

## What does a limit order change?

A limit order names the worst price you will accept and fills at that price or
better, or not at all. It removes the possibility of a fill far away from where
the quote was sitting. It does not promise that a fill happens.

An order priced between the bid and the ask is asking somebody to do better
than the best price currently available to them. Sometimes that happens within
seconds; sometimes the order rests while the quote drifts away from it.

A limit priced at the far side of the quote — buying at the ask, selling at the
bid — behaves much like taking what is available. It usually fills straight
away, and it pays the full spread to do so.

So the cost is not avoidable, only negotiable, and the negotiation has its own
cost. Waiting for a better price means the contract can move while the order
sits unfilled, and nothing here says which of those trade-offs anyone should
take.

## Frequently asked questions

- **Is the bid-ask spread a fee?** No. Nobody bills it and it appears on no statement. It is the difference between the price a contract is bought at and the price it is sold at, and it is what compensates whoever takes the other side.
- **Why is the midpoint shown everywhere if nobody has offered it?** Because it is the simplest single-number estimate of what a contract is worth, so quote screens and open-position marks use it. A mark is an estimate; a fill is a fact.
- **Does a wide spread mean the option is overpriced?** Not on its own. Width measures how thinly a contract is quoted rather than whether the premium is fair — but it does mean entering and exiting costs more.
- **Do the spreads on a multi-leg order add up?** Broadly. Each leg carries its own bid and ask, and a combination is quoted on the net of them. Filling the legs separately means meeting each spread by itself.

## The bottom line

An option has two prices at all times, and which one applies depends entirely
on which way you are trading. Buyers pay the ask, sellers receive the bid, and
the midpoint that both sides quote at each other is nobody's price.

That gap is the first cost of any option position and the last one on the way
out, and it is charged in dollars per contract rather than as a percentage of
anything. The rest of the [foundations series](/blog/foundations) turns to what
moves the premium itself, starting with delta. If the split inside the premium
is still unclear, [intrinsic and extrinsic
value](/blog/intrinsic-vs-extrinsic-value-options) covers it.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
