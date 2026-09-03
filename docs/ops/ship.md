# Shipping staging to production

The order matters. Functions deploy from `main`; the database does not.
Merging code that reads a column before the migration that adds it breaks
the blog and the admin panel in production.

1. **Migrations first, on the production project** (`yecfbeohyakuoyczvdbj`),
   in order, each verified by listing: everything in `supabase/migrations/`
   later than the last one applied there. As of 2 Sep that is
   `0025_billing.sql` and `0026_blog_categories_and_growth.sql`
   (`0024` is already applied).
2. **Merge `staging` into `main`** (fast-forward). `deploy-functions.yml`
   deploys every edge function; the Cloudflare build deploys the dashboard.
3. **Deploy the landing Worker by hand** — no CI covers `landing/`:
   `cd landing && npx wrangler deploy` (production) after the staging one
   was reviewed.
4. **Secrets the new code reads, on production**: `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`,
   `APP_URL` (live keys; the Stripe webhook endpoint pointed at the
   production `stripeWebhook` function); `OPS_TOKEN`. Until set, checkout
   answers "Billing is not configured" and the ops endpoint stays closed —
   nothing else is affected.
5. **Check**: `deltamint.app/blog` renders with category hubs;
   `/pricing` shows two tiers; Admin → Engagement loads; `billing_enforced`
   is off in Admin → Settings; the 15-minute watch run raises no
   `account_unreadable`.

Hotfixes that cannot wait go on a branch from `main` (cherry-picked), never
by merging `staging` early.
