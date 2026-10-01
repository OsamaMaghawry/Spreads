---
title: "Iron condor explained: two credit spreads, one max loss"
slug: iron-condor-explained
excerpt: An iron condor is a put credit spread and a call credit spread on the same stock and expiration, and because the stock can finish on only one side, the maximum loss is one width less the whole credit.
meta_description: "Iron condor explained on one hypothetical chain: four legs, both break-evens, and why the max loss is one width less the whole credit, not two widths."
author: DeltaMint
category: income
series_order: 20
tags: iron condor, options credit spread, max loss, put credit spread, call credit spread
---

An **iron condor** is two credit spreads opened together on the same stock and
expiration: a put credit spread below the stock's price and a call credit
spread above it. The account is paid one net credit at the fill, and the most
it can lose is the width of one spread, times 100, less that whole credit.

This post continues the [income series](/blog/income) from the [put credit
spread](/blog/put-credit-spread-explained) and the [call credit
spread](/blog/call-credit-spread-explained). Both are built on the same
hypothetical XYZ chain from the [option chain
post](/blog/how-to-read-an-option-chain). Nothing new is needed to understand a
condor except one fact about how the two spreads' risks combine, and that fact
is the reason the structure is priced and margined the way it is.

## Key takeaways

- An iron condor is four options: a short put and a long put below the stock, a short call and a long call above it.
- The two short strikes bound the zone where the whole credit is kept; the long strikes cap the loss on each side.
- At expiration the stock can finish on only one side, so only one spread can lose; the maximum loss is one width less the total credit, not two widths.
- There are two break-evens: the short put strike less the total credit, and the short call strike plus it.
- Before expiration both spreads can be marked against the trader at once, which is a different statement from the expiration result.

## How does an iron condor work?

A condor is a pair of spreads, each of which already does one job. Each is called a **wing**, and the four legs divide up like this:

- **Put wing.** A short put at a higher strike and a long put below it. It is the put credit spread, and it loses if the stock falls.
- **Call wing.** A short call at a lower strike and a long call above it. It is the call credit spread, and it loses if the stock rises.

The credit is the sum of the two wings' credits, and it arrives at the fill.
The short strikes sit on either side of the stock's price, so the position is
built to keep that credit if the stock stays between them, and it is called
neutral for that reason: it has no opinion about direction, only a range.

Neither wing needs the other. The put spread is a complete position on its
own and so is the call spread; the condor is the two of them placed on the same
expiration so that one order carries both, which is why a broker may offer
it as a single four-leg ticket. The name comes from the payoff picture below,
a flat body with a wing on each side; "iron" marks that it mixes puts and
calls. A
[journal that lists four legs separately](/blog/options-journal-splits-spreads-into-legs)
hides what is, to the person holding it, one position.

The widths need not match, and the strikes need not be symmetric around the
stock's price. This post uses equal widths because that keeps the arithmetic
readable; a condor with a $2 put wing and a $5 call wing works the same way,
except that its maximum loss is the wider wing, $5, less the whole credit.

## Example: one hypothetical 46/48/52/54 iron condor on XYZ

Take the 30-day expiration on the hypothetical chain, with XYZ quoted at
$50.00 at 3:30 p.m. The chain rows, bid and ask; the trade uses the 48 and 46 puts and the 52 and 54 calls:

| Strike | Put bid | Put ask | Call bid | Call ask |
| --- | --- | --- | --- | --- |
| 46 | 0.71 | 0.79 | 4.65 | 4.85 |
| 48 | 1.33 | 1.43 | 3.33 | 3.43 |
| 52 | 3.40 | 3.54 | 1.42 | 1.52 |
| 54 | 4.80 | 4.98 | 0.85 | 0.93 |

A hypothetical trader sells the 48 put, buys the 46 put, sells the 52 call and buys the 54 call, as one order. For an order that fills immediately, each short leg fills at its bid and each long leg at its ask, which is what the [bid-ask post](/blog/options-bid-ask-spread)
calls the far side of the quote:

- **Put wing credit.** 1.33 (sell the 48 at the bid) − 0.79 (buy the 46 at the ask) = 0.54.
- **Call wing credit.** 1.42 (sell the 52 at the bid) − 0.93 (buy the 54 at the ask) = 0.49.
- **Total credit.** 0.54 + 0.49 = **1.03** per share, **$103** per condor.

The call wing is the call post's 52/54 spread unchanged; the put wing sits one strike lower, at 48/46, so that its short put is below the stock. Each wing is $2.00 wide. The three figures that define the position follow:

- **Maximum gain.** The **$103** credit, kept if XYZ finishes anywhere from $48.00 to $52.00, where all four options expire worthless.
- **Maximum loss.** ($2.00 − $1.03) × 100 = **$97**, reached at any close of $46.00 or lower, or $54.00 or higher.
- **Break-evens.** $48.00 − $1.03 = **$46.97** on the downside and $52.00 + $1.03 = **$53.03** on the upside.

These figures describe mechanics, not a forecast. Settling each leg against
its own strike at expiration gives five cases:

| XYZ closes at | Put wing | Call wing | Result per condor |
| --- | --- | --- | --- |
| $45.00 | −$146 (credit 54, pays 200) | +$49, expires worthless | −$97, the maximum |
| $47.00 | −$46 (credit 54, pays 100) | +$49, expires worthless | +$3 |
| $50.00 | +$54, expires worthless | +$49, expires worthless | +$103, the maximum |
| $53.00 | +$54, expires worthless | −$51 (credit 49, pays 100) | +$3 |
| $55.00 | +$54, expires worthless | −$151 (credit 49, pays 200) | −$97, the maximum |

![The payoff of a hypothetical 46/48/52/54 iron condor at expiration: a 1.03 credit kept between the 48 and 52 strikes, break-evens at 46.97 and 53.03, and a 0.97 maximum loss at and beyond the 46 and 54 strikes.](/assets/blog/iron-condor-payoff.svg)

The shape is a plateau with a slope on each side and a floor beyond each
slope. The plateau is the whole credit; the floors are the maximum loss. Nothing
in the picture is a prediction about where XYZ will finish. It is the set of
results for every place it could.

## Why is the max loss one width, not two?

Because the stock cannot finish below $48.00 and above $52.00 at the same time. At expiration
only one wing can be in the money, so only one can lose, and the other wing
expires worthless and leaves its credit in the account. The losing wing pays out at most its width, and the credit received on both wings offsets part of that.

![The two wings of the hypothetical condor drawn separately and added: the put spread alone loses 1.46 at its floor, the call spread alone loses 1.51 at its floor, and the condor, their sum, loses 0.97.](/assets/blog/iron-condor-two-wings.svg)

Compare the figures for the same $2 wings, per share:

| Position | Credit | Worst case | Where it happens |
| --- | --- | --- | --- |
| 48/46 put spread alone | 0.54 | −1.46 | At or below $46.00 |
| 52/54 call spread alone | 0.49 | −1.51 | At or above $54.00 |
| The iron condor | 1.03 | −0.97 | At or below $46.00, or at or above $54.00 |

The condor's worst case is smaller than either spread's alone. The
reason is not that anything was removed: at $45.00 the put wing still pays
out its full $200, but the call wing's $49 credit was received too, and no
call wing loss can occur at the same time. Holding the two spreads separately
has the same expiration payoff as one condor, as the sum of the lines in the picture
shows. What the order ticket changes is the price you are filled at and,
at many brokers, the collateral, which is the next point.

The same arithmetic is why buying power for a condor is usually the width less
the total credit rather than two widths: the broker is reserving against the
one wing that can lose. Treat that as typical practice, not a rule. Brokers
set their own requirements, and the [buying power
post](/blog/options-buying-power-requirement) covers how to read them.

## Can both sides of an iron condor lose before expiration?

The expiration result is the easy half. A condor spends most of its life
before expiration, where it is valued at the mark, the net of its four legs' midpoints, and the two wings can both look bad at the same time.

- **One wing gets worse as the other gets better.** If XYZ drifts toward $48, the put wing's mark rises against the trader while the call wing's mark falls, and the net is smaller than the put wing's move alone.
- **A large move in either direction after the fill is the risk.** Where the stock finishes is what turns an unrealized loss into a real one: past a short strike the wing pays out, and past a break-even ($46.97 or $53.03) the condor loses money.
- **A jump in implied volatility hurts both wings together.** Both short options are worth more when [implied volatility](/blog/implied-volatility-options-explained) rises, so the position's mark can worsen with the stock not moving at all.
- **Time helps the position mostly while the stock stays inside the range.** The [theta post](/blog/theta-decay-explained) explains why the short legs lose value each day, and the long legs lose some too.

The [max loss post](/blog/credit-spread-max-loss) is the place to start on what a
mark does and does not tell you; a condor's mark is simply two of them
added. At expiration, the most the example can lose is $97 whether XYZ sits at $50.00 or $47.50 now; what moves is how close that figure is to being reached.

## Assignment: only one side at expiration, either side before it

Each short leg carries the same assignment risk it would carry in its own
spread. The [assignment post](/blog/option-assignment-what-happens) and the
[early exercise post](/blog/early-exercise-options) describe the mechanics;
three points matter for a condor.

- **At expiration.** Only one short leg can finish in the money. If XYZ closes at $47.00, the 48 put is assigned and the account is long 100 shares at $48.00 with the 46 put expired, which is the case the [put spread post](/blog/put-credit-spread-explained) takes apart. At $53.00 the 52 call is assigned and, if the account holds no shares, it is short 100 shares.
- **Before expiration.** Either short leg can be assigned early, and early assignment on a call is most likely around a dividend. The long leg in the same wing still caps the price risk, but the shares, any dividend owed, and the margin they bring are new facts in the account.
- **Between the strikes.** A close between a short strike and its long strike is the case neither the credit nor the width describes. See [what happens at expiration](/blog/what-happens-options-expiration) for the one-cent exercise-by-exception default, which a broker may set higher. After an expiration assignment between the strikes, the long leg has expired and nothing caps the shares.

## Frequently asked questions

- **What is an iron condor?** A put credit spread and a call credit spread on the same stock and expiration, opened for one net credit. The short strikes sit on either side of the stock's price.
- **What is the max loss on an iron condor?** The width of one wing, times 100, less the total credit. On the 46/48/52/54 condor at 1.03, that is ($2.00 − $1.03) × 100 = $97, before any dividend owed or borrow cost on shares from an early assignment. With unequal wings, it is the wider wing less the total credit.
- **What are the break-evens?** The short put strike less the total credit, and the short call strike plus it: $46.97 and $53.03 on the example.
- **Can an iron condor lose on both sides?** Not at expiration, because the stock finishes in one place. Before expiration the marks of both wings can be unfavorable together, for instance when implied volatility rises.
- **Is an iron condor the same as two spreads?** At expiration it pays what the two spreads pay together. The credit, the fill, and the broker's collateral treatment are what a single ticket changes.

## The bottom line

An iron condor is a put credit spread and a call credit spread on one
expiration. The credit is the sum of the two, the plateau is the range between
the short strikes, and the maximum loss is one width less the whole credit,
because the stock finishes on only one side.

The two-sided picture is simple at expiration and less so before it. The
structure is one position carrying two ways to be wrong, a distinction the
[income series](/blog/income) returns to as it moves from structures to widths,
strikes and days to expiration.

All figures on this page are hypothetical and are there to show the
mechanics. This post is educational and is not investment advice.
