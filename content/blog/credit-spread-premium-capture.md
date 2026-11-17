---
title: "Premium capture on credit spreads: held vs closed early"
search_title: "Premium Capture Rate on Credit Spreads: Held vs Closed Early"
slug: credit-spread-premium-capture
excerpt: Premium capture is the share of a credit spread's opening credit that was kept when it ended, and one spread can capture half, all, or a large negative multiple of it depending on how it was closed.
meta_description: "How premium capture on a credit spread is calculated, and why it cannot rank holding against closing early. One hypothetical spread: 50%, 75%, 100% or -100%."
author: Osama Safwat Maghawry
category: measuring
series_order: 63
tags: premium capture, credit spread, closing early, credit kept, put credit spread
---

**Premium capture** on an options credit spread is the share of the opening credit that was kept when the position ended: the credit received minus whatever was paid to close it, divided by the credit received. A spread sold for $100 and bought back for $40 captured 60% of its premium. A spread whose legs both expired worthless captured all of it.

The figure is easy to compute and easy to misread. It says how much of the credit stayed in the account, not how long the risk was carried or how large it was.

This post continues the [measuring](/blog/measuring) series after [why an options win rate is misleading](/blog/options-win-rate-misleading). It measures the exits that [closing a credit spread early vs holding to expiration](/blog/close-credit-spread-early-or-hold) weighs as a decision.

Key Takeaways:

- **Capture is kept credit over credit received.** Two dollar figures, both from the fills.
- **One spread can capture very different shares.** It depends on when and at what price it ends.
- **Capture has a ceiling of 100% and a floor far below zero.** On a spread whose max loss is four times its credit, the floor is -400%.
- **A book's capture is a dollar ratio.** Averaging percentages can even flip its sign.
- **Capture leaves out time and risk.** It cannot rank closing early against holding.

## Premium capture is the share of the opening credit you kept

On a single spread the arithmetic uses only the fills:

    premium capture = (credit received - debit paid to close) / credit received

Both prices are quoted per share and the number of contracts cancels, so a ten-lot and a one-lot closed at the same prices capture the same share. If both legs expire worthless, the debit to close is zero and capture is 100%. If the spread is bought back for more than it was sold for, the top of the fraction turns negative, and so does the capture.

A [put credit spread](/blog/put-credit-spread-explained) sold for a 1.00 credit on a $5 width shows where the figure can go. The most the position can keep is the $100 credit, a capture of 100%. The most it can lose is the width less the credit, $400, as [the credit spread max loss post](/blog/credit-spread-max-loss) works out. As a share of the $100 credit, that loss is -400%.

- **The ceiling.** 100%, when nothing is paid to close.
- **Zero.** Bought back for exactly the credit: a scratch, before fees.
- **The floor.** Minus the max loss over the credit. The smaller the credit against the width, the deeper it goes.

![On a hypothetical 50/45 put credit spread sold for $100, premium capture runs from 100% at most down to -400% at the full max loss, so the scale below zero is four times as long as the scale above it.](/assets/blog/premium-capture-range.svg)

That lopsided scale is the first thing a list of capture figures hides. A trade that captured 50% and one that captured -100% sit near each other in a column of percentages. In dollars, the second gave back twice what the first kept.

## One spread closed at four points keeps four different shares of the credit

The worked example below is hypothetical, before fees, and only there to show the arithmetic. It follows one put credit spread down four alternative paths. None of the four exits is offered as a point at which to close.

The spread: sell the XYZ 50 put and buy the 45 put, one contract, 30 days to expiration, for a 1.00 credit. That is $100 received against a $400 max loss, with a break-even at 49.00. Each row below is a separate version of the same trade:

| Exit | Day it ended | Paid to close | Kept | Premium capture | Days the $400 max loss stayed open |
| --- | --- | --- | --- | --- | --- |
| Bought back at 0.50 | 9 | $50 | +$50 | 50% | 9 |
| Bought back at 0.25 | 20 | $25 | +$75 | 75% | 20 |
| Held, both legs expired worthless | 30 | $0 | +$100 | 100% | 30 |
| Bought back at 2.00 | 15 | $200 | -$100 | -100% | 15 |

![The same hypothetical $100 credit spread ended four ways: bought back at 0.50 it kept $50, bought back at 0.25 it kept $75, held to a worthless expiration it kept all $100, and bought back at 2.00 it lost $100.](/assets/blog/premium-capture-four-exits.svg)

The first three rows rise together. Each later exit kept more of the credit and carried the $400 max loss for longer. That is not a coincidence of these numbers. While the stock stays above the short strike, the spread's price tends to fall toward zero as expiration approaches, so a later close on that path pays a smaller debit. [Theta decay](/blog/theta-decay-explained) explains why that fall is uneven.

The fourth row is the same spread on a path where XYZ fell toward the short strike and the spread's price rose. Buying it back at 2.00 cost twice the credit, so the capture is -100%. Had it been held instead to expiration with XYZ below 45, the spread would have been worth its full $5 width: a $400 loss, and a capture at the floor of -400%.

Read down the capture column alone and the four rows look like a ranking, best at the third. Read the last column beside it and they are four different amounts of risk carried for four different lengths of time. Which of the four paths a real spread takes is not known on the day it is opened.

## A book's premium capture is a dollar ratio, not an average of percentages

Across many trades, capture is the total kept divided by the total credit received. Averaging each trade's percentage gives every trade the same weight whatever its size, and on a book with losses it can produce a different answer, or the opposite sign. A hypothetical book of three one-lot spreads shows how:

| Spread | Credit received | Result | Premium capture |
| --- | --- | --- | --- |
| A, bought back at 0.50 | $100 | +$50 | 50% |
| B, sold for 0.40, expired worthless | $40 | +$40 | 100% |
| C, bought back at 2.00 | $100 | -$100 | -100% |
| The book | $240 | -$10 | about -4% |

The three percentages average to about 17%. The book, though, kept -$10 of the $240 it received, a capture of about -4%. Spread B's 100% counts for a third of the simple average while supplying a sixth of the credit. The dollar ratio is the one that agrees with the account.

Three things change what the ratio reports without showing in it:

- **Rolls.** A roll closes one spread and opens another, usually as one ticket. Book the ticket's net credit as a fresh credit and the debit that closed the old spread never reaches its capture. [What a closed-position record has to contain](/blog/options-trade-record-realized-pl) books it as two records.
- **Assignment.** An assigned short put has nothing paid to close it, so on the option legs it reads as a full capture even when the shares bought at the strike are worth less. Counting the shares does not fix it: if the stock recovers, the ratio can pass 100%, which measures nothing. See [what happens on assignment](/blog/option-assignment-what-happens).
- **Fills and fees.** Capture uses fill prices, so paying the ask rather than the midpoint lowers it, and the [bid-ask spread](/blog/options-bid-ask-spread) on two legs is a large share of a small debit. Commissions lower it again.

## Premium capture cannot say whether holding or closing early was better

The comparison people reach for runs: held to expiration captured 100%, closing early captured 50%, so holding did better. The four-exit table shows why the figure cannot carry that conclusion. Each version of the trade carried a different amount of risk for a different length of time, and capture divides by the credit only:

- **Time.** The 50% exit carried the max loss for 9 days, the 100% exit for 30.
- **The risk that stayed open.** The held version kept $400 at risk for three more weeks to earn its last $50.
- **The path not taken.** A spread closed at 50% leaves no record of what it did afterwards; a held one records every expiration, including those at the floor.
- **The freed collateral.** Closing at day 9 releases the [buying power](/blog/options-buying-power-requirement) held against the spread, for another trade's record.

This is why two books with different exit habits can report capture figures far apart while neither figure says which book did better in dollars. A book that closes its winners early will show winners captured well short of 100%. A book that holds will show more 100% rows and, on the paths where the stock falls through the spread, deeper negatives. Which ends larger in dollars depends on the size of the losses as much as on the wins, the same arithmetic that set the break-even win rate in [the win rate post](/blog/options-win-rate-misleading).

The comparison that does hold up is made in dollars against what was risked: the realized total beside the capital it needed, which is what [return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital) sets out.

## Frequently asked questions

- **What is a good premium capture rate?** None that the arithmetic can name. The same percentage can describe very different books.
- **Can premium capture be above 100%?** Not on the option legs of a credit spread, because the most the spread can keep is the credit. A figure above 100% means something else, such as a gain on assigned shares, has been counted in the numerator.
- **Does keeping 50% of the credit mean a 50% return?** No. In the example the $50 kept sits against a spread that could have lost $400; the right denominator is the max loss, the subject of [return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital).

## Premium capture records how much credit stayed, not which exit was right

In the worked example, one hypothetical spread captured 50%, 75%, 100% or -100% of its credit depending only on when and at what price it ended, and could have reached -400% at its max loss. The figure is a faithful record of how much credit stayed in the account. Read beside the dollars kept, the days the risk was carried and the max loss, it describes an exit; on its own it ranks none of them.

DeltaMint's Analysis page shows a Credit capture figure, the kept share of premium sold, measured on the option legs only so that assigned shares cannot push it past 100%. A table headed "How your trades ended" sorts every closed trade by its ending, such as expired worthless, assigned or bought back earlier, with each row's count and result.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
