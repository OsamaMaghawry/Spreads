---
title: Return on risk vs return on capital
slug: return-on-risk-vs-return-on-capital
excerpt: Premium collected tells you the size of the credit and nothing about what was posted behind it.
meta_description: Why credit collected is the wrong way to rank defined-risk spreads, what return on risk measures, and how the same credit reads on a $1 and a $5 wing.
author: DeltaMint
---

Sorting a screen by premium is an argument people have had a thousand times, and
it usually stays theoretical. It stops being theoretical when there are twenty
spreads open at once and the question is which of them is doing the most work
for the collateral it is holding down. At that point the ranking is not a
preference. It is the only way to read the book.

Credit collected answers a smaller question than it appears to. It is a dollar
figure attached to a fill. It says what arrived, not what was posted behind it,
and on defined-risk structures those two numbers move independently.

## The denominator is the whole disagreement

Three ratios get used interchangeably and are not the same thing.

**Premium collected** has no denominator at all. It is the credit, full stop.
Ranking by it is ranking by the numerator of a fraction whose bottom half nobody
looked at.

**Return on capital** divides the credit by what the position ties up — the
buying power reduction your brokerage account actually applies. That is a real
number and it matters for planning, but it is a number your broker computes
under your margin agreement, and it changes when the agreement does. The same
cash-secured put reads one way in a cash account, where the full strike is
parked, and another way under portfolio margin. Nothing about the position
changed. The denominator did.

**Return on risk** divides the credit by the most the structure can lose. For a
vertical credit spread that is the distance between the strikes, times 100,
minus the credit received. It is fixed at the moment of the fill and it does not
move again for the life of the trade. No margin treatment alters it, no broker
policy revises it, and it is the number that describes what happens if the
underlying goes fully against the short strike and stays there.

That last property is why return on risk is worth building a habit around. It is
the one denominator that is a property of the trade rather than a property of
the account it was placed in.

## The same dollar of credit, two ways

Take a hypothetical put spread, purely to show the arithmetic — no view about
the underlying, no suggestion the trade is worth doing, and no claim about what
it would have made.

Suppose $0.35 of credit comes in on a $1-wide spread. One contract, so $35
received. The most the structure can lose is the $1 width times 100, less the
credit: $65. Roughly two dollars at risk for every dollar of credit.

Now the same $0.35 of credit on a $5-wide spread. Still $35 received. The most
the structure can lose is now $500 less the credit: $465. Roughly thirteen
dollars at risk for every dollar of credit.

The screen sorted by premium puts these two rows in exactly the same place. They
are the same trade to a sort on credit and about seven times apart on what they
put behind that credit. A wide spread taken for a thin credit is a position that
looks identical to a tight one until the day it does not, and the day it does
not is the day the number that mattered was the width.

There is a mirror image of this that a premium sort is equally blind to. Two
positions with the same max loss but different credits are genuinely different
propositions, and a credit sort ranks them correctly by accident. It gets the
comparison right only when the denominators happen to match, which on a book
running several widths and several underlyings is almost never.

## After the fill, the ratio changes shape

Entry return on risk is a screening number, and it stops being interesting the
moment the order fills. Both halves of the fraction have a different meaning
afterwards.

The denominator does not move. Max loss was set at entry and stays there —
that is the useful thing about defined risk, and it is why the number is worth
holding onto.

The numerator does move. What is still collectible is the remaining credit, not
the original one: the difference between the credit received and what it would
cost to close the spread right now. A spread that took in $35 and can be bought
back for $5 has $5 of the original credit still on the table, against a max loss
that is still $65. That is a different ratio from the one on the screen, and it
is the one that describes the position as it currently stands rather than as it
was sold.

Across a book, that distinction decides which positions are still earning their
collateral and which are holding down max loss for a few dollars of remaining
credit. Neither question is answerable from a list of premiums.

## What this looks like in DeltaMint

Candidates are ranked by return on risk rather than credit, and the max loss is
shown next to it so the ratio can be checked rather than trusted. After a fill,
each grouped position carries its max loss as a share of the account, with
warnings at 10, 25 and 50 percent — because the failure mode with a book of
defined-risk trades is rarely one position going wrong. It is a dozen small max
losses that were each fine and never got added up.

None of that is a judgement about which spread to place. The filters are yours;
the screen lists what matches them and shows the arithmetic underneath. What the
software will not do is let a wide, thin structure hide behind a credit that
looks the same as everyone else's.

## The honest limit of the metric

Return on risk says nothing about how likely the loss is. A structure with an
attractive ratio can carry that ratio precisely because the market is pricing a
real chance of the short strike being breached, and the ratio will not tell you
that. Delta, distance to the strike, days to expiry and whether an earnings date
falls before expiration are separate questions and have to be asked separately.

What return on risk does is make two positions comparable at all. That is a
smaller claim than "rank by this and do well", and it is the true one.

This post is educational and is not investment advice.
