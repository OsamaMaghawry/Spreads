---
title: "Managing multiple option positions: which of twenty spreads needs you first"
slug: managing-multiple-option-positions
excerpt: With twenty open spreads, the question is not what each one is worth but which one will change next. Two numbers, days left and the cushion to the short strike, sort a book faster than any Greek.
search_title: "Managing Multiple Option Positions: What to Check First"
meta_description: Managing multiple option positions: why days left and the cushion to the short strike, not max loss, show which of twenty spreads needs you first.
author: Osama Safwat Maghawry
category: managing
series_order: 49
tags: portfolio, spreads, expiration, risk, assignment
---

**Managing multiple option positions** means keeping a book of open trades in order when there are more of them than you can hold in your head. At twenty spreads the hard part is no longer understanding any one of them. It is deciding which one to look at first, because the positions do not change at the same speed, and the ones that change fastest are not always the ones with the biggest numbers on the screen.

It is part of the [after the fill](/blog/managing) series and builds on [a spread is one position, not two legs](/blog/options-journal-splits-spreads-into-legs), [credit spread max loss](/blog/credit-spread-max-loss) and [credit spread days to expiry](/blog/credit-spread-dte). Everything below uses one invented book. The stocks, strikes and credits are hypothetical, chosen to show the mechanics, and none of it describes a result.

## Key takeaways

- **Two numbers sort a book.** Days left to expiration and the cushion between the stock and the short strike tell you how soon, and how easily, a position can change.
- **Size is a separate question.** A position can be small and urgent or large and quiet. Keep the two lists apart.
- **A book is not twenty independent bets.** Stocks that move together turn several small risks into one large one.
- **Expiration week is where the work bunches up.** With a few days left, a stock near the short strike moves the spread's price far more per dollar than it did a month earlier, and there is less time to act or for the stock to come back.
- **Nothing here is a rule.** These are ways to read a book, not instructions for what to do with it.

## Why does a book need ordering at all?

A single spread can be watched. You know its strikes, its credit and its maximum loss, and you notice when the stock moves. Twenty spreads cannot be watched that way, and the failure is predictable: attention goes to whichever position is loudest, the biggest dollar swing or the one you opened last, rather than to the one closest to a decision.

The numbers that feel important are often the wrong sort key:

- **Profit and loss today.** It shows where a position stands, not how fast it can move. A spread showing a small loss with two days left is a different object from one showing the same loss with five weeks left.
- **Credit received.** It is history. Once the order fills, the credit is a fixed amount in the account and says nothing about what the position will do next.
- **Maximum loss.** It matters for sizing and for [buying power](/blog/options-buying-power-requirement), but it is the same on day one as on the last day. It does not tell you when.

What does move, and what does not stay the same from one day to the next, is how close the stock is to the short strike and how much time is left to do anything about it. Those two numbers are the sort key.

## Which open spread needs attention first?

**Days left** is how long before the position has to settle, expire or be dealt with. It controls how fast the price of the spread can swing. As [the days-to-expiry post](/blog/credit-spread-dte) showed, the same fall to the short strike costs more near expiration than far from it, because there is less time for the stock to come back.

**Cushion** is the distance between the stock price and the short strike, expressed as a share of the stock so that a $50 stock and a $200 stock can sit in the same list. For a put spread it is how far the stock can fall before the short put is at the money. For a call spread it is how far the stock can rise. A negative cushion means the short strike is already in the money.

Here is the hypothetical book, six spreads shown out of twenty:

| Spread | Type | Days left | Stock | Short strike | Cushion | Max loss |
| --- | --- | --- | --- | --- | --- | --- |
| A | 50/45 put | 6 | 51.20 | 50 | 2.3% | $390 |
| B | 80/75 put | 34 | 90.00 | 80 | 11.1% | $400 |
| C | 120/115 put | 12 | 124.00 | 120 | 3.2% | $375 |
| D | 30/32 call | 9 | 28.40 | 30 | 5.6% | $155 |
| E | 200/195 put | 27 | 214.00 | 200 | 6.5% | $360 |
| F | 60/55 put | 4 | 58.50 | 60 | -2.6% | $370 |

![A scatter of twenty hypothetical spreads by days left and cushion shows six labelled positions spread across the chart, with F, A and C in the shaded lower left corner where few days and a thin cushion meet.](/assets/blog/book-triage-days-and-cushion.svg)

Read the picture from the lower left. Spread F, with four days left and a short put already in the money, is the closest to a decision. A and C follow, each with a thin cushion and under two weeks left. Spread B has the largest cushion and the most time, so nothing about it is urgent, even though its $400 maximum loss is the biggest of the six.

## What happens when correlated positions fall together?

Twenty positions look like diversification, and sometimes they are. They stop being so when the stocks share a driver, such as the same sector, the same index or the same earnings week. Then one move is applied to many positions at once.

Take the six spreads again and suppose each stock falls 5%, then ask what each spread is worth if it were held to its own expiration at that price:

| Spread | Stock after a 5% fall | Spread at expiration | Result against the credit kept |
| --- | --- | --- | --- |
| A | 48.64 | 1.36 | loses $26 |
| B | 85.50 | 0 | keeps $100 |
| C | 117.80 | 2.20 | loses $95 |
| D | 26.98 | 0 | keeps $45 |
| E | 203.30 | 0 | keeps $140 |
| F | 55.575 | 4.425 | loses $312.50 |

The credits assumed are 1.10 for A, 1.00 for B, 1.25 for C, 0.45 for D, 1.40 for E and 1.30 for F. The table is a snapshot at expiration, not a forecast, and it ignores that the six expire on different days.

Three things stand out:

- **The losses sit where the sort pointed.** F, A and C, the three put spreads with the thinnest cushions and under two weeks left, are the three that lose.
- **The same move does different things.** D is a call spread, so a fall helps it. A book with both put and call spreads is partly hedged against a broad move, which is a fact about its structure, not a plan.
- **Maximum loss was never the measure.** F loses $312.50 here against a $370 maximum, B loses nothing against a $400 maximum. How close the position already was to trouble mattered more.

## What does expiration week do to the list?

The same spread changes position on the chart as the calendar moves, even when the stock does not. A put spread with a 6% cushion and five weeks left sits toward the right. With the stock unchanged and one week left it has slid well to the left. The cushion is still 6%, and at that distance the spread now reacts less to small moves, because the short strike is less likely to be reached.

What changed is the clock: if the stock does fall to the short strike, the spread's price now swings sharply for each dollar, and there is little time left for it to come back. Nothing happened to the stock, and the position still moved up the list.

That is why a book needs re-sorting rather than sorting once:

- **Time moves everything left.** Every position shifts toward the left edge every day, the whole book at once, without any trade.
- **The cluster arrives together.** If several spreads were opened in the same week to the same expiration, they reach the left edge on the same expiration day. That is the afternoon where twenty positions become eight that need a look.
- **Settlement has its own steps.** A short leg that is in the money near expiration can be assigned, and the two legs of a spread settle on their own, as described in [what happens at options expiration](/blog/what-happens-options-expiration) and [what actually happens when an option is assigned](/blog/option-assignment-what-happens). Spread F is the case where those pages become relevant, because it has four days left and a short put already in the money.

## Can a spreadsheet keep twenty spreads sorted?

Everything above is a sort by two numbers, and it can be done in a spreadsheet. What gets harder at twenty positions is doing it every day, and doing it on positions the tool has first put back together correctly. If a tool shows one spread as two legs, as [the earlier post on broker feeds](/blog/options-journal-splits-spreads-into-legs) described, the cushion and the maximum loss are computed on the wrong object and the sort goes wrong before it starts.

Related: [options position alerts](/blog/options-position-alerts), on which changes to a spread are worth a notification.

## Frequently asked questions

- **How many positions can one person manage?** There is no honest number. It depends on how different the positions are from one another and how much time you have each day. What changes with count is the cost of looking, not the mechanics of any one trade.
- **Should I look at the biggest position first?** Size tells you how much a position can lose. Days left and cushion tell you how soon it might. They answer different questions, and a sensible reading keeps both.
- **Does a larger cushion mean a position is safe?** No. It means the short strike is further away today. A gap on earnings or other news can cross it overnight, which is why [earnings and short premium](/blog/selling-options-before-earnings) is its own subject.
- **Are twenty spreads on different stocks diversified?** Only to the extent the stocks move differently. Several in the same sector, or all opened into the same earnings season, share more risk than the count suggests.
- **Does the order of attention change for call spreads?** The sort is the same, but the direction is reversed: the cushion is how far the stock can rise rather than fall.

## The bottom line

A book of twenty spreads is read in two passes. The first is by days left and cushion to the short strike, which shows what can change soonest. The second is by size, which shows how much each position can cost. On the hypothetical book, spread F, with four days left and its short put in the money, came first on the first pass even though B had the largest maximum loss, and the three losses in the 5% fall were the three at the top of the first list. A later post in the [after the fill](/blog/managing) series goes into what assignment costs and when it stops being theoretical.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
