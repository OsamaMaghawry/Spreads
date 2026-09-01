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
| `short_through_strike` | a short leg is in the money on a **trusted** spot | 🔴 critical | — |
| `short_near_strike` | a short leg is within N% of its strike, trusted spot | 🟠 warning | `strike_proximity_pct` (1%) |
| `price_untrusted` | a short leg cannot be judged because the spot fails the trust ladder | 🟠 warning | — |

`price_untrusted` is a **liveness** rule — "I am watching and cannot see". It
belongs to the in-session watch and never appears as a row in the after-close
report, where nothing is trading and nobody can act on it; there it collapses
into one line naming the symbols that could not be priced.
| `earnings_before_expiry` | the underlying reports before the contract expires, within D days | 🟠 warning | `earnings_within_days` (3) |
| `position_oversized` | one position's market value exceeds X% of account equity | 🟠 warning | `position_max_pct` (25%) |

## Principles the rules must keep

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
