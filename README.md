# Spread Deck

An options credit-spread trading dashboard for Alpaca accounts, backed by Supabase.

## Prerequisites

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Create a Supabase project at [supabase.com](https://supabase.com) (or use an existing one).
4. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) if you want to run migrations/deploy functions locally.

## Configure environment

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ALPACA_OAUTH_CLIENT_ID=your-alpaca-oauth-client-id
```

The Supabase values are on your project's dashboard under Settings → API. `VITE_ALPACA_OAUTH_CLIENT_ID` is the Client ID from your app's page under your [Alpaca broker dashboard](https://broker-app.alpaca.markets) → OAuth Apps.

Vite inlines every `VITE_*` variable into the built JS at build time — it is not read at runtime. If you build for production somewhere other than your local machine (a CI job, `wrangler deploy`, a platform build step), `VITE_ALPACA_OAUTH_CLIENT_ID` must be set in *that* environment before `vite build` runs, or the deployed app will send Alpaca a request with `client_id=undefined` and the OAuth connect flow will fail.

## Run locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Database & Edge Functions

Schema and row-level security policies live in `supabase/migrations/`. The trading logic (Alpaca order placement, position sync, option-chain scanning, trade history reconstruction) lives in `supabase/functions/` as Supabase Edge Functions.

Apply the schema and deploy the functions with the Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase functions deploy syncAccounts spreadQuote tradeHistory scanEntries findEntry manageOrder closeSpread openPosition alpacaOAuthCallback
```

Edge functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the platform-provided environment — no manual secret configuration is needed for them.

### Alpaca OAuth (Connect)

The "Connect Alpaca" flow (`src/lib/alpacaOAuth.js`, `supabase/functions/alpacaOAuthCallback`) needs two things beyond the manual-API-key setup:

1. In your Alpaca broker dashboard's OAuth Apps page, add a redirect URI of `<your-app-origin>/oauth/callback` (e.g. `https://app.example.com/oauth/callback`), and note the app's Client ID and Client Secret.
2. Set the Client ID as `VITE_ALPACA_OAUTH_CLIENT_ID` per the "Configure environment" section above (frontend, build-time), and set the Client ID/Secret as Supabase Edge Function secrets (server-side, used only by `alpacaOAuthCallback` to exchange the code for a token):

```bash
supabase secrets set ALPACA_OAUTH_CLIENT_ID=your-alpaca-oauth-client-id
supabase secrets set ALPACA_OAUTH_CLIENT_SECRET=your-alpaca-oauth-client-secret
```

If `alpacaOAuthCallback` hasn't been deployed, or these secrets aren't set, the callback page will show "Alpaca OAuth is not configured on the server" after the Alpaca consent step.

## Auth

Sign-up uses email/password with a 6-digit email confirmation code. In the Supabase dashboard under Authentication → Email Templates, make sure the "Confirm signup" template includes `{{ .Token }}` so the code is actually delivered (Supabase's default template is a magic link only).

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
