---
title: "Options buying power requirement: what a put and a spread hold"
slug: options-buying-power-requirement
excerpt: A short option reserves part of the account for as long as it is open, and a cash-secured put, a credit spread and a covered call each reserve something different.
meta_description: "Options buying power requirement: a cash-secured put holds the strike, a credit spread its width less credit, until closed, expired or assigned."
author: DeltaMint
category: foundations
series_order: 13
tags: buying power, margin, collateral, cash-secured put, credit spread
---

**Buying power** is the amount a brokerage account can commit to new
positions right now, and an option trade's **buying power reduction** (BPR)
is how much of that amount the trade takes away while it is open. For anyone
who sells options, **the buying power requirement behind each trade** decides
how much else the account can hold, and it is a different number from the
cash balance.

The [previous post on expiration](/blog/what-happens-options-expiration)
ended with collateral released or replaced. This one covers what that
collateral is: what each structure holds in reserve, and what ends the hold.

## Key takeaways

- Buying power is what the account can still commit; the cash balance can be larger than it.
- A cash-secured put reserves the strike times 100 per contract, in cash.
- A credit spread reserves its width times 100, less the credit received.
- A covered call reserves the shares it is written against, not cash.
- The hold ends at close, expiration or assignment, not when the mark improves.

## Why is buying power different from the cash balance?

The **cash balance** is money in the account. Buying power is what remains
available for a new trade after everything already open or working has been
set against it.

Selling an option drives the two figures apart. The premium arrives as cash,
so the balance goes up. At the same moment the broker sets aside collateral
against the obligation just taken on, so buying power goes down, usually by
more than the premium added.

Buying power is commonly reserved in three situations:

- **An open short option.** Collateral stays against it for as long as the position exists.
- **A working order.** Many brokers reserve the requirement of an unfilled opening order.
- **Shares held on margin.** A stock position carries its own requirement, drawn from the same pool.

A bought option is usually paid for in full at the fill and cannot cost
more, so nothing further is held behind it. [Buying a contract and selling one](/blog/what-is-an-options-contract)
are not mirror images, and buying power is where that shows first.

Minimum requirements come from regulators and the exchanges, and each broker
can add its own on top. The figures here follow standard margin-account
rules; a cash, retirement or portfolio-margin account can treat the same
position differently.

## How much buying power does a cash-secured put use?

A **cash-secured put** is a short put with enough cash set aside to buy the
shares if it is assigned. The requirement is the strike times 100, per
contract: $5,000 for one 50-strike put, $15,000 for three.

That figure does not move with the stock. The put can be far out of the money
or deep in it, and the $5,000 stays reserved either way, because assignment
would cost exactly that. Many brokers let the premium received count toward
it, so opening the position needs the strike amount less the credit.

In a margin account a broker can instead margin a short put at a lower
requirement that moves with the stock. The reserve then no longer covers what
assignment would cost; "cash-secured" is the version where the two match.

## How much buying power does a credit spread use?

A **credit spread** sells one option and buys another further from the
money, in the same expiration. The bought leg caps what the pair can lose, so
the broker holds only that capped amount: the difference between the strikes
times 100, per spread. The credit received offsets part of it, which makes
the net reduction (width − credit) × 100.

That net figure is the spread's [maximum loss at
expiration](/blog/credit-spread-max-loss): the collateral is sized to the
worst the two legs can settle for together.

![A hypothetical cash-secured 50 put reserves $5,000, less a $140 premium, while a 50/48 put spread on the same short strike reserves $200, less a $60 credit.](/assets/blog/buying-power-put-vs-spread.svg)

Both positions in that picture are short the same 50 put. One reserves
everything assignment could cost; the other reserves only the width, because
at expiration the long 48 put covers every dollar below 48.

Miss either of two conditions and the short leg can be margined as if it
stood alone:

- **Both legs in one account.** A long put elsewhere offsets nothing.
- **The long leg lasts at least as long.** One that expires first cannot cover the short afterwards, which is why most credit spreads use one expiration.

## What do covered calls and naked options hold?

A **covered call** is a short call written against 100 shares already in the
account. The shares are the collateral, delivered at the strike if the call
is assigned. No cash is reserved, but the shares are committed while the
call is open, and the premium received adds to buying power rather than
reserving any of it. [Covered calls](/blog/covered-call-explained) get their own post in the income series.

A **naked**, or uncovered, short option has no shares and no long leg behind
it. Its requirement comes from a formula in exchange and regulatory rules,
plus whatever the broker adds, recalculated as the stock moves. It can be
substantial and can grow while the position is open. The exact figures
belong to each broker and vary too much to state as a rule.

## Example: one hypothetical account, short the same 50 put two ways

Take a hypothetical margin account with $10,000 in cash and nothing open, so
$10,000 of option buying power — a margin account's stock buying power is
typically larger, because shares can be bought partly on credit. The
premiums below are round numbers chosen to show the arithmetic.

**Case one, a cash-secured put.** The account sells one 50 put for $1.40.
The premium brings the cash balance to $10,140, and $5,000 is reserved
against assignment. Option buying power falls to $5,140, a net reduction of
$4,860.

**Case two, a put credit spread.** The account instead sells the 50 put and
buys the 48 put in one order, for a net credit of $0.60. The cash balance
becomes $10,060, and $200, the $2 width times 100, is reserved. Option
buying power falls to $9,860, a net reduction of $140, which is
(2.00 − 0.60) × 100.

| | Cash-secured 50 put | 50/48 put credit spread | Covered call on 100 shares |
| --- | --- | --- | --- |
| What is reserved | $5,000 in cash | $200, the width | The 100 shares |
| Net reduction | $4,860 | $140 | Shares committed, not cash |
| Moves with the stock | No | No | The shares' own margin value does |
| If the short leg is assigned | $5,000 buys 100 shares at $50 | Shares bought at $50, long 48 put still held; the shares bring their own requirement | Shares delivered at the call's strike |

The two cases carry the same obligation to buy at $50 if assigned, and differ
by $4,720 in what the account can still commit. Neither number says which
position is preferable; each describes only what is held while it is open.

## When does the buying power come back?

Collateral against a short option comes off in one of the same three ways
any contract leaves the account:

- **Closing it.** The reserve is released once the closing order fills, not while it is working.
- **Expiring worthless.** The reserve returns once the broker processes expiration, commonly by the next business day.
- **Assignment.** The reserve is spent: a cash-secured put's $5,000 buys the shares, which bring their own requirement, as the [assignment post](/blog/option-assignment-what-happens) walks through.

![The collateral held against a hypothetical credit spread stays flat from the fill to expiration while the spread's mark moves beneath it, and is released only when the position ends.](/assets/blog/buying-power-hold-flat.svg)

What does not release it is the mark. A spread that has captured most of its
credit ties up the same $200 as the day it filled, under standard margin
rules, and a cash-secured put on a stock far above the strike still holds
$5,000.

A short option marked in the money before expiration releases nothing
either: the obligation is still open, and so is the hold. For these two
structures, only a portfolio-margin account, which recalculates from
modelled risk, moves the number.

That fixed hold is what adds up on a book of positions. Ten spreads on ten
underlyings reserve ten widths at once, each unchanged by how it is doing,
and the account's buying power is whatever is left after all of them.

## Frequently asked questions

- **What is buying power reduction on an option trade?** The amount of buying power a position or working order takes away while it is open.
- **Why did buying power fall by more than the premium received?** The collateral reserved against a short option is usually larger than the credit it brought in.
- **Does cash-secured put collateral come back into buying power?** On a close or a worthless expiration, yes. On assignment it is spent on the shares, which carry their own requirement.
- **Does a credit spread's reduction shrink as it moves in its favour?** Not under standard margin rules.

## The bottom line

The options buying power requirement is set by what the short side could
cost: the whole strike for a cash-secured put, the width less the credit for
a spread, the shares for a covered call, and a moving broker formula for a
naked option.

Whatever the structure, the hold lasts until the position is closed, expires
or is assigned, and a good mark along the way does not shorten it. The
[foundations series](/blog/foundations) continues with [how to read an
option chain](/blog/how-to-read-an-option-chain).

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
