---
title: "Covered call explained, through to the day after assignment"
slug: covered-call-explained
excerpt: A covered call is one call sold against 100 shares already owned, and it ends with the shares kept or delivered at the strike, the premium kept either way.
meta_description: "One call sold against 100 shares owned: the premium is kept either way, the rise above the strike goes to the call holder, and assignment leaves only cash."
author: DeltaMint
category: income
series_order: 15
tags: covered call, income, assignment, cost basis, options
---

A **covered call** is a short call option sold against 100 shares of the same
stock already held in the account, so that if the call is assigned, the
shares to deliver are already there. The seller receives a premium up front
and, in exchange, agrees to sell those shares at the strike price if the
call is assigned.

This post opens the [income series](/blog/income). It uses the same made-up
ticker, XYZ, and the same 30-day call quote as the [option chain
post](/blog/how-to-read-an-option-chain), and it ends where the position
ends: in the account, the morning after the shares are called away.

## Key takeaways

- "Covered" means the shares to deliver are already owned, one call per 100 shares.
- The premium is kept however the call ends. Held to expiration, the shares stay if the stock finishes below the strike and are delivered at the strike if it finishes above.
- Above the strike, the shares' rise goes to the call holder, so the upside is capped.
- The premium lowers the break-even by its own amount; the shares' downside remains.
- After assignment the account holds cash: the shares, the short call and the position are gone.

## What does "covered" mean in a covered call?

A call seller takes on an obligation: sell 100 shares at the strike if
assigned. Covered describes where those shares come from. They are
already in the account, so assignment is settled by delivering them.

The alternative is a **naked call**, a short call with no shares behind it.
If a naked call is assigned, the seller has to deliver shares they do not
own, which in a margin account means a short stock position at the strike.
Because a stock has no ceiling, neither does that exposure.

The difference shows up in what backs the obligation. On a covered call the
100 shares are the collateral, and brokers commonly hold them against the
call, so selling them means buying back the call first, unless the account
is approved to hold naked calls. On a naked call,
margin stands in for the shares, it usually needs a higher options approval
level, and the requirement rises as the stock does. The [buying power
post](/blog/options-buying-power-requirement) covers how each is reserved.

## Example: one hypothetical covered call on XYZ

A hypothetical trader holds 100 shares of XYZ bought at $48.00, so $4,800
went out for them. XYZ now trades at $50.00. On the 30-day chain the 52 call
is quoted 1.42 bid and 1.52 ask, and the trader sells one contract at the
bid. That brings in 1.42 × 100 = $142 in cash at the fill, in exchange for
an obligation to deliver 100 shares at $52 if assigned.

Two numbers follow by subtraction. The break-even at expiration is $48.00 −
$1.42 = $46.58 per share. The most the position can end above its cost is
($52.00 − $48.00) + $1.42 = $5.42 per share, or $542 for the contract,
however high XYZ goes.

These figures describe mechanics only, not a forecast of what any stock will
do. The table takes the two ways the call can finish, using a close of $51.00
for one and $56.00 for the other.

| At expiration | XYZ closes at $51.00, below the strike | XYZ closes at $56.00, above the strike |
| --- | --- | --- |
| The call | Expires worthless | Assigned |
| The shares | Kept, worth $5,100 | Delivered at $52, $5,200 in cash |
| The $142 premium | Kept | Kept |
| Stock rise above $52 | Not reached | $400 goes to the call holder |
| What the account holds | 100 shares, no short call | Cash, no shares, no short call |

In the first case nothing changes hands: the call leaves and the shares stay,
uncovered. In the second, the shares leave at $52 while trading at $56, and
the $400 between the two goes to whoever holds the call.

## A covered call caps the upside and cushions the downside only a little

Below the strike, the position moves with the shares, lifted by the premium.
At expiration, above the strike, every dollar the shares rise, the short
call rises with it, and the line goes flat.

![A covered call tracks the shares below the 52 strike, sitting 1.42 higher, then goes flat above the strike while the shares alone keep rising.](/assets/blog/covered-call-payoff.svg)

Against the shares held alone, the covered call only falls behind above
$53.42 — the $52 strike plus the $1.42 premium already banked. The cushion
is exactly the premium and nothing more. If XYZ closes at
$45.00, the shares are worth $4,500 against the $4,800 paid, the $142 premium
offsets part of that, and the position sits $158 below its cost. The shares
can still fall to zero; the call does nothing about that beyond the $1.42 —
small, next to the full value of 100 shares.

## How does a covered call end?

A covered call is two lines in an account: 100 shares and one short call.
The call leaves in one of the [three ways any contract
can](/blog/what-is-an-options-contract), and each decides what happens to the
shares:

- **It expires out of the money.** The call disappears and the shares stay, uncovered.
- **It is assigned.** The shares go at the strike, cash arrives, and both lines are gone.
- **The seller buys it back.** That costs whatever the market asks then; the shares stay, uncovered.

Assignment need not wait for expiration. An American-style call can be
exercised on any trading day, and [early
exercise](/blog/early-exercise-options) is most often seen just before an
ex-dividend date, when the dividend exceeds the call's remaining extrinsic
value. How the notice arrives is in the [assignment
post](/blog/option-assignment-what-happens).

## The premium lowers the break-even, not the reported cost basis

It is common to hear that a covered call's premium "lowers your cost basis."
As a way of thinking about the position, that is fair: $48.00 paid less $1.42
received leaves $46.58 of the trader's own money in each share, and that is
the break-even at expiration.

It is not a statement about tax records. How a premium is reported depends
on how the call ends, and is a question for a tax professional. This post
says "effective break-even" and leaves the reported basis alone.

Nor does the premium stand on its own as income — it is one half of a
position whose other half is 100 shares of downside.

## What does the account look like the day after assignment?

Take the second case: XYZ closes at $56.00 on expiration Friday, and the 52
call is exercised automatically. The assignment notice usually shows up
before Monday's open, though it can arrive later. Once it does, the account
shows:

- **Shares.** Zero XYZ. The 100 shares were delivered at $52.00.
- **Cash.** $5,200 from the sale, on top of the $142 received weeks earlier.
- **Short call.** Gone. Assignment removed the line; nothing is left to buy back.
- **The covered call.** Gone too. There is no position left to watch, only cash.

The payoff diagram leaves this part out. Account history typically shows a
share sale and an assignment as separate rows, weeks after the premium that
started them, and reading them back as one position is left to the trader.

## Frequently asked questions

- **What does "called away" mean on a covered call?** The call was assigned and the shares were delivered at the strike.
- **Is the premium kept if a covered call is assigned?** Yes; it was paid at the fill.
- **Can a covered call be assigned early?** Yes, on American-style options, most often before an ex-dividend date.
- **Covered call vs naked call?** A covered call has the shares to deliver; a naked call does not.
- **Does a covered call protect against a falling stock?** Only by the premium received.

## The bottom line

A covered call trades the shares' rise above the strike for a premium paid
now. The premium is kept however the call ends and lowers the break-even by
its own amount, and nothing more.

The position ends with the shares kept and uncovered, or delivered at the
strike. The day after assignment, the account holds cash; the shares, the
short call and the covered call are gone.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
