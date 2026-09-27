---
title: "Cash-secured put explained, from reserved cash to assignment"
slug: cash-secured-put-explained
excerpt: A cash-secured put is a short put backed by cash equal to the strike, and it ends with that cash spent on shares or the premium simply kept.
meta_description: "Cash-secured put explained: the strike times 100 held until the put ends, the premium kept either way, and that cash spent on shares if assigned."
author: DeltaMint
category: income
series_order: 16
tags: cash-secured put, income, assignment, buying power, options
---

A **cash-secured put** is a short put option backed by cash equal to the
strike price times 100, set aside in the account so the money to buy the
shares is already there if the put is assigned. The seller receives a
premium up front, and in exchange takes on the obligation to buy 100 shares
at the strike price if the holder exercises.

This post continues the [income series](/blog/income) opened by the
[covered call](/blog/covered-call-explained). It reuses the same hypothetical
50-strike put and $1.40 premium already established in the [buying power
post](/blog/options-buying-power-requirement), and it ends the same way that
post did: with what the account actually holds afterward.

## Key takeaways

- "Secured" means the full purchase cost sits in cash already, not on margin.
- The premium is kept whether or not the put is ever assigned.
- Below the strike, the position falls with the stock dollar for dollar, cushioned only by the premium.
- At or above the strike, the most the put returns is the premium already collected.
- After assignment the account holds shares bought at the strike, not cash.

## What does "secured" mean in a cash-secured put?

A put seller takes on an obligation: buy 100 shares at the strike if
assigned. "Cash-secured" describes how that obligation is backed — with cash
already reserved in the account, rather than with margin.

The alternative is a **naked put**, a short put with no cash set aside
against it. A naked put's requirement comes from a formula in exchange and
broker rules instead of the full strike, and it moves as the stock does,
which is why many accounts need a higher options approval level to sell one.
Cash-secured is the version where the reserve matches exactly what
assignment would cost.

That reserve does not shrink as the trade goes well. As the [buying power
post](/blog/options-buying-power-requirement) covers in more detail:

- **The hold is the strike, not a formula.** $5,000 for one 50-strike put, regardless of where the stock trades.
- **The premium can offset part of it.** Many brokers let the credit received count toward the reserve at the open.
- **The hold ends at close, expiration or assignment.** A good mark along the way releases nothing.

A cash account can typically sell a cash-secured put without any special
margin approval, because nothing is borrowed against it — the reserve is
cash the account already holds. That usually makes it one of the lower
options approval tiers a broker offers, well below what a naked call or an
uncovered straddle requires, since the broker is never exposed beyond the
cash already set aside.

## Example: one hypothetical cash-secured put on XYZ

A hypothetical trader is willing to own XYZ at $50.00, while the stock
trades at $52.00. Selling one 30-day 50 put for $1.40 brings in
1.40 × 100 = $140 in cash at the fill, and reserves $5,000 against the
obligation to buy 100 shares at $50 if assigned.

Two numbers follow. The break-even, if assigned, is $50.00 − $1.40 = $48.60
per share — less than the $52.00 the stock traded at when the put was sold.
The most the put alone can return is the $140 premium, however high XYZ
goes, because nothing above the strike is owed and nothing above the strike
is collected.

These figures describe mechanics only, not a forecast. The table takes the
two ways the put can finish, using a close of $53.00 for one and $47.00 for
the other.

| At expiration | XYZ closes at $53.00, above the strike | XYZ closes at $47.00, below the strike |
| --- | --- | --- |
| The put | Expires worthless | Assigned |
| The cash reserved | Released, $5,000 free again | Spent, $5,000 buys 100 shares |
| The $140 premium | Kept | Kept |
| Stock finishing below $50 | Did not happen | 100 shares owned at an effective $48.60 |
| What the account holds | Cash only, no position | 100 shares, no short put |

In the first case nothing is bought: the put disappears and the $5,000
reserve is free again. In the second, the shares arrive at $50.00 while the
stock trades at $47.00, an unrealized $1.60 per share below the effective
$48.60 cost — smaller than the $5.00 a trader who simply bought at $52.00
would be under.

## A cash-secured put trades premium for a purchase obligation, not a discount

Above the strike, the put pays only the premium, however far the stock
climbs. Below the strike, the position falls with the stock, cushioned by
that same premium and nothing more.

![Below the 50 strike a hypothetical cash-secured put loses with the stock dollar for dollar, crossing zero at a break-even of 48.60, then flattens at the 1.40 premium kept for every price at or above the strike.](/assets/blog/cash-secured-put-payoff.svg)

The premium is not a discount on the stock — it is compensation for taking
on the obligation to buy at a fixed price no matter how far the stock falls.
If XYZ closes at $40.00, the put is assigned at $50.00 regardless, the
$5,000 buys shares worth $4,000, and the $140 premium offsets only $1.40 of
the $10.00 per-share gap. The reserved cash does not grow to protect against
that outcome; it only ever covers the $50.00 purchase.

That single line of protection does not change with the size of the move. A
stock that finishes $2 below the strike gets the same $1.40 cushion as one
that finishes $12 below it — only the size of the unrealized loss on the
shares changes, not what the premium was compensating for in the first
place.

## How does a cash-secured put end?

A cash-secured put leaves in one of the [three ways any contract
can](/blog/what-is-an-options-contract), and each decides what the reserved
cash becomes:

- **It expires out of the money.** The put disappears, and the $5,000 reserve returns to buying power.
- **It is assigned.** The $5,000 buys 100 shares at the strike, and the reserve is spent rather than released.
- **The seller buys it back.** That costs whatever the market asks then; the reserve is released once the closing order fills.

Assignment need not wait for expiration. An American-style put can be
exercised on any trading day, though early exercise of a put is
[usually the less common case](/blog/early-exercise-options), most often
seen deep in the money when the holder would rather collect interest on the
strike proceeds sooner than hold the contract.

## What does the account look like the morning after assignment?

Take the second case from the table: XYZ closes at $47.00 on expiration
Friday, and the 50 put is exercised automatically. The assignment notice
usually shows up before Monday's open, though it can arrive later. Once it
does, the account shows:

- **Cash.** Down $5,000, spent on the shares; the $140 premium is already in from weeks earlier.
- **Shares.** 100 XYZ, bought at $50.00 regardless of the $47.00 close.
- **Short put.** Gone. Assignment removed the line; nothing is left to buy back.
- **Buying power.** The $5,000 reserve does not return — it is now shares instead of cash, and the shares carry their own requirement, as the [assignment post](/blog/option-assignment-what-happens) walks through.

The account history typically records the assignment and the share purchase
at the strike as one or two rows, weeks after the premium that started the
position, so reading the whole trade back from the history takes some
assembly. The premium itself sits in a separate row, dated the day the put
was sold, and nothing in the ledger ties the rows together automatically.

## Cash-secured put vs covered call: the same premium, opposite obligation

A cash-secured put and a [covered call](/blog/covered-call-explained) both
sell an option for a premium and both cap what a single stock move can
return. What differs is which side of owning the stock each one sits on.

| | Cash-secured put | Covered call |
| --- | --- | --- |
| What is reserved | Cash equal to the strike | 100 shares already owned |
| Obligation if assigned | Buy 100 shares at the strike | Sell 100 shares at the strike |
| Before assignment | No shares owned | Shares owned |
| After assignment | Shares owned, cash spent | Cash held, shares gone |
| What caps the return | The premium, above the strike | Strike minus share cost, plus the premium |

Selling a cash-secured put to acquire shares, then later selling a covered
call against those same shares, chains the two positions together — put
first, call second, on the same underlying stock.

## Frequently asked questions

- **Is the premium kept if a cash-secured put is assigned?** Yes; it was paid at the fill, before assignment is even possible.
- **Does the cash reserve grow if the stock keeps falling?** No. It is fixed at the strike times 100 from the moment the put is sold.
- **Can a cash-secured put be assigned early?** Yes, on American-style options, though it is uncommon outside a deep in-the-money put.
- **Cash-secured put vs a naked put?** A cash-secured put has the full purchase cost already reserved; a naked put is backed by a smaller, moving margin requirement instead.
- **What happens when a cash-secured put is assigned?** The reserved cash buys 100 shares at the strike, the short put disappears, and the premium already received stays in the account.

## The bottom line

A cash-secured put trades a fixed premium for an obligation to buy 100
shares at the strike, backed by cash reserved for exactly that purchase.
The premium is kept however the put ends, and it is the only cushion the
position has if the stock falls further.

The position ends with the cash reserve released, or spent on shares at the
strike. The day after assignment, the account holds shares bought at that
strike price, not the cash that used to secure them.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
