---
title: "VIX hedge explained: what VIX products do and do not do"
search_title: "VIX hedge explained: calls, futures and contango"
slug: vix-hedge-explained
excerpt: A VIX hedge pays on a change in expected volatility, not on a loss in your stocks, and the products that carry it have costs of their own.
meta_description: "A VIX call pays on volatility, not on your loss. Two hypothetical selloffs, one $10,000 loss: the same call settles above its strike once, worthless once."
author: Osama Safwat Maghawry
category: hedging
series_order: 35
tags: vix, hedging, volatility, vix options, contango
---

A **VIX hedge** is a position whose value is meant to rise when the VIX rises, held next to stocks in the hope that a fall in the stocks arrives together with a jump in the index. The VIX is a measurement of expected volatility, not a security, so the hedge is always one of a few instruments built around it: options on the index, futures, or funds that hold those futures.

This is the fifth post in the [hedging series](/blog/hedging). The earlier posts hedged a stock directly, with the [protective put](/blog/protective-put-explained) and the [put spread](/blog/put-spread-hedge). A VIX hedge works at one remove, on volatility, and that distance is the subject.

## Key takeaways

- **The VIX cannot be bought.** It is a number calculated from S&P 500 option prices, so every instrument tied to it is a derivative with its own price and rules.
- **A VIX option is priced from a future.** It follows the futures price for its expiration, not the spot index, and it settles in cash on its expiration date.
- **It pays on volatility, not on your loss.** The same fall in stocks can come with a big rise in the VIX or a small one, and the hedge pays accordingly.
- **Futures-based funds pay a carrying cost.** When longer-dated futures cost more than spot, holding them loses value as time passes, even if the VIX does not move.
- **None of this is a floor.** A protective put sets a price below which the shares plus the put stop losing. A VIX hedge sets nothing of the kind.

## The VIX is a measurement, so nothing you buy is the VIX

The VIX is calculated from the prices of S&P 500 index options. It summarises the volatility those prices imply over the next 30 days. It tends to rise when stocks fall, which is why it is often called a fear gauge. It sits in the same family as the [implied volatility](/blog/implied-volatility-options-explained) of any single option, only computed for the whole index.

Because it is a calculation, there is nothing to deliver. Three instruments sit on top of it:

- **VIX options.** Calls and puts on the index. They are European style, so they can only be exercised at expiration, and they settle in cash. The payoff uses a special opening quotation computed from S&P 500 option opening prices on the expiration morning.
- **VIX futures.** Contracts on where the index will be on a future date, with one price for each expiration.
- **Exchange-traded products.** Funds that hold, and notes that track, a rolling position in short-dated VIX futures. Notes add the credit risk of the issuer.

A "VIX hedge" is therefore never the index itself. Each of the three carries a price that can differ from the index, and the rest of this post is about the difference.

## Why a VIX option can lose when the VIX is unchanged

A VIX option is priced off the future for its own expiration, not off the spot index. When the market expects volatility to be higher in a month than it is today, the future sits above spot, a shape traders call **contango**. As the expiration approaches, the future moves toward spot, because the future settles to the same opening value the option does.

Take hypothetical levels: spot VIX at 16.00, and a future for an expiration 30 days out at 18.00. A call struck at 20 is priced as if the index would be near 18, so the 20 strike is only 2 points away in the price, though it is 4 away from spot. If spot sits at 16.00 the whole month, the future slides from 18.00 to 16.00, and the call ends worthless.

![With spot VIX flat at 16, the future for a 30-day expiration slides from 18 to 16 and never reaches the strike of 20, so the call expires worthless.](/assets/blog/vix-option-priced-off-future.svg)

That is the cost of carrying the position, and it is paid in the months when nothing happens. The opposite shape, **backwardation**, has spot above the future and usually shows up after a spike. It reverses the drag, but it appears when the stress has already arrived.

## Does a VIX call hedge a stock loss? Same loss, two results

The numbers below are hypothetical. A holder has $100,000 in stocks and buys one VIX call struck at 20 for 1.20. Each VIX option point is $100, so the premium is 1.20 × 100 = **$120**, and at expiration the call is worth the VIX settlement value minus 20, times 100, if that is positive. The break-even settlement is 21.20.

Three cases, measured at the expiration of the call:

| Case | Stocks | VIX settles at | Call at expiration | Call result, premium included |
| --- | --- | --- | --- | --- |
| Calm | $0 | 16.00 | $0 | -$120 |
| Sharp selloff | -$10,000 | 30.00 | $1,000 | +$880 |
| Slow decline | -$10,000 | 19.00 | $0 | -$120 |

The second and third rows have the same $10,000 stock loss. In one the call returns $880 and in the other it loses its whole premium, a gap of $1,000 that depends on how the fall arrived, not on how large it was. A VIX call is a bet on volatility's level at a date, and a stock loss is only one thing that can go with it.

![On a hypothetical $100,000 of stocks, one VIX 20 call changes by minus 120, plus 880 or minus 120 across three cases while the stocks lose nothing or 10,000.](/assets/blog/vix-call-vs-stocks-three-outcomes.svg)

Two further limits show up in the example:

- **Size.** One contract, $120 of premium, offsets $880 of the $10,000 loss in the selloff case. Covering more means more contracts and more premium, and the right count depends on assumptions about how far the index would move.
- **Timing.** The call can only be exercised at expiration. Held to that date, it pays on the settlement value alone, so a spike that comes and fades before then helps only if the call was sold into it, and one that arrives after it falls outside the hedge.

## Futures-based funds lose to the roll when the curve is in contango

A fund that holds VIX futures keeps about 30 days to expiration by selling a little of the nearer future and buying the next one out every day, which is called **rolling**. In contango every contract it holds is priced above spot and slides toward it as it ages.

Use the same hypothetical curve. A fund holds a 30-day future priced at 18.00 while spot is 16.00. If spot stays at 16.00, the future slides toward 16.00, a drop of 2.00 points on a position that cost 18.00, with no move in the VIX at all. The next month starts from the same shape, and the same thing happens again.

- **The drag repeats.** It comes back every month for as long as the curve stays in contango, which is the usual state of the curve in calm markets.
- **The gain is the other half.** When the curve flips and spot jumps, the funds can rise sharply, which is why they are used as a hedge at all.
- **Notes carry issuer risk.** If the product is a note, the holder is a creditor of the bank that issued it.
- **Inverse products are a different thing.** They are not hedges. They profit from the drag, and in February 2018 a widely held one lost most of its value in a single day and was closed.

A fund also has a share price, not a strike and an expiration, so it has no date at which the hedge simply ends. The cost is spread across the period it is held, which makes it harder to see.

## Frequently asked questions

- **What is a VIX hedge?** A position expected to gain when the VIX rises, held next to stocks. It is built from VIX options, VIX futures, or funds that hold the futures.
- **Do VIX options settle to the VIX?** They settle in cash to a special opening quotation of the index on the expiration date, and they are priced beforehand from the future for the same expiration.
- **Why did my VIX call lose when the VIX went up?** Because it is priced from the future, and the future can sit above spot. A rise in spot that leaves the future where it was, or that comes before expiration and fades, can leave the call with little or nothing.
- **Is a VIX hedge the same as a put?** No. A put on the stock or the index sets a price floor on that underlying for its expiration. A VIX call pays on a level of volatility and has no link to any price of your holdings.
- **Does it hedge a single stock?** Only loosely. The VIX is about the S&P 500, and a stock can fall while the index and the VIX do not move.

## The bottom line

A VIX hedge is a position on volatility, built from a future that settles to the index's expiration value. The payoff depends on where the VIX settles, not on the size of the stock loss: in the example, the same $10,000 fall left the call at +$880 in one case and -$120 in the other, and in a calm month it costs its premium just by waiting.

Compared with the put in the [concentrated stock post](/blog/hedge-concentrated-stock-position), it hedges a different thing with a different cost, and a fall in the stocks and a rise in the VIX are related but not the same event.

Related: the [SPX vs SPY options post](/blog/spx-vs-spy-options-hedge) covers the index put, which pays on the S&P 500's level rather than on its volatility.

The [post on hedging cash-secured puts](/blog/hedge-cash-secured-puts) sets a VIX call beside a book of short puts, where a slow decline can leave the puts losing and the call worthless.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
