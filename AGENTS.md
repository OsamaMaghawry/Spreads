# AGENTS.md

## Project Context

Spread Deck is an options credit-spread trading dashboard for Alpaca brokerage accounts. The frontend is a Vite + React SPA; the backend is Supabase (Postgres + Auth + Edge Functions).

Start with `README.md` for local setup and environment variables.

## Key Files

- `src/`: frontend application source.
- `src/lib/supabaseClient.js`: the Supabase client (auth, database).
- `src/lib/functions.js`: `invokeFunction()`, a thin wrapper around `supabase.functions.invoke()` used to call edge functions.
- `supabase/migrations/`: SQL schema and row-level security policies.
- `supabase/functions/`: Edge Functions — all Alpaca broker calls, option-chain scanning, and trade-history reconstruction live here, never in the frontend (they hold each account's Alpaca API secret).
- `.env.local`: local-only environment values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); never commit secrets.

## Working Notes

- `npm run dev` runs the frontend against whatever Supabase project is configured in `.env.local`.
- Edge function changes need `supabase functions deploy <name>` to take effect; schema changes need a new file in `supabase/migrations/` plus `supabase db push`.
- Each function is deployed as its own bundle with a copy of whatever it imports from `_shared/`, so **a change to any file in `supabase/functions/_shared/` requires redeploying every function that imports it**, not just the one you edited. `supabase functions deploy` with no function name deploys all of them, which is the intended way to do this. Grep the importers before assuming a shared change is contained.
- Credentials are encrypted at rest by `_shared/crypto.ts` and the credential columns are revoked from the `authenticated` role (migration `0004`), so the browser cannot read or write them. Anything that needs to rewrite stored credentials belongs in an admin-only, idempotent maintenance function — see `migrateCredentials` — never in a request to users to re-enter their keys.
- Trading accounts and trade records are row-level-security scoped per `auth.uid()` — every table read/write from the frontend is implicitly scoped to the signed-in user, and edge functions load a trading account only after confirming it belongs to the caller (see `loadAccount` in `supabase/functions/_shared/alpaca.ts`).
- `docs/product-context.md` is the single current description of this product — architecture, brand, positioning and compliance in one file. Hand it to a model or a reviewer instead of explaining any of it from memory. It is **generated** by `npm run context`; never edit it directly, and CI fails when it no longer matches its sources (`npm run context:check`).
- Its judgement sections come from `docs/context/`: `brand.md` (colour, type, voice, naming), `positioning.md` (market, competitors, where the edge is), `compliance.md` (broker approval and the rules it imposes). **These are the source of truth, not the code** — when `brand.md` and the stylesheets disagree, the stylesheets are wrong. Change identity or strategy there, then apply it.
- Each edge function's describing comment feeds that file, so give a new function a one-sentence `//` summary above `Deno.serve`.
- Run the relevant checks from `package.json` before finishing code changes.

## Trade reconstruction

The logic that turns a broker activity feed into closed trades lives in
`supabase/functions/_shared/tradeReconstruction.ts` as pure functions, and
`tradeHistory/index.ts` is only the I/O around it. Keep it that way: every
defect this code has had was invisible until it met a real position, and the
fixtures in `tradeReconstruction.test.ts` *are* those positions — an assigned
AMD call spread, a TSLA pair that mis-matched by strike, an orphaned KO call
with no shares behind it.

    node --experimental-strip-types --test supabase/functions/_shared/tradeReconstruction.test.ts

Three properties are load-bearing and easy to break by accident:

- **A short pairs to the nearest protective long, never the first one found.**
  Taking the first match invents spreads that were never traded and orphans
  real ones.
- **Premium and shares are separate rows linked by `chain_id`.** An assigned
  short keeps its full premium; the result lands on the stock. Merging the two
  hides which half of a wheel cycle worked, and the merge cannot be undone.
- **Nothing unmatched is dropped.** An unpaired leg is written down and
  flagged. Dropping is what previously hid a long leg's entire cost.

Wheel versus spread is decided by shape only when the order carries no strategy
prefix: an orphaned short put is a cash-secured put, an orphaned short call is a
broken pair *unless* 100+ shares were held that day.

A normal sync only revisits the window it just recomputed, so it cannot correct
rows written by older logic. Use the rebuild path on the trade-history page for
that; it snapshots to `trade_records_backup` before deleting.

## Admin access

The first operator account is created in the Supabase dashboard, not by signing
up — `auth.users` rows are customers, and operating the product is a different
job from using it. `docs/admin-access.md` has the procedure and the reasoning;
read it before changing anything about who can reach `/admin`.

## Nothing touches production without approval

**Ask the owner first, every time, before any action that reaches production.**
No exceptions for "additive", "safe", "reversible" or "prerequisite". That
judgement is not yours to make on someone else's live trading data.

This covers, at minimum:

- Applying a migration to the production Supabase project (`yecfbeohyakuoyczvdbj`) — including
  pure `add column` / `create table` / widened `check` changes
- Deploying production edge functions, or merging `staging` into `main` (that merge *is* a
  production deploy)
- Editing production data, settings, secrets, or Cloudflare production Worker config

Do the work on `staging`, get it verified, then **say what you want to run and
wait**. Preparing production ahead of time so the merge "just works" is exactly
the reasoning this rule exists to overrule: the ordering convenience is yours,
the risk is the owner's.

Applying a migration to the staging project, pushing to `staging` or to a
feature branch, and running local checks are all fine without asking.

## Deployment: staging before production

There are two environments, each with its own Supabase project and its own pair of Cloudflare Workers (app + landing site):

| | App | Landing | Supabase |
|---|---|---|---|
| Staging | `dev-dash.deltamint.app` | `dev-landing.deltamint.app` | "Spread Staging" (`wpwaomzgpbozzghohwmf`) |
| Production | the live app | the live marketing site | production project |

**The flow is one-directional, with a checkpoint, not a copy:**

1. Push code changes to the `staging` branch only. This deploys automatically to the two `dev-*.deltamint.app` URLs and to the staging Supabase project's edge functions (`.github/workflows/deploy-functions-staging.yml`).
2. Actually check the change on the `dev-*` URLs (or verify it another way — a build passing, a function log) before doing anything else.
3. Only after that checks out, merge `staging` into `main`. That merge is what deploys to production (Cloudflare Workers Build promotes `main` pushes automatically; `.github/workflows/deploy-functions.yml` does the same for edge functions).

**Never push a change to `main` and `staging` in the same step.** Landing both at once is not staging, it's just copying the same untested change to two places — it defeats the entire point of having a staging environment. If a fix is trivial and low-risk (a typo, a comment), say so and ask before skipping the staging checkpoint — don't skip it by default.

Config note: `wrangler.staging.jsonc` (app) and `landing/wrangler.staging.jsonc` (landing site) are separate files from their production `wrangler.jsonc` counterparts specifically so staging deploys under different Worker names (`spreads-staging`, `deltamint-landing-staging`) and never collide with production. `.env.staging` points frontend builds at the staging Supabase project; keep it out of sync with `.env.production` only where the environment genuinely differs (it should not share `CREDENTIAL_ENCRYPTION_KEY` with production, for instance).

A nightly GitHub Actions job (`nightly-backup.yml`) `pg_dump`s the **production** database and keeps 30 days of it as workflow artifacts — the only backup that exists, since the Supabase project is on the free plan (no PITR).
