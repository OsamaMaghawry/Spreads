# Access: what a session can actually do

Written 3 Sep 2026, after a session asked the owner for a Cloudflare API token
it could not have used, to deploy a Worker the repo had no CI for, while the
answer sat unread in `docs/ops/queue.md`.

**Read this before asking the owner for any credential.** The question is never
"do I have access to X" — it is "can I perform the specific action, from here".
Those come apart constantly, and the gap is usually the network or the tool
surface, not a permission.

## The three things that must all be true

An action succeeds only when all three hold. Check them in this order; the
cheap ones fail most often.

1. **Network.** Outbound HTTPS goes through the agent proxy, which allowlists
   hosts. A blocked host fails identically to a bad credential, so test it
   before blaming access: `curl -sS -m 20 -o /dev/null -w '%{http_code}\n' https://HOST/`.
   A `CONNECT tunnel failed, response 403` is the proxy, not us.
2. **Tool surface.** A connector being present does not mean it can write.
   Enumerate before promising: `ToolSearch` with the server name.
3. **Credential.** Only now is a missing secret the real answer.

## Known-blocked hosts (as of 3 Sep 2026)

403 at CONNECT, so unreachable from a session regardless of credentials:

- `deltamint.app`, `dashboard.deltamint.app` — our own sites. Blocked since
  31 Aug. **The live site cannot be read from here**; never claim a page is or
  is not live from a session. Allowlist request is in `queue.md`.
- `api.cloudflare.com` — so `wrangler` cannot run here at all. A Cloudflare
  API token handed to a session is useless; the deploy has to happen in CI.
- `tiblio.com`, `optionstrat.com`, `optionalpha.com`, `quantwheel.com` —
  competitor research. Prices in `docs/product/pricing.md` marked "reported"
  rather than "verified" are blocked-source figures.

## Connectors, and their real limits

| Connector | Can | Cannot |
|---|---|---|
| **Cloudflare** | list Workers, read a Worker's deployed code, manage D1/KV/R2, search docs | **deploy or upload a Worker.** There is no put/deploy tool in the 23 it exposes. Worker changes ship through CI only. |
| **Supabase** | `execute_sql`, `apply_migration`, `deploy_edge_function`, read logs and advisors on both projects | — but production writes need the owner's word (`AGENTS.md`, "Nothing touches production without approval") |
| **GitHub** | read/write repo contents, PRs, Actions, secrets *names* | **read a secret's value.** Nothing can; that is the point of them. |
| **Gmail** | read and send on the owner's account | — |

## Deploy paths, and who runs them

| Target | Mechanism | Credential | Where it lives |
|---|---|---|---|
| Edge functions (prod) | `deploy-functions.yml` | `SUPABASE_ACCESS_TOKEN` | GitHub secret |
| Edge functions (staging) | `deploy-functions-staging.yml` | `SUPABASE_STAGING_ACCESS_TOKEN` | GitHub secret |
| Landing site (prod) | `deploy-landing.yml` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | GitHub secret |
| Landing site (staging) | `deploy-landing-staging.yml` | same two | GitHub secret |
| App Worker | Cloudflare Workers Builds | `spreads build token` | **Cloudflare dashboard, not this repo** |

Note the last row: it is configured outside the repository, so nothing here
records it and no commit changes it. It is also the one whose promotion to
production traffic is unconfirmed — see `queue.md`.

## Cloudflare API tokens

Two exist, and they are not interchangeable:

- **`spreads build token`** — used by Cloudflare Workers Builds for the app
  Worker. In active use. **Never roll it**; rolling breaks that build with no
  error in this repo.
- **`Edit Cloudflare Workers`** — the standard template, correct permissions
  for the landing workflows.

A Cloudflare token's secret is displayed **once, at creation**, and can never
be read back — not from the dashboard, not over the API. If the value was not
saved, the only way to obtain one is `⋯` → **Roll**, which reissues the same
token with the same permissions and a new secret.

Cloudflare has **no per-Worker token scope**: `Workers Scripts:Edit` is
account-wide. A second token for staging would grant identical access and only
look safer, which is why — unlike the two deliberately split Supabase tokens —
the landing workflows share one. Recorded here so nobody "fixes" it later.

When creating one: use the **Edit Cloudflare Workers** template unchanged,
Account Resources → your account, Zone Resources → All zones, **no client IP
filter** (GitHub runners rotate IPs), **no expiry** (an expired token fails
deploys silently, months later).

## The rule this file exists to enforce

Before putting a credential request on the owner's screen:

1. Search `docs/ops/queue.md` — it may already be recorded, possibly by you.
2. Prove the action is possible once the credential exists. Test the host.
   Enumerate the tools.
3. Prefer CI over a session credential, always. A secret in CI outlives the
   session, is auditable in the Actions log, and works when no one is here. A
   secret in a session dies with the container and has to be asked for again —
   which is what makes it feel like starting from scratch every time.
