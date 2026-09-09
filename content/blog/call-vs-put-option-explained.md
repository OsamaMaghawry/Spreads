---
title: Calls and puts, from both sides of the contract
slug: call-vs-put-option-explained
excerpt: A call is the right to buy and a put is the right to sell, but every contract also has a seller on the other side carrying the matching obligation.
meta_description: A call is the right to buy, a put the right to sell — and each one has a seller taking on the opposite obligation. Both sides, explained plainly.
author: DeltaMint
category: foundations
series_order: 2
tags: calls, puts, option buyer, option seller, foundations
---

Every explanation of options opens with the same four words: a call is the
right to buy, a put is the right to sell. That is accurate, and it stops one
sentence short of complete — a right needs a counterparty willing to carry
the matching obligation, and most explanations never name who that is. "Buy"
and "sell" describe what the contract is about. They say nothing about which
side of it you hold, and the two sides are not mirror images of each other.

This is the second post in the [foundations series](/blog/foundations). It
assumes [what an options contract actually
is](/blog/what-is-an-options-contract) — the six fields the exchange fixes,
the 100-share multiplier — and takes up the distinction that changes the
arithmetic from here on: call or put, and bought or sold. Cross those two
questions and four positions exist. Only two of them behave the way
"bullish, buy a call" makes it sound.

## A call is the right to buy; a put is the right to sell — and both need a seller

A listed call gives its holder the right to buy 100 shares of the underlying
at the strike, on or before expiration. A listed put gives its holder the
right to sell 100 shares at the strike, on the same terms. Both rights are
one-directional: buy for a call, sell for a put, and never the reverse.

Neither right exists without someone else agreeing to the opposite
obligation. The seller of a call is obligated to deliver 100 shares at the
strike if the holder exercises; the seller of a put is obligated to buy 100
shares at the strike if the holder exercises. The clearing house sits between
the two once the trade is done, so a seller never has to track down the
specific buyer who is now relying on them — but the obligation itself is
real, and it belongs to whoever sold, whichever way the market moves
afterward.

That makes four positions, not two:

- **Long call.** You hold the right to buy. You pay for it.
- **Short call.** You carry the obligation to sell if called on. You are paid for it.
- **Long put.** You hold the right to sell. You pay for it.
- **Short put.** You carry the obligation to buy if called on. You are paid for it.

Most casual explanations describe only the two long positions — buy a call,
buy a put — and leave the two short ones as an afterthought, if they mention
them at all. They are not an afterthought in an account: every option anyone
owns was sold by someone, and every option anyone sold is owned by someone.

## Buying either side costs once, at the fill, and that is the entire risk

Buy a call or buy a put and the mechanics are identical regardless of which
one it is. Cash leaves the account at the fill — the premium, paid in full —
and a position with a positive quantity appears. Nothing further is ever
asked of you: an option you own can only expire, get exercised at your
choice, or get sold, and none of those creates a bill beyond what you already
paid.

That is why a long call and a long put have the same risk shape even though
they profit in opposite directions. A long call gains as the underlying
rises past the strike plus the premium paid; a long put gains as the
underlying falls below the strike minus the premium paid. In both cases, the
most either position can lose is the premium — no matter how far the
underlying moves the wrong way.

The one asymmetry between the two sits on the upside, not the risk side. A
long call's theoretical gain has no ceiling, because a stock's price has no
ceiling. A long put's gain is large but bounded, because a stock's price
cannot fall below zero — the most a put can ever be worth is the strike
itself, on 100 shares.

## Selling either side means the obligation is yours, not the choice

Sell a call or sell a put and the cash direction reverses: the premium
arrives at the fill instead of leaving, and the position that appears has a
negative quantity. What also arrives is something the buyer never carries —
a decision that belongs to someone else. The holder chooses whether and when
to exercise; the seller finds out afterward, on the holder's schedule, not
their own.

The two short positions are not symmetric with each other:

- **Short put.** Bounded by zero. The underlying cannot fall below zero, so
  the worst case is fixed: strike times 100, minus the credit received.
- **Short call, uncovered.** Not bounded at all. The underlying has no
  ceiling, so every dollar it rises past the strike is a dollar the seller
  owes, with no fixed edge to the loss.

That gap is why an uncovered short call carries a warning most brokers put
in front of the order, and most sellers avoid the position entirely.

Collateral follows the same asymmetry. A cash-secured put holds the strike's
worth of cash, enough to buy the shares if assigned. A covered call holds the
shares themselves, ready to deliver. An uncovered call holds a margin
requirement calculated against a risk with no fixed edge — larger, and
recalculated as the market moves. What gets held for which structure is its
own subject; the point here is only that something is always held, whether
or not the position looks quiet.

## "In the money" points toward the strike from opposite directions

For a call, "in the money" means the underlying is trading above the strike
— the right to buy at a lower price than the market is worth something. For
a put, "in the money" means the underlying is trading below the strike — the
right to sell at a higher price than the market is worth something. Same
word, same strike, opposite side of it.

Take a hypothetical: XYZ trading at 52, a 50 strike listed both ways. The 50
call is in the money by 2 — the intrinsic value a holder could realize by
exercising and immediately selling at the market. The 50 put, same strike,
same stock price, is out of the money: nobody would exercise the right to
sell at 50 what the market already pays 52 for. Move XYZ down to 48 instead,
and the two positions swap places — the call goes out of the money, the put
goes in.

![A hypothetical strike at 50 marked against the underlying price: the call's in-the-money region sits above the strike, the put's sits below it, and the two swap which one is "in" as the price crosses.](/assets/blog/call-put-moneyness-direction.svg)

Nothing about which side is "in the money" says anything about who holds it.
A call that is deep in the money is valuable to its buyer and costly, if
assigned, to its seller — the direction of the strike relationship is fixed
by call-vs-put, and the direction of the consequence is fixed separately by
long-vs-short.

## Four positions on the same underlying, four different rows in an account

Put all four together and the account view is four rows that look almost
identical except for a sign and a number — but that plus/minus sign and that
number describe entirely different exposures.

| Position | Cash at the fill | Quantity | Maximum loss | Who decides |
| --- | --- | --- | --- | --- |
| Long call | Premium paid | +1 | Premium paid | You |
| Short call, uncovered | Premium received | −1 | Unbounded | The holder |
| Long put | Premium paid | +1 | Premium paid | You |
| Short put, cash-secured | Premium received | −1 | (Strike × 100) − premium | The holder |

![Four positions on the same hypothetical strike: two rights paid for once with quantity plus one, two obligations paid to the seller with quantity minus one, and one of the four with no ceiling on what it can cost.](/assets/blog/four-option-positions.svg)

Take one hypothetical set of numbers through all four. XYZ, 50 strike, same
expiration, call premium 1.20, put premium 0.90 — both invented for the
arithmetic, not quoted from any real chain. Four separate contracts, four
separate fills:

- **Long the call for 1.20.** $120 leaves the account. At or below 50, the
  right expires worthless and the $120 is the whole cost. Above 50, the
  right is worth the difference between the price and 50, times 100.
- **Short the call for 1.20, uncovered.** $120 arrives. Below 50, nothing is
  owed back. Above 50, the position owes the difference between the price
  and 50, times 100 — with no cap on how high that difference can go.
- **Long the put for 0.90.** $90 leaves the account. At or above 50, the
  right expires worthless. Below 50, the right is worth the difference
  between 50 and the price, times 100.
- **Short the put for 0.90, cash-secured.** $90 arrives, and $5,000 of cash
  sits reserved against the obligation to buy at 50. At or above 50, the
  obligation lapses and the reservation is released. Below 50, the position
  is on the hook for the difference between 50 and the price, times 100,
  bounded by the price reaching zero.

Same underlying, same strike, same expiration, four contracts that cost or
paid four different amounts and expose the account to four different
things.

## "Bullish" and "bearish" describe direction, not what each side actually risks

The common shorthand — buy a call if you're bullish, buy a put if you're
bearish — describes two of the four positions and quietly ignores the other
two. Selling a put is also a bullish-leaning position: it gains if the
underlying holds flat or rises, and loses if the underlying falls hard
enough. Selling a call leans the opposite way. Direction alone does not say
whether a position is a right you hold or an obligation someone else can
call on you to meet.

That distinction is worth carrying forward past this post. A cash-secured
put and a covered call — both short positions, both income structures
covered later in this series — inherit everything here: the credit arrives
first, the obligation is real, and the seller finds out what happens on the
holder's schedule rather than their own. Nothing about "bullish" or
"bearish" changes any of that.

What every one of the four positions shares is the account view from the
first post in this series: one line, a sign, and a mark that is an estimate
until the position closes. Which of the four rows you are looking at
determines everything else — what it can cost, who decides, and which
direction has to move for it to matter.

Read the rest of the [foundations series](/blog/foundations) for the pieces
this one assumes and the ones still ahead — strike, expiry and premium next,
then the Greeks that describe how each of these four positions actually
moves.

This post is educational and is not investment advice.
