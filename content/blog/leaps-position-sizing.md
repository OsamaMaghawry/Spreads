---
title: "LEAPS position sizing: premium, exposure and what each contract adds"
slug: leaps-position-sizing
search_title: "LEAPS Position Sizing: Premium, Delta Exposure, Notional"
excerpt: One LEAPS contract has three sizes at once: the premium paid, the share exposure its delta implies, and the notional it controls. Sizing a position means knowing which one you are counting.
meta_description: "LEAPS position sizing on one hypothetical call: premium paid, delta-adjusted exposure and notional, and why percent-of-account rules disagree."
author: Osama Safwat Maghawry
category: investing
series_order: 47
tags: leaps, position sizing, long-dated options, delta, risk
---

**LEAPS position sizing** is the question of how many contracts to hold, and it is harder than it looks because one LEAPS contract has three different sizes at once: the premium paid, the share exposure its delta implies, and the notional value of the shares it controls. They answer different questions, they move differently when the stock moves, and a position described by only one of them is described badly.

This is the seventh post in the [options for investors](/blog/investing) series. It builds on [LEAPS options explained](/blog/leaps-options-explained), and it uses the same hypothetical: XYZ at $50.00, no dividend, implied volatility 30%, a 4% interest rate, and a 24-month call struck at 40 that costs 15.58. All prices were worked out with a standard pricing model. They are teaching figures, not quotes.

## Key takeaways

- **Three sizes, three questions.** Premium paid is what can be lost. Delta-adjusted exposure is how much stock the position behaves like. Notional is the stock the contract controls.
- **The premium is the ceiling on the loss.** It can be lost in full while the stock still has value, and it is fixed at the price paid, whatever the stock does.
- **Exposure moves; premium does not.** As the stock falls, delta falls with it, so the position behaves like fewer shares just as the loss grows.
- **Contracts scale all three together.** Five contracts is five times the premium, five times the exposure and five times the notional, and it does not scale the account.
- **Years add questions weeks do not.** Time value spent, an end date and several long-dated positions in related stocks all bear on size.

## One contract has three sizes, and they disagree

Start with a single contract of the 40 call, and an account of $50,000. The account is hypothetical, chosen only so the ratios are easy to read. Each row below is a correct way to say how big the position is.

| Measure | How it is counted | One contract | Share of the account |
| --- | --- | --- | --- |
| Premium paid | 15.58 × 100 | $1,558 | 3.1% |
| Share-equivalent exposure | delta 0.82 × 100 shares × $50 | about $4,100 | 8.2% |
| Notional | 100 shares × $50 | $5,000 | 10% |

None of these is wrong, and each tells a different story. The premium is the cash that left the account and the most the position can ever lose. The exposure says that for small moves in XYZ the call behaves like 82 shares. The notional is the value of the stock the contract gives a right to buy.

Published rules of thumb for LEAPS sizing are usually stated as a percentage of the account, and they differ from one another by a factor of several. That is a sign they are counting different things. A percentage means nothing until it says which of the three rows it divides.

## The premium is the ceiling on the loss

The premium is the cleanest of the three because it is a fixed, known number. A long call cannot lose more than was paid for it, so $1,558 is the worst outcome of the position by construction, whatever the stock does.

Two things about that ceiling are easy to miss:

- **It can be reached while the stock is still worth something.** If XYZ sits at 40 at expiration, 100 shares are down $1,000 and the call is down the whole $1,558. The [intrinsic and time value](/blog/intrinsic-vs-extrinsic-value-options) are both gone.
- **It is a large fraction of a small stake.** The stake in the call is smaller than the stake in the shares, so a given fall in XYZ takes a larger share of it. The next section puts numbers on that.

## Exposure shrinks just as the loss grows

Delta is not fixed. As XYZ falls toward the strike, the call's [delta](/blog/option-delta-explained) falls with it, so the position behaves like fewer shares. Hold the 24-month 40 call and let XYZ fall straight away, with the full two years still to run:

| XYZ falls to | Call value | Loss on the call | Loss as share of premium | Delta | Share-equivalent exposure | Loss on 100 shares |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | 15.58 | $0 | 0% | 0.82 | about $4,100 | $0 |
| 45 | 11.64 | $394 | 25% | 0.75 | about $3,375 | $500 |
| 40 | 8.11 | $747 | 48% | 0.66 | about $2,640 | $1,000 |
| 35 | 5.13 | $1,045 | 67% | 0.53 | about $1,855 | $1,500 |

Read across a row. At 40, the call has lost 48% of what was paid, where the shares have lost 20% of what they cost. In dollars the call lost less, as the earlier post showed. In proportion to the stake it lost more.

Read down the exposure column. The position gives up about $2,245 of share exposure between 50 and 35, so at 35 each dollar of recovery adds about $53 per contract, where the first dollar of the fall cost about $82. If the stock came straight back to 50, the call would regain what it lost, less the time value spent while it waited. Anyone who sized the position by its starting exposure, about 82 shares, is holding something that now behaves like about 53.

## Adding contracts multiplies all three at once

Now size up. Five contracts of the 40 call, on the same $50,000 account:

| Measure | Five contracts | Share of the account |
| --- | --- | --- |
| Premium paid | $7,790 | 15.6% |
| Share-equivalent exposure | 410 shares, about $20,500 | 41% |
| Notional | 500 shares, $25,000 | 50% |

![Three bars compare five contracts of a hypothetical 24-month XYZ 40 call on a 50,000 account: 7,790 of premium paid, which is the most it can lose, about 20,500 of share-equivalent exposure at a delta of 0.82, and 25,000 of notional.](/assets/blog/leaps-three-sizes.svg)

The picture is the point of this section. The account has spent a bit under a sixth of itself, and yet it behaves like a position in stock worth about two-fifths of it. Both statements are true at once. A reader who saw only the first would call the position small, and a reader who saw only the third would call it half the account.

Three consequences follow:

- **Leverage is the gap between the bars.** The premium bar is short and the exposure bar is long. The ratio between them is what makes a modest cash outlay move with a large block of stock.
- **The loss scales linearly with contracts.** Five contracts lose five times as much in the fall to 40, which is $3,735 against $747, with exposure still falling as it goes.
- **The cash not spent is not free.** The $42,210 left over is still in the account, still has its own risk, and still has to be counted. A LEAPS sized only by its premium says nothing about the rest.

## Years add questions that weeks do not

A 30-day option is over before most of these matter. A LEAPS is held long enough that they do.

- **Time value is spent every day.** With the stock flat, the 40 call loses about $264 of its time value over the first year, per contract. Five contracts lose about $1,320. That is a running cost of holding the position, whatever else happens.
- **The position has an end date.** Shares can be held indefinitely and a call cannot. Sizing a position that must be replaced, or allowed to expire, is a different question from sizing one that never ends.
- **Related stocks share one risk.** Several long-dated calls on stocks that tend to move together are closer to one large position than to several small ones. Adding up premiums understates how much a single bad month can take.
- **Replacing it costs again.** Closing or replacing a LEAPS means paying the [bid-ask spread](/blog/options-bid-ask-spread) again, which on long-dated contracts can be wide in dollars.

None of these has a formula, which is why a percentage rule alone cannot settle it. They are things a holder can count and write down, which is a different thing from a number someone else supplies.

## Frequently asked questions

- **What percentage of an account should go into LEAPS?** That is a decision about an individual's goals and limits, and it cannot be derived from the contract. What can be derived is what each percentage means: which of the three sizes it divides and how much loss it implies.
- **Is the premium really the most I can lose?** Yes, as long as it stays a call. A long call cannot lose more than was paid, though it can lose all of it. If it is exercised, the result is a share position with share risk.
- **Why does the delta-adjusted exposure change?** Because delta changes with the stock price, the time left and implied volatility. It is a snapshot, not a constant.
- **Does the exposure number include volatility risk?** No. A fall in [implied volatility](/blog/implied-volatility-options-explained) can reduce the value of a LEAPS with the stock unchanged, and the exposure figure does not show it.
- **Should I compare it with buying shares?** It is a fair comparison of mechanics, as in [stock replacement](/blog/stock-replacement-strategy), but the two stakes are different sizes and the call ends on a date.

## The bottom line

One LEAPS contract on the hypothetical XYZ cost $1,558, behaved like about 82 shares and controlled $5,000 of stock. Five contracts cost $7,790, behaved like 410 shares and controlled $25,000, on an account of $50,000. The premium is the ceiling on the loss, delta shows how much stock the position behaves like, and notional shows how much it controls. A percentage means nothing until it says which of the three it counts. The next post, on [a long-dated option's Greeks](/blog/leaps-delta-theta), takes delta and theta further. The category index is at [options for investors](/blog/investing).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
