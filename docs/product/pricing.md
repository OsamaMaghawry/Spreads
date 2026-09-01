# Pricing — proposal, not policy

Owned by `vp-product`; decided by the owner; a standing item at the Friday
board. Nothing here is live until the owner says so and the change ships
through the normal release path. **No agent, including this one, ever sets or
publishes a price.**

## Current state

DeltaMint has **no published pricing**. The product is pre-revenue, in DDQ
review with Alpaca, with paper trading free by design ("You shouldn't trust
software with your account initially. Paper is free for as long as you want" —
`growth/playbook.md`).

## Reference points

Confidence follows the teardown standard: `verified` means the vendor's own
page or docs; `reported` means a review site or third party; `inferred` says
what from.

| Competitor | Anchor | Confidence | Checked |
| --- | --- | --- | --- |
| **Barchart Free** | $0, never expires. Capped at **20 page views/day**, 1 watchlist, 1 portfolio, 1 saved screener, 1 custom view. No options tools | verified — `www.barchart.com/membership-comparison`, fetched directly | 2026-09-01 |
| **Barchart Plus** | **$9.99/mo**; annual $99.00 (= $8.25/mo); biennial $179.00 (= $7.46/mo). 30-day free trial. **No options tools at all** | verified — same page | 2026-09-01 |
| **Barchart Premier** | **$29.95/mo**; annual $239.95 (= $19.95/mo, a **33% discount**); biennial $419.95 (= $17.49/mo). 30-day free trial. Everything options sits here: the spread screeners, IV rank and percentile, unusual activity, options flow, time & sales, historical chains to 2017 | verified — same page | 2026-09-01 |
| OptionStrat | Free / $39.99/mo Live Tools / $99.99/mo Live Flow, ~12% annual discount | **reported** (WebSearch, 2026-08-31). Not upgradable from here: the site 301s every path to the apex, which is not allowlisted — see `docs/context/reachable.md` | 2026-08-31 |
| **Tiblio** | ~$35/mo — screener + Alpaca OAuth + order routing + position tracking | **reported**, from `docs/context/positioning.md`, itself sourced in Aug 2026. Host is 403 at CONNECT; a teardown is impossible until `tiblio.com` is allowlisted | not re-checked |
| Market Chameleon | $69–99/mo, 18 spread types | reported — `positioning.md` | not re-checked |
| TraderSync, Wingman | — | teardown deferred; both hosts unreachable (`reachable.md`), and both are journals, which is adjacent to our pricing question rather than at it | — |

### What the Barchart numbers actually tell us

Three things worth more than the headline figure:

1. **The whole options business sits in one tier, at $29.95.** Plus at $9.99
   buys no options tools whatsoever. So the market's incumbent has already
   decided that "options trader" is the paying segment and priced the line
   between hobbyist and options user at exactly $10 → $30. There is no
   $15–20 options product from the biggest free-data site on the internet.
2. **A 33% annual discount and a 30-day free trial on both paid tiers.** Both
   are the norm here, not a promotion. Any proposal of ours that carries
   neither is priced against a competitor set that has both.
3. **The free tier is throttled, not feature-gated: 20 page views a day.**
   Barchart's free plan is a demo with a meter on it. Our "paper is free for as
   long as you want" is a genuinely different offer, and it is the strongest
   thing in our position — but it also means free costs us real Alpaca API
   traffic per user with no natural ceiling, where Barchart's costs them 20
   page views. That asymmetry belongs in the packaging decision.

**And the honest counterweight:** the Barchart teardown's own matrix says our
screener output is commodity, and `positioning.md` is blunter — "Opportunity
screening (filtering chains): **Commodity** — a competitor gives this away
free". We cannot price against Barchart's $29.95 on screening. The two things
in our product that Barchart does not have at any price are (a) the row goes
to a routed order on the user's own account, and (b) the position is then
watched, priced and reported on. Whatever the package is, that pair is what it
sells.

## Open questions for the first pricing proposal

1. Is the unit a subscription tier, and what sits behind the paywall that the
   activation path does not need? (Charging for the thing that activates users
   kills activation.) The tentative answer the reference points push toward:
   **paper stays free and uncapped; live connection is the paid line** — it is
   the moment the product is worth money and the moment our costs and our
   liability both start.
2. What does "free paper forever" imply for the paid tier's shape, given that
   free costs us per-user broker traffic and Barchart's free costs them 20 page
   views?
3. Where does the Alpaca OAuth constraint (one live + one paper per
   authorization) bite a multi-account tier?
4. **New.** Does `positionWatch` — the daily report and the alert emails,
   shipped 2026-08-31 — belong in the free tier or the paid one? It is the
   first thing we run *for* a user while they are not looking, it costs us on a
   schedule per connected account, and nothing in the reference set above
   includes it. It is the most obviously paid-shaped thing we have built.

## What would move this file next

- `tiblio.com` allowlisted → a teardown of the only competitor doing
  screen → order → hold on our broker, at a price (~$35) we would be setting
  ours against. This is the single highest-value unblock for pricing.
- `optionstrat.com` (apex) allowlisted → upgrades the OptionStrat row from
  reported to verified.
- Nothing else. A price proposal built on two verified rows and three reported
  ones is not ready, and padding it with journal teardowns would not make it
  readier.
