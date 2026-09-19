---
title: "Gamma in options: what it means, and when it matters"
slug: gamma-options-meaning
excerpt: Gamma is the rate at which an option's own delta changes as the stock moves, and it is only large in one narrow band of the chain.
meta_description: Gamma is how fast an option's delta changes as the stock moves. Why it is largest at the money near expiration, and close to nothing everywhere else.
author: DeltaMint
published_at: 2026-09-19T10:00:00+00:00
category: foundations
series_order: 9
tags: gamma, option greeks, delta, expiration, foundations
---

**Gamma** is the estimated change in an option's delta for a $1 change in the
price of the underlying stock. A call showing a delta of 0.45 and a gamma of
0.07 is expected to show a delta near 0.52 once the stock has risen a dollar.

That makes it a sensitivity of a sensitivity, which is the whole reason it
reads as abstract. [Delta](/blog/option-delta-explained) estimates the next
move in the premium; gamma estimates how stale that estimate will be by the
time the move is over.

One property is worth stating before any of the rest. Gamma is small nearly
everywhere on a chain, and large only in a narrow band near the strike in a
contract's final weeks.

## Key takeaways

- Gamma estimates the change in delta for a $1 move in the stock, quoted per share like delta itself.
- The contract's gamma is positive for calls and puts alike. A bought option leaves the position with positive gamma, a sold one with negative.
- Gamma is largest with the stock at the strike and shrinks in both directions as the two move apart.
- An at-the-money strike's gamma grows as expiration nears, so a delta that drifted slowly with two months left can jump with a week left. A strike that stays well out of the money does the opposite: its gamma peaks somewhere in the middle of its life and fades toward nothing.
- Gamma says how fast the other estimate goes stale. It says nothing about direction and nothing about what any stock will do.

## What does gamma measure?

Gamma measures the curvature of the line connecting the stock's price to the
option's. Delta is the slope of that line at one point; gamma is how fast the
slope itself is changing as you move along it.

That matters because delta is only ever a local estimate. The delta post made
the point that a reading taken at the start of a $5 move is stale by the end
of it, and gamma is the number that says by how much.

- **It is quoted per share.** Like delta and the premium, gamma is stated per share and applies to 100 of them on one contract.
- **It is positive for calls and puts alike.** A call's delta climbs toward 1 as the stock rises; a put's climbs toward 0 from −1 on the same move. Both are increases, so the contract's gamma is positive either way.
- **It is itself a snapshot.** Gamma corrects delta, and gamma changes too — with the stock price, with the days remaining and with [implied volatility](/blog/implied-volatility-options-explained).
- **It carries no direction.** A large gamma says delta is about to move a lot. Which way it moves depends on which way the stock goes.

## Why is gamma positive for the buyer and negative for the seller?

The contract carries one sign and the position either inherits it or flips it,
the same pattern [theta](/blog/theta-decay-explained) and vega follow. A bought
option leaves the position with positive gamma; a sold one leaves it negative.

Positive gamma means delta moves toward the direction the stock just went.
Negative gamma means it moves against that direction, so a short position
picks up exposure on the side the stock is moving away from — it gets
shorter into a rally and longer into a selloff.

| Position | The contract's gamma | The position's gamma | What a stock move does to the position's delta |
| --- | --- | --- | --- |
| Long call | Positive | Positive | Grows more positive as the stock rises |
| Long put | Positive | Positive | Grows more negative as the stock falls |
| Short call | Positive | Negative | Grows more negative as the stock rises |
| Short put | Positive | Negative | Grows more positive as the stock falls |

Read the last column by rows. The two long positions gain exposure in the
direction that suits them; the two short positions gain exposure in the
direction that does not.

Neither side of that is free. The premium the buyer paid is what bought the
curvature, and the credit the seller received is what was taken to carry it —
the same trade-off theta describes from the other end.

## Example: one call's delta at four stock prices

Take the hypothetical 50-strike call used through this series, with 30 days
left and the volatility assumption held still. Only the stock price changes.

![Gamma is the steepness of the delta curve: noticeably flatter with the stock at 44 dollars than with the stock at the 50 strike, where it is about half again as steep.](/assets/blog/gamma-is-the-slope-of-delta.svg)

| Stock price | Delta | Change from the row above | Gamma |
| --- | --- | --- | --- |
| $48 | 0.38 | — | 0.07 |
| $49 | 0.45 | +0.07 | 0.07 |
| $50 | 0.52 | +0.07 | 0.07 |
| $51 | 0.59 | +0.07 | 0.07 |

Read the last two columns together. Gamma sits near 0.07 across this band, and
each dollar of stock movement does add about 0.07 to delta — which is exactly
what gamma was estimating in advance.

Now step away from the strike. At $44 the same contract shows a delta near
0.15 and a gamma near 0.05, so the next dollar takes delta to roughly 0.19
rather than the 0.22 a 0.07 gamma would have implied.

The deep side behaves the same way in reverse. At $56 the same contract shows
a delta near 0.85 and a gamma near 0.04, so the dollar after that adds roughly
0.03 — the option already tracks the shares closely, and there is not much
slope left for it to pick up.

Behind those numbers is an S. A call's delta cannot fall below 0 or rise
above 1 (a put's cannot fall below −1 or rise above 0), so the curve has to
flatten at both ends and do all of its climbing in the middle. Gamma is the
steepness of that climb at whatever point the stock currently sits.

## Why does gamma increase near expiration?

Because less time is left for the stock to go anywhere else. With two months
remaining, one dollar barely changes the range of places the stock can finish,
so delta barely reacts; with a week remaining, that same dollar is a much
larger share of what is still possible.

![The same 50-strike call's delta curve is far steeper through the strike with seven days left than with thirty, which is gamma concentrating as expiration nears.](/assets/blog/gamma-by-days-left.svg)

| Days to expiration | Delta at $49 | Delta at $50 | Delta at $51 | Gamma at $50 |
| --- | --- | --- | --- | --- |
| 60 | 0.48 | 0.53 | 0.58 | 0.05 |
| 30 | 0.45 | 0.52 | 0.59 | 0.07 |
| 14 | 0.41 | 0.52 | 0.61 | 0.10 |
| 7 | 0.37 | 0.51 | 0.65 | 0.14 |

Compare the top and bottom rows. The same $2 span of stock price swings delta
by about 0.10 with two months left and by about 0.28 with a week left, on the
identical strike and with every other input unchanged.

Carried to its end point, this is what expiration day is for a strike sitting
at the money. A call's delta finishes at either 1 or 0 (a put's at either −1
or 0), and a contract sitting near the strike has to travel there from
wherever it is, so the last hours are where its curve is steepest of all. A
strike sitting well away from the stock has already finished most of that
travel, or none of it, and its last hours are among the flattest — the same
shape theta traces for an out-of-the-money contract.

Theta sharpens on the same clock for a related reason: an at-the-money
option's remaining extrinsic value and its remaining uncertainty both compress
into the final days. They are different quantities measuring different things,
but they arrive together.

## When does gamma barely matter?

Most of the time, on most positions — and saying that plainly is more useful
than a warning about all of them.

- **Far from the strike.** A strike sitting well away from the stock price carries a small gamma, so its delta drifts rather than jumps.
- **With months left.** Long-dated contracts carry low gamma at every strike; the 60-day row above is the mildest in that table, and a 200-day row would be milder again.
- **On small moves.** Gamma is a correction to an estimate. If the stock moves a few cents, the correction is a few cents' worth of delta, and delta on its own was close enough.
- **As a cash flow.** Nothing is debited or credited for gamma. It describes how another number behaves rather than moving money on its own.

Where it stops being ignorable is the intersection of the first two: a strike
near the stock price, inside the last week or two. There, a position's
share-equivalent exposure can change more across one afternoon's move than it
did over the preceding month.

That is also the point at which several positions stop being separate numbers.
Several short strikes sitting near the money in the same week all pick up
delta on the same move, which is a problem of watching a book rather than a
property of gamma — taken up in the [after the fill](/blog/managing) posts.

## Frequently asked questions

- **Is gamma quoted per share or per contract?** Per share, like delta and the premium. A gamma of 0.07 means delta is estimated to move 0.07 per $1 of stock movement — about 7 shares' worth of exposure gained or lost for each dollar the stock moves.
- **Can gamma be negative?** Not for a single listed option; the contract's own gamma is positive. Negative gamma is a property of a position, and it arrives whenever the option was sold rather than bought.
- **Why does the table read 0.52 at the money rather than 0.50?** Because 0.50 is a rounding convention, not the model's answer. This table and the [delta post](/blog/option-delta-explained)'s are the identical contract at the identical 30 days to expiration — the model returns 0.5229 at that point, which the delta post rounded to the conventional 0.50 the same way it rounded its other two rows to 0.15 and 0.85.
- **What is a gamma squeeze?** A market-structure term for a feedback loop in the shares, when dealers hedging a large book of short calls buy stock as it rises. It borrows the word but describes flows in the underlying, not a figure on a chain row.
- **Does a spread have a gamma?** Yes — the net of its legs. Near the short strike, a credit spread pairs a short leg's negative gamma with a long leg's positive one, so the position's figure is smaller than the short leg's alone; if the stock trades through toward the long strike, the long leg's gamma can exceed the short leg's and flip the net's sign.

## The bottom line

Gamma is delta's own rate of change, and most of reading it is knowing where
it is large: with the stock near the strike, close to expiration, and hardly
anywhere else. Outside that band it is a small correction to a number that was
already an approximation.

It is the fourth of the sensitivities the [foundations
series](/blog/foundations) takes one at a time, after
[delta](/blog/option-delta-explained), [theta](/blog/theta-decay-explained) and
[implied volatility](/blog/implied-volatility-options-explained). What actually
happens in an account when a short option is assigned comes next.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
