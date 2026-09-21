---
title: "Option assignment: what happens in your account"
slug: option-assignment-what-happens
excerpt: Assignment is the seller's side of exercise — the option row disappears, shares and cash move at the strike, and you read about it afterwards.
meta_description: Assignment is what happens to an option seller when the holder exercises. How the notice is allocated, and what changes in the account line by line.
author: DeltaMint
published_at: 2026-09-21T10:00:00+00:00
category: foundations
series_order: 10
tags: assignment, exercise, occ, short options, foundations
---

**Assignment** is what happens to the seller of an option when the holder
exercises it: the obligation is used, 100 shares per contract change hands at
the strike, and the option position leaves the account. The seller does not
agree to it, is not asked, and usually reads about it the next morning.

That is the whole of the surprise, and it is worth separating from the
vocabulary. Exercise is something a holder does. Assignment is the notice that
reaches somebody who is short the same contract — allocated to them by a
process they have no input into and cannot see running.

What follows is the mechanics on a single short option: who hands out the
notice, what your account looks like line by line afterwards, and why the
timing is always retrospective. Assignment on the short leg of a spread adds
consequences of its own, which [the post on what a credit spread actually
risks](/blog/credit-spread-max-loss) works through separately.

## Key takeaways

- Assignment is the seller's side of exercise. The holder chooses; the seller is allocated the notice and has no say in it.
- The clearing house assigns an exercise notice at random to a firm carrying a matching short position, and that firm then allocates it among its own short customers by a disclosed method — commonly random or first-in, first-out.
- An assigned short put buys 100 shares per contract at the strike; an assigned short call delivers 100 shares per contract at the strike.
- The option row disappears without a closing trade, and a stock row appears or changes in its place, carrying its own collateral requirement and no expiration date.
- Exercise decisions are made after the close and allocated overnight, so the notice arrives while you already hold the result.

## What does it mean to be assigned an option?

The [call and put post](/blog/call-vs-put-option-explained) set out the split
that assignment depends on: the buyer holds a right, the seller carries the
matching obligation. Assignment is the single moment that obligation stops
being theoretical.

The word is chosen carefully. You are not exercising anything and nobody is
asking your permission — a notice is *assigned* to you, and the account is
adjusted to settle what it says.

- **It is not a decision anyone consults you on.** There is no step at which you accept or decline the notice.
- **It is not your broker acting on its own view.** The firm is passing on a notice that originated with a holder.
- **It is not only an expiration event.** American-style equity options can be exercised on any business day the holder chooses.
- **It cannot be closed out.** Once the notice is allocated the contract is settled; there is no option left to buy back.
- **It does not always involve shares.** Index options are commonly European-style and cash-settled, so a cash difference is paid instead.

Assignment is also one of exactly [three ways a contract leaves your
account](/blog/what-is-an-options-contract) — alongside closing it and letting
it expire. It is the only one of the three that somebody else starts.

## How is it decided which seller gets assigned?

The Options Clearing Corporation (OCC) is the central counterparty to every
listed US equity option, standing between the two sides of each trade. Because
the buyer and seller of a contract are never paired to each other, an exercise
notice cannot be sent to a particular person. It has to be handed out.

It is handed out in three steps, overnight:

1. **A holder submits an exercise notice** through their own broker, which passes it to the OCC.
2. **The OCC assigns that notice at random** to a clearing firm carrying a short position in the same series — the same underlying, expiration, strike and type.
3. **The firm allocates it among its own short customers** by a method it has to state and apply consistently, commonly random selection or first-in, first-out. Which one your broker uses is in the account agreement you signed.

Two things follow from that. Nothing visible on your screen tells you whether
you are next, because the draw happens inside firms you cannot see into. And
whether the *series* is exercised at all is a separate question, driven by how
far in the money it is and how little time value is left in it.

Partial assignment is a real case people do not expect. Short ten contracts of
the same series, you can receive a notice on three of them and keep the other
seven, because allocation runs contract by contract rather than position by
position.

Expiration is where this stops being a lottery. An equity option that finishes
in the money by a cent or more is exercised by exception at the clearing house
unless the holder instructs otherwise, and brokers may apply their own
thresholds on top. A short option that finishes in the money is best treated as
assigned by default.

## What changes in your account after assignment?

The useful way to read assignment is as a substitution. One row is removed and
replaced by a different instrument, and cash moves by an amount the strike
fixed long before any of this happened.

![Line by line, assignment on one hypothetical short 50-strike put replaces the option row with a hundred shares and a five thousand dollar cash movement.](/assets/blog/assignment-account-line-by-line.svg)

- **The option row disappears with no closing trade.** There is no exit debit and no fill price for that leg — it was settled, not traded out of.
- **A stock row appears or changes.** An assigned put leaves you owning 100 shares per contract; an assigned call sends 100 out, or creates a short stock position if you held none.
- **Cash moves by the strike times 100, per contract.** Not by the option's market value, and not by anything the stock is trading at.
- **The old collateral is released and the new position brings its own.** A share position is margined on its market value under your broker's rules, so the hold is replaced rather than returned.
- **The premium you were paid stays.** On an assigned put it is commonly treated as reducing the cost basis of the shares rather than standing alone — a reporting question, not a mechanical one.
- **The paperwork is dated yesterday.** The confirmation carries the exercise date, so the shares are yours from before you knew about them.

Which direction everything moves depends only on whether the assigned option
was a put or a call. The strike sets the amount in both cases.

![An assigned short put takes in shares and pays out cash; an assigned short call delivers shares and takes in cash.](/assets/blog/assignment-put-vs-call.svg)

| | Assigned on a short put | Assigned on a short call |
| --- | --- | --- |
| The obligation | Buy 100 shares at the strike | Deliver 100 shares at the strike |
| Cash | Debit of strike × 100 | Credit of strike × 100 |
| Share position after | 100 shares arrive | 100 shares leave, or short 100 if you held none |
| If the account cannot cover it | The purchase is financed, or the broker may close it | A short stock position, borrowed and carrying its costs |
| The option row | Gone | Gone |

The short call case is the one worth reading twice. Assigned without the
shares, the account is short stock — an open-ended exposure with no expiration
date, a borrow to maintain, and any dividend across an ex-date owed rather than
received.

## Example: a hypothetical short put assigned overnight

Take the hypothetical 50-strike put this series has been using for its
arithmetic, sold for $1.40 — a $140 credit on one contract — and secured with
$5,000 of cash. The stock drifts below 50 and on a Thursday, after the close,
the holder exercises. All figures here are made up to show the movement.

| Account line | Thursday, before the notice | Friday, after it |
| --- | --- | --- |
| Short 50 put | −1 contract | Gone |
| Shares | None | 100, bought at 50 |
| Cash | $5,000 set aside as collateral | $5,000 paid out |
| Credit from the fill | $140, received weeks ago | $140, untouched |
| What the line responds to | The option's premium | The share price |

The purchase price is 50 because the strike says 50, whatever the stock is
actually trading at on Friday morning. From that point the shares are marked at
the market like any other holding, and that mark is an estimate of what selling
would fetch rather than anything realised.

In a margin account the same put would have held less than $5,000 against it
and the shares would arrive financed instead of paid for outright. The share
purchase itself is identical; what differs is where the money comes from, and
that is your broker's arrangement with you rather than a property of the option.

One figure is easy to forget here: the $5,000 that had been sitting as
collateral is not released back into buying power. It was spent on the shares,
and what stands in its place is a $5,000 stock position with its own
requirement.

## Why do you find out after it has already happened?

The order of events is fixed, and the part of it that decides your morning runs
after the session ends. That is not a failing of anyone's software: exercise
instructions are accepted after the close and processed overnight.

- **The decision is made after the close.** Brokers set their own exercise cutoffs after 4 p.m. Eastern, and the clearing house's own deadline for expiring contracts sits later that evening, so a holder can act on a price nobody can trade against any more.
- **Allocation runs overnight.** The clearing house assigns, firms allocate, and the notice lands in accounts before the next session opens.
- **You hold the result before you read about it.** The shares or the short stock are dated from the exercise date, so any overnight move — or a whole weekend, at expiration — is already yours.
- **There is nothing left to manage on the option.** The only position you can trade on Friday is the stock that replaced it.

This is why a book of short options asks for a kind of attention a book of long
options does not. A long holder's worst case is spent money and a decision they
control; a short seller's worst case begins with a stranger's decision and
arrives already done.

It is also why the amount of [time value left in a
contract](/blog/intrinsic-vs-extrinsic-value-options) matters more than it
looks. A holder who exercises early hands back whatever extrinsic value the
option still carries, which is why early assignment clusters where there is
almost none of it left — deep in the money, late in the contract's life, or
immediately before an ex-dividend date on a short call.

## Frequently asked questions

- **Can I refuse an assignment, or buy the option back once I see the notice?** No. The contract is settled by the time it appears, and there is no option position left to trade. What you can trade is the stock that replaced it.
- **Does being assigned mean I lost money?** Not by itself. Assignment is a settlement event: shares change hands at the strike, the credit received stays in the account, and what the new stock position is worth from then on is a separate question with a separate answer every day.
- **What if I do not have the cash or the shares?** Settlement happens anyway. The purchase is financed or the shares are borrowed, and if the resulting requirement is not met the broker can close the position on its timing rather than yours.
- **Am I more likely to be assigned because I sold first?** It depends on the firm. The clearing house's own step is random, but a broker allocating first-in, first-out reaches older short positions before newer ones — the method is in the account agreement.

## The bottom line

Assignment is the seller's half of exercise: an obligation being used, 100
shares per contract moving at the strike, and the option row leaving the
account without ever being traded out of. Nothing about the amount depends on
what the stock is doing at the time, because the strike settled that in advance.

What it leaves behind is a different position than the one you had — stock
rather than an option, with its own collateral requirement, no expiration date
and, on a short call assigned without shares, no defined limit. The
[foundations series](/blog/foundations) carries on from here with why exercising
early is rare, and the one situation where it is not.

All figures on this page are hypothetical and are there to show the mechanics.
This post is educational and is not investment advice.
