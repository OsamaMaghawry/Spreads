---
title: "Theta decay explained: why an option loses value every day"
slug: theta-decay-explained
excerpt: Theta estimates the value an option loses from one day passing, and the same number that costs a buyer money is what a seller was paid to accept.
meta_description: Theta estimates how much an option's price drops from one day passing. What decay looks like on a long position, a short position, and near expiration.
author: DeltaMint
published_at: 2026-09-13T10:00:00+00:00
category: foundations
series_order: 7
tags: theta, option greeks, time decay, extrinsic value, foundations
---

**Theta** is the estimated change in an option's price from one calendar day
passing, with the stock price and everything else held still. An option
showing a theta of −0.05 is expected to be worth about $0.05 a share less
tomorrow than it is today — $5 on one contract — if nothing else about the
market moves.

It sits on the same chain row as delta and the bid-ask spread, and like them
it is a live number rather than a fixed property of the contract. Theta
itself changes as the days themselves run down, and it does not run down at
a constant pace.

## Key takeaways

- Theta estimates the option's price change from one day passing, quoted per share — about $5 a day on one contract at −0.05.
- A held option's theta is negative: value drains as time passes, all else equal. A sold option flips the sign, so the position gains from the same day.
- Decay is not steady. The same contract loses more per day with a week left than it did with two months left.
- At-the-money options carry the largest theta in dollar terms, because they carry the most extrinsic value to lose.
- Theta is priced in, not free money. The premium a seller received already reflects the decay the market expects to happen.

## What does theta measure?

Theta measures the daily erosion of an option's extrinsic value — the part of
the premium not backed by the gap to the strike, described in the [intrinsic
and extrinsic value](/blog/intrinsic-vs-extrinsic-value-options) post. At
expiration extrinsic value is zero, so between now and then it is being spent
down, and theta is the estimated size of one day's worth of that spending.

"Everything else held still" carries the same weight it does for delta. An
actual trading day moves the stock, and often the market's expectation of
future movement too, so the price change you see mixes theta with several
other things at once rather than showing theta cleanly.

- **It is model output, not a rule.** Theta comes from the same pricing model that produces delta, computed from the same live inputs.
- **It is a snapshot.** The theta shown right now describes tomorrow's expected move, not the whole remaining life of the contract.
- **It only ever removes extrinsic value.** Intrinsic value does not decay; a deep in-the-money option's theta is small because there is little extrinsic value left to lose.

That framing is why theta shows up on every row of a chain rather than only
the far-dated ones. A one-year contract and a one-week contract both carry
extrinsic value to lose, just on very different clocks — theta is the same
concept applied at whatever pace that particular contract's calendar runs.

## Why does theta flip sign between the buyer and the seller?

A held option is always losing extrinsic value as the calendar runs, so its
theta — the contract's own theta — is negative whether it is a call or a put.
That much never changes.

What flips is which side of the trade that decay favors. The buyer paid for
the extrinsic value and watches it shrink, so a long position inherits the
contract's negative theta directly. The seller was paid for the same
extrinsic value and benefits as it shrinks, so a short position carries the
opposite sign: positive.

| Position | The contract's theta | What one day does to the position, all else equal |
| --- | --- | --- |
| Long call | Negative | Loses value |
| Long put | Negative | Loses value |
| Short call | Negative | Gains value |
| Short put | Negative | Gains value |

Read the last column and the pattern is simple: buying an option means time
is working against the position, selling one means time is working for it —
for a call and a put alike, since both lose extrinsic value the same way.

## Why does theta accelerate as expiration nears?

Decay is not a straight line. The same contract loses a small amount per day
with months left and a much larger amount per day in its final week, because
extrinsic value itself shrinks toward zero on a curve rather than a ramp, and
theta is the slope of that curve at a given moment.

Moneyness changes how steep the curve gets. An at-the-money option carries
the most extrinsic value of any strike on the chain at a given expiration, so
it has the most to lose and shows the largest theta in dollar terms. A deep
in-the-money or deep out-of-the-money option carries little extrinsic value
to begin with, so there is correspondingly little left for a day to remove.

The practical read is that decay is not spread evenly across a position's
life. Most of a hypothetical structure's total decay happens in the days
closest to expiration — which is also the stretch where a stock move does
the most damage to the same position, so the two effects intensify together
rather than one buying time against the other.

## Example: the same call's one-day decay at four points before expiration

Take a hypothetical 50-strike call with the stock sitting at the strike, so
it stays at the money the whole way through. Only the days remaining change;
the strike and the stock price do not.

![A hypothetical at-the-money call's estimated one-day decay grows from about 3 dollars with 60 days left to about 14 dollars with 7 days left, accelerating rather than running at a constant pace.](/assets/blog/theta-decay-by-dte.svg)

| Days to expiration | Estimated 1-day decay | Per contract |
| --- | --- | --- |
| 60 | $0.03 a share | $3 |
| 30 | $0.05 a share | $5 |
| 14 | $0.08 a share | $8 |
| 7 | $0.14 a share | $14 |

Compare the two ends. Between 60 and 30 days the daily figure roughly
doubles; between 14 and 7 it does the same, over half the time. That is the
acceleration: theta does not merely grow, it grows faster as expiration
gets closer.

Now hold the last row still and look at both sides of the same contract. On
that day, the buyer of this hypothetical call is marked down about $14 and
the seller who took the other side of the identical fill is marked up about
$14 — one day, one contract, opposite ends of the same number.

![One day of theta on the same hypothetical at-the-money call seven days from expiration: the long position marked down about 14 dollars, the short position marked up about 14 dollars, a mirror image of the same figure.](/assets/blog/theta-long-vs-short.svg)

Nothing about the stock moved in that example. The entire $14 swing on each
side is the calendar alone, which is the property that makes theta different
from every other input on the chain row.

## What makes theta larger or smaller?

Three things move the daily figure, and they interact rather than acting one
at a time.

- **Days to expiration.** Shorter-dated options decay faster per day, as the table above shows; longer-dated options decay slower but for more days.
- **Moneyness.** At-the-money strikes carry the most extrinsic value and the largest theta; deep in- or out-of-the-money strikes carry less of each.
- **Implied volatility.** A higher IV means more extrinsic value is priced into the option to begin with, so there is more of it for theta to remove each day.

An option can also show a larger or smaller theta than a same-dated peer for
no reason connected to time at all — a volatility change alone moves how much
extrinsic value is sitting in the price, and theta is measuring the shrinkage
of whatever is there right now, not a fixed amount set at the trade.

## Is theta decay free money?

No, and the framing is worth being precise about. Theta describes an
estimate under held-still conditions; a trading day never actually holds
everything still. The stock can move against a short position by more than a
day of decay pays, and an implied volatility change can do the same with the
stock unchanged.

The premium a seller collects already reflects what the market expects
theta to do between now and expiration — that expectation is priced into the
fill, not discovered afterward. Decay describes a mechanical process inside
the pricing model; what a trader chooses to do with a position is a separate
question this post is not answering.

The same arithmetic multiplies across a book rather than one line. Someone
holding several short positions at once is watching several of these daily
figures add up at the same time, and a stock move against any single one of
them can erase more than one day's combined decay from the rest in an
afternoon — which is a separate subject from theta itself, taken up in the
[after the fill](/blog/managing) part of this series.

## Frequently asked questions

- **Is theta quoted per share or per contract?** Per share, like the premium and delta. Multiply by 100 for a standard contract: −0.05 is about −$5 a day.
- **Why does my short option's theta show as positive on some platforms?** Some chains display the contract's own theta, always negative; others display it from the position you hold, which flips sign once you are short. Check which one you are reading.
- **Does theta decay happen evenly over a weekend?** Conventions differ by platform on how weekend time is counted, and the daily figure is an estimate either way — treat the exact weekend treatment as a detail to confirm with your own data, not a fixed rule.
- **Can theta be positive for a long option?** Effectively no for a standard long call or put; a held option's own theta is negative because it is always losing extrinsic value as the calendar runs.

## The bottom line

Theta is the estimated price change from one day passing, and it is always
draining extrinsic value from the contract itself — which is why a long
position loses from it and a short position gains, on the identical fill.
The pace is not constant: it grows as expiration nears and is largest for
strikes sitting at the money.

It is the second of the sensitivities the [foundations
series](/blog/foundations) takes one at a time, following [what delta
measures](/blog/option-delta-explained). What implied volatility does to the
same premium comes next.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
