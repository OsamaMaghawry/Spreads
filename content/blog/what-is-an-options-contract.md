---
title: What an options contract actually is
slug: what-is-an-options-contract
excerpt: An option is a contract on 100 shares, not a slice of the company, and the two sides of it are not mirror images.
meta_description: What an options contract fixes at the fill — underlying, strike, expiration, premium — and why the buyer's side and the seller's side aren't symmetric.
author: DeltaMint
category: foundations
series_order: 1
tags: options contract, calls and puts, strike price, premium, foundations
---

An option is not a small stock. It shows up on the same screener and settles
into the same brokerage account, but the thing itself trades on its own
listed options exchange and is a contract between two people who never speak
to each other, cleared through a clearinghouse that stands behind both sides
so that neither has to trust the other. Before delta, before theta, before
any of the vocabulary
this series works through one piece at a time, the plain question is what
that contract actually says: what it fixes, who owes what to whom, and what
happens to the money the moment it changes hands.

## A contract on 100 shares, not a slice of the company

Buying a share of stock buys a piece of the company — a claim on its
earnings, a vote at the annual meeting, a dividend if the board declares one.
An equity option buys none of that. It is a standardized contract, issued and
backed by the Options Clearing Corporation rather than by the company, that gives one
side a right and the other side an obligation concerning 100 shares of the
underlying stock. Nothing about owning the option touches the company itself.
There is no dividend for holding a call, no vote, no claim on anything the
business does — only a fixed arrangement about what happens to 100 shares at
a fixed price, by a fixed date.

That "100 shares" is not a rule of thumb. It is the standard deliverable size
the OCC sets for equity options, and everything downstream — the premium
quoted per share, the dollar amount that actually changes hands, the
collateral a broker holds — scales off that number. A corporate action —
most often a split — can change what a specific contract delivers after the
fact, adjusting the strike itself along with the share count, or adding
cash: a 2-for-1 split on a $50 strike adjusts the contract to a $25 strike on
200 shares, preserving the economics rather than the numbers. That is the
exception written to preserve the original deal, not evidence the 100-share
standard is a suggestion.

## The buyer holds a right; the seller holds an obligation

Every option has two sides, and the words "call" and "put" describe what the
buyer's side gets: a call is the right to buy the underlying at the strike, a
put is the right to sell it. That distinction gets its own post next in this
series. What matters here is the shape shared by both — because a call buyer
and a put buyer have the same kind of position, just pointed opposite ways,
and the seller on the other side of either one holds the mirror opposite kind
of position, not the same kind pointed the other way.

The buyer's side is a right and only a right. Before expiration, nothing
forces a buyer to do anything — the contract sits there, and the buyer
decides whether to exercise it, sell it, or let it sit. At expiration itself
that choice defaults rather than disappears: an option finishing $0.01 or
more in the money is exercised automatically unless the holder files
instructions not to, so the real decision at that point is whether to opt
out, not whether to opt in. The seller's side is an obligation with no say
in when assignment happens, though a seller is not stuck for the life of the
contract — the position can be closed by buying it back at any time before
that. If assigned, the seller performs — sells the shares, on a call, or
buys them, on a put — at the strike, on the seller's account, whether or not
that price still makes sense by then.

| | Buyer | Seller |
| --- | --- | --- |
| What the contract gives this side | A right | An obligation |
| Cash at the fill | Pays the premium | Receives the premium |
| Before expiration | Can exercise, sell the contract, or let it sit | Can buy the contract back to close, or wait to be assigned |
| Who decides what happens | This side does | The other side does |

Read the table as one sentence: one party is choosing, and the other party is
waiting to find out what was chosen. That asymmetry is the whole shape of an
option, and every later post in this series — assignment, early exercise,
what a short position actually risks — is a consequence of this table rather
than a separate fact to memorize alongside it.

## Four numbers are fixed the moment the contract is written

A specific options contract is identified by exactly four things, all set
before anyone trades it and none of them negotiable afterward: the
underlying stock, whether it is a call or a put, the strike price, and the
expiration date. A trade adds a fifth number — the premium, the price at
which that contract actually changes hands — but the first four are what
make the contract a specific contract rather than a category of one.

![One hypothetical call contract: underlying, strike $50, expiration in six weeks and $2.00 premium fixed at the fill, with the buyer paying $200 for the right to buy and the seller receiving $200 for the obligation to sell.](/assets/blog/option-contract-anatomy.svg)

Change any one of the four and it is a different contract with its own
premium, even on the same underlying on the same day — a 45 strike and a 50
strike expiring the same week are not close versions of the same position,
they are two separate contracts that happen to share a name. That is the
idea an option chain is organized around, and reading one without guessing
which row means what is its own post later in this series. Here, the point
is narrower: strike, expiration and premium are not settings you tune on an
existing position. They are what makes it the position it is, fixed at the
moment the contract is written and unchanged for as long as you hold it.

## A hypothetical contract, worked through both ways it can end

Take a hypothetical call, purely to show the mechanics — no view on the
underlying, no suggestion anyone place this trade, and no claim about what it
would have been worth to hold. Strike $50, expiring six weeks out, premium
$2.00 a share. One contract, so $200 changes hands at the fill: the buyer
pays it, the seller receives it, and that $200 does not move again regardless
of what happens next.

Suppose the underlying finishes the six weeks at $55. The right to buy at $50
something worth $55 is worth exactly $5 a share at that instant — $500 for
the contract. An option finishing $0.01 or more in the money is exercised
automatically at expiration unless the holder instructs otherwise, so the
buyer does not have to act to capture that $500 — only decline to opt out of
it. The seller is assigned, delivers 100 shares at $50, and receives $5,000
for them, regardless of what those shares would fetch on the open market
that same afternoon. The $500 the contract is worth at expiration and the
$200 already paid six weeks earlier are two separate cash flows rather than
one netted figure — the underlying price where they would exactly offset,
$52, is one strike above the $50 plus the $2 premium, and it is a different
number from either the strike or the price the contract expires at.

Suppose instead the underlying finishes at $45. The right to buy at $50
something worth $45 is worth nothing — nobody exercises a right to overpay —
so the contract expires. The $200 paid six weeks earlier does not come back;
it was the price of the right, paid whether or not the right turned out to
be worth using, and it was already spent the moment the contract filled. The
seller's obligation lapses with nothing further to do.

Both branches share one fact the diagram above already shows: the $200 moved
once, at the fill, and everything that happens over the following six weeks
is a separate question from whether that $200 was paid.

## The premium changes hands at the fill — it is not a deposit you get back

It is easy to mistake the premium for a deposit, something sitting in escrow
that gets returned if the trade does not work out. It is not. The premium is
the price of the contract, paid by the buyer to the seller at the moment the
order fills, in the same way a purchase price changes hands for anything
else bought and sold. Once paid, it belongs to the seller's account
regardless of what the underlying does afterward — though what the seller
can actually do with it while the position stays open is a separate
question from the one this section answers.

What a broker holds in reserve is a different figure entirely: collateral,
against the seller's side of the obligation, sized to what the position could
require if it goes against the seller — not the premium, and not fixed at
the same $200 that changed hands at the fill. That distinction is easy to
blur on a single contract and impossible to ignore once there is more than
one position open, which is where [return on risk and return on
capital](/blog/return-on-risk-vs-return-on-capital) start to diverge from
each other and from the premium alone.

## What this contract is not

A few things an option is commonly assumed to be, that it is not. It is not
a loan, and holding one creates no debt to repay — nothing is borrowed and
nothing is owed beyond the premium, though 100 shares of exposure for $200
is exactly why options get called leveraged. It is not a private arrangement
between the two counterparties; both sides face the clearinghouse, not each
other, which is why a buyer's right does not depend on a specific seller
being solvent six weeks from now. And it is not, on its own, a bet with a
scheduled payout — what it becomes at expiration is exactly what the two
worked examples above showed, decided by where the underlying is, not by
anything either side wanted.

The rest of the vocabulary this contract needs — what makes a call different
from a put, why the same strike costs a different amount on different days,
what actually happens in an account the morning after assignment — is the
rest of [Options, from the start](/blog/foundations).

This post is educational and is not investment advice.
