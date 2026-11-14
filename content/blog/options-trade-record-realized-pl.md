---
title: "Options trade records: what a closed position has to contain"
search_title: "Realized P/L on Options: Recording Partial Closes and Rolls"
slug: options-trade-record-realized-pl
excerpt: A realized figure is only as good as the row behind it, and a partial close or a roll splits one position into records that a single summary line cannot reproduce.
meta_description: "Realized P/L on options, recorded so it can be recomputed: why a partial close is two records, a roll is a close and an open, and assignment is not final."
author: Osama Safwat Maghawry
category: measuring
series_order: 60
tags: trade record, realized p/l, options trading journal, partial close, rolling options
---

An **options trade record** for a closed position is the row that states what it realized: what opened, in what size, at what price per leg, what closed it, when, and how it ended. Its test is that the realized profit or loss, or realized P/L, can be recomputed from the row alone. For a credit spread that is (net credit - close debit) × 100 × contracts, and a row that cannot produce it is a claim rather than a record.

This post builds on [return on risk against return on capital](/blog/return-on-risk-vs-return-on-capital), the previous post in the [measuring](/blog/measuring) series, which compares positions before they open. This one is about the other end: what has to be written down once a position closes. It uses a hypothetical XYZ [put credit spread](/blog/put-credit-spread-explained) to show mechanics, not results.

Key Takeaways:

- **Reproducible is the test.** If the row cannot give back its realized figure, it is incomplete.
- **A partial close is its own record.** Each exit has its own size, price and date.
- **A roll is a close and an open.** The roll ticket's net credit is not a result.
- **Assignment leaves a record unfinished.** The shares' result lands when they are sold.

## What does an options trade record need for realized P/L?

Realized P/L is what a closed position actually produced: the credit taken in at the open, less what it cost to leave. Unrealized P/L is the same arithmetic run against a mark, a quote nobody has traded at.

A record is checkable when a reader holding only the row and a calculator gets the same number. On a credit spread that takes the prices both ways, the number of contracts the row covers, and how the position ended, because a buy-back, an expiry and an assignment settle differently.

| Field | Why the figure needs it |
| --- | --- |
| Legs, strikes, expiration | Which options the prices belong to |
| Contracts closed in this record | The multiplier; not the order size |
| Entry price per leg, net credit | Money in at the open |
| Exit price per leg, close debit | Money out at the close |
| Open and close dates | Tells two exits of one position apart |
| How it ended | Closed, expired, assigned or exercised settle differently |
| Shares delivered and their sale | Assigned shares carry the rest of the result |
| Fees, or "before fees" | Otherwise two correct rows disagree |

Per-leg prices matter even though only the net enters the formula: they let a reader check the net against that day's quotes.

Brokers report legs as separate fills, so a record must first [group the legs back into the spread](/blog/options-journal-splits-spreads-into-legs), or it measures a position nobody held.

## A partial close is two records, not one row with an average

The worked example below is hypothetical, before fees, and for the mechanics only. XYZ trades at 50, and ten 50/45 put credit spreads are opened with 35 days to expiration.

The short 50 put sells at 1.72 and the long 45 put is bought at 0.27, a net credit of 1.45, or $1,450 received. Max loss is (5.00 - 1.45) × 100 × 10 = $3,550, and the break-even at expiration is 48.55.

On day 12, with 23 days left and XYZ at 52, four of the ten are bought back. The short put costs 0.73 and the long put sells for 0.03, a close debit of 0.70. That is Record A: (1.45 - 0.70) × 100 × 4 = +$300.

On day 25, with 10 days left and XYZ at 48.50, the remaining six close. The short costs 1.88 and the long sells for 0.06, a close debit of 1.82. That is Record B: (1.45 - 1.82) × 100 × 6 = -$222.

![One hypothetical ten-lot opened at 1.45 ends as two records: four closed at 0.70 for +$300, six at 1.82 for -$222.](/assets/blog/trade-record-one-position-two-records.svg)

Across the two records the original position realized +$300 - $222 = +$78. A summary row such as "XYZ 50/45, +$1,450 credit" cannot produce that figure: it is the opening ticket, with no exit price, no size closed and no date.

An averaged row does better and still fails. The weighted exit is (0.70 × 4 + 1.82 × 6) / 10 = 1.372, and (1.45 - 1.372) × 100 × 10 = $78, so the total comes out right. What it loses on the way:

- **The sign of each exit.** One close made money and the other lost it.
- **The two dates.** Day 12 and day 25 become one close.
- **The size of each.** Four and six become ten at a price nobody traded.

The [partial fill post](/blog/partial-fill-options-spread) makes the same split at the open: four filled of ten is a four-lot position, and the ticket's ten describes an order.

## Is a rolled option one trade record or two?

Record B was not a plain exit. The six spreads were bought back as the closing half of a [roll](/blog/rolling-options-explained), on one ticket with six new 50/45 put spreads 45 days out. The new short sold at 2.72 and the new long was bought at 0.62, a credit of 2.10, or $1,260.

The roll ticket shows the net of its two halves: 2.10 - 1.82 = 0.28 credit, times 600, or +$168. It is not a result: it nets the $1,092 paid to close the old six against the $1,260 taken for the new six. The old six's realized -$222 also needs their original $870 credit, which is not on this ticket.

![A hypothetical roll ticket's +$168 net is two halves: $1,092 paid to close six spreads, and $1,260 taken for six new ones still open.](/assets/blog/trade-record-roll-ticket-vs-record.svg)

Each part of that ticket belongs somewhere different:

- **The closing half.** $1,092 paid, which closes Record B at -$222 against its $870 opening credit.
- **The opening half.** $1,260 received on an open position with its own max loss of (5.00 - 2.10) × 100 × 6 = $1,740.
- **The net.** +$168 of cash, which is neither a result nor a record.

A row that says "rolled for +$168" fails in both directions. It reports a gain where the closed spreads lost $222, and it treats as earned a $1,260 credit the new spreads can give back in full, before losing up to $1,740 net.

## How do expiration and assignment end a trade record?

The ending is a field of its own because each one settles differently:

- **Closed.** The close debit comes from the exit fills.
- **Expired.** Both legs finish worthless; the close debit is zero, and the ending says so.
- **Assigned.** The short put is [assigned](/blog/option-assignment-what-happens) and shares are bought at the strike.

Suppose the six new spreads reach expiration with XYZ at 47. The long 45 put expires worthless and the short 50 put is assigned, so 600 shares are bought at 50, or $30,000. The $1,260 credit is kept, but what those shares eventually sell for is the rest of the record's result, and it does not exist yet.

So an assigned record is not final while its shares are held. How the premium and the shares combine into one cost figure is what [wheel strategy cost basis](/blog/wheel-strategy-cost-basis) works through; the record's job is to hold both and say the figure is incomplete. A trade record is also not a tax document, and how any of this is taxed is a question for a tax professional.

DeltaMint's Trade History is built around these fields. It reconstructs closed trades from the broker's own activity feed and pairs each short leg with the nearest protective long on the same expiration to reconstruct the spread, flagging any leg left without a partner. Each row carries the legs' entry and exit prices, the contracts, the open and close dates, and how it ended: CLOSED, EXPIRED, ASSIGNED or EXERCISED. Fills of one spread closed on the same day with the same ending share a row, at size-weighted average prices.

The result is shown in three parts, Premium, Early Close and From Assignment, beside the Total P/L they add up to. A row whose assigned shares are still held is marked "not final": if the shares are later sold on the market, their result lands on that row, and if a covered call takes them away, it lands on the call's row instead. A row whose reconstructed result is one its own strikes cannot reach shows dashes in its result columns, with an "unverified" badge, instead of a number.

## Frequently asked questions

- **Does an options trade record have to include fees?** It has to include them or say the figure is before them.
- **Is a rolled position one trade or two?** For realized P/L, two: the closed half has a result, the new half does not yet.
- **Is a trade record a tax record?** No. Tax treatment is a question for a tax professional.

## A record that cannot be recomputed is only a claim

The test for any row is whether a reader can get its realized figure back from what the row says. In the worked example, one ten-lot became +$300 and -$222 in two records, a roll ticket's +$168 netted a buy-back against a credit still at risk, and an average got the total right while hiding both. The rest of the [measuring series](/blog/measuring) builds on rows that hold up to that test.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
