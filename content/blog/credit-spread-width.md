---
title: "Credit spread width: one $5-wide vs five $1-wide spreads"
slug: credit-spread-width
excerpt: The width of a credit spread sets its maximum loss, the credit grows more slowly than the width, and five $1-wide spreads pay a different credit from one $5-wide spread that ends in the same place.
meta_description: "Credit spread width sets the max loss. On one hypothetical put chain: why credit grows slower than width, and why five $1-wide spreads are not one $5-wide."
author: DeltaMint
category: income
series_order: 21
tags: options credit spread, credit spread width, spread width, wing width, max loss
---

The **width** of a credit spread is the distance between its two strikes: $1 on
a 50/49 put spread, $5 on a 50/45. It is fixed at the fill, and the maximum
loss is built from it: the width times 100, less the credit. The width also
decides how far the stock has to fall before that loss is reached.

This post continues the [income series](/blog/income) after the [put credit
spread](/blog/put-credit-spread-explained), the [call credit
spread](/blog/call-credit-spread-explained) and the [iron
condor](/blog/iron-condor-explained). Those posts each used one width. Here the
width is the only thing that changes, on the same hypothetical XYZ chain from
the [option chain post](/blog/how-to-read-an-option-chain), and the result is
that a wider spread is a different position, not a larger copy of a narrow one.

## Key takeaways

- Width is the gap between the short strike and the long strike. Maximum loss is the width times 100 less the credit, before fees, whatever the stock does.
- Widening a spread, with the short strike fixed, adds credit more slowly than it adds risk, because the extra strikes are further from the stock and worth less.
- The bid-ask spread is a roughly fixed number of cents per leg. On a narrow spread it is a large share of the credit; on a wide one it is a small share.
- One $5-wide spread and five $1-wide spreads that cover the same strikes have the same expiration payoff, but the five collect a lower credit, so they finish $38 worse at every price.
- Five contracts of one $1-wide spread are a different position again: each reaches its maximum loss after a $1 fall, where the wide spread takes $5, so the two lose differently across the range.

## Example: three widths on one 50 short put

Take the 30-day expiration on the hypothetical chain, with XYZ at $50.00. Every
spread below sells the same 50 put and buys a put further down. The rows are
bid and ask; the 50, 48 and 46 rows are the ones already used in the
[put credit spread post](/blog/put-credit-spread-explained), and the 49, 47 and 45
rows are added in the same pattern, near a Black-Scholes fit at 40% implied
volatility:

| Put strike | Bid | Ask |
| --- | --- | --- |
| 50 | 2.24 | 2.34 |
| 49 | 1.75 | 1.85 |
| 48 | 1.33 | 1.43 |
| 47 | 0.98 | 1.08 |
| 46 | 0.71 | 0.79 |
| 45 | 0.49 | 0.57 |

For an order that fills immediately, the short leg fills at its bid and the
long leg at its ask. That gives three different positions from one short put:

| Same 50 short put | 50/49 spread | 50/48 spread | 50/45 spread |
| --- | --- | --- | --- |
| Credit (bid less ask) | 2.24 − 1.85 = 0.39, or $39 | 2.24 − 1.43 = 0.81, or $81 | 2.24 − 0.57 = 1.67, or $167 |
| Width | $1.00 | $2.00 | $5.00 |
| Maximum loss | $61 | $119 | $333 |
| Break-even | $49.61 | $49.19 | $48.33 |
| Maximum loss reached at | $49.00 or lower | $48.00 or lower | $45.00 or lower |

Maximum loss is the width times 100 less the credit, as in the [max loss
post](/blog/credit-spread-max-loss): ($5.00 − $1.67) × 100 = $333. The
break-even is the short strike less the credit, so the credit decides how far
below $50 the position stops losing money, and width decides how far below $50
the loss stops growing.

![Gain or loss at expiration for three hypothetical put credit spreads sharing a 50 short put: the $1-wide collects 0.39 and loses at most 0.61, the $2-wide collects 0.81 and loses at most 1.19, and the $5-wide collects 1.67 and loses at most 3.33.](/assets/blog/credit-spread-width-payoffs.svg)

All three lines are flat at and above $50, and each is flat again once the
stock is at or below its long strike. What differs is the slope between: the
narrow spread turns from gain to maximum loss across one dollar of stock price,
the wide one across five. Nothing in the picture says where XYZ will finish. It
shows what each width would pay for every place it could.

## Does a wider credit spread collect proportionally more premium?

No, and the table shows it. The credit is the short put's bid less the long
put's ask, so widening the spread only changes the long leg, and each strike
the long leg moves down is a cheaper put than the one before it.

- **The first dollar of width brings in 0.39.** The long put sits at the 49, asking 1.85.
- **The second dollar brings in a further 0.42.** Moving the long put to the 48, asking 1.43, saves 0.42 against the 49.
- **The next three dollars together bring in 0.86.** The long put goes from the 48 to the 45 and its ask falls from 1.43 to 0.57, under 0.29 for each dollar of width.
- **Risk grows a full dollar for each dollar.** The maximum loss before credit rises by $100 for every dollar of width. The first dollar's credit looks low only because it pays the bid-ask on both legs; at the marks the run is 0.49, 0.42 and then about 0.28 a dollar, and past the 48 the extra credit covers a smaller part of the extra risk.

Read the list against the table. The 50/45 collects $167 against $500 of
width, and the remaining $333 is its maximum loss, so most of what the wider
spread adds is risk that sits far from the stock. A reader comparing two
spreads from the same short strike is comparing two different shapes, with
different break-evens and different distances to the floor, and a single
credit figure cannot stand in for either.

This is the same effect the put spread post showed between its $2 and $4
widths. It is a statement about how the chain is priced, not about which width
anyone should hold. Puts further from the stock are worth less, so the
protection a wider spread sells back is worth less too, and the credit stops
keeping up with the width.

## The bid-ask spread takes a different share of each width

The cents a trader gives up by filling at the quote instead of the midpoint
barely change with width, so what changes is how large they are next to the
credit. Compare each credit to the one the marks would give, the midpoint of
each leg:

| | 50/49 | 50/48 | 50/45 |
| --- | --- | --- | --- |
| Credit at the marks | 2.29 − 1.80 = 0.49 | 2.29 − 1.38 = 0.91 | 2.29 − 0.53 = 1.76 |
| Credit at bid and ask | 0.39 | 0.81 | 1.67 |
| Given up by crossing | 0.10 | 0.10 | 0.09 |
| Given up as a share of the marked credit | about 20% | about 11% | about 5% |

The [bid-ask post](/blog/options-bid-ask-spread) explains why a mark is not an
offer. The point here is only proportion: ten cents is a fifth of the narrow
spread's marked credit and nine cents is about a twentieth of the wide one's;
in dollars it is $9 to $10 per spread in each. A narrow spread therefore leans harder on where inside
the quote it fills, and a fill at the marks that does not arrive is a bigger
miss on it.

## Five $1-wide spreads are not one $5-wide spread

There are two ways to read "five $1-wide spreads", and they are different
positions.

**Five contracts of the same 50/49 spread.** Here width stays at $1 and the
size is five times larger. Each contract still reaches its maximum loss at
$49.00. Five 50/49 spreads against one 50/45, at expiration:

| XYZ closes at | Five 50/49 spreads | One 50/45 spread |
| --- | --- | --- |
| $50.00 or higher | +$195 | +$167 |
| $49.50 | −$55 | +$117 |
| $49.00 | −$305 | +$67 |
| $48.00 | −$305 | −$33 |
| $46.00 | −$305 | −$233 |
| $45.00 or lower | −$305 | −$333 |

The five narrow spreads collect a larger credit, and keep it if the stock stays at or above $50. They lose more
on any close from about $49.93 down to about $45.28. The wide spread takes longer to reach
its loss, and its loss, which keeps growing to $45, passes the five narrow
spreads' fixed $305 at about $45.28. Neither ranking is a verdict. They show
that width and size are two separate dials, with different risks attached.

**Five $1-wide spreads laddered from 50 down to 45.** This is 50/49, 49/48,
48/47, 47/46 and 46/45, one after another. Each middle strike is sold in
one spread and bought in the next, so in one account the pair nets to nothing
as soon as both are filled, and the five together leave exactly a 50/45 spread. The credit does not add up the
same way, because every middle strike is bought at its ask and sold at its bid:

- **Four middle strikes cross the spread twice.** 0.39 + 0.32 + 0.25 + 0.19 + 0.14 = 1.29, against 1.67 for the one 50/45 order.
- **The difference is 0.38 per share.** That is $38 per set, and it makes the laddered maximum loss $371 against $333 for the same expiration payoff.
- **There are ten fills, not two.** Any per-contract fee applies to each, and each order carries its own chance of not filling, or of the quotes moving before it does.

![The same 50 to 45 put exposure built two ways on the hypothetical chain: one 50/45 spread collects 1.67, five laddered 1-wide spreads collect 1.29, and the 0.38 difference is the bid-ask spread paid on four middle strikes.](/assets/blog/credit-spread-width-ladder.svg)

## A wider spread has more room to finish between the strikes

Both strikes of a spread are fixed at the fill, but a position spends its life
between them, and the wider the spread, the more of the price range is
"between".

- **At expiration.** A close between the short and long strike leaves one leg in the money and one expired. On the 50/45, a close at $47.00 means the short 50 put is assigned and the account owns 100 shares at $50.00 with no put left to sell them. The [expiration post](/blog/what-happens-options-expiration) covers that case, and a wider zone makes it more likely to occur.
- **Before expiration.** The short put can be assigned early, the same on any width. Assignment buys 100 shares at the strike while the long put stays in the account, so the cap on the loss survives as long as the long put is held; what changes is that a stock position now has to be funded or margined. The [max loss post](/blog/credit-spread-max-loss) works through it, and the [assignment post](/blog/option-assignment-what-happens) covers what the account holds afterwards.
- **Collateral.** Brokers commonly hold the width less the credit, and for the 50/45 that is $333 and for the 50/49 it is $61. Treat that as typical practice, since brokers set their own requirements, as the [buying power post](/blog/options-buying-power-requirement) explains.
- **Each wing of a condor has a width.** In an [iron condor](/blog/iron-condor-explained) the wider wing is the one that sets the maximum loss.

How to weigh a credit against the risk behind it is its own subject, and
[return on risk against return on
capital](/blog/return-on-risk-vs-return-on-capital) works through it.

## Frequently asked questions

- **What is the width of a credit spread?** The distance between the short strike and the long strike. On the 50/48 put spread it is $2.00, or $200 per spread once multiplied by 100.
- **How does spread width change the max loss?** One-for-one: each extra dollar of width adds $100 of maximum loss before the credit, and the credit grows by less than that. On the hypothetical chain the $1, $2 and $5 widths lose at most $61, $119 and $333.
- **Does spread width change the break-even?** Yes, through the credit. With the short strike fixed, the 50/45's break-even is $48.33 against $49.61 for the 50/49, because it collects more credit. The loss it risks past the break-even is also larger.
- **Is a $5-wide spread the same as five $1-wide spreads?** At expiration, five laddered $1-wide spreads pay what the $5-wide does, but at a lower total credit on this chain, since four middle strikes cross the bid-ask spread. Five contracts of one $1-wide spread are a different position.
- **What is wing width on an iron condor?** The same measure on each side: the gap between a short strike and the long strike beyond it. With unequal wings, the wider wing sets the maximum loss, as the [iron condor post](/blog/iron-condor-explained) shows.
- **Do these figures change with the stock price or implied volatility?** Yes. The quotes are one hypothetical snapshot, and any other day gives other credits.

## The bottom line

Width is the gap between a spread's strikes, and it fixes the maximum loss and
how far the stock must move to reach it. On the hypothetical chain, each extra
dollar of width added a full dollar of risk, and past the first two dollars the
credit for each one fell to under 0.29. About ten cents of bid-ask cost fell on the narrow spread as a fifth of its
credit and on the wide one as a twentieth.

A spread is one position with one width. Splitting it into narrower spreads
changes the credit, the number of fills and the collateral even where the
expiration payoff is the same. The [income series](/blog/income) continues from
width to the next choice a spread makes, which strike to sell, and
[how delta describes it](/blog/credit-spread-delta-strike-selection).

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
