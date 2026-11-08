---
title: "What happens when a credit spread goes in the money"
slug: credit-spread-in-the-money
search_title: "Credit Spread in the Money: What Happens and What It Costs"
excerpt: When the stock goes through the short strike, a credit spread has two states, partly in the money and fully in the money. The money is different in each, and so are the choices.
meta_description: "A credit spread in the money: one hypothetical 50/45 put spread, a $350 max loss, and what the loss, assignment and cost of closing look like at 47 and 43."
author: Osama Safwat Maghawry
category: managing
series_order: 53
tags: credit spread, in the money, assignment, max loss, closing
---

**A credit spread in the money** is a spread whose short option has gone through its strike: the stock is below the short strike on a put credit spread, or above it on a call credit spread. As the stock moves further through that strike, the result at expiration shifts from a kept credit toward a loss with a ceiling. The position has two distinct states from there, partly in the money and fully in the money, and the dollars, the assignment risk and the cost of leaving are different in each.

Key Takeaways:

- **There are two states, not one.** With only the short leg in the money the loss still depends on the stock. At expiration, with both legs in the money, the result is the max loss.
- **Max loss is a ceiling, not a forecast.** Reaching it is the worst case for the spread, and the position can sit anywhere between full credit and that ceiling.
- **The short leg is the one that gets assigned.** The long leg is the protection, and whether it is in the money decides whether the protection is working.
- **Leaving has a price.** Closing costs the spread's ask, and the saving against waiting can be small once the spread is near its full width.

## What does it mean when only the short leg is in the money?

Take a hypothetical XYZ put credit spread: sell the 50 put, buy the 45 put, one contract, for a 1.50 credit. That is $150 received against a $5.00 width, so the [max loss](/blog/credit-spread-max-loss) is $500 minus $150, or $350. The break-even is the short strike less the credit: 48.50.

XYZ was at 52 when you sold. Ten days before expiration it falls to 47. The 50 put is 3 points in the money. The 45 put is 2 points out of the money. This is the partly-in-the-money state, and the arithmetic at expiration is simple:

- **The short put is worth its intrinsic value.** At 47 that is 50 minus 47, or $300 per contract, which you owe.
- **The long put is worth nothing.** It is out of the money at 47, so it has no intrinsic value to offset the short put.
- **The result is the credit minus the cost.** $150 received minus $300 owed is a $150 loss, less than the $350 maximum.

![Result at expiration of a hypothetical 50/45 put credit spread sold for 150 dollars: plus 150 dollars at 50 and above, a loss that grows from zero at 48.50 to 350 dollars at 45, and a flat loss of 350 dollars below 45.](/assets/blog/spread-in-the-money-zones.svg)

The picture is the point of this section. Between 45 and 50 every dollar of stock movement changes the result by a dollar per share, or $100 per contract. At expiration, below 45 the long put gains as fast as the short put loses, so the two cancel and the result stops moving. That is what the long put was bought to do, and it is the only reason the loss has a ceiling at all.

## What changes once both legs are in the money?

Suppose XYZ keeps falling and finishes at 43. Now both puts are in the money: the 50 put is worth $700 and the 45 put is worth $200. The spread is worth $500, its full width, and the loss is $500 minus the $150 credit, which is $350.

That figure is the same at 43, at 40 and at 30. This is the stage people usually mean when they say a spread is "at max loss", and it has a peculiar property: at expiration the stock can finish lower and the result does not change, and a recovery of up to 2 points, to 45, changes nothing either. Before expiration, and if assignment or funding goes differently, the outcome can differ.

It also changes what the open position is. Before this point the spread's price was still a bet on where the stock finished. Now it is close to a fixed amount of money that will settle on a date. Two things remain open:

- **Whether the stock gets back above 45.** If it does, the long put loses value and the loss starts to shrink again, so a position near its max loss is not necessarily stuck there.
- **How the position ends.** Closing, expiring and being assigned all produce roughly the same dollars, and quite different accounts.

## What does assignment do to a spread that is in the money?

A short option in the money can be assigned at any time before expiration, not only at the end. In practice early assignment is rare while the option still has meaningful time value and becomes more likely as that value runs out, as [early exercise](/blog/early-exercise-options) explains. The assigned leg is always the short one: you are obliged to buy 100 shares of XYZ at 50, a $5,000 purchase.

What happens to the long leg depends on where the stock is.

| Hypothetical XYZ at expiration | Short 50 put | Long 45 put | Typical outcome | Result |
| --- | --- | --- | --- | --- |
| 51 | Expires | Expires | No position | +$150 |
| 47 | Assigned | Expires | 100 shares bought at 50, unprotected | -$150 |
| 43 | Assigned | Exercised automatically (sells 100 at 45) | Nothing: bought at 50, sold at 45 | -$350 |

At 47 the account ends up with 100 shares costing $5,000 that are worth $4,700, plus the $150 credit already received. The long put has expired, so there is no protection on those shares, and from there the position is a stock position, as [assignment risk on a credit spread](/blog/assignment-risk-credit-spread) walks through. At 43 the long put is in the money too and is exercised automatically at expiration, so the shares bought at 50 are sold at 45 and the account ends flat with the $350 loss.

If the shares are assigned earlier, selling them through the long put is a decision, and it has to be made before that put expires.

Three practical points sit under that table:

- **Funding is the real constraint.** A $5,000 purchase has to be covered by cash or margin, and the notice arrives the next business day, as covered in [what happens at options expiration](/blog/what-happens-options-expiration).
- **Gaps matter more than the table suggests.** If the assignment lands overnight, the shares open at whatever price the market sets, which may be well away from the strike.
- **The call side is the mirror.** A short call in the money is assigned by delivering shares you do not own, which leaves a short stock position, and an ex-dividend date can push that earlier.

The full mechanics are in [option assignment: what happens in your account](/blog/option-assignment-what-happens).

## Does closing early save money once the spread is in the money?

Closing means buying the spread back as one order. How much that saves against waiting depends on where the spread is trading, so go back to the 47 case, ten days out. A partly in-the-money spread is quoted around 2.55 bid and 2.75 ask, a hypothetical quote below its 3.00 expiration value because the long put, nearer the money, carries more time value than the short put.

- **Close at the ask:** pay $275, for a result of -$125 ($150 received minus $275).
- **Hold to expiration at 47:** the result is -$150, as above.
- **Hold and the stock rises to 51:** the result is +$150.
- **Hold and the stock falls to 43:** the result is -$350.

Closing at 2.75 settles the position $25 better than the stock-stays-at-47 case, but it gives up the recovery and avoids the collapse, which is the same trade as in [closing a credit spread early or holding it](/blog/close-credit-spread-early-or-hold). The numbers do not choose between them.

Now take the fully in-the-money case. With a day or two left and a hypothetical 43, the spread is quoted at about 4.85 bid and 4.95 ask; with ten days left the quote can sit further below 5.00. Closing at the ask costs $495, a $345 loss, against $350 for holding. The saving is $5, half the $10 bid-ask spread itself.

That is the quiet fact about a spread at its ceiling: closing it saves the gap between the quote and the width, and no more. What the close does buy is not a dollar figure. It removes the assignment, the funding of the shares, the next-morning exposure and the open collateral. Holding keeps the chance of a recovery above 45 and defers the cost of closing, so the two sides are a matter of weighing, not of arithmetic.

## How do you tell which state a spread is in?

The two states look alike on a position screen, where both are a red number. They are told apart by three things, and none of them is the P/L:

- **Where the stock is against the long strike.** Above it, the loss still moves with the stock. Below it, the result at expiration is fixed.
- **How much time value is left on the short leg.** A short put that is in the money with little time value behind it is the one to expect an assignment notice on.
- **The funding picture.** Whether the account can take 100 shares per contract if the short leg is assigned, which is a question about the account and not about the market.

With many spreads open, that check fails by omission; the wider problem is in [managing multiple option positions](/blog/managing-multiple-option-positions). Rolling to a later date changes the credit and the max loss as well as the date, and is covered in [rolling options](/blog/rolling-options-explained).

## FAQ

**Is a spread at max loss lost for good?** Not necessarily. If the stock recovers above the long strike before expiration, the long put loses value and the spread's loss begins to shrink. The result is final once the position is closed or expires.

**Can the short leg be assigned while the spread is only slightly in the money?** Yes. Assignment can occur on any in-the-money option before expiration, though it is less common while time value remains.

The rest of the series on positions after they fill is in [After the fill](/blog/managing).

This post is educational and is not investment advice.
