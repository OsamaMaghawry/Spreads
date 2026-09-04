---
title: Return on risk vs return on capital on credit spreads
slug: return-on-risk-vs-return-on-capital
excerpt: Premium collected tells you the size of the credit and nothing about what was posted behind it.
meta_description: Return on capital moves with your margin agreement; return on risk is fixed at the fill. Which one ranks credit spreads, shown on a $1 and a $5 width.
author: DeltaMint
category: measuring
series_order: 59
tags: return on risk, credit spreads, position sizing, max loss, ranking
---

Premium collected, return on capital, return on risk — three ways to rank a
credit spread, used interchangeably and not the same number. The argument over
which to sort by usually stays theoretical. It stops being theoretical when there are twenty
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
cash-secured put reads one way in a cash account, where the full strike — give
or take the premium — is parked, and another way under portfolio margin. Nothing about the position
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

## The same credit on a $1-wide and a $5-wide spread

Take a hypothetical put spread, purely to show the arithmetic — no view about
the underlying, no suggestion the trade is worth doing, and no claim about what
it would have made.

Suppose $0.35 of credit comes in on a $1-wide spread. One contract, so $35
received. The most the structure can lose is the $1 width times 100, less the
credit: $65. Roughly two dollars at risk for every dollar of credit.

Now the same $0.35 of credit on a $5-wide spread. Still $35 received. The most
the structure can lose is now $500 less the credit: $465. Roughly thirteen
dollars at risk for every dollar of credit.

![The same $35 credit on two widths: the $1-wide spread has $65 behind it, the $5-wide has $465 — about seven times the risk for the identical premium.](/assets/blog/same-credit-two-widths.svg)

Side by side, sorted three ways:

| | $1-wide spread | $5-wide spread |
| --- | --- | --- |
| Credit received | $35 | $35 |
| Max loss | $65 | $465 |
| At risk per $1 of credit | ≈ $2 | ≈ $13 |
| Rank on a premium sort | tied | tied |
| Rank on a return-on-risk sort | well ahead | well behind |

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

The numerator does move. What is still collectible is not the original credit
but what it would cost to close the spread right now — the slice of the credit
that has not yet been captured and still decays toward zero. A spread that took
in $35 and can be bought back for $5 has $5 of the original credit still on the
table, against a max loss that is still $65. That is a different ratio from the one on the screen, and it
is the one that describes the position as it currently stands rather than as it
was sold.

Across a book, that distinction decides which positions are still earning their
collateral and which are holding down max loss for a few dollars of remaining
credit. Neither question is answerable from a list of premiums.

## What this looks like in DeltaMint

Candidates are ranked by return on risk rather than credit, and the max loss is
shown next to it so the ratio can be checked rather than trusted. Before an
order is sent, its max loss is shown as a share of account equity, with bands
at 10, 25, 50 and 70 percent. After the fill, each
[grouped position](/blog/options-journal-splits-spreads-into-legs) carries its max
loss in dollars and the account shows the total against equity, netted
condor-aware — because the failure mode with a book of defined-risk trades is
rarely one position going wrong. It is a dozen small max losses that were each
fine and never got added up.

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

For the vocabulary this ratio assumes — what a contract actually fixes at the
fill, and why the premium paid is not the same figure as the collateral held
— start with [what an option actually
is](/blog/what-is-an-options-contract).

This post is educational and is not investment advice.
