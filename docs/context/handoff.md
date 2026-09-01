# Session handoff — 31 Aug 2026

Read this first in a new session. It replaces re-explaining anything.

## How this repo deploys (the part that confuses)

Two **separate Supabase projects**, two databases:

| | Supabase project | Git branch | Deployed by |
| --- | --- | --- | --- |
| Staging | `Spread Staging` (`wpwaomzgpbozzghohwmf`) | `staging` | push to `staging` |
| Production | `Spread` (`yecfbeohyakuoyczvdbj`) | `main` | push to `main` |

House rule: **staging first, then main.** A migration must be applied to a
project's own database — applying it to staging does NOT apply it to production.

The Cloudflare Workers (dashboard + landing) are **not** deployed by CI. They
need `npx wrangler deploy` by hand.

## Shipped and live today

- **Close orders**: step size now scales to the bid/ask instead of a flat 2c,
  and the 10-attempt cap is gone. This is the AMD fix — the old walk could move
  only $0.20 total, so a wider market was mathematically unreachable.
- **Partial fills** are no longer reported as a completed close, and a reprice
  after one resubmits only the remaining quantity (it used to resubmit the full
  size, which would open a new position the other way).
- **Admin panel**: paging fixed (was throwing), real `last_active_at` tracking,
  broker refusals recorded, activation funnel no longer inverts.
- **positionWatch**: runs every 15 min in-session + one report after close.
- **Email**: sends through Brevo as `DeltaMint Agents <agents@deltamint.app>`.

## Waiting on the owner

1. `BREVO_API_KEY` → Supabase (Spread) → Edge Functions → Secrets. Alerts are
   recorded but not emailed until this exists.
2. Supabase → Authentication → SMTP Settings → Brevo SMTP creds (from Brevo's
   **SMTP tab**, not the `xkeysib-` API key), sender `DeltaMint
   <support@deltamint.app>`. Values are in `.github/workflows/auth-config.yml`.
3. `npx wrangler deploy` — the `noindex` fix for the indexed
   `/forgot-password` page is committed but NOT live.
4. Apply `supabase/migrations/0021_order_attempts.sql` to BOTH projects.

## Open questions needing database access

- **AMD ticket (wees08@gmail.com)**: the close-walk bug above is the near-certain
  cause and is already fixed. Confirmation needs his order ladder — that lives in
  Alpaca's order history and the Supabase edge-function logs, NOT in our tables
  (nothing recorded close attempts until migration 0021).
- ~~Monday growth Routine produced no commit~~ — **resolved 1 Sep.** It fired
  14:13:06 UTC, `last_run.status: SUCCEEDED`, and did commit:
  `growth/plays/2026-W36.md` in `45b771e`. Nothing was wrong with it.

## Reddit (1 Sep) — closed for now

Every Reddit host we need — `www.reddit.com`, `old.reddit.com`,
`oauth.reddit.com` — is already allowlisted, so W36's ask was aimed at the wrong
thing and there is no allowlist ask left to make. The live blocker is Reddit's
logged-out bot gate, and the only thing still missing is app credentials. The
app could not be created (Reddit's form rejects with a Responsible Builder
Policy pointer). **The owner has deprioritised this — do not re-raise it
weekly.**
Details and test results in `docs/context/reachable.md`. Posting the four queued
replies is unaffected: that is a browser step, no API involved.

## Permissions note

If MCP tools return "requires approval" with no prompt: the allow-list at
`.claude/settings.json` only loads when the session's working directory is this
repo root (`/home/user/Spreads`), not its parent.
