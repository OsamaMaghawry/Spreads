---
title: "Put credit spread explained: width, credit and the fill"
slug: put-credit-spread-explained
excerpt: A put credit spread sells one put and buys a cheaper one below it, so the account is paid at the fill and the loss is capped at the strikes' gap less that credit.
meta_description: "Put credit spread explained on one hypothetical chain: the credit live quotes pay versus the mark, the max loss, the break-even, and what width changes."
author: DeltaMint
category: income
series_order: 18
tags: put credit spread, credit spread, max loss, width, options
---

A **put credit spread** is two puts on the same stock and expiration: one
sold at a higher strike, one bought at a lower strike. The account is paid a
net credit at the fill, and the most it can lose is the gap between the two
strikes, times 100, less that credit.

This post continues the [income series](/blog/income) from the [cash-secured
put](/blog/cash-secured-put-explained). It keeps the same 50 strike, adds a
cheaper put beneath it, and reads both off the hypothetical XYZ chain from the
[option chain post](/blog/how-to-read-an-option-chain), because the question
that decides the position is which of the chain's prices the credit is built
from.

## Key takeaways

- A put credit spread is a short put plus a cheaper long put at a lower strike; the long put is what caps the loss.
- Maximum loss is the width times 100, less the credit, and any expiration close at or below the lower strike reaches it.
- The credit the quotes are offering now is the short put's bid less the long put's ask; the mark is a reference, not an offer.
- Width sets the risk: on the same short strike, a wider spread brings in more credit and carries a larger maximum loss.
- Between the strikes at expiration the long put is gone and the short put may still deliver shares.

## How does a put credit spread work?

A put credit spread pays first and caps the loss second. The two legs are not alike, and the position follows from what each one is:

- **The short put, at the higher strike.** An obligation to buy 100 shares at that strike if assigned. Selling it brings premium in.
- **The long put, at the lower strike.** A right to sell 100 shares at its strike. Buying it costs premium, which gives back part of the first leg's.

The difference is the **credit**, per share, and it arrives at the fill. The
**width** is the gap between the strikes, and it is the most the two legs can
ever settle against each other for.

That is why the structure exists next to the cash-secured put. A cash-secured
put reserves the strike times 100 behind a short put alone, $5,000 for the 50
put. Adding the lower put replaces an open-ended fall to zero with a floor:
the reserve shrinks to the width, and with the credit landing in cash, the net
reduction in buying power is the width less the credit, as the [buying
power post](/blog/options-buying-power-requirement) works out for a margin
account. Cash and retirement accounts set their own rules for spreads, so it
is worth reading the broker's rather than assuming.

The two puts also work against each other after the fill. As the stock falls
toward the short strike the obligation gets more expensive, and the right
underneath it gets more valuable too, so each dollar the short put loses is
partly returned by the long put. That offset is small when the stock is far
above both strikes and complete at expiration once it is below both, which is why the loss
stops growing there instead of running on.

A put credit spread ends the way any pair of options does. It can be bought
back before expiration, both legs together, for more or less than it brought
in. It can expire with both puts worthless. Or it can settle against the
stock, with one leg or both in the money, which is the case the last section
of this post takes apart.

## Example: one hypothetical 50/48 put credit spread on XYZ

Take the 30-day expiration on the hypothetical chain, with XYZ quoted at
$50.00 at 3:30 p.m. The put rows, bid and ask:

| Strike | Put bid | Put ask | Put mark |
| --- | --- | --- | --- |
| 46 | 0.71 | 0.79 | 0.75 |
| 48 | 1.33 | 1.43 | 1.38 |
| 50 | 2.24 | 2.34 | 2.29 |

A hypothetical trader sells one 50 put and buys one 48 put as a single
order. Selling the 50 at its bid of 2.24 and buying the 48 at its ask of 1.43
gives a credit of 2.24 − 1.43 = 0.81 per share, $81 per spread. (The buying power post used a round $0.60 credit for the same strikes, chosen for its arithmetic; here both legs are priced from the chain.) The width is
$2.00, so:

- **Maximum loss.** ($2.00 − $0.81) × 100 = **$119**, reached at any close of $48.00 or lower.
- **Break-even.** The short strike less the credit: $50.00 − $0.81 = **$49.19**. At that close the 50 put is worth exactly the credit.
- **Maximum gain.** The **$81** credit, kept if XYZ closes at $50.00 or above, when both puts expire worthless.

These figures describe mechanics, not a forecast. The three cases across
expiration, each leg settled against its own strike:

| XYZ closes at | Short 50 put | Long 48 put | Result per spread |
| --- | --- | --- | --- |
| $51.00 | Expires worthless | Expires worthless | +$81, the whole credit |
| $49.00 | Worth $1.00, costs $100 | Expires worthless | −$19 |
| $47.00 | Worth $3.00, costs $300 | Worth $1.00, pays $100 | −$119, the maximum |

![The payoff of a hypothetical 50/48 put credit spread at expiration: a 0.81 credit kept from the 50 strike upward, a break-even at 49.19, and a 1.19 maximum loss from the 48 strike downward.](/assets/blog/put-credit-spread-payoff.svg)

Reading that table across matters more than any single row. The best case is
fixed at $81 and reached over a wide range of closes, from $50.00 upward. The
worst case is fixed at $119 and reached at $48.00 or lower. Everything in between is
the slope, $1 of result for every $0.01 of the stock's move, and nothing the
stock does outside those two prices changes either figure. That is what
"defined risk" means for the structure: two known plateaus and a line joining
them, known at the fill.

The $47.00 row is the width doing its job. Both puts are in the money, so
the account is assigned shares at $50.00 and can sell them at $48.00 through
the long put: the pair settles for the $200 width however far below $48.00
the stock finishes, against the $81 already received.

## Mark or natural: which credit will the spread fill at?

The credit that counts is the one the quotes will pay now. The 0.81 above is one of three credits the same two rows can produce, which
is the point of reading the chain before sending an order:

- **Bid on the short, ask on the long.** 2.24 − 1.43 = 0.81. Order screens often label this the natural price. Both numbers are live offers, and this is the credit the quotes show for an order that fills immediately, provided the quotes and size hold.
- **Marks.** 2.29 − 1.38 = 0.91. Neither row is offering it; it is a midpoint of two quotes.
- **Last prices.** On a quiet contract a last can be hours old, and the chain post shows the same spread pricing at 0.36 from a stale 48 put.

A spread goes in as one order with one net limit price, and a limit set
between 0.81 and 0.91 may fill, or may not. Nothing on the screen says which.
What the price changes is not cosmetic, since each cent of credit is $1 per
spread, and it moves the maximum loss and the break-even by that amount:

![The same hypothetical 50/48 put credit spread priced two ways per share: 0.81 from live offers, with a $119 maximum loss, and 0.91 from marks, with a $109 maximum loss, and a band between where a fill is not assured.](/assets/blog/put-spread-credit-live-vs-mark.svg)

A trader who sends the order at the mark and is not filled has not lost
anything, but has not opened the position either. A trader who accepts the
bid-and-ask credit has crossed the [bid-ask spread](/blog/options-bid-ask-spread)
on two legs instead of one, 0.10 below the marks here, which is part of what the position costs to enter.
Neither figure is the right one; they are different prices for different
degrees of certainty.

After the fill the same distinction returns. The position's value on the
screen is a mark, the price to buy the spread back at the midpoints, and it
can sit far from the expiration figures in the table while time remains. A
mark worse than the credit does not, by itself, mean the $119 has been lost;
the [max loss post](/blog/credit-spread-max-loss) covers what a mark settles
and what it does not.

## How does width change a put credit spread?

Width sets the risk more than the credit does. Keep the 50 put and move the long put down to the 46, on the same chain. The
short leg is unchanged; the new long put is bought at its ask of 0.79.

| Same 50 short put | 50/48 spread | 50/46 spread |
| --- | --- | --- |
| Credit (bid less ask) | 0.81, or $81 | 2.24 − 0.79 = 1.45, or $145 |
| Width | $2.00 | $4.00 |
| Maximum loss | $119 | $255 |
| Break-even | $49.19 | $48.55 |
| Maximum loss reached at | $48.00 or lower | $46.00 or lower |

The wider spread brings in $64 more credit and adds $136 more maximum loss.
The extra $64 is smaller than the extra $136 because the added stretch, from
$48 to $46, sits further from the stock, where puts are worth less. The
same short strike, then, is two different positions, one with a
break-even $0.81 below the strike and one $1.45 below it.

How to weigh a credit against the risk behind it is its own subject:
[return on risk against return on
capital](/blog/return-on-risk-vs-return-on-capital) works it through, and the
[max loss post](/blog/credit-spread-max-loss) covers what the figure does not
describe before expiration. The width is fixed at the fill, and it is the
number the maximum loss is built from. The [credit spread width
post](/blog/credit-spread-width) takes this same 50 short put across $1, $2 and $5 widths.

One consequence is easy to overlook. Two spreads with the same short strike
have the same first leg, the same obligation to buy at $50.00, and they still
sit at different points of the chain, because the second leg decides how far
below the strike the protection begins. A reader who compares only the short
strikes has compared half of each position.

## Between the strikes, the long put is gone and the short put may not be

The $49.00 row in the expiration table hides a wrinkle. The short 50 put
finishes in the money and the 48 put does not, so the account is assigned 100
shares at $50.00, a $5,000 debit, with nothing underneath them.

The result on paper is the −$19 in the table. In the account it is a stock
position that must be funded, and it can move against the trader before the
market reopens. Three cases decide when this matters:

- **At expiration.** Options a cent or more in the money are typically exercised by exception, as the [expiration post](/blog/what-happens-options-expiration) sets out, and a broker may apply its own threshold.
- **Before expiration.** The short put can be [assigned early](/blog/option-assignment-what-happens); it is uncommon, and the conditions that make it likely are in that post.
- **After assignment.** If the short put was assigned early and the long put is still held, the shares and the put together keep the loss within the cap, but the position is now shares and a put rather than two options. After an expiration assignment between the strikes, the long put has expired, and nothing caps the loss on the shares.

Nothing in the credit or the width warns about this case: both figures are
exact, but they describe the two plateaus, and this close sits on the slope
between them. A spread that finishes between its strikes is
neither the clean win nor the clean maximum loss, and it is the outcome where
the account, not the arithmetic, decides what happens next.

The cap is a property of holding both legs together. It is the arithmetic
behind the maximum loss, not something that steps in when the short put is
exercised.

## Frequently asked questions

- **What is a put credit spread?** A short put and a long put, same stock and expiration, the long at a lower strike, opened for a net credit. It is also called a bull put spread or a short put vertical.
- **What is the max loss on a put credit spread?** The width between the strikes, times 100, less the credit received. On the 50/48 spread at 0.81, that is ($2.00 − $0.81) × 100 = $119.
- **What is the break-even on a put credit spread?** The short strike less the credit: $50.00 − $0.81 = $49.19.
- **How is a put credit spread different from a cash-secured put?** The short strike can be the same. The lower long put caps the loss and shrinks the reserve, and gives up part of the premium to pay for it.

## The bottom line

A put credit spread is a short put with a long put beneath it. The credit is
paid at the fill, the width sets the most the legs can settle against each
other, and the maximum loss is the width less the credit, the same figure as
the net buying power reduction on a margin account.

Two numbers decide what a position's figures mean:
which prices the credit was built from, and the width behind it. The rest,
including what happens between the strikes, follows from those two.

The same arithmetic on the call side, where the risk has no floor of its own, is the [call credit spread](/blog/call-credit-spread-explained).

Paired with a call credit spread above the stock on the same expiration, it
becomes an [iron condor](/blog/iron-condor-explained).

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
