---
title: "Options win rate: why it is not a result"
search_title: "Options Win Rate: Why 8 Wins in 10 Can Still Lose Money"
slug: options-win-rate-misleading
excerpt: A win rate counts how many closed trades made money and says nothing about how much, so two books with the same win rate can end on opposite sides of zero.
meta_description: "An options win rate counts trades, not dollars. Two hypothetical books win 8 in 10 and end +$200 and -$400, and open losers and rolls can inflate it."
author: Osama Safwat Maghawry
category: measuring
series_order: 62
tags: win rate, options trading results, credit spread, profit factor, expectancy
---

An **options win rate** is the share of closed trades that ended with a profit: winners divided by all closed trades. It is a count, not a sum. A trade that made $5 and a trade that made $500 each add one to the top of the fraction, and a trade that lost the full max loss adds one to the bottom, the same as a trade that lost a dollar.

That is why a win rate on its own cannot say whether an account made money.

This post continues the [measuring](/blog/measuring) series after [capital at risk in an options portfolio](/blog/capital-at-risk-options-portfolio), and leans on [what a closed-position record has to contain](/blog/options-trade-record-realized-pl), because a win rate is only as honest as the records it counts.

Key Takeaways:

- **A win rate counts trades, not dollars.** It records how often a trade closed above zero, never by how much.
- **The same win rate can sit on either side of zero.** What decides the result is the size of the average loss against the average win.
- **The break-even win rate is arithmetic.** It is the average loss divided by the sum of the average win and the average loss.
- **A win rate counts only what has closed.** Open losers, rolls and assignment can all keep a losing trade out of it.

## What does an options win rate actually measure?

It measures frequency. Take every trade that closed in a period, mark each one as a win if its realized profit and loss was above zero and a loss if it was below, and divide the wins by the total. A trade that closed at exactly zero is a scratch: neither a win nor a loss, though whether it stays in the total depends on who is counting.

What it leaves out is everything about size. A short premium position such as a [put credit spread](/blog/put-credit-spread-explained) collects a small credit against a larger max loss, so its wins are capped at the credit and its losses can run to several times that.

So the question a win rate answers is narrower than it sounds:

- **What it answers.** How often a closed trade ended above zero.
- **What it does not answer.** Whether the account is up, by how much, or against what capital.
- **What it can hide.** One loss large enough to erase many wins, which still counts as one trade.

## Two books with the same win rate can end on opposite sides of zero

The worked example below is hypothetical, before fees, and only there to show the arithmetic. Two accounts each trade ten 50/45 put credit spreads, one contract at a time, every one opened for a 1.00 credit. Each spread takes in $100 and can lose at most $400: the $5 width less the credit, times 100, as the [credit spread max loss post](/blog/credit-spread-max-loss) works out.

In both books, eight spreads are bought back at 0.50 for a $50 gain each. The books differ only in their two losers. In Book A they are closed at 2.00, a $100 loss each. In Book B they are held through expiration with the stock below 45, and each loses the full $400.

![Two hypothetical books of ten put credit spreads, each with eight $50 winners and two losers: Book A's losers are $100 each and it ends $200 up, while Book B's are the full $400 max loss and it ends $400 down.](/assets/blog/win-rate-two-books.svg)

Both books report the same win rate, eight trades out of ten. One is $200 up and the other is $400 down. The difference is $600, and it lives entirely in two trades that the win rate counts as identical.

| | Book A | Book B |
| --- | --- | --- |
| Wins / losses | 8 / 2 | 8 / 2 |
| Average win | $50 | $50 |
| Average loss | $100 | $400 |
| Largest loss against the $100 credit | 1 times | 4 times |
| Expectancy per trade (total / trades) | +$20 | -$40 |
| Profit factor (gross wins / gross losses) | 2.0 | 0.5 |
| Total realized | +$200 | -$400 |

The first two rows are identical: both books win as often and win as much. Every row below them changes, because the losses differ. That is the whole case against reading the win rate alone: it cannot see the one thing that separates these books.

## The break-even win rate is set by the size of the losses

For any book there is a win rate at which the wins and the losses cancel. It follows from the averages:

    break-even share of wins = average loss / (average win + average loss)

In Book A that is 100 / (50 + 100), or two trades in three. Eight in ten clears it, so the book is up. In Book B it is 400 / (50 + 400), or eight trades in nine. Eight in ten falls short of it, so the book is down, with the same count of winners.

![With hypothetical wins of $50 and losses of $400, eight wins laid end to end are exactly as long as one loss, so nine trades with eight winners end flat.](/assets/blog/win-rate-break-even.svg)

When a full loss is eight times the average win, it takes eight wins to pay for one loss, so a book with these sizes moves ahead only if more than eight trades in nine win. A higher win rate is only meaningful against where that book's break-even sits.

That break-even moves with any choice that changes the size of a win or a loss. With everything else held equal, a smaller average win raises it and a smaller average loss lowers it, but the same choice can also change how many trades end as wins, so neither is an improvement on its own. The [closing early or holding post](/blog/close-credit-spread-early-or-hold) describes those mechanics.

## A win rate counts only what has closed

The fraction is built from closed records, so anything that keeps a losing trade from closing, or changes how it is recorded, keeps it out of the denominator. Five ways that happens:

- **Open losers.** A spread that is down and still open is not in the count. Closing winners while holding losers raises the win rate for as long as the losers stay open, and the open book carries the difference.
- **Rolls.** A roll is a close and an open, usually sent as one ticket. If the record books the ticket's net credit as one winning trade, the closing half's realized loss disappears into it. [Rolling options explained](/blog/rolling-options-explained) covers what the ticket actually does.
- **Assignment.** A short put assigned at expiration can show the full credit kept on the option while the shares bought at the strike sit below it. Counting the option as a win reports a result the position has not had yet.
- **Scratches and fees.** A trade closed for a few dollars gross can be a loss after commissions. Whether it counts as a win depends on whether the record is net of fees.
- **Small samples.** On ten trades, one trade moves the win rate by a tenth. A difference between two small books can be a single trade.

None of these is an arithmetic error. Each is a choice about what the record contains, which is why the [closed-position record post](/blog/options-trade-record-realized-pl) asks that a realized figure be reproducible from the row alone before any statistic is built on it.

## Frequently asked questions

- **Can a high win rate still lose money?** Yes. In the worked example, Book B wins eight trades in ten and ends $400 down, because each of its two losses is eight times the average win.
- **Is a high win rate bad?** No. It is incomplete. A high win rate with a small average loss and a high win rate with a large one are different books, and the win rate cannot say which one it describes.
- **What should a win rate be read beside?** Total realized profit and loss, the average win and average loss, and the largest loss against the credit taken in. Together they say how much, not just how often.
- **Does a credit spread's probability of profit predict its win rate?** It is an estimate made at entry for one trade held to expiration. A book's win rate also reflects every early close, roll and adjustment, so the two need not match.

## A result is dollars against what was risked, and a win rate is neither

In the worked example, two books with eight winners in ten ended $200 up and $400 down, because one book's two losers were $100 each and the other's were $400. The win rate was the one figure that could not see the difference. A result is the realized total in dollars, read against the capital it needed, which is what [return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital) sets out.

DeltaMint's Analysis page does show a win rate, but not alone. The card prints the count of wins and losses under it, and sits beside the profit factor, expectancy per trade, payoff ratio (average win over average loss), average win and average loss, all measured over settled trades, with the largest loss shown separately. A trade whose result is not final, such as an assignment whose shares are still held, is left out of the count, and the card says how many were excluded.

Read next: [premium capture on credit spreads](/blog/credit-spread-premium-capture), on what share of the credit a spread kept, held or closed early.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
