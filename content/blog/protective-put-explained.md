---
title: "Protective put explained: the floor, the cost and the day it expires"
search_title: "Protective put explained: floor, break-even and max loss"
slug: protective-put-explained
excerpt: A protective put is a put bought against 100 shares already held, setting a floor at its strike for a premium paid up front, until the day it expires.
meta_description: "A protective put sets a floor at its strike for a premium. A worked example: break-even, max loss, and what the account holds the day after it expires."
author: Osama Safwat Maghawry
category: hedging
series_order: 31
tags: protective put, hedging, put option, break-even, expiration
---

A **protective put** is a [put option](/blog/call-vs-put-option-explained) bought against 100 shares of the same stock already held, so that the shares can be sold at the put's strike price however far the stock falls before the put expires. The holder pays a premium up front for that right, and the right ends on the expiration date.

This post opens the [hedging series](/blog/hedging). It uses the same made-up ticker, XYZ, and the same 100 shares bought at $48.00 as the [covered call post](/blog/covered-call-explained), and it ends where most explanations stop: the day the put expires, and what the account holds afterwards.

## Key takeaways

- **The strike is the floor.** Until expiration, the shares can be sold at the put's strike, whatever the stock trades at.
- **The premium is the cost.** It is paid at the fill and is not returned, whether or not the put is ever used.
- **Break-even is cost plus premium.** The stock has to finish at or above the share cost plus the premium for the whole position to come out even.
- **Max loss is cost less strike plus premium.** The gap down to the floor, plus what the put cost, is the most the position can lose by expiration.
- **The floor ends at expiration.** After that the account holds either unhedged shares or cash, and a new floor means a new premium.

## How does a protective put work?

A put is the right to sell 100 shares at the strike before the contract expires. On its own, a long put gains value as the stock falls. Held next to 100 shares of the same stock, that gain offsets the shares' loss below the strike, one for one at expiration.

At expiration, between the stock's price and the strike, nothing offsets anything: the put pays only for the distance below its strike, so a put struck below the current price leaves a stretch of loss uncovered, much as a deductible does. Before expiration the put's price rises as the stock falls toward the strike, but by less than the shares lose. Only at expiration, and only below the strike, does the put's payoff offset the shares' loss one for one.

It helps to see whose side this is. A [cash-secured put](/blog/cash-secured-put-explained) is a put sold: the seller collects a premium and takes on the obligation to buy at the strike. A protective put is the other side of that contract, bought: the holder pays the premium and holds the right to sell. Every protective put held somewhere is a put that someone else has sold.

The comparison to insurance is common, and it holds in three places and no further:

- **There is a premium.** It is paid up front and is spent whether or not the put is ever used.
- **There is a deductible.** The distance from the stock's price down to the strike is loss the put does not cover.
- **There is a term.** The protection lasts until expiration, and then there is none until another put is bought.

Unlike most insurance, the price is set by the market every day. The same put costs more when [implied volatility](/blog/implied-volatility-options-explained) is high and less when it is low, and the floor is exactly the contract's terms, nothing more.

## Protective put example: 100 XYZ shares and a 46 put

A hypothetical trader holds 100 shares of XYZ bought at $48.00, so $4,800 went out for them. XYZ now trades at $50.00. On the 30-day chain from the [option chain post](/blog/how-to-read-an-option-chain), the 46 put is quoted 0.71 bid and 0.79 ask. The quotes are model estimates at 40% implied volatility, with no interest rate and no dividend, not market data.

A buyer who fills now pays the ask. One contract at 0.79 costs 0.79 × 100 = $79, paid at the fill. In return the trader holds the right to sell 100 shares at $46 at any time in the next 30 days.

Three numbers follow from the share cost, the strike and the premium:

- **The floor.** $46.00 a share, the strike. Below it, the put gains what the shares lose.
- **The break-even.** $48.00 + $0.79 = $48.79 a share. XYZ has to finish at or above that for the shares and the put together to come out even.
- **The maximum loss.** ($48.00 − $46.00) + $0.79 = $2.79 a share, or $279 for the lot, however far XYZ falls before expiration.

The maximum loss is measured against what the shares cost. Measured against today's $50.00, the same lot can still lose $4.00 to the floor plus the $0.79 premium, $4.79 a share, before the put stops the fall. Which reference to use depends on the question being asked, and both figures are true at once.

![With a 46 put bought for 0.79, the loss on 100 shares bought at 48 stops at 2.79 a share below the strike, while above it the position trails the shares alone by the premium.](/assets/blog/protective-put-payoff.svg)

The figure shows the trade on both sides. Below about $45.21 the position is ahead of the shares held alone, and the gap widens the further XYZ falls. Between $45.21 and the $46 strike it trails the shares alone by less than the premium, and from $46 up it trails them by exactly $0.79 a share, however high XYZ goes. The upside is not capped; it is reduced by the premium.

## A closer strike is a higher floor at a higher premium

The strike sets both numbers at once. On the same 30-day chain, the 48 put is quoted 1.33 bid and 1.43 ask. Bought at the ask, it puts the floor at the trader's own $48.00 cost, so the maximum loss is just the premium.

| Held at expiration | Premium at the ask | Floor | Max loss against the $48 cost | Break-even |
| --- | --- | --- | --- | --- |
| Shares alone | None | None | $48.00 a share, to zero | $48.00 |
| Shares + 46 put | 0.79, $79 | $46.00 | $2.79 a share, $279 | $48.79 |
| Shares + 48 put | 1.43, $143 | $48.00 | $1.43 a share, $143 | $49.43 |

A closer strike moves the floor up and the break-even with it. Neither line is better in general: the table shows what each costs and where each floor sits, and the choice between them is a trade-off about how much uncovered drop to accept for how much premium.

Both puts are out of the money with XYZ at $50.00, so their whole price is [extrinsic value](/blog/intrinsic-vs-extrinsic-value-options). That value [decays with time](/blog/theta-decay-explained). A protective put held to expiration with the stock above its strike loses all of it, and that is how a protective put ends whenever the stock finishes above its strike.

## How does a protective put end at expiration?

A protective put is two lines in an account: 100 shares and one long put. What happens at [options expiration](/blog/what-happens-options-expiration) depends on where XYZ closes against the 46 strike. These figures describe mechanics, not a forecast.

| At expiration | XYZ closes at $51.00 | XYZ closes at $47.00 | XYZ closes at $43.00 |
| --- | --- | --- | --- |
| The 46 put | Expires worthless | Expires worthless | $3.00 in the money, exercised |
| The shares | Kept, worth $5,100 | Kept, worth $4,700 | Sold at $46, $4,600 in cash |
| The $79 premium | Spent | Spent | Spent |
| Against $48 cost, premium included | $2.21 a share above | $1.79 a share below | $2.79 a share below |
| What the account holds | 100 shares, no put | 100 shares, no put | Cash, no shares, no put |

The middle column is the deductible at work. At $47.00 the put is out of the money and expires worthless, and the lot sits $1.79 below cost: $1.00 from the shares and $0.79 from the premium.

At $43.00 the floor does its job. A long equity option that closes at least $0.01 in the money on expiration day is usually exercised automatically under the Options Clearing Corporation's exercise-by-exception rule, unless the holder tells the broker otherwise before the broker's cutoff. Exercising the put sells the 100 shares at $46.00. The $300 of the put's value is realised as the difference between $46 and $43 on the shares.

There is a second route at $43.00. The holder can sell the put before the close, for roughly its $3.00 of intrinsic value less the bid-ask spread, and keep the shares. The total comes out about the same; what the account holds afterwards does not. It is 100 shares at $43 and about $300 in cash, with no put behind them.

## What does the account look like the day after the put expires?

This is the part a payoff diagram leaves out. The diagram describes one instant at expiration; the account carries on the next morning, and it holds something different from the day before.

![After expiration a hypothetical protective put leaves either 100 unhedged XYZ shares, if XYZ closed at 51, or $4,600 in cash, if the put was exercised at 43.](/assets/blog/protective-put-after-expiry.svg)

Take the first case, XYZ at $51.00 on expiration Friday. On Monday the account shows:

- **Shares.** 100 XYZ, worth $5,100, still at the $48.00 cost.
- **The put.** Gone. It expired worthless, and the $79 left the account a month ago.
- **The floor.** Gone too. Nothing now stops a fall below $46, or below any price.
- **The position.** What remains is the shares held alone, as they were before the put was bought.

Take the third case, XYZ at $43.00. The exercise is processed after Friday's close, and the account usually shows the result by Monday morning, though exactly when varies by broker. The share sale settles on the next business day, Monday. The account then shows $4,600 in cash and no XYZ. There is nothing left to protect, and no protective put.

## Renewing the floor costs a new premium each time

A protective put does not renew itself. To keep a floor under the shares after expiration, a new put has to be bought, at whatever the market charges that day.

Continue the first case. With XYZ at $51.00 and another 30 days to run, the 46 put is quoted 0.52 bid and 0.60 ask, again a model estimate. It is cheaper than the first one because the stock is further above the strike. Bought at the ask, it costs $60, and the running numbers change:

- **Premiums paid.** 0.79 + 0.60 = 1.39 a share, or $139, across the two puts.
- **The floor.** Still $46.00, through the new expiration.
- **Maximum loss against cost.** ($48.00 − $46.00) + $1.39 = $3.39 a share, up from $2.79.
- **Break-even.** $48.00 + $1.39 = $49.39 a share, up from $48.79.

The floor stays put while the cost of holding it grows. Each renewal adds its premium to the maximum loss and to the break-even. Over many months that sum is the real price of keeping a floor in place, and it is paid whether or not the floor is ever reached.

A put can also be replaced before it expires, by selling the old one and buying a later one in a single [roll](/blog/rolling-options-explained). That recovers whatever value the old put has left, but the roll's natural price sells the old put at its bid and buys the new one at its ask, and the arithmetic above still applies.

## Frequently asked questions

- **What is a married put?** The same structure, a long put held with 100 shares. The name is usually used when the shares and the put are bought at the same time. Its tax treatment is a question for a tax professional.
- **What is the break-even on a protective put?** The share cost plus the premium paid: $48.00 + $0.79 = $48.79 in the example.
- **What is the maximum loss on a protective put?** The share cost less the strike, plus the premium: $2.79 a share in the example.
- **Is a protective put the same as a long call?** Not the same position, but at expiration the payoff has the same shape as a call at the same strike plus cash, which is put-call parity.
- **Does a protective put cap the upside?** No. The upside is reduced by the premium, not capped. Adding a short call, as a [collar](/blog/collar-option-strategy) does, would cap it.

## The bottom line

A protective put buys a floor at the strike for a premium paid now. Break-even is the share cost plus the premium, and the maximum loss is the cost less the strike, plus the premium. Between the stock's price and the strike, the shares are not covered.

The floor lasts until expiration and no longer. The day after, the account holds unhedged shares or the cash from an exercise, and keeping a floor in place means buying another put and adding its premium to the cost.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
