---
title: "Annualized return on options: why a small sample cannot carry it"
search_title: "Annualized Return on Options: Why a Few Short Trades Mislead"
slug: annualized-return-options-small-sample
excerpt: An annualized return scales a trade's return to a 365-day year, and on a short hold or a handful of trades that scaling turns a modest result into a very large figure that the next trade can reverse.
meta_description: "How to annualize an options return, simple or compounded, and why a few short trades cannot carry it: in one hypothetical record, the fifth flips the sign."
author: Osama Safwat Maghawry
category: measuring
series_order: 64
tags: annualized return, return on risk, sample size, credit spread, measuring results
---

**Annualized return** on an options trade is the return earned over the days the trade was open, scaled to a 365-day year so that trades of different lengths can be set side by side. The simple version multiplies the period return by 365 and divides by the days held; the compounded version assumes each period's result is reinvested and repeated for a year.

The scaling is honest arithmetic. What it cannot do is turn a few short trades into a rate a year of trading would resemble, because the multiplier applies to whatever happened in those few days, luck included.

This post continues the [measuring](/blog/measuring) series after [premium capture on credit spreads](/blog/credit-spread-premium-capture), and uses the same hypothetical spread.

Key Takeaways:

- **Annualizing multiplies by 365 over the days held.** A 9-day hold is multiplied by about 40.
- **Short holds produce very large figures.** The multiplier does the work.
- **Compounding stretches it further.** It assumes each result is reinvested.
- **One trade can reverse the sign.** On five trades, the fifth can flip it.
- **An annualized figure is a rate, not a forecast.** It compares trades; it does not say what a year produces.

## Annualizing an options return multiplies it by 365 over the days held

The calculation needs three numbers from a closed trade: what it made or lost, the capital it was measured against, and how many days it was open.

    period return = result / capital
    simple annualized = period return x 365 / days held
    compounded annualized = (1 + period return) ^ (365 / days held) - 1

The capital is a choice, and it changes the answer. On a credit spread, return on risk divides by the max loss; return on capital divides by the collateral or margin the broker held. [Return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital) sets out why the two differ. Whichever denominator is used, annualizing then multiplies the result by the same factor, 365 over the days held.

![The simple annualizing multiplier is 365 divided by the days held, so a 5-day hold is multiplied by 73, a 9-day hold by about 40.6, a 30-day hold by about 12.2, a 90-day hold by about 4.1 and a full year by 1.](/assets/blog/annualized-multiplier-by-days.svg)

The table shows what a hypothetical 1% period return becomes at each length of hold:

| Days held | Simple multiplier | 1% becomes, simple | 1% becomes, compounded |
| --- | --- | --- | --- |
| 5 | 73 | 73% | about 107% |
| 9 | about 40.6 | about 40.6% | about 49.7% |
| 30 | about 12.2 | about 12.2% | about 12.9% |
| 90 | about 4.1 | about 4.1% | about 4.1% |
| 365 | 1 | 1% | 1% |

At 90 days the two methods barely differ. At 5 days the compounded figure is about half as large again as the simple one, because it raises 1.01 to the 73rd power rather than multiplying 1% by 73.

## One nine-day spread annualizes into a figure no year resembles

The worked example below is hypothetical, before fees, and is there only to show the arithmetic. It is the spread from the premium capture post: sell the XYZ 50 put and buy the 45 put, one contract, for a 1.00 credit. That is $100 received against a [max loss](/blog/credit-spread-max-loss) of $400.

On one path the spread is bought back at 0.50 on day 9. It kept $50, measured against the $400 at risk, a period return on risk of 12.5% over 9 days.

Simple annualizing multiplies that 12.5% by 365 / 9, about 40.6, and prints about 507%. Compounding raises 1.125 to the power 365 / 9 and subtracts 1, and prints about 11,800%.

Nothing about the trade changed between the first line and the third. The $50 is the same $50. The difference is an assumption: that the same 12.5% could be earned roughly 40 more times in a row, and in the compounded case on an account that grows by an eighth each time.

The same spread on a falling path shows the method running the other way. Bought back at 2.00 on day 15, it lost $100, a period return of -25% on the $400 at risk. Simple annualizing turns that into about -608%, a figure below -100%: more than the whole $400 it is measured against. Compounding cannot go below -100%, and reads about -99.9%.

Two versions of one hypothetical trade, then, annualize to about +507% and about -608%. Neither describes anything a year of trading was seen to do. Both describe nine or fifteen days, multiplied.

## On a few trades, the next one can reverse the annualized figure

Annualizing a record of trades works the same way, with the record's total in place of one trade's result. The capital is the most held at once, which [peak capital at risk](/blog/capital-at-risk-options-portfolio) explains, and the days are the window the record covers, here from the first trade's opening to the last trade's close.

Take a hypothetical record of five 50/45 put credit spreads, each sold for 1.00 and held one at a time, so the peak capital at risk is a single spread's $400. The first four are each bought back at 0.50 on their ninth day, back to back. The fifth is bought back on its ninth day at 5.00, the full width, with XYZ far below 45, and loses $400.

![On a hypothetical record of five credit spreads held one at a time, the simple annualized return on risk reads +507% after each of the first four $50 gains and -406% after the fifth trade's $400 loss.](/assets/blog/annualized-after-each-trade.svg)

After four trades the record shows $200 on $400 over 36 days: 50%, which annualizes to about +507%, the same as one trade, because four identical trades over four times the days scale identically. After the fifth, it shows -$200 over 45 days: -50%, which annualizes to about -406%. A single trade moved the headline by more than 900 percentage points.

This is the same arithmetic that set the break-even win rate in [why an options win rate is misleading](/blog/options-win-rate-misleading): on a defined-risk short premium position, one loss can be several winners' size. Four trades are too few to say how often the fifth kind turns up, and the annualized figure shows only the trades so far.

## An annualized figure assumes what a small sample cannot show

Every annualized number carries assumptions that a long record can test and a short one cannot:

- **That the period repeats.** Annualizing a 9-day hold assumes about 40 more like it, each starting the day the last one closed.
- **That the sample is representative.** Four trades on one stock in one month say little about other months.
- **That losses arrive in proportion.** A record with no losing trade yet has not shown its loss rate, only that none has happened.
- **That results are final.** A record that still holds an open position, or assigned shares, is part mark and part result; [what a closed-position record has to contain](/blog/options-trade-record-realized-pl) sets out the difference.
- **That the denominator is stable.** A deposit or withdrawal partway through a short window changes the capital the return divides by.

Each assumption gets easier to check as the record grows longer and holds more trades, and the multiplier shrinks as the window widens. A year of history is multiplied by 1. A week is multiplied by 52, along with every gain or loss inside it.

None of this makes annualizing wrong. Set side by side, a 9-day trade and a 45-day trade need a common rate before their returns can be compared, and annualizing provides one. The trouble starts when the rate is read as a result, the thing a record of trades achieved, rather than as a unit for comparing them.

## Frequently asked questions

- **How do you annualize a return on an options trade?** Divide the result by the capital, then multiply by 365 and divide by the days held. The [annualized return calculator](/tools/annualized-return-calculator) works through the simple and compounded versions.
- **Why does a short options trade show such a high annualized return?** Because the multiplier is 365 over the days held. A 5-day hold is multiplied by 73 before anything else is considered.
- **How many trades are enough to annualize?** No count makes a figure reliable; more trades over a longer window make it less sensitive to any one of them.
- **Is an annualized return what the account will earn in a year?** No. It is a rate for comparing trades of different lengths, not a projection.

## Annualized return compares rates; it does not forecast a year

In the worked example, one hypothetical nine-day spread that kept $50 of its credit annualized to about +507% simple and about 11,800% compounded. A five-trade record moved from about +507% to about -406% on its fifth trade. The arithmetic was right each time. The sample was too small to carry it.

DeltaMint's Analysis page leaves its two annualized cards, simple and compounded return on capital, blank until the record holds at least 30 closed trades over at least 90 days, a display floor and not a mark of reliability, and says so under the dash. It also leaves them blank while the total includes an unrealized mark on open positions.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
