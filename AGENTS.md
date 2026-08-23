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
- Run the relevant checks from `package.json` before finishing code changes.
