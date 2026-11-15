---
title: "Capital at risk in an options portfolio: the peak, not the sum"
search_title: "Capital at Risk in an Options Portfolio: Peak vs Sum"
slug: capital-at-risk-options-portfolio
excerpt: A book's capital at risk is the most max loss it held open at the same moment, and adding up every position's max loss counts collateral that was released and reused.
meta_description: "Capital at risk in an options portfolio is the most max loss held open at once, not the sum of every trade's. One hypothetical book, worked three ways."
author: Osama Safwat Maghawry
category: measuring
series_order: 61
tags: capital at risk, options portfolio risk, max loss, collateral, return on risk
---

**Capital at risk** in an options portfolio is the most max loss the account held open at the same moment. For one defined-risk position it is that position's max loss: on a credit spread, (width - credit) × 100 × contracts. For a book of positions that open and close on different days, it is the highest point of the running total, the **peak concurrent** figure, and not the sum of every position's max loss.

The difference matters because the same collateral gets used more than once. A spread that closes on day 29 releases what it held, and the spread opened on day 30 can use the same dollars. Adding both max losses together counts those dollars twice.

This post continues the [measuring](/blog/measuring) series after [what a closed-position record has to contain](/blog/options-trade-record-realized-pl), and builds on [return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital), which sets one position's max loss as its denominator. Here the question moves from one position to a whole book.

Key Takeaways:

- **One position's capital at risk is its max loss.** On a vertical credit spread that is width less credit, times 100, times contracts.
- **A book's capital at risk is a peak.** It is the largest running total of max losses open at the same time.
- **The sum overstates it.** Positions that never overlapped did not hold their collateral together.
- **The largest single position understates it.** It ignores what was open beside it.

## What is capital at risk in an options portfolio?

For a single position the answer is settled by its structure. A [put credit spread](/blog/put-credit-spread-explained) can lose at most the distance between its strikes, less the credit taken in, and the [credit spread max loss post](/blog/credit-spread-max-loss) shows where that plateau comes from. Under a standard margin agreement the account holds roughly that amount against the spread for as long as it is open, which is why the [buying power requirement](/blog/options-buying-power-requirement) on a vertical tracks its max loss so closely.

A portfolio has no plateau of its own. Its positions arrive and leave on different dates, so the amount at risk changes every time one opens or closes. The figure that describes what the account actually had to carry is the highest level that running total reached, which is a statement about one moment, read off a timeline.

Two other numbers are easy to mistake for it. The largest single max loss ignores everything held beside it, and the sum of all max losses treats every position as if it had been open on the same day. Only the peak describes the account; the other two describe a list of trades.

## Adding up every max loss counts the same collateral twice

The worked example below is hypothetical, before fees, and only there to show the arithmetic. One account opens five put credit spreads on five different stocks, one contract each, over 70 days. Every spread takes in a 1.00 credit, so each max loss is its width less one dollar, times 100.

| Spread | Strikes | Max loss | Opened | Closed |
| --- | --- | --- | --- | --- |
| A | 50/45 | $400 | Day 1 | Day 29 |
| B | 40/36 | $300 | Day 8 | Day 22 |
| C | 30/27 | $200 | Day 15 | Day 44 |
| D | 60/55 | $400 | Day 30 | Day 59 |
| E | 80/76 | $300 | Day 46 | Day 70 |

Added together, the five max losses come to $1,600. The account never held anything like that.

Walk the timeline instead. A alone holds $400 for the first week. B joins on day 8 for $700, and C on day 15 for $900. B closes on day 22 and the total falls to $600; A closes on day 29 and it falls to $200. D opens the next day and takes it back to $600, C closes on day 44, E opens on day 46 for $700, and D's close on day 59 leaves E's $300 until day 70.

![In one hypothetical book of five put credit spreads, the max loss open at once peaks at $900 between day 15 and day 22, while the five max losses add up to $1,600.](/assets/blog/capital-at-risk-peak-vs-sum.svg)

The peak is $900, held from day 15 to day 22 while A, B and C were all open. Nothing else reached it: the next-highest level was $700, on days 8 to 14 and again from day 46 to day 58. The $700 gap between the peak and the sum is collateral that A, B and C released and D and E reused.

The sum is not useless. It says how much max loss passed through the account over the period, which is a measure of activity. It is not a measure of what was exposed, and it grows with every trade even when the account never carries more than one position.

## Which denominator a book is measured against changes its result

The three figures from the example sit on one scale below, and the spread between them is the point.

![The same hypothetical book sized three ways: $400 for the largest single max loss, $900 for the most held at once, and $1,600 for the sum of all five.](/assets/blog/capital-at-risk-three-denominators.svg)

Set against a hypothetical $10,000 account, the three read very differently:

- **Largest single, $400.** Four percent of the account. True of spread A, and silent about B and C sitting beside it.
- **Peak at once, $900.** Nine percent. The most this account ever had exposed, on the days it had it.
- **Sum of all five, $1,600.** Sixteen percent. A level of exposure that never existed on any day.

These are shares of an account, not results. They matter most when they become the denominator of a result. Whatever the five spreads realized in total, dividing it by $1,600 gives a little over half of what dividing it by $900 gives, because 900 / 1,600 = 0.5625. The trades are the same; the measurement has quietly decided they used capital they never needed.

The error runs the other way with the largest single position. Divide the same total by $400 and the book appears to have done its work on a quarter of the capital the sum suggests, while for a week it actually carried more than twice that.

None of the three says how likely any loss was. A peak of $900 in spreads far from their short strikes and a peak of $900 in spreads already through them are the same number with very different meanings, which is why [managing multiple positions](/blog/managing-multiple-option-positions) sorts a book by cushion and days left rather than by size alone.

## What the peak figure leaves out

The peak is only as good as the max losses and dates that feed it. Several things change the figure without changing the trades:

- **Cash-secured puts.** A short put with no long leg can lose its strike less the credit, so its max loss is far larger than a spread's. The collateral a broker holds against it may be the full strike, which is larger still.
- **Iron condors.** Two credit spreads on one stock in one expiration can lose on one side only, so the max loss is the wider wing's width less the whole credit. Counting both wings, as the [iron condor post](/blog/iron-condor-explained) explains, overstates the book.
- **Rolls.** A roll is a close and an open, usually sent as one ticket. The old position's max loss leaves and the new one's arrives on the same day, and the new one can be larger.
- **Assignment.** A short leg assigned early turns part of a spread into shares. While the long leg is still held the loss stays capped, but the shares usually tie up far more buying power than the spread did, and if the long leg is sold or expires the cap goes with it. A figure built from max losses alone sees none of that.
- **Same-day handoffs.** A record that keeps dates but not times cannot tell whether a close came before or after an open on the same day.

That last one is a convention question rather than an error, and any figure has to choose. Counting the open before the close treats a same-day handoff as overlap, which can only push the peak up. Counting the close first can push it down, and on a busy day it can show collateral freed before the position needing it existed.

DeltaMint's Analysis page shows this figure for closed trades. The Return on risk card divides the profit on closed trades by peak capital at risk and prints the peak beside it. The peak is a sweep through the closed trades the page is measuring, the same rows as Trade History narrowed by the page's date range and strategy tab: each row adds its max loss on its open date and removes it on its close date. Positions still open are not in it.

A spread counts at (width - credit) × 100 × contracts, a short option with no long leg at strike less credit, and a long option at what was paid for it. An iron condor is recorded as its two spreads, so both sides count. When a close and an open fall on the same date, the open is counted first. Both choices make the peak err high rather than low.

## Frequently asked questions

- **Is capital at risk the same as buying power used?** Close on a vertical spread in a margin account, not in general. A cash-secured put can hold more collateral than its max loss.
- **Why not use account equity as the denominator?** Equity describes the account, not the positions. [Return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital) shows how the choice of denominator changes the same result.
- **Does a higher peak mean more risk was taken?** More exposure was held at once. How likely a loss was is a separate question the peak does not answer.

## The sum of a book's max losses measures activity, not risk

In the worked example, five spreads with $1,600 of max loss between them never had more than $900 open at once, and the largest of them alone was $400. The figure that describes the account is the $900, read from the timeline on the days it happened. Later posts in the [measuring series](/blog/measuring) use that peak where a book's result needs a denominator.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
