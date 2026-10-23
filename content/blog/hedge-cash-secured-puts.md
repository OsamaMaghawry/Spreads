---
title: "Hedging cash-secured puts: three hedges on one account"
slug: hedge-cash-secured-puts
excerpt: Cash securing a put provides the money to buy the shares, not a limit on the loss, and the hedges differ in how much of that loss they limit.
meta_description: "Hedging cash-secured puts: a lower put, an index put or a VIX call. What each pays in a fall, and the loss the cash reserve does not cover."
author: Osama Safwat Maghawry
category: hedging
series_order: 36
tags: hedging, cash-secured put, put spread, index puts, vix
---

To **hedge a cash-secured put** is to add a second position intended to gain when the stock falls. Only some choices put a limit on the loss. The put itself is already "secured" by cash, which is a different protection, and the gap between the two is where most of the confusion sits.

This is the sixth post in the [hedging series](/blog/hedging). The earlier posts hedged shares someone already owns. Here the position is an obligation to buy shares, taken on for a premium, as set out in the [cash-secured put post](/blog/cash-secured-put-explained).

## Key takeaways

- **Cash securing is not a hedge.** The reserve provides the money to take delivery of the shares. It puts no limit on what the shares are worth afterwards.
- **A put on the same stock ties the hedge most closely to the loss, which is why it fixes the worst case.** Buying a lower-strike put against the short one turns the position into a [put credit spread](/blog/put-credit-spread-explained) with a fixed worst case.
- **An index put covers the book only as far as the book moves with the index.** A single name can fall while the index does not.
- **A VIX call pays on volatility, not on the puts.** It can fail to pay in a fall that arrives slowly.
- **Every hedge costs its premium in the outcomes where it was not needed.** That cost is the price of the limit.

## Does a cash-secured put protect you in a crash?

A short put loses when the stock falls below the strike, by the same amount per share as owning the stock would, less the premium kept. Setting aside the full strike times 100 does not change that arithmetic. It decides who carries the risk of not being able to pay.

The reserve prevents a forced sale. With the cash already there, a falling stock does not by itself trigger a margin call on the put, at most brokers, and the position can usually be held to expiration. That is a real protection, and it is the one the word "secured" describes.

The reserve does not prevent the loss. If the put is assigned at 50 with the stock at 42, the account holds shares bought at an effective cost of 48.60 that are worth 42. The loss is the same whether the cash was set aside or borrowed, and it runs all the way to the strike less the premium if the stock goes to zero.

The mark also moves before expiration, and sometimes by more than the stock explains. A short put is short [implied volatility](/blog/implied-volatility-options-explained), and volatility tends to rise in a fall, so the put can be marked at a loss larger than the stock's move alone would suggest, weeks before any assignment. A trader who looks at the position during the fall sees that larger number, whatever the reserve says.

A hedge is about the loss, not the cash. The three below limit it in different ways.

## How does a long put hedge a cash-secured put?

The numbers below are hypothetical. XYZ trades at $52.00. An account sells five 50-strike puts with 30 days left at 1.40, the premium used in the [cash-secured put post](/blog/cash-secured-put-explained), and reserves $25,000 against them. The premium received is 1.40 × 500 = **$700**.

The hedge is five 46-strike puts bought at an ask of 0.45, which cost 0.45 × 500 = **$225**. The 46 put has the same 30-day expiration, so the pair is now a 50/46 put credit spread: a net credit of 0.95, a break-even of 49.05, and a worst case of (4.00 − 0.95) × 500 = **$1,525**.

| XYZ at expiration | Five short 50 puts alone | With five 46 puts | What the account holds |
| --- | --- | --- | --- |
| $53.00 | +$700 | +$475 | Both puts expire worthless |
| $47.00 | -$800 | -$1,025 | 50 put assigned; 46 put expires worthless |
| $42.00 | -$3,300 | -$1,525 | 50 put assigned; 46 put exercised against the shares |

The first two rows show the cost: the hedge turns a $700 gain into $475 and an $800 loss into $1,025, the same $225 each time. The third row shows what the $225 bought. Below 46 the two puts move together, so the loss stops at $1,525 however far the stock falls.

![Five hypothetical short 50 puts lose 500 dollars for each dollar the stock falls below 50, while the same puts with five bought 46 puts lose no more than 1,525 whatever the price, at a cost of 225 above the 46 strike.](/assets/blog/short-puts-hedged-payoff.svg)

Two things change in the account:

- **The reserve shrinks.** A spread is usually held against its width: about 4.00 × 100 × 5 = $2,000 here, against $25,000. Brokers differ; the [buying power post](/blog/options-buying-power-requirement) sets out the hold.
- **The position is no longer cash-secured.** It is a defined-risk spread: the same two legs as the bear put spread in the [put spread hedge](/blog/put-spread-hedge) post, traded the other way round.

If the short 50 put is assigned early while the 46 put is still held, the account owns 500 shares with a put underneath them. Paying for them takes the full $25,000, so cash released by the smaller hold has to still be there, or the purchase is carried on margin. That is the [protective put](/blog/protective-put-explained) position, with a floor at 46.

## Can an index put hedge a book of short puts?

An account with short puts on several names can hedge once instead of name by name, with a put on a broad index. One index position is sometimes used in place of a put on every name; it pays only as far as the names move with the index. What it pays on is the index, not the stocks.

It pays when the names fall with the index. In a broad selloff the index put gains while the short puts lose.

It pays nothing for a single-name fall. If XYZ drops 20% on its own news while the index barely moves, the short puts lose and the index put expires worthless. It can also pay when the book is fine: the index can fall while the names written on hold up, and the premium was spent for a gain nobody needed.

The size is an assumption. How many index contracts match a book of short puts depends on how closely the names track the index, and that relationship changes from month to month, usually in the weeks when it matters.

The gap is called **basis risk**: the hedge and the position are tied by a relationship, not a contract. A put on the same stock has none.

Related: the [SPX vs SPY options post](/blog/spx-vs-spy-options-hedge) puts numbers on that gap, with one index-put hedge worked through paths where the stock and the index disagree.

## Can VIX calls hedge put selling?

A call on the VIX pays when expected volatility rises, which usually accompanies a fall in stocks. Short puts are short volatility, so on paper this lines up. The [VIX hedge post](/blog/vix-hedge-explained) shows where it does not.

It pays on the level at expiration. A fast, sharp fall can lift the VIX well above the strike. A slow decline can leave it below, with the short puts deep in the red and the call worthless.

It is priced from a future, not from spot. In calm markets the future sits above spot, and slides down toward it as expiration nears, so the call loses value even when nothing happens, which makes it a cost while the puts are doing well.

It also has no link to any one stock, so of the three hedges it has the loosest tie to the loss. It belongs in this list because short puts lose when volatility rises, not because it offsets a specific position.

## What does each hedge pay, and what does it cost?

None of the three is free, and none is complete.

| Hedge | Pays on | Leaves open | Cost shows up as |
| --- | --- | --- | --- |
| Put on the same stock | That stock below its strike | The band between the strikes, and the gain given up above | The premium paid, 225 in the example |
| Put on an index | The index below its strike | A fall in a single name; a book that moves differently from the index | The premium paid, plus an uncertain size |
| Call on the VIX | The volatility index above its strike | A slow decline; any fall that does not move the VIX | The premium paid, plus decay while spot is flat |

In the example, the 46 puts cost $225 at $53 and $47, and pay $2,000 at $42. Whether that outcome occurs is the open question. What matters is whether the loss a hedge covers is the one the account carries, and what it leaves open on the way.

## Frequently asked questions

- **How do you hedge a short put?** With a second position that gains as the stock falls: a lower-strike put on the same stock, a put on an index, or a call on the VIX. Each limits a different part of the loss, as the table above sets out.
- **Does a cash-secured put need a hedge?** At most brokers the reserve avoids a margin call on the put alone, and the loss below the break-even is open. Whether to limit it is a decision for the reader, not something these mechanics settle.
- **Is a short put hedged with a lower put the same as a put spread?** Yes, if the bought put is on the same stock and expiration: it is a put credit spread, whichever way it was assembled.
- **What happens to the hedge if the short put is assigned?** A long put not yet expired stays, now under the shares. If both expire on one night, each settles against its own strike, as the [credit spread max loss post](/blog/credit-spread-max-loss) describes.
- **Can the hedge lose when the stock falls?** Yes. An index put on a book that fell by itself, or a VIX call on a slow decline, can expire worthless while the short puts lose.

## The bottom line

A cash-secured put is secured against the inability to pay, not against the loss. Hedging it means buying something that gains as the stock falls, and each choice trades a different thing: a put on the same stock fixes the worst case at $1,525 in the example for a cost of $225, an index put covers the book through a relationship, and a VIX call pays on volatility rather than on any position.

To see what the short put does before the hedge, start from the [income series](/blog/income). Shares held with a bought 46 put and a sold 50 call on one expiration have the same shape, a [collar](/blog/collar-option-strategy). What it costs to keep a put hedge on all year, for a stock position, is worked through in the [tail risk hedge cost post](/blog/tail-risk-hedge-cost).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
