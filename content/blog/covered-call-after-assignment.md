---
title: "Covered call after assignment: the strike against the cost"
slug: covered-call-after-assignment
excerpt: After a put is assigned, the account holds 100 shares and nothing sold against them, and a covered call sets the price they would leave at without touching the loss already in them.
meta_description: "Covered call after assignment: three strikes priced against the cost of assigned shares, showing the premium, the cap, and the loss no strike removes."
author: Osama Safwat Maghawry
category: income
series_order: 29
tags: covered call, assignment, cost basis, wheel strategy, income
---

A **covered call after assignment** is a call sold against the 100 shares an assigned put has just delivered. The shares are the collateral, so no new cash is reserved, and the call sets the price at which those shares would leave. It does not set what they cost, and it does not change where the stock is trading.

This post continues the [income series](/blog/income) from [rolling options](/blog/rolling-options-explained), and picks up the second turn of the [wheel](/blog/wheel-strategy-explained) in slow motion. It prices three call strikes against one hypothetical set of assigned shares and shows what each one does and does not change. It describes mechanics and does not suggest anyone sell any of them.

## Key takeaways

- Assignment leaves the account with **100 shares and no call**. Selling one is a separate, later decision.
- The assignment is booked as a purchase of 100 shares at the put's **strike**. Counting the premium taken on the put as well gives the **effective cost**.
- A lower call strike pays **more premium and caps the result sooner**. A higher strike pays less and caps it later.
- No strike removes a loss already sitting in the shares. The call only adds its premium and sets an exit price.
- The shares stay **collateral** until the call ends, so they cannot be sold separately without leaving the call uncovered.

## What do the shares cost after the put is assigned?

Assignment turns a short put into shares at the put's strike, as the [assignment post](/blog/option-assignment-what-happens) walks through line by line. The assignment is booked as a purchase of 100 shares at that strike. Brokers and tax records may report the shares' cost differently from the arithmetic here, and how a given account does so varies. This post keeps the put premium and the share price apart and does the subtraction by hand. Tax treatment is a question for a tax professional.

Combining them is arithmetic the trader does, and it is how the [cash-secured put post](/blog/cash-secured-put-explained) gets its break-even. The example here is the one the [wheel post](/blog/wheel-strategy-explained) left off at, with the same hypothetical XYZ and the same 40% implied volatility, no interest rate and no dividend:

- **The put.** One 50 put was sold for $1.40, so $140 came in.
- **The assignment.** XYZ closed at $47.00 and the put was assigned: 100 shares bought at $50.00, $5,000 paid.
- **The effective cost.** $50.00 less $1.40 is $48.60 a share, the figure wheel traders often call the cost basis, so the shares at $47.00 sit $1.60 a share below it.

The morning after, the account holds shares and nothing sold against them. A covered call is one of several things it could do next, and the others are to leave the shares alone or to sell them. This post covers only the first, because it is the one that turns on a number, the strike, that is easy to choose without seeing what it trades away.

## What does a covered call add, and what does it leave alone?

A call sold against the shares adds premium and a cap. It leaves the shares' price, their downside and the $48.60 exactly where they were. Everything about the choice of strike is a trade between those two additions.

On the same chain at $47.00 with 30 days left, three calls are quoted, and the account sells each at the bid:

| Call strike | Bid / ask | Premium taken | If assigned, shares leave at | Result per share if assigned |
| --- | --- | --- | --- | --- |
| 48, below the effective cost | 1.66 / 1.76 | $166 | $48.00 | 48.00 - 48.60 + 1.66 = +1.06 |
| 50, above it | 0.98 / 1.08 | $98 | $50.00 | 50.00 - 48.60 + 0.98 = +2.38 |
| 52, further above | 0.54 / 0.64 | $54 | $52.00 | 52.00 - 48.60 + 0.54 = +3.94 |

The last column adds the put premium, the share gain or loss to the strike, and the call premium, and it is the largest result the position can reach at that strike, on these hypothetical numbers. The lower the strike, the more premium it pays today and the less room the shares have to gain before they are called away.

The fills are at the bid because a seller meets the [bid-ask spread](/blog/options-bid-ask-spread) on the way in. The quotes are model estimates for a hypothetical chain, not market data. All three calls are out of the money with XYZ at $47.00, so every cent of each premium is [time value](/blog/intrinsic-vs-extrinsic-value-options). That is why the nearest strike pays the most: it has the best chance of finishing in the money, and the buyer pays for that chance.

![At call expiration, 100 hypothetical XYZ shares with a 48.60 effective cost gain a flat 1.06, 2.38 or 3.94 once the stock passes a 48, 50 or 52 call, and below the strike each call line sits above the shares alone by the premium taken.](/assets/blog/covered-call-after-assignment-payoff.svg)

## The strike sets the cap, and the premium sets the cushion

Each call line in the picture does two things at once. Above the strike it goes flat, because the shares are delivered at the strike no matter how high the stock goes. Below the strike it runs parallel to the shares alone, higher by exactly the premium, because the call expires worthless and the premium is kept.

Four closes at the call's expiration show both effects. Each cell is the gain or loss per share against the $48.60 effective cost, with the call premium included:

| XYZ closes at | Shares alone | 48 call | 50 call | 52 call |
| --- | --- | --- | --- | --- |
| $44.00 | -4.60 | -2.94 | -3.62 | -4.06 |
| $47.00 | -1.60 | +0.06 | -0.62 | -1.06 |
| $51.00 | +2.40 | +1.06 | +2.38 | +2.94 |
| $55.00 | +6.40 | +1.06 | +2.38 | +3.94 |

Read down the 48 column. It gives the highest result of the three calls at $44.00 and $47.00 and the lowest at $55.00. The premium is paid up front for a cap that arrives sooner, and which row of the table happens is not known when the call is sold. A call struck high is the opposite bundle: a smaller cushion and a larger cap.

The cushion is limited. If XYZ closes at $44.00, the 52 call cut the shares' loss from $4.60 to $4.06 and the 48 call cut it to $2.94, and both are still losses. A covered call lowers the break-even, and the position is still long 100 shares.

## Where does the break-even move?

Counting both premiums, the position's break-even at expiration is the effective cost less the call premium. That is 46.94 for the 48 call, 47.62 for the 50 call and 48.06 for the 52 call. Below that price the position loses, and above it, up to the strike, it makes money.

![For hypothetical XYZ shares with a 48.60 effective cost, a 48 call moves the break-even to 46.94, a 50 call to 47.62 and a 52 call to 48.06, each one set by the premium that strike brought in.](/assets/blog/assigned-shares-strike-and-break-even.svg)

The break-even depends only on premium, so it does not tell whether the strike is above or below the effective cost. That relationship is separate:

- **Strike above the effective cost.** If called away, the shares leave above the effective cost before the call premium, and the premium adds to it. The 50 and 52 calls are here.
- **Strike below the effective cost.** If called away, the shares leave below the effective cost before the call premium, and the premium can make up some or all of it. At 48 the shares are 0.60 below the effective cost, and the 1.66 of premium covers that with 1.06 to spare.
- **Strike below the stock price.** A call struck under the current price starts in the money, and assignment becomes likely at expiration whatever premium it brought in. None of the three strikes here is, because XYZ is at $47.00, but a stock that recovers past 48 would put the 48 call there.

Whether any of these is wise depends on what a trader expects to do with the shares, which this post does not judge. The arithmetic only shows that a low strike is a price, in upside given up, for a bigger payment now. A reader who sees only the premium column will always prefer the lowest strike, and a reader who sees only the cap column will always prefer the highest. The position is both columns at once, which is why the table puts them side by side.

## What changes once the call is sold?

The call is a contract with its own life. The shares do not move when it is sold, but the position they sit in changes in four practical ways, and each is a way the call can end:

- **The shares are tied up.** They collateralize the call, so selling them while the call is open leaves a short call with nothing behind it. Buying the call back first is the way out, and it costs whatever the call is then worth.
- **Assignment can come early.** A short call can be assigned before expiration, most often when it is in the money and an ex-dividend date is near, as the [early exercise post](/blog/early-exercise-options) explains. The assignment notice usually arrives the next morning, and the shares are delivered at the strike.
- **Assignment can also be the intent.** If the shares are called away, the account holds cash at the strike, as the [covered call post](/blog/covered-call-explained) shows the morning after, and the [wheel](/blog/wheel-strategy-explained) is back where it began.
- **Usually nothing happens at expiration if the call is out of the money.** It [expires worthless](/blog/what-happens-options-expiration), the premium is kept, and the account holds shares with no call, as it did the morning after assignment.

The call can also be bought back before any of that, at whatever it then costs, and a roll to a later date or another strike is the same two-leg ticket the [rolling post](/blog/rolling-options-explained) prices.

## Frequently asked questions

- **Can a covered call be sold the same day a put is assigned?** The shares appear once the assignment is posted, normally the next trading day, and a call is covered once 100 shares are there. The practical timing depends on the broker's processing, so check the account.
- **Does the call premium change the cost of the shares?** In the arithmetic here it leaves the $48.60 effective cost as it was and lowers the break-even by the premium taken. How a broker or a tax record treats it is a separate matter, and tax treatment is for a tax professional.
- **What happens if the covered call strike is below the cost basis?** If called away, the shares leave under their effective cost, and that part of the loss is realized. The call premium offsets some or all of it: at 48 the shares leave 0.60 below the 48.60 effective cost, and the 1.66 premium covers that with 1.06 to spare.
- **Does a covered call protect against a falling stock?** Only by the premium taken. The shares still lose a dollar for each dollar the stock falls below the break-even.

## The bottom line

After a put is assigned, the account holds 100 shares at the put's strike and nothing sold against them, and a covered call is one of several things the account could do next. On the hypothetical XYZ shares, a 48, 50 and 52 call pay $166, $98 and $54 and cap the result at 1.06, 2.38 and 3.94 a share. Each moves the break-even by its premium, and none touches the $1.60 the shares already sit below the $48.60 effective cost.

The strike is a bundle of premium now against upside later. The [income series](/blog/income) continues with [how the wheel's cost basis is adjusted for every premium](/blog/wheel-strategy-cost-basis).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
