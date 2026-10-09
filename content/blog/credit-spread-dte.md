---
title: "DTE for credit spreads: what changes with time left"
slug: credit-spread-dte
excerpt: The days left on a credit spread decide how much premium it holds, how fast that premium drains, and how hard a move in the stock hits it. Each of those moves in a different direction.
meta_description: "Days to expiration (DTE) changes a credit spread's credit, its daily decay and its risk near the short strike. One hypothetical put spread, 60 to 7 DTE."
author: DeltaMint
category: income
series_order: 23
tags: credit spread dte, days to expiration, theta decay, gamma, put credit spread
---

Days to expiration, or **DTE**, is the number of calendar days left before an option expires. On a credit spread it sets three things at once: how much premium the spread holds, how fast that premium drains if the stock does nothing, and how sharply the spread reacts once the stock moves toward the short strike. Those three do not rise and fall together, which is why no single DTE is the "best" one in the abstract.

This post continues the [income series](/blog/income) from [strike selection by delta](/blog/credit-spread-delta-strike-selection). Delta placed the short strike relative to the stock. DTE is the other dial, and it changes what the same strikes are. It uses one hypothetical spread and prices it at six points in its life. It describes what time does to a spread and does not say which expiration anyone should use.

## Key takeaways

- The premium a spread holds shrinks as expiration nears. On the example below, the same 46/44 put spread is worth about $57 with 60 days left and about $7 with 7 days left, with the stock unchanged.
- The decay per day goes the other way in dollars: it grows from about $0.41 a day to about $1.88 a day. The spread loses more per day from a smaller base, so the share drained each day rises steeply.
- The maximum loss is the width less the credit, so a shorter expiration, paying less, leaves a larger maximum loss for the same strikes.
- With the stock at the short strike, the spread's delta is roughly 0.11 at 60 days and roughly 0.29 at 7 days. Time left works as a brake on how the spread reacts to each dollar of movement.

## DTE decides how much premium a spread holds

An option's price is intrinsic value plus [extrinsic value](/blog/intrinsic-vs-extrinsic-value-options), and extrinsic value is mostly a function of the time left and the expected movement in that time. A longer expiration gives the stock more room to land somewhere unexpected, so the market charges more for both legs. A credit spread sells the nearer strike and buys the farther one, so it holds the difference.

The example is the hypothetical XYZ from the earlier posts. XYZ trades at $50, and the spread is the 46/44 put credit spread, so the short leg is the 46 put and the long leg is the 44 put, $2 wide.

Prices come from a Black-Scholes fit at 40% implied volatility, a 365-day year, no interest rate and no dividend, so every figure is a model's estimate, not a quote. Marks are rounded to the dollar and daily decay to the cent. "Mark" below is the spread's net price, the short put less the long put, each valued at the midpoint of its bid and ask. A real order fills at the bid and ask, and the [put credit spread post](/blog/put-credit-spread-explained) shows how far that sits from the mark.

The maximum loss is the width times 100 less the credit, as in the [max loss post](/blog/credit-spread-max-loss). A 46/44 opened at the mark would carry a maximum loss of about $143 with 60 days left, $150 with 45, $161 with 30, $170 with 21, $180 with 14 and $193 with 7. The strikes and the $200 width never changed; only the credit offsetting them did.

## A spread's mark falls faster per day as expiration nears

Hold the stock still at $50 and move only the calendar. Each row is the same spread on a different day of its life.

| Days left | Mark (stock at $50) | Mark falls in one more day | Share of the mark lost |
| --- | --- | --- | --- |
| 60 | $57 | $0.41 | 0.7% |
| 45 | $50 | $0.58 | 1.2% |
| 30 | $39 | $0.90 | 2.3% |
| 21 | $30 | $1.26 | 4.2% |
| 14 | $20 | $1.69 | 8.6% |
| 7 | $7 | $1.88 | 28% |

The [theta post](/blog/theta-decay-explained) described the shape, and this is that shape applied to a spread. A seller of the spread gains from a decline in the mark, so each figure in that column is the fall from one calendar day, all else equal. Nothing in the table says the stock will cooperate.

![The same hypothetical 46/44 put credit spread with the stock flat at 50 has a mark of $57 with 60 days left, $50 with 45, $39 with 30, $20 with 14 and $7 with 7.](/assets/blog/credit-spread-dte-decay.svg)

Read the table in two directions, because both readings are true:

- **Earlier in the life, the spread decays slowly.** At 60 days it loses less than 1% of its mark in a day, though even so a flat month takes it from $57 to $39.
- **Later, it decays fast, but there is little left.** At 7 days the daily dollar figure is the highest in the table, and the whole mark is only $7, so the premium left to decay is small.

About half the fall comes in the late, fast stretch: from 60 days, the mark falls about $27 over the first 39 days and $30 over the last 21. But the next table shows that the last stretch is also where the spread reacts most sharply to the stock. That is the logic behind a rule like "close early", and the table does not say whether it is worth following, only where the money and the reaction are.

## The same fall in the stock costs more as expiration nears

Decay is the pleasant half. The other half is what happens when the stock does something. Move XYZ down $4, from $50 to the 46 short strike, and re-price the same spread at each DTE.

| Days left | Mark at $50 | Mark at $46 | Rise in the mark | Spread delta at $46 |
| --- | --- | --- | --- | --- |
| 60 | $57 | $96 | $39 | 0.11 |
| 45 | $50 | $93 | $43 | 0.12 |
| 30 | $39 | $89 | $50 | 0.15 |
| 21 | $30 | $86 | $56 | 0.18 |
| 14 | $20 | $81 | $61 | 0.21 |
| 7 | $7 | $72 | $65 | 0.29 |

A rise in the mark is a loss to the seller who sold at the earlier mark. The fall is the same $4 each time and the loss is larger the less time is left, because with 60 days left the market still prices a wide range of outcomes and the short leg is far from settled, while with 7 days left the short leg has little time to recover and the spread's value is nearly all about where the stock ends.

![The same $4 fall to the short strike raises the mark of the hypothetical 46/44 put credit spread by $39 with 60 days left, $43 with 45, $50 with 30, $61 with 14 and $65 with 7.](/assets/blog/credit-spread-dte-stock-at-strike.svg)

The right-hand column is the [net delta](/blog/credit-spread-delta-strike-selection) of the spread with the stock sitting at the short strike, as the delta post calculated it. At 60 days a further $1 fall costs about $11. At 7 days it costs about $29. The 7-day spread also starts with less delta at $50 than the 60-day one (0.05 against 0.08) and ends at 0.29 at $46, against 0.11 for the 60-day spread. That speed of change in delta as the stock moves is [gamma](/blog/gamma-options-meaning), and it is concentrated in short expirations and strikes close to the stock.

The two tables together are the whole trade-off. A short expiration pays out from a thin credit and punishes the stock arriving at the strike. A long one pays slowly from a thick credit and reacts less sharply to the same arrival. Neither is described as better here, because it depends on what the person running the position is willing to watch.

## What a longer or shorter DTE trades on a credit spread

The searches that bring a reader here usually ask for a number, and the pages that answer them agree on a range and then add a rule for when to close. This page does not give a number, because the tables above are a fair summary of what the number is buying:

- **More days buys a larger credit and a gentler reaction to the stock.** The cost is slow decay and capital held for longer in a position that has to be watched for longer.
- **Fewer days buys faster decay and a quick finish.** The cost is a small credit, a larger maximum loss for the same strikes and a spread that reacts sharply the moment the stock reaches the short strike.

A trader who closes a position before expiration changes which rows apply, because the days actually held are the only ones that count. A spread opened at 45 days and closed at 21 never meets the 7-day row at all, and a spread opened at 14 spends its whole life in the fast-decay, high-reaction part of the table. That is a question about the exit, which the managing posts take up.

Two cautions apply to every figure here. The numbers come from one model at one volatility, and a real chain moves strikes unevenly, so the comparison between rows is the point and the cents are not. And the stock was assumed to sit still or fall exactly $4, which no real stock is obliged to do.

## Frequently asked questions

- **What does DTE mean on a credit spread?** The number of calendar days until the spread's options expire. Both legs share one expiration, so a single number describes the position.
- **Does a credit spread lose value faster with more or fewer days left?** Fewer, with the stock above the short strike. On the example, the spread lost about $0.41 a day at 60 days and about $1.88 a day at 7, all else equal.
- **Why is a short-DTE credit spread riskier near the strike?** Because its gamma is higher: its delta climbs faster as the stock falls. The example spread's delta went from about 0.05 at $50 to about 0.29 at the short strike with 7 days left, against 0.08 to 0.11 with 60.
- **Is 45 DTE the best for credit spreads?** Many guides quote a range around 30 to 45 days. This post only shows what changes across the range, and the figures are one hypothetical model, not a test of any rule.

## The bottom line

DTE changes a credit spread in three ways that point in different directions. The premium shrinks as the days go, from about $57 to $7 on the example. The dollars lost per day rise, from $0.41 to $1.88. And a $4 fall to the short strike costs more the nearer expiration is, $39 at 60 days against $65 at 7.

So the question to ask of any DTE is what it trades, and not whether it is correct. The [income series](/blog/income) continues from the calendar to the events that sit on it, starting with [earnings](/blog/selling-options-before-earnings), one of the dates a spread's expiration can be chosen around.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
