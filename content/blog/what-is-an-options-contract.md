---
title: What an options contract actually is
slug: what-is-an-options-contract
excerpt: The definition fits in a sentence; what a filled contract does to your cash, your positions and your cost basis is the part nobody writes down.
meta_description: An options contract is six fixed terms and one negotiated price, on 100 shares. What one fill does to your cash, your positions and your cost basis.
author: DeltaMint
category: foundations
series_order: 1
tags: options contract, multiplier, cost basis, expiration, 100 shares
draft: true
---

An options contract is an agreement about a future transaction in a specific
security, on terms that were fixed before you ever saw it. That is the
definition, and it is close to the least useful true thing anyone can tell you.
It does not say what you are holding, what it cost, what your broker will now
show you, or what has to happen for it to end.

The concrete version is harder to find written down. You send an order for one
contract, it fills, and something specific happens: cash leaves the account, a
row appears that is not a share of anything, and a cost basis gets recorded
against it. Everything else in this series — strikes, decay, spreads, assignment
— is a variation on that row. So it is worth being exact about it once.

## An options contract is six fixed terms and one number you negotiate

Listed options are standardised, which is the single most important fact about
them and rarely the first one taught. The exchange defines the contract; the
market only prices it. Six terms come with the contract and are not yours to
set:

The **underlying** is the security the contract refers to — one stock, one
fund, one index. The **type** is call or put: a call is the right to buy the
underlying at a set price, a put the right to sell it. The **strike** is that
price. The **expiration** is the date after which the right no longer exists.
The **deliverable** is what actually changes hands if the right is used, which
for a standard equity contract is 100 shares. And the **exercise style** says
when the right may be used — American style, meaning any business day up to
expiration, for ordinary listed equity options; European style, meaning at
expiration only, for most broad-based index options.

The seventh number is the premium, and it is the only one either side of the
trade has any say over. It is what you pay or receive for the contract, and it
is what the quote on your screen is quoting.

![One options contract: six terms fixed by the specification, one premium set by the trade, and the cash, position and cost basis that appear in the account.](/assets/blog/option-contract-terms-to-account.svg)

Standardisation has a consequence worth holding onto. Because every contract
with the same six terms is identical to every other one, your contract is not a
private arrangement with the person on the other side of your fill. The clearing
house stands between you both, and it means you never have to find that person
again: you close by trading the opposite way with anyone at all, and the two
offsetting positions cancel in your account. That is why a position can be
opened and closed in the same minute by two strangers who will never know each
other's names.

## The quote is per share, and one contract is 100 shares

An option quoted at $2.15 does not cost $2.15. Option premiums are quoted per
share of the deliverable, and one standard contract carries 100 shares, so
$2.15 is $215 for one contract before fees. That factor of one hundred is a
contract term, not a display convention, and it is the arithmetic that catches
people first — usually in the direction of an order that was a hundred times
larger than intended.

The same factor applies further down. A 105 strike is not $105 of anything; if
the right is exercised, 100 shares change hands at $105 each, so the transaction
behind the contract is $10,500. The premium is the small number and the notional
is the large one, and the two are worth keeping straight from the start,
because size later on is measured against the second.

The deliverable is also the term most likely to be quietly amended. After a
stock split, a merger, a spin-off or a special dividend, the clearing house
adjusts existing contracts, and an adjusted contract can deliver something other
than 100 ordinary shares — a different share count, a cash component, shares in
a company that did not exist last month. The multiplier stays at 100 for
pricing purposes while the thing being delivered has changed. Adjusted contracts
are uncommon, they carry a marker in the symbol, and "times 100 shares" is a
default rather than a law.

## What one filled contract does to the account, line by line

Take a hypothetical underlying trading near $100, purely for the mechanics. No
view about it, no suggestion that anyone put this on, and nothing here about
what it would be worth afterwards.

A call at the 105 strike, expiring on a stated date about six weeks out. A limit
order to buy one contract fills at $2.15. Four things change, and they are worth
reading as four separate facts rather than one event:

**Cash.** $215 leaves the account, plus commission and the regulatory fees your
broker passes through. Most brokers show the debit against the balance
immediately; the trade itself settles the next business day. Nothing about that
debit is refundable or conditional. It is spent.

**Positions.** A new row appears in the options section of the account: long
one contract, with the six terms above written into its description. It is not
a share of the underlying. It pays no dividend, carries no vote, cannot be
lent out, and moves in price for reasons that are related to the stock but are
not the stock.

**Cost basis.** $215, which is premium × 100 × contracts. That is the figure
every later number is measured against, and for a purchased option it is also
the entire amount at stake: a buyer holds a right and can decline to use it, so
the premium paid is the whole of the downside and it is known before the order
goes in.

**Buying power.** For a long option paid for in full, the cash is spent rather
than held, and no collateral is set aside for as long as you hold it. That is
specific to owning the right. Whoever sold you this contract took on an
obligation instead, and their account holds collateral against it until the
contract is closed or expires — which is the whole subject of the next post in
this series.

| | Before the order | After the fill |
| --- | --- | --- |
| Cash | unchanged | − $215, plus fees |
| Option positions | none | long 1 contract, 105 call |
| Shares of the underlying | none | still none |
| Cost basis of record | — | $215 |
| Collateral held against it | none | none, for the buyer of the right |
| Marked value on screen | — | whatever the contract trades for now, which is not the cost basis |

That last row is the one people trip over on day two. The cost basis is fixed
at the fill and never changes. The value on the screen is a mark — what the
contract could be traded for at this moment — and it moves every day the market
is open. They are different numbers measuring different things, and only one of
them is settled.

## Three ways the position ends, and two of them are your choice

A contract is not a thing you hold indefinitely. It has a date on it, and there
are exactly three ways the row leaves the account.

![Three ways a long option position leaves the account: sold to close, exercised into shares at the strike, or held to expiration where an out-of-the-money contract lapses.](/assets/blog/option-contract-three-exits.svg)

**Sell to close** is the ordinary one. You send an order the opposite way, the
contract goes to whoever bought it, and your position nets to zero. Cash arrives
at whatever price the contract traded for. No shares are involved at any point,
which is why most contracts never result in anyone delivering anything.

**Exercise** uses the right. For the hypothetical call above, that means paying
$10,500 and receiving 100 shares — a real transaction the account has to fund or
margin, on a scale an order for $215 of premium does not advertise. It also
throws away whatever time value the contract still carried, since a contract
that is worth more than its exercise value is worth more sold than used.

**Expiration** is the one that happens by default. Out of the money at
expiration, the contract lapses, the row disappears and the $215 is not
returned. In the money at expiration, the opposite default applies: the clearing
house exercises contracts that finish a penny or more in the money unless the
holder instructs otherwise, and your broker has its own cut-off time for that
instruction and may apply its own threshold on top. A contract you had stopped
thinking about can therefore turn into a share position over a weekend, which is
why "it expires worthless" is a description of one case and not a mechanism you
can rely on.

## One contract is a row; a book is what you end up counting

Everything above is legible at one contract. You can hold the terms, the cash
and the basis in your head, and the account agrees with you.

Two things break that. The first is structure. Most premium-selling positions
are not one contract but several traded as one order — a spread, a condor — and
your broker's fill feed reports them as separate executions that something
downstream has to reassemble. When that reassembly is done by resemblance
rather than by reading the order the legs came from,
[the book shows spreads nobody traded](/blog/options-journal-splits-spreads-into-legs).
The second is comparison. Once there are several positions open at once, the
question stops being what each one cost and becomes what each one has at stake,
which is why
[ranking by return on risk rather than premium](/blog/return-on-risk-vs-return-on-capital)
is the habit the rest of this series keeps returning to.

DeltaMint is built around that second half — grouping the legs of an order back
into the position you actually put on, and showing the max loss and the share of
account equity beside it. None of that is a view on whether any contract is
worth trading. It is the arithmetic on this page, kept current across more rows
than one person can hold in their head.

The rest of this series starts at
[Options, from the start](/blog/foundations).

This post is educational and is not investment advice.
