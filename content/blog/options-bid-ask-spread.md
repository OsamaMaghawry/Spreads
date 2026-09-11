---
title: "Options bid-ask spread: what it costs per contract"
slug: options-bid-ask-spread
excerpt: The bid-ask spread is the gap between what a buyer will pay and what a seller will accept right now, and crossing it is a real cost paid on the way in and again on the way out.
meta_description: An option quote is two prices. What crossing the gap costs per contract, why it is paid on entry and again on exit, and why a midpoint credit is not one.
author: DeltaMint
category: foundations
series_order: 5
tags: bid ask spread, liquidity, limit order, execution, foundations
---

**The bid-ask spread** is the gap between the best price a buyer is currently
willing to pay for an option — the **bid** — and the best price a seller is
currently willing to accept — the **ask**. Both are live prices for that one
contract, right now.

The quote is two numbers because a trade needs two sides. Anything that has to
fill immediately deals at the far number, and the distance between them is what
that immediacy costs.

## Key takeaways

- The bid is what you can sell at right now, the ask what you can buy at. The midpoint between them is neither.
- An order that fills immediately transacts at the far side: buyers pay near the ask, sellers receive near the bid.
- The spread is not a fee a broker collects. It is value passing from whoever trades without waiting to whoever was standing there with a quote.
- It is paid on entry and again on exit, so a round trip crosses it twice.
- Option quotes are usually wider than the stock's, because one stock's order flow splits across hundreds of contracts.

## Why are options bid-ask spreads wider than the stock's?

A stock is one instrument, traded in one market. Its options are hundreds of
separate contracts, each its own market, and a contract is a unique
combination of expiration, strike and type. Three things follow from that
split, and a fourth compounds it:

- **Liquidity is divided many ways.** One underlying can carry hundreds of
  listed contracts, so the same daily interest leaves each book thinner than
  the stock's.
- **Most quotes come from market makers.** In a thinly traded contract there is
  often no natural buyer facing a natural seller, so a firm posts both sides.
- **That firm is pricing its own risk.** Taking the other side leaves it
  holding a position it has to hedge, and the quote has to cover that.
- **A small move in the underlying is a large move for the contract.**
  Relative to its own price, an option can reprice far more than the stock
  moves in dollars, so a quote posted a moment ago has more room to be wrong.

## What does the bid-ask spread actually cost?

Nothing on a confirmation is labelled "spread" — the cost sits inside the fill
price, unnoticed next to commissions itemised to the cent.

A market order, or a limit order priced through the quote, is asking to trade
now rather than at a price. It gets what the other side is showing, for the
size showing: the buyer pays the ask, the seller receives the bid.

![An order that has to fill immediately deals at the far side of the quote, twenty cents from the other side.](/assets/blog/bid-ask-executable-price.svg)

Treat the midpoint as a rough estimate of the contract's value and each crossing
sits about half the spread away from it — above the mid when buying, below it
when selling.

## Example: one round trip with the quote unmoved

Take the hypothetical chain row from the [strike, expiry and premium
post](/blog/option-strike-price-expiration-premium): an XYZ December 50 call
quoted 2.10 bid, 2.30 ask. The midpoint is 2.20, and the spread is 0.20 a
share — $20 on the 100 shares one contract covers.

Buy that contract at the ask and immediately sell it at the bid, with the quote
unchanged:

| Step | Price per share | Cash per contract |
| --- | --- | --- |
| Buy at the ask | 2.30 | −$230 |
| Sell at the bid | 2.10 | +$210 |
| Net, quote unmoved | −0.20 | −$20 |

The position was open for seconds and the market did not move. The $20 is the
spread.

The seller's side is the same arithmetic pointed the other way. Selling that
contract to open at the bid brings in 2.10, not the 2.20 on the screen, and
buying it back later at the ask costs the far number again. A credit measured
at the midpoint is a credit nobody received.

That distinction carries into anything built from a quoted premium. Split a
price into [intrinsic and extrinsic
value](/blog/intrinsic-vs-extrinsic-value-options) and which price you split —
bid, mid or ask — decides whether the answer describes a fill or an estimate.

## What makes one option's quote wider than another's?

Width is not a fixed property of a stock. It varies contract by contract down
the same chain, on the same afternoon, in a fairly consistent pattern.

| What differs | Usually narrower | Usually wider |
| --- | --- | --- |
| Volume and open interest | Contracts traded heavily today | Contracts with few or no trades |
| Distance from the stock price | Strikes near the money | Far out-of-the-money strikes, relative to their premium |
| Time to expiration | Near-dated, actively quoted expirations | Long-dated expirations |
| The underlying | Large-cap stocks and major index funds | Small or thinly traded names |

One more effect surprises people. A multi-leg order — a spread submitted as one
ticket — is quoted as a net price whose width reflects both legs, so two
contracts each quoted 0.20 wide do not combine into a 0.20-wide market.

## What can a trader do about the spread?

The mechanic available is the limit order: an instruction to trade at a stated
price or better rather than at whatever is showing. Priced inside the quote — at
the midpoint, or a cent or two toward it — it asks the other side to come
partway.

What you give up is certainty about the fill. A limit inside the spread trades
only if someone comes to it — which may take seconds, the session, or never,
and on a contract that trades only a handful of times a day, never is
ordinary.

- **It is usually paid twice.** Entry and exit are separate crossings —
  unless the position expires worthless or is assigned, when there is no
  closing trade.
- **It is independent of the trade.** The spread is a cost of transacting, not
  a judgement about the position.
- **It scales with contracts.** A 0.20 spread is $20 on one contract and $200
  on ten.
- **A wide quote hides the mark.** When bid and ask sit far apart, the midpoint
  your account displays is a convention, not a price anyone offered.

## Frequently asked questions

- **Is the bid-ask spread the same as a commission?** No. A commission is a fee your broker charges and itemises; the spread is a difference in price, shown nowhere on the confirmation.
- **Does the midpoint mean anything?** Many platforms use it as a reference to mark an open position. It is not a price you can transact at unless someone meets it.
- **Why did my fill come in worse than the quote I saw?** Quotes move continuously, and an order reaching the exchange a moment later deals with the book as it is then.
- **Do you buy at the bid or the ask?** A buyer who needs to fill now pays the ask; a seller who needs to fill now receives the bid. The midpoint is where neither side has committed to trade.

## The bottom line

The bid-ask spread is the gap between the two live prices on a contract, and
crossing it is the cost of trading without waiting. It is not charged, not
itemised, and not optional for anyone transacting immediately.

Reading a quote as one number — the midpoint — makes anything built on it
slightly optimistic at both ends. The rest of the [foundations
series](/blog/foundations) turns next from what a contract costs to how its
price behaves.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
