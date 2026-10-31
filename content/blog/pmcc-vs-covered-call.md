---
title: "Poor Man's Covered Call vs Covered Call: Same Short Call, Two Foundations"
slug: pmcc-vs-covered-call
excerpt: A covered call and a poor man's covered call sell the same call against different things: 100 shares, or a long-dated call that costs a fraction as much and behaves differently.
meta_description: "Poor man's covered call vs covered call on one hypothetical stock: cash tied up, the payoff when the short call expires, and why only one has a flat top."
search_title: "Poor Man's Covered Call vs Covered Call: Cost and Payoff"
author: Osama Safwat Maghawry
category: investing
series_order: 43
tags: poor man's covered call, covered call, leaps, stock replacement, short call
---

A **[covered call](/blog/covered-call-explained)** sells a call against 100 shares you own. A **poor man's covered call** (PMCC) sells the same call against a long-dated, deep in-the-money call instead of the shares. The short call is identical in both. What sits underneath it is not, and almost every difference between the two structures comes from that one substitution.

This is the third post in the [options for investors](/blog/investing) series. It puts the shares from [stock replacement](/blog/stock-replacement-strategy) and the call from [LEAPS options explained](/blog/leaps-options-explained) under the same short call, on the same hypothetical: XYZ at $50.00, no dividend, implied volatility 30%, a 4% rate, and a two-year 40 call at 15.58. These are teaching figures from a pricing model, not quotes.

**Key takeaways**

- **The short call is the same; the foundation is not.** Shares are owned outright. A long call is a right that expires, carries time value, and tracks the stock at less than a dollar per dollar.
- **The call pair ties up far less.** In the example, $1,525 against $4,967. The difference is cash that is still in the account and still exposed to whatever it is invested in.
- **It loses less on the way down and gains less on the way up.** The long call's delta is below 1, so the pair is a smaller bet on the stock in both directions.
- **There is no flat top.** A covered call stops at its cap. The pair, priced here, drifts down above the short strike.

## What is the difference between a poor man's covered call and a covered call?

The ownership is the difference. A covered call holder owns shares, so the short call is "covered" in the full sense: if it is assigned, the shares are delivered and nothing else is needed. A poor man's covered call holder owns a [call option](/blog/call-vs-put-option-explained), which is a right to buy shares at a price until a date. The short call is covered by that right, not by the shares.

The full construction of the poor man's covered call is in [an earlier post](/blog/poor-mans-covered-call). This one compares the two at the same short call, so here is the example:

| | Covered call | Poor man's covered call |
| --- | --- | --- |
| Foundation | 100 XYZ shares at $50.00 | One 24-month 40 call at 15.58 |
| Short leg | One 30-day 55 call at 0.33 | One 30-day 55 call at 0.33 |
| Net cost | $4,967 | $1,525 |
| Left in a $5,000 stake | $33 | $3,475 |
| Foundation's delta | 1.00 | 0.82 |

The 0.33 is a model value for a call that is $5.00 out of the money with 30 days left. The long call's cost is the intrinsic $10.00 plus 5.58 of time value, as in the earlier posts.

## The call pair ties up less, and the difference is not profit

![Two bars on one dollar scale: shares plus a short call tie up 4,967, while a long 40 call plus a short call ties up 1,525, with 3,475 of the same 5,000 left as cash.](/assets/blog/pmcc-vs-covered-call-capital.svg)

The picture shows what the word "cheaper" hides. The 3,475 is not earned by the structure. It is simply not spent. Whatever it does while the position is open, in cash or elsewhere, is a separate result, and a fair comparison counts it on both sides.

The smaller outlay also changes what the same price move means:

- **A dollar of loss is a bigger share of the money committed.** The call pair's worst case is the debit, but that debit is the whole $1,525.
- **The short call is the same size against a smaller base.** The same $33 premium is set against $1,525 in the pair and $4,967 with the shares. This post does not treat that as a rate.
- **Margin treatment is the broker's.** Many brokers hold the long call as the cover for the short call in a margin account and apply different rules in a cash account. The broker's own disclosure decides.

## How do both pay at the short call's expiration?

Fix the moment: the short call's expiration, 30 days on. The shares are then worth the stock price. The long call has about 23 months left and is worth its intrinsic value plus the time value still attached to it, priced at the same 30% implied volatility. The profit and loss below include the $33 premium.

| XYZ at expiration | Covered call | Poor man's covered call | Long call worth |
| --- | --- | --- | --- |
| 60 | +$533 | +$388 | 24.13 |
| 55 | +$533 | +$439 | 19.64 |
| 50 | +$33 | +$14 | 15.39 |
| 45 | -$467 | -$381 | 11.44 |
| 40 | -$967 | -$733 | 7.92 |
| 35 | -$1,467 | -$1,029 | 4.96 |

![Two lines show profit and loss in dollars at the short call's expiration for a hypothetical XYZ from 35 to 65: shares plus a short 55 call run from -1,467 to a flat +533, and the long 40 call plus the short call runs from -1,029 to +439 at 55 and eases to +352 at 65.](/assets/blog/pmcc-vs-covered-call-pnl.svg)

Read the two shapes against each other:

- **Below the entry price the pair loses less.** At 40 it is down $733 against $967, because the long call's delta of 0.65 there is less than the shares' 1.00. That is also the sense in which it is a smaller bet, not a safer one: at 35 it is still down $1,029.
- **At the short strike the pair has kept less.** Both are 5 points up on the stock at 55, but the pair has +$439 against +$533. The long call gained 4.25 against the stock's 5.00, so it captured 85 cents of every dollar on the way.
- **Above the strike the covered call is flat and the pair is not.** The shares' gain and the short call's loss cancel at a $533 profit. The long call gains less than a dollar per dollar while the short call loses a full dollar, so the pair slips from +$439 at 55 to +$388 at 60.

## Why the pair has no flat top: the long call is not the shares

The slope above 55 is the long call's delta, 0.88 at 55 and 0.91 at 60, set against the short call's 1.00. Net, the pair is slightly short the stock once the short call is deep in the money.

The strike gap shows the same thing in one line of arithmetic: the long strike is 40 and the short is 55, a gap of 15.00, while the debit is 15.25. If the short call is assigned and the long call is exercised to deliver the shares, the pair settles for exactly that gap: shares bought at 40 and delivered at 55, 15.00 against the 15.25 paid, a $25 loss at any stock price.

Selling the long call and buying shares to close instead keeps the long call's remaining time value, which is why the priced line above stays positive. The [earlier post](/blog/poor-mans-covered-call)'s rule, that the long strike plus the debit should sit below the short strike, fails here: 40 plus 15.25 is 55.25.

This is where the structure is easiest to misread. The covered call has a ceiling and a floor of zero, which is a shape most holders can say aloud. The pair has a ceiling that leaks, a floor at the debit that applies only if the stock ends at or below 40 at the long call's expiration, and a date. Nothing in the table says that either shape is better; they differ.

## What the investor gives up: time, dividends and the shares themselves

The comparison above is a snapshot. Over a holding period measured in years, the substitution adds three costs the covered call does not have:

- **The long call keeps decaying.** With the stock flat, the 40 call's time value fell from 5.58 to 2.94 in a year in the [stock replacement](/blog/stock-replacement-strategy) example, a drop of 2.64 per share, or $264 per contract. The shares have no equivalent. A short call's premium is the only income in the structure that offsets it.
- **Dividends belong to shareholders.** Our XYZ pays none. A stock that did would pay the covered call holder, and the pair holder would receive nothing, while a dividend would also affect [early exercise](/blog/early-exercise-options) on the short call.
- **The foundation ends.** Shares can be held forever. The long call has an expiration, and holding the structure past it means buying a new long call at that day's price and time value. Rolling costs money; it is the cost of keeping the same exposure.

Assignment is also different. If the short call is [assigned](/blog/option-assignment-what-happens), the covered call holder delivers shares and holds cash, as in [covered calls after assignment](/blog/covered-call-after-assignment). The pair holder is short 100 shares until the long call is exercised, which forfeits its remaining time value, or until shares are bought to close. Those choices have different arithmetic, and the broker's own rules may decide for the holder if the account cannot carry the short shares.

## Frequently asked questions

- **What is the maximum loss on a poor man's covered call?** The net debit, 15.25 per share or $1,525 here, if the stock ends at or below the long call's strike at the long call's expiration. Before then the position can be closed for less or more than that. A dividend owed after an early assignment on the short call is an additional cost that the model does not include.
- **Is a poor man's covered call really a covered call?** Not in the literal sense. It is a call diagonal spread: two calls with different strikes and different expirations. See the [diagonal spread](/blog/diagonal-spread-explained) post.
- **Which one is better for an investor?** The question has no answer from mechanics alone. The two have different costs, different shapes and different things left to manage, and the preceding sections lay out what each is.

## The bottom line

A covered call and a poor man's covered call differ in the thing under the short call. In the example, shares plus a 55 call tied up $4,967 and held a flat $533 above the strike; a 24-month 40 call plus the same short call tied up $1,525, lost less below the strikes, kept less near the cap, and drifted lower above it. It also gave up dividends, time and the permanence of the shares. Every figure on this page is hypothetical and there to show the mechanics.

For the neighbouring structure that holds the long call alone, see [stock replacement](/blog/stock-replacement-strategy). Read next: [selling puts to buy stock](/blog/sell-puts-to-buy-stock). This post is educational and is not investment advice.
