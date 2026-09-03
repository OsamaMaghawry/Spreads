---
title: What an options contract actually is
slug: what-is-an-options-contract
excerpt: An option is a contract on 100 shares, and what it does to your account depends on which side of the contract you take.
meta_description: An option's textbook definition doesn't show what happens in your account. What buying and selling one actually does to cash and buying power.
author: DeltaMint
category: foundations
series_order: 1
tags: options contract, buying power, premium, cash-secured put, foundations
---

An options contract is a right for one side and an obligation for the other,
both tied to 100 shares of one underlying stock, at a fixed price, until a
fixed date. That definition is accurate, and it is also close to useless the
first time you actually place the trade. It doesn't say what your account
shows five minutes later, what changed in your cash balance, or what changed
in the number your broker calls buying power. Those are the parts that matter
once you've stopped reading about options and started looking at your own
account.

This post covers the account side: what a contract is made of, and what
happens on each side of the trade — buying one versus selling one — because
those two are not mirror images of each other in the way a lot of
explanations imply.

## A contract on 100 shares, not a share itself

One listed equity option contract covers 100 shares of its underlying stock.
The premium you see quoted on a chain — say $2.50 — is a per-share price, and
the contract multiplies it by 100. Buy one contract at $2.50 and the cost is
$250, not $2.50, and every dollar figure downstream of the premium carries
that same multiplier.

A call is the right to buy the 100 shares at the strike price; a put is the
right to sell them at the strike price. Whoever holds that right is the
buyer. Whoever sold the contract took on the matching obligation — to sell
the shares if a call they wrote is exercised, or to buy them if a put they
wrote is exercised — in exchange for the premium the buyer paid. Both sides
are looking at the same contract and the same 100 shares; they hold opposite
ends of it. Which side you're on is the single biggest thing that determines
what shows up in your account, which is why it's worth walking through
separately rather than as one blended "here's what an option is."

The contract is a derivative in the literal sense — its value derives from
the underlying stock's price — but in your account it is not the stock. It
is its own line, with its own symbol, its own multiplier, and its own
expiration date sitting on the calendar independent of anything the stock
itself does.

## Buying an option debits cash and nothing else, at first

Buy a call or a put to open a position and the mechanics are the simplest
version of an option trade. The premium, times 100, times the number of
contracts, comes out of your cash balance as a debit. Your account's buying
power — what you have left to place another trade — goes down by the same
amount. Nothing else happens yet. No shares appear, because you haven't
bought the stock; you've bought the right to buy it later, and only if you
choose to.

That debit is also the entire risk of the position. Once the premium is
paid, the most that trade can cost you is already spent — the contract can
expire worthless and nothing further is owed. That is a real and useful
property of buying options, and it is also the reason a bought option's risk
is easy to describe and a sold option's is not: the buyer's downside is
capped at a number fixed the moment the order fills.

## Selling an option credits cash — and holds collateral behind it

Selling to open, sometimes called writing, runs the cash flow the other
direction and adds a second effect buying doesn't have. The premium is
credited to your account immediately — sell that same $2.50 option and $250
lands in cash right away. But because you've taken on an obligation rather
than a right, your broker has to make sure you can meet it if the buyer
exercises, and that means holding something back.

For a cash-secured put, what gets held is close to the full obligation: the
strike price times 100 shares, because that's what you'd owe if assigned.
Sell a $90 put and a cash-secured account holds roughly $9,000 of buying
power against it — not $9,000 minus the premium, the full strike value,
because the premium you received doesn't reduce what you'd have to pay if
the shares actually get put to you. For a covered call, the collateral isn't
cash at all; it's the 100 shares you already hold, which is the entire
reason it's called "covered." Either way, something in the account is now
earmarked for the obligation, sized to what the obligation could cost — not
to what you were paid to take it on.

![Buying a call debits $250 and reduces buying power by the same amount, with no shares appearing; selling a cash-secured put credits $180 but holds $9,000 of buying power against the obligation.](/assets/blog/buy-call-vs-sell-put-account-effect.svg)

That asymmetry — a capped, spent debit on one side, an open-ended obligation
sized by collateral on the other — is the actual difference between buying
and selling, and it's a bigger difference than call versus put.

## The date on the contract is the one number that doesn't bend

Every option carries an expiration date, and unlike the strike or the
premium, it isn't a number you negotiate or that the market reprices for
you — it's a deadline. Past it, the contract stops existing. Most US listed
equity options are American-style, meaning the right to exercise technically
exists on any business day up to expiration rather than only on the last
one, though exercising early is uncommon enough that it's worth its own post
rather than a caveat here. What matters for a first look at a contract is
simpler: the date is real, it's on the calendar the moment you open the
position, and it forces the position to resolve — expire, get exercised, or
get closed — whether or not you've decided what you want to happen.

## One hypothetical call and one hypothetical put, side by side

None of the above is a suggestion to place either trade; the numbers exist
only to make the mechanics concrete. Suppose, purely hypothetically, an
account buys one call at a $100 strike for $2.50, and separately sells one
cash-secured put at a $90 strike for $1.80. Two unrelated contracts, on the
same day, in the same account, laid out side by side:

| | Buy 1 call, 100 strike | Sell 1 put, 90 strike |
| --- | --- | --- |
| Premium | $2.50 | $1.80 |
| Cash effect at the fill | −$250 | +$180 |
| Buying power effect | −$250 | −$9,000 |
| What you hold | A right | An obligation |
| Shares in the account | None | None, unless assigned |
| Max loss, as defined here | $250 | $8,820 |

The last row is worth sitting with. The bought call has a loss that is
capped and already known — $250, in full, the moment the order fills. The
sold put's is bounded too, just by a bigger number: a stock can't trade
below zero, so the worst case is the $9,000 strike value minus the $180
already collected — $8,820, if the stock went to zero before expiration.
Both are defined. The put's is simply large enough that "defined" doesn't
feel like the same word.

## In your account, the contract becomes one row, not a mystery

Whichever side of a contract you're on, what lands in your account after the
fill is one position: a symbol, a strike, an expiration, a quantity, and
whatever cash or collateral it changed. That's true for a single contract.
It stops being simple the moment you're running more than one at a time on
the same underlying — a credit spread, a covered call against shares you
already hold, two puts at different strikes — because now something has to
decide which legs belong together as one position instead of listing them as
unrelated rows. DeltaMint reads that structure from the broker's own order,
rather than guessing from strikes after the fact, which is
[a different problem from the one this post covers](/blog/options-journal-splits-spreads-into-legs)
but the one you run into next.

This is the first post in DeltaMint's foundations series — for the rest of
the vocabulary, from strikes to assignment, see the
[foundations hub](/blog/foundations).

This post is educational and is not investment advice.
