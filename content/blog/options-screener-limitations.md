---
title: "Options screener limitations: what a screen cannot see"
search_title: "Options Screener Limitations: Stale Quotes, Mid Credits"
slug: options-screener-limitations
excerpt: An options screener returns the rows that match your filters, priced from one snapshot of the chain, and it cannot see whether that snapshot was stale, whether its credit is fillable, or what your account already holds.
meta_description: "Options screener limitations: last session's quotes before the open, credits at a mid the market may not pay, and open positions. A hypothetical example."
author: Osama Safwat Maghawry
category: measuring
series_order: 65
tags: options screener, bid-ask spread, implied volatility, capital at risk, measuring results
---

An **options screener** is a tool that filters option chains, or the spreads built from them, by criteria such as delta, days to expiry, credit and implied volatility, and returns the rows that match. Its limitations are what those rows cannot show: whether the quotes behind them were current, whether the credit printed is a price anyone would fill, and what the account running the screen already holds.

None of this makes a screen wrong. It answers a narrow question exactly: which contracts matched these filters at the moment the chain was read. The trouble starts when a matching row is read as a finished trade, priced and sized, rather than as the start of one.

This post closes the [measuring](/blog/measuring) series. It builds on [how to read an option chain](/blog/how-to-read-an-option-chain), which covers the columns a screen draws from, and on [peak capital at risk](/blog/capital-at-risk-options-portfolio), which covers the part a screen leaves out.

Key Takeaways:

- **A screen reads one snapshot.** Before the open, it can be hours old.
- **A credit at the mid is not a fill.** On wide quotes the market pays less.
- **Pricing changes the ranking.** Two spreads can swap places.
- **A screen never sees the book.** Open positions are not an input.
- **A match is not a recommendation.** It is what the filters selected.

## A screen reads one snapshot, and before the open it can be stale

Every figure on a screen's results page was computed from quotes taken at one moment. If that moment was a poor one, every column downstream of it inherits the problem, and the row gives no sign of it.

Most US single-stock options trade only in regular hours, 9:30 a.m. to 4:00 p.m. Eastern. A screen run before the open reads option quotes left from the prior session against a stock that may already have moved in pre-market trading. The option prices and the stock price then describe two different moments.

That mismatch spreads to every derived column:

- **Implied volatility.** IV is backed out of option and stock prices together; mismatched, it describes neither.
- **Delta.** It is computed from that IV, so it inherits the error.
- **The last price.** On a strike that has not traded today, it can be a day or more old.
- **Earnings.** IV is often elevated before a report, so a sort by credit can fill its top rows with names reporting this week; see [selling options before earnings](/blog/selling-options-before-earnings).

A row looks the same whether its inputs were taken a second ago or the evening before. Knowing when the chain was read, and whether the market was open, is the first check on any result.

## A credit priced at the mid is a calculation, not a fill

Many screens price a spread at the mid: the midpoint of each leg's bid and ask, netted. The mid is a calculation, not a quote. On a tight market it sits close to where an order fills; on a wide one it can sit well above anything the market will pay, as the [bid-ask spread post](/blog/options-bid-ask-spread) sets out.

The other price is the **natural**: for a credit spread, the short leg's bid minus the long leg's ask. It is what the market would pay right now for the whole spread. An order resting at the mid fills only if someone meets it there; on wide quotes, fills tend to land somewhere between the two.

**Worked example, hypothetical and before fees.** A screen returns two 5-wide put credit spreads on two made-up stocks. The numbers are there to show the arithmetic, not any outcome.

| | Spread A | Spread B |
| --- | --- | --- |
| Short put, bid / ask | 1.60 / 1.90 | 1.30 / 1.36 |
| Long put, bid / ask | 0.50 / 0.80 | 0.38 / 0.42 |
| Credit at the mid | 1.10 | 0.93 |
| Max loss at the mid | $390 | $407 |
| Credit at the natural | 0.80 | 0.88 |
| Max loss at the natural | $420 | $412 |

[Max loss on a credit spread](/blog/credit-spread-max-loss) is the width minus the credit, times 100. At the mid, Spread A takes 1.10 against $390 at risk, a ratio of about 28.2%, and Spread B takes 0.93 against $407, about 22.9%. A screen sorting by credit against max loss lists A first.

At the natural, A's credit drops by 0.30 to 0.80, a ratio of about 19.0% on $420, while B's drops by only 0.05 to 0.88, about 21.4% on $412. The order reverses. The difference is not in the strikes or the stock: A's legs are quoted 0.30 wide each and B's are not.

![Two hypothetical put credit spreads ranked by credit as a share of max loss: at the mid, spread A ranks first at 28.2% and B second at 22.9%; at the natural, B ranks first at 21.4% and A falls to 19.0%.](/assets/blog/screener-mid-vs-natural-rank.svg)

The ratio is credit against max loss, the stance set out in [return on risk vs return on capital](/blog/return-on-risk-vs-return-on-capital). It describes the structure at a price, not a result. Which price the screen used decides which structure it puts on top, and the wider the quotes, the more the two prices can disagree. Where an order between them actually fills, and how a resting order is walked, is the subject of [a limit order that is not filling](/blog/options-limit-order-not-filling).

## A screen sees one candidate at a time, never the book it joins

A screen scores each row on its own. Credit, max loss, delta and days to expiry are properties of that one spread. What a new spread does to an account depends on [what is already open](/blog/managing-multiple-option-positions), and that is not an input to the filter.

Continue the example. Suppose the account already holds two put credit spreads on the same stock as Spread A, each 5 wide and each sold for 1.00, so each carries $400 of max loss. The screen shows Spread A with $420 at risk at the natural. The account, if A fills there, holds $1,220 of max loss on one stock, all of it exposed to the same move below the short strikes.

| What the row shows | What the row leaves out |
| --- | --- |
| This spread's max loss | Max loss already open on that stock |
| Collateral it needs | Collateral already held |
| Delta of this spread | Net delta of the book after it fills |

Each left-hand cell is a property of one spread; each right-hand cell is a property of the account. The peak of collateral held at once across overlapping positions is a property of the book, set out in [capital at risk](/blog/capital-at-risk-options-portfolio), and no single row can show it.

This is the after-the-fill problem in its earliest form. Before a spread is even open, the question that matters is not how good it looks alone but what the book looks like with it, and a list of candidates cannot answer that.

## A match says the filters were met, not that the trade is sound

Every filter on a screen encodes an assumption, and the screen applies it without testing it:

- **Delta as probability.** A 0.20 delta is often read as about a 20% chance of finishing in the money; it is a model output from current IV, as [choosing a strike by delta](/blog/credit-spread-delta-strike-selection) shows.
- **IV rank.** It compares today's IV to a lookback window the vendor chose; another window gives another rank.
- **Liquidity minimums.** A strike can clear an open interest threshold and still be quoted wide.
- **Fees.** Credits are commonly shown before commissions, which are charged on every leg.

A screen run with different filters returns different rows from the same chain. That is the whole of what a result is: the intersection of a chain and a set of choices. It carries no judgement about which row anyone should trade, and reading one into it is reading the filters back.

## Frequently asked questions

- **Why doesn't my fill match the screener's credit?** If the screener priced at the mid, a fill on wide quotes tends to land below it.
- **Does an options screener work before the market opens?** It runs, but its option prices, IV and delta may come from the previous session.
- **Does an options screener account for positions I already hold?** A filter scores each candidate alone; exposure already open has to be added separately.

## The Bottom Line: reading the chain is the easy part

A screen does the mechanical part well: it reads a chain quickly and applies filters exactly. What it cannot do is see when its quotes were taken, which price a market will actually pay, or what the account already holds.

In the worked example, two hypothetical spreads swapped places when priced at the natural instead of the mid, and the one ranked first at the mid, filled at the natural, would have put $1,220 of max loss on one stock. Both facts were outside the row.

DeltaMint's Strategy Scanner prices a credit spread at the natural, the short leg's bid minus the long leg's ask, rather than at the mid. Its results are what matched the filters the trader set, and nothing on the list is a recommendation.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
