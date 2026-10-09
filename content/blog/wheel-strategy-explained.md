---
title: "Wheel strategy explained: one position, put to call to cash"
slug: wheel-strategy-explained
excerpt: The wheel strategy is a cash-secured put followed, if assigned, by a covered call on the same shares, moving one account from cash to shares and back.
meta_description: "Wheel strategy explained on one hypothetical position: cash reserved, shares after assignment, a covered call, then cash again, the account at each step."
author: DeltaMint
category: income
series_order: 17
tags: wheel strategy, cash-secured put, covered call, assignment, options
---

The **wheel strategy** is a sequence of two options trades on one stock: a
cash-secured put sold first and, if that put is assigned, a covered call sold
against the 100 shares it delivered. If the call is assigned in turn, the
shares leave at its strike and the account holds cash again.

This post continues the [income series](/blog/income) from the [cash-secured
put](/blog/cash-secured-put-explained) and the [covered
call](/blog/covered-call-explained), which each explain one half. It follows
one hypothetical XYZ position through both, run by hand in an ordinary
brokerage account, and writes out what the account holds at every hand-off.

## Key takeaways

- The wheel is two trades already explained, run in sequence on one stock: a cash-secured put, then a covered call.
- Each hand-off happens through assignment, and the account moves from cash to shares and back to cash.
- Each premium is kept however its option ends.
- Between the two turns the account owns 100 shares with their full downside, cushioned only by the premiums taken.
- A loss already sitting in the shares at assignment carries into the covered call; no call strike undoes it.

## How does the wheel strategy work?

Each turn is a trade covered in its own post, and the only thing joining them
is assignment. Written out as the sequence is usually described:

1. **A cash-secured put is sold.** Cash equal to the strike times 100 is reserved, and the premium arrives at the fill.
2. **The put is assigned, or it is not.** If assigned, the reserve buys 100 shares at the strike. If it expires out of the money, the reserve is released and no shares arrive.
3. **A covered call is sold on those shares.** The 100 shares become the collateral, and a second premium arrives.
4. **The call is assigned, or it is not.** If assigned, the shares are delivered at the call's strike and cash comes back. If it expires, the shares stay, uncovered.

The name comes from the loop. Once the call is assigned the account holds
cash, which is what a cash-secured put is backed by, so the strategy as
usually described begins again at step 1. That describes the sequence's
shape, not a step any account has to take.

Account history does not show the loop. The put sale, the assignment and
share purchase (one or two rows), and the call sale appear as separate rows,
the first of them weeks before the others, and nothing in the ledger marks
them as one sequence.

## Example: one hypothetical XYZ position through every hand-off

Turn one is the put from the [cash-secured put
post](/blog/cash-secured-put-explained), unchanged. With XYZ at $52.00, a
hypothetical trader sells one 30-day 50 put for $1.40, bringing in $140 and
reserving $5,000. XYZ closes at $47.00 on expiration day, and the put is
assigned: 100 shares at $50.00, an effective cost of $50.00 − $1.40 = $48.60.

Turn two needs a fresh quote, because XYZ is no longer where it was. With
the stock at $47.00 and 30 days to the next expiration, the 50 call is quoted
0.98 bid and 1.08 ask, in line with the roughly 40% [implied
volatility](/blog/implied-volatility-options-explained) the earlier XYZ
examples use. The trader sells one at the bid for 0.98 × 100 = $98, and
agrees to deliver 100 shares at $50.00 if assigned.

These figures describe mechanics only, not a forecast. The account at each
hand-off:

- **After the put is sold.** One short 50 put, $5,000 reserved against it, $140 of premium received.
- **After the put is assigned.** 100 XYZ shares bought at $50.00, the $5,000 spent, no put. At $47.00 the shares sit $1.60 a share below the $48.60 effective cost.
- **After the call is sold.** The same 100 shares, now collateral for one short 50 call, and $98 more premium received. No new cash is reserved; the shares cover the call.
- **After the call is assigned.** No shares, no call, and $5,000 in cash from delivering the shares at $50.00.

![Across the four hand-offs of one hypothetical wheel, the account moves from $5,000 reserved behind a short put, to 100 shares, to those shares behind a short call, and back to $5,000 in cash.](/assets/blog/wheel-account-at-each-handoff.svg)

The $48.60 is the effective cost at the moment of assignment, by the same
subtraction the cash-secured put post uses. How the call's $98 folds into
that figure over several turns is a separate question, left to a later post
in this series on the running cost basis.

## How does the covered-call turn end?

The call leaves in one of the [three ways any contract
can](/blog/what-is-an-options-contract), and each decides whether the account
is back in cash. The table takes two closes on the call's expiration day,
$51.00 and $46.00.

| At the call's expiration | XYZ closes at $51.00, above the 50 strike | XYZ closes at $46.00, below it |
| --- | --- | --- |
| The 50 call | Assigned | Expires worthless |
| The shares | Delivered at $50.00, $5,000 in cash | Kept, worth $4,600 |
| The $98 call premium | Kept | Kept |
| Against the $48.60 effective cost | Shares leave $1.40 a share above it | Shares sit $2.60 a share below it |
| What the account holds | Cash, no shares, no call | 100 shares, no call |

In the first case the sequence has come all the way round: the $5,000 that
bought the shares is back, and both premiums sit in the history as separate
rows. In the second, the account is back to 100 shares with nothing sold
against them, at a lower price.

The call can also end early: bought back, leaving the shares uncovered, or
assigned before expiration, most often [ahead of an ex-dividend
date](/blog/early-exercise-options), as the [assignment
post](/blog/option-assignment-what-happens) describes.

## A loss on the shares carries into the covered call

XYZ fell from $52.00 to $47.00 before the put was even assigned, so the
shares already sit below their effective cost the moment the call is sold,
and the call that follows has to be struck somewhere relative to both. On
the same hypothetical chain at $47.00, two strikes show what changes:

- **The 50 call, above the effective cost.** $98 of premium. If assigned, the shares leave at $50.00, at expiration.
- **The 48 call, below the effective cost.** Quoted 1.66 bid and 1.76 ask, so $166 at the bid. If assigned, the shares leave at $48.00, $0.60 a share below the $48.60 effective cost from the put.

![With hypothetical XYZ at 47 after assignment, a 48 call is struck below the 48.60 effective cost and a 50 call above it, and neither strike moves the stock.](/assets/blog/wheel-fall-between-turns.svg)

Neither strike undoes the loss already sitting in the shares. They are worth
$47.00 whichever call is sold; the call only sets the price at which they
would leave, and its premium is all it adds.

The downside works as it does for each half alone. A covered call cannot
follow the stock down: if XYZ closes at $40.00, the 50 call expires
worthless, and the shares are worth $4,000 against the $5,000 paid, with the
$140 and $98 premiums as the only cushion.

## Frequently asked questions

- **What is the wheel strategy in options?** A cash-secured put and then, if it is assigned, a covered call on the shares received, both on the same stock.
- **What happens after the put is assigned in the wheel?** The reserved cash buys 100 shares at the strike, and those shares are what the covered call is sold against. The [cash-secured put post](/blog/cash-secured-put-explained) walks through that morning line by line.
- **How much cash does the put turn reserve?** The strike times 100 for each contract, held until the put ends, as the [buying power post](/blog/options-buying-power-requirement) covers.
- **Wheel strategy vs covered calls and cash-secured puts?** It is not a third structure. It is the two run in sequence on one stock.

## The bottom line

The wheel strategy is a cash-secured put and a covered call, joined by
assignment on one stock. The account holds cash, then shares, then shares
behind a call, then cash again if the call is assigned, and each premium is
kept however its option ends.

What the sequence does not change is the shares' downside between turns. A
fall after the put is assigned stays with the shares, and the covered call
that follows only sets the price at which they would leave.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
