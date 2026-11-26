---
title: "Options approval levels: which tier each trade needs, and why"
slug: options-approval-levels
excerpt: An options approval level is the set of option trades a broker allows in one account, and the tiers rise as less of each position's worst case is already covered.
meta_description: "Options approval levels: why spreads read as level 2, 3 or 4 by broker, and five positions on one chain placed by what covers the worst case, not by max loss."
search_title: "Options Approval Levels: What Level Do You Need for Spreads?"
author: Osama Safwat Maghawry
category: foundations
series_order: 68
tags: options approval level, options trading level, credit spread, margin account, naked call
---

An **options approval level** is the set of option trades a broker permits in one account, granted after it reviews the account holder's options application. Brokers commonly arrange these permissions in tiers, each adding positions with less of their worst case already covered, and spreads commonly sit at or one tier below uncovered options. The tier decides which orders the account will accept; it says nothing about whether any trade is a good idea.

This [foundations](/blog/foundations) post places five positions from one hypothetical XYZ chain on a common ladder of tiers, including the [covered call](/blog/covered-call-explained), [cash-secured put](/blog/cash-secured-put-explained) and [put credit spread](/blog/put-credit-spread-explained) already priced on it.

Key Takeaways:

- **Approval is per account.** Two accounts held by one person can carry different levels.
- **Tiers follow the cover.** Shares or cash, then the premium paid, then a long leg, then nothing.
- **The numbers are not shared.** One firm's level 2 can include spreads; another's stops at long options.
- **Approval refuses; it does not cap.** It acts at order entry and limits nothing about an accepted position's loss.

## Approval is granted per account, from the options application

In the United States, a broker that lets a customer trade listed options does so under FINRA Rule 2360, which requires the firm to use due diligence to learn the essential facts about the customer before approving the account. A designated principal at the firm approves it in writing, and the tier granted is the firm's decision about what that account may open.

The options application is where those facts come from. Its questions commonly cover:

- **Objectives.** Income, growth, speculation or preservation of capital.
- **Experience.** Years trading stocks and options, and how often.
- **Finances.** Income, net worth and liquid net worth, usually as ranges.
- **The strategies asked for.** Many applications ask which trades the customer intends to place.

At or before approval, the broker must also deliver the Options Disclosure Document, "Characteristics and Risks of Standardized Options", published by the Options Clearing Corporation, which sets out how listed options work and what their risks are.

Approval attaches to the account, not the person, and a broker can review an account and change its level later, up or down, under its own policies.

## Why the tiers rise with what covers the worst case

Brokers number their tiers differently, but the order they put strategies in follows a common logic: what in the account stands behind the position if the market moves as far as possible against it. The less of that worst case the account already holds, the higher the tier.

![A common ladder of options approval tiers rises from positions covered by shares or cash, through long options covered by the premium paid, to spreads covered by a long leg, and ends at naked calls covered by nothing.](/assets/blog/approval-levels-ladder.svg)

The four rungs are covered in four different ways:

- **Shares or cash.** The covered call's shares or the cash-secured put's cash already pay for the obligation.
- **The premium paid.** A long option can lose only what was paid for it at the fill.
- **A long leg.** A bought option caps the short one at the width less the credit, while both stay paired.
- **Nothing.** A naked call's loss past the strike plus the premium has no cap.

Where firms differ is mostly in how the rungs are grouped and numbered. Some put covered calls alone at the bottom and cash-secured puts beside long options; others combine them. Spreads appear as level 2, 3 or 4, some firms place credit spreads a level above debit spreads, and uncovered puts sometimes share the top rung with uncovered calls and sometimes sit just below it.

## Worked example: five XYZ positions and the tier each commonly needs

The hypothetical XYZ trades at $50.00, with options 30 days from expiration. Sales fill at the bid, purchases at the ask, and the covered call's shares cost $50.00. These figures describe mechanics on an invented chain, not results.

| Position on XYZ | Opened at | What covers the worst case | Most it can lose | Tier commonly needed |
| --- | --- | --- | --- | --- |
| Covered call: 100 shares, short 52 call | $142 credit | The shares | $4,858 | Lowest |
| Long 50 call | $234 debit | Premium paid | $234 | Low |
| Cash-secured 48 put | $133 credit | $4,800 cash | $4,667 | Lowest or low |
| 50/48 put credit spread | $81 credit | Long 48 put | $119 | Spread, with margin |
| Naked 52 call | $142 credit | Nothing | No cap past $53.42 | Highest, with margin |

The covered call's shares lose $5,000 if XYZ falls to zero, less the $142 premium, leaving $4,858. The cash-secured put reserves 48 × 100 = $4,800, and many brokers let the $133 credit offset part of that; assigned with XYZ at zero, the shares bought for $4,800 are worth nothing, and the premium brings the loss to $4,667.

The spread sells the 50 put at 2.24 and buys the 48 put at 1.43, for 0.81. The most it can lose is ($2.00 - $0.81) × 100 = $119, and the broker commonly holds the $200 width against it, partly offset by the $81 received. The naked 52 call keeps its $142 at any close up to 52, breaks even at $53.42, and loses $100 for each dollar above that, with no ceiling.

The tiers do not rank positions by how much they can lose: the cash-secured put can lose about 39 times what the spread can, and commonly sits lower. What the tier tracks is whether the worst case is already held as shares or cash, or depends on a margin pairing, or on nothing.

The same short option can sit on three different rungs. Sold at its 2.24 bid, the 50 put brings in $224 every time; what decides its tier is what stands behind it.

![The same hypothetical short 50 put on XYZ needs a different approval tier depending on what stands behind it: $5,000 in cash makes it cash-secured, a long 48 put makes it a spread, and nothing makes it uncovered.](/assets/blog/approval-levels-same-put-three-tiers.svg)

With nothing behind it, it is an uncovered put, whose requirement is a formula well below the $5,000 that assignment could cost, which is why that case commonly sits at or near the top. The [buying power post](/blog/options-buying-power-requirement) works through what each version holds.

## Approval refuses orders; it does not cap a loss

Approval acts once, at order entry: an order that needs a higher tier than the account holds is rejected before it reaches the market. Nothing about the approval watches the position afterwards.

That makes approval narrower than it sounds:

- **It is not a recommendation.** Spread approval means the broker accepts spread orders, not that any spread suits the account.
- **It is not a measure of skill.** It reflects the application and the broker's policy.
- **It is not a cap on loss.** An account approved for uncovered calls can open one that loses without limit; the [naked call risk post](/blog/naked-call-risk) shows ordinary trades that get there.

Recognition as a spread has conditions of its own. Brokers commonly treat a spread as defined risk only when both legs sit in the same account and the short leg expires no later than the long one. A calendar or diagonal whose short leg expires after the long is treated as uncovered for that short leg, and commonly needs the uncovered tier.

Retirement accounts commonly have narrower limits, because borrowing is not allowed in them. Covered calls, cash-secured puts and long options are usually available, some brokers also allow defined-risk spreads, and uncovered options are generally not allowed. Each broker sets its own rules.

DeltaMint sends the orders the trader submits to the trader's own brokerage account, so the broker's approval decides what that account will accept; DeltaMint does not grant, check or change it.

## Frequently asked questions

**What options level do I need for credit spreads?** The spread tier, which many brokers place one rung below uncovered options and which commonly requires a margin account. Whether it is called level 2, 3 or 4 depends on the broker, so the strategies listed on the level are what answer the question.

**Can I trade spreads in a cash account or IRA?** At many brokers, not in a cash account, and only under narrower rules in a retirement account, where some allow defined-risk spreads with their maximum loss held in cash.

**Why was my options order rejected?** A common reason is that the order needs a tier the account does not hold: a spread in an account approved only for covered positions, or selling a long leg that would leave a short leg uncovered. Insufficient buying power is the other frequent cause.

**Does a higher level mean less risk?** No. A higher level permits more kinds of positions, including some with no cap on loss.

## The bottom line

An options approval level is a list of what one account may open, set by the broker from the application and acting only at order entry. The tiers rise as the cover behind the worst case thins, and spreads commonly sit one tier below uncovered options with a margin account, whatever number the broker gives that tier.

All figures on this page are hypothetical and are there to show the mechanics. This post is educational and is not investment advice.
