# The demo release — production sequence

Written 12 Sep for the release that takes `staging` to `main` and puts the
product in front of people for feedback before Alpaca's live approval.

## What the owner asked for, and what it is not

> "I need to make the integration is Demo only, hide the pricing page… I just
> want the new users not get confused about the Live thing and pricing and we
> haven't started yet for this hassle."

The need is narrow: no live order entry, no prices. The release carrying it is
not narrow — 47 commits and six migrations — because that is simply how far
`staging` has run ahead. Everything below exists to keep the wide release from
doing anything the narrow need did not ask for.

## What production actually holds

Checked 12 Sep, not assumed:

| | |
| --- | --- |
| Trading accounts | 8 — four LIVE, all connected by **OAuth**, not pasted keys |
| Accounts with a stored API key | 1 (`Wees`, paper, from before OAuth) |
| Trade records | **152** |
| Of those, on live 907253851 | **100**, 2 Jul – 31 Aug, realized −$1,838.00 |
| Profiles | 4 |
| Vault `project_url` / `service_role_key` | **both set** |

The owner's instruction on the accounts, 12 Sep: *"Just leave what's live is on
Production as is, as long as it's OAuth. The idea in the API that we already
agreed not using them on Production anymore."* The rule was about pasted API
keys. OAuth connections stay.

## The order, and why it is this order

**Migrations first, then the merge.** `0034` adds `long_put` and `long_call` to
the `trade_records` strategy check constraint, and `tradeReconstruction.ts`
writes those values. Deploy the functions against today's production database
and every sync that meets a bought put fails the constraint.

1. Apply `0030` → `0035` to `yecfbeohyakuoyczvdbj`, in order.
2. **Pause the two trade-sync cron jobs** (below) before anything can fire.
3. Merge `staging` → `main`. CI deploys the functions and the app.
4. Verify: `/pricing` 404s, the demo banner shows, a live account reads
   "Watch only", a paper account still trades.

## Why trade sync ships PAUSED

`0033` schedules `trade-sync-session` hourly and `trade-sync-daily` each
morning. Its function is a no-op when the Vault secrets are missing — but on
production **they are set**, so the jobs would begin at once, reconstructing
those 100 live records unattended.

Reconstruction has silently corrupted stored history before; two commits in
this very range say so in their own messages. Nothing in this release has been
exercised against production's data, and the owner's need does not require
scheduled sync at all.

So after step 1, before step 3:

```sql
select cron.unschedule('trade-sync-session');
select cron.unschedule('trade-sync-daily');
```

This is a DELIBERATE, RECORDED DIVERGENCE between staging and production, not
drift. It is not a migration, because a migration would pause staging too —
staging is where the owner's live account is actually used and where the sync
is wanted.

### Turning it back on

Only after reconstruction has been run ONCE BY HAND against production and the
result checked against the broker — the 100 records on 907253851 and their
−$1,838.00 are the number to reconcile.

```sql
select cron.schedule('trade-sync-session', '0 13-22 * * 1-5',
  $cron$ select public.trigger_trade_sync(50); $cron$);
select cron.schedule('trade-sync-daily', '30 7 * * *',
  $cron$ select public.trigger_trade_sync(0); $cron$);
```

## Rolling demo mode back

One row, from the Admin settings panel, the day the broker approves:

```sql
update app_settings set value = 'false'::jsonb where key = 'demo_mode';
```

Putting the pricing page back is in `landing/drafts/README.md`. Its figures are
the 2 Sep proposal and the owner has said they are to be revised first — the
product has grown since.
