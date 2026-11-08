---
title: "Assignment risk on a credit spread: what the account shows after"
slug: assignment-risk-credit-spread
search_title: "Credit Spread Assignment Risk: What Happens to Each Leg"
excerpt: Only the short leg of a credit spread is ever assigned. What the account shows afterwards, and what the long leg then does, is the part nobody states before it happens.
meta_description: "Credit spread assignment risk: only the short leg is assigned. The long leg is not used for you, and exercising it or selling it settle for different amounts."
author: Osama Safwat Maghawry
category: managing
series_order: 51
tags: assignment, credit spread, short leg, early exercise, risk
---

**Assignment risk on a credit spread** is the chance that the person holding the option you sold uses it, so that you must buy or sell 100 shares at the strike per contract. Only the short leg can be assigned. The long leg is a right you own, so nobody can exercise it against you. That one-sided fact is why a defined-risk position can wake up as a stock position, and why the long leg does not close anything unless you act on it.

Key Takeaways:

- **One leg is exposed.** The option you sold carries the obligation; the option you bought only caps the loss.
- **Assignment arrives overnight.** The notice usually shows up before the next open, with the shares already in the account.
- **The long leg waits for you.** It does not exercise itself against the assignment, and what you do with it changes the result.
- **It is rare early, near-certain late.** Exercise before expiration has narrow triggers; exercise at expiration follows from being in the money.

## What happens when the short leg of a credit spread is assigned?

Take a hypothetical [call credit spread](/blog/call-credit-spread-explained) with weeks to expiration: short the 105 call, long the 110 call, one contract, $1.20 of credit. That is $120 received against a $5.00 width, so the max loss is $380 once both legs settle together, as worked through in the [credit spread max loss post](/blog/credit-spread-max-loss).

Suppose the stock closes at 106 on the day before an ex-dividend date, and the holder of the 105 call exercises to collect the dividend. You are [assigned](/blog/option-assignment-what-happens): you sell 100 shares at 105. The account does not own those shares, so it is now short 100 shares, with $10,500 credited and a margin requirement against the short position. The 110 call is untouched.

The long call is a separate position. Nothing links it to the assignment unless you instruct it, and a brokerage does not generally exercise it on your behalf because the other leg of the spread was assigned, unless its own risk rules require it.

![A hypothetical call credit spread before and after assignment on the short 105 call: the account becomes short 100 shares with the 110 call still held, then either exercises the call for a fixed $380 loss or sells the call and buys the shares back for a result that depends on the stock price.](/assets/blog/assignment-short-call-spread-exits.svg)

## What the account shows the morning after assignment

Exercise decisions are made after the close and allocated to sellers overnight. The seller typically finds out before the next open, holding a position that did not exist at the last close. Whatever the stock does before your first chance to trade is already yours.

For the call spread above, the morning looks like this:

- **A short stock position.** One hundred shares short at 105, which a stock that opens at 108 has already moved against.
- **The long call still outstanding.** It caps the loss above 110 for as long as you hold it. The loss is fixed only when you exercise it or buy the shares back.
- **A different funding question.** Short stock is margined differently from two option legs, and some account types, retirement accounts among them, cannot hold short stock at all.
- **Carrying costs that did not exist.** Borrowing the shares can carry a fee, and a short position across the ex-dividend date owes the dividend.

A short put assigned is the mirror image: 100 shares bought at the strike, which the account must fund or margin.

## Exercise the long leg or sell it: two exits that do not cost the same

Once assigned, you hold short shares and a long call. There are two ways to end the position, and they settle for different amounts.

| | Exit A: exercise the long call | Exit B: sell the call, buy the shares |
| --- | --- | --- |
| What happens | Buy 100 shares at 110 and deliver them against the short | Sell the 110 call at its market price, buy 100 shares at the market |
| Result on the shares | Sold at 105, bought at 110: minus $500 | Sold at 105, bought at the market price |
| Plus the credit | Plus $120 | Plus $120, plus whatever the call sells for |
| Stock at 108 | Net minus $380 | Call sells for about $0.80: net minus $100 |
| Stock at 112 | Net minus $380 | Call sells for about $2.75: net minus $305 |

The call prices are assumptions about time value left, not quotes.

Exercising always produces the same number, the full max loss, because the shares settle exactly one width apart. Selling the call and buying back the shares ends with a smaller loss in these figures, because the call still carries time value. At 112 that is $0.75 per share, the difference between the two columns. At 108 the call is out of the money, so exercising it would mean paying 110 for shares trading at 108, while selling it recovers its remaining value.

This is [early exercise](/blog/early-exercise-options) from the holder's side: exercising forfeits extrinsic value, and selling keeps it.

## What triggers early assignment on a credit spread

Most spreads are never assigned early. The holder of the option you sold gives up its remaining time value by exercising, so early exercise pays only when there is little of that to give up:

- **A deep in-the-money option with almost no time value.** The less extrinsic value left, the less the holder forfeits.
- **A short call before an ex-dividend date.** When the dividend is larger than the time value left in the call, a holder who wants the dividend exercises first. The [dividend and assignment post](/blog/covered-call-dividend-risk-assignment) works through the arithmetic.
- **A deep in-the-money put late in its life.** Exercising a put releases cash at the strike, and when the interest on that cash exceeds the remaining time value, exercise can pay.
- **A hard-to-borrow stock.** Deep in-the-money calls on such names can trade below their intrinsic value, which raises the odds of early exercise.

None of these predicts a given spread. A short leg only slightly in the money, with weeks left, still carries most of its time value.

Related: [what happens when a credit spread goes in the money](/blog/credit-spread-in-the-money) separates the partly and fully in-the-money states and what closing costs in each.

## At expiration the question changes from "might" to "will"

At expiration time value is gone, so the early-exercise logic gives way to a simple rule: options even a cent in the money at the close are exercised by exception, and a brokerage may apply its own threshold on top. A short leg that finishes in the money is almost always assigned, as covered in [what happens at expiration](/blog/what-happens-options-expiration). For a call spread:

- **Below both strikes:** both calls expire worthless and the credit is kept.
- **Between the strikes:** the short is assigned, the long expires worthless, and you are short 100 shares with no call above them.
- **Above both strikes:** the short is assigned and the long is exercised by exception, and the two settle against each other for the width.

The middle case is the dangerous one: Friday's position had a defined worst case; Monday's is short stock with nothing protecting it. A [put credit spread](/blog/put-credit-spread-explained) has the mirror version: finish between the strikes and you own 100 shares with no put below them.

There is also a gap in the other direction. Holders can instruct their broker after the close, so an option that finished just out of the money can still be exercised if the stock moves afterwards, and one that finished just in the money may not be.

## Does assignment increase the risk on a credit spread?

Not the worst case: the loss is still capped at $380 for as long as the long call is held. What changes is everything around that figure:

- **The position type.** It was two option legs; it is now stock, margined as stock.
- **The funding.** A $10,000 debit on the put side, or a short position and its margin on the call side, arrives without warning.
- **The decision.** Two exits, a different price for each, and a clock that started overnight.
- **The costs outside the formula.** Commissions, exercise fees, borrow fees and any dividend owed.

None of this is a view on whether to hold a spread. With many spreads open, which short legs are close to the money, and how many days are left on each, is the question [managing multiple option positions](/blog/managing-multiple-option-positions) is built around.

## FAQ

**Is the long leg assigned too?** No. Only the option you sold can be assigned. The long leg is yours to exercise, sell or let expire.

**Does the long leg cancel the assignment automatically?** Generally not. You decide, and the two ways of closing out are not equivalent.

**Can an out-of-the-money spread be assigned?** Before expiration, practically never, since exercising gives up value for nothing. At expiration, an option that closed just out of the money can still be exercised if the stock moves after the close.

**What if my broker handles it differently?** Treatment varies by broker, account type and agreement. Read yours rather than assuming.

The rest of the series on holding positions after they fill is in [After the fill](/blog/managing).

This post is educational and is not investment advice.
