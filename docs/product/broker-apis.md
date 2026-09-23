# Getting to more brokers: the routes, and what each one costs

Written 18 September 2026, after the SnapTrade evaluation returned its answer
(`docs/ops/queue.md`, and the Admin → SnapTrade panel). The owner's question
was the right one: *"do you know other solution same as tastytrade of other
brokers. Tradier, Schwab trading, etc..."*

## Why this question exists

SnapTrade was the hope that one integration would reach every broker. Their own
API says otherwise. Of 39 brokerages they list, 15 can place an order, and the
four largest US options brokers — Schwab, Fidelity, Interactive Brokers and
Robinhood — are **read only** through them. For a product whose whole purpose is
placing and managing option spreads, an aggregator that cannot trade the brokers
our users hold is not the shortcut it looked like.

What SnapTrade *is* good for stays true: read-only reach across 39 brokers,
including the big four. That is a real product — showing someone their Schwab
positions and history — but it is a different product from this one.

So the remaining route to more brokers is the one we already walk with Alpaca:
direct, one at a time. This file is what each one costs.

## The one thing that decides build difficulty

**Does the broker offer a paper environment on the same API as live?**

Everything this product does is verified on paper before it touches real money:
the scanner's setups, the walk, the close ticket, the reconstruction, the daily
series. A broker with no paper environment cannot be tested the way every other
part of this codebase is tested, and that is a far larger cost than any
difference in endpoint design.

## The brokers, in the order they are worth doing

### 1. Tradier — the best fit, and it is not close

- Multi-leg options, including iron condors, through the same framework and
  parameters as a single-leg order.
- **One API for paper and live.** The only name on this list besides Alpaca
  where that is true.
- Order preview before submission, with buying-power and margin checks — which
  is the shape `getOrderImpact` has in our own tickets already.
- Market data including option chains, so the scanner could run on it.
- Python and Node SDKs, REST/JSON.
- Cost to the user: $0.35 per contract, or a $10/month unlimited plan.

An API-first broker, built for exactly what we build. If one more broker is
added, this is the one.

### 2. tastytrade — the right users

- Official Open API with full read and write: accounts, positions, balances,
  transaction history, market data, option chains, order execution, across
  equities, options, futures and crypto.
- **OAuth 2.0 for third-party integrations** with long-lived access, which is
  what lets a user connect their own account rather than paste API keys.
- Free with a brokerage account.
- Their customers are options traders by definition. Every other broker on this
  list has options traders among a much larger population of buy-and-hold
  investors.

Note it is also one of the nine SnapTrade can trade through — so this one could
be reached either way, and going direct buys depth (option chains, futures) that
the aggregator does not pass through.

### 3. Schwab — the largest audience, and no way to test

- Official Trader API, OAuth 2.0, individual developer applications.
- Options including multi-leg: verticals, straddles, butterflies, up to **four
  legs**, which covers everything this product builds today.
- Absorbed TD Ameritrade and thinkorswim, so the audience is enormous.
- **No paper trading.** Their sandbox serves synthetic data for checking
  authentication and payload shapes; it is not a paper account. The API connects
  to live accounts only.

That last point is the whole problem. Shipping an order path we could only ever
test against real money contradicts how everything else here is built.

### 4. Webull — quick to get, decent shape

- OpenAPI covering stocks, options, futures and crypto.
- Options go through the same unified order endpoint as stocks, with a `legs`
  array carrying strike, expiry and type — a shape close to our own.
- Approval in one to two business days, which is the fastest on this list.

### 5. E*TRADE — workable, unremarkable

- OAuth, preview and place equity and option orders, option chains, balances and
  positions. Documentation current as of June 2026.

### 6. Interactive Brokers — the heaviest door

- The audience serious options traders actually use, and the worst onboarding:
  third-party vendors need Compliance approval of the product itself, then a
  Legal-issued Web API agreement to sign, then public keys and a callback URL.
- **OAuth 1.0a only** for third parties.

Months, not days. Worth starting early if it is wanted at all, precisely because
the waiting is the cost rather than the code.

## Aggregators other than SnapTrade

Effectively none, for trading.

- **Plaid** and **Yodlee** investment products are read-only: holdings and
  transactions, no write access.
- **Upvest** offers trading without becoming a broker yourself, but it is
  European and is itself the licensed broker.

SnapTrade is close to alone in the "one API, many brokers, can place orders"
lane. That is why its trading reach gaps decide the question rather than
inviting a shop-around.

## Recommendation

**Tradier first, tastytrade second, both direct.** Tradier because it is the only
other broker with a real paper environment on the same API, so it can be built
and verified the way this codebase builds and verifies everything. tastytrade
because its users are the users, and its OAuth lets them connect their own
accounts.

**Schwab only with a decision made in the open** about shipping an order path
that cannot be tested on paper. That is the owner's call and it should be
recorded, not absorbed quietly into a sprint.

**SnapTrade, if kept at all,** is worth keeping for read-only breadth — someone's
Schwab or Fidelity positions visible inside DeltaMint — and not for trading.
Its pricing suits that: $2 per connected user per month with real-time data, $1
with daily.

## Sources

Their own documentation and current public pages, read 18 September 2026:
[Tradier multileg orders](https://documentation.tradier.com/brokerage-api/trading/place-multileg-order),
[Tradier developer API](https://trade.tradier.com/developer-api/),
[tastytrade developer docs](https://developer.tastytrade.com/docs/),
[tastytrade OAuth](https://developer.tastytrade.com/oauth/),
[Schwab Trader API](https://grokipedia.com/page/Schwab_Trader_API),
[Webull options API](https://developer.webull.com/apis/docs/trade-api/options/),
[E*TRADE getting started](https://developer.etrade.com/getting-started),
[IBKR third-party Web API](https://www.interactivebrokers.com.au/webtradingapi/),
[SnapTrade alternatives](https://www.openbankingtracker.com/api-aggregators/snaptrade/alternatives).
