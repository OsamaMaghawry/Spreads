# Duty engineer — needs you: confirm production ran today's three migrations

Today's merge to `main` at 14:28 UTC put live code into production that writes a
database column we have no record of production having. If the column is not
there, **Save for later fails for every user, on every order**. It is probably
fine — but nothing in the repo says so, and I cannot check production from a
session, so I am asking rather than assuming.

## What I can prove from the code

- `src/lib/savedOrders.js` puts `setup` into every saved-ticket insert,
  unconditionally — the column is named on the wire whether or not a setup
  exists. It comes from migration `0053_saved_orders_setup.sql`, which reached
  `main` today. Without the column, Postgres rejects the insert and the Save
  button errors.
- The merge commit `c835e0f` says the change is "additive and nullable … safe
  either way". That is true of *reading* a reopened ticket and not true of
  *saving* one, which is the sharper end and the one it did not cover.
- `0051_saved_orders.sql` (the table itself) and `0052_saved_orders_tif.sql`
  also first reached `main` today, in the same merge.
- The last time anyone recorded checking production's migration state was
  9 September, at `0029`. Twenty-four migrations have reached `main` since.
- `docs/ops/ship.md` step 1 says migrations go first on production, "each
  verified by listing, not by trusting the branch". No run since 9 September
  records that step being done.

## What to do

On the production project, list the applied migrations and compare them against
`supabase/migrations/`; apply anything missing, oldest first. At minimum confirm
`0051`, `0052` and `0053`. If the equity chart and the weekly digest have been
working this week then `0030`–`0050` are plainly already applied and only
today's three are in question — a five-minute check.

I changed nothing. A migration is not a duty engineer's to run, and this one is
on production besides. Filed in `docs/ops/queue.md` and in today's ledger with
the full evidence.

Everything else this hour was clean: lint, 917 tests, the build and the context
check are all green on `staging`, and one stale ticket was closed — the
`publish-blog.yml` item asking you to set `SUPABASE_SERVICE_ROLE_KEY` was
misdiagnosed. The secret is set, the guard passed on the run that entry cites,
and blog publishing has been green on `main` ever since. Nothing to do there.
