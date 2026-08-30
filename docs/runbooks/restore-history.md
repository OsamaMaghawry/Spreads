# Restoring trade history a sync overwrote

Every sync that would delete or rewrite stored rows copies them out first, into
`history_snapshots`, as one row holding four payloads:

| Column | What it holds |
| --- | --- |
| `deleted_trades` | Trade records the sync was about to remove |
| `updated_trades_before` | Trade records as they stood before an in-place update |
| `deleted_lots` | Share lots the sync was about to remove |
| `updated_lots_before` | Share lots as they stood before an in-place update |

The snapshot is written before the first destructive statement and the write is
abandoned if it fails, so "the rows are gone and there is no snapshot" is not a
state this code can reach.

## Read this before step 1

**Opening the Trade History page runs a sync.** The page calls the function on
mount, the function refreshes whatever is more than fifteen minutes old, and a
refresh is the thing you are trying to stop. Detaching the credentials comes
first, before anyone looks at the account in a browser.

## Procedure

**1. Stop the account syncing.**

There is no pause switch. Detach the credentials so a sync cannot reach the
broker, and nothing else — do not delete the account row, which cascades to its
trades and lots:

```sql
update trading_accounts
   set oauth_access_token = null, api_key = null, api_secret = null
 where id = '<account uuid>'
returning oauth_access_token, api_key, api_secret, is_oauth;
```

Keep what `returning` hands back. Those values are ciphertext and can be written
straight back in step 5; reconnecting through Alpaca OAuth also works for an
OAuth account, and manual keys otherwise have to be re-entered by an admin.

Note what `is_oauth` was. It is generated from `oauth_access_token`, so clearing
the token flips it to false, which un-gates the paper/live guard in
`saveAccount` until the token is restored. Do not edit the account in the
interface while it is detached.

**2. Find the snapshot.**

With the credentials gone, the page is safe to open: the sync fails, the amber
"Could not refresh from your broker" banner appears, and the stored rows are
served untouched. Open **Snapshots**. Each row gives the time, the reason the
sync gave, and how many records it holds. Download the one taken immediately
before the figures changed.

The same thing without the interface — neither call syncs:

```
POST /functions/v1/tradeHistory  { "accountId": "<uuid>", "snapshots": true }
POST /functions/v1/tradeHistory  { "accountId": "<uuid>", "snapshotId": "<uuid>" }
```

**3. Put the rows back.**

Upsert each payload into its table: `deleted_trades` and `updated_trades_before`
into `trade_records`, `deleted_lots` and `updated_lots_before` into
`stock_lots`. `trade_records` is unique on `(account_id, trade_key)` and
`stock_lots` on `(account_id, lot_key)`, so an upsert on that key restores a row
whether or not something is standing in its place. Keep the `id` and `user_id`
in the payload; they are the original values.

**4. Remove what the bad sync added.**

An upsert restores what was changed. It cannot remove a row the sync *created* —
and a sync that reclassified a position writes a new `trade_key` rather than
editing the old one, so after step 3 both rows exist and the account total is
the sum of the two. Compare what is stored against the snapshot's own
`trade_key`s plus the keys that predate it, and delete the extras:

```sql
select id, trade_key, close_date, realized_pl
  from trade_records
 where account_id = '<account uuid>'
   and created_at > '<snapshot taken_at>';
```

Everything that appears there and is not in the snapshot was written by the sync
you are undoing. Read the list before deleting from it.

**5. Check the figures, then reconnect.**

Look at the restored history and confirm it is what you expected — the account
is still detached, so nothing is racing you.

Then put the credentials back. The account will sync on the next page load, and
if the reconstruction still disagrees with the restored rows it will change them
again — that disagreement is the actual defect, and the snapshot is now the
evidence for it. Before letting that happen, run **Audit against broker feed**,
which needs the credentials and writes nothing: it computes exactly what the
next sync would write and shows it beside what is stored.

## What this does not cover

- Rows changed by anything other than a sync. Nothing else writes to these
  tables today.
- Snapshots older than the twenty the listing returns. They are still in the
  table; query `history_snapshots` directly by `account_id` and `taken_at`.
- Whether a routine sync should be rewriting a user's stored history without
  asking at all. That is an open product decision, and this document is the
  repair procedure for it, not an answer to it.
