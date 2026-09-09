---
title: "Intrinsic vs extrinsic value: splitting an option premium"
slug: intrinsic-vs-extrinsic-value-options
excerpt: Every option premium splits into intrinsic value, which is pure arithmetic against the strike, and extrinsic value, which is everything the buyer pays on top.
meta_description: Intrinsic value is what an option would be worth if it expired now. Extrinsic value is the rest of the premium. How to split any quote in two, with numbers.
author: DeltaMint
category: foundations
series_order: 4
tags: intrinsic value, extrinsic value, time value, premium, foundations
---

**Intrinsic value** is the part of an option's premium that comes from the
strike price alone — what the contract would be worth if it expired right now.
**Extrinsic value**, also called time value, is the whole of the rest.

The two always add up to the premium, so any quote can be split in two with
subtraction. One half is arithmetic anybody can check. The other is what the
market is charging for the time still left.

## Key takeaways

- Intrinsic value is the difference between the stock price and the strike, and it is never less than zero.
- Extrinsic value is the premium minus the intrinsic value — what is paid on top of what the contract is worth today.
- At expiration, extrinsic value is zero. The option is worth exactly its intrinsic value, and usually nothing.
- The buyer pays the extrinsic value and the seller receives it. That is the part of the premium that can be lost while the stock does nothing at all.

## What is intrinsic value?

For a call, intrinsic value is the stock price minus the strike. For a put, it
is the strike minus the stock price. If that subtraction comes out negative,
the intrinsic value is zero — never a negative number.

The reason is that an option is a right and nobody is forced to use one. A call
struck at $50 with the stock at $48 is not worth minus $2; it is simply worth
nothing on those grounds, because buying at $50 what trades at $48 is something
its owner can decline to do.

Two terms follow from the same subtraction. An option with intrinsic value is
**in the money**. One with none is **out of the money**, and one struck at
roughly the current stock price is **at the money**.

## What is extrinsic value?

Extrinsic value is the premium minus the intrinsic value. It is what the buyer
pays for the possibility that the contract is worth more later than it is
worth now.

It is often called time value, which is accurate but incomplete. Days remaining
are one input; how much the market expects the stock to move is another, and
two options with identical strikes and expirations on different stocks carry
different extrinsic value for that reason.

What matters mechanically is simpler than either explanation. Extrinsic value
is the part of the price that is not backed by anything today, and it is the
part that is gone by expiration whatever the stock does.

## Example: one call at three stock prices

Take a hypothetical 50-strike call with 30 days left. The stock price changes;
the strike and the expiration do not. Each premium below splits into the two
parts by subtraction.

![The same call's premium at three stock prices, with the intrinsic part growing and the extrinsic part shrinking as the stock rises.](/assets/blog/intrinsic-extrinsic-split.svg)

| Stock price | Premium | Intrinsic | Extrinsic |
| --- | --- | --- | --- |
| $48 | 1.20 | 0.00 | 1.20 |
| $52 | 3.40 | 2.00 | 1.40 |
| $56 | 6.70 | 6.00 | 0.70 |

Check the middle row. The stock is $52 and the strike is $50, so intrinsic
value is $2.00 a share, or $200 for the 100 shares one contract covers. The
premium is $3.40, so the remaining $1.40 — $140 — is extrinsic.

The top row has no intrinsic value at all. With the stock at $48 the right to
buy at $50 is worth nothing today, so the entire $1.20 is a payment for the
month that remains.

The bottom row is the one people find surprising. Six dollars in the money, the
contract still carries $0.70 of extrinsic value — but far less than the
at-the-money row above it, because most of what that premium buys is already
banked as intrinsic.

## What happens to extrinsic value at expiration?

At expiration there is no time left, so there is nothing left to pay for.
Extrinsic value is zero by definition, and the option is worth its intrinsic
value exactly.

For the middle row above, that means the contract settles at $2.00 a share —
$200 — if the stock is still at $52 on the last day. The $140 of extrinsic
value that was in the price 30 days earlier is not there to be recovered.

Between now and then it does not drain evenly. Extrinsic value moves with the
market's expectations as well as with the calendar, so it can rise on a quiet
day and fall on a busy one. Its behaviour over time is a subject of its own,
and this post claims only the endpoint: at expiration, zero.

## Frequently asked questions

- **Can intrinsic value be negative?** No. The subtraction can come out negative, but the value floors at zero, because nobody has to use a right that costs them money.
- **Is extrinsic value the same as time value?** They name the same number. "Time value" is the older term and understates it, since the figure prices expected movement as well as days remaining.
- **Why does an in-the-money option cost more than its intrinsic value?** Because the contract can still improve before expiration, and the buyer is paying for that. The deeper in the money it goes, the less of the premium that part accounts for.
- **Who ends up with the extrinsic value?** The buyer pays it at the fill and the seller receives it. Whether the seller keeps it depends on what the stock does, which the split says nothing about.

## The bottom line

Any option premium splits into two parts with one subtraction. Intrinsic value
is what the contract is worth against its strike today; extrinsic value is
everything paid on top, and it is worth nothing on the last day.

That split is why the [45-strike and 55-strike calls priced so
differently](/blog/option-strike-price-expiration-premium) in the previous post,
and it is why an option's price can fall while the stock sits perfectly still.
The rest of the [foundations series](/blog/foundations) takes the
inputs one at a time, starting with what the gap between the bid and the ask
costs on the way in and out.

All figures on this page are hypothetical and are there to show the arithmetic.
This post is educational and is not investment advice.
