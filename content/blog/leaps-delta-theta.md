---
title: "LEAPS Greeks: how delta, theta and vega behave on a long-dated option"
slug: leaps-delta-theta
excerpt: A LEAPS has the same Greeks as any option, but with two years left they sit in different places. Delta moves slowly, daily theta is small, and vega is far larger than on a short-dated option.
search_title: "LEAPS Delta, Theta and Vega: How They Change Over Time"
meta_description: "LEAPS delta, theta and vega on one two-year call: delta glides, a deep call's decay peaks then falls, and a year later all three have moved."
author: Osama Safwat Maghawry
category: investing
series_order: 48
tags: leaps, delta, theta, vega, greeks
---

**LEAPS delta and theta** describe how a long-dated option reacts to the stock and to the passage of time, and they sit in different places than the same numbers on a short-dated option. With two years left, delta changes slowly as the stock moves, daily time decay is small, and sensitivity to implied volatility, which is vega, is far larger than on a short-dated option. All three then drift as the contract ages, so the numbers on the day of purchase are a snapshot, not a description of the position.

This is the eighth and last post in the [options for investors](/blog/investing) series. It builds on [LEAPS options explained](/blog/leaps-options-explained) and [LEAPS position sizing](/blog/leaps-position-sizing), and it uses the same hypothetical: XYZ at $50.00, no dividend, implied volatility 30%, a 4% interest rate, and a 24-month call struck at 40 that costs 15.58. All figures were worked out with a standard pricing model. They are teaching figures, not quotes.

## Key takeaways

- **Delta glides.** With two years left, a call's delta changes gently as the stock moves. With one month left it can flip from almost 1 to almost 0 across about $10.
- **Daily decay starts small and speeds up.** The same at-the-money call loses about $0.78 a day with 24 months left and about $3.10 a day with one month left.
- **Vega is the big one.** A LEAPS gains or loses far more per point of implied volatility than a short-dated option does.
- **Deep in-the-money calls behave differently.** Their daily decay peaks and then falls as the call turns into mostly intrinsic value.
- **None of it is fixed.** Delta, theta and vega all change with the stock price, the time left and implied volatility.

## How does LEAPS delta change as the stock moves?

[Delta](/blog/option-delta-explained) is how much an option's price moves for a $1 move in the stock. The 24-month 40 call has a delta of 0.82, so for a small move it behaves like 82 shares per contract. What makes a LEAPS different is how that number changes as XYZ moves. Here is the same strike with 24 months left beside one month left:

| XYZ at | Delta, 24 months left | Delta, 1 month left |
| --- | --- | --- |
| 60 | 0.91 | 1.00 |
| 50 | 0.82 | 1.00 |
| 45 | 0.75 | 0.93 |
| 40 | 0.66 | 0.53 |
| 35 | 0.53 | 0.07 |

![Grouped bars show the delta of a hypothetical 40 call at five XYZ prices: with 24 months left it glides from 0.91 at 60 down to 0.53 at 35, while with one month left it stays near 1.00 above 50 and then collapses to 0.07 at 35.](/assets/blog/leaps-delta-24-month-vs-1-month.svg)

The one-month call is nearly a share of stock until XYZ approaches the strike, then loses almost all of that over about $10. The 24-month call gives up delta steadily, because with two years left a fall to 35 still leaves a real chance of ending above 40. The rate at which delta changes is [gamma](/blog/gamma-options-meaning), and here it is about 0.012 per dollar, a small number.

Two consequences follow:

- **The share-equivalent size is steadier.** A LEAPS held through a modest move keeps roughly the same exposure, which is why it can stand in for stock, as in [stock replacement](/blog/stock-replacement-strategy). The 0.82 on day one is still 0.75 after a fall of $5.
- **It still shrinks on the way down.** Steadier is not constant. The [previous post](/blog/leaps-position-sizing) showed the exposure falling from about $4,100 to about $1,855 per contract as XYZ fell to 35.

## When does theta speed up on a LEAPS?

[Theta](/blog/theta-decay-explained) is how much value an option loses per day with everything else unchanged. Dollar figures here are per contract, so 100 shares, and per calendar day. With the stock flat, here is how much two calls lose a day as expiration gets closer:

| Time left | 50 call, per day | 40 call, per day |
| --- | --- | --- |
| 24 months | $0.78 | $0.66 |
| 12 months | $1.05 | $0.81 |
| 6 months | $1.40 | $0.89 |
| 3 months | $1.89 | $0.84 |
| 1 month | $3.10 | $0.52 |

![Grouped bars show daily time decay per contract for a hypothetical 50 call and 40 call: the 50 call rises from 0.78 dollars a day with 24 months left to 3.10 with one month left, while the 40 call peaks near 0.89 at six months and then falls to 0.52.](/assets/blog/leaps-theta-by-time-left.svg)

The 50 call, which is at the money, tells the familiar story. It loses about four times as much per day in its last month as in its first. The daily figure is small enough on day one to be easy to dismiss, and that is the trap: the daily rate is not the whole cost. Over the first year the 40 call loses about $264 of value with the stock flat, and the dollar loss in the second year is slightly larger, though for a deep call the daily rate peaks and then falls, as below.

The 40 call is the more interesting case. It is deep in the money, so most of its value is intrinsic value that time does not take. Its daily decay rises to about $0.89 at around five to six months and then falls, because the volatility part of its time value is running out.

What remains near expiry is mostly the model's interest-rate term: a deep in-the-money call is partly a way of not paying the strike yet, and that financing value bleeds away as expiration approaches. That is a modelling detail and the realised result depends on the actual quotes, but it is why a deep call's theta is not simply the at-the-money pattern scaled down.

## Why does vega matter more on a LEAPS?

Vega is how much an option's value changes for a one-point change in [implied volatility](/blog/implied-volatility-options-explained). Because a LEAPS has a long time for volatility to matter, it carries far more of it:

| Call | Vega, per contract per point |
| --- | --- |
| 24-month 50 call | about $26.00 |
| 24-month 40 call | about $18.40 |
| 1-month 50 call | about $5.70 |
| 1-month 40 call | about $0.20 |

Moving implied volatility five points either way on the 24-month 40 call, the value changes as follows:

| Implied volatility | 24-month 40 call | 1-month 40 call |
| --- | --- | --- |
| 25% | 14.71 | 10.13 |
| 30% | 15.58 | 10.14 |
| 35% | 16.53 | 10.15 |

On the 24-month call, five points of volatility move the price by 0.87 down and 0.95 up, or about $87 to $95 per contract. On the one-month call it moves by 0.01. This is the part of a LEAPS that a share does not have: with the stock unchanged, a drop in implied volatility lowers its value, and a rise lifts it. As the contract ages, vega shrinks toward zero, so the exposure is front-loaded.

## How a held LEAPS's Greeks change in a year

The numbers above are for one day. A holder lives through all of them. Take one contract of the 24-month 40 call, hold it for a year with XYZ unchanged, and compare:

| Measure | At purchase (24 months) | A year later (12 months) |
| --- | --- | --- |
| Call value | 15.58 | 12.94 |
| Delta | 0.82 | 0.85 |
| Theta, per day | $0.66 | $0.81 |
| Vega, per point | $18.40 | $11.80 |

With the stock flat, the call lost $264 of value, delta crept up because the call moved further into the money relative to the time left, daily decay rose a little, and vega fell by a third. Nothing about the stock changed and the position is a different instrument. That is the practical meaning of the Greeks being a snapshot.

Two further things move them:

- **The stock price.** If XYZ falls to 40 with 24 months left, the call is worth 8.11, delta is 0.66 and vega rises to about $20.80, because the call is now at the money and an at-the-money option is the most sensitive to volatility.
- **Implied volatility itself.** A rise or fall changes the value directly through vega, and it also changes delta and theta by a smaller amount.

## Frequently asked questions

- **What is a good delta for a LEAPS?** The contract does not say. Delta describes how much stock the position behaves like, and which level suits anyone depends on what they want the position to do. The mechanics here are descriptive only.
- **Why is theta per day so small on a LEAPS?** Because the time value is spread over a long period. The total decay is not small, and it speeds up as expiration nears.
- **Does a LEAPS lose value every day?** With the stock and volatility unchanged, yes, by the amount of its theta. A rising stock can more than offset it.
- **Why does vega matter more than theta here?** On a two-year call, a few points of implied volatility move the price by more than weeks of time decay do.
- **Do the Greeks add across contracts?** Yes. Five contracts have five times the delta, theta and vega of one, as [position sizing](/blog/leaps-position-sizing) showed for exposure.

## The bottom line

On the hypothetical XYZ, the 24-month 40 call had a delta of 0.82 that moved gently with the stock, daily decay of about $0.66, and a vega of about $18.40 per volatility point. A year later the same call, with the stock unchanged, had a delta of 0.85, decay of about $0.81 and a vega of $11.80. Delta and theta describe the stock and the clock, vega describes volatility, and none of them stays put. This is the last post in the [options for investors](/blog/investing) series.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
