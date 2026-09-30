---
title: "Call credit spread explained: what the long call caps"
slug: call-credit-spread-explained
excerpt: A call credit spread sells one call and buys a cheaper one above it, so the account is paid at the fill and the loss is capped at the strikes' gap less that credit.
meta_description: "Call credit spread explained on one hypothetical chain: max loss, break-even, why the long call is the only cap, and assignment into short shares."
author: DeltaMint
category: income
series_order: 19
tags: call credit spread, options credit spread, max loss, short call, options
---

A **call credit spread** is two calls on the same stock and expiration: one
sold at a lower strike, one bought at a higher strike. The account is paid a
net credit at the fill, and the most it can lose is the gap between the two
strikes, times 100, less that credit.

This post continues the [income series](/blog/income) from the [put credit
spread](/blog/put-credit-spread-explained). The structure is its mirror
image, built on the call side of the same hypothetical XYZ chain from the
[option chain post](/blog/how-to-read-an-option-chain). The arithmetic is the
same; what changes is which direction of stock move hurts, and why that
direction has no floor of its own.

## Key takeaways

- A call credit spread is a short call plus a cheaper long call at a higher strike; the long call is what caps the loss.
- Maximum loss is the width times 100, less the credit, and any expiration close at or above the higher strike reaches it.
- The break-even is the short strike plus the credit, the mirror of the put spread's short strike less the credit.
- A short call alone has no ceiling on its loss, because a stock has no ceiling on its price; the long call is the only thing that supplies one.
- Between the strikes at expiration the account can be assigned into a short stock position that nothing above it protects.

## How does a call credit spread work?

A call credit spread pays first and caps the loss second, exactly as its put cousin does. The two legs are not alike:

- **The short call, at the lower strike.** An obligation to sell 100 shares at that strike if assigned. Selling it brings premium in.
- **The long call, at the higher strike.** A right to buy 100 shares at its strike. Buying it costs premium, which gives back part of the first leg's.

The difference is the **credit**, per share, and it arrives at the fill. The
**width** is the gap between the strikes, and it is the most the two legs can
ever settle against each other for.

The structure sits next to the [covered call](/blog/covered-call-explained),
which is also a short call, but a covered call has shares behind it. A call
credit spread has a second option behind it instead. A short call with
neither is uncovered, and brokers generally restrict it to approved margin
accounts, while spreads are often available in more account types. Each broker
sets its own rules, so it is worth reading them rather than assuming.

The two calls work against each other after the fill. As the stock rises
through the short strike the obligation gets more expensive, and the right
above it gets more valuable too, so each dollar the short call loses is partly
returned by the long call. The offset is small while the stock is far below
both strikes and complete at expiration once it is above both, which is why
the loss stops growing there.

## Example: one hypothetical 52/54 call credit spread on XYZ

Take the 30-day expiration on the hypothetical chain, with XYZ quoted at
$50.00 at 3:30 p.m. The call rows, bid and ask:

| Strike | Call bid | Call ask | Call mark |
| --- | --- | --- | --- |
| 50 | 2.24 | 2.34 | 2.29 |
| 52 | 1.42 | 1.52 | 1.47 |
| 54 | 0.85 | 0.93 | 0.89 |

A hypothetical trader sells one 52 call and buys one 54 call as a single
order. Selling the 52 at its bid of 1.42 and buying the 54 at its ask of 0.93
gives a credit of 1.42 − 0.93 = 0.49 per share, $49 per spread. The width is
$2.00, so:

- **Maximum loss.** ($2.00 − $0.49) × 100 = **$151**, reached at any close of $54.00 or higher.
- **Break-even.** The short strike plus the credit: $52.00 + $0.49 = **$52.49**. At that close the 52 call is worth exactly the credit.
- **Maximum gain.** The **$49** credit, kept if XYZ closes below $52.00, and usually at it, when both calls expire worthless.

These figures describe mechanics, not a forecast. Note that both strikes sit
above the $50.00 quote: the short call starts out of the money, and the
position's fixed best case needs the stock to stay under it. The three cases
across expiration, each leg settled against its own strike:

| XYZ closes at | Short 52 call | Long 54 call | Result per spread |
| --- | --- | --- | --- |
| $51.00 | Expires worthless | Expires worthless | +$49, the whole credit |
| $53.00 | Worth $1.00, costs $100 | Expires worthless | −$51 |
| $55.00 | Worth $3.00, costs $300 | Worth $1.00, pays $100 | −$151, the maximum |

![The payoff of a hypothetical 52/54 call credit spread at expiration: a 0.49 credit kept from the 52 strike downward, a break-even at 52.49, and a 1.51 maximum loss from the 54 strike upward.](/assets/blog/call-credit-spread-payoff.svg)

The picture is the put spread's payoff reflected left to right. The best case
is a plateau reached over a wide range of closes, from $52.00 downward. The
worst case is a plateau reached at $54.00 or higher. In between is the slope,
$1 of result for every $0.01 of the stock's move. The $55.00 row is the width
doing its job: the account must deliver shares at $52.00 and can buy them at
$54.00 through the long call, so the pair settles for the $200 width however
far above $54.00 the stock finishes, against the $49 already received.

## Which credit will a call credit spread fill at?

The credit that counts is the one the quotes will pay now. The same two rows
produce three credits, as they did for the [put spread](/blog/put-credit-spread-explained):

| Priced from | Short 52 call | Long 54 call | Credit | Max loss |
| --- | --- | --- | --- | --- |
| Bid and ask | 1.42 (bid) | 0.93 (ask) | 0.49, or $49 | $151 |
| Marks | 1.47 | 0.89 | 0.58, or $58 | $142 |
| A stale last | may be hours old | may be hours old | unreliable | unreliable |

Only the first row is built from live offers. The marks are midpoints nobody
has offered, and a limit price set between 0.49 and 0.58 may fill or may not,
with nothing on the screen saying which. Each cent of credit is $1 per
spread, and it moves the maximum loss and the break-even by that amount, so a
trader reading a screenshot of someone else's spread is reading a maximum
loss that depends on which column produced it. The [bid-ask
post](/blog/options-bid-ask-spread) explains why entering costs money, and
the [max loss post](/blog/credit-spread-max-loss) covers what a mark does and
does not tell you after the fill.

## Why does a call credit spread need the long call?

Because a short call alone has no ceiling on its loss: a stock has no ceiling
on its price. A short put's loss stops where the stock does, at zero: at most its
strike times 100 less the premium (the 50 put, sold at 2.24, can lose at most
$4,776), so the long put only narrows a
bounded risk. The long call is the only bound there is.

![The hypothetical short 52 call alone loses 1 for every 1 the stock rises above 52, with no floor, while the 52/54 call credit spread stops losing at 1.51 from the 54 strike upward.](/assets/blog/call-spread-vs-short-call.svg)

Compare the two positions on the same chain:

- **Short 52 call alone.** Sold at its 1.42 bid. At $55.00 the loss is 3.00 − 1.42 = 1.58 per share, and each further dollar adds a dollar of loss.
- **52/54 spread.** Opened for 0.49. At $55.00 the loss is 1.51, and it is 1.51 at $70.00 too.

The $0.93 spent on the 54 call is what turns an open-ended risk into a known
one, at the cost of giving back part of the premium. That is the whole of the
trade the structure makes, and it is also why the buying power reduction is
the width less the credit for the spread on a margin account, as the [buying
power post](/blog/options-buying-power-requirement) sets out, rather than the
larger requirement brokers place on an uncovered short call. Neither figure
should be assumed; both come from the broker's rules.

## Between the strikes, the short call may leave the account short shares

The $53.00 row in the expiration table hides a wrinkle. The short 52 call
finishes in the money and the 54 call does not, so the account is assigned:
it must deliver 100 shares at $52.00. If it holds none, the delivery leaves a
**short stock** position, credited $5,200, with no long call above it.

On paper the result is the −$51 in the table. In the account it is a short
position that can move against the trader before the market reopens, and one
that a broker may treat differently from an option position, for example
through borrow fees or margin. Three cases decide when this matters:

- **At expiration.** Options a cent or more in the money are typically exercised by exception, as the [expiration post](/blog/what-happens-options-expiration) sets out, and a broker may apply its own threshold.
- **Before expiration.** The short call can be [assigned early](/blog/option-assignment-what-happens). The [early exercise post](/blog/early-exercise-options) explains why a dividend is the usual reason for calls.
- **Across an ex-dividend date.** A short share position owes the dividend to the lender of the shares. If assignment left the account short over that date, and an early assignment ahead of a dividend does exactly that, the dividend is a cost the spread's figures did not include.

Nothing in the credit or the width warns about this case: both are exact, but
they describe the two plateaus, and a close between the strikes sits on the
slope. If the short call is assigned early while the long call is still held,
the two together still cap the price risk at the width, but a dividend owed
on the short shares, and any borrow cost, come on top of that cap. After an expiration
assignment between the strikes, the long call has expired and nothing does.
The cap is a property of holding both legs, not something that steps in when
the short call is exercised.

## Frequently asked questions

- **What is a call credit spread?** A short call and a long call, same stock and expiration, the long at a higher strike, opened for a net credit. It is also called a bear call spread or a short call vertical.
- **What is the max loss on a call credit spread?** The width between the strikes, times 100, less the credit received. On the 52/54 spread at 0.49, that is ($2.00 − $0.49) × 100 = $151, before any dividend owed or borrow cost on shares from an early assignment.
- **What is the break-even on a call credit spread?** The short strike plus the credit: $52.00 + $0.49 = $52.49.
- **What is the difference between a call credit spread and a put credit spread?** The arithmetic is the same, but the risk sits on the upside, and assignment leaves the account short shares rather than long shares. The [put credit spread post](/blog/put-credit-spread-explained) has the other side.

## The bottom line

A call credit spread is a short call with a long call above it. The credit is
paid at the fill, the width sets the most the legs can settle against each
other, and the maximum loss is the width less the credit.

What separates it from the put version is what the long leg is guarding
against: a put spread's loss is bounded by zero anyway, while a short call's
is bounded only by the leg bought above it. The rest follows from that
and from which prices the credit was built on.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
