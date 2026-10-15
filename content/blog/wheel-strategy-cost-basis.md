---
title: "Wheel strategy cost basis: adjusted for every premium"
slug: wheel-strategy-cost-basis
excerpt: "The wheel strategy cost basis is the put's strike less the put premium and every call premium on those shares: a running figure the trader keeps by hand, separate from the assignment and premium rows in the account history and from the tax basis."
meta_description: "Wheel strategy cost basis on one hypothetical ledger: the strike less each premium, the double-counting trap, and why it is not the tax basis."
author: Osama Safwat Maghawry
category: income
series_order: 30
tags: wheel strategy, cost basis, cash-secured put, covered call, assignment
---

The **wheel strategy cost basis** is the price a wheel trader counts the shares at: the put's strike, less the put premium, less every call premium taken on those same shares since. It is a running figure the trader keeps by hand, and it falls each time another premium comes in. It is not the price on the assignment row in the account history, and it is not the cost basis used for taxes.

This post closes the [income series](/blog/income) with the bookkeeping the [wheel strategy post](/blog/wheel-strategy-explained) left open. It carries one hypothetical XYZ position from the put through a second covered call, writes out the running figure at every step, and shows the one error that figure invites. It describes arithmetic and does not suggest any trade.

## Key takeaways

- **The starting figure is the effective cost.** The put's strike less the put premium: 50.00 less 1.40 is 48.60 a share on the hypothetical XYZ.
- **Each call premium lowers it once.** A 0.98 call takes it to 47.62, the same number the covered call post calls the break-even, and a later 1.25 call takes it to 46.37.
- **Every premium is counted once.** The put premium is already inside the 48.60, so adding it again to a result overstates that result by 1.40 a share.
- **The account history keeps them apart.** The assignment typically appears as a purchase at the strike, and each premium as its own row.
- **It is not the tax basis.** The running figure is the trader's own arithmetic, and tax treatment is a question for a tax professional.

## How is the wheel strategy cost basis adjusted for each premium?

The calculation starts at assignment. A cash-secured put that is assigned buys 100 shares at its strike, and the premium taken when the put was sold has already arrived, so the shares cost the strike less that premium per share. The [cash-secured put post](/blog/cash-secured-put-explained) calls this the break-even if assigned. On the wheel it is usually called the effective cost, or simply the cost basis.

Every covered call sold against those shares then brings in another premium, and wheel traders commonly subtract that from the figure as well. However many calls have been sold, the result is one subtraction:

    running figure = put strike - put premium - every call premium

Three details decide what goes into that line:

- **Premiums are per share.** A call sold for $98 is 0.98 a share, because one contract covers 100 shares.
- **A buy-back adds back.** If a call is bought back before it ends, what was paid to close it is added back, because only the net premium was kept. A [roll](/blog/rolling-options-explained) is a buy-back and a new sale, so both halves count.
- **Only premiums on these shares count.** A put on another stock, or an earlier put that expired and delivered no shares, belongs to no share lot here. Some traders fold earlier unassigned puts on the same stock into the figure too, which makes it a different figure with the same name.

The figure says nothing about the market. The shares trade wherever XYZ trades, and a lower running figure moves only the price at which the whole position, premiums included, would come out even. The [covered call after assignment post](/blog/covered-call-after-assignment) makes the same point from the other side: a call adds its premium and sets an exit price, and no strike removes a loss already sitting in the shares.

## Example: one hypothetical XYZ ledger, from the put to called away

The numbers are the ones the [wheel post](/blog/wheel-strategy-explained) and the covered call after assignment post already use: hypothetical XYZ, 40% implied volatility, no interest rate and no dividend. The quotes are model estimates for a hypothetical chain, every option is sold at the bid, and none of it is market data or a forecast.

The first three steps are already familiar. With XYZ at $52.00 a 50 put is sold for $1.40, XYZ closes at $47.00 on expiration, and the put is assigned: 100 shares at $50.00, an effective cost of 48.60. A 50 call is then sold at its 0.98 bid with 30 days left.

Two steps are new. XYZ closes at $46.00 on the first call's expiration, below the 50 strike, so that call expires worthless and the shares stay. With the stock at $46.00 and another 30 days to run, the 48 call is quoted 1.25 bid and 1.35 ask, and a second call is sold at the bid. XYZ then closes at $49.00 on that call's expiration, above the 48 strike, and the call is assigned.

| Step | XYZ at | What happens | Cash in the history | Running figure per share |
| --- | --- | --- | --- | --- |
| 1. Put sold | $52.00 | 50 put sold at 1.40 | +$140 | No shares yet |
| 2. Put assigned | $47.00 | 100 shares bought at $50.00 | -$5,000 | 50.00 - 1.40 = 48.60 |
| 3. First call sold | $47.00 | 50 call sold at 0.98 | +$98 | 48.60 - 0.98 = 47.62 |
| 4. First call expires | $46.00 | Expires worthless, shares kept | None | 47.62, unchanged |
| 5. Second call sold | $46.00 | 48 call sold at 1.25 | +$125 | 47.62 - 1.25 = 46.37 |
| 6. Second call assigned | $49.00 | 100 shares delivered at $48.00 | +$4,800 | Closed: 48.00 - 46.37 = +1.63 |

The cash column reaches the same answer as the last column. $140, $98, $125 and $4,800 make $5,163 in, against $5,000 out, which leaves $163, or 1.63 a share. Two routes to one number is the check that the running figure was kept correctly.

![The running figure on one hypothetical XYZ wheel steps down from the 50.00 strike to 48.60, 47.62 and 46.37 as each premium arrives, and the shares are called away at 48.00, above the last step.](/assets/blog/wheel-running-cost-basis.svg)

Step 4 is where the figure sometimes gets moved twice. On this ledger the first call's premium came off at step 3, when it was received, because it is kept however the call ends. The expiry at step 4 confirms the figure and changes nothing. A trader who subtracts each premium only once its call has ended reaches the same 47.62 after step 4, so the two habits differ only while a call is still open.

Nor does the figure describe what the shares are worth. At step 4, with XYZ at $46.00, the shares were worth $4,600, which is 1.62 a share below the 47.62 running figure and 2.60 below the 48.60 effective cost. Had XYZ kept falling instead of closing at $49.00, the running figure would have stepped down only as fast as new premiums came in, while the shares fell a dollar for every dollar the stock did.

Step 6 shows what the running figure measures. The 48 call was struck below the 48.60 effective cost from step 2, so measured against that figure alone the shares left 0.60 a share short of it. Measured against 46.37, the whole position came out 1.63 a share above the figure. Both statements are true at once, because they answer different questions: the first is about the share price, the second about everything the shares brought in.

## Counting the put premium twice overstates the result

The running figure invites one mistake, and the ledger makes it easy to see. A trader who measures the shares against 48.60 has already subtracted the put's 1.40. If the premiums are then totalled separately and added on top, the 1.40 is counted a second time.

On the step 6 numbers, three ways of adding it up give three answers, and only one matches the cash:

- **Counted once.** The shares leave at 48.00 against 48.60, a 0.60 shortfall, plus the two call premiums of 0.98 and 1.25. The total is +1.63 a share, the same $163 the cash column shows.
- **Put counted twice.** The same 0.60 shortfall, plus 0.98, 1.25 and the put's 1.40 again. The total is +3.03 a share, or $303, which is $140 more than the account's net cash.
- **Every premium counted twice.** The shares measured against 46.37 give 1.63, and all three premiums added again bring 3.63 more, for +5.26 a share. It is the same mistake carried to its end.

![On the same hypothetical XYZ ledger, counting each premium once gives 1.63 a share, while adding the 1.40 put premium a second time shows 3.03.](/assets/blog/wheel-double-count-trap.svg)

The rule that prevents it is short. Every premium appears in the arithmetic exactly once, either inside the running figure or in the list of premiums, and never in both. The cash column is the check: whatever the running figure says, the result cannot exceed the cash that came in less the cash that went out, and on this ledger that is $163.

The mistake is easy to make because the two views store premiums differently. The account history shows each premium as a separate credit, as if it stood alone, while the effective cost on the trader's own sheet has quietly absorbed the first one. Moving between the two views means remembering which premiums each one already holds.

## The account history books the strike, and the tax basis is a separate figure

The transaction rows in the account history typically do not show 48.60 or 46.37. As the [assignment post](/blog/option-assignment-what-happens) walks through, the assignment typically appears as a purchase of 100 shares at the strike, and each premium as its own row dated the day the option was sold. The running figure has to be assembled from those rows by hand.

| | Account history, typically | The trader's running figure | Tax basis |
| --- | --- | --- | --- |
| Assignment row | $50.00, the put's strike | 48.60, then 47.62, then 46.37 | Set by tax rules, not by this ledger |
| Where premiums sit | Separate rows: +$140, +$98, +$125 | Subtracted from the share cost | A question for a tax professional |
| Shares called away at $48.00 | A sale at $48.00 against a $50.00 purchase | 1.63 a share above the figure | A question for a tax professional |
| Who keeps it | The broker | The trader, by hand | Tax rules decide it |

How a given broker's positions page or tax forms present the cost of assigned shares varies, and some may show a figure already adjusted for the put premium. That is why this post does not say what any particular account will display. It checks the arithmetic against cash instead, which every account history does show.

The running figure is also not the tax basis. Tax rules decide how a put premium, a call premium and a sale of the shares are treated, and that treatment need not match a figure that subtracts every call premium from the share cost. Everything about tax treatment is outside this post and is a question for a tax professional. The running figure is a trader's own measure of a position, kept for the trader.

## Frequently asked questions

- **What is cost basis in the wheel strategy?** The price a wheel trader counts the shares at: the put's strike less the put premium and every call premium taken on those shares since.
- **Does an expired covered call lower the cost basis?** On the running figure, its premium does, once. In the ledger here it came off when the call was sold, and the expiry changed nothing.
- **Why does the broker show the strike as the cost?** The assignment is typically booked as a purchase at the strike, with premiums as separate rows. Presentation varies by broker, so check the account.
- **Is the wheel cost basis the same as the tax cost basis?** No. The running figure is the trader's own arithmetic, and tax basis is set by tax rules and is a question for a tax professional.

## The bottom line

The wheel strategy cost basis is a running subtraction: the put's strike, less the put premium, less every call premium on the same shares, each counted once. On the hypothetical XYZ ledger it runs 48.60, 47.62 and 46.37, and the shares called away at 48.00 leave the whole position 1.63 a share above it, the same $163 the cash column shows.

The figure measures one thing, the whole position, and it breaks the moment a premium is counted twice. It is not what the assignment row shows and it is not the tax basis. This post closes the [income series](/blog/income), and the series continues with hedging, starting with the [protective put](/blog/protective-put-explained).

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
