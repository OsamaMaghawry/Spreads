---
title: "Collar option strategy: the floor, the cap and the day after expiry"
search_title: "Collar option strategy: example, break-even and max loss"
slug: collar-option-strategy
excerpt: A collar is 100 shares held with a put bought below the stock and a call sold above it, so the position has a floor and a cap until the options expire.
meta_description: "A collar pairs a bought put with a sold call on 100 shares. Worked example: floor, cap, break-even, max loss, and what the account holds after expiry."
author: Osama Safwat Maghawry
category: hedging
series_order: 32
tags: collar, hedging, protective put, covered call, expiration
---

A **collar** is 100 shares of a stock held together with a [put option](/blog/call-vs-put-option-explained) bought below the current price and a call option sold above it, both on the same stock and the same expiration date. The put sets a floor under the shares, the call sets a cap over them, and the premium from the call pays some or all of the cost of the put.

This is the second post in the [hedging series](/blog/hedging). It uses the same made-up ticker, XYZ, and the same 100 shares bought at $48.00 as the [protective put post](/blog/protective-put-explained), and it ends where most explanations stop: the day the options expire, and what the account holds afterwards.

## Key takeaways

- **A collar is two options on one lot.** A long put gives a floor at its strike, and a short call gives a cap at its strike.
- **The call pays for the put.** The premium collected on the call offsets the premium paid on the put, so the net can be a small credit, a small debit or close to nothing.
- **The range is fixed in advance.** At expiration, between the two strikes the position moves one for one with the stock; outside them it stops moving.
- **The cap is the price of the floor.** Above the call strike the shares' gains belong to the call holder, so the upside is given up in exchange for the cheaper protection.
- **It ends at expiration.** After that the account holds shares with no options, or cash from a delivery or an exercise, and a new collar means a new pair of contracts.

## How does a collar work? A protective put paid for with a covered call

The [protective put](/blog/protective-put-explained) costs a premium and leaves the upside open. The [covered call](/blog/covered-call-explained) collects a premium and gives the upside away. A collar is the two stacked on one lot of shares, and each one covers the other's weak point.

The put's cost is spent whether or not the stock ever falls. The call's premium comes with a cap on what the shares can earn. Put together, the call's premium goes toward the put, and the cap is the price of that arrangement.

Three choices give the position its shape:

- **The floor strike.** A put below the stock's price. Lower means cheaper and a larger uncovered drop.
- **The cap strike.** A call above it. Closer to the stock means more premium and less room above.
- **The expiration.** Both options share one date, so floor and cap start and end together.

Neither strike is correct in general, and the net premium falls out of the two quotes.

## Collar option example: 100 XYZ shares, a 46 put and a 54 call

A hypothetical trader holds 100 shares of XYZ bought at $48.00, so $4,800 went out for them. XYZ trades at $50.00. On the 30-day chain from the [option chain post](/blog/how-to-read-an-option-chain), the 46 put is quoted 0.71 bid and 0.79 ask, and the 54 call is quoted 0.85 bid and 0.93 ask. The quotes are model estimates at 40% implied volatility, with no interest rate and no dividend, not market data.

A collar means buying one and selling the other, so this example assumes fills at the worse side of each quote:

- **Buy the 46 put at the ask.** 0.79 × 100 = $79 paid.
- **Sell the 54 call at the bid.** 0.85 × 100 = $85 received.
- **Net.** $85 − $79 = $6 received, or 0.06 a share. The two premiums nearly cancel.

Four numbers follow from the share cost, the two strikes and that net credit:

- **The floor.** $46.00 a share, the put's strike.
- **The cap.** $54.00 a share, the call's strike. Above it at expiration the shares are delivered.
- **The break-even.** $48.00 − $0.06 = $47.94 a share, because the credit lowers the effective cost.
- **The range of results.** The most the position can lose by expiration is ($48.00 − $46.00) − $0.06 = $1.94 a share, or $194. The most it can gain is ($54.00 − $48.00) + $0.06 = $6.06 a share, or $606.

![With a 46 put bought and a 54 call sold for a net credit of 0.06, the result on 100 shares bought at 48 is flat at a loss of 1.94 below 46, rises one for one to a gain of 6.06 at 54, and is flat above.](/assets/blog/collar-payoff.svg)

The figure shows what was traded away. Below $46 the position beats the shares alone, and the gap widens as XYZ falls. Above $54 it trails the shares alone, and the gap widens as XYZ rises. In the middle it sits roughly on top of the shares, which is the stretch the collar leaves alone.

The maximum loss is measured against the $48.00 cost. Against today's $50.00 the same lot can still lose $4.00 down to the floor, less the $0.06 credit.

## What does a collar cost? Moving a strike moves the cost, the floor and the cap

The pair above is one of many. On the same 30-day chain the 52 call, the one sold in the [covered call post](/blog/covered-call-explained), is quoted 1.42 bid and 1.52 ask. Selling it instead of the 54 call collects more, because it is closer to the stock, and gives up more upside, because the cap is lower.

| Held at expiration | Net premium | Floor | Cap | Max loss against the $48 cost | Max gain against the $48 cost |
| --- | --- | --- | --- | --- | --- |
| Shares alone | None | None | None | $48.00 a share, to zero | Unlimited |
| Shares + 46 put | 0.79 paid | $46.00 | None | $2.79 a share | Unlimited, less 0.79 |
| Collar, 46 put and 54 call | 0.06 received | $46.00 | $54.00 | $1.94 a share | $6.06 a share |
| Collar, 46 put and 52 call | 0.63 received | $46.00 | $52.00 | $1.37 a share | $4.63 a share |

Reading across the last two rows: moving the call down from 54 to 52 collects $0.57 more a share, which lowers the maximum loss by $0.57 and lowers the maximum gain by $1.43. Neither row is better in general. The table shows what each pair costs and where each stops, and the choice between them is a trade-off about how much upside to give up for how much protection.

The net premium moves with [implied volatility](/blog/implied-volatility-options-explained), the time left, and each strike's distance from the stock. A collar that nets to zero one day can be a small debit the next, so "zero cost" describes one fill, not the structure.

## How does a collar end at expiration?

A collar is three lines in an account: 100 shares, one long put and one short call. What happens at [options expiration](/blog/what-happens-options-expiration) depends on where XYZ closes against the two strikes. These figures describe mechanics, not a forecast.

| At expiration | XYZ closes at $58.00 | XYZ closes at $50.00 | XYZ closes at $43.00 |
| --- | --- | --- | --- |
| The 54 short call | $4.00 in the money, assigned | Expires worthless | Expires worthless |
| The 46 long put | Expires worthless | Expires worthless | $3.00 in the money, exercised |
| The shares | Delivered at $54, $5,400 in cash | Kept, worth $5,000 | Sold at $46, $4,600 in cash |
| Net premium | $6 kept | $6 kept | $6 kept |
| Against $48 cost, premium included | $6.06 a share above | $2.06 a share above | $1.94 a share below |
| What the account holds | Cash, no shares, no options | 100 shares, no options | Cash, no shares, no options |

At $58.00 the collar is at its cap: the call holder takes the shares for $54.00 and the $4.00 above that never reaches the account. At $43.00 it is at its floor: the put sells the shares for $46.00, and the put's $3.00 of value offsets the shares' loss below that, realised as the difference between $46 and $43.

In the middle column both options expire and the shares stay. A long equity put that closes at least $0.01 in the money is usually exercised automatically under the Options Clearing Corporation's exercise-by-exception rule, unless its holder tells the broker otherwise before the cutoff. A short call that closes in the money is very likely to be [assigned](/blog/option-assignment-what-happens), because the call's holders are exercised the same way, and the writer cannot instruct or prevent it.

## What does the account hold the day after a collar expires?

A payoff diagram describes one instant at expiration. The account carries on the next morning, holding something different from the day before.

![After expiration a hypothetical collar leaves $4,600 in cash if XYZ closed at 43, 100 unhedged shares if it closed at 50, or $5,400 in cash if it closed at 58.](/assets/blog/collar-after-expiry.svg)

Take the middle case, XYZ at $50.00 on expiration Friday. On Monday the account shows:

- **Shares.** 100 XYZ, worth $5,000, still at the $48.00 cost.
- **The put.** Gone. It expired worthless.
- **The call.** Gone as well, so the cap is gone with the floor.
- **The position.** Shares held alone, exactly as before the collar was opened, with the $6 credit in the account.

In the outer cases the account holds cash and no XYZ. There is nothing left to collar, and building the same position again means buying shares first. A collar does not renew itself: to keep a floor and a cap in place, a new put and a new call have to be traded at whatever the market quotes that day.

## An early assignment can leave a put with no shares behind it

Everything above assumes the options are held to expiration. The short call is an obligation, and US equity options are American-style, so the call can be assigned on any day before expiration, not just the last.

[Early exercise](/blog/early-exercise-options) of a call is uncommon, and mostly happens just before an ex-dividend date when the call is deep in the money (the example's quotes assume no dividend). If it happens to a collar:

- **The call is assigned.** The 100 shares are delivered at the call's strike, and the cap is realised early.
- **The put stays.** Nothing closes it automatically, so the account now holds a long put and no shares.
- **The position changed shape.** A long put on its own is not a hedge. It gains if the stock falls and loses its premium if it does not.
- **The put can still be exercised.** If it finishes in the money at expiration with no shares behind it, automatic exercise would leave the account short 100 shares, which needs margin and is not possible in a cash account.

The three lines of a collar do not always leave the account together, so the account should be read as a new position, not as a collar with a missing leg.

## Frequently asked questions

- **What is a zero-cost collar?** A collar whose call premium roughly equals its put premium, so the net is close to zero. It is one fill on one day, as the 0.06 credit above shows, not a standing property.
- **What is the break-even on a collar?** The share cost, less any net credit or plus any net debit: $48.00 − $0.06 = $47.94 in the example.
- **What is the maximum loss on a collar?** The share cost less the put strike, adjusted for the net premium: $1.94 a share in the example.
- **What is the difference between a collar and a protective put?** The sold call. It lowers the maximum loss on the same lot from $2.79 to $1.94 a share in the example, and caps the gain at $6.06.
- **Is a collar a covered call with a put added?** In effect, yes, or a protective put with a call sold against it.

## The bottom line

A collar fixes a range for 100 shares: a floor at the put's strike and a cap at the call's strike, with the call's premium offsetting the put's cost. In the example the floor is $46, the cap is $54, the net is a $0.06 credit, and the position can lose at most $1.94 a share or gain at most $6.06.

Both ends are set for one expiration only. The day after, the account holds unhedged shares or cash, and each new collar is a new pair of contracts priced that day.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
