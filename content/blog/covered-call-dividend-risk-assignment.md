---
title: "Covered call dividend risk: when a short call is assigned early"
slug: covered-call-dividend-risk-assignment
search_title: "Covered Call Dividend Risk: Assignment Before Ex-Dividend"
excerpt: A short call is most likely to be assigned early the evening before an ex-dividend date, when the dividend is larger than the extrinsic value left in the call.
meta_description: "Covered call dividend risk: when a dividend beats a short call's extrinsic value, assignment is likely the day before the ex-date. Who loses it, who owes it."
author: Osama Safwat Maghawry
category: investing
series_order: 46
tags: covered call, dividends, early assignment, ex-dividend, short call
---

**Covered call dividend risk** is the chance that a call you sold is exercised against you the evening before a stock's ex-dividend date, so that the dividend goes to the person who held your call instead of to you. It is the most common reason a short call is assigned early. The cause is arithmetic rather than bad luck, and it can be read off the option chain before it happens.

This is the sixth post in the [options for investors](/blog/investing) series. It builds on [early exercise](/blog/early-exercise-options), which explains the holder's side of the same event, and everything here is seen from the seller's chair. The figures are hypothetical, there to show the mechanics, and nothing here says that anyone should sell a call.

**Key takeaways**

- **The trigger is a comparison.** A holder has a reason to exercise early only when the coming dividend is larger than the extrinsic value left in the call.
- **The window is narrow.** The decision is made on the last business day before the ex-dividend date, and the seller learns of it the next morning.
- **A covered seller forgoes the dividend.** If the call finishes in the money, the shares are sold at the strike either way; early assignment only moves the dividend to someone else.
- **An uncovered seller owes it.** A short call with no shares behind it becomes short stock across the ex-date, and the account is debited the dividend.

## A short call is assigned early when the dividend beats its extrinsic value

Every call's price splits into intrinsic value and [extrinsic value](/blog/intrinsic-vs-extrinsic-value-options). A holder who exercises receives the intrinsic value and gives up the extrinsic value, which is why exercising early is rare. A dividend changes one side of that trade.

The call itself is never paid the dividend. Shares are, and the share price is expected to fall by about the dividend on the ex-date, which drags a deep in-the-money call down with it. A holder who exercises the business day before the ex-date owns the shares in time to collect it. So the holder compares two numbers:

- **The dividend.** What owning the shares across the ex-date pays.
- **The extrinsic value left.** What exercising throws away, and what selling the call instead would have kept.

Take a hypothetical XYZ at $56.00 with a 50 call, and a $0.50 dividend going ex tomorrow. The same dividend meets two different calls:

![Two pairs of bars for a hypothetical 50 call and a 0.50 dividend: with 10 days left the call carries 0.05 of extrinsic value, less than the dividend, and with 90 days left it carries 0.80, more than the dividend.](/assets/blog/short-call-dividend-vs-extrinsic.svg)

With 10 days left the call is quoted at 6.05: 6.00 intrinsic and 0.05 extrinsic. Exercising gives up $5 per contract to collect $50. With 90 days left the same call carries 0.80 of extrinsic value, so exercising would give up $80 to collect $50. That call is worth more sold than exercised, and the dividend alone gives no reason to do otherwise.

The timing follows from how stock settles. A buyer must own the shares before the ex-dividend date to be paid, so the last practical day to exercise is the business day before it. After that day the stock trades without the dividend, and the reason to exercise is gone. That is why assignments for this reason cluster on a single evening rather than spreading across the contract's life.

Three conditions have to line up for a short call to be a real candidate:

- **Deep in the money.** A call with a real chance of finishing out of the money is protection to its holder, and that protection is most of its extrinsic value.
- **Little time left.** Extrinsic value shrinks toward zero at expiration, so the shorter the life, the easier the dividend wins.
- **A dividend worth noticing.** A small dividend rarely beats the extrinsic value of any call with weeks to run.

## A covered call seller gives up the dividend, not the premium

For a [covered call](/blog/covered-call-explained) the early notice sounds worse than it is. The seller already agreed to sell the shares at the strike, and the premium was received on the day the call was sold. What an early assignment changes is the date the shares leave, and who is holding them on the ex-date.

Suppose a hypothetical account holds 100 XYZ shares against the short 50 call, and XYZ stays near $56.00. The two paths:

| | Assigned the evening before the ex-date | Assigned at expiration, 10 days later |
| --- | --- | --- |
| Shares sold at | 50.00 | 50.00 |
| Cash received | $5,000, about ten days sooner | $5,000, at expiration |
| Dividend on the ex-date | None: the shares are gone | $50 paid on 100 shares |
| Premium from the original sale | Kept | Kept |

The dividend is the main difference. The earlier $5,000 earns some interest for ten days, about $5 at a 4% rate, which offsets a small part of the $50. The premium is untouched in both columns, which is why the loss is not the premium but the dividend the account would have collected had the call stayed open.

That is also why the comparison only matters when the stock is above the strike. If XYZ were below 50 on the ex-date the call would not be a candidate at all, and the account would simply collect the dividend. Nothing in the account has gone wrong. The call did what the contract says, on a day the holder chose. For the broader picture of what the account looks like once the shares leave, see [covered calls after assignment](/blog/covered-call-after-assignment).

## A short call without shares behind it owes the dividend

The covered seller loses a dividend that was never certain. A seller with no shares loses something worse, because assignment of a short call makes the account short stock, and short stock owes dividends.

Take a hypothetical [call credit spread](/blog/call-credit-spread-explained) on XYZ at $56.00: short the 50 call, long the 55 call, one contract. Both calls are in the money. The short 50 call is assigned the evening before the ex-date:

- **Short stock arrives overnight.** The account sells 100 shares at 50, receiving $5,000, and is short 100 shares at the next open.
- **The dividend is debited.** The holder of the shares is paid on the ex-date, and the account that is short them is charged the same $50, a payment in lieu of the dividend.
- **The long call still stands.** Exercising the long 55 call buys 100 shares at 55 for $5,500, which closes the short shares at a loss of $500 on the strikes.

That $500 is the spread's width, and the [maximum loss](/blog/credit-spread-max-loss) formula covers it: the width times 100, less the credit received. The $50 dividend is not in that formula. With a hypothetical credit of $1.80, received when the spread was opened earlier, the figure the formula gives is $320, and an early assignment before the ex-date makes the realised loss $370 if the long call is exercised to close, before fees.

![Three hypothetical accounts with the 50 call assigned the evening before a 0.50 dividend: the covered call forgoes the $50, the call credit spread and the uncovered short call each owe it.](/assets/blog/short-call-assigned-before-ex-date.svg)

An uncovered short call has the same $50 debit and no long call to cap what comes after it. The short shares are exposed to the stock's rise above 50 until they are bought back, and that gap, rather than the dividend, is the larger risk.

## Will a short call be assigned before the ex-dividend date?

An early assignment does not announce itself in advance. The holder decides after the close, exercises are allocated overnight, and the seller usually learns before the next open. By then the shares have already moved and the ex-date has arrived or is about to. The [assignment post](/blog/option-assignment-what-happens) covers that sequence.

What can be seen beforehand is the setup. The arithmetic is the same one the holder runs, so a seller can run it first. Three facts, all public, mark a short call as exposed on a given evening:

- **The ex-dividend date.** Companies announce dividends and ex-dates ahead of time, and exchanges publish them.
- **The call's extrinsic value.** It sits in the option chain: the mid-price minus the intrinsic value.
- **The dividend per share.** Compare it to that extrinsic value.

When the dividend is the larger figure on a deep in-the-money short call, the position is in the zone the notice comes from. A call with 10 days left and 0.05 of extrinsic value, facing a 0.50 dividend, is in that zone; the call with 90 days left is not. The seller's options at that point are to hold it, accept the notice if it comes, or close the call before the final close of the day, which costs the market price including any extrinsic value remaining. Which is better depends on a view of the stock and the account, and this post takes none.

For a long-term holder the covered call also rests on shares that may have gains or tax lots attached. Whether an early assignment realises a gain, and on which lot, follows the account's lot method; the [buy-write post](/blog/buy-write-strategy) works through that on an account that holds two lots. Tax treatment of dividends and calls is a question for a tax professional.

Quotes make this less tidy than the example. A deep in-the-money call often trades with a wide bid-ask spread, and the bid can sit below intrinsic value, so the extrinsic value read from the mid-price is an estimate. Treat a gap of a few cents either way as unsettled, and a gap of tens of cents, like the 0.05 against 0.50 above, as clear. Interest matters at the margin as well: a holder who exercises pays the strike sooner, so a higher rate raises the bar the dividend has to clear.

## Frequently asked questions

- **Does a put have the same dividend risk?** No. A dividend lowers the stock price, which helps a put holder, so it adds no reason to exercise a put early. Early exercise of puts turns on interest.
- **Can an out-of-the-money call be assigned for a dividend?** In practice it is not a candidate: exercising means paying more for the shares than they are worth, and that gap plus the call's remaining value is almost always larger than the dividend.
- **Do index options have this risk?** SPX and NDX options are European-style, so they cannot be exercised before expiration, and index options settle in cash, so there are no shares and no dividend to collect. Single-stock and ETF options are American-style.
- **Is the premium refunded if assignment comes early?** No. The premium was received on the sale and is kept in every outcome.

## The bottom line

A short call is assigned early for a dividend when a deep in-the-money call has less extrinsic value left than the dividend about to be paid. For a covered seller that moves the dividend to the call holder and nothing else; for a seller with no shares it means owing the dividend on a short stock position the account did not plan to hold. The setup is on the chain before the notice arrives. The [options for investors series](/blog/investing) continues with [how a long-dated position is sized](/blog/leaps-position-sizing).

All figures on this page are hypothetical and are there to show the arithmetic. This post is educational and is not investment advice.
