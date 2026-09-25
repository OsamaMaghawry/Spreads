---
title: "How to read an option chain without guessing"
slug: how-to-read-an-option-chain
excerpt: An option chain lists every contract on one stock by strike and expiration, and reading it well means knowing which number on each row is the live market.
meta_description: "How to read an option chain for US-listed options: which price is live, why the last price and shading can mislead, and why later expirations cost more."
author: DeltaMint
category: foundations
series_order: 14
tags: option chain, bid ask, last price, expiration, foundations
---

An **option chain** is the table a trading platform shows for every listed
option on one stock: calls on one side, puts on the other, strikes down the
middle, one expiration at a time. Knowing **how to read an option chain**
comes down to two questions on each row: which number is a price someone
will actually trade at, and which stock price the row was set against.

The [strike, expiry and premium post](/blog/option-strike-price-expiration-premium)
read a single row. This post reads the whole table for US-listed options on
a made-up ticker, XYZ, and names three places a chain is easy to misread.

## Key takeaways

- A seller who needs to fill now gets the bid and a buyer pays the ask; the mark between them is not an offer.
- The last price is the most recent trade, which may have printed before the stock moved.
- In-the-money shading follows the stock price the platform last received, which can be delayed.
- The same strike costs more on a later expiration, and a spread is priced from two rows at once.

## How is an option chain laid out?

Most platforms draw the chain the same way: an expiration selector at the
top, one date's contracts below it, strikes down the centre.

Calls sit on the left and puts on the right, so one line holds a call and a
put with the same strike and date. The stock's own quote sits above the
table, often with a timestamp or a "delayed" marker beside it. The columns
on each side commonly include:

- **Bid and ask.** The best standing offers to buy and to sell, per share.
- **Mark.** A reference price, on most platforms the bid-ask midpoint.
- **Last.** The most recent trade, whenever it happened.
- **Volume and open interest.** Contracts traded today; contracts open as of the last session.
- **Implied volatility and Greeks.** Model outputs from the quotes.

Volume and open interest describe activity, not direction. Some pages read
open interest as a map of support and resistance, which is a claim about
where a stock will go; this post does not make it. Here, volume is used
only to tell whether a row has traded today, and open interest is not read
at all.

## Example: one hypothetical XYZ chain across two expirations

Take a hypothetical stock, XYZ, quoted at $50.00 at 3:30 p.m. At 10:05 a.m.
it traded at $48.50. The prices below sit near a standard pricing model at
the 40% implied volatility this series has used, with interest rates and
dividends set to zero, and show how a chain reads, not what any contract is
worth. First, the expiration 30 days out:

| Call bid | Call ask | Call last | Strike | Put bid | Put ask | Put last |
| --- | --- | --- | --- | --- | --- | --- |
| 4.65 | 4.85 | 4.72 | 46 | 0.71 | 0.79 | 0.74 |
| 3.33 | 3.43 | 3.40 | 48 | 1.33 | 1.43 | 1.95 |
| 2.24 | 2.34 | 2.30 | 50 | 2.24 | 2.34 | 2.31 |
| 1.42 | 1.52 | 0.95 | 52 | 3.40 | 3.54 | 3.45 |
| 0.85 | 0.93 | 0.90 | 54 | 4.80 | 4.98 | 4.90 |

Read across the rows rather than down one column, and the table has a shape.
Calls get cheaper as the strike rises and puts get dearer, because the
right to buy at a lower price, or to sell at a higher one, is worth more;
with XYZ at $50, the 46 call and the 54 put are already in the money. At the
50 strike the call and the put quote the same bid and ask, which is roughly
what happens at the strike nearest the stock.

Two cells break the pattern. The 52 call's last trade, 0.95, sits below its
bid of 1.42, and the 48 put's last, 1.95, sits above its ask of 1.43. Both
printed at 10:05, when XYZ was $48.50, and neither has traded since.

## Why does the same strike cost more on a later expiration?

Switch the expiration selector to the date 58 days out. The same strikes
reprice, shown as bid/ask beside the 30-day quotes:

| Strike | Call, 30 days | Call, 58 days | Put, 30 days | Put, 58 days |
| --- | --- | --- | --- | --- |
| 48 | 3.33/3.43 | 4.16/4.26 | 1.33/1.43 | 2.16/2.26 |
| 50 | 2.24/2.34 | 3.13/3.23 | 2.24/2.34 | 3.13/3.23 |
| 52 | 1.42/1.52 | 2.29/2.39 | 3.40/3.54 | 4.27/4.41 |

Every contract costs more on the later date, on both sides. The extra 28
days leave more time for XYZ to move, so each premium carries more
extrinsic value. How that time is priced belongs to [theta
decay](/blog/theta-decay-explained) and [implied
volatility](/blog/implied-volatility-options-explained); the chain only
shows the result.

## Bid, ask, mark or last: which price is live?

Only two numbers on a row are offers someone is standing behind right now.
A seller who wants to trade immediately receives the bid; a buyer pays the
ask. What the gap costs is the subject of the [bid-ask spread
post](/blog/options-bid-ask-spread), and it is not repeated here.

The mark looks like a price because it is one number where the quote is two.
On the 50 call it is 2.29, and nobody has offered to trade at 2.29. A limit
order placed there may fill, and may not.

A spread is two rows read at once, so the choice of number compounds. Take
a hypothetical 50/48 put credit spread on the 30-day chain, short the 50 put
and long the 48 put. The same table prices it three ways:

- **Sell at the bid, buy at the ask.** 2.24 less 1.43 is a 0.81 credit, $81 per spread.
- **Marks.** 2.29 less 1.38 is 0.91, a credit neither row is offering.
- **Last prices.** 2.31 less 1.95 is 0.36, because the 48 put's last is stale.

Only the first figure is built from live offers. A spread sent as one order
carries its own limit price, and whether it fills nearer 0.91 depends on who
is on the other side. The $2 width less whichever credit fills is the
spread's [maximum loss at expiration](/blog/credit-spread-max-loss).

## Why is the last price different from the bid and ask?

The last price is a record of the most recent trade, not a quote. On a busy
contract it usually sits at or inside the bid and ask. On a quiet one it can
be hours or days old, and it stays on screen until someone trades again.

The trouble is that the stock keeps moving while the last price sits still.
The 52 call in the example traded at 0.95 when XYZ was $48.50. By 3:30 p.m.,
with XYZ at $50.00, the market for the same call is 1.42 bid, 1.52 ask.

![A hypothetical 52 call's last price stays at 0.95 from a 10:05 trade, below a 3:30 quote of 1.42 bid and 1.52 ask.](/assets/blog/chain-last-price-stale.svg)

Nothing about 0.95 was wrong when it printed. Read against a $50 stock,
though, the call looks cheap and the 48 put's 1.95 looks rich, and neither
is a price anyone is offering. A change column computed from the last
carries the same distortion. The chain itself shows when a last is stale:

- **Zero volume today.** The last price is from an earlier session.
- **The last trade's time.** Often shown in the contract's detail view.
- **A last outside the bid and ask.** Usually the market that set it has
  since moved; a leg of a spread order can also print outside that single
  leg's quote.

## What does the shaded area on an option chain mean?

The shading marks the contracts that are in the money: calls struck below
the stock price and puts struck above it. The platform draws it against the
stock price it last received, which is not always where the stock is
trading. The gap opens in ordinary ways:

- **Delayed quotes.** A 15-minute-delayed feed shades against a 15-minute-old price.
- **Before the open.** It may follow the prior close or a thin pre-market trade.
- **After the close.** Most stock options stop trading at 4:00 p.m. ET; the stock can keep trading after hours.

Change one assumption in the example: a delayed feed shows XYZ at $49.90
while the stock trades at $50.30. The 50 call is left unshaded, out of the money by the platform's reckoning,
when it is in the money by 30 cents. The 50 put is shaded, and is not.

![Calls struck below a delayed XYZ price of 49.90 are shaded, so the 50 call is left unshaded while the stock trades at 50.30.](/assets/blog/chain-shading-stale-spot.svg)

The strike nearest the stock is where this matters most and shows least,
because a few cents flip the row. Two checks do not depend on the shading:
the timestamp or "delayed" marker on the stock's quote, and the strike where
the call and put cost about the same. In the live example that is the 50,
both at 2.24 bid and 2.34 ask.

The second check is approximate. Interest rates and dividends pull the call
and put apart somewhat, so it locates the stock roughly, and only while the
option quotes themselves are live.

## Frequently asked questions

- **Which price on an option chain fills immediately?** The bid when selling, the ask when buying.
- **Why is the last price different from the bid and ask?** It may predate the stock's latest move.
- **What does the shaded area on an option chain mean?** In the money against the platform's last stock price.
- **Why does the same strike cost more on a later expiration?** More time for the stock to move means more extrinsic value.

## The bottom line

Reading an option chain without guessing means reading each row for what it
is: two live offers, one midpoint and a record of the last trade, set
against a stock price the platform may have received a while ago. The
guessing starts when one is taken for another.

A spread is two rows priced at once, and the same care applies to both.
This post closes the [foundations series](/blog/foundations); the income
series opens with the covered call.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
