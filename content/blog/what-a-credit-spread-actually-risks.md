---
title: What a credit spread actually risks
slug: what-a-credit-spread-actually-risks
excerpt: The credit is the number you see; the width is the number you own, and between the fill and expiration the two behave nothing alike.
meta_description: Where a credit spread's max loss comes from, what stays posted while it is open, and what the position does between the fill and expiration.
author: DeltaMint
category: managing
series_order: 48
tags: credit spread, max loss, assignment, defined risk, collateral
---

A vertical credit spread is two options on the same underlying, in the same
expiration, in the same class, in equal size: one sold, one bought further from
the money. Money arrives at the fill, which is why the structure is called a
credit spread and why the credit is the first thing anybody looks at.

It is the smaller half of the story. The credit is what was received; what was
undertaken is the distance between the two strikes, fixed at the fill and
unmoved by anything the underlying does afterwards. Everything the position can
cost is contained in that width — and almost nothing about how it behaves in the
weeks before expiration is.

So: where the max loss figure comes from, what your account holds against it
meanwhile, and what the position does on the days that are not expiration day.

## One leg is an obligation, the other is only a right

The two legs are not symmetric, and the risk profile follows from that. The leg
you sold is an obligation: somebody else holds the right, and for American-style
equity options they can use it on any business day they choose. Shares then
change hands at the strike whether the timing suits you or not.

The leg you bought is a right, and a right does nothing on its own. It marks up
as the underlying falls through it and pays only when it is exercised or sold.
It caps the arithmetic; it does not intervene.

| | Short leg — the one you sold | Long leg — the one you bought |
| --- | --- | --- |
| What it is | An obligation | A right |
| Cash at the fill | Premium in | Premium out |
| Before expiration | Can be assigned any day, at the holder's choice | Does nothing unless you exercise or sell it |
| At expiration, in the money | Assigned: shares change hands at the strike | Exercised by exception unless you instruct otherwise |
| Who decides | Somebody else | You |

Read the table as one sentence: the bad outcome is triggered by a stranger, and
the protection has to be acted on by you. That asymmetry is why the loss is
capped cleanly at expiration and messier at every point before it.

## Where the max loss number comes from, rather than what it is

Take a hypothetical put spread, purely for the arithmetic. Short the 100 put,
long the 95 put, same expiration, one contract, $1.20 of credit: $120 received
and a $5.00 width. At expiration there are three cases, each settling at a
figure you can write down in advance.

Above 100, both puts expire worthless, the obligation lapses and the $120 stays.
That is the most the structure can produce, and it was known at the fill.

Below 95, both puts are in the money. The one you sold takes shares in at 100;
the one you bought sends them out at 95. The pair settles for exactly the width
— $500 — however far below 95 the underlying went. Against the $120 already
received, that is $380 gone: five dollars of width, less a dollar twenty of
credit, times a hundred shares per contract.

Between the strikes the result slides between those two, passing through zero at
the short strike less the credit — 98.80.

![The payoff of a hypothetical $5-wide put credit spread at expiration: $120 kept above the short strike, $380 lost below the long strike, and a break-even at 98.80.](/assets/blog/credit-spread-expiration-payoff.svg)

The formula is not a rule to memorise; it is the bottom plateau of that picture.
Max loss is (width − credit) × 100 per contract because below the long strike
the legs settle against each other for the full width and the credit is the only
thing offsetting it. Which is why the same credit on a different width is a
different position: $0.30 on a $1-wide spread puts the plateau at $70, and the
same $0.30 on a $2.50-wide spread puts it at $220 — more than three times as far
down for identical income. Ranking positions on that basis is its own subject,
and
[return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital)
is where it is worked through.

## The collateral is posted against the whole width, and it does not shrink

The credit lands in the account immediately, which makes it feel like a result.
It is not one. It is money received in advance against an obligation still
outstanding, and the account holds something against that obligation for as long
as the position is open. For a vertical with both legs in one account and one
expiration, that hold is the most the structure can cost: the width, times 100,
with the credit applied against it. The exact treatment is your broker's under
your margin agreement and is worth reading rather than assuming — a retirement
account, for instance, will typically hold the width in cash.

Two things about that hold are easy to miss. It does not shrink as the position
moves your way; a spread that has captured most of its credit ties up the same
collateral as the day it filled, until it is closed or the legs settle. And it
does not net across unrelated positions: ten spreads on ten underlyings hold ten
max losses at once, and the total is what matters to the account, not any single
row.

## Before expiration the cap is a boundary, not your profit and loss

The payoff diagram describes one instant — the last one. Every day until then,
what your screen shows is a mark: what it would cost, right now, to buy the
spread back.

The bound on that mark is real. A vertical's value cannot fall below zero or
rise above its width, so profit and loss stays between the credit received and
the credit minus the width at all times, and the long leg does that work
continuously rather than only at the end. What the bound does not do is keep the
mark anywhere near comfortable meanwhile: with time still to run, the same
$5-wide spread can be marked well beyond the credit against you at a price
where expiration has decided nothing.

![With time left to run, the same spread's mark sits strictly inside both expiration plateaus — already worse than the credit at the long strike, and still short of the full credit at the top.](/assets/blog/credit-spread-mark-vs-expiration.svg)

Three consequences follow from that curve. The mark moves on implied volatility
as well as price, so a spread can be marked worse on a volatility expansion with
the underlying unchanged. The price at which the position is flat today is not
the break-even at expiration — with time left it sits above the short strike and
walks toward 98.80 only as that time passes. And the mark is not the exit price:
closing pays the ask on the leg bought back and takes the bid on the leg sold,
so a thin long wing costs real money to leave that no mid-price mark shows.

## Early assignment turns a defined-risk position into a stock position overnight

The cap is an arithmetic property of the two legs. It is not a mechanism that
steps in when the short leg is exercised.

Assignment on the short 100 put means buying 100 shares at 100 — a $10,000 debit
in this hypothetical — while the long 95 put stays where it is. The capped
figure survives: shares plus the right to sell them at 95 cannot be worth less
than $9,500, so the worst case is still the $500 gap less the $120 credit. What
does not survive is the shape of the position. It is stock now, and $10,000 of
stock takes buying power the account may not be holding.

![Before assignment: two option legs and $380 of collateral. After assignment on the short put: 100 shares bought at the strike for a $10,000 debit, with the long put still outstanding.](/assets/blog/credit-spread-early-assignment.svg)

Three mechanics are worth having straight beforehand rather than after.

**The notice is retrospective.** Exercise decisions are made after the close and
allocated overnight; the seller finds out before the next open, holding shares
dated from the day before. Whatever happened in between is already yours.

**Exercising the long put and selling it are different numbers.** Exercising
throws away whatever time value the put still carries; selling the put and the
shares keeps it. Both close the position, and not for the same amount.

**Short calls have their own trigger.** Early assignment on a short call
clusters the day before an ex-dividend date, when the dividend exceeds what is
left of the call's time value. Assigned there, you are short the stock into the
dividend rather than long it.

Expiration has a version of this that catches people who did the arithmetic
correctly. Finish between the strikes — say at 97 — and the short put is in the
money while the long is not. Options a cent or more in the money are exercised
by exception, so the short is assigned, the long expires worthless, and Monday
opens with 100 shares at a cost of 100 and nothing underneath them. The decision
belongs to the holder and can be made after the 4pm close, on a price that moved
once you had stopped watching. Cash-settled index options do none of this:
European style, no early assignment, and the difference settles in cash.

## What the max loss number still does not tell you

It says nothing about likelihood. A generous-looking credit against a wide
plateau is often priced that way precisely because the market sees a real chance
of the short strike being taken out. Distance, delta, days remaining and whether
earnings land before expiration are separate questions the width does not
answer.

It sits outside fees: commissions both ways, plus assignment or exercise
charges, leave the realised figure worse than the formula. And it assumes the
deliverable is 100 shares — after a split, a merger or a special dividend, an
adjusted contract can deliver something else and width × 100 stops describing
it.

Most of all, it assumes you hold the structure at all. Two legs are a spread
because they were submitted and filled as one order; a leg that filled without
its partner is not a cheaper version of the same position but a different one,
and [a book that pairs legs by resemblance](/blog/options-journal-splits-spreads-into-legs)
can report a max loss belonging to no trade anyone made.

That last problem is where DeltaMint spends most of its effort. Candidates are
ranked by return on risk with the max loss beside it; before an order is sent,
that max loss appears as a share of account equity, with bands at 10, 25, 50 and
70 percent; after the fill the grouped position carries its max loss in dollars
and the account total is netted condor-aware — because the failure that actually
happens on a book of defined-risk trades is a dozen small max losses that were
each fine and never got added up. None of that is a view on whether a spread is
worth putting on. It is the arithmetic on this page, kept current while you are
looking at something else.

The rest of the series on holding positions after they fill is in
[After the fill](/blog/managing).

This post is educational and is not investment advice.
