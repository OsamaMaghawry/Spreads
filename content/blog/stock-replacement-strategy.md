---
title: "Stock Replacement Strategy: Deep Calls vs 100 Shares"
slug: stock-replacement-strategy
excerpt: A stock replacement strategy holds a deep in-the-money call instead of 100 shares, which changes what is paid up front, how closely the position follows the stock and what is given up.
meta_description: "Stock replacement strategy on one hypothetical stock: a deep in-the-money call beside 100 shares, the cash each takes, how it tracks, what it gives up."
search_title: "Stock Replacement Strategy: Deep ITM Call vs 100 Shares"
author: Osama Safwat Maghawry
category: investing
series_order: 42
tags: stock replacement, deep in the money calls, leaps, delta, call options
---

A **stock replacement strategy** holds a long-dated, deep in-the-money call option in place of 100 shares of the same stock. The call is meant to move with the shares for a fraction of the outlay, and the fraction left over stays in the account as cash. Nothing about it is free: the call has an expiration, it costs time value, and it follows the stock more loosely than a share does.

This is the second post in the [options for investors](/blog/investing) series. It builds on the contract priced in [LEAPS options explained](/blog/leaps-options-explained), and keeps that post's hypothetical: XYZ at $50.00, no dividend, implied volatility 30%, a 4% short-term rate, and a two-year 40 call at 15.58. These are teaching figures from a pricing model, not quotes.

**Key takeaways**

- **The call replaces the shares' direction, not the shares.** A deep call moves most of a dollar for each dollar the stock moves. It does not pay dividends, carry a vote, or last indefinitely.
- **Part of the saving is time value.** Of the 15.58 paid, 10.00 is intrinsic value the stock already supplies, and 5.58 is time value that decays to nothing by expiration.
- **The tracking is loose and uneven.** The call's delta falls as the stock falls, so it follows the shares least when the shares are losing.
- **The loss is capped at the premium, and the premium is lost in full when the stock ends at or below the strike.** A capped loss is not a small loss.

## What is a stock replacement strategy? One deep call in place of 100 shares

"Deep in the money" means the strike sits well below the stock price, so most of the option's value is [intrinsic value](/blog/intrinsic-vs-extrinsic-value-options) rather than time value. With XYZ at $50.00, the 40 call is $10.00 in the money. The shares and the call then respond to the stock in similar ways, which is the whole idea.

What the holder gives up is spelled out by the contract. A call is a right to buy 100 shares at the strike until expiration, and nothing more. Until it is exercised, the holder owns no shares.

Here is the same stake each way:

| | 100 shares | One 24-month 40 call |
| --- | --- | --- |
| Paid today | $5,000 | $1,558 |
| Left in the account | $0 | $3,442 |
| What it is worth if XYZ is unchanged today | $5,000 | $1,558 |
| What it can lose, at most | $5,000 | $1,558 |
| Price sensitivity today | 100 shares | about 82 shares |

The last row is [delta](/blog/option-delta-explained): at 0.82, a $1.00 move in XYZ moves the call by about $0.82, against $1.00 for a share. So the call carries roughly 82 shares' worth of price sensitivity for $1,558 against $5,000.

## Deep in-the-money call vs buying 100 shares: the saving is cash, and part of it is time value

![Two bars on one dollar scale: 100 hypothetical XYZ shares cost 5,000, while one 24-month 40 call costs 1,558, made of 1,000 intrinsic value and 558 time value, leaving 3,442 in cash.](/assets/blog/stock-replacement-capital-split.svg)

The picture separates three amounts that the word "cheaper" runs together. The first is the intrinsic 1,000, which is what the stock has already moved above the strike and which behaves like owned value while the stock holds its level. The second is the time value of 558, which is what the market charges for the right to wait. It is [spent by the clock](/blog/theta-decay-explained), and held to expiration with the stock flat, all of it goes to zero.

The third is the 3,442 left over. It is not profit and not part of the call. It is the account's money, in cash or somewhere else, and whatever it earns or loses is a separate result. A fair comparison counts it, because $1,558 and $5,000 are not the same amount of capital.

## How closely does a deep in-the-money call track the stock?

Delta is a snapshot, and it moves. Hold the 40 call with one year left and look at what it carries at six stock prices:

![Six bars show the shares' worth of price sensitivity a hypothetical 40 call with one year left carries at XYZ prices of 60, 55, 50, 45, 40 and 35: 95, 91, 85, 75, 61 and 44, against 100 for shares.](/assets/blog/stock-replacement-delta-by-price.svg)

Three consequences follow from the bars. A rising stock lifts the tracking toward 100: at 60 the call carries about 95 shares' worth, so it moves almost like the shares. A falling stock lowers it: at 40, where the strike sits, the call carries about 61, and at 35 only 44. The position then loses less per dollar than the shares do, which also means it has stopped being a stand-in for them.

Time moves the number too. The same call at 50 carried about 82 shares' worth with two years left and about 85 with one year left, because a deep in-the-money delta drifts toward 100 as expiration nears. A delta describes one moment, not how the position will behave, and a change in [implied volatility](/blog/implied-volatility-options-explained) would shift every bar.

## Do call options get dividends? What the shareholder keeps and the call holder does not

The call is a smaller bet on the same direction, and the contract strips out several things shares carry. The list is short but each item matters:

- **Dividends.** A shareholder receives them; a call holder does not. Our hypothetical has no dividend, so the one-year table later on ignores this. If XYZ paid $1.00 a year, 100 shares would receive $100 over the year and the call would receive nothing, although a dividend also lowers what a call is worth to begin with, and can prompt [early exercise](/blog/early-exercise-options) just before the ex-date.
- **Time.** Shares can be held indefinitely. The call ends on its expiration date, and a position meant to last longer needs a replacement call, bought at whatever time value that new contract then carries. That is a [roll](/blog/rolling-options-explained), and it has its own cost.
- **A floor of zero, reached sooner.** The shares lose $5,000 only if XYZ goes to zero. The call loses its $1,558 if XYZ closes at or below 40 on expiration day.


## What happens a year later, and when the call expires

Stay with the hypothetical. A year passes, the call has twelve months left, and XYZ is at one of six prices. The cash that was never spent is held flat and left out, so each column shows only the change in the position itself. The call values come from the same pricing model and the same 30% implied volatility.

| XYZ today | 100 shares, change | 40 call value | One call, change |
| --- | --- | --- | --- |
| 60 | +$1,000 | 22.00 | +$642 |
| 55 | +$500 | 17.34 | +$176 |
| 50 | $0 | 12.94 | -$264 |
| 45 | -$500 | 8.92 | -$666 |
| 40 | -$1,000 | 5.50 | -$1,008 |
| 35 | -$1,500 | 2.87 | -$1,271 |

Read it row by row:

- **At 50 the stock has not moved and the call has lost $264.** The call's value fell from 15.58 to 12.94. Its $10.00 of intrinsic value is intact, and the time value shrank from 5.58 to 2.94 as the clock ran.
- **At 60 the call gained $642 against $1,000 on the shares.** The call is worth 22.00, which is 20.00 of intrinsic value plus 2.00 of time value, and 22.00 less the 15.58 paid is 6.42.
- **At 40 the call and the shares lost almost the same.** The call lost $1,008 and the shares $1,000, even though the call cost less than a third as much. The call loses less than the shares only somewhere below 40, as at 35.
- **The cash is untouched in every row.** The $3,442 stays $3,442 at any of these prices, so the call's worst case is the $1,558 premium, not $5,000.

Then the expiration. If XYZ ended the second year at 40, the call would expire with no intrinsic value and the whole $1,558 would be lost, while the shares would show a $1,000 loss and still be owned. Replacing the expired call is a new purchase at that day's price, with a new helping of time value. These are mechanics, not forecasts.

## Frequently asked questions

- **Is stock replacement the same as LEAPS?** Not exactly. LEAPS describes how long the option lasts. Stock replacement describes a use of it: a deep in-the-money call, usually with a year or more left, held where shares might otherwise sit. The contract is explained in [LEAPS options explained](/blog/leaps-options-explained).
- **What happens at expiration?** An in-the-money call is normally exercised automatically, which buys 100 shares at the strike and needs the cash to settle them, $4,000 here. A holder who does not want the shares typically sells the call before expiration or instructs the broker not to exercise. See [what happens at options expiration](/blog/what-happens-options-expiration).
- **How are the gains taxed?** The holding period and the way the position ends both matter, and the rules differ by jurisdiction. A tax professional can answer for a specific case.

## The bottom line

A deep in-the-money call can stand in for shares in a narrow sense: it moves most of a dollar for each dollar the stock moves, for a smaller outlay. On the example here, 100 shares cost $5,000 and one 24-month 40 call cost $1,558, with $3,442 left over. A year later with the stock unchanged, the call had lost $264 and the shares nothing, because the call's time value kept running out. Its price sensitivity ran from 95 shares' worth at 60 down to 44 at 35. It gives up dividends, a vote, and any date beyond its expiration.

For a neighbouring structure, see the [poor man's covered call](/blog/poor-mans-covered-call), which adds a short call against this same long one.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
