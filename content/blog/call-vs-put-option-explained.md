---
title: Call vs put option explained, seller's side included
slug: call-vs-put-option-explained
excerpt: A call is the right to buy and a put the right to sell — but every one of those rights was sold by somebody, and the four positions that result behave nothing alike.
meta_description: A call is the right to buy, a put the right to sell — and somebody sold each one. The four positions, what each costs, and which can hand you 100 shares.
author: DeltaMint
category: foundations
series_order: 2
tags: call option, put option, long call, short put, assignment
---

A call is the right to buy 100 shares at a set price; a put is the right to sell
100 shares at a set price. That is how call vs put gets explained almost
everywhere. It is accurate, and it is half the contract. Every one of those
rights was sold by somebody, and what the seller holds is not the right's mirror
image — different cash, a different claim on the account, a worst case shaped
nothing like the buyer's.

So the unit worth learning is not two contract types but four positions: a call
bought, a call sold, a put bought, a put sold. Two are rights and two are
obligations, and which one a row is matters more than the word printed on it.

## A call and a put are the same contract with the shares pointed the other way

The [standardised fields of a listed
contract](/blog/what-is-an-options-contract) — underlying, 100 shares,
expiration, strike, type, exercise style — are fixed by the exchange, and only
the premium is left for the market. Call or put is one of those fields, and
changing it changes nothing about the machinery: same multiplier, same clearing
house, same three ways out. What it changes is the direction 100 shares travel
if the right is used.

- **A call, exercised.** The holder buys 100 shares at the strike. The seller
  delivers them at the strike — out of shares already owned, or by buying them
  at whatever the market asks that day.
- **A put, exercised.** The holder sells 100 shares at the strike. The seller
  takes those shares in and pays the strike in cash, whatever they happen to be
  worth at the time.

On both, the holder's side is a choice and the seller's side is a consequence.
The call seller parts with shares, owned or bought at that moment; the put
seller ends up long the shares and short the cash. Neither seller is asked
first.

## Every contract has a seller: long call, short call, long put, short put

An option row carries a sign in front of the quantity, and that sign does more
work than the word beside it. **+1** means you paid for a right; **−1** means
you were paid to take on an obligation. Cross the two types with the two signs
and there are four positions — usually sorted into bullish and bearish, the
least useful thing about them.

![The four option positions arranged as a grid: bought calls and puts are rights that cost a premium, sold calls and puts are obligations that receive one and are decided by somebody else.](/assets/blog/call-put-four-positions.svg)

Read the grid down the columns, not across the rows. The left column costs
money at the fill and then, unless it finishes in the money, asks nothing
further of you. The right column pays money at the fill and then keeps part of
your account occupied until it is gone.

| Position | What it is | Cash at the fill | If it is exercised or assigned | Who decides |
| --- | --- | --- | --- | --- |
| Long call (+1) | A right to buy | Debit out | You buy 100 shares at the strike | You |
| Short call (−1) | An obligation to sell | Credit in | You deliver 100 shares at the strike | The holder |
| Long put (+1) | A right to sell | Debit out | You sell 100 shares at the strike | You |
| Short put (−1) | An obligation to buy | Credit in | You buy 100 shares at the strike | The holder |

One row deserves a flag. A sold call on shares you do not own is the only one of
the four with no arithmetic ceiling on what settlement can cost: nothing bounds
the price of shares you have already promised to deliver. Sold against shares
you hold it is a different position, taken up later in the series.

## The buyer pays once; the seller is paid once and then carries the position

Buying either type is a debit: the premium leaves, the position arrives, and
that debit is the whole of what the position can lose. It cannot turn into a
liability while you hold it, so nothing is reserved behind it — with one
exception at the end: an option that finishes in the money is exercised for
you unless you instruct otherwise, and the shares it buys or sells have to be
settled, funded or not.

Selling either type is a credit, and the credit is not the extent of it. A short
option can be worth more later than it was when sold, so the broker holds
collateral behind the row — cash, shares, or a long option, depending on the
structure. That hold is not a fee and it is not spent: it is spendable money
that has stopped being spendable, for as long as the position is open.

Three things the seller carries that the buyer does not:

- **Collateral, for the life of the position.** Held against cash or against a
  long option, the amount is fixed at the outset and stays there — a
  cash-secured put ties up the strike times 100 whatever the shares do.
  Uncovered in a margin account it is not fixed: the requirement is
  recalculated daily off the option's current price and the underlying's, so
  it rises as the position moves against the seller and falls as it moves
  their way — the direction that hurts is also the one that asks for more.
- **A decision made by a stranger.** For American-style equity options the
  holder can exercise on any business day. The clearing house assigns the
  notice to a broker at random from everyone short that series; the broker
  then allocates it to a customer by a fixed method it has to disclose —
  first-in-first-out at some, random at others. Either way, you are told after.
- **A settlement that has to be funded or margined.** An assigned short put
  buys 100 shares at the strike; an assigned short call delivers 100 shares
  that must be found somewhere.

The buyer's version of all three is one line: sell it, exercise it, or — only
if it finishes out of the money — let it expire.

## One 50-strike contract, settled four ways

Hold everything constant except the position. Hypothetical XYZ, one expiration,
50 strike, call and put both quoted at $2.00 — $200 per contract at the 100
multiplier. XYZ is made up; the point is that the same $200 buys four different
jobs.

Say the shares finish at 56 on expiration day:

- **Long call.** In the money by $6. Exercised by exception — anything a cent
  or more in the money settles automatically unless you instruct otherwise —
  so 100 shares arrive at a cost of 50: $5,000 out for shares marked at $5,600.
- **Short call.** Assigned. 100 shares leave at 50 — owned already, or bought
  at whatever the market asks that day and delivered at 50, roughly $600 out
  against the $200 received if bought near 56.
- **Long put.** Out of the money. It expires and the $200 debit is gone.
- **Short put.** Out of the money. It expires, the $200 credit stays, the
  collateral is released.

Now say they finish at 44 instead:

- **Long put.** In the money by $6. Exercised by exception, 100 shares are sold
  at 50 — $5,000 in for shares worth $4,400.
- **Short put.** Assigned. 100 shares arrive at a cost of 50, a $5,000 debit to
  be funded or margined, against shares marked at $4,400.
- **Long call.** Expires. The $200 is spent.
- **Short call.** Expires. The $200 credit stays.

"Expires worthless" is not one outcome but two: the buyer spent a known amount
and is finished, the seller kept one and had collateral tied up the whole time.
And every assignment line above moves 100 shares at the strike — into the
account for a short put, out of it for a short call — dated the day the holder
exercised, which is before the session you found out.

## A long call and a short put are both bullish and nothing alike

A long call and a short put are both called bullish, and both do better as the
shares rise. Sorted that way they look like alternatives. In an account they
have almost nothing in common.

![A bought 50 call and a sold 50 put at expiration, side by side: the call floors at the $200 paid and tracks the shares upward, while the put ceilings at the $200 received and falls toward taking in shares for $5,000.](/assets/blog/long-call-vs-short-put.svg)

The two shapes are not reflections. The bought call's worst case is known at the
fill and its result above the strike is open-ended; the sold put's best case is
known at the fill and its result below the strike runs toward the full cost of
the shares. A floor and no ceiling, against a ceiling and a long way down.

The account facts diverge as hard:

- **What is held.** The call reserves nothing beyond the debit. Cash-secured,
  the put holds the full strike times 100 — $5,000 gross in the example, with
  the $200 credit usually netted against it on the broker's screen.
- **What time does.** Time passing works against the bought contract and in
  favour of the sold one, all else equal.
- **What ends it.** The call ends when you sell it, exercise it, or — out of
  the money — let it expire. The put can end the same way, or a stranger can
  end it for you by exercising on a Thursday.

The bearish pair works the same way: a long put and a short call both do better
as the shares fall, and only one can be assigned into a share position it never
wanted.

## The word tells you the deliverable; the sign tells you the job

Keep calls and puts straight by the deliverable: a call moves shares to the
holder at the strike, a put moves shares from the holder at the strike. That is
the entire content of the distinction.

The sign in front of the quantity is the larger fact. It decides whether cash
came in or went out, whether collateral is held, who chooses what happens, and
whether the position can hand you 100 shares without asking.

What none of it says is what any of this should cost — why the call and the put
above were both $2.00, or what that price does as expiration approaches. Strike,
expiry and premium come next in the [foundations series](/blog/foundations).

This post is educational and is not investment advice.
