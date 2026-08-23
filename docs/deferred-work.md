# Deferred work

Changes that are worth doing but were deliberately postponed, with enough
context to pick them up cold. Items touching `supabase/functions/_shared/`
are grouped because each one forces a redeploy of every function that imports
it — batching them keeps that to a single deployment.

## Pending a full function redeploy

These all change shared code. Do them together, then run
`supabase functions deploy` once for all functions.

### Encryption key rotation

**Status:** not implemented. **Risk if skipped:** the encryption key cannot be
changed without orphaning every stored credential.

`_shared/crypto.ts` decrypts with `CREDENTIAL_ENCRYPTION_KEY` only. If that key
is ever rotated — routine practice, and mandatory after any suspected exposure —
every previously stored credential becomes undecryptable, and every user has to
re-enter their API keys. That is the outcome the `migrateCredentials` function
exists to avoid, so the gap undercuts it.

The fix:

1. Add an optional `CREDENTIAL_ENCRYPTION_KEY_PREVIOUS` secret.
2. In `decryptSecret`, on authentication failure under the current key, retry
   under the previous key before throwing. Values are already version-prefixed
   (`v1:`), so the format needs no change.
3. Have `migrateCredentials` rewrite any credential that decrypted under the
   previous key, so a rotation drains to completion server-side with no user
   involvement — the same pattern as the plaintext backfill.
4. Once a run reports nothing left to rewrite, clear the previous-key secret.

Rotation then becomes: set the new key as current, move the old one to previous,
run the maintenance job, clear previous.

## Independent of the shared-code batch

### Continuous deployment for edge functions

**Status:** written and committed on the feature branch, **not yet merged to
`main`**, deliberately: the workflow fires on the merge and would fail without
its credential. To finish — set the `SUPABASE_ACCESS_TOKEN` repository secret
(Supabase → Account → Access Tokens; GitHub → Settings → Secrets and variables
→ Actions), merge to `main`, then confirm the first run goes green.

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
