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
```

Both values are on your project's dashboard under Settings → API.

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
supabase functions deploy syncAccounts spreadQuote tradeHistory scanEntries findEntry manageOrder closeSpread openPosition
```

Edge functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the platform-provided environment — no manual secret configuration is needed for them.

## Auth

Sign-up uses email/password with a 6-digit email confirmation code. In the Supabase dashboard under Authentication → Email Templates, make sure the "Confirm signup" template includes `{{ .Token }}` so the code is actually delivered (Supabase's default template is a magic link only).

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
