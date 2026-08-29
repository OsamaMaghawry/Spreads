---
title: A spread is one position, not two legs
slug: a-spread-is-one-position-not-two-legs
excerpt: If a tool rebuilds your spreads by matching strikes instead of reading the order they came from, it will eventually invent one.
meta_description: Why grouping option legs by order provenance beats guessing from strikes, and what breaks when a tool guesses after a roll or a partial close.
author: DeltaMint
---

You sent one order. The broker filled it as several executions, and somewhere
downstream a piece of software has to put them back together. How it does that
is not a detail. It decides whether your book shows the positions you actually
have.

There are two ways to do it. One reads where the legs came from. The other looks
at the strikes and guesses.

## Provenance versus resemblance

Every multi-leg order carries an identity. The order has an id, the legs belong
to it, and the executions that fill it reference it. That is provenance: the
legs are one position because they were submitted as one order, and no
inference is required to know it.

Guessing works from resemblance instead. It takes a flat list of executions —
short put here, long put there, same symbol, same expiry, plausible width — and
decides that the ones which look like a spread probably are one. On a clean
account with a handful of positions, resemblance and provenance agree, which is
exactly why the difference is invisible until it isn't.

There is a diagnostic people stumble into without meaning to. A trader comparing
two ways of loading the same account into a journal found that a manual CSV
upload grouped their spreads correctly while the automatic broker sync split the
same trades into legs. Nothing was wrong with the account. The CSV was a
per-order export — one row, both legs, already tied together — so the grouping
was carried in the file. The sync pulled individual executions from the
activities feed, which has no such tie, and reconstructed the pairing from what
the executions looked like. Same data, same trades, two different books, and the
one that came from the file was right because the file preserved the provenance
that the feed had thrown away.

## Four things that break when a tool guesses

**Invented spreads.** The classic version pairs each short leg to the first
protective long it finds rather than the nearest one. Run two put spreads on the
same underlying and expiry — say one at 100/95 and, opened a week later, another
at 105/100 — and a first-match pairing can bolt the 105 short onto the 95 long.
The result is a 10-wide spread that was never traded, sitting in the book with a
max loss more than double the real one, while the two positions you actually
have are nowhere.

**Orphaned shorts.** The mirror image. When the guess consumes the wrong long,
some real short is left with nothing behind it. A short call with no long against
it and no shares behind it is a naked position, and a book that shows one when
you do not have one is worse than a book that shows nothing — you will go
looking for a risk that isn't there and stop trusting the screen when you can't
find it.

**Dropped costs.** The failure that flatters. If an unmatched long leg is simply
discarded rather than written down, the position keeps the full credit from the
short and loses the debit paid for the protection. The recorded trade collects
more than the real one did and shows a smaller risk than the real one carried.
Nothing on screen looks broken. The arithmetic is just quietly wrong in the
direction nobody audits.

**Wheel legs merged into option legs.** When a short put is assigned, two
separate things happen: the option's premium is kept in full, and a stock
position appears at the strike. They are different numbers with different
outcomes. Adding them into one realised figure hides which half of the cycle
did what, and once merged they cannot be pulled apart again.

## Rolls and partial closes are where it actually bites

The cases above are demonstrable on a quiet account. Two situations produce them
routinely.

**A roll** is typically one order with four legs: close the near short, close the
near long, open the far short, open the far long. To a strike-matcher those
arrive as four executions with two shorts and two longs on the same underlying,
often at the same strikes, differing only by expiration. Ignore expiry for a
moment — as any pairing heuristic that leans on strike proximity is tempted to —
and it can pair the closing short against the opening long, produce a spread that
existed for zero seconds, and leave the position you rolled into unaccounted for.

**A partial close** breaks a different assumption. Close four contracts of a
ten-lot spread and the executions look like a small opening trade in the
opposite direction: buying shorts, selling longs. A tool that treats each
execution as its own event can record a brand-new four-lot debit spread instead
of reducing the position that already exists. Now the book has a ten-lot that is
really a six, plus a four-lot that does not exist, and the collateral figure is
wrong in both directions at once.

Neither of these is exotic. They are Tuesday afternoon.

## What holding provenance actually requires

Reading the order id is the easy half. The rest is what you do when it is not
enough.

Legs genuinely can arrive unpaired — you legged in as two separate orders, or a
leg filled and its partner did not. Provenance cannot invent a link that was
never there, so the fallback matters: in DeltaMint, a short pairs to the
*nearest* protective long rather than the first one found, which is the
difference between reconstructing the spread you traded and manufacturing a
wider one you did not.

And nothing unmatched gets thrown away. An unpaired leg is written down and
flagged as unpaired, because a visible orphan is a question you can answer and a
dropped one is a cost that silently never happened. Premium and shares stay as
separate linked records for the same reason: an assigned short keeps its full
premium, the result lands on the stock, and both stay legible afterwards.

The point of all of it is narrow. The unit is the position you put on — through
a roll, through a partial close, through an assignment — not the executions your
broker happened to report it in.

This post is educational and is not investment advice.
