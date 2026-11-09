---
title: "Adjusting an iron condor: what rolling the tested wing does to credit and max loss"
slug: adjust-iron-condor
search_title: "Adjust an Iron Condor: Close or Roll the Tested Side"
excerpt: When one wing of an iron condor is tested, closing it or rolling it are new trades at today's prices. Each one changes the credit and the maximum loss, and neither erases the loss already on the wing.
meta_description: "Adjust a tested iron condor: close the wing or roll it down. The new credit, max loss and break-evens on one hypothetical trade, and the loss that stays."
author: Osama Safwat Maghawry
category: managing
series_order: 54
tags: iron condor, adjustment, rolling, max loss, credit spread
---

**Adjusting an iron condor** means changing one or more of its four legs after the position is open, usually because the stock has moved toward one of the short strikes and that side of the condor is being tested. The two common changes are closing the tested wing and rolling it to new strikes. Both are new trades, priced at today's quotes, and both change the credit and the maximum loss of what remains.

This post continues from [iron condor explained](/blog/iron-condor-explained) and uses the same hypothetical position, so the starting numbers are the ones from that post. It sits in the [After the fill](/blog/managing) series, which is about what a position needs once it exists.

Key Takeaways:

- **An adjustment is a new trade.** It is filled at today's bids and asks, not at the prices of the original trade, and it can only be judged by what the position looks like afterward.
- **The loss on the tested wing is already there.** Closing or rolling it makes that loss realized. It does not remove it.
- **Rolling down buys room by spending credit.** Moving the tested wing further from the stock costs a net debit, which lowers the total credit and raises the maximum loss.
- **Closing one wing leaves a single spread.** What remains has a larger maximum loss, because the debit paid to close the wing is added to what the remaining wing can still lose.

## What does an adjustment actually change?

Start with the hypothetical XYZ condor: sell the 48 put, buy the 46 put, sell the 52 call, buy the 54 call, for a total credit of 1.03 ($103). Each wing is $2.00 wide, so the maximum loss is ($2.00 - $1.03) x 100, or $97. The break-evens are 46.97 and 53.03.

Fifteen days before expiration, XYZ has fallen from 50.00 to 47.00. The put wing is now the tested one: the 48 put is 1.00 in the money and the 46 put is 1.00 out of it. The call wing is far from the stock and almost worthless. Hypothetical quotes for the options that matter:

| Strike | Put bid | Put ask | Call bid | Call ask |
| --- | --- | --- | --- | --- |
| 44 | 0.20 | 0.25 | n/a | n/a |
| 46 | 0.70 | 0.76 | n/a | n/a |
| 48 | 1.75 | 1.85 | n/a | n/a |
| 52 | n/a | n/a | 0.10 | 0.14 |
| 54 | n/a | n/a | 0.02 | 0.04 |

These quotes assume implied volatility fell while the stock dropped, which is not the usual pairing, so treat them as one hypothetical set. An adjustment prices off these numbers and nothing else. The 0.54 credit the put wing brought in is a fact about the past. What it costs to leave or move the wing today is a fact about this table.

- **The unrealized loss is real money.** Buying the put wing back costs 1.85 - 0.70 = 1.15 per share, against the 0.54 it paid, so the wing is down 0.61.
- **The call wing is nearly done.** It was sold for 0.49 and can now be bought back for 0.14 or less, but it is also the only part of the position still earning anything.
- **Time is shorter.** With 15 days left there is less time value in every leg, which is part of why the new strikes pay so little.

## What happens when you close only the tested wing?

Closing the put wing means buying back the 48 put at 1.85 and selling the 46 put at 0.70, a net debit of 1.15, or $115. The wing was opened for 0.54, so the realized result on it is -0.61, a $61 loss.

What remains is the 52/54 call spread, opened for 0.49. A condor has become a lone credit spread, and its arithmetic is the [max loss of a credit spread](/blog/credit-spread-max-loss), not the condor's:

- **Credit kept so far:** 1.03 collected, less the 1.15 paid to close, leaves -0.12 before the call wing settles.
- **Best case:** the call wing expires worthless, XYZ finishes at or below 52, and the result is -0.12, a $12 loss. The 0.49 call credit does not cover the 0.61 put loss.
- **Worst case:** XYZ finishes at or above 54, the call wing pays its $2.00 width, and the result is -0.12 - 2.00 = -2.12, a $212 loss.

The maximum loss has more than doubled, from $97 to $212. Before the close, the most the position could lose was $97. Closing cost $115, and that debit adds directly to the call wing's worst case: $97 + $115 = $212. The put wing's loss is now realized, and nothing on the put side can recover it. It is the same trade-off that [closing early](/blog/close-credit-spread-early-or-hold) carries: risk is removed, and the price is a realized loss.

Closing also leaves the call wing exposed to a rebound with nothing on the other side. Some traders close that wing too, for a few cents, and treat the whole position as finished; that is a decision to stop, not an adjustment.

## What does rolling the tested wing down do?

A roll closes the tested wing and opens a new one at different strikes, usually as one order. Here the new wing is a 46/44 put spread, two points lower, so the short put now sits at the strike the old long put occupied. The same quotes price it:

- **Close the 48/46:** buy the 48 put at 1.85, sell the 46 put at 0.70. Debit 1.15.
- **Open the 46/44:** sell the 46 put at 0.70, buy the 44 put at 0.25. Credit 0.45.
- **Net of the roll:** 0.45 - 1.15 = a debit of 0.70, or $70.

That debit comes off the original credit. The condor is now a 44/46/52/54, and its numbers are:

- **Total credit:** 1.03 - 0.70 = **0.33**, or $33.
- **Maximum loss:** ($2.00 - $0.33) x 100 = **$167**, up from $97.
- **Break-evens:** 46 - 0.33 = **45.67** on the downside and 52 + 0.33 = **52.33** on the upside.

![Result at expiration of the hypothetical condor after XYZ falls to 47, under three choices: hold unchanged, close the put wing, or roll the put wing down to 46 and 44.](/assets/blog/condor-adjust-three-payoffs.svg)

Read the picture from the stock's current price. Holding the original keeps a tall plateau that starts at 48, one point above where XYZ sits. Rolling lowers the plateau to 0.33, but widens it so that 47 is inside the range again. Closing the wing flattens the left side entirely and leaves the right side with the biggest drop.

The roll bought something specific: the downside break-evens moved from 46.97 to 45.67, 1.30 lower. From 47, XYZ can now fall 1.33 before the position loses money at expiration, against 0.03 before the roll. It paid for that with 0.70 of credit and 0.70 of extra maximum loss, and it moved the upside break-even 0.70 closer, from 53.03 to 52.33. The new credit of 0.33 is the call wing's 0.49 plus the new put wing's 0.45, less the 0.61 realized on the old wing.

## Hold, close or roll: how do the three compare at expiration?

Settling each choice at four possible finishing prices, in dollars per condor:

| XYZ at expiration | Hold unchanged | Close the put wing | Roll the put wing down |
| --- | --- | --- | --- |
| 43 | -$97 | -$12 | -$167 |
| 47 | +$3 | -$12 | +$33 |
| 50 | +$103 | -$12 | +$33 |
| 55 | -$97 | -$212 | -$167 |

The table is a map of trade-offs, not a ranking. Each column wins somewhere and loses somewhere:

- **Near 47, rolling finishes higher.** It gives +$33 where holding gives +$3, because 47 is now inside the plateau and not on the slope.
- **On a recovery, rolling finishes lower.** At 50 the held condor finishes at +$103 and the rolled one at +$33. The $70 difference is the debit that was spent on room the stock did not need.
- **On a further fall, rolling loses more.** At 43 the rolled condor is down $167, against $97 if nothing had been done, because the new wing's maximum loss is bigger.
- **Closing fixes the put side at -$12.** At 43 that compares with -$97 for holding, and the same choice loses most, -$212, if the stock reverses through the call wing.

None of the columns is better in itself. Which one a position ends up in depends on where the stock goes, which none of these figures forecasts.

## What does an adjustment not fix?

An adjusted condor still carries every risk that a condor does, and a few new ones.

- **Assignment risk remains.** The short 46 put can be assigned early like any short option, as [option assignment](/blog/option-assignment-what-happens) describes. Rolling to a lower strike makes it less likely, because the new short put is out of the money, but does not remove it.
- **Legging costs money.** Closing and opening as separate orders exposes the position to the quotes moving between fills. A single order avoids that, at the price the [bid-ask spread](/blog/options-bid-ask-spread) allows. The roll here nets to buy one 48 put, sell two 46 puts and buy one 44 put, and some brokers will not accept one ticket that both closes and opens the same strike.
- **A roll is not a free reset.** [Rolling an option](/blog/rolling-options-explained) changes the credit and the max loss, as shown above. Rolling again from a worse position has the same arithmetic, with less credit to spend each time.
- **The position has to be read as one.** An adjusted condor is a four-leg position with a new cost basis, and [a journal that lists legs separately](/blog/options-journal-splits-spreads-into-legs) hides this. That is the same trap as [managing many positions at once](/blog/managing-multiple-option-positions), only with more legs to lose track of.

If the stock later reaches the long strike on a spread, the same two states apply as in [a credit spread in the money](/blog/credit-spread-in-the-money): between the strikes the result still moves, beyond the long strike it is fixed.

## FAQ

**Does adjusting an iron condor reduce the risk?** It moves the risk. Rolling the tested wing away from the stock widens the range where the position makes money and also raises the maximum loss, because the credit that was spent no longer offsets it.

**Is an adjustment the same as a roll?** A roll is one kind of adjustment: closing a leg or wing and opening another at new strikes or a new date. Closing a wing and doing nothing else is also an adjustment, with different arithmetic.

**Can the credit go negative?** Yes. If the debit to close or roll is larger than the total credit collected, the position as a whole has paid out more than it took in, and its best case at expiration is a loss.

## The bottom line

Adjusting an iron condor is opening a new position at today's prices while carrying the loss of the old one. Closing the tested wing leaves a single spread with a larger maximum loss. Rolling it down moves the break-even and costs credit. Neither erases what has already happened on the wing, and the numbers above show what each choice changes.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
