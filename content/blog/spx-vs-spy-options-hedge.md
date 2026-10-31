---
title: "SPX vs SPY options for hedging: size, settlement and basis"
search_title: "SPX vs SPY Puts for a Hedge: Size, Settlement, Basis Risk"
slug: spx-vs-spy-options-hedge
excerpt: SPX and SPY puts hedge the same index but differ in size, settlement and exercise style, and either one pays on the index rather than on the stock you hold.
meta_description: "SPX vs SPY options for a hedge: size, settlement and exercise, then one worked example where your stock falls and the index does not."
author: Osama Safwat Maghawry
category: hedging
series_order: 39
tags: hedging, index options, spx, spy, basis risk
---

An **index put hedge** is a put option on a broad index, bought to gain when the index falls, in place of a put on the stock or stocks actually held. SPX and SPY are the two usual choices for the S&P 500, and they track the same index through two very different contracts.

This is the thirty-ninth post in the [hedging series](/blog/hedging). The [hedging cash-secured puts post](/blog/hedge-cash-secured-puts) raised the index put in a paragraph and called its gap basis risk. This one puts numbers on that gap and sets the two index contracts side by side.

## Key takeaways

- **SPX and SPY are different contracts on the same index.** SPX options are cash-settled and European-style. SPY options are American-style and settle in shares of the fund.
- **One SPX contract is about ten times the size of one SPY contract.** That decides how finely a hedge can be sized.
- **An index put pays on the index, not on your stock.** If the stock falls and the index does not, the put expires worthless.
- **A put on the stock itself has no basis gap, and can cost more.** It covers a fall in that stock whatever the market does.
- **Every version costs its premium when the fall does not come.** That cost is the price of the cover, not a side effect.

## SPX and SPY puts follow the same index through different contracts

SPX is the S&P 500 index itself, and an SPX option is an option on that index level. SPY is an exchange-traded fund that holds the same stocks, and an SPY option is an option on shares of the fund. The two prices move together, with SPY trading at roughly one-tenth of the SPX level.

The differences that matter to a hedger are mechanical:

- **Size.** An SPX contract has a multiplier of 100 on an index level, so with the index at 5,000 one contract covers about $500,000. An SPY contract covers 100 shares, about $50,000 with SPY at 500.
- **Settlement.** SPX options settle in cash. SPY options deliver shares: an exercised put sells 100 shares of the fund at the strike, the same physical settlement described in the [assignment post](/blog/option-assignment-what-happens).
- **Exercise style.** SPX options are European-style: they can be exercised only at expiration. SPY options are American-style, so a short SPY option can be assigned early, the situation set out in the [early exercise post](/blog/early-exercise-options).
- **Settlement timing.** Some SPX expirations settle on a value computed from the opening prices of the expiration day, after trading in the option has already ended, and others on the close. The product's specification says which, and the difference changes what an overnight gap does to the position.
- **Tax treatment.** Index options and fund options can be taxed under different rules. That is a question for a tax professional, not something this post settles.

A buyer of a put does not face assignment in either case. The early-exercise difference matters to the other side of the trade, which is why it shows up in spreads and sold options rather than in a simple bought hedge.

## A smaller contract hedges in finer steps

The numbers below are hypothetical. An account holds $100,000 of stocks and assumes, for the example, that the holdings move one-for-one with the S&P 500. That assumption is the weakest part of any index hedge, and the next section returns to it.

With SPX at 5,000 and SPY at 500, the hedge needs about $100,000 of index exposure:

| | SPX put | SPY put |
| --- | --- | --- |
| Index level | 5,000 | 500 |
| Exposure per contract | 5,000 × 100 = $500,000 | 500 × 100 = $50,000 |
| Contracts to match $100,000 | 0.2 | 2 |
| Strike, 5% below the index | 4,750 | 475 |

One SPX contract is five times the account. It cannot be cut into a fifth, so an SPX put here would hedge five times the holdings, and once the index falls below the strike the account is net short the market. Two SPY contracts match the account to within the rounding of 100-share steps.

That granularity is the main reason a smaller account uses SPY. The reverse also holds: on a $2,000,000 portfolio, 40 SPY contracts do the work of 4 SPX contracts, with correspondingly more tickets and more spread to cross, as the [bid-ask spread post](/blog/options-bid-ask-spread) describes.

## Basis risk: an index put pays on the index, not on the stock

Suppose the 30-day SPY 475 put sells at 3.00. Two contracts cost 3.00 × 200 = **$600**. Compare that with a put on the stock itself. The account's $100,000 is 1,000 shares of XYZ at $100, and a 30-day 95 put costs 2.40, so ten contracts cost 2.40 × 1,000 = **$2,400**. The stock's put costs more here because XYZ is assumed to be a more volatile name than the index, as the [implied volatility post](/blog/implied-volatility-options-explained) explains.

The table gives the result at expiration, in dollars, for four hypothetical paths. Nothing is assumed about which path is likely.

| Path | Stocks alone | With 2 SPY 475 puts | With 10 XYZ 95 puts |
| --- | --- | --- | --- |
| XYZ and the index both fall 10% | -10,000 | -5,600 | -7,400 |
| XYZ falls 10%, index flat | -10,000 | -10,600 | -7,400 |
| XYZ falls 6%, index falls 10% | -6,000 | -1,600 | -7,400 |
| XYZ and the index both rise 5% | +5,000 | +4,400 | +2,600 |

The first row: the index falls from 500 to 450, so each SPY put is worth 475 - 450 = 25 and the two pay 25 × 200 = $5,000. The result is -10,000 + 5,000 - 600 = -5,600. The XYZ puts pay (95 - 90) × 1,000 = $5,000 and cost $2,400, so the result is -7,400.

![Across three hypothetical paths, two SPY puts leave a loss of 5,600 when stock and index fall together, 10,600 when only the stock falls, and 1,600 when the index falls further than the stock, while puts on the stock hold the loss at 7,400.](/assets/blog/index-put-vs-stock-put-three-paths.svg)

Two rows carry the point:

- **The index flat, the stock down.** The SPY puts expire worthless and the loss is the whole 10,000 plus the 600 premium. The stock fell for its own reasons, the kind the index does not register.
- **The index down further than the stock.** The SPY puts pay on a move the account did not suffer. The result, -1,600, is better than the stock alone at -6,000, and a hedge that overpays in one path underpays in another.

The 7,400 on the stock's puts is the same in every row where XYZ ends below 95. It is the five dollars between 100 and 95 times 1,000 shares, plus the $2,400 premium. That fixed worst case is what the index put does not offer.

## A put on the stock covers more and costs more

A put on the stock removes the basis gap, because the hedge and the position are the same stock. The cost is visible in the example: $2,400 against $600 for the same 5% buffer.

Several reasons explain the difference, and the first is the volatility assumed above:

- **Single stocks are riskier than the index.** An index averages hundreds of names, so its premium is lower than the premium on one of them.
- **Company news lives in the stock.** An earnings miss or a guidance cut hits one name and barely registers in an index, so the premium on that stock's put prices it in. The [earnings post](/blog/selling-options-before-earnings) shows how that jump lifts the premium before the report.
- **Many stocks have no liquid options.** For a thinly traded name the stock's own put may be wide or absent, and an index put is the practical fallback.

A put on the stock is also tied to one position. An account with thirty holdings would need thirty puts, and the index put exists to replace that with one ticket. The saving is real. What is exchanged for it is the gap between how the holdings move and how the index moves.

## Sizing an index hedge relies on a number that moves

An index hedge is sized by a ratio, usually a **beta**: the typical move of the holdings per move in the index. Beta is estimated from past returns, so it describes how the holdings behaved, not how they will behave in the next fall.

A common sizing is (portfolio value × beta) ÷ (index level × multiplier). With a beta of 1.0 the example gives $100,000 ÷ ($500 × 100) = 2 SPY contracts. With a beta of 1.4 it gives 2.8, which rounds to 3, and with 0.7 it gives 1.4, which rounds to 1. The arithmetic is exact. The input is not.

Three things move it:

- **The holdings change.** A new position in a different sector changes the portfolio's beta the day it is added.
- **Correlations shift in a fall.** Stocks that moved independently in a calm month often move together in a selloff, so a hedge sized from calm data can cover less than expected.
- **Rounding.** Contracts come in whole numbers, so an exact fraction becomes a hedge somewhat larger or smaller than the one calculated.

The [VIX hedge post](/blog/vix-hedge-explained) covers a hedge with a looser tie still, one that pays on volatility rather than on the index level.

## Frequently asked questions

- **Is SPX or SPY better for hedging?** The mechanics differ and neither is better in general. SPX is larger, cash-settled and European-style. SPY is smaller, share-settled and American-style. Which suits an account depends on its size and how it will hold the position.
- **Can a long SPY put be assigned?** No. Assignment applies to a short option. A put bought as a hedge can be sold, exercised or left to expire.
- **Does an index put protect a single stock?** Only as far as the stock moves with the index. If the stock falls alone, the put can expire worthless.
- **How many contracts does a hedge need?** The dollar value to cover, times the beta assumed, divided by the exposure of one contract. Beta is an estimate, and the answer rounds to a whole number.
- **What happens to the put at expiration?** An in-the-money SPX put settles in cash. A long SPY put in the money is exercised by default under the standard exercise-by-exception rule, covered in the [expiration post](/blog/what-happens-options-expiration), and leaves a short position in the fund's shares if the account does not hold them. The threshold can differ by broker, the holder can submit a do-not-exercise instruction, and an account that cannot carry short stock may have the position closed before expiration.

## The bottom line

An index put is a cheaper, coarser hedge. SPX and SPY give the same index in two sizes, with different settlement and exercise rules, and either one pays on the index rather than on the stock. In the example, two SPY puts cost $600 and left a 10,600 loss when only the stock fell, while ten puts on the stock cost $2,400 and held the loss at 7,400 whatever the index did.

What the account holds, how closely it follows the index, and how finely it can size the hedge decide which trade-off applies. To see the single-stock version in detail, read the [protective put post](/blog/protective-put-explained), and for the cost of keeping any hedge on through a calm year, the [tail risk hedge cost post](/blog/tail-risk-hedge-cost).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
