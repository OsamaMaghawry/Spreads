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

## Alpaca OAuth

**Alpaca shows the authorization disclosure. We do not.** Connect goes straight
to `app.alpaca.markets/oauth/authorize`, with nothing in between — the same as
every approved app. Alpaca's page renders "Authorize <app>" with the disclosure
from the registered app name, lists the user's live and paper accounts, and
carries Allow and Deny.

The DDQ (v3, page 3) shows that disclosure as a `[Name]` template and says
*"Acknowledgement of the disclosure must be done prior to a client connecting
their Alpaca account."* That describes **Alpaca's page**: the acknowledgement is
its Allow button, which precedes the token exchange that actually connects the
account. It is not a spec for a screen to build.

There was once an `AlpacaConnectConsent` modal repeating that text before the
redirect. It was removed: it was a second consent, shown on our domain, that
looked like Alpaca's and was not. Do not reintroduce it — check a real
connect flow before concluding otherwise.

**`env` is deliberately not sent.** That parameter narrows Alpaca's consent
screen to only a live or only a paper account. Omitting it lists every account
the user has, live and paper, and lets them tick the ones they want — which is
the only way to authorize more than one. Which accounts to connect is the user's
choice at the moment of connecting, not a build-time setting.

**The redirect URI is configuration, never derived.** Alpaca's spec: *"It must
match one of the whitelisted redirect URIs for your application."* So it comes
from `VITE_ALPACA_OAUTH_REDIRECT_URI` per environment and must be registered on
the app. It was once `${window.location.origin}/oauth/callback`, which produced
a different URI on production, staging, localhost and every preview deploy.

Note what that change did and did not do: it made the value explicit and
checkable, but for any given environment the string it sends is the same one the
old code derived. It is a robustness fix, not a fix for a connection that is
already failing.

**Approval is not required to connect.** From the current docs: *"By default
once you have a valid client_id and client_secret, any paper account and the
live account associated with the OAuth Client will be available to connect to
your app."* Compliance approval governs going live on the Connect platform, not
whether the authorize flow runs. Do not diagnose an OAuth failure as "waiting
for approval" — that was asserted repeatedly here and was wrong every time.

`status` and `live_trading_approved` are **separate fields** on the client
record (see `reference/getoauthclient`): `status` is `ACTIVE` or `DISABLED`,
approval is its own boolean. A client can be unapproved and still `ACTIVE`.

The authorize page's failing call is documented as returning 401 for *"Client
does not exist or you do not have access to the client."*

**The cause, when this happened: the app's "Publish" toggle was off.** Turning
it on in the Alpaca Connect settings made the consent screen render immediately,
with nothing else changed. Publish is a switch on the app, separate from
Compliance approval and separate from `live_trading_approved`.

**So check Publish first.** An `invalid_client` here says nothing about the
request. Every parameter was eliminated by experiment over several hours while
the actual cause sat in a dashboard toggle nobody had looked at — because the
values that can be tested from a terminal got tested, and the one that had to be
read off a screen did not. Ask for the app's Publish state before touching a
single parameter.

The parameter eliminations below are kept only so they are not repeated:

- The page is a JavaScript shell. The real failure is `POST
  app.alpaca.markets/api/v1/oauth/client` → `401 {"code":40110000,"message":
  "invalid_client"}`. Everything else on that page returns 200, so the session
  is fine.
- `40110000` is generic. The token endpoint returns the identical code for a
  client id that cannot exist, for a third party's real client id, and for ours
  — so it says "client rejected" and nothing more specific.
- It is not the scopes. Authorizing with no `scope` parameter at all, and with
  read-only `scope=data`, both fail identically.
- It is not the request. Ours is byte-identical in shape to a working app's:
  same endpoint, same five parameters, same order, same encoding.

- It is not the `env` parameter: `env=live`, `env=paper` and omitting it all
  fail identically.

None of them was the cause. Publish was.

The DDQ asks for *"a short video **or screenshots**"* of a user connecting, so
screenshots of the flow are an accepted substitute if a recording is not
possible.

Do not be misled by the archived `alpacahq/alpaca-docs` repo, which says *"Live
trading is allowed for the app developer user without approval"*. That describes
the **older** "OAuth Apps" system at `/brokerage/apps/manage`. **Alpaca Connect**
(`/connect`) is a different, newer system with different rules, and it is the one
in use. The archived protocol reference — parameters, scopes, token exchange —
still matches the current OAS spec and is fine; its rules and dashboard paths are
not.

**Where the app lives.** `app.alpaca.markets/connect`, an individual app at
`app.alpaca.markets/connect/edit/<client_id>`. Several redirect URIs are allowed
per app, via "+ Add new redirect URI", so one app can serve production and
staging.

Each environment also needs `ALPACA_OAUTH_CLIENT_ID` and
`ALPACA_OAUTH_CLIENT_SECRET` set as Supabase secrets on its own project — the
browser's `VITE_ALPACA_OAUTH_CLIENT_ID` only covers the authorize step, and the
token exchange after Allow fails without them.

**Diagnosing "Client authentication failed due to unknown client".** Alpaca
returns it for a client id it cannot resolve *and* for a redirect URI that is
not whitelisted, on their domain, naming neither. Discriminate by sending the
same client id with a deliberately bogus redirect URI: a *different* error means
the client resolves and the real redirect URI is not whitelisted; the *same*
error means the client itself is not being found — disabled, deleted, or a
different id than the one in `.env`.

**Brand rules (DDQ page 1 and 4).** Alpaca's name must not appear on the
marketing site except when showing brokerage integration partners — the
homepage broker card is that exception. Use "link your brokerage account"
elsewhere. Never imply DeltaMint is a broker-dealer or give investment advice.

## Market prices: one source, and it says where it came from

Every price the product shows or acts on comes from `_shared/marketPrice.ts`
(stocks) or `_shared/alpaca.ts`'s `getOptionQuotes` (options). **Do not add a
second way to price something.** Two existed once, with opposite field
priorities, and the dashboard and the trade dialog showed a $9 difference for
one stock at one moment — a scan built on $363.54 sold a JPM short put that was
actually in the money at $354.33.

Rules that keep that from coming back:

- **A midpoint is a calculation; a trade is a fact.** The last print leads. A
  quote mid is used only when it corroborates the print or when there is no
  print at all, and never when the quote is crossed or wide.
- **Two sources disagreeing means the price is unknown.** Return it untrusted
  rather than picking one. The scanner refuses; the dashboard labels.
- **Never return a number without its provenance.** `{ price, source, asOf,
  trusted }`, and the UI shows it. Silently substituting a bad number is how
  both incidents reached the screen looking authoritative.
- **A delta target cannot validate a spot price.** `optionDelta` back-solves
  implied vol from the option's own mid, so a wrong spot is absorbed into an
  absurd vol and the delta still looks sane. Guards must sit on spot itself.
- **Put-call parity is the only independent witness.** When both chains are in
  hand it costs nothing — the options market had the JPM price right the whole
  time.
- **A scan result is a proposal, not a price.** `openPosition` re-checks spot
  and the short strikes at submit and returns 409 if the market has moved.

Tests: `marketPrice.test.ts` and `optionScan.test.ts`, both runnable under Node.

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

## Connecting a brokerage account: OAuth only

Customers connect through Alpaca's OAuth flow. There is no customer-facing path
for pasting a raw API key and secret into DeltaMint, and adding one back is not
a UI decision — asking someone to hand a third party their brokerage
credentials is the thing Alpaca Connect exists to replace.

Manual key entry survives as an operator tool: the `manual_api_keys` row in
`app_settings` (migration 0010), off by default, toggled in **Admin →
Settings**. Both halves are enforced in `saveAccount`, not in the browser — a
request carrying credentials is refused unless the caller passes `isAdminUser`
*and* the switch is on. A non-admin is refused either way, and the refusal says
the same thing whether the switch is on or off.

Renaming an account and editing its client-order-id prefixes are never gated;
the check is on credentials alone, so an account keyed before the switch
existed stays manageable by its owner.

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
