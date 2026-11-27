---
title: "Put-call parity explained with an option chain"
slug: put-call-parity
excerpt: Put-call parity says a call minus a put at the same strike and expiration equals the stock minus the strike's present value, and on a quoted chain it holds as a band set by the bid and ask.
meta_description: "Put-call parity read off a bid/ask chain: why call minus put tracks interest on the strike, what synthetic long stock costs, and why quotes make it a band."
search_title: "Put-Call Parity Explained: Formula and Bid/Ask Example"
author: Osama Safwat Maghawry
category: foundations
series_order: 69
tags: put-call parity, synthetic long stock, option pricing, interest rates, foundations
---

**Put-call parity** is the relationship that ties a call and a put with the same strike and expiration to the stock itself: the call's price minus the put's price equals the stock price minus the present value of the strike. It holds because a long call plus a short put, at one strike, pays off exactly like 100 shares bought at that strike on the expiration date. On a real option chain it does not hold to the cent; it holds as a band, and the width of that band is the two legs' bid-ask spreads combined.

This [foundations](/blog/foundations) post reads parity off one hypothetical chain, quote by quote, after the [call and put from both sides](/blog/call-vs-put-option-explained) and [how to read an option chain](/blog/how-to-read-an-option-chain).

Key Takeaways:

- **The formula is C - P = S - PV(K).** Call minus put equals the stock minus the discounted strike.
- **The gap is interest.** At the money, call minus put is roughly the interest on the strike.
- **A call plus a short put is synthetic stock.** It gains and loses like shares.
- **Quotes turn the equation into a range.** Paying the ask and taking the bid misses parity by half of each spread.

## Synthetic long stock: a long call and a short put are 100 shares bought later

Take one strike and one expiration. Buy the call and sell the put. At expiration exactly one of them is in the money, and either way you end up owning 100 shares at the strike:

- **Above the strike.** The put expires worthless and you exercise the call at the strike.
- **Below the strike.** The call expires worthless and the put you sold is assigned at the strike.
- **Exactly at the strike.** Neither has value, and shares change hands only if you exercise the call or the put is assigned: the [pin risk](/blog/what-happens-options-expiration) case.

The pair is called **synthetic long stock**, and its gain or loss moves dollar for dollar with the shares, as below.

![At expiration, a long 50 call plus a short 50 put gives one straight line, the same shape as owning 100 shares.](/assets/blog/put-call-parity-synthetic-stock.svg)

The difference from owning the shares is timing. A shareholder pays for the stock today. The synthetic holder pays the strike on expiration day and keeps the cash until then. That cash earns interest, so the synthetic's net debit should be about the interest on the strike, which is what the buyer of shares gives up by paying early.

## The put-call parity formula: at the money, the gap is interest on the strike

Written out, put-call parity is:

    C - P = S - K / (1 + r x t)

where C and P are the call and put prices, S the stock price, K the strike, r the annual interest rate and t the time to expiration in years. Textbooks use continuous discounting, `K x e^(-rt)`; at this strike, over a few months, the two forms differ by a fraction of a cent per share.

When the strike equals the stock price, the right side is simply the interest on the strike. On a $50.00 stock, with 60 days to run and interest at 4%, that is $50.00 less $50.00 discounted for 60 days, or about $0.33 per share. A call at the money should trade about 33 cents above the put at the same strike, before any dividend.

Two things move that gap, and both are covered in earlier posts:

- **Dividends.** A call holder receives none, so an expected dividend lowers the call relative to the put by about its present value: `C - P = S - PV(dividends) - PV(K)`.
- **Early exercise.** Listed equity options are American-style, which turns the equation into bounds: with no dividend, call minus put sits between `S - K` and `S - PV(K)`. The [early exercise post](/blog/early-exercise-options) explains when that right is used.

Most broad index options, such as SPX, are European-style and cash-settled, so the equation (with the index's dividends) applies without the early-exercise bounds.

## Worked example: parity on a hypothetical XYZ chain is a band, not a line

The hypothetical XYZ trades at $50.00, pays no dividend before expiration, and has options 60 days out. Interest is taken at 4%. These numbers are invented to show the mechanics and say nothing about any result.

| XYZ 50 strike, 60 days | Bid | Ask | Mid |
| --- | --- | --- | --- |
| Call | 2.13 | 2.19 | 2.16 |
| Put | 1.80 | 1.86 | 1.83 |
| Call minus put | | | 0.33 |

At the mids, the call is 0.33 above the put, which is parity to the cent. Nobody trades at both mids, though. Each direction of the synthetic pays one side of each [bid-ask spread](/blog/options-bid-ask-spread):

- **Buying the synthetic.** Buy the call at the 2.19 ask, sell the put at the 1.80 bid: a 0.39 debit, $39 per pair.
- **Selling the synthetic.** Sell the call at the 2.13 bid, buy the put at the 1.86 ask: a 0.27 credit, $27 per pair.

So the market brackets call minus put between 0.27 and 0.39, and the 0.33 parity value sits inside the bracket. Neither side can be bought below it or sold above it, which is the practical meaning of "parity holds" on a quoted chain.

![On the hypothetical XYZ 50 strike, selling the synthetic brings in 0.27, buying it costs 0.39, and parity sits between at 0.33.](/assets/blog/put-call-parity-quoted-band.svg)

Now compare buying the synthetic with buying 100 shares at $50.00:

| Over the 60 days | 100 shares | Long 50 call, short 50 put |
| --- | --- | --- |
| Paid today | $5,000 | $39 debit |
| Cash paid at expiration | None | $5,000, by exercise or assignment |
| Interest priced on the $5,000 held back (4% assumed) | None | About $33 |
| Margin held against the short put | None | Far more than the debit, set by the broker |
| Holding at expiration | 100 shares | 100 shares at a total of $5,039 |
| Most that can be lost | $5,000 | $5,039 |

The $39 debit, less about $33 of interest on the cash kept back, leaves $6. That $6 is the half-spread paid on each leg, three cents twice, and it is the whole cost of taking the synthetic route at these quotes. The break-even at expiration is 50.39 for the synthetic against 50.00 for the shares, before the interest, and the loss runs to the stock reaching zero either way. The debit is smaller than the cost of the shares, but the broker holds margin against the short put, so the debit is not the cash the position needs. The risk is the same 100 shares.

## A synthetic position carries the stock's risk with option mechanics attached

The synthetic tracks the shares' price, but it is not the shares:

- **The short put can be assigned early.** Deep in the money, it may be exercised before expiration, leaving 100 shares and a long call; the [assignment post](/blog/option-assignment-what-happens) shows what arrives overnight.
- **Unsecured, it needs the uncovered tier.** A short put without cash behind it commonly sits at or near the top of the [options approval levels](/blog/options-approval-levels), with a margin account.
- **The collateral is not the debit.** The margin held against the short put is far larger than the $39 paid; the [buying power post](/blog/options-buying-power-requirement) works through it.
- **The interest is the broker's rate.** Cash kept back that earns less than the rate the market prices in makes the synthetic cost more than shown above.

Parity also explains why two familiar income positions behave the same. Long stock plus a short call, the [covered call](/blog/covered-call-explained), equals a short put plus cash, the [cash-secured put](/blog/cash-secured-put-explained). On this chain the two have the same payoff at expiration once interest on the cash is counted: the covered call's 2.13 premium against the cash-secured put's 1.80 premium plus about 0.33 of interest. That is a mechanical equivalence on invented numbers, not an income figure.

The same relationship ties spreads together: a call debit spread and a put credit spread on the same strikes add to about the width, as the [debit spread vs credit spread post](/blog/debit-spread-vs-credit-spread) shows. A record that books the call and the put of a synthetic as two unrelated trades loses the fact that together they behave as 100 shares, the same problem as [a journal that splits a spread into legs](/blog/options-journal-splits-spreads-into-legs).

## Frequently asked questions

**Is put-call parity an arbitrage?** Not on a quoted chain. A conversion (long stock, long put, short call) and a reversal (the opposite) are how textbooks test parity, but quotes rarely sit outside it by more than the bid-ask spreads, commissions and borrowing costs combined, and early assignment and margin on the short leg add risk the textbook version leaves out. This post describes the relationship, not a trade.

**Why is the call more expensive than the put at the same strike?** At the money, the call is above the put by roughly the interest on the strike until expiration. A dividend before expiration narrows that gap or reverses it.

**Does put-call parity hold for American options?** As bounds rather than an equation, because either option can be exercised early. For an at-the-money strike with no dividend, call minus put sits between zero and the interest on the strike.

## The bottom line

Put-call parity says a call and a put at one strike and expiration are bound to the stock and to interest, because together they are 100 shares bought on a later date. On a chain it holds as a band set by the bid and ask, and the synthetic carries the full risk of the shares, plus early assignment and margin.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
