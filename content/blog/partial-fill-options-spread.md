---
title: "Partial fills on an options spread: what the half-filled order leaves in your account"
slug: partial-fill-options-spread
search_title: "Partial Fill on an Options Spread: What You Hold"
excerpt: A spread order for ten can fill four and leave six working. What the account holds in that state, what the other six still risk, and what each way of finishing the order changes.
meta_description: "Partial fill on an options spread: what the filled part holds, how credit and max loss scale, the three ways to finish, and when a leg fills alone."
author: Osama Safwat Maghawry
category: managing
series_order: 55
tags: partial fill, options spread, limit order, max loss, collateral
---

A **partial fill** on an options spread happens when an order for several spreads executes for only some of them. An order to sell ten put credit spreads can fill four and leave six unfilled but still working at the limit price. The four that filled are complete, ordinary positions. The six that did not fill are an open order, and they are a separate question from the four.

This post sits in the [After the fill](/blog/managing) series, which is about what a position needs once it exists. It builds on [what a put credit spread is](/blog/put-credit-spread-explained) and on [the maximum loss of a credit spread](/blog/credit-spread-max-loss), and uses one hypothetical order throughout.

Key Takeaways:

- **A partial fill is two things at once.** A smaller position that is already live, and a working order that may or may not fill later.
- **Credit and risk scale with the filled quantity.** Four filled spreads carry four spreads' credit, max loss and collateral, nothing more.
- **Leaving the rest working is a choice with a cost.** If the market moves away from the limit, the remainder may never fill, and the position stays smaller than planned.
- **Repricing changes the blended credit.** The filled part keeps its price, so the whole position ends up with an average of two prices.

## What does a partial fill actually leave in the account?

Take a hypothetical order: sell 10 of the XYZ 50/48 put credit spread, limit 0.60 net credit. The market is 0.55 bid and 0.65 ask on the spread, so the order sits in the middle and some contracts trade. Four spreads fill at 0.60. Six remain.

The account now holds a mix of a position and an order:

- **The position:** four 50/48 put credit spreads, opened for 0.60 each. Credit received is 4 x 0.60 x 100 = **$240**. This position is final. Nothing about the unfilled six changes it.
- **The order:** six spreads still working at 0.60. They have no cost, no credit and no risk yet. At many brokers they also reserve buying power until the order fills or is cancelled, as [the buying power post](/blog/options-buying-power-requirement) describes.
- **The risk today:** each spread's maximum loss is ($2.00 - $0.60) x 100 = $140, so the four carry **$560**. The six working spreads add another $840 only if and when they fill.

That last point is the whole post in one line: the position at any moment is what has filled, and the plan is what was asked for. A reader looking at the order ticket sees "10 contracts" and may think the plan is in place. The account holds four.

![A ten-spread order that has filled four: four filled spreads are live positions with credit and max loss, and six working spreads are only an order until they trade.](/assets/blog/partial-fill-four-of-ten.svg)

## How do credit and max loss scale with the part that filled?

Every figure on a spread is a per-spread figure multiplied by the quantity, so a partial fill scales everything evenly. Here is the arithmetic for the hypothetical order at the three points that matter:

| State | Spreads open | Credit | Max loss | Break-even |
| --- | --- | --- | --- | --- |
| Four filled at 0.60 | 4 | $240 | $560 | 49.40 |
| All ten filled at 0.60 | 10 | $600 | $1,400 | 49.40 |
| Four at 0.60, six at 0.55 | 10 | $570 | $1,430 | 49.43 |

The break-even is the short strike minus the credit per spread, so it does not depend on how many spreads are open. It depends on the price. That is why the third row changes it: the blended credit is (4 x 0.60 + 6 x 0.55) / 10 = 0.57, so the break-even is 50 - 0.57 = **49.43**, and the maximum loss is ($2.00 - $0.57) x 1,000 = **$1,430**.

Two things follow from this arithmetic:

- **Each spread has its own break-even.** The first four sit at 49.40 and the last six at 49.45. The 49.43 figure is the average, which is useful for the total but is not where any single spread breaks even.
- **The filled part is final.** If the market moves and the remaining six fill at a worse price, the four do not get repriced. A position built in two steps has two cost bases, and it only shows as one if the record groups it correctly, as [the journal post](/blog/options-journal-splits-spreads-into-legs) describes.

## What are the ways to finish a half-filled order?

There are three, and each one answers a different question about the unfilled six.

- **Leave it working.** The order stays at 0.60. If the spread's market comes back to 0.60 or better, the rest fills at the original price. If it does not, nothing happens and the position stays at four. The cost is time and uncertainty, and the exposure to the stock's move in the meantime is the exposure of four spreads, not ten.
- **Cancel the remainder.** The position is four spreads, final. Where the broker reserves buying power for working orders, this releases the reservation on the six, and it ends the question. It also means the position is 40% of the intended size, and any later add is a new order at new prices.
- **Reprice the remainder.** Lowering the limit to 0.55 asks for less credit and is more likely to fill. Raising it is rarer. Changing the price of a working order gives it a new time priority at the new price, so it joins the back of the line there. Whether the broker carries the change out as a modify or as a cancel and re-send does not alter that. Only reducing the quantity at the same price typically keeps an order's place.

![The same half-filled order finished three ways: left working at 0.60, cancelled at four spreads, or repriced to 0.55 for the other six, with the resulting spread count, credit and max loss.](/assets/blog/partial-fill-three-endings.svg)

None of these is a recommendation. They are three states the account can end up in, and the table above shows what each one holds. The [bid-ask spread](/blog/options-bid-ask-spread) is what sets how far a limit has to move to fill, and a wide one makes a repriced limit a larger concession.

## What if only one leg of the spread fills?

Everything above assumes the spread was sent as one multi-leg order, where the two legs trade together as a unit. When the same spread is entered as two separate orders, one for each leg, a partial fill can fill unevenly, and the account is left with a leg and not a spread.

Suppose the 50 put is sold at 1.40 and the 48 put is bought at 0.80 as two separate limit orders. If four of the short puts fill and none of the long puts do:

- **The position is not a spread.** It is four short 50 puts with no protection beneath them.
- **The risk changes shape.** A defined spread loses at most $140 each. Four unhedged short puts can lose up to (50 - 1.40) x 100 each, or $4,860 each and **$19,440** in total, if XYZ went to zero.
- **The collateral changes too.** The spread margin from [buying power](/blog/options-buying-power-requirement) depends on the long leg being in the account, so the requirement can rise to that of a naked or cash-secured put until the long leg fills. Where the account is not approved for uncovered puts, the short-leg order may simply be rejected.

The standard order for a spread is one multi-leg order for this reason: it does not leave this state. A multi-leg order that executes as a single complex order on the exchange fills in whole spreads at the ratio, so it can leave four complete spreads but not four lone legs. Some brokers also offer combination orders that are not guaranteed and may fill one leg without the other, so it is worth checking which kind the ticket is.

![Two ways to enter a 50/48 put credit spread for four contracts: as one multi-leg order the account holds four whole spreads, and as separate leg orders it can hold four short puts with no long put, raising the max loss from $560 to $19,440.](/assets/blog/partial-fill-leg-vs-unit.svg)

## What does a partial fill change about managing the position?

The practical effect is that a position stays in a half-built state, and the usual questions apply to it twice.

- **Check what filled, not what was sent.** The quantity on the ticket is the request. The positions list is the fact.
- **Look for the leftover order.** A working order for the rest is separate from the position, and an old one can fill days later at a price that no longer matches the plan, which leaves a position at a different size than intended.
- **Treat each fill's price as its own lot.** If the position is later closed early, [as in closing early versus holding](/blog/close-credit-spread-early-or-hold), the total realized result equals what the blended price across the fills implies, and on a rolled position [the rolling post](/blog/rolling-options-explained) shows what the credit has to carry.
- **Count the collateral by fills.** A filled position ties up buying power, and at many brokers a working order does too, which is easy to lose track of with many positions, as in [managing many positions at once](/blog/managing-multiple-option-positions).

## FAQ

**Does a partial fill mean the order failed?** No. The part that filled is a real position at the agreed price. The order is simply not finished.

**Does the filled part get a better or worse price later?** Neither. It keeps its own fill price. Only the remaining quantity can change, and only if the order is repriced or the market moves to it.

**Can a spread order fill one leg and not the other?** A single multi-leg order is normally built so the legs trade together, though some brokers' non-guaranteed combination orders are not. Two separate orders are independent, and one can fill while the other does not.

**Can a spread order be set so it does not partially fill?** Some brokers offer an all-or-none instruction, which fills only if the whole quantity trades at the limit or better. Whether it is available on multi-leg orders varies by broker and route.

## The bottom line

A partial fill splits an order into a position and a promise. The position is exactly the quantity that traded, with its credit, maximum loss and collateral scaled to that number. The promise is whatever is still working, and at many brokers it keeps reserving buying power until it fills or is cancelled. Cancelling, waiting or repricing each leave the account in a different state, and the arithmetic above shows what each state holds.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
