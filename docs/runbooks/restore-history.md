# Restoring trade history a sync overwrote

Every sync that would delete or rewrite stored rows copies them out first, into
`history_snapshots`, as one row holding three payloads:

| Column | What it holds |
| --- | --- |
| `deleted_trades` | Trade records the sync was about to remove |
| `updated_trades_before` | Trade records as they stood before an in-place update |
| `deleted_lots` | Share lots the sync was about to remove |

The snapshot is written before the first destructive statement and the write is
abandoned if it fails, so "the rows are gone and there is no snapshot" is not a
state this code can reach.

## Before anything else: a sync will undo an in-place restore

A sync recomputes the whole account from the broker's activity feed and runs
whenever the stored history is more than fifteen minutes old — including on an
ordinary page load. Rows put back without stopping that are overwritten by the
next visit to the page.

So the order matters, and step 2 is not optional.

## Procedure

**1. Find the snapshot.**

As an admin, on the account's Trade History page, open **Snapshots**. Each row
gives the time, the reason the sync gave, and how many records it holds.
Download the one taken immediately before the figures changed.

The same thing without the interface:

```
POST /functions/v1/tradeHistory  { "accountId": "<uuid>", "snapshots": true }
POST /functions/v1/tradeHistory  { "accountId": "<uuid>", "snapshotId": "<uuid>" }
```

**2. Stop the account syncing.**

There is no pause switch. Detach the credentials so a sync cannot run, and
nothing else — do not delete the account row, which cascades to its trades and
lots:

```sql
update trading_accounts
   set oauth_access_token = null, api_key = null, api_secret = null
 where id = '<account uuid>';
```

Keep what you cleared. Reconnecting through Alpaca OAuth restores an OAuth
account; manual keys have to be re-entered by an admin.

**3. Put the rows back.**

Against the payload you downloaded, per array. `trade_records` is unique on
`(account_id, trade_key)` and `stock_lots` on `(account_id, lot_key)`, so an
upsert on that key restores a row whether or not something is standing in its
place. `id` and `user_id` in the payload are the original values and should be
kept.

**4. Check the figures on the page, then reconnect.**

Reconnect only once someone has looked at the restored history and confirmed it
is what they expected. The account will sync on the next page load, and if the
reconstruction still disagrees with the restored rows it will overwrite them
again — that disagreement is the actual defect, and the snapshot is now the
evidence for it. Run **Audit against broker feed** before reconnecting: it
computes what the next sync would write, and writes nothing.

## What this does not cover

- Rows changed by anything other than a sync. Nothing else writes to these
  tables today.
- Snapshots older than the twenty the listing returns. They are still in the
  table; query `history_snapshots` directly by `account_id` and `taken_at`.
- Whether a routine sync should be rewriting a user's stored history without
  asking at all. That is an open product decision, not a runbook step.
