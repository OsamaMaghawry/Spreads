---
title: "Married put tax: where the premium goes on a hedged lot"
slug: married-put-tax
excerpt: A married put is a put bought on the same day as the shares it hedges, and US tax rules treat that pairing differently from a put added later; here is what changes, in numbers.
search_title: "Married put tax treatment: cost basis and holding period"
meta_description: "A married put's premium is generally added to the shares' cost basis, not booked as a loss when the put expires. Worked numbers and the holding period."
author: Osama Safwat Maghawry
category: hedging
series_order: 40
tags: married put, protective put, tax, cost basis, hedging
---

A **married put** is a [put option](/blog/call-vs-put-option-explained) bought on the same day as the 100 shares it protects, with the pair treated as one position. The name matters mainly for tax: in the United States, a put bought that way is generally described as having its premium folded into the shares' cost basis, instead of being recorded as a separate option that can expire for a loss.

This post closes the [hedging series](/blog/hedging) and uses the same structure as the [protective put post](/blog/protective-put-explained): a floor at the strike, paid for with a premium. It shows how the same premium can be recorded in two ways, with plainly hypothetical numbers. It describes how records and rules are generally set out. It is not tax advice, and what applies to any one person is a question for a tax professional.

## Key takeaways

- **A married put is a timing label.** Shares and put are bought on the same day, and the put is identified as a hedge for those shares. The payoff is the same as any [protective put](/blog/protective-put-explained).
- **The premium goes to a different place.** For a married put it is generally described as added to the shares' cost. For a put bought later, it is generally a separate option with its own gain or loss.
- **The total can match while the lines differ.** Which year a loss shows in, and on which line, can change even when the two-leg total does not.
- **The holding period is a separate question.** A put added to shares already held can raise holding-period questions, and whether other rules still reach a same-day pair is for a tax professional.
- **Rules differ by country and by person.** Everything below is a US-style framing, for orientation only.

## What is a married put? A protective put with a date attached

The structure is identical: 100 shares and one long put on the same stock. What makes it "married" is how the two were acquired:

- **Same day.** The shares and the put are bought on the same day, usually in one sitting.
- **Identified.** The shares are identified in the records as the ones to deliver if the put is exercised, so the record shows they belong together. The rules set their own timing for that identification, which is why the dates matter.
- **Not added afterwards.** A put bought on a later day against shares already held does not meet the definition, even though the payoff diagram looks the same.

The [protective put post](/blog/protective-put-explained) is a good example of a lot that does not qualify. Its trader already held shares bought at $48.00, then added a put. The floor, break-even and maximum loss work out the same way either way. Only the record of how the pair came to be differs, and that record is what the tax questions turn on.

## Married put cost basis: where does the premium go?

Take a hypothetical lot. A trader buys 100 shares of XYZ at $50.00 and, in the same sitting, buys one 46 put at $0.79, paying $5,000 for the shares and $79 for the put. The quotes are model estimates, not market data.

The economic position does not depend on the record. The break-even is $50.00 + $0.79 = $50.79 a share. The maximum loss by expiration is ($50.00 − $46.00) + $0.79 = $4.79 a share, or $479 for the lot.

What differs is how the $79 is carried. There are two framings:

- **Two separate positions.** The shares carry a $5,000 cost. The put is its own option with a $79 cost, which ends in a gain or loss of its own when it expires, is sold or is exercised.
- **One married position.** The put's $79 is generally described as added to the shares' cost if the put expires unexercised, making it $5,079, or $50.79 a share. No separate option result is recorded for the put in that case.

![The same $79 put premium is carried as a separate option cost on the left and added to the shares' cost on the right, and in both cases the position's break-even is $50.79 a share.](/assets/blog/married-put-premium-two-ledgers.svg)

The figure shows why this is a bookkeeping question rather than a market one. The market does not know how the premium is recorded. Only the ledger does.

## What happens when a married put expires?

Work the expiry through for both framings. Each column assumes the put [expires](/blog/what-happens-options-expiration), or is exercised, and the shares leave the account the same day. The figures are mechanics, not a forecast.

| At expiration | XYZ closes at $51.00, put expires, shares sold at $51.00 | XYZ closes at $43.00, put exercised, shares sold at $46.00 |
| --- | --- | --- |
| Separate positions: put line | $79 loss on the put | Put cost reduces the sale proceeds: $46.00 − $0.79 = $45.21 a share |
| Separate positions: shares line | $1.00 a share gain, $100 | $50.00 − $45.21 = $4.79 a share loss, $479 |
| Married put: shares line | $51.00 − $50.79 = $0.21 a share gain, $21 | Put exercised, so its cost folds into proceeds: $45.21 − $50.00 = $4.79 a share loss, $479 |
| Total, either framing | $21 gain | $479 loss |

Both framings land on the same total in both cases, as they must, since the same cash moved. In the second case the lines do not even differ: an exercised put is generally described as folding its cost into the shares' sale either way.

The first case is where the lines diverge. Under the separate framing, the $79 expires as its own loss and the shares show their $100 gain. Under the married framing there is one $21 gain and no put line at all. If the shares are kept rather than sold, the gap widens:

- **Separate positions.** The $79 put loss may be recognized when the put expires, though straddle rules can defer it while the shares are held at a gain, and the shares' result waits for a sale.
- **Married put.** If the put expires unexercised, the $79 sits inside the shares' cost, so nothing is recorded until the shares are sold.

Which year each amount lands in, and which line it appears on, is exactly what a tax professional is for. The post cannot say which framing applies to a given person, and the numbers are there to show that the question is real.

## Does a married put affect the holding period?

A second rule has nothing to do with the premium. In the US, buying certain puts against shares already held can affect how long the shares are treated as held, which matters for whether a later gain is short-term or long-term. The married put definition is generally described as an exception to that short-sale rule. Whether other rules, such as the straddle rules, still affect the holding period of a same-day pair is a question for a tax professional.

Compare three ways the same hedge might have been assembled:

| How the lot was built | Same-day pairing? | What a tax professional will want to know |
| --- | --- | --- |
| Shares and put bought together, put identified | Yes | That the shares were identified in the records as the ones to deliver on exercise, and the premium treatment |
| Shares held for months, put added later | No | Whether the put affects the shares' holding period or gain treatment |
| Put bought first, shares bought later | No | Which purchase date the rules look at |

Nothing in this table is a recommendation to assemble the lot any particular way. It shows that the date a position was built is a fact worth keeping, and the second row is a common situation, since shares are often owned before a put is considered.

## What the account shows, and what it cannot decide

An account shows two lines: 100 shares at a cost, and a put at a premium. It does not say whether a person intended them as a married pair, and it cannot decide a tax treatment. A tax professional will typically ask for three things (for a sale of the put before expiry, the treatment is a further question for them):

- **The dates.** The day each leg was bought, down to the fill, because the same-day test needs it.
- **The identification.** Any note, made when the put was bought, that it hedges those shares.
- **The premium as paid.** The fill price, not the quote. The $79 above is a stand-in for a fill, taken at the 0.79 ask in the protective put post.

The after-the-fill view matters here too. The day the put expires, the premium either leaves as a loss on a line of its own or stays inside the shares' cost, and the two accounts look different the next morning even though the same cash moved. Whatever holds the records, a tax professional will want the legs, dates and fills together. [Return on risk](/blog/return-on-risk-vs-return-on-capital) is a separate question, measured against what the whole lot could lose, premium included.

## Frequently asked questions

- **What is a married put?** A put bought on the same day as the shares it hedges, treated as one position. The payoff is a [protective put](/blog/protective-put-explained).
- **Is a married put different from a protective put?** Not in the payoff. The name describes how the pair was acquired, which is what tax rules look at.
- **Does the premium change the break-even?** No. It is $50.79 a share in the example whichever way the premium is recorded.
- **Does a put on shares I already own count as a married put?** Generally not, since the definition looks at a same-day purchase. Whether that matters for you is a question for a tax professional.
- **Does the broker's statement decide the treatment?** No. It reports what happened; how it is treated on a return depends on the rules and the person.

## The bottom line

A married put has the same floor, break-even and maximum loss as any protective put. What the label changes is the record: the premium is generally described as part of the shares' cost, not a separate option result, and the holding-period question is handled differently from a put added later.

The market sees none of this. The totals match; the lines, the timing and the dates can differ, so the dates and the premium as paid are the facts a tax professional will ask for. All figures on this page are hypothetical and show mechanics only. This post is educational, is not tax advice and is not investment advice.
