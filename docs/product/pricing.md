# Pricing — proposal, not policy

Owned by `vp-product`; decided by the owner; a standing item at the Friday
board. Nothing here is live until the owner says so and the change ships
through the normal release path.

## Current state

DeltaMint has **no published pricing**. The product is pre-revenue, in DDQ
review with Alpaca, with paper trading free by design ("You shouldn't trust
software with your account initially. Paper is free for as long as you want" —
`growth/playbook.md`).

## Reference points (to be verified to teardown standard before use)

| Competitor | Anchor | Note |
| --- | --- | --- |
| OptionStrat | Free / $39.99/mo Live Tools / $99.99/mo Live Flow, ~12% annual discount | WebSearch-verified again 2026-09-01 (multiple third-party reviews agree); direct fetch 403'd today, see `docs/context/reachable.md`; screenshot still pending |
| Barchart | Free capped (5 saved screeners) / Premier gates all options screeners, reported $29.95/mo | From `teardowns/barchart-options-screener.md` (2026-08-31); price is third-party-reported, not vendor-verified — screenshot requested there |
| Tiblio | $34.95/mo or $349.50/yr, $1/7-day trial — confirms this file's prior ~$35/mo anchor | From `teardowns/tiblio-trade-desk.md` (2026-09-01) and `market-watch`'s independent same-day check, both via WebSearch (`tiblio.com` is proxy-blocked, not on the allowlist, so nothing here is vendor-screenshot-verified). An early WebSearch pass in the teardown returned a stale/wrong $97–297/mo two-tier figure from a third-party review — corrected in the same file, noted here so the wrong number isn't picked up from an old version |
| TraderSync, Wingman | — | teardowns pending |

## Open questions for the first pricing proposal

1. Is the unit a subscription tier, and what sits behind the paywall that the
   activation path does not need? (Charging for the thing that activates users
   kills activation.)
2. What does "free paper forever" imply for the paid tier's shape?
3. Where does the Alpaca OAuth constraint (one live + one paper per
   authorization) bite a multi-account tier?
