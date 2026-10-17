---
title: "Put spread hedge: a cheaper floor with a gap beneath it"
search_title: "Put spread hedge vs protective put: example and cost"
slug: put-spread-hedge
excerpt: A put spread hedge buys a put against 100 shares and sells a lower one to cut the cost, so the shares are covered only between the two strikes.
meta_description: "A put spread hedge buys a put and sells a lower one on 100 shares. Worked example: cost against a protective put, the gap below, and the day after expiry."
author: Osama Safwat Maghawry
category: hedging
series_order: 33
tags: put spread, hedging, protective put, put option, expiration
---

A **put spread hedge** is a [put option](/blog/call-vs-put-option-explained) bought against 100 shares already held, paired with a second put sold at a lower strike on the same stock and the same expiration date. The shares are protected only between the two strikes: the premium from the sold put lowers the cost of the bought one, and in exchange the protection stops at the lower strike.

This is the third post in the [hedging series](/blog/hedging). It uses the same made-up ticker, XYZ, and the same 100 shares bought at $48.00 as the [protective put post](/blog/protective-put-explained) and the [collar post](/blog/collar-option-strategy), and it ends where most explanations stop: the day the options expire, and what the account holds afterwards.

## Key takeaways

- **It is a protective put with a second put sold under it.** The bought put sets the top of the protected band, and the sold put sets the bottom.
- **The sold put pays part of the bill.** Its premium offsets the bought put's cost, so the hedge costs less than the bought put alone.
- **The saving is a gap.** Below the lower strike the sold put works against the position, and the shares lose value again one for one.
- **The upside stays open.** Unlike a collar, nothing is sold above the stock, so the cost of the hedge is the only thing that reduces the gain.
- **It ends at expiration.** The account then holds shares, cash, or both, and a new hedge means new contracts at that day's prices.

## How does a put spread hedge work? A protective put that stops at a lower strike

A [protective put](/blog/protective-put-explained) costs a premium and covers every dollar of loss below its strike. Most of that premium pays for protection against deep falls. A put spread hedge gives that part back: it sells a put at a lower strike, collects a premium, and takes on the obligation to buy 100 shares at that strike if the put is assigned.

The two puts together are a **bear put spread**, a debit spread bought for a net cost. Held next to the shares, it behaves like this at expiration:

- **Above the upper strike.** Both puts expire worthless, and the position moves with the shares, less the net cost.
- **Between the strikes.** The bought put gains what the shares lose, one for one, so the loss stays fixed.
- **Below the lower strike.** The bought put's gain stops growing, because the sold put now loses a dollar for every dollar it gains. The shares are exposed again.

The spread's maximum value is its width, the gap between the strikes. That is the most the hedge can ever pay, however far the stock falls, and it is the reason the hedge costs less than the plain put. A spread is the same pair of legs as the [put credit spread](/blog/put-credit-spread-explained), traded the other way round.

## Put spread hedge example: 100 XYZ shares, a 48 put bought and a 44 put sold

A hypothetical trader holds 100 shares of XYZ bought at $48.00, so $4,800 went out for them. XYZ trades at $50.00. On the 30-day chain from the [option chain post](/blog/how-to-read-an-option-chain), the 48 put is quoted 1.33 bid and 1.43 ask. The 44 put is not on that page, so this example prices it the same way: 0.32 bid and 0.40 ask. The quotes are model estimates at 40% implied volatility, with no interest rate and no dividend, not market data.

A spread means one buy and one sell, so this example assumes fills at the worse side of each quote:

- **Buy the 48 put at the ask.** 1.43 × 100 = $143 paid.
- **Sell the 44 put at the bid.** 0.32 × 100 = $32 received.
- **Net.** $143 − $32 = $111 paid, or 1.11 a share. The 48 put alone costs $143, so the sold put saves $32.

Four numbers follow from the share cost, the two strikes and that net cost:

- **The protected band.** $48.00 down to $44.00. Inside it, the loss against the share cost is fixed at the net cost, $1.11 a share.
- **The width.** $48 − $44 = $4.00 a share, or $400. That is the most the spread can pay.
- **The break-even.** $48.00 + $1.11 = $49.11 a share. XYZ has to finish at or above that for the shares and the hedge together to come out even.
- **The loss below the band.** Down to zero, the lot can lose ($48.00 − $4.00) + $1.11 = $45.11 a share. Only $4.00 of the fall is covered.

![With a 48 put bought and a 44 put sold for a net cost of 1.11, the loss on 100 shares bought at 48 is flat at 1.11 a share between 48 and 44 and grows again below 44, while above 48 the position trails the shares alone by 1.11.](/assets/blog/put-spread-hedge-payoff.svg)

The figure sets the spread against the 48 put alone. At and above 44 the spread is ahead of the 48 put alone by the 0.32 it saved. Below 44 that lead shrinks to nothing at about 43.68, and below that the 48 put alone is ahead, by a margin that grows with every dollar XYZ falls. Against shares held alone the spread is ahead below about $46.89, by at most $2.89 a share at and below $44: the $4.00 width less the $1.11 cost.

## Put spread hedge vs protective put: four hedges on the same shares

The saving is real and so is the gap. The table puts four positions on the same lot of shares at three closing prices. Each figure is a gain or loss a share against the $48.00 cost, with the premium included.

| At expiration | XYZ closes at $51 | XYZ closes at $46 | XYZ closes at $41 |
| --- | --- | --- | --- |
| Shares alone | +3.00 | −2.00 | −7.00 |
| Shares + 46 put (0.79) | +2.21 | −2.79 | −2.79 |
| Shares + 48 put (1.43) | +1.57 | −1.43 | −1.43 |
| Shares + 48/44 put spread (1.11) | +1.89 | −1.11 | −4.11 |

Reading across the last two rows: at $46 the spread loses 0.32 less than the 48 put, and at $41 it loses 2.68 more. At $41 the spread also loses more than the 46 put alone, which costs less than a dollar. Against the 46 put the crossover is $42.32, the price where the two positions lose the same amount.

Neither row is better in general. The protection runs out at the lower strike, so a fall past $44 is not covered. The table shows what each position costs and where each one stops.

## How does a put spread hedge end at expiration?

A put spread hedge is three lines in an account: 100 shares, a long 48 put and a short 44 put. What happens at [options expiration](/blog/what-happens-options-expiration) depends on where XYZ closes against the two strikes. These figures describe mechanics, not a forecast.

| At expiration | XYZ closes at $51.00 | XYZ closes at $46.00 | XYZ closes at $41.00 |
| --- | --- | --- | --- |
| The 48 long put | Expires worthless | $2.00 in the money, exercised | $7.00 in the money, exercised |
| The 44 short put | Expires worthless | Expires worthless | $3.00 in the money, assigned |
| The shares | Kept, worth $5,100 | Sold at $48, $4,800 in cash | Sold at $48, then 100 bought back at $44 |
| Net cost | $111 spent | $111 spent | $111 spent |
| What the account holds | 100 shares, no options | Cash, no shares, no options | 100 shares and $400 cash |

The last column is the one that surprises. A long equity put that closes at least $0.01 in the money is usually exercised automatically under the Options Clearing Corporation's exercise-by-exception rule, unless its holder tells the broker otherwise before the cutoff. A short put that closes in the money is very likely to be [assigned](/blog/option-assignment-what-happens), and the writer cannot instruct or prevent it. At $41.00 both happen on the same night, so the account sells 100 shares at $48 and buys 100 at $44. The two settle together: $4,800 in, $4,400 out, a net $400 credit. How a broker sequences and displays the two events varies.

## What does the account hold the day after a put spread hedge expires?

A payoff diagram describes one instant at expiration. The account carries on the next morning, holding something different from the day before.

![After expiration a hypothetical put spread hedge leaves 100 unhedged shares if XYZ closed at 51, $4,800 in cash if it closed at 46, or 100 shares and $400 in cash if it closed at 41.](/assets/blog/put-spread-hedge-after-expiry.svg)

Take the right-hand case, XYZ at $41.00 on expiration Friday. On Monday the account shows:

- **Shares.** 100 XYZ, worth $4,100, bought at $44.00 through the assignment.
- **Cash.** $400 more than before, the difference between the $48 sale and the $44 purchase.
- **The options.** Both gone. The floor and the sold put ended together.
- **The position.** Shares held alone again, after a hedge that paid out $400 and cost $111 to put on.

In the middle case the account holds cash and no XYZ. In the first it holds shares alone, exactly as before the hedge. Either way a spread does not renew itself: keeping cover in place means buying a new put and selling a new one at whatever the market quotes that day.

## An early assignment can leave one put covering two lots

Everything above assumes the options are held to expiration. The sold put is an obligation, and US equity options are American-style, so it can be assigned on any day before expiration.

[Early exercise](/blog/early-exercise-options) of a put is uncommon and tends to happen deep in the money, when little time value is left. If it happens to this hedge:

- **The 44 put is assigned.** The account buys 100 more shares at $44.00, which needs $4,400 in cash or margin.
- **The 48 put stays.** Nothing closes it, and it still covers only 100 shares.
- **The position changed shape.** The account now holds 200 shares and one long put. Half the lot is hedged and half is not.

The three lines of a put spread hedge do not always leave the account together, so the account should be read as a new position, not as a hedge with a missing leg.

## Frequently asked questions

- **What is a put spread hedge?** A put bought against shares you hold, with a lower put sold on the same expiration to cut the cost. The two puts on their own are a bear put spread, also called a debit or long put spread.
- **What is the difference between a put spread hedge and a protective put?** The sold put. It cuts the cost of the 48 put from $143 to $111 in the example, and ends the cover at $44.
- **How is it different from a collar?** A collar sells a call above the stock, so it keeps cover all the way down and gives up the upside. A put spread hedge sells a put below, so it keeps the upside and gives up the cover below the lower strike.
- **What is the break-even on a put spread hedge?** The share cost plus the net cost of the spread: $48.00 + $1.11 = $49.11 in the example.
- **What is the maximum loss?** The share cost less the width, plus the net cost: $45.11 a share in the example, which is the lot going to zero.
- **Does it cap the upside?** No. The gain is reduced by the net cost, $1.11 a share here, and by nothing else.

## The bottom line

A put spread hedge buys a put against 100 shares and sells a lower one, so the premium it saves is paid for with a gap. In the example the cost is $111 instead of $143, the band is $48 down to $44, and the lot can still lose $45.11 a share if XYZ goes to zero.

Both ends are set for one expiration only. The day after, the account holds unhedged shares, cash, or shares bought back at the lower strike, and each new hedge is a new pair of contracts priced that day.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
