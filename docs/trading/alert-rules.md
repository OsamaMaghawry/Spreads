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
- `position-watch-daily` — `15 21 * * 1-5`: one plain report after the close,
  every weekday, whether or not anything fired.

There is deliberately **no hourly/overnight/weekend job** — the owner wants
monitoring only during the session plus one after-close report (removed in
`0018_drop_hourly_watch.sql`). Email is sent by `_shared/email.ts` via Resend
and is a **no-op until `RESEND_API_KEY` is set** — the watch still records every
alert to the `alerts` table meanwhile.

## Tuning

Change a threshold with a single update, e.g. tighten the oversized rule:

```sql
update watch_settings set position_max_pct = 0.20 where id = true;
```

Adding or removing a *rule* is a code change to `positionWatch` and a line here,
and goes through head-of-trading and the normal staging-first release.
