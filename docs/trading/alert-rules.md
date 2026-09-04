# Position-watch alert rules

Owned by **head-of-trading**, audited on the Thursday cadence. The rules are
what `supabase/functions/positionWatch/index.ts` runs; the *thresholds* live in
the `watch_settings` table so they can be tuned without a deploy. This document
is the human record of what each rule means, why it exists, and how to change it.

The watch reads **raw broker positions** (`GET /v2/positions`), never the paired
dashboard view — the pairing drops naked legs, and a naked short is the single
most important thing to alert on. Every rule reasons per leg.

## The rules (v1)

| Rule | Fires when | Severity | Threshold (`watch_settings`) |
| --- | --- | --- | --- |
| `naked_short_call` | a short call with fewer than 100 shares per contract behind it | 🔴 critical | — |
| `short_through_strike` | a short leg is in the money on a **trusted** spot | 🔴 critical | — |
| `short_near_strike` | a short leg is within N% of its strike, trusted spot | 🟠 warning | `strike_proximity_pct` (1%) |
| `price_untrusted` | a **ticker** cannot be judged because the spot fails the trust ladder | ⚪ info | — |

`price_untrusted` is a **liveness** rule — "I am watching and cannot see". It
belongs to the in-session watch and never appears as a row in the after-close
report, where nothing is trading and nobody can act on it; there it collapses
into one line naming the symbols that could not be priced.

Three things about it are deliberate, and all three were wrong until 4 Sep:

- **Info, not warning, and never emailed.** The session email carries
  conditions about positions only. This one is not actionable in a broker, and
  mailing it is what filled the inbox: of twelve emails on 2 Sep, most carried
  nothing else. It is recorded, and it is in the daily report.
- **One per ticker, not per leg, and it states the reason.** Four short MSFT
  contracts are one price problem; they sent four identical lines, none of
  which said why.
- **It never resolves what it could not judge.** When a spot goes untrusted the
  leg takes this branch, so `short_through_strike` is not re-raised — and
  reconciliation used to read that absence as "resolved" and close a critical
  that was still true. Four in-the-money criticals were closed that way on
  2 Sep while still being seen hours later, which is also why they were missing
  from that evening's report. Price-dependent rules on an unjudged ticker are
  now left open.

Related: which price the watch judges on is decided by the **clock**, not by
the mode. Outside 13:30–20:00 UTC it uses the closing price, because the live
ladder marks everything older than thirty minutes untrusted and after the bell
that is every price there is. See `sessionPhase` in `_shared/watchRules.ts`.
| `earnings_before_expiry` | the underlying reports before the contract expires, within D days | 🟠 warning | `earnings_within_days` (3) |
| `position_oversized` | one position's market value exceeds X% of account equity | 🟠 warning | `position_max_pct` (25%) |

## Principles the rules must keep

- **An unbounded loss is stated, not measured.** `naked_short_call` is the one
  rule that does not compare a number against a threshold. Every other rule here
  watches a bounded loss getting larger; a naked call has no bound, so it fires
  on the shape of the position alone — whatever the price is doing, and whether
  or not the spot can be judged. `positionKinds.riskOfKind` returns `null` for
  it rather than a figure, and the dashboard prints "Unlimited"; a blank cell or
  a zero would read as nothing to worry about. Where any position carries a null
  risk, the account's Risk / Equity is shown as a floor (`12.4%+`) rather than a
  total, because a tidy percentage that omits an unlimited liability is worse
  than no percentage.

- **Every position is shown, whatever we can make of it.** `spreadPairing`
  returned only structures it could pair a short against a protective long, and
  silently dropped the rest — so an Options Wheel account (cash-secured puts,
  covered calls, assigned shares) rendered an empty dashboard beside a complete
  trade history, and a naked short call was the single position guaranteed not
  to appear. Unpaired legs and share lots are now classified by
  `_shared/positionKinds.ts` and shown as what they are. The account's
  `wheel_client_prefix` only *labels* a strategy, exactly as it does in
  `tradeHistory`; it never decides whether a position is displayed.

- **Two definitions of risk, two jobs.** A defined-risk spread's max loss —
  width less credit — is real: it *will* lose that if it expires through the
  long, so it rolls straight into the account total. A stock-like position's
  textbook max loss is the stock at zero. True for one position, meaningless
  summed across a book: by that logic the whole market's max risk is its market
  cap. Those roll in at the **loss from a defined adverse move** instead —
  `watch_settings.stress_move_pct`, default 15%, the OCC TIMS single-stock
  shock behind every portfolio-margin engine — and the stock-to-zero figure is
  kept, added up, and named **Notional**, because that is what it is. On a
  wheel card the shock leads ("Loss at −15%"), with stock-to-zero in its
  tooltip; a position the move does not reach reads "survives".

- **A lone short put on Alpaca is cash-secured by construction.** Alpaca offers
  option levels 1–3 only — level 2 is covered calls and cash-secured puts,
  level 3 is spreads — and the industry's uncovered tier is level 4, which it
  does not have. If the broker let the order through, the collateral was there.
  Testing `cash ≥ strike × 100` on the client side was wrong on a margin
  account, where cash sits below the strike while buying power still covers it.

- **Held shares are priced at what they actually cost.** The broker records the
  assignment strike as the entry price and books the put premium as a separate
  closed trade, so an assigned-then-covered position overstates its max loss,
  break-even and P/L by every premium the wheel collected. `_shared/wheelBasis.ts`
  subtracts them — the assigning put through `stock_lots.chain_id`, and every
  later wheel credit on the name through `trade_records` — which is the
  definition every wheel tracker uses. Shares whose premiums cannot be linked
  keep the broker's basis and are labelled **broker basis**, never silently
  either. A covered call's worst case is the stock at zero, the same as owning
  it, so the column reads **Max loss (stock to 0)** rather than sharing a label
  with a spread's defined risk; the break-even leads on those rows because it
  is the number a wheel is run against.

- **Withhold rather than default.** `price_untrusted` exists because the wrong
  answer here is to silently call an unjudgeable position out-of-the-money. An
  absent or stale price is an alert, not a pass.
- **Trust the broker's own numbers where they exist.** `position_oversized`
  uses Alpaca's `market_value`, which does not depend on our pairing or pricing —
  so the rule holds even where the dashboard's figures are suspect.
- **One standing condition, one alert.** The dedupe key is
  `account · rule · position · trading-day`; a leg through its strike all
  afternoon is raised once and emailed once, escalated only if severity climbs.

## Delivery

The watch runs on two pg_cron jobs (UTC windows cover both EST and EDT):

- `position-watch-session` — `*/15 13-21 * * 1-5`: every 15 minutes through the
  weekday session. New or escalated conditions email the recipient in
  `watch_settings` (`osamamaghawry@gmail.com`).
- `position-watch-daily` — `15 21 * * 1-5`: one report after the close, every
  weekday, whether or not anything fired. It leads with the size of the book —
  accounts, open positions, value at risk — then what needs a look, then a line
  per account saying *why* it is clear (the nearest short leg and its distance
  from its strike). "Nothing flagged" without that evidence reads the same for a
  clean account and an empty one, which is what the first version did.

**The after-close report judges on the closing price, not the live ladder.**
`marketPrice.spotFromSnapshot` marks anything older than 30 minutes untrusted,
which is correct for the scanner and the dashboard — it exists because a scan
built on a stale print sold a short put that was already in the money. At 21:15
UTC, an hour and a quarter past a 20:00 close, it made *every* price untrusted:
every short leg raised `price_untrusted`, the through-strike and near-strike
rules sat behind the trusted branch and were never reached, and the email was
structurally incapable of saying anything else on any day. The daily mode now
uses `marketPrice.closingSpotFromSnapshot`, which prefers the official daily bar
and treats it as trusted. Staleness after the bell is the expected state, not a
defect. The 30-minute rule is untouched everywhere else.

There is deliberately **no hourly/overnight/weekend job** — the owner wants
monitoring only during the session plus one after-close report (removed in
`0018_drop_hourly_watch.sql`). Email is sent by `_shared/email.ts` through **Brevo**, as
`DeltaMint Agents <agents@deltamint.app>` on the authenticated domain, and is a
**no-op until `BREVO_API_KEY` is set** — the watch still records every alert to
the `alerts` table meanwhile.

## Tuning

Change a threshold with a single update, e.g. tighten the oversized rule:

```sql
update watch_settings set position_max_pct = 0.20 where id = true;
```

Adding or removing a *rule* is a code change to `positionWatch` and a line here,
and goes through head-of-trading and the normal staging-first release.
