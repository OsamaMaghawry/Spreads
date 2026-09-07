---
title: What is an options contract — and what lands in your account
slug: what-is-an-options-contract
excerpt: Every field on a listed option is fixed before you arrive except the price, and what lands in your account afterwards depends on which side of it you took.
meta_description: An options contract is standardised — every field but the price is fixed before you trade it. What the 100 multiplier costs, and what a sold one ties up.
author: DeltaMint
category: foundations
series_order: 1
tags: options contract, contract specs, multiplier, long and short, foundations
---

An options contract is a right, for one side, to buy or sell 100 shares at a
set price on or before a set date — and the matching obligation for the other. That is
the definition every page gives, and on its own it is close to useless: it
describes a legal relationship rather than the thing you will be looking at.
What you will be looking at is a line in a brokerage account with a sign in
front of the quantity, a number beside it that moves every few seconds, and
possibly a chunk of cash that has stopped being spendable.

So take the question from the other end. Two facts carry everything else in
options. A listed option is a **standardised product** — almost every field is
fixed before anyone trades it, and the only one left open is the price. And once
you have bought or sold one, a predictable set of things changes in your
account, with the two sides changing different things.

## Every field on the contract except the price is fixed before you arrive

An options contract is not something you negotiate with a counterparty. It is a
product an exchange has listed, the way a shoe size is listed: you take one off
the shelf or you do not.

Six things are settled before you look at it:

- **Underlying** — the stock or index the contract references.
- **Contract size** — essentially always 100 shares for a US equity option.
- **Expiration date** — a calendar day the exchange chose.
- **Strike price** — one of a listed set, spaced commonly $1, $2.50 or $5
  apart depending on the stock and how close the strike sits to the money.
- **Type** — call or put.
- **Exercise style** — American or European, which decides whether the holder
  can act before expiration or only at it.

That leaves the premium, and the premium is the whole of the trading. Two
people transacting an option agree on one number and inherit six others from
the listing.

Two things follow from that sameness. Your 50-strike December call is the
identical instrument to everyone else's, so it is fungible and a market can
exist in it. And once a trade clears, the clearing house stands between the two
sides as counterparty to each — you are not tied to whoever took the other side
of your fill, and never need to find them again to get out.

![A single listed contract broken into four of the fields the exchange fixes and the one field the market sets, with the 100 multiplier turning a per-share quote into dollars per contract.](/assets/blog/options-contract-fixed-fields.svg)

| Field | Who sets it | Can it change after your fill |
| --- | --- | --- |
| Underlying | Exchange, at listing | Only on a corporate action (the deliverable is adjusted) |
| Contract size (100 shares) | Exchange, at listing | Only on a split or corporate action |
| Expiration date | Exchange, at listing | No |
| Strike price | Exchange, at listing | Only on a split or corporate action |
| Type — call or put | Exchange, at listing | No |
| Exercise style | Exchange, at listing | No |
| Premium | The two people trading it | Constantly, while it stays listed |

## One contract is 100 shares, so a $1.20 quote costs $120

The most common early mistake is not conceptual, it is arithmetic. Option prices
are quoted per share and traded per contract, and nothing on the screen shouts
about the factor of 100 sitting between them.

The contract in that heading is hypothetical, there purely to show the
multiplication: XYZ, December expiration, 50 strike, call, quoted at $1.20. The
$1.20 is per share; one contract covers 100 shares; so one contract costs $120
before fees, and ten of them is a $1,200 debit.

The same multiplier applies to what the contract references. That 50 strike is
$50 per share on 100 shares — $5,000 of stock standing behind a contract that
cost $120. Reading "$1.20" and filing it away as a small position is looking at
the price of the contract instead of at what it is attached to. Both figures are
real, and in this made-up case they differ by about forty times.

It is also why the arithmetic of a two-legged structure needs nothing clever:
per-share numbers, times 100, added up. When a later post computes the [max loss
on a credit spread](/blog/return-on-risk-vs-return-on-capital) as the width
between the strikes times 100 minus the credit, that 100 is this same
multiplier.

## Buying a contract and selling one are not the same trade in reverse

Here is what the definition sentence flattens. The buyer gets a right and the
seller carries an obligation — accurate, but it makes the two sound like mirror
images. In an account they are not symmetric at all.

Buy a contract and you pay for it in full at the fill. Cash leaves; a position
with a positive quantity arrives, and what you paid is the entire amount that
line can ever cost you. An option you own cannot turn into a liability, so
nothing further is reserved — you have already spent everything it will demand.

Sell a contract and cash arrives instead. What you hold now is a position with a
negative quantity, and the credit received is emphatically not the extent of
what the line can do. A short option can be worth more later than it was when
you sold it, so the broker reserves collateral behind it — cash, stock, or a
long option, depending on the structure. That reservation is not a fee and it is
not gone: it is spendable money that has stopped being spendable, for the whole
life of the position. How much gets held for which structure is a subject of its
own.

![The same contract from both sides after the fill: quantity plus one with the debit paid and nothing held, against quantity minus one with the credit received and collateral reserved until the line leaves the account.](/assets/blog/contract-bought-vs-sold.svg)

The asymmetry that matters most is about who decides. A long holder chooses
whether to exercise — except at expiration itself, where an option finishing in
the money is exercised automatically unless the holder instructs otherwise, so
doing nothing is itself a choice on the last day. A short holder chooses
nothing at all — assignment arrives, is reported after the fact, and is
allocated by a process the seller has no input into. That one difference is why
a book of short positions demands attention that a book of long ones does not.

## In your account it is one line, and the sign on the quantity carries the meaning

Strip the vocabulary away and an option position is a row. It shows the
contract's identity — underlying, expiration, strike, type, usually mashed into
one long symbol — plus a quantity, what you paid or received, and a mark.

The sign on that quantity does more work than any other character on the screen.
**+1** means the right is yours. **−1** means the obligation is yours, and that
collateral is being held behind it. Two rows that differ by a minus sign are
opposite in every consequence: who decides, what is at stake, whether cash came
in or went out.

The mark deserves one caution. It is usually the midpoint of the current bid
and ask, multiplied out — a quote, not a result, until the position is closed
or expires. A short option marked above the credit received is not a loss that
has happened; it is an estimate of what closing would cost, and the real cost
of buying it back sits nearer the ask.

And a spread is not a special kind of contract. It is two of these ordinary
lines, one positive and one negative, submitted as a single order. No exchange
lists a product called a put credit spread. Brokers commonly report the two
fills separately, which is why [software has to group the legs back into the
position you actually traded](/blog/options-journal-splits-spreads-into-legs)
instead of leaving you to do it in your head.

## A contract leaves your account in exactly three ways

Whatever happens in between, an option position ends one of three ways, and
knowing the list is short removes a lot of anxiety.

- **You close it.** You trade the identical contract in the opposite direction
  — sell what you bought, buy back what you sold — and the rows net to
  nothing. Because contracts are fungible you close against whoever is
  willing, not against your original counterparty.
- **It expires.** Expiration arrives with the strike on the wrong side for the
  holder, nobody exercises, and the line disappears. The buyer's debit is
  spent; the seller keeps the credit and the collateral is released.
- **It is exercised or assigned.** The holder uses the right and 100 shares
  per contract change hands at the strike — or, on a cash-settled index
  option, a cash difference is paid instead of shares moving.

The third one surprises people, and it is worth being precise about why. On a
stock option the line vanishes and a stock position appears, or disappears, in
its place. What replaces the option is a different instrument, with its own
collateral requirement and no expiration date at all.

Which exit is likely, and what each costs, are separate questions with separate
posts. The set itself never gets longer than three.

## What the contract itself refuses to tell you

The specification is complete and silent on everything a trader wants to know.
The listing does not say whether $1.20 is a fair price for that call, how
probable a breach of the strike is, or what the premium does as expiration
approaches. Those are questions about pricing and probability rather than about
the contract, and the rest of the [foundations
series](/blog/foundations) takes them one at a time.

What the contract does give you is exactness. Because every field but one is
fixed, the most a defined-risk structure can lose at expiration is an
arithmetic fact rather than an estimate, computable the moment the order fills
— what the mark does in between is a separate question, taken up when a later
post gets to it. That is the property the later material on ranking positions
and managing a book rests on. Both take "what a contract is" as given, which is
why this one comes first.

This post is educational and is not investment advice.
