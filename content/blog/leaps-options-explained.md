---
title: "LEAPS options explained: what a long-dated option costs and does"
slug: leaps-options-explained
search_title: "LEAPS Options Explained: Cost, Time Decay and Payoff"
excerpt: A LEAPS is an ordinary option with a year or more left, which changes what its price is made of, how fast it decays and what it does next to owning the shares.
meta_description: "LEAPS options explained on one two-year call: what the premium is made of, why decay speeds up late, and how a smaller outlay can lose all of itself."
author: Osama Safwat Maghawry
category: investing
series_order: 41
tags: leaps, long-dated options, time value, call options, theta
---

**LEAPS** (Long-Term Equity Anticipation Securities) are standard exchange-listed options with an expiration a year or more away, listed out to roughly two or three years. A LEAPS is not a different instrument. It is a call or a put, with a [strike and an expiration](/blog/option-strike-price-expiration-premium) like any other, whose long fuse changes three things: what the price is made of, how quickly it loses value, and what it does next to owning the shares.

This is the first post in the [options for investors](/blog/investing) series. The earlier posts priced options that run for weeks. This one prices a two-year call and sets it beside 100 shares of the same stock, using the vocabulary from [what an options contract is](/blog/what-is-an-options-contract).

## Key takeaways

- **Same contract, longer clock.** A LEAPS call gives the right to buy 100 shares at the strike until expiration, exactly as a 30-day call does. Equity options are American-style, so they can be exercised early.
- **The price is bigger because there is more time to pay for.** The longer the option lives, the more time value it carries at the start.
- **Decay is slow early and fast late.** With the stock flat, the last six months take more than twice what the six before them took.
- **Volatility counts for more.** The same change in implied volatility moves a two-year option several times as much as a one-month one.
- **A smaller outlay can lose all of itself.** The premium can be lost in full at a price where the shares still have value.

## What are LEAPS options? An ordinary option with a long fuse

Everything in the [call versus put post](/blog/call-vs-put-option-explained) carries over. The buyer pays a premium and holds a right; the seller takes the premium and holds the obligation. What changes is the length of time the right lasts, and that changes the arithmetic of the price.

All the numbers in this post come from one hypothetical. XYZ trades at $50.00, pays no dividend, and implied volatility is 30%. A short-term interest rate of 4% is assumed, and every price below was worked out from those inputs with a standard pricing model. They are round-number teaching figures, not quotes.

| Contract on XYZ at $50.00 | Time left | Strike | Premium | Intrinsic | Time value |
| --- | --- | --- | --- | --- | --- |
| Short-dated call | 1 month | 50 | 1.81 | 0.00 | 1.81 |
| LEAPS call, at the money | 24 months | 50 | 10.14 | 0.00 | 10.14 |
| LEAPS call, in the money | 24 months | 40 | 15.58 | 10.00 | 5.58 |

The first two rows hold the strike fixed and show the effect of time alone: the same at-the-money call costs 10.14 with two years left against 1.81 with one month left. The third row shows what a different strike does. The 40 call is already $10.00 in the money, so $10.00 of its 15.58 is [intrinsic value](/blog/intrinsic-vs-extrinsic-value-options) and only 5.58 is time value.

One contract of the 40 call costs 15.58 × 100 = **$1,558**. A position that held the same 100 shares would cost 50 × 100 = $5,000. That gap is the reason people talk about long-dated options at all, and it is also the source of most of the misunderstandings, which the rest of the post takes in turn.

## How fast does a LEAPS lose time value?

[Theta](/blog/theta-decay-explained) is the rate at which time value is lost, usually quoted per day, and it is not constant over an option's life. It is gentle with a long time left and steepens as expiration nears. On the numbers below, most of the time value goes in the final months.

Hold XYZ at $50.00 for the whole two years and watch the at-the-money 50 call:

| Time left | Call value | Lost since the row above |
| --- | --- | --- |
| 24 months | 10.14 | n/a |
| 18 months | 8.62 | 1.52 |
| 12 months | 6.88 | 1.74 |
| 6 months | 4.70 | 2.18 |
| At expiration | 0.00 | 4.70 |

The first six months cost 1.52, the next six 1.74, then 2.18, and the final six months take the remaining 4.70. Nothing about the stock changed at any point, so every cent of that is time passing.

![Bars show a hypothetical at-the-money 50 call on XYZ held with the stock flat at 50: worth 10.14 with 24 months left, then 8.62, 6.88, 4.70, 3.23 and 1.81, with the last six months losing 4.70, more than twice the 2.18 lost in the six before.](/assets/blog/leaps-time-value-decay.svg)

Two practical points follow from the shape:

- **The steepest part of the curve comes last.** Of the 10.14 in the at-the-money call, 4.70 is lost in the final six months, after the option is no longer long-dated.
- **A LEAPS held to expiration is a short-dated option for its last stretch.** The slow early decay does not go away so much as get postponed, and the final months have the short-dated option's steepness.

The in-the-money 40 call decays too, just from a smaller base. With the stock flat at 50 for a year, its value falls from 15.58 to 12.94: a loss of 2.64 per share, or **$264**, taken entirely out of its 5.58 of time value, which shrinks to 2.94. The $10.00 of intrinsic value is untouched, because the stock has not moved.

## Delta and volatility matter more with more time

A deep in-the-money LEAPS call responds to the stock the way shares do, with a discount. The 40 call has a [delta](/blog/option-delta-explained) of about 0.82 in this hypothetical: a $1.00 move in XYZ moves the call by roughly $0.82, against $1.00 for a share. That is not the same as owning 100 shares. It is roughly 82 shares' worth of price sensitivity, at the moment of the quote, and the figure changes as the stock and the time left change.

[Implied volatility](/blog/implied-volatility-options-explained) is the other input that scales with time. Raise implied volatility from 30% to 40% with the stock unchanged and the two options move by very different amounts:

- **The 24-month at-the-money call:** 10.14 rises to about 12.73, a gain of roughly 2.59.
- **The one-month at-the-money call:** 1.81 rises to about 2.38, a gain of roughly 0.57.

The effect also runs the other way. A LEAPS bought when implied volatility is high can lose value on a fall in implied volatility alone, with the stock exactly where it was. That exposure is larger in dollars than it would be on a short-dated option, because the long-dated price has more time value for volatility to act on.

Interest rates and dividends enter the price as well, and more strongly with a long expiration. A dividend expected during the life of a call lowers its value and raises the value of a put on the same stock, which is one reason the long-dated quote on a dividend payer does not follow the simple pattern above. This post leaves dividends out on purpose, so the pattern is easy to see.

## How does a LEAPS call compare with owning 100 shares?

Take the 40 call at $1,558 beside 100 shares at $5,000 and ask what each is worth if XYZ is at a given price on the call's expiration date, two years out. At expiration the call is worth its intrinsic value and nothing else.

| XYZ at expiration | 100 shares | One 40 call at $1,558 |
| --- | --- | --- |
| 60 | +$1,000 | +$442 |
| 50 | $0 | -$558 |
| 45 | -$500 | -$1,058 |
| 40 | -$1,000 | -$1,558 |
| 30 | -$2,000 | -$1,558 |

Read down the call column. Above the strike the call moves one for one with the shares, so it earns $100 for each dollar XYZ rises. It starts $558 behind the shares because that is the time value paid and given back, and the break-even sits at 40 + 15.58 = **55.58**, not at the current 50. Below the strike, the call's loss stops at the $1,558 paid, and the shares keep losing.

![Profit and loss at expiration for a hypothetical XYZ 40 call bought at 15.58 against 100 shares bought at 50: the call is flat at a loss of 1,558 below 40, rises one for one above it, trails the shares by 558 and breaks even at 55.58, and below 34.42 loses less than the shares.](/assets/blog/leaps-vs-shares-payoff.svg)

Three things the picture does not say loudly enough:

- **The call can lose everything while the shares do not.** XYZ at 40 is a $1,000 loss on the shares and a $1,558 loss on the call. The call lost more, on a smaller stake.
- **The call only does better in a deep fall.** Below 34.42, the capped loss on the call is smaller than the shares' loss. The shares are still worth something there, and the call is worth nothing.
- **Holding the cash back is a separate decision.** The $3,442 not spent on the call is still the account's money, in cash or something else. Comparing the call's result to the shares' result without counting what the cash did is comparing two different amounts of capital.

These are the mechanics, which are all this post claims. Whether one structure suits a given account depends on things a hypothetical cannot hold: the size of the position, the holder's horizon, taxes, and the cost of getting in and out. The [bid-ask spread](/blog/options-bid-ask-spread) on long-dated contracts can also be wide in dollar terms, since the premium is large and the market may be thin.

A LEAPS can also be used on the other side of a trade, as the long leg in a [poor man's covered call](/blog/poor-mans-covered-call), where it stands in for the shares. That structure adds a short call and its own assignment questions, and has its own post.

Related: [stock replacement strategy](/blog/stock-replacement-strategy), which follows this same 40 call through its first year beside 100 shares.

## Frequently asked questions

- **What does LEAPS stand for?** Long-Term Equity Anticipation Securities. The name describes an expiration a year or more out, not a different kind of contract.
- **Are LEAPS calls or puts?** Either. LEAPS exist as both calls and puts, on stocks and on some ETFs and indexes. Every example above uses a call.
- **Can a LEAPS be exercised early?** On equity options, yes, because they are American-style. As with any option, exercising early gives up the time value left in it, which is why it is uncommon outside dividend cases. See [early exercise](/blog/early-exercise-options).
- **Is a LEAPS a substitute for shares?** It resembles shares in one part of its range and differs in the rest. The 40 call above moved about 82 cents per dollar before expiration and one for one above the strike at expiration, but it expires, it costs time value every day, and its loss is capped at the premium rather than at zero for the stock.
- **How is the premium taxed?** It depends on the holding period, how the position ends, and the holder's jurisdiction. A tax professional can answer it for a specific case.

## The bottom line

A LEAPS is a standard option with a long clock. On the hypothetical here, a two-year 40 call cost $1,558 against $5,000 for the shares, lost $264 of time value in a year with the stock flat, and moved with the stock at about 82 cents on the dollar. Above the strike it trailed the shares by $558, it broke even at 55.58, and below 34.42 it lost less than owning the stock. Time decay is gentle at the start and steep at the end, and a change in implied volatility reaches a long-dated price harder than a short one.

The next posts in the [investing series](/blog/investing) build on this contract. For the decay curve in more detail, see [theta decay explained](/blog/theta-decay-explained).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
