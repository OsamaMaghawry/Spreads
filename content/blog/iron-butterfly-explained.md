---
title: "Iron butterfly explained: an iron condor with the short strikes together"
slug: iron-butterfly-explained
excerpt: An iron butterfly sells a put and a call at the same strike and buys a wing on each side, so it collects more than an iron condor on the same wings, keeps all of it at only one price, and, held to expiration, leaves a short leg in the money at any close but the short strike.
meta_description: "An iron butterfly on one hypothetical chain beside the iron condor: a 2.76 credit, $124 max loss, and why any close but 50.00 leaves a short leg in the money."
search_title: "Iron Butterfly vs Iron Condor, Priced on One Chain"
author: Osama Safwat Maghawry
category: income
series_order: 67
tags: iron butterfly, iron condor, max loss, assignment, options
---

An **iron butterfly** is four options on one stock and one expiration: a short
put and a short call at the same strike, usually the one nearest the stock's
price, plus a long put below and a long call above. It is opened for one net
credit, and the most it can lose is the distance from the short strike to a
long strike, times 100, less that credit.

It is the [iron condor](/blog/iron-condor-explained) with its two short strikes
pushed together until they meet. On the same wings, that change more than
doubles the credit, shrinks the zone where all of it is kept to one price, and
changes what the account holds after expiration. This post continues the
[income series](/blog/income) on the condor post's hypothetical XYZ chain.

**Key takeaways**

- An iron butterfly is a short straddle plus a long strangle around it, opened for one net credit.
- The whole credit is kept only at a close exactly on the short strike.
- The maximum loss is the distance from the short strike to a long strike, less the credit; the break-evens are the short strike plus and minus the credit.
- Held to expiration, any close between the wings except the short strike leaves 100 shares, long or short.

## An iron butterfly is an iron condor with both short strikes at one price

A condor sells a put below the stock and a call above it, leaving a range
between them where nothing is owed. A butterfly sells both at the same strike.
There is no range any more, only a point, and the two long options on the
outside still do the job they did in the condor: they cap the loss on each
side.

The four legs read most easily as two pairs:

- **The body.** A short put and a short call at one strike: a short straddle, collecting at-the-money time value.
- **The wings.** A long put below and a long call above: a long strangle, which gives the straddle a floor.

The name follows the payoff picture: a narrow body with a wing on each side.
"Iron" marks that it mixes puts and calls, as it does in the condor. A
butterfly built from calls alone has the same expiration shape but is bought
for a debit instead; the [debit vs credit post](/blog/debit-spread-vs-credit-spread)
works through why the same payoff can be opened from either side.

## Iron butterfly max loss on one chain: $4.00 of width less a 2.76 credit

Take the 30-day expiration on the hypothetical chain from the
[option chain post](/blog/how-to-read-an-option-chain), with XYZ at $50.00. The
rows the trade uses:

| Strike | Put bid | Put ask | Call bid | Call ask |
| --- | --- | --- | --- | --- |
| 46 | 0.71 | 0.79 | 4.65 | 4.85 |
| 50 | 2.24 | 2.34 | 2.24 | 2.34 |
| 54 | 4.80 | 4.98 | 0.85 | 0.93 |

A hypothetical trader sells the 50 put and the 50 call and buys the 46 put and
the 54 call, as one order. Priced at the far side of each quote, the way the
[bid-ask post](/blog/options-bid-ask-spread) prices an order that fills at
once, the body brings in 2.24 + 2.24 = 4.48 and the wings cost 0.79 + 0.93 =
1.72. The net credit is **2.76** per share, **$276** per position.

Each long option sits $4.00 from the short strike, so the position is defined by three figures:

- **Maximum gain.** The $276 credit, kept only at a close of exactly $50.00, where all four options expire worthless.
- **Maximum loss.** ($4.00 − $2.76) × 100 = **$124**, at any close of $46.00 or lower, or $54.00 or higher.
- **Break-evens.** $50.00 − $2.76 = **$47.24** and $50.00 + $2.76 = **$52.76**.

All 4.48 of the body's premium is time value: with the stock at $50.00, neither
50 option is in the money. That matters later, because time value is what the
mark gives back day by day, and what a move in implied volatility reprices.

Settling each leg against its strike gives the expiration result at a few
closes:

| XYZ closes at | What settles | Result per position |
| --- | --- | --- |
| $45.00 | Put wing pays its full $4.00 width | −$124, the maximum loss |
| $48.00 | Short 50 put is $2.00 in the money | +$76 |
| $50.00 | Nothing | +$276, the maximum gain |
| $51.00 | Short 50 call is $1.00 in the money | +$176 |

These are mechanics, not a forecast: the table says nothing about how likely
any close is.

## Iron butterfly vs iron condor: more credit, a narrower range, a larger max loss

The condor post's 46/48/52/54 condor uses the same two long options. Only the
short strikes differ, so setting the two side by side isolates what moving the
body to one strike does:

| Same 46 and 54 wings | 46/48/52/54 iron condor | 46/50/54 iron butterfly |
| --- | --- | --- |
| Credit at the natural | 1.03 | 2.76 |
| Whole credit kept | Anywhere from $48.00 to $52.00 | Only at $50.00 |
| Break-evens | $46.97 and $53.03 | $47.24 and $52.76 |
| Maximum loss | $97 | $124 |

![On the same 46 and 54 wings, the hypothetical iron butterfly peaks at 2.76 at exactly 50 and loses 1.24, while the iron condor is flat at 1.03 and loses 0.97.](/assets/blog/iron-butterfly-vs-condor-payoff.svg)

Neither column is the better trade, and the picture shows why. The butterfly
pays more at the center and less almost everywhere else: at a close of $48.00
it shows $76 against the condor's $103, and beyond the wings it loses $27 more.
The condor gives up credit to buy a flat top.

The maximum loss is larger because each short strike sits $4.00 from its long
option against the condor's $2.00, and the extra 1.73 of credit offsets only
part of that extra $2.00; the [credit spread width post](/blog/credit-spread-width)
covers why width sets the floor.

Collateral follows the same arithmetic. A broker commonly holds one wing's
width, $400 here, with the $276 credit applied against it, since the stock can
finish past only one short strike. That is typical practice, not a rule, and the
[buying power post](/blog/options-buying-power-requirement) covers how to read a
broker's own requirement.

## Before expiration, the mark behaves like a short straddle's

Before expiration the position looks nothing like that sharp peak. Its mark is
the net of four quotes, and the two at-the-money short options dominate it.

- **Gamma sits at the short strike.** At-the-money options carry the most [gamma](/blog/gamma-options-meaning), more so as expiration nears, so a move off $50 shifts the position's delta quickly.
- **Implied volatility moves the mark.** The short options carry more [vega](/blog/implied-volatility-options-explained) than the wings, so a rise in implied volatility marks the position worse with the stock unchanged.
- **The credit is earned late.** Only near expiration, with the stock near $50, does the mark fall toward zero and the open gain approach the full 2.76.

None of that changes the expiration figures; the [max loss post](/blog/credit-spread-max-loss)
explains why a mark worse than the credit is not yet a loss. The butterfly
simply spends more of its life marked far from its peak, because the peak is
one price wide.

## At expiration, every close but the short strike leaves a short leg in the money

This is the after-the-fill fact that separates the butterfly from the condor.
A condor held to expiration with the stock between its short strikes simply
disappears: four options expire worthless and nothing is delivered. A butterfly
has no such zone. At any close other than exactly $50.00, one of the two short
options finishes in the money, and options a cent or more in the money are
[exercised by exception](/blog/what-happens-options-expiration) unless the
holder instructs otherwise.

![After expiration, the hypothetical 46/50/54 iron butterfly leaves long 100 shares for a close from 46 to 50, short 100 shares from 50 to 54, and none beyond the wings.](/assets/blog/iron-butterfly-expiration-assignment.svg)

Follow two closes through the account. At $48.00 the short 50 put is assigned:
the account buys 100 shares at $50.00, a $5,000 debit, and the long 46 put
expires worthless. The credit and the shares' $2.00 shortfall net to the $76 in
the table, but the position is now 100 shares with nothing beneath them, and
whatever the stock does before the next open belongs to the account.

At $51.00 the short 50 call is assigned instead, and an account holding no
shares wakes up short 100 of them at $50.00, with the long 54 call gone. Short
stock has no cap at all, and it brings a borrow and any dividend owed.

Three more cases complete the picture:

- **Beyond a wing.** Below $46.00 both puts settle, above $54.00 both calls do; the shares net out and the $124 maximum loss remains.
- **At or near $50.00.** Pin risk: at exactly $50.00 neither short option is exercised automatically, and within a few cents a holder may exercise or decline on after-hours news, so the account may not know until the next morning whether it holds shares.
- **Before expiration.** Either short leg can be assigned early; the [early exercise post](/blog/early-exercise-options) covers when.

A cash-settled, European-style index option avoids the delivery: the
difference is paid in cash and nothing is assigned early. On a stock, the
choice is between closing the position before the close on expiration day and accepting
the shares, a trade-off the [close early or hold post](/blog/close-credit-spread-early-or-hold)
works through for a single spread.

## The bottom line: the full credit is kept at one price, not across a range

An iron butterfly is an iron condor with no gap between its short strikes. On
the same wings it collects more, risks more, and keeps the whole credit only at
one price, and the closing price that keeps it is also the one where the
assignment outcome is least certain.

One question comes up often enough to answer here:

- **Is an iron butterfly the same as a butterfly spread?** A call butterfly on the same strikes has the same expiration shape but is bought for a debit. On this chain at the natural it costs 1.30, not 4.00 − 2.76 = 1.24. At the midpoints the two match, 1.06 each way; the call version crosses the in-the-money 46 call's 0.20-wide market, where the iron version crosses the 46 put's 0.08.

Read it as one position with a short straddle at its center, not as four legs,
and the morning after expiration stops being a surprise. The rest of the
[income series](/blog/income) keeps the same chain.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
