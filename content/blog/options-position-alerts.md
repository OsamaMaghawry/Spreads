---
title: "Options position alerts: which conditions on a spread are worth a notification"
slug: options-position-alerts
search_title: "Options Position Alerts: What to Watch on a Spread"
excerpt: An alert earns its place when it marks a change of state in a position, not a twitch in its price. Which conditions do that on a credit spread, and which are known on the day of the fill.
meta_description: "Options position alerts: which conditions change a spread's state, which dates are known at the fill, and why an alert on the mark tracks a quote."
author: Osama Safwat Maghawry
category: managing
series_order: 57
tags: alerts, credit spread, short strike, expiration, earnings
---

An **options position alert** is a notification that fires when a condition on an open position becomes true: the stock reaches a price, a date arrives, a leg changes. The useful question is which conditions deserve one. On a book of credit spreads, an alert is worth its noise when it marks a change in what the position is or what can happen to it, not when it only reports that a price moved.

This post sits in the [After the fill](/blog/managing) series. It builds on [managing multiple option positions](/blog/managing-multiple-option-positions), which sorted a book by days left and the cushion to the short strike, and turns that sort into conditions. One hypothetical put spread runs through it, invented to show the mechanics; it describes no result.

Key Takeaways:

- **Alert on state, not on wiggle.** The conditions that matter are the ones after which the position behaves differently: a short strike crossed, a date passed, a leg gone.
- **Dates are known at the fill.** Expiration, the earnings report and an ex-dividend date can be written down the day the order fills. They need a calendar entry, not a price watcher.
- **The stock is a cleaner trigger than the mark.** A spread's mark is the midpoint of quotes that can widen without the stock moving at all.
- **The account changes too.** An assignment or a partial fill changes what the position is, and neither shows in the stock price.

## Which conditions on a spread are worth an alert?

A credit spread spends most of its life doing nothing a trader can act on. The stock and the mark move, and the position is still the same position with the same maximum loss. An alert that fires on every one of those moves is a feed, and a feed with twenty spreads behind it gets ignored.

What deserves a notification is a short list of moments after which the spread is a different object. While the stock stays above the short strike, a put spread that expires there is worth nothing and the whole credit is kept. Once the stock is through it, the spread has intrinsic value, assignment on the short leg becomes a real possibility, and the time left matters far more. Those are changes of state, and they are the same few on every spread.

They come in three kinds: dates, prices and records from the broker. The table below sets them out, with when each can be known and what can make it fire when nothing real has changed.

| Condition | What it measures | Known when | What can make it fire falsely |
| --- | --- | --- | --- |
| Expiration week | Time left to act | At the fill | Nothing; it is a date |
| Earnings before expiry | A scheduled gap risk | At the fill, if the date is confirmed | A date that moves after the fill |
| Ex-dividend on a short call | Early assignment risk | Once the dividend is declared, often before the fill | A dividend smaller than the call's remaining time value |
| Stock near the short strike | Cushion running out | Only as it happens | A brief print that reverses |
| Short strike in the money | Intrinsic value, assignment likely | Only as it happens | Little; it is a fact about the close |
| Max loss against account size | How much one spread can cost | At the fill, and whenever the account changes | Account value moving, not the spread |
| A leg assigned or partly filled | The position is no longer the spread opened | Only after the broker reports it | Nothing; it is a record |

## Dates are known at the fill, so they need a calendar, not a watcher

Three of the conditions are dates. They can usually be read off a calendar on the day the order fills, and the only work is checking the date has not moved by the time it arrives.

Expiration is the plainest. As [the post on expiration day](/blog/what-happens-options-expiration) set out, the last days are when a spread near its short strike is most sensitive to small moves and when the legs can settle separately. A reminder a few days before it fires for a reason that is never false.

The other two dates bring risk the price does not show in advance:

- **An earnings report before expiration.** The stock can open far from where it closed, through the short strike and past the long one, with no trading in between. [Selling options before earnings](/blog/selling-options-before-earnings) covers why the premium is higher into the report. A price alert fires only after the stock has moved, which is after the gap. A date reminder fires the day before the report.
- **An ex-dividend date on a short call.** On a call spread, covered call or condor, an in-the-money short call can be exercised early by its holder the day before the stock goes ex-dividend, when the dividend exceeds the call's remaining time value. [Dividends and short calls](/blog/covered-call-dividend-risk-assignment) works through that comparison. On a put spread the date is not a trigger.

## Is the stock or the spread's mark the cleaner price alert?

For the conditions that depend on price, the stock is the cleaner thing to watch. A put spread's state is defined by where the stock sits against two strikes, so a stock-price alert just above the short strike measures the cushion directly: the number the book was sorted by in the earlier post, turned into a line.

An alert on the spread's mark, or on its profit and loss, measures something else. The mark is usually the midpoint of the spread's bid and ask, and [as the limit-order post showed](/blog/options-limit-order-not-filling), that midpoint is arithmetic on four leg quotes rather than a price anyone is trading at. Quotes widen near the open, near the close and on thin strikes, and the mark can jump when they do while the stock stands still. An alert on the mark is partly an alert on the quote.

That does not make mark alerts useless. A mark at twice the credit received says roughly what closing would cost, which is a different question from how close the stock is to the strike.

Two details decide whether a stock-price alert is useful in practice:

- **Where the line sits.** A line a dollar above a 50 short strike would fire while the short leg is still out of the money. A line at the strike fires only once it is already in the money.
- **Whether it fires once or on every crossing.** A stock hovering at the trigger can cross it several times a day. An alert on the first entry into the band carries information; one on every tick does not.

![A hypothetical XYZ path drifts from 52.00 into a band just above the 50 short strike, gaps to 49.00 on earnings, and sits in the money through expiration week, with four numbered alerts where the spread changed state.](/assets/blog/position-alerts-four-triggers.svg)

## A worked example: one hypothetical put spread and its four alerts

Suppose a trader sells one hypothetical XYZ 50/45 put credit spread with 30 days left, the stock at 52.00, for a 1.00 credit. The arithmetic is fixed at the fill: $100 received, a $5 width, so a maximum loss of $400, and a break-even of 49.00 at expiration. The earnings report is confirmed for the morning the spread has 11 days left, which is before expiration. Days left are counted in trading days.

On the day of the fill, three things can be written down without watching anything: the expiration date, the day before earnings, and the size, $400 of maximum loss against a hypothetical $20,000 account, or 2% of it, a figure chosen only to show the arithmetic and not as a size to use. The trader also sets one price condition: XYZ closing at or below 51.00, a dollar above the short strike.

Here is what happens in the invented path, and which condition fires:

| Days left | XYZ | What changed | Alert |
| --- | --- | --- | --- |
| 30 | 52.00 | Spread filled at 1.00 | None; dates go on the calendar |
| 15 | 50.90 | First close inside the 51.00 band | 1: cushion under a dollar |
| 12 | 50.95 | Back in the band; report is tomorrow | 2: earnings tomorrow |
| 11 | 49.00 | Gap through the short strike to break-even | 3: short strike in the money |
| 5 | 49.50 | Expiration week, short put still in the money | 4: expiration week, short put in the money |

Between alerts 1 and 2 the stock rose to 51.30 and fell back, crossing the trigger twice. An alert that re-armed on every crossing would have fired again on day 12, a second time in three days for the same cushion. Counted as a change of state, it fired once, and the earnings alert, not the price alert, was the one that fired for a new reason on day 12.

At expiration, if XYZ stays at 49.50, the short 50 put is in the money by 0.50 and would normally be assigned, and the long 45 put expires worthless. As [the assignment post](/blog/option-assignment-what-happens) describes, if the put is assigned, the account holds 100 shares bought at 50, the 1.00 credit stays in the account, and the long 45 put has expired worthless. Closing the spread at 0.50 instead would end the position without shares. The expiration-week alert is the notice that the first ending is possible.

## What the account itself can change, without the stock moving

Some state changes come from the broker, not the market, and are invisible on a price chart.

- **A leg is assigned early.** The short leg becomes shares and the long leg is left on its own, so the position is no longer the spread opened. [Assignment risk on a credit spread](/blog/assignment-risk-credit-spread) covers what the account shows after, and [naked call risk](/blog/naked-call-risk) covers a short call whose shares or long call leave first.
- **An order fills partly.** Four spreads of ten, or one leg without the other, leave a position that does not match the plan. [The partial fill post](/blog/partial-fill-options-spread) sets out the cases.
- **An order is still resting at the close.** A day order to close that never filled is cancelled, and the position is still open into the next session.

These are records, not prices, so the check is a reconciliation: the position the trader thinks is open against the one the broker reports.

## Frequently asked questions

**Is an alert on delta better than one on the stock price?** A short leg's delta rises as the stock nears the strike, and changes with time and volatility too, so a delta alert mixes several things. A stock-price alert measures only the distance, which is easier to read.

**Do alerts help with a gap through the short strike?** Not with the gap itself. A price alert fires only once the stock has moved, and the options cannot be traded until the open, by which point the stock is already through. A date reminder the day before the report is the one that fires before the gap.

**Do call spreads need different alerts?** The same three kinds apply with the direction reversed: the cushion is how far the stock can rise, and an ex-dividend date becomes a trigger for the short call.

## The bottom line

An alert marks something worth noticing when it marks a moment after which the position is different. On a credit spread those moments are few: the cushion running thin, the short strike going in the money, an earnings or ex-dividend date arriving, expiration week starting, and an assignment or partial fill. Most are known at the fill or are facts about the stock, not the mark, and the rest are records from the broker. In the hypothetical example, four alerts covered the life of the spread, and one of them was a date.

Related: [managing multiple option positions](/blog/managing-multiple-option-positions), the sort by days left and cushion that the conditions above are built from.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
