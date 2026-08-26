# Admin access

How the first operator account is created, and how access is changed later.

## The model

Every row in `auth.users` is a **customer** — someone who signed up to trade.
Operating the product is a different job from using it, so operator access is
never something a customer account can grant itself.

The equivalent of WordPress's installer — the place where the first admin is
created before any admin UI exists — is the **Supabase dashboard**. It is the
only level above the application, and the only thing that can grant access into
an empty system.

Two settings there, doing two different jobs:

| Dashboard area | Job |
|---|---|
| Authentication → Users | **Creates the account** — email and password |
| Edge Functions → Secrets → `ADMIN_EMAILS` | **Declares who is an owner** |

Neither is reachable from the app. A compromised admin session cannot add
itself to `ADMIN_EMAILS`, and nothing in the database can either.

## Creating the first admin

Per project — the staging and production projects are separate databases and
need this done in each.

1. **Supabase dashboard → Authentication → Users → Add user**
   - Enter the email and a password.
   - Tick **Auto Confirm User**, otherwise the account waits on a confirmation
     email that was never sent.
   - This creates the account outright. There is no signup flow involved, and
     the public registration page is not used.

2. **Supabase dashboard → Edge Functions → Secrets**
   - Add `ADMIN_EMAILS` with that email. Comma-separated for more than one.

3. Sign in at the app's normal login page with those credentials, then open
   `/admin`.

Step 1 makes the account exist; step 2 makes it an owner. Both are needed —
an email in `ADMIN_EMAILS` with no matching account grants nothing, and an
account not in `ADMIN_EMAILS` is an ordinary customer.

## Changing access later

| To do this | Go here |
|---|---|
| Change the admin password | Supabase → Authentication → Users, or the app's own password-reset flow |
| Change which email is the owner | Supabase → Edge Functions → Secrets → `ADMIN_EMAILS` |
| Give a teammate admin | The Users tab in `/admin` — sets `profiles.role = 'admin'` |
| Remove a teammate's admin | Same place |
| Remove an owner | `ADMIN_EMAILS` only. The panel refuses, because writing the role would change nothing that is enforced |

## Why an owner is checked before the database

`requireAdmin` in `supabase/functions/_shared/admin.ts` checks `ADMIN_EMAILS`
*before* looking up `profiles`. If the profile row were missing or the table
unreachable, an owner would still get in. An out-of-band allowlist that
depended on application state would defeat the reason for having one.

The email is read from the verified JWT, never from the request body, so a
caller cannot claim to be someone else.

## What is not a security boundary

The hidden nav link and the `/admin` redirect are presentation. Someone could
render the page; they would get 403s and an empty shell, because every request
is authorized server-side. Access control is `requireAdmin`, nothing in the
browser.
