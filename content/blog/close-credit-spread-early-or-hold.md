---
title: "Closing a credit spread early vs holding to expiration"
slug: close-credit-spread-early-or-hold
search_title: "Close a Credit Spread Early or Hold to Expiration"
excerpt: Closing early turns a credit spread into a smaller, fixed result. Holding keeps the last cents of credit and the full risk. Here is the arithmetic of both on one spread.
meta_description: "Close a credit spread early or hold to expiration? One hypothetical put spread: $22 of credit left, $130 max loss still possible, and what each exit costs."
author: Osama Safwat Maghawry
category: managing
series_order: 52
tags: credit spread, closing early, expiration, max loss, buy to close
---

**Closing a credit spread early** means buying the spread back before expiration, at a price lower than the credit you received. Holding means leaving both legs open until the options expire, are exercised or are assigned. The two are not a choice between good and bad. They trade a smaller result that is fixed today for a larger one that depends on where the stock finishes, and the arithmetic of that trade is the same on every spread.

Key Takeaways:

- **Closing fixes the result.** Once the spread is bought back, nothing the stock does afterwards changes it.
- **The credit is earned unevenly.** Much of it can be gone from the spread's price well before expiration, especially if the stock moves away from the short strike, and if the spread is held, the max loss is the same as on day one.
- **Both exits have a cost.** Closing pays the bid-ask spread on two legs; holding pays in attention, collateral and the end-of-life mechanics.
- **The arithmetic does not pick for you.** What it gives you is the size of the last piece of credit against the size of the risk that remains.

## What does it mean to close a credit spread early?

A [put credit spread](/blog/put-credit-spread-explained) is two options sold and bought together: you sell a put, buy a lower put, and receive a net credit. To close it you reverse both legs at once, buying back the short put and selling the long put as a single order, for a net debit. The credit you received minus the debit you pay is the result, before fees.

Because it is one order for one price, the spread has a quote of its own, a bid and an ask, just as each option does. Closing at the ask fills quickly; working an order between the bid and ask may save money and may not fill at all.

Nothing about closing early is special to this structure. The same applies to a [call credit spread](/blog/call-credit-spread-explained) or an [iron condor](/blog/iron-condor-explained), which can be closed as one four-leg order or one side at a time; [adjusting an iron condor](/blog/adjust-iron-condor) works out what closing one side does to the max loss.

## How much reward is left when the spread is cheap?

Take a hypothetical XYZ put credit spread: sell the 50 put, buy the 48 put, one contract, for a 0.70 credit. That is $70 received against a $2.00 width, so the [max loss](/blog/credit-spread-max-loss) is $200 minus $70, or $130.

The stock was at 51 when you sold. Three weeks later XYZ trades at 52 and the spread is quoted 0.18 bid, 0.22 ask. Time passing and the move away from the short strike have done the rest, the first being what [theta decay](/blog/theta-decay-explained) describes.

![A hypothetical 50/48 put credit spread sold for 70 dollars: at the open it is 70 dollars of credit against 130 dollars of max loss, and three weeks later 48 dollars would be kept by closing, 22 dollars is still to be earned, and the same 130 dollars is still at risk.](/assets/blog/close-early-reward-left-vs-risk.svg)

If you close at the 0.22 ask, you pay $22 and keep $48. If you hold and the spread expires worthless, you keep $70. The difference, $22, is the whole of what holding can still add. Against it sits the whole of what holding can still lose:

- **The reward left shrinks.** It was $70 on day one and is $22 now, and it can only fall to zero.
- **The risk left does not.** If XYZ falls to 48 or below by expiration, the spread is worth its full $200 width and the loss is $130, the same as if the stock had gone there on day one.
- **The trade-off worsens.** On day one the spread risked $130 to earn $70. Today, compared with closing at 0.22, holding risks up to $178 (the $48 you would give up plus the $130 max loss) to earn $22. That change is the reason the question comes up at all.

None of these is a prediction about where XYZ goes. They describe what is left to win and what is left to lose.

This is the part that the opening credit hides. A spread sold for $70 looks like a $70 position, but the credit is paid out in the price of the spread over time, and the risk is paid out only at the end. A reader who checks the position after three weeks sees a small gain on the screen and a large number in the collateral column, and the two have drifted apart since the day it was opened. Neither number is wrong. They answer different questions: what has been earned so far, and what could still be lost.

## What happens if you hold a credit spread to expiration?

Holding hands the result to the stock's price at the close on the expiration date. For the same spread, compared with having closed at 0.22:

| XYZ at expiration | Closed at 0.22 | Held to expiration |
| --- | --- | --- |
| 52 | +$48 | +$70 |
| 50 | +$48 | +$70 |
| 49 | +$48 | -$30 |
| 47 | +$48 | -$130 |

At or above 50 both puts have no intrinsic value and the full credit is kept (exactly at 50, an assignment is still possible, see below). Between 48 and 50 only the short put has value: at 49 the spread is worth $100, and $70 received minus $100 is a $30 loss. The break-even is 49.30, the short strike less the credit. At 48 and below the spread is worth its full width.

![Result in dollars of the hypothetical 50/48 put credit spread by stock price at expiration: closed at 0.22 it is plus 48 dollars at every price, while held it is plus 70 dollars at 52, minus 30 dollars at 49 and minus 130 dollars at 47.](/assets/blog/close-early-vs-hold-at-expiry.svg)

The table shows why the two columns cannot be ranked. Holding is better by $22 in the first two rows and worse by $78 or $178 in the last two. Which row occurs is the thing nobody knows three weeks out.

What the table can do is size the bet. Holding for the last $22 means accepting a result $78 worse than closing if the stock settles at 49 (a $30 loss instead of a $48 gain), and $178 worse if it settles at 47. That comparison is available on any spread: the debit to close is what holding can still add, and the max loss plus the result you would lock in by closing is the most holding can cost by comparison.

## What does each exit cost besides the price?

Both choices carry costs that never appear in the spread's quoted price.

**Closing early:**

- **The bid-ask spread on two legs.** The spread's quote is built from both legs, so its width is roughly the two legs' widths added together, and closing at the ask pays about half of that above the midpoint. In the example, closing at the mid of 0.20 instead of the 0.22 ask would be $2 better, if it fills. The [bid-ask spread](/blog/options-bid-ask-spread) is real money on a small debit.
- **Commissions and fees**, where the broker charges them, on each leg closed.
- **The credit you stop earning.** The last $22 is the reward for staying in.
- **A new decision.** Once the capital is free, it has to go somewhere or sit idle, and that is a separate question.

**Holding on:**

- **Collateral that stays tied up.** The margin or cash reserved against the spread is held until the position is gone, so it cannot back another one. See [options buying power](/blog/options-buying-power-requirement).
- **Attention.** The position can move against you at any time, and with many open, each one is another position to watch, as in [managing multiple option positions](/blog/managing-multiple-option-positions).
- **The last-days mechanics.** Gamma rises as expiration nears for strikes close to the stock price, so a spread whose short strike is near the stock reacts more to each move. The [days to expiration post](/blog/credit-spread-dte) charts how.

## What changes in the final days before expiration?

The end of a spread's life is where holding and closing differ most in kind. Before then, a spread is two option prices and a mark. Near the end, mechanics take over:

- **A short leg slightly in the money is a different risk than one slightly out.** If XYZ finishes at 49.95, the 50 put is 0.05 in the money and will normally be exercised automatically, so expect assignment: you buy 100 shares at 50. The long 48 put is out of the money and expires worthless, so you start the next trading day holding the shares with no protection, as in [assignment risk on a credit spread](/blog/assignment-risk-credit-spread).
- **Exercise can come after the close.** A holder can instruct their broker after the market shuts, up to a 5:30 p.m. ET deadline or your broker's earlier cutoff, so what you see at the 4:00 p.m. close is not final, as [what happens at options expiration](/blog/what-happens-options-expiration) explains.
- **Funding.** Assigned shares cost $5,000. In a cash or IRA account that cash must be there; in a margin account it becomes a margin requirement, and the notice arrives the next business day. A spread that is closed beforehand never asks the question.

Put plainly, closing early turns an open-ended question into a settled one, and holding keeps the question open for the sake of the remaining credit. A spread that has been closed carries none of these. One that is held through expiration may carry all of them, or none, depending on where the stock finishes. The arithmetic above prices the dollars; this list is about the situations that surround them.

## FAQ

**Is there a correct time to close?** No rule is correct for every spread. Rules of thumb exist, but they are conventions rather than mechanics, and the example above is built to show the arithmetic they rest on, not to endorse any of them.

**Does closing early reduce the max loss?** It ends it. After the spread is bought back there is no position and no further loss, but the debit you paid is already counted in the result.

**Is the last bit of credit free to take?** Only if the stock stays where it is. The remaining $22 is paid for by keeping the full $130 max loss in play until expiration, which is up to $178 worse than closing today.

**What if the spread is losing instead?** The same arithmetic runs the other way: closing realizes the loss at today's price, and holding leaves the outcome to the stock, capped at the max loss (the width less the credit). The in-the-money case is worked through with numbers, partly and fully, in [what happens when a credit spread goes in the money](/blog/credit-spread-in-the-money).

The rest of the series on positions after they fill is in [After the fill](/blog/managing).

This post is educational and is not investment advice.
