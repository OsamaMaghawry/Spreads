# Queue

Format: `- [state] YYYY-MM-DD · who · what · evidence`. States: `open`,
`fixed <commit>`, `escalated <date>`, `needs owner`. Oldest first.

## Needs owner

- [needs owner] 2026-09-02 · GitHub → Settings → Secrets and variables → Actions: add `SUPABASE_SERVICE_ROLE_KEY` (production service-role key from the Supabase dashboard). Both `publish-blog.yml` and `email-digest.yml` fail without it (run 33629729594: "SUPABASE_SERVICE_ROLE_KEY is not set; cannot email").
- [needs owner] 2026-09-02 · Stripe, test mode first: create the product "DeltaMint Live" with two prices ($29 monthly, $290 yearly); set on the **staging** Supabase project the function secrets `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL=https://dev-dash.deltamint.app`; add a webhook endpoint in Stripe pointing at `https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/stripeWebhook` for events `customer.subscription.*`. Repeat with live keys on production on the day billing goes live.
- [needs owner] 2026-09-02 · Deploy the landing site to the staging Worker (`deltamint-landing-staging`, `wrangler deploy -c landing/wrangler.staging.jsonc`) so the new `/pricing` page can be reviewed before production. No CI deploys `landing/`.
- [needs owner] 2026-09-02 · Decide who the watch emails (decision 8 in `docs/product/pricing.md`). Until then "alerts" stays off the pricing page.
- [needs owner] 2026-09-02 · Options Wheel staging account has no `wheel_client_prefix`, so its adjusted basis reads "broker basis".
- [needs owner] 2026-09-02 · Allowlist for the research environment: `tiblio.com`, `optionstrat.com`, `optionalpha.com`, `quantwheel.com`, and our own `deltamint.app` / `dashboard.deltamint.app` (403 at CONNECT since 31 Aug).
- [needs owner] 2026-09-02 · Metrics: create a GA4 property, verify Search Console for `deltamint.app`, create a Google Cloud service account with read on both, store its JSON as the GitHub secret `GOOGLE_METRICS_SA`, and set `GA_MEASUREMENT_ID` as a variable on the landing Worker. Nothing is pulled until these exist.
- [needs owner] 2026-09-02 · Ops health token: set `OPS_TOKEN` as a function secret on both Supabase projects and `DELTAMINT_OPS_TOKEN` on the Claude environment, so the hourly duty engineer can read order errors and alerts. Until then its runs are code-and-site only.

## Open

- [open] 2026-09-02 · vp-product · `Layout.jsx` nav says "dashboard" while the page H1 says "Positions Monitor" — the word `brand.md` forbids. head-of-branding to rule; one-line fix.
- [open] 2026-09-02 · vp-product · `oauthDiag` is reachable by any signed-in user, not admin-gated. systems-engineer to judge exposure.
- [open] 2026-09-02 · vp-product · `openPosition` writes no `order_attempts` row; closes do. The audit trail is half.
- [open] 2026-09-02 · 0024 `broker_feed_dumps` migration is on `main` now; confirm applied on production (it was applied by hand on 2 Sep).

## Fixed

- [fixed a7db799] 2026-09-02 · vp-product found · `positionWatch` called `sharesByTicker`, which did not exist; every account would have been reported unreadable. Written, tested, shipped to production 12:25 UTC.
