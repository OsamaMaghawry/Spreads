---
title: "What happens at options expiration: a cent either side"
slug: what-happens-options-expiration
excerpt: At expiration every open option is settled against one closing price, and a single cent on either side of the strike decides whether it becomes shares or disappears.
meta_description: What happens at options expiration: a cent in the money is exercised automatically, a cent out expires. The cutoff, pin risk, and each spread leg on its own.
author: DeltaMint
published_at: 2026-09-23T10:00:00+00:00
category: foundations
series_order: 12
tags: expiration, exercise by exception, pin risk, assignment, foundations
---

**Options expiration** is the point at which a listed contract stops trading
and every open position in it is settled one of two ways: exercised into
shares, or removed from the account as worthless. For US stock options the
dividing line is the closing price on the [expiration
date](/blog/option-strike-price-expiration-premium), and it is drawn one cent
wide.

The [previous post](/blog/early-exercise-options) covered the rare decision
to exercise before that day. This one covers the day itself, when nobody has
to decide anything for the settlement to happen. A contract finishing in the
money is exercised by default, and one finishing out of it simply stops
existing.

## Key takeaways

- A stock option that closes in the money by $0.01 or more is exercised automatically unless its holder instructs otherwise.
- An option at or out of the money expires, unless its holder asks for exercise.
- Instructions are accepted until 5:30 p.m. Eastern at the latest; a broker's own cutoff can be earlier.
- Each leg of a spread is settled against its own strike, so one can be assigned while the other expires.
- A close at a short strike is pin risk: whether that leg is assigned is known only afterwards.

## A cent in the money means exercise, unless the holder says otherwise

The Options Clearing Corporation (OCC), the clearing house behind every listed
US equity option, runs a procedure called **exercise by exception** at each
expiration. Any expiring equity option in the money by at least $0.01 at the
close is exercised automatically. The holder does not have to ask for it.
A brokerage can apply its own threshold on top of the OCC's, and some do, so
a contract a cent in the money is not exercised at every firm.

For a call, in the money means the stock closed above the strike. For a put,
it means the stock closed below it. Since exercising is the holder's side and
[assignment](/blog/option-assignment-what-happens) is the seller's, the same
cent that exercises a long option assigns a short one.

![The stock's closing price one cent either side of a 50 put's strike: 49.99 is exercised, 50.01 expires, and a close at exactly 50.00 is the pin.](/assets/blog/expiration-cent-either-side.svg)

The procedure is a default, not a verdict. What happens to each contract,
depending on where it closes, looks like this:

- **In the money by a cent or more.** Exercised automatically; 100 shares per contract change hands at the strike.
- **Exactly at the strike.** Not exercised automatically, but the holder can still ask.
- **Out of the money.** Expires worthless unless the holder asks for exercise anyway.

Brokers can add their own layer on top of the OCC's. Some state in their
options disclosures that they may close, or decline to exercise, expiring
positions an account could not support. The OCC rule is the default, and the
agreement a customer signed with their broker sets the rest.

## Can you stop an in-the-money option from being exercised?

The automatic result can be reversed by filing a **contrary exercise
instruction**. For a contract in the money, the version people mean is a
do-not-exercise (DNE) instruction: it tells the broker to let the option
expire even though it finished a cent or more in the money.

A holder close to the strike has a few reasons to file one:

- **The account cannot pay.** An exercised 50 call means $5,000 of stock per contract.
- **The holder does not want the stock.** Shares can move over a weekend with no floor.
- **A cent is worth less than the fees.** Exercise can carry a charge larger than one cent per share.
- **The stock moved after the close.** A holder can decide with the after-hours price in view.

That last reason is why the deadline matters. FINRA rules bar brokers from
accepting exercise instructions on expiring options after 5:30 p.m. Eastern,
an hour and a half after the regular close. A broker may set an earlier
cutoff for its own customers, and many do.

So a retail account holder is working against the broker's clock, not the
5:30 rule's. The hour a broker's website or disclosure names is the one that
governs, and it can come well before 5:30.

## What happens to a spread at expiration: each leg on its own

A spread is not a single listed product. It is two ordinary contracts traded
in one order, and at expiration each is checked against its own strike, with
no reference to the other. Brokers often [report the legs
separately](/blog/options-journal-splits-spreads-into-legs) for the same
reason.

![One hypothetical close at 49.99 splits a 50/48 put spread: the short 50 put is assigned while the long 48 put expires.](/assets/blog/expiration-legs-split.svg)

For a defined-risk vertical, that gives three outcomes at the close:

- **Both legs out of the money.** Both expire and the collateral is released.
- **Both legs in the money.** The short is assigned, the long exercised, and the two settle against each other for a net cash debit equal to the width.
- **The close lands between the strikes.** The short leg is assigned, the long leg expires, and shares are left with no protection.

The third case is the one people do not expect from a position described as
defined-risk. The [maximum loss on a spread](/blog/credit-spread-max-loss) is
measured at expiration with both legs working together. When the close falls
between the strikes, only one of them does anything, and what is left is a
stock position.

## What happens if the stock closes exactly at the strike?

**Pin risk** is the uncertainty that comes from a stock closing at or within
pennies of a short option's strike. The automatic rule gives no clear answer
there, and the holder on the other side can still decide either way until
the cutoff.

A short 50 put with the stock closing at exactly $50.00 is not exercised
automatically. But if the stock trades down to $49.60 after the close, a
holder can file an instruction to exercise, and a seller somewhere is
assigned. If the stock drifts up instead, the holder can let it lapse. The
seller has no way to trade the option after 4 p.m. and no way to see which
choice was made.

Pin risk has three parts, and each one follows from the rules above:

- **Nothing can be bought back.** The contract stopped trading at the close.
- **The long leg rarely helps.** It usually sits out of the money and expires unless you file to exercise it before the cutoff, which only pays off if the stock trades past that strike after hours.
- **The answer arrives later.** Assignment is allocated overnight, with a weekend attached.

## Example: one hypothetical spread and five closing prices

Take a hypothetical put credit spread on the 50-strike series this series has
been using: short one 50 put, long one 48 put, same expiration. The spread is
$2 wide, so its maximum loss at expiration is $200 per spread less the credit
received. The credit does not change anything below, so it is left out.

Here is what each leg does at five closing prices, assuming nobody files a
contrary instruction:

| Close | Short 50 put | Long 48 put | Monday's account |
| --- | --- | --- | --- |
| $51.00 | Expires | Expires | Collateral released |
| $50.01 | Out by a cent, expires | Expires | Same, unless exercised after the close |
| $50.00 | Pinned | Expires | Unknown until a notice arrives, or not |
| $49.99 | In by a cent, assigned | Out by $1.99, expires | 100 shares bought at $50 |
| $47.50 | Assigned | In by $0.50, exercised | No shares, $200 net debit |

The last two rows are worth checking against each other. At $47.50, both legs
work: the account buys 100 shares at $50 and sells them at $48, and the net
debit is $200, the width of the spread; net of the credit received, that is
the defined maximum loss.

At $49.99 the stock is higher, yet the account ends up holding more exposure.
It owns 100 shares that cost $5,000, with no 48 put under them, because that
put finished out of the money and expired. The figures here are hypothetical
and show the mechanics only.

## Monday's account shows what Friday decided

Everything above settles in the same overnight process [the assignment
post](/blog/option-assignment-what-happens) walked through line by line. On
expiration Friday it just happens to every open contract at once, with a
weekend before the next session.

- **Expired rows disappear.** No closing trade, no fill price.
- **Exercised and assigned rows turn into stock.** Cash moves by the strike times 100.
- **Collateral is released or replaced.** Shares bring their own requirement.
- **The confirmation is dated Friday.** Even when the notice appears on Monday.

For a single position this is easy to follow. For a book with a dozen spreads
expiring on the same Friday, each leg of each one has been judged separately
against its own strike, and the account on Monday is the sum of those
separate results.

## Frequently asked questions

- **What happens if I don't sell my option before expiration?** A cent in the money is exercised; anything else expires.
- **Can I stop an in-the-money option being exercised?** Yes, with a do-not-exercise instruction before the broker's cutoff.
- **Does a spread settle as one position?** No. Each leg is settled against its own strike.
- **Do index options work the same way?** Most broad index options are cash-settled, so they pay cash rather than deliver shares; an ETF option on the same index, like SPY, still delivers shares like a stock option does.

## The bottom line

Expiration settles every open US stock option against one closing price, and
the line is a single cent: in the money by $0.01 is exercised automatically, and
anything else expires unless the holder says otherwise. The holder's window to
change that runs to the broker's cutoff, never later than 5:30 p.m. Eastern.

Spreads do not get special treatment. Each leg is judged on its own, which is
why a close between the strikes or at the short strike leaves an account
holding something the spread was never meant to hold. The [foundations
series](/blog/foundations) continues with the buying power and collateral
behind these positions.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
