---
title: "Selling options before earnings: the crush and the gap"
slug: selling-options-before-earnings
excerpt: An option sold before earnings carries extra time value that the announcement takes back, but a gap past the strike adds intrinsic value that nothing takes back.
meta_description: "Selling options before earnings, priced the morning after: what IV crush takes back, and what a gap past the strike does to a naked put vs a spread."
author: DeltaMint
category: income
series_order: 24
tags: earnings, iv crush, gap risk, put credit spread, short put
---

**Selling options before earnings** means opening a short option, or a credit spread, whose expiration falls after a company's scheduled earnings announcement. The premium is higher than usual because the market prices the announcement in, and two things happen once it is out: the extra time value drains away, which is called IV crush, and the stock may open far from where it closed, which is called a gap.

This post continues the [income series](/blog/income) from [days to expiry](/blog/credit-spread-dte). It prices one hypothetical put two ways, on its own and as a spread, the afternoon before an announcement and the morning after. It describes what happens to each position, not whether anyone should hold one through the date.

## Key takeaways

- The premium before earnings is larger because [implied volatility](/blog/implied-volatility-options-explained) rises into the date. All of the extra is time value.
- IV crush removes time value only. With the stock unchanged, a short option's mark falls the morning after.
- A gap past the strike adds intrinsic value, which no fall in implied volatility can take away.
- A naked short put's loss runs to wherever the stock opens; a put credit spread's stops at the width less the credit.
- A gap trades through any stop price. While both legs are held, the spread's long leg is the cap that holds across it.

## What does the run-up add to a seller's premium?

An earnings date is on the calendar weeks ahead, and its outcome is unknown until it is published. Every option expiring after the date covers it, so the market charges more for movement on those contracts, which shows up as higher implied volatility. The [implied volatility post](/blog/implied-volatility-options-explained) covers why the whole chain reprices; this post stays with the seller.

The size of the run-up is visible on the chain. The price of an at-the-money call and put on the same expiration added together, the straddle price, is a rough market estimate of how far the stock may move by that expiration, the announcement plus the ordinary days, in dollars. A wider straddle means a larger priced-in move and a fatter premium for the seller, but it is an estimate of size, not of direction, and the actual move can land well inside it or far outside it.

The worked example is the hypothetical XYZ used across this series, trading at $50. The company reports after the close, and the expiration is a week later. Prices come from a Black-Scholes fit with no interest rate and no dividend, so each is a model's estimate, not a quote. Every price is a per-share mark, and fills are assumed at the mark; one contract is 100 shares.

The afternoon before the report, the 8-day options are priced at 80% implied volatility. Without the event they would sit near the 40% this series has used throughout. The difference is what the date added:

| 8 days left, XYZ at $50 | 50 put | 48 put | 50/48 put spread |
| --- | --- | --- | --- |
| At 40% IV, no event | 1.18 | 0.42 | 0.76 |
| At 80% IV, the afternoon before | 2.36 | 1.45 | 0.91 |
| Added by the run-up | 1.18 | 1.03 | 0.15 |

The 50 put is at the money, so its whole 2.36 is time value. Selling that put alone collects $236. Selling the 50/48 [put credit spread](/blog/put-credit-spread-explained), short the 50 put and long the 48, collects 2.36 − 1.45 = 0.91, or $91.

The run-up added 1.18 to the 50 put but only 0.15 to the spread, because the 48 put the spread buys was lifted by nearly as much. A spread is short one option's implied volatility and long another's, so most of the event premium on the short leg is paid back out on the long leg.

## What happens to a short option through earnings?

The announcement comes out after the close. By the next morning the uncertainty it carried is gone, and implied volatility falls back toward its usual level. Take two openings, each priced with 7 days left at 40% implied volatility: XYZ opens unchanged at $50, or it gaps down to $44, through both strikes. Assuming implied volatility falls fully to 40% even after the gap is a modelling choice; after a large gap it often stays higher.

![One hypothetical XYZ 50 put is 2.36 of time value before earnings, 1.10 of time value if the stock opens at 50, and 6.00 of intrinsic plus 0.01 of time value if it opens at 44.](/assets/blog/earnings-put-mark-split.svg)

With the stock at $50, the 50 put is still at the money and still all time value, now worth 1.10 instead of 2.36. The seller's mark has fallen 1.26, or $126 per contract in the seller's favour. One extra day at an unchanged 40% would have taken only 0.08 of that (1.18 to 1.10); the remaining 1.18 is the crush, the same amount the run-up added.

The spread moves the same way, by less. Its legs are now 1.10 and 0.36, so the spread is marked at 0.74, down 0.17 from the 0.91 it was sold for, or $17 per spread. That is the 0.15 the run-up added, plus a little decay.

With the stock at $44, the picture reverses. The 50 put is worth 6.01: $6.00 of intrinsic value, the distance below the strike, plus 0.01 of time value. Time value fell from 2.36 to 0.01, partly from the crush and partly because a put this far in the money holds much less time value than an at-the-money one (about 0.32 even at 80% implied volatility), and the crush removes the remaining 0.31. But intrinsic value went from zero to 6.00, and the crush has no claim on it. [Intrinsic value](/blog/intrinsic-vs-extrinsic-value-options) is arithmetic against the strike, and only the stock price changes it.

| Morning after, 7 days left, 40% IV | XYZ opens at $50 | XYZ opens at $44 |
| --- | --- | --- |
| 50 put mark | 1.10, all time value | 6.01: 6.00 intrinsic, 0.01 time value |
| Naked 50 put, sold at 2.36 | +$126 | −$365 |
| 50/48 spread mark | 0.74 | 1.95 |
| 50/48 spread, sold at 0.91 | +$17 | −$104 |

These are marks, the price to buy back at the midpoint, not results. Both positions are still open and can still move before expiration.

## Does IV crush help if the stock gaps past the strike?

On the naked put, the $365 loss at $44 is two movements netted: the mark lost 2.35 of time value, and the gap added 6.00 of intrinsic value. Each dollar lower on the open adds roughly another $100 per contract, all the way down. A short put is the same position naked in a [margin account](/blog/options-buying-power-requirement), where the broker holds collateral against the loss, or [cash-secured](/blog/cash-secured-put-explained) with $5,000 set aside; the cash pays for shares if assigned and does not change the loss.

On the spread, the gap added intrinsic value to both legs: 6.00 on the short put and 4.00 on the long, a net of 2.00, which is the full width. The spread's mark of 1.95 sits just under that because the long 48 put, being less deep in the money, holds slightly more time value than the short 50 put. The $104 mark loss is already close to the $109 the [max loss post](/blog/credit-spread-max-loss) formula gives: ($2.00 − $0.91) × 100.

![At expiration a hypothetical naked 50 put sold for 2.36 keeps losing as the stock falls, while a 50/48 put spread sold for 0.91 stops at a 1.09 loss below 48, and a gap to 44 lands below both strikes.](/assets/blog/earnings-gap-naked-vs-spread.svg)

Three differences between the two positions follow from that picture:

- **The naked put has no floor.** At a $44 expiration it loses (6.00 − 2.36) × 100 = $364; at $40, $764; at zero, $4,764. Where it ends is set by the stock price at expiration, and a gap moves that starting point overnight, while no one holding the put can trade.
- **The spread's floor is set at the fill.** Any expiration at or below $48 gives the same $109 loss, however far the gap went past the long strike. The gap's size beyond the long strike stops mattering, because the long put gains a dollar for every dollar the short put does.
- **The spread gave up premium for that floor.** It collected $91 against the naked put's $236, and its gain on a flat open was $17 against $126.

None of these rows says which position anyone should hold. They show what each one is made of on the morning the announcement is priced.

## Can a stop order cap an earnings gap?

Most stock options trade only during regular market hours, and the announcement lands while the market is closed. There is no price between the close and the open at which to leave, and a stop order does not change that:

- **A stop is a trigger, not a price.** A hypothetical buy-stop to close the 50 put at 4.00 does nothing until the put trades or is quoted at or through 4.00, depending on the broker's trigger. On a gap open, the first price is already near 6.01.
- **A triggered stop becomes a market order.** It fills at whatever the market is offering at the open, which after a gap can be wider and further away than the stop price.
- **A stop-limit can avoid that fill, and not fill at all.** If the market opens past the limit, the order waits while the position stays open.

The long put is a position, not an instruction. It is already held when the gap happens and gains overnight along with the short put, so the cap holds through the gap as long as both legs are held.

One more mechanic follows the gap. With 0.01 of time value left, a holder of the 50 put gives up almost nothing by exercising early, so early [assignment](/blog/option-assignment-what-happens) is more plausible than usual; the interest on the $5,000 strike is then worth more than the time value left. The naked put then becomes 100 shares bought at $50 for $5,000. On the spread the 48 put is still held, so the cap survives, though the account holds shares and a put rather than two options.

Paying for the shares takes $5,000 the spread itself never required, so an account sized to the spread may face a margin call or a broker liquidation.

## Frequently asked questions

- **What is IV crush?** The fall in implied volatility once a scheduled event such as earnings is out. It lowers time value and does not touch intrinsic value.
- **Does IV crush help an option seller if the stock moves past the strike?** It still removes time value, and the same move adds intrinsic value: on the example, the put's mark loses 2.35 of time value and gains 6.00 of intrinsic value.
- **Why does a credit spread gain less from IV crush?** Its long leg loses time value too, so the gains partly cancel: 0.17 on the spread against 1.26 on the put alone.
- **Can a credit spread lose more than its max loss in a gap?** Not while both legs are held: a gap past both strikes adds intrinsic value to the long put as well, so the loss stops at the width less the credit. The risk that can exceed it comes after expiration. If XYZ closes between 48 and 50, the short 50 put is normally assigned while the 48 put expires worthless, leaving 100 shares bought at $50 with no put under them, and the next open's gap falls on the shares alone.

## The bottom line

The premium on an option sold before earnings is time value the announcement put there. IV crush takes it back whether the stock moves or not. A gap past the strike adds intrinsic value, which only the stock price can take back.

On the hypothetical XYZ, the same 50 put sold before the date was marked $126 better on an unchanged open and $365 worse on a gap to $44. As a 50/48 spread, the same two openings were $17 better and $104 worse, with $109 the most it could lose. The [income series](/blog/income) continues with [calendar spreads](/blog/calendar-spread-explained).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
