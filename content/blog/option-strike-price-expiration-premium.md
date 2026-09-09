---
title: "Option strike price, expiration and premium"
slug: option-strike-price-expiration-premium
excerpt: Three numbers describe every listed option — the strike shares would change hands at, the last day the contract exists, and the price of the contract itself.
meta_description: The strike price is where shares change hands, the expiration is the contract's last day, and the premium is its price. What each number fixes, with an example.
author: DeltaMint
category: foundations
series_order: 3
tags: strike price, expiration, premium, option chain, foundations
---

The **strike price** of an option is the price at which the shares would change
hands. The **expiration date** is the last day the contract exists, and the
**premium** is what the contract itself costs to buy or pays to sell. Those
three numbers describe every listed option.

Two of those three are fixed by the exchange before anyone trades the contract.
Only the premium is set by the people trading it.

## Key takeaways

- The strike price is the price shares change hands at if the option is used. It never moves, except for a stock split or similar corporate action.
- The expiration date is the last day the contract exists. After it, the position is gone one way or another.
- The premium is quoted per share, and one standard contract covers 100 shares — so a $2.30 quote is $230.
- The strike is a price for the stock; the premium is a price for the contract. They are not comparable numbers.

## What is the strike price?

The strike is the price written into the contract. If a call is used, its owner
buys 100 shares at the strike; if a put is used, its owner sells 100 shares at
the strike. What the stock is doing at the time makes no difference to that
number.

Strikes are listed by the exchange in fixed steps — commonly $1, $2.50 or $5
apart, tighter near the current stock price and wider further away. You pick
one off the list. You do not name your own.

A strike only changes for a corporate action such as a stock split, and then it
is adjusted along with the number of shares the contract delivers. Nothing the
stock does on its own can move it.

## What is the expiration date?

Expiration is the last day the contract exists. Standard US equity options
expire on the third Friday of the month, and most active names also list weekly
expirations on other Fridays.

Trading in the contract stops at the market close on that day. The owner's
decision about whether to use the option runs later into the evening, and
brokers set their own earlier cutoffs for receiving instructions.

After expiration the position is gone. It was closed, it expired worthless, or
it was exercised and turned into 100 shares per contract — those are the only
three exits, and [what an options contract
is](/blog/what-is-an-options-contract) walks through each.

## What is the premium?

The premium is the price of the contract, and it is the only one of the three
numbers the market sets. It is quoted per share, and every standard equity
contract covers 100 shares, so the quote is multiplied by 100 to get dollars.

There are two premiums on screen at any moment, not one. The **bid** is the
highest price someone is currently willing to pay for the contract; the **ask**
is the lowest price someone is willing to sell it at.

Buying at the ask and selling at the bid trade immediately. A limit order
placed between the two may fill and may not — that is the trade-off. The
midpoint is a reference, not a price anyone has offered.

## Example: one row of an option chain

Below is a single hypothetical row. XYZ trades at $50, and this is a 50-strike
call expiring on 18 December, bid 2.10 and ask 2.30.

![One option chain row with three numbers marked: the expiration date, the strike price, and the bid and ask that make up the premium.](/assets/blog/option-row-three-numbers.svg)

Reading it in order: **1** is the expiration, so the contract exists until 18
December and not a day longer. **2** is the strike, so shares would change hands
at $50 apiece — $5,000 for the 100 shares one contract covers. **3** is the
premium.

The arithmetic on the premium is worth doing slowly. Buying one contract pays
the ask: $2.30 × 100 = $230. Selling one receives the bid: $2.10 × 100 = $210.
The $0.20 gap is $20 per contract, and it is a real cost of getting in and out.

Note the two scales sitting in one row. The contract costs $230; the shares
behind it are worth $5,000. Both numbers are true, and reading only the first
one understates what the position is attached to.

Keep the expiration and the underlying fixed, change only the strike, and the
premium changes with it:

| Contract | Ask | One contract costs | Shares at the strike |
| --- | --- | --- | --- |
| 45-strike call | 6.40 | $640 | $4,500 |
| 50-strike call | 2.30 | $230 | $5,000 |
| 55-strike call | 0.65 | $65 | $5,500 |

The direction makes sense once said out loud: with XYZ at $50, the right to buy
at $45 is worth more than the right to buy at $55. What the table does not
explain is the size of the gaps — why $640 and $65, rather than some other pair
of numbers. That is the subject of the next post.

## Frequently asked questions

- **Can the strike price change after I trade?** Only through a corporate action such as a split or a merger, which adjusts the strike and the deliverable together. Ordinary price moves never touch it.
- **Is the premium the same as the strike?** No. The premium is what the contract costs; the strike is what the shares would cost if the contract is used. In the example above they are $230 and $5,000.
- **What happens to an option after its expiration date?** Nothing — it no longer exists. It has already been closed, expired worthless, or been exercised into 100 shares per contract.
- **Why does the same strike cost more on a later expiration?** More days remain in which the stock can move, and the premium prices that. The split between the two parts of a premium is covered next.

## The bottom line

Strike, expiration and premium are three different kinds of number. Two are
fixed by the exchange when the contract is listed; one moves every few seconds
and is the only thing being negotiated.

Next in the [foundations series](/blog/foundations): the premium splits into two
parts, and [intrinsic and extrinsic
value](/blog/intrinsic-vs-extrinsic-value-options) is where the $640 and the $65
come from. If the two sides of a contract are still hazy, [calls and puts from
both sides](/blog/call-vs-put-option-explained) comes before this one.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
