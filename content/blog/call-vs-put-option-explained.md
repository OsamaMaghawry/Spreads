---
title: "Call vs put options: how each one works"
slug: call-vs-put-option-explained
excerpt: A call is the right to buy 100 shares at a set price; a put is the right to sell 100 shares at a set price — and each one has a seller carrying the matching obligation.
meta_description: A call option is the right to buy 100 shares at a set price. A put is the right to sell. What the buyer pays, what the seller owes, with worked numbers.
author: DeltaMint
category: foundations
series_order: 2
tags: call option, put option, foundations, assignment, premium
---

**A call option** is a contract that gives its owner the right to buy 100
shares of a stock at a fixed price, on or before a fixed date. **A put option**
is the same contract pointed the other way: the right to sell 100 shares at a
fixed price, on or before a fixed date.

Every listed equity option is one or the other. Every one of them also has two
sides — a buyer who pays for the right, and a seller who is paid to carry the
matching obligation.

## Key takeaways

- A call is the right to buy 100 shares at the strike price. A put is the right to sell 100 shares at the strike price.
- The buyer pays the premium and decides whether to use the right. The seller receives the premium and does not get a say.
- **At expiration**, a call is worth something only above its strike, and a put only below its strike. Before expiration both can be worth something anywhere.
- Buying an option risks the premium paid and nothing more. Selling one creates an obligation the account has to cover.

## How does a call option work?

A call is written on an **underlying** — the stock the contract references. It
lets its owner buy that stock at the **strike price**, up to and including the
**expiration date**, which is the last day the contract exists.

Take a hypothetical stock, XYZ, trading at $50. A call with a 55 strike
expiring in one month is quoted at $1.00. Option prices are quoted per share
and one standard contract covers 100 shares, so it costs $100.

The buyer now owns the right to buy 100 shares at $55 until that date. Nothing
forces them to use it. If XYZ never trades above $55, the right is worth
nothing at expiration and the $100 is spent.

## How does a put option work?

A put lets its owner sell 100 shares at the strike price, up to and including
expiration. It is the mirror of a call — both are
rights, and both are bought from somebody who sold them.

On the same hypothetical stock at $50, a put with a 45 strike expiring in one
month is also quoted at $1.00, so it also costs $100. Its owner holds the right
to sell 100 shares at $45.

That right is worth something only below $45. With XYZ at $42, selling at $45
what trades at $42 is worth $3 a share, or $300 for the contract.

![At expiration, a call is worth nothing below its strike and rises above it; a put is worth nothing above its strike and rises below it.](/assets/blog/call-put-value-at-expiration.svg)

## What is the difference between a call and a put?

The two contracts differ in one thing: the direction the right points. That
single difference sets everything else in the table below.

| | Call | Put |
| --- | --- | --- |
| The owner may | Buy 100 shares at the strike | Sell 100 shares at the strike |
| Worth something when | The stock is above the strike | The stock is below the strike |
| Worth nothing when | The stock finishes at or below the strike | The stock finishes at or above the strike |
| If it is used, the seller must | Deliver 100 shares at the strike | Buy 100 shares at the strike |

## Example: what all four positions settle for

Hold both hypothetical contracts to expiration and the arithmetic is fixed.
With XYZ at $58, the 55 call is worth $3 a share — the right to buy at $55 what
trades at $58 — so $300 per contract, and the 45 put is worth nothing.

With XYZ at $42, the put is worth $300 and the call is worth nothing. With XYZ
at $50, both are worth nothing: neither right beats the open market.

Each buyer paid $100 and each seller received $100. Netting those against the
settlement values gives the four positions, before fees.

| Position | XYZ at $42 | XYZ at $50 | XYZ at $58 |
| --- | --- | --- | --- |
| Bought the 55 call, paid $100 | −$100 | −$100 | +$200 |
| Sold the 55 call, received $100 | +$100 | +$100 | −$200 |
| Bought the 45 put, paid $100 | +$200 | −$100 | −$100 |
| Sold the 45 put, received $100 | −$200 | +$100 | +$100 |

Every column nets to zero. One side's $200 is the other side's $200 — an
option is a transfer between the two sides of a contract, not an instrument
that produces anything on its own.

The table also hides the worst case for one row. A stock has no ceiling, so the
call seller's obligation has no ceiling either; at $80 that row settles at
−$2,400. The buyers' figures, by contrast, stop at the $100 paid.

## What does the option seller take on?

Selling an option is not buying one in reverse. Cash arrives at the fill
instead of leaving, and the credit received is not the limit of what the
position can cost. Because a sold option can be worth more later than it was
when sold, the account holds collateral behind it for as long as the position
stays open.

The second asymmetry is about who decides. The buyer chooses whether to
exercise. The seller learns about it afterwards, through **assignment** — the
notice that the obligation has been used and 100 shares have changed hands at
the strike. Assignment is allocated at random among everyone short that
contract. It is not sent by the buyer who exercised, and the two sides are
never paired to each other.

## Frequently asked questions

- **Can an option buyer lose more than the premium paid?** No. A bought option is paid for in full at the fill, and that is the entire amount the position can cost.
- **Is selling a call the same as buying a put?** No. Both positions gain when the stock falls, but one is an obligation with collateral held against it and the other is a right that was paid for upfront.
- **What happens if I do nothing on expiration day?** An option that finishes in the money by a cent or more is exercised automatically unless the owner instructs otherwise. For a call that means buying 100 shares at the strike — $5,500 on the 55 call — which the account has to fund. Selling the contract before the close realises the same value as cash instead. One that finishes out of the money expires and the row disappears.
- **Do I have to own the shares to sell a call?** No. Without them the obligation is uncovered, and delivering 100 shares at the strike means buying them first at whatever the market is asking.

## The bottom line

A call is the right to buy at the strike; a put is the right to sell at it.
There are four positions rather than two, because each contract has a buyer who
paid for a choice and a seller who was paid to give one up.

The next post in the [foundations series](/blog/foundations) takes the three
numbers that describe any of these contracts — [strike price, expiration and
premium](/blog/option-strike-price-expiration-premium) — one at a time. If the
100-share multiplier here was new, [what an options contract
is](/blog/what-is-an-options-contract) covers where it comes from.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
