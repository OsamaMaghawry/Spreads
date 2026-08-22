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

`.env.local` is only needed to point local development at a different Supabase project. Production values are committed in `.env.production` and used by every `vite build`, so CI and hosting platforms need no environment configuration of their own. Those values are safe to commit because Vite inlines every `VITE_*` variable into the browser bundle — they are public the moment the app ships. Real secrets (the Supabase service role key, `ALPACA_OAUTH_CLIENT_SECRET`) are never `VITE_` variables; they live as Edge Function secrets, described below.

Two consequences of that build-time inlining are worth knowing:

- Changing any `VITE_*` value requires a rebuild. Editing it on a hosting dashboard does nothing to an already-built bundle.
- A build that cannot resolve one compiles it to a literal `undefined`. `vite build` prints the names it resolved, so check that line first when a deployed build misbehaves:

  ```
  [build] VITE_* variables visible to this build: VITE_ALPACA_OAUTH_CLIENT_ID, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL
  ```

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
supabase functions deploy syncAccounts spreadQuote tradeHistory scanEntries findEntry manageOrder closeSpread openPosition alpacaOAuthCallback saveAccount
```

Edge functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the platform-provided environment. Two secrets must be set by hand.

### Credential encryption (required)

Brokerage API keys and OAuth tokens are encrypted with AES-256-GCM before they are stored, by `supabase/functions/_shared/crypto.ts`. The key lives in the function environment and never in the database, so a database dump — or a leaked service role key — yields ciphertext rather than working credentials.

Generate a key and set it before deploying:

```bash
supabase secrets set CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Store a copy somewhere safe. **If this key is lost, stored credentials cannot be decrypted** and every account has to be re-entered or reconnected. Changing it has the same effect, so treat rotation as a deliberate migration rather than a routine change.

The database enforces the other half of this: migration `0004` revokes the credential columns from the `authenticated` role, so a browser can read the account list but not the keys themselves, and all writes go through the `saveAccount` and `alpacaOAuthCallback` functions. Row-level security scopes rows to their owner; these grants scope columns.

Credentials written before this migration remain readable and are re-encrypted the next time the account is saved — open each key-based account and re-enter its key pair once to migrate it, and reconnect OAuth accounts.

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
