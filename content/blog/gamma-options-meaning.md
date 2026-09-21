---
title: "Option gamma explained: what it measures and when it matters"
slug: gamma-options-meaning
excerpt: Gamma is the estimated change in an option's delta for a $1 move in the stock — the number that says how fast delta's own estimate goes stale.
meta_description: Gamma measures how fast an option's delta changes for a $1 stock move. Why it peaks at the money, grows near expiration, and when it's worth watching.
author: DeltaMint
published_at: 2026-09-20T10:00:00+00:00
category: foundations
series_order: 9
tags: gamma, option greeks, delta, moneyness, foundations
---

**Gamma** is the estimated change in an option's delta for a $1 change in the
price of the underlying stock. A call showing a delta of 0.50 and a gamma of
0.07 is expected to show a delta near 0.57 if the stock rises a dollar, with
everything else held still.

It sits on the same chain row as delta and [theta](/blog/theta-decay-explained),
and it answers a question those two leave open: delta is only an estimate for
a small move, and gamma is the figure that says how fast that estimate stops
being accurate as the stock keeps moving.

Gamma is shown next to delta and theta on most platforms, and looked at far
less often. It still shapes both of them, which is why a short overview of it
belongs in this series, even though gamma is not something you can buy on its
own.

Most of what follows is a description of where gamma is large and where it
is small, because that is the useful content of the number. It is not a
trading signal, and nothing here should be read as one.

## Key takeaways

- Gamma estimates the change in an option's delta for a $1 move in the stock — how fast delta itself drifts.
- Gamma is largest for strikes near the money and smaller for strikes far in or out of the money.
- Gamma grows as expiration approaches, for a strike sitting near the stock price.
- Unlike delta, gamma does not flip sign between calls and puts — it splits owned from sold instead.
- A long option carries positive gamma; a short option carries negative gamma, which is the mechanism behind the phrase "gamma risk."

## What does gamma measure in options?

Gamma measures delta's own sensitivity — it is the rate of change of one
estimate, expressed as a second estimate. The [delta
post](/blog/option-delta-explained) described delta as local: accurate for
the next small move, stale by the end of a large one. Gamma is the number
that says how quickly it goes stale.

A delta of 0.50 with a gamma of 0.07 is a different position, going forward,
than a delta of 0.50 with a gamma of 0.02. Both describe the same $1 estimate
today. Only the first one is expected to look meaningfully different after
the stock has actually moved.

- **It is model output, not a rule.** Gamma comes from the same pricing model that produces delta and theta, computed from the same live inputs.
- **It is quoted per share, like delta.** A gamma of 0.07 means delta is expected to rise by about 0.07 for a $1 rise in the stock, per share.
- **It does not price the position on its own.** It tells you how delta moves, and delta is what converts the next dollar of stock movement into money — one step removed.

Nothing about gamma is exotic. It is the same idea as noticing that a car's
speed changes at some rate — gamma is that rate, applied to delta instead of
speed.

That is also why gamma is sometimes called a second-order figure and delta a
first-order one. Delta describes how the premium responds to the stock; gamma
describes how delta responds to the stock. Each step removes the number one
layer further from the price on the screen, and each step is smaller and less
often quoted than the one before it.

## Why is gamma highest at the money?

Take the hypothetical 50-strike call from the [delta
post](/blog/option-delta-explained), 30 days to expiration, at the same three
stock prices.

![A hypothetical 50-strike call's gamma is about 0.05 with the stock at 44, rises to about 0.07 at 50, and falls back to about 0.04 at 56.](/assets/blog/gamma-across-moneyness.svg)

| Stock price | The strike is | Delta | Gamma |
| --- | --- | --- | --- |
| $44 | Far out of the money | 0.15 | 0.05 |
| $50 | At the money | 0.50 | 0.07 |
| $56 | Deep in the money | 0.85 | 0.04 |

Read the pattern against delta's own curve. Far out of the money, delta is low
and the premium barely responds to a $1 move — but delta itself still has real
room to climb, which is why the $44 row's gamma is not far below the
at-the-money row's. Deep in the money, delta sits near one and has almost
nowhere left to go, so gamma falls to its smallest reading there instead. The
middle row is where delta is doing the most turning per dollar, which is
exactly what the larger gamma number describes.

- **Far out of the money.** The premium barely responds to a $1 move, though delta itself still has room to climb — gamma stays meaningful here, just smaller than at the money.
- **At the money.** Delta sits near the middle of its range, and gamma peaks — this is where a $1 move reshapes the estimate the most.
- **Deep in the money.** Delta is already near one, with little room left to rise — gamma falls to its smallest reading of the three.

## Why does gamma increase as expiration approaches?

For a strike sitting at the money, gamma does not stay level as the calendar
runs down. It grows, the same way [theta accelerates](/blog/theta-decay-explained)
for the same strikes — the two are different views of the same shrinking
window of time.

Hold the stock at the $50 strike and change only the days remaining:

![A hypothetical at-the-money call's gamma grows from about 0.05 with 60 days left to about 0.14 with 7 days left, each bar longer than the last.](/assets/blog/gamma-by-dte.svg)

| Days to expiration | Gamma (at the money) |
| --- | --- |
| 60 | 0.05 |
| 30 | 0.07 |
| 14 | 0.10 |
| 7 | 0.14 |

With months left, an at-the-money strike still has room to drift in or out of
the money without its delta needing to move far to reflect that. With a week
left, the same strike is close to a binary outcome — finish above 50 or
below it — and delta has to travel most of its full range to keep describing
that, which is why the rate of change is largest right there.

Compare that to a strike sitting well away from the stock. The less time is
left, the less likely that strike is to reach the money at all, so its gamma
falls away into expiration rather than climbing the way the at-the-money row
does. The acceleration in the table above is a property of strikes near the
stock price, not of every strike on the chain at once.

## Do calls and puts have the same gamma?

Yes, and this is where gamma behaves differently from delta. A call's delta
is positive and a put's is negative, but a call and a put at the same strike
and expiration carry close to the same gamma, and it is positive for both.

What splits gamma instead of call versus put is owned versus sold, which
mirrors the split [theta](/blog/theta-decay-explained) makes on the same two
sides.

| Position | The contract's gamma | Position gamma |
| --- | --- | --- |
| Long call | Positive | Positive |
| Long put | Positive | Positive |
| Short call | Positive | Negative |
| Short put | Positive | Negative |

Read the last column: owning either kind of option means delta moves in the
position's favor as the stock moves, most sharply near the strike. Selling
either kind flips that — delta moves against the position instead, which is
the mechanism traders mean by "short gamma" or "negative gamma."

## Example: the same $1 move, two different delta swings

Take the at-the-money call from the table above at two of those points — 60
days left and 7 days left — and estimate what one $1 rise in the stock does
to delta at each.

| Days to expiration | Delta before the move | Estimated delta after a $1 rise |
| --- | --- | --- |
| 60 | 0.53 | 0.58 |
| 7 | 0.51 | 0.65 |

Both rows start a little above 0.50 — an at-the-money call's delta always
does, and slightly more so the more time is left — because both strikes sit
at the money before the stock moves. The difference is what the identical $1
move does next. With 60
days left, delta nudges up by about the gamma shown for that row, 0.05. With
7 days left, the same $1 move pushes delta up by about 0.14 — nearly three
times as much, from an identical starting point.

Nothing about the stock's actual behavior differed between the two rows. The
whole difference is how much runway is left, which is what the earlier table
of gamma against days to expiration was describing in the first place.

## When does gamma actually matter?

Mostly to people who are re-hedging a position against small stock moves, or
holding a short option close to expiration. For anyone else, delta and theta
carry most of the useful information and gamma is background.

- **It matters for a short option near expiration.** A negative-gamma position's delta can swing quickly as the stock crosses the strike in the final days, which is part of why a short leg close to the money in its last week behaves less predictably than the same leg did a month earlier.
- **It matters less for a defined-risk spread.** A vertical holds one long leg against the short one, and the long leg's own positive gamma offsets part of the short leg's negative gamma, so the position's net gamma is smaller in magnitude than the short leg's alone — the narrower the spread, the more of it cancels, though rarely all of it.
- **It matters less for a position held well before expiration.** Far from expiration, gamma is small everywhere on the chain, so delta's estimate does not go stale quickly regardless of moneyness.
- **It is not a number to trade on its own.** Gamma describes how an existing position's exposure will shift; it is not a signal about which direction a stock is headed.

None of that is a reason to act on any particular position. It is a reason to
read gamma as a description of how sensitive delta itself is, rather than as
a fourth thing that moves the premium the way delta, theta and [implied
volatility](/blog/implied-volatility-options-explained) each do on their own.

A trader who never looks at gamma is not missing a hidden cost the way
ignoring the [bid-ask spread](/blog/options-bid-ask-spread) would be. Delta
and theta already say what a position is worth and how it decays; gamma only
explains why those two numbers themselves are about to start moving faster
or slower than they have been.

## Frequently asked questions

- **Is gamma quoted per share or per contract?** Per share, like delta and the premium. Multiply by 100 for a standard contract: a gamma of 0.07 means one contract picks up about 7 net deltas for each $1 the stock rises.
- **Why is my short option's gamma showing as negative on some platforms?** Some chains display the contract's own gamma, always positive; others display it from the position you hold, which flips sign once you are short. Check which one you are reading, the same distinction the [theta post](/blog/theta-decay-explained) describes for that figure.
- **Does gamma stay near its highest value all the way to expiration?** Only for strikes sitting close to the stock price. A strike that finishes well away from the money never reaches the large figures the at-the-money row shows, however little time is left.
- **Can gamma be negative for a long option?** No. A held call or put always carries positive gamma; the sign only flips for a sold position.

## The bottom line

Gamma is the estimated change in an option's delta for a $1 move in the
stock, and it is largest for strikes at the money with little time left —
exactly where delta is turning the fastest. It does not split calls from
puts the way delta does; it splits owned from sold, with a long position
carrying positive gamma and a short one carrying negative gamma.

It closes out the [foundations series](/blog/foundations)'s run through the
sensitivities that sit on a chain row, after [delta](/blog/option-delta-explained),
[theta](/blog/theta-decay-explained) and the volatility input that
[vega](/blog/implied-volatility-options-explained) prices. What happens in
the account itself [when a short option is
assigned](/blog/option-assignment-what-happens) is next.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
