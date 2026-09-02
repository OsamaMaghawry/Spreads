# Queue

Format: `- [state] YYYY-MM-DD · who · what · evidence`. States: `open`,
`fixed <commit>`, `escalated <date>`, `needs owner`. Oldest first.

Note: this file otherwise lives on `staging`, where the duty engineer drains
it; it doesn't exist on `main` yet, so this branch carries the current
staging content forward plus this cycle's branding tickets, rather than
starting a second, disconnected queue. Whoever reconciles this branch should
merge against the live staging copy, not overwrite it.

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
- [open] 2026-09-02 · head-of-branding · App ignores the `dm` accent almost everywhere — only `Layout.jsx` nav and Admin use `dm-accent`; primary CTAs vary emerald (`Screener.jsx:100`, `AccountForm.jsx:120`, `ExportPdfButton.jsx:161`), purple (Admin only), and shadcn near-black (`Login.jsx:95`) with no logic. Repoint the app's primary-action styling (buttons, focus rings, active nav) at `dm-accent`; retire the ad hoc emerald/near-black buttons. Evidence: `docs/branding/2026-W36.md` #1.
- [open] 2026-09-02 · head-of-branding · Rules on the `Layout.jsx` "dashboard" ticket above: it's a three-way split, not two — nav says "dashboard" (`Layout.jsx:15`), H1 says "Positions Monitor" (`Dashboard.jsx:41`), pricing bullet says "Position monitor" (`landing/public/pricing/index.html:68`). Make all three read "Positions Monitor." Evidence: `docs/branding/2026-W36.md` #2.
- [open] 2026-09-02 · head-of-branding · `AccountAnalysis.jsx:147` names the PDF export "Performance Analysis" and the PDF footer / on-screen line (`ExportPdfButton.jsx:107`, `AccountAnalysis.jsx:192`) reads "economic performance report", while the page's own H1 says "Analysis" — the PDF is the one artifact that leaves the product. Change the title prop to `${name} — Analysis`; the "economic performance report" wording itself needs desk-editor/compliance-gate sign-off before renaming, in case it's a deliberate disclosure phrase rather than a naming slip. Evidence: `docs/branding/2026-W36.md` #3.
- [open] 2026-09-02 · head-of-branding · Loss/risk red renders as 5 different colors: `dm-negative` (`#993C1D`) is used once (`OAuthCallback.jsx:109`); the app otherwise uses `rose-600`/`rose-700` (60 call sites); the landing hero and the PDF's "PAPER TRADING" banner (`ExportPdfButton.jsx:81`) hardcode `#B4485C`; shadcn `--destructive` is a fifth red (`#ef4444`). Same pattern on warning: `dm-warning` is defined but unused, every warning uses `amber-*`. Collapse `rose-*`/`amber-*` usages that mean loss/risk/warning into `dm-negative`/`dm-warning` app-wide, on the landing site, and in the PDF banner color. Evidence: `docs/branding/2026-W36.md` #4.
- [open] 2026-09-02 · head-of-branding · Emerald green is used decoratively (scan progress bar `Screener.jsx:124`, connected-status dot, a preset chip, every primary button) on the same screens where it also means P/L gain — e.g. `CloseDialog.jsx` has a semantic emerald P/L figure (line 228) next to a decorative emerald reset button (line 343). Reserve mint/emerald green for P/L and connection-state truth only; move decorative "primary action"/"in-progress" green to `dm-accent` or a neutral. Evidence: `docs/branding/2026-W36.md` #5.

## Fixed

- [fixed a7db799] 2026-09-02 · vp-product found · `positionWatch` called `sharesByTicker`, which did not exist; every account would have been reported unreadable. Written, tested, shipped to production 12:25 UTC.
