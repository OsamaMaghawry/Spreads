---
title: "Debit spread vs credit spread: the same vertical from both sides"
slug: debit-spread-vs-credit-spread
excerpt: A put credit spread and a call debit spread on the same two strikes have the same payoff at expiration; what differs is which way the cash moves at the fill and what the account holds.
meta_description: "On the same strikes, a put credit spread and a call debit spread pay the same at expiration. What differs: cash at the fill, collateral, early assignment."
search_title: "Debit Spread vs Credit Spread: Same Strikes, Same Payoff"
author: Osama Safwat Maghawry
category: income
series_order: 66
tags: debit spread, credit spread, vertical spread, max loss, options
---

In the **debit spread vs credit spread** comparison, a debit spread is a
vertical spread opened by paying a net premium and a credit spread is one
opened by receiving a net premium. Both are two
options of the same type and expiration at different strikes. On the same two
strikes, a put credit spread and a call debit spread have the same payoff at
expiration, so the real difference lies in cash, collateral and assignment.

This post opens the next block of the [income series](/blog/income). It takes
the 50/48 [put credit spread](/blog/put-credit-spread-explained) already
priced on the hypothetical XYZ chain from the [option chain
post](/blog/how-to-read-an-option-chain), builds the call debit spread on the
same strikes beside it, and compares the two line by line. The [assignment
risk post](/blog/assignment-risk-credit-spread) covers the short leg in more depth.

## Key takeaways

- A credit spread sells the more expensive option and buys a cheaper one; a debit spread buys the more expensive one and sells a cheaper one.
- A bullish put credit spread and a bullish call debit spread on the same strikes and expiration settle to nearly the same result at every closing price, and exactly the same on this hypothetical chain.
- The debit paid for the call spread is close to the maximum loss of the put spread, and the credit received for the put spread is close to the maximum gain of the call spread.
- What differs is the cash at the fill, how the broker holds the risk, and which short leg can be assigned early.
- Many comparisons set an out-of-the-money credit spread against an at-the-money debit spread, which compares two strike choices, not two structures.

## What is the difference between a debit spread and a credit spread?

The difference is which leg is the more expensive one. In any vertical, the
option with the better strike for its holder costs more: the lower strike for
calls, the higher strike for puts. Which of the two is bought decides which
way the net premium flows.

- **Credit spread.** The more expensive option is sold and the cheaper one is bought. The net premium arrives at the fill, and the most the position can make is that credit.
- **Debit spread.** The more expensive option is bought and the cheaper one is sold. The net premium is paid at the fill, and the most the position can lose is that debit.

Each direction comes in both forms. A view that the stock will hold up or
rise can be expressed as a put credit spread (a bull put spread) or a call
debit spread (a bull call spread). A view that it will stay down or fall can
be expressed as a call credit spread or a put debit spread, the bear put
spread that the [put spread hedge](/blog/put-spread-hedge) buys against
shares.

| Direction | Credit spread | Debit spread |
| --- | --- | --- |
| Bullish | Put credit spread: sell the higher put, buy the lower | Call debit spread: buy the lower call, sell the higher |
| Bearish | Call credit spread: sell the lower call, buy the higher | Put debit spread: buy the higher put, sell the lower |
| Premium at the fill | Received | Paid |
| Most it can make | The credit | Width less the debit |
| Most it can lose | Width less the credit | The debit |

## Do a put credit spread and a call debit spread have the same payoff?

Take the hypothetical 30-day XYZ chain with the stock at $50.00. The rows
needed, bid and ask:

| Strike | Call bid | Call ask | Put bid | Put ask |
| --- | --- | --- | --- | --- |
| 48 | 3.33 | 3.43 | 1.33 | 1.43 |
| 50 | 2.24 | 2.34 | 2.24 | 2.34 |

Each spread is priced at the natural price, selling at the bid and buying at
the ask, so both figures are live offers rather than midpoints:

- **Put credit spread, 50/48.** Sell the 50 put at 2.24, buy the 48 put at 1.43: a credit of **0.81**, or $81. Maximum loss ($2.00 less $0.81) × 100 = **$119**. Break-even $50.00 less $0.81 = **$49.19**.
- **Call debit spread, 48/50.** Buy the 48 call at 3.43, sell the 50 call at 2.24: a debit of **1.19**, or $119. Maximum gain ($2.00 less $1.19) × 100 = **$81**. Break-even $48.00 plus $1.19 = **$49.19**.

The numbers mirror each other: $81 that can be made, $119 that can be lost,
and the same break-even. At expiration the two settle identically:

| XYZ closes at | Put credit spread | Call debit spread |
| --- | --- | --- |
| $51.00 | Both puts expire worthless: +$81 | Pair worth the $2.00 width: +$81 |
| $49.00 | Short 50 put costs $100: −$19 | 48 call worth $1.00: −$19 |
| $47.00 | Pair settles for the $2.00 width: −$119 | Both calls expire worthless: −$119 |

![A hypothetical 50/48 put credit spread opened for 0.81 and a 48/50 call debit spread opened for 1.19 draw one payoff line at expiration: 0.81 gained from the 50 strike up, 1.19 lost from the 48 strike down, break-even at 49.19.](/assets/blog/debit-vs-credit-same-payoff.svg)

This is not a coincidence of the chosen numbers. A relationship called
put-call parity ties a call and a put at the same strike and expiration to the
stock and to interest, and it carries over to spreads: the call spread's debit
plus the put spread's credit comes to about the width.

In theory the total is
a little under $2.00, by the interest earned on $2.00 for 30 days, and on American-style options the value of early exercise, which dividends
affect, shifts it too. In practice the bid and ask on four quotes move it by
a few cents either way. This hypothetical chain is built with interest set to zero, so it adds to
exactly $2.00 at the natural, and at the marks as well (0.91 plus 1.09).

The link holds before expiration too, approximately. If the put spread could
be bought back for 0.40 at some point, the call spread on the same strikes
would be worth about 1.60 at the same moment, so closing either one early
produces a similar result, give or take the bid and ask on two more fills.

Related: [put-call parity explained with an option chain](/blog/put-call-parity) works the same relationship on one strike, as a call, a put and 100 shares.

These figures describe mechanics on an invented chain, not an outcome
anyone should expect.

## What does the account hold after each fill?

The same payoff arrives through different accounts. The credit spread puts
$81 into cash at the fill and asks the account to set aside the $200 width
against it; the debit spread takes $119 out of cash and asks for nothing
more, because a long spread is paid for in full.

![At the fill, a hypothetical put credit spread adds $81 of cash while $200 is held against it, and a call debit spread pays $119 with nothing held; both commit $119.](/assets/blog/debit-vs-credit-at-the-fill.svg)

On a margin account the net effect on buying power is the same $119 either
way, as the [buying power post](/blog/options-buying-power-requirement) works
out for the credit side. The routes still differ in three ways a trader
notices:

- **The cash line.** The credit spread shows $81 more cash than the account had, but that cash is not free while the position is open. The debit spread shows $119 less cash, which is the whole risk already paid.
- **Cash and retirement accounts.** Brokers set their own rules for spreads in these accounts, and some hold more than the width less the credit. The debit spread usually needs only the debit, but the broker's own rules decide.
- **What the screen reports.** A position opened for a credit tends to be shown as premium received, and one opened for a debit as cost paid. The two descriptions sound different and describe the same risk.

Measured the way [return on risk](/blog/return-on-risk-vs-return-on-capital)
measures it, the two are also the same: $81 that can be made against $119
that can be lost, on either side.

## Which short leg can be assigned, and when?

Assignment is where the two spreads stop being twins. Each has a short leg,
but it is a different option, and the conditions for [early
exercise](/blog/early-exercise-options) differ between puts and calls.

- **The put credit spread's short 50 put.** It can be assigned early once it is in the money and little time value is left, which usually means the stock has fallen well below $50.00 near expiration. The account then buys 100 shares at $50.00, with the long 48 put still held under them.
- **The call debit spread's short 50 call.** The usual trigger is a dividend: when the dividend about to be paid is larger than the call's remaining time value, a holder may exercise the day before the ex-dividend date, as the [dividend risk post](/blog/covered-call-dividend-risk-assignment) sets out. The account is then short 100 shares over the ex-date, owes the dividend on them, and still holds the long 48 call behind them.

In both cases the long leg keeps the loss within the cap while it is held. The
account simply holds a different mix for a while: shares and a put on one
side, short shares and a call on the other.

The close between the strikes matters most at expiration, and here the two
arrive at the same place by different doors. At $49.00, the put spread's
short 50 put is assigned and the account buys 100 shares at $50.00. The call
spread's long 48 call is in the money and is typically exercised by
exception, as the [expiration post](/blog/what-happens-options-expiration)
describes, so the account buys 100 shares at $48.00. Either way it starts
Monday holding 100 shares, a $5,000 or $4,800 debit, with no option left to
cap a weekend gap.

## Why are credit and debit spreads usually compared at different strikes?

The usual comparison sets them at different strikes. A credit spread
is commonly sold below the stock and a debit spread bought at or near it, and
that difference in placement, not the structure, is what the comparison is
really measuring.

| Same chain, two placements | 48/46 put credit spread | 50/52 call debit spread |
| --- | --- | --- |
| Priced at the natural | Sell 48 at 1.33, buy 46 at 0.79 | Buy 50 at 2.34, sell 52 at 1.42 |
| Premium | 0.54 received | 0.92 paid |
| Most it can make | $54 | $108 |
| Most it can lose | $146 | $92 |
| Break-even | $47.46 | $50.92 |

The first spread keeps its whole credit at any close above $48.00 and loses
only below $47.46, so it keeps something across a wide range of closes, and
the credit is small. The second needs XYZ above $50.92 to make anything, and
can make more than it risks when it does. One is placed below the stock, the
other at and above it, which is why their profiles differ.

Move either one onto the other's strikes and its profile changes with it, as
the 48/50 pair above shows. What the comparison actually measures is
therefore not "credit or debit" but where the strikes sit and what the width
less the premium leaves at risk.

## Frequently asked questions

- **Is a debit spread safer than a credit spread?** This post ranks neither. On the same strikes the maximum loss and the break-even match, give or take a few cents. What differs is when the loss is paid (at the fill for the debit spread, held as collateral for the credit spread) and which short leg can be assigned early.
- **What is the max loss on a debit spread?** The debit paid, times 100. On the 48/50 call spread at 1.19, that is $119.
- **Are debit spreads and credit spreads both vertical spreads?** Yes. A vertical is two options of one type on one expiration at different strikes; credit or debit describes only which way the premium moved.
- **Is a bull call spread the same as a bull put spread?** On the same strikes and expiration, the payoff at expiration is very close, and identical on this hypothetical chain. The cash at the fill, the collateral and the assignment risk differ.

## The bottom line

A credit spread and a debit spread are the same kind of position entered from
opposite ends. On matching strikes, a put credit spread and a call debit
spread share, to within a few cents, a maximum loss, a maximum gain and a
break-even; the cash moves
in opposite directions at the fill, and a different short leg carries the
early assignment risk.

A common comparison, an out-of-the-money credit spread against an
at-the-money debit spread, is a comparison of strike placement. The mirror
case on the call side is in the [call credit spread
post](/blog/call-credit-spread-explained).

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
