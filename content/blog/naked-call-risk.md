---
title: "Naked call risk: how a covered short call turns uncovered"
search_title: "Naked Call Risk: When a Covered Call Turns Uncovered"
slug: naked-call-risk
excerpt: A short call is covered only while the shares or the long call behind it stay in the account, and several ordinary trades remove them without touching the call.
meta_description: "Naked call risk: five routine trades that leave a covered call or call spread naked, the loss priced past the strike, and where approval levels stop them."
author: Osama Safwat Maghawry
category: managing
series_order: 58
tags: naked call, uncovered call, covered call, call credit spread, assignment
---

A **naked call**, or uncovered call, is a short call option with neither 100 shares of the stock nor a long call on the same stock behind it in the same account. If assigned, the seller must deliver shares they do not hold, and since a stock has no ceiling, neither does the loss above the strike. A call can become naked without the holder ever choosing to sell one: the call started covered, and the cover left first.

This post closes the [After the fill](/blog/managing) series. It builds on the [covered call](/blog/covered-call-explained) and the [call credit spread](/blog/call-credit-spread-explained), and reuses their hypothetical XYZ chain to show mechanics, not results.

Key Takeaways:

- **Cover is a pairing.** The same call is covered or naked depending on what else the account holds.
- **The cover can leave first.** A share sale or a long call closed or expired leaves the short call alone.
- **The uncovered loss has no cap.** Past the strike plus the premium, each dollar costs $100 per contract.
- **Approval refuses orders only where it is missing.** In an account approved for uncovered calls, each of these trades can go through.

## A short call is covered only while something sits behind it

A short call is an obligation to sell 100 shares at the strike if assigned. Whether it is covered is not written on the contract; it depends on what else the account holds on the same stock at that moment.

Two things can stand behind a short call:

- **100 shares.** Assignment delivers them, and what the call loses above the strike, the shares gain.
- **A long call expiring no earlier.** Struck above the short, it caps the loss at the width less the credit; struck below, as in a [poor man's covered call](/blog/poor-mans-covered-call), it can be exercised for the shares.

The pairing holds only while both halves are in the same account. Remove the shares or the long call and the short call is still open, at the same mark, with nothing behind it. What changes is what a rise in the stock can cost.

## What an uncovered call can lose, against the covered version

Take the earlier covered call: 100 hypothetical XYZ shares bought at $48.00, and one 30-day 52 call sold at its 1.42 bid. Above 52, the shares' rise matches the call's loss dollar for dollar, so the position stops at 5.42 per share. Now remove the shares.

![A hypothetical short 52 call held with 100 shares goes flat above the strike; held alone, it falls without a floor.](/assets/blog/naked-call-risk-covered-vs-uncovered.svg)

Alone, the call keeps its 1.42 at any close up to 52, breaks even at 53.42, and from there loses $100 per contract for each dollar XYZ rises. Nothing in the account rises with the stock, so there is no second plateau.

The covered version has risk too: below 46.58 the position loses money, and the premium cushions only 1.42 of a fall toward zero. The two are exposed in opposite directions, so losing the shares changes the position rather than shrinking it.

Losing the cover changes three more things:

- **Margin.** An uncovered call's requirement is a formula recalculated as the stock moves, so it grows as the stock rises; see the [buying power post](/blog/options-buying-power-requirement).
- **Assignment.** With no shares to deliver, a margin account is left short 100 shares at the strike, bought back at the market's price.
- **Dividends.** Short shares owe any dividend across the ex-date, when [early exercise](/blog/early-exercise-options) of calls clusters.

## How does a covered call or call spread become naked?

Five ordinary trades do it, and none is a decision to sell a naked call. Each is a routine step, taken in an order that leaves the short call alone for a while, or for good.

| The trade | What leaves | What is left behind the call |
| --- | --- | --- |
| Shares sold, call still open | 100 shares | Nothing |
| Spread's long call sold first | The long call | Nothing |
| Spread legged in, short filled alone | Long never arrives | Nothing, until it fills |
| Diagonal short rolled past its long call | The pairing at the roll; the long at its expiry | Nothing, or exercised shares |
| Roll legged, new call sold first | Nothing; a second short arrives | 100 shares for two calls |

The first can happen on the [wheel](/blog/wheel-strategy-explained): shares from an assigned put, a call sold on them, then the shares sold on their own. In an account approved for uncovered calls, the sale can go through.

The second and third are legging. Selling the long call first leaves the short alone until the buy-back fills; opening with two orders can fill the short and leave the long working, as the [partial fill post](/blog/partial-fill-options-spread) shows for puts.

The fourth is a roll that outruns its cover. A long call covers only a short call that expires no later, so rolling the short call of a [diagonal](/blog/diagonal-spread-explained) past the long call's expiration leaves the new short reserved as uncovered from the fill. The long then expires first: worthless if out of the money, or typically exercised into 100 shares, which then cover the short if the account can pay for them.

The fifth is a [roll](/blog/rolling-options-explained) done as two orders, new call first: until the old one is bought back, one of two calls is uncovered.

## Worked example: shares sold, covered call still open

A hypothetical account holds the covered call above: 100 XYZ shares bought at $48.00 and one short 52 call sold for $142, now with 20 days left. The account is approved for uncovered calls. With XYZ at $51.00, the trader sells the shares for $5,100, meaning to buy the call back later.

The sale fills and the call's mark is unchanged. The account now holds a short 52 call with nothing behind it, reserved under the uncovered-call formula.

The table settles that call at four hypothetical closes. The last column is what the shares would have added above 52: the offset the sale removed.

| XYZ at expiration | Settling the call costs | Net of the $142 | Shares' rise above 52 |
| --- | --- | --- | --- |
| $51.00 | Nothing | +$142 | None |
| $56.00 | $400 | -$258 | $400 |
| $60.00 | $800 | -$658 | $800 |
| $70.00 | $1,800 | -$1,658 | $1,800 |

Above the strike, the second and fourth columns match. That is what covered meant: the same obligation, paid by the shares instead of cash. Assigned at $70.00, the account is short 100 shares at $52, and buying them back at $70 costs $1,800 more than the $5,200 the sale at the strike brought in, plus any dividend owed.

## Approval levels decide whether the account allows it at all

Brokers commonly sort options permissions into levels. Covered calls and many spreads sit lower, and uncovered calls usually sit at the highest, which typically needs a margin account. Each broker sets its own rules.

Without uncovered-call approval, most trades in the table are stopped at entry: a sale of shares that cover a call, or a sell-to-close of the long leg under a short, is commonly rejected. That protection works by refusal, not by a cap.

Its gap is the approved account, where nothing refuses anything. There, a diagonal's short rolled past its long can go through, and when the long expires no order is involved at all; if the requirement is not met, the broker may ask for margin or close positions under its agreement.

On a book of many short calls, each one can be read against what is behind it: same account, expiring no earlier. [Options position alerts](/blog/options-position-alerts) covers the conditions worth watching on a spread.

## Frequently asked questions

**Can you sell the shares while a covered call is open?** Without uncovered-call approval, commonly not: the shares are held against the call, so the sale is rejected or the call has to be bought back first. In an account approved for uncovered calls, the sale can go through and leaves the call naked, as in the worked example above.

**Can a covered call turn naked when the shares are called away?** Not through its own assignment, which delivers the shares and removes the call in one step. It turns naked when the shares leave by another route, such as a sale, while the call stays.

**Does a call credit spread become a naked call at expiration?** No. If only the short finishes in the money, it is typically assigned and the long expires, leaving short shares, not a short call, as the [assignment risk post](/blog/assignment-risk-credit-spread) shows on a call spread.

**Is a naked put as risky as a naked call?** A naked put's loss stops when the stock reaches zero, at the strike less the premium, times 100. A naked call's has no such stop.

## The bottom line

A short call is covered by what sits behind it. If the shares are sold, the long call is closed first, the short is rolled past the long call's expiration, or a roll is legged backwards, the same call is naked, with no cap on the loss past the strike plus the premium.

Approval levels stop those trades only where the permission is missing; in an approved account each one can go through. Each short call can be read against its cover.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
