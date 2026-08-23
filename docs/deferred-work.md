# Deferred work

Changes that are worth doing but were deliberately postponed, with enough
context to pick them up cold. Items touching `supabase/functions/_shared/`
are grouped because each one forces a redeploy of every function that imports
it — batching them keeps that to a single deployment.

## Pending a full function redeploy

These all change shared code. Do them together, then run
`supabase functions deploy` once for all functions.

### Encryption key rotation — DONE

`_shared/crypto.ts` reads an optional `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS` and,
when a value fails to open under the current key, retries under it before
throwing. `migrateCredentials` re-encrypts anything that only opened under the
outgoing key and reports a `rotated` count. `crypto.test.ts` covers the property
that made it safe to ship inside a larger deployment: with the previous-key
secret unset, behaviour is unchanged — a foreign ciphertext still throws.

**Rotation procedure:**

1. Set the new key as `CREDENTIAL_ENCRYPTION_KEY`, and move the old value to
   `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS`.
2. Run `migrateCredentials` from Accounts → admin maintenance.
3. Repeat until `rotated` reports zero.
4. Clear `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS`.

No user is ever asked to re-enter credentials.

## Independent of the shared-code batch

### Continuous deployment for edge functions

**Status:** live on `main`, and green — but not yet deploying anything. The
deploy step skips with a notice while `SUPABASE_ACCESS_TOKEN` is unset. To
finish: create the token (Supabase → Account → Access Tokens), add it as a
repository secret (GitHub → Settings → Secrets and variables → Actions), and
re-run the workflow. From then on every push touching `supabase/functions/`
redeploys all functions.

Pushing to `main` now redeploys every function, so the shared-code fan-out
costs a CI run rather than a manual redeploy of each. Migrations are still
applied by hand with `supabase db push`; automating those is a separate
decision, since a bad migration is much harder to roll back than a bad
function version.

### Leaked-password protection

**Status:** disabled, flagged by Supabase's security advisor.

A toggle under Authentication settings that checks new passwords against
HaveIBeenPwned. No code change; worth enabling before the Alpaca compliance
review reads the cybersecurity policy.

### Portfolio-cumulative risk at order time

`RiskMeter` shows what a single order risks as a share of equity. The number a
premium seller actually needs is *total* open risk after this order — five
contained positions can add to a severe book. Blocked on cost: current open risk
means walking positions and pairing them, which `syncAccounts` does but is far
too heavy to run behind a dialog. Wants a cached per-account risk figure,
refreshed on sync and read cheaply here.

### Pin risk and short-strike drift alerts

Alert when a short leg moves inside a dangerous delta near expiry. Related to
the end-of-session de-risking below, and arrived at independently in outside
analysis, which is some evidence it is the right next thing.

### Earnings calendar coverage is unverified

`refreshEarnings` caches from one provider over a 90-day window. Nobody has
checked coverage against the top-50 universe, and a missing symbol produces
silence rather than a warning — the UI is careful never to imply that no flag
means no announcement, but the gap should be measured.

### Contact address on the legal pages

**Status:** deliberately deferred — the mailbox is being set up first, since a
published address that bounces is worse for reputation than none at all. This is
the one open `npm run site:health` warning.

Two things want it: reputation engines read a reachable identity as a trust
signal, and Alpaca's questionnaire still wants a named incident-response owner
and contact. Add a `mailto:` to `landing/public/{privacy,terms}/index.html` once
the mailbox exists.
