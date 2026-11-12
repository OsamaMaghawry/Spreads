---
title: "Options limit order not filling: price walking a spread, cent by cent"
slug: options-limit-order-not-filling
search_title: "Options Limit Order Not Filling: Walking a Spread's Price"
excerpt: A spread order at the mid can sit all day without a fill. Why that happens, what walking the price toward the natural does, and what each cent given up costs in credit and in max loss.
meta_description: "Options limit order not filling? Why a spread at the mid sits unfilled, what price walking is, and how each cent of credit given up becomes max loss."
author: Osama Safwat Maghawry
category: managing
series_order: 56
tags: limit order, price walking, bid-ask spread, credit spread, order fills
---

An **options limit order that is not filling** is an order resting at a price nobody in the market has yet agreed to trade at. On a spread, that price is usually the mid: the halfway point between the spread's bid and ask, which is a calculation and not a quote. **Price walking** is the practice of moving the limit toward the other side's price in small steps, waiting at each one, until the order fills or the trader stops.

This post sits in the [After the fill](/blog/managing) series. It builds on [what a bid-ask spread costs on an option](/blog/options-bid-ask-spread) and on [the maximum loss of a credit spread](/blog/credit-spread-max-loss), and it uses one hypothetical order throughout.

Key Takeaways:

- **A limit is a ceiling or a floor, not a request.** It fills only when another participant will trade at that price or better.
- **The mid is arithmetic.** Nobody has to be quoting it, so an order there can wait indefinitely.
- **Walking the price trades credit for a fill.** Each step down on a credit spread asks for less and makes a fill more likely, with no promise of one.
- **A cent of credit is a cent of risk.** On a defined-risk spread, every cent given up comes straight off the credit and straight onto the maximum loss.

## Why does a spread order at the mid not fill?

A limit order to sell a credit spread at 0.60 means "0.60 or more". It fills when a market maker or another trader is willing to take the other side at that price, and it waits, unfilled, for as long as nobody is. A resting order is not a fault in the order. It is the order working as written.

On a spread, four prices are in play rather than two, which is the main reason the gap is wider than on one option. Take a hypothetical XYZ 50/48 put credit spread, ten contracts, with these leg quotes:

| Leg | Bid | Ask | Mid |
| --- | --- | --- | --- |
| Sell the 50 put | 1.35 | 1.45 | 1.40 |
| Buy the 48 put | 0.75 | 0.85 | 0.80 |
| Spread, as a credit | 0.50 | 0.70 | 0.60 |

The spread's **natural** price is what the legs pay if each one trades at the price on screen against the seller: sell the 50 put at its 1.35 bid and buy the 48 put at its 0.85 ask, for a 0.50 credit. The **far** side is the reverse, 0.70, which is what a buyer of the spread would pay at the displayed prices. The mid, 0.60, sits between them and belongs to nobody.

The common reasons an order at or near the mid does not fill:

- **Nobody quotes the mid.** It is the average of two quotes. The legs' bids and asks add up to a 0.50 bid for the spread, which is what the market will pay now, and 0.60 is ten cents more.
- **The market moved after the order went in.** A spread's price moves with the stock. If XYZ rises a little, the put spread is worth less, and a sell order at 0.60 is now further from the market than it was.
- **The legs' quotes are wide.** Each leg here is ten cents wide, so the spread is twenty. The wider the legs, the further the mid sits from any shown price.
- **The order is not live.** Most listed equity options trade only in regular hours. An order entered after the close waits, and an unfilled day order is cancelled at the close.

Related: [options position alerts](/blog/options-position-alerts), on why an alert on a spread's mark is partly an alert on its quote.

## What is price walking, and how does it work on a spread?

Price walking is a sequence of replaced orders, each at a slightly worse price for the trader. On the hypothetical spread, a trader might start at the 0.60 mid, wait, move to 0.58, wait again, then try 0.56. The step size and the wait are the trader's choice; nothing in the market sets them.

![A sell order on the hypothetical 50/48 put credit spread starts at the 0.60 mid, steps to 0.58 without a fill, then fills at 0.56, four cents below where the walk started.](/assets/blog/limit-order-walk-ladder.svg)

Each step has the same mechanics behind it:

- **The old order is replaced.** A change of price makes it a new order at the new price, and it loses any time priority it had, whatever the broker calls the change.
- **A better fill is still possible.** A limit sell at 0.56 can fill at 0.57. The limit is the worst price accepted.
- **Each wait carries market risk.** The stock moves while the order rests, and the mid moves with it.
- **A walk can end without a fill.** The trader can stop at any step and cancel. Nothing obliges anyone to trade at the last price asked.

Walking is different from sending the order at the natural from the start. An order priced at 0.50 is marketable: it meets the displayed prices, and on a liquid spread it usually fills for the size shown on screen, though the quotes can move before it arrives. An order priced between the natural and the mid is a bid for a better price that someone may or may not take.

## What each cent given up costs on a credit spread

On a defined-risk spread the arithmetic is unusually clean. The maximum loss is the width minus the credit, so the credit and the max loss always add up to the width. On a $2-wide spread that is $200 per contract, split between the two.

![The same $2-wide put credit spread filled at 0.60, 0.56 and 0.50: the green credit shrinks from $60 to $50 while the red max loss grows from $140 to $150, and the two always sum to $200.](/assets/blog/limit-order-cent-credit-to-risk.svg)

For the hypothetical ten-lot, here are three possible fills:

| Fill price | Credit, ten spreads | Max loss, ten spreads | Break-even |
| --- | --- | --- | --- |
| 0.60 (mid) | $600 | $1,400 | 49.40 |
| 0.56 (after two steps) | $560 | $1,440 | 49.44 |
| 0.50 (natural) | $500 | $1,500 | 49.50 |

Every cent conceded on the ten-lot moves $10 from credit to max loss. The four cents given up in the walk cost $40 of credit and added $40 of maximum loss, and the break-even moved four cents closer to the stock. The fill price is permanent, as [the partial fill post](/blog/partial-fill-options-spread) notes: whatever the spread does afterwards, it does from that number.

This is also why the fill matters when positions are measured. The [return on risk](/blog/return-on-risk-vs-return-on-capital) of a spread is its credit set against its max loss, and a walk moves both numbers in the wrong direction at once. A record built on the actual fill price, not the mid on the screen when the order was sent, shows what the trade really was.

## A worked example: one hypothetical ten-lot, walked twice

Suppose a trader sends the order above at 10:00: sell ten XYZ 50/48 put credit spreads, limit 0.60, day order. The legs are quoted as in the first table, so the spread shows 0.50 bid and 0.70 ask. Nothing fills in fifteen minutes.

The trader replaces the order at 0.58, and XYZ rises over the next fifteen minutes while it rests. The put spread is now worth less, the leg quotes reprice, and the spread shows 0.47 bid and 0.67 ask, a 0.57 mid. The 0.58 order, which was two cents below the old mid, is now a cent above the new one, and it does not fill.

The trader replaces it again at 0.56, a cent below the new mid, and it fills for all ten. The account holds ten spreads at a 0.56 credit: $560 received, $1,440 at risk, break-even 49.44. The walk took two replacements and about half an hour, and it was a set of choices about price and time, none of them settled by the quotes alone.

Three things in that example are general rather than particular to it:

- **The mid moves.** The fill was four cents under the first mid but one cent under the mid at the time, so comparing a fill to the first mid on screen can mislead in either direction.
- **The natural is a price for the displayed size only.** A ten-lot can be larger than what is shown, in which case even the natural may not fill all of it at once.
- **The fill is the record.** The spread's cost basis is 0.56, not 0.60 and not whatever the mid shows later.

## FAQ

**Where is an options limit order on a spread usually priced?** Anywhere between the natural and the far price, and the choice is the trader's: it trades price against time. The mid sits halfway between the two sides, but nobody has agreed to trade there.

**Is a market order a way around an unfilled spread?** A market order on a spread fills at whatever the legs offer at that moment, which can be worse than the natural on a thin or fast market. Some brokers do not accept market orders on multi-leg spreads at all.

**Why did my spread fill above my limit?** A limit is the worst price accepted. A fill at a better price, called price improvement, is the order working as written.

**Does walking the price change the max loss?** On a defined-risk spread, yes, one for one. Each cent of credit given up adds a cent per share to the maximum loss.

## The bottom line

A limit order that does not fill has asked for a price nobody is paying yet. Price walking closes that gap one step at a time, and on a credit spread every step moves a cent from the credit to the maximum loss. The fill price is the number the position keeps, so it is the number a record needs in order to reproduce the trade.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
