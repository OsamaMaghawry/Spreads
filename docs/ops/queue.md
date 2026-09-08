# Queue

Format: `- [state] YYYY-MM-DD · who · what · evidence`. States: `open`,
`fixed <commit>`, `escalated <date>`, `needs owner`. Oldest first.

## Needs owner

- [needs owner] 2026-09-08 · **Turn off the Cloudflare-side Workers Build for `spreads` / `spreads-staging`** — Workers & Pages → the project → Settings → Builds. It is redundant now that `deploy-app.yml` and `deploy-app-staging.yml` deploy from this repo, and it is doing something that should not be left running: the **production** `spreads` script was modified at 19:25:06Z on 8 Sep, twenty seconds after a push to `staging` triggered the new staging deploy (19:24:05–19:24:48Z), and no workflow ran on `main` after 12:42Z that day. So the Cloudflare build is building the staging branch onto the production worker. Because it runs `wrangler versions upload` this is almost certainly a preview version that carries no traffic — but that leaves a bundle built against the STAGING Supabase project sitting on the production script, one "Deploy version" click away from serving it to real users. Not verifiable from a session (`api.cloudflare.com` is 403 at CONNECT and the connector is read-only for Workers), so it needs the owner's eyes. Two publishers on one worker also makes the Deployments tab unreadable, which is how the original "is production even current?" question went unanswered for five days.

- [needs owner] 2026-09-02 · Stripe, test mode first: create the product "DeltaMint Live" with two prices ($29 monthly, $290 yearly); set on the **staging** Supabase project the function secrets `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL=https://dev-dash.deltamint.app`; add a webhook endpoint in Stripe pointing at `https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/stripeWebhook` for events `customer.subscription.*`. Repeat with live keys on production on the day billing goes live.
- [needs owner] 2026-09-02 · Decide who the watch emails (decision 8 in `docs/product/pricing.md`). Until then "alerts" stays off the pricing page.
- [needs owner] 2026-09-02 · Options Wheel staging account has no `wheel_client_prefix`, so its adjusted basis reads "broker basis".
- [needs owner] 2026-09-02 · Allowlist for the research environment: `tiblio.com`, `optionstrat.com`, `optionalpha.com`, `quantwheel.com`, and our own `deltamint.app` / `dashboard.deltamint.app` (403 at CONNECT since 31 Aug).
- [needs owner] 2026-09-02 · Metrics: create a GA4 property, verify Search Console for `deltamint.app`, create a Google Cloud service account with read on both, store its JSON as the GitHub secret `GOOGLE_METRICS_SA`, and set `GA_MEASUREMENT_ID` as a variable on the landing Worker. Nothing is pulled until these exist.
- [needs owner] 2026-09-02 · Ops health token: set `OPS_TOKEN` as a function secret on both Supabase projects and `DELTAMINT_OPS_TOKEN` on the Claude environment, so the hourly duty engineer can read order errors and alerts. Until then its runs are code-and-site only.
- [needs owner] 2026-09-02 · duty-engineer · Confirm migration `0024_broker_feed_dumps.sql` is applied on the **production** Supabase project (`yecfbeohyakuoyczvdbj`) — it shipped to `main` and was said to be "applied by hand on 2 Sep," but duty-engineer has no production database access to verify and never touches production. Owner (or whoever ran it) to confirm.

- [fixed 2026-09-08] 2026-09-03 · **The app Worker never reached traffic, and it cost a whole afternoon.** Supersedes the 3 Sep owner item below. Cloudflare's Workers Build integration runs `wrangler versions upload`, which publishes a PREVIEW version and never routes it — its own log says "To deploy this version to production traffic use the command `wrangler versions deploy`", and nothing ran that. So four commits of dashboard work landed green on 8 Sep and the owner opened dev-dash and saw none of it. New `deploy-app-staging.yml` and `deploy-app.yml` run a real `wrangler deploy`, the same move the landing site made on 3 Sep (`f2d8369`), using the same two secrets, plus a new root `wrangler.staging.jsonc` for `spreads-staging` on dev-dash. Production carries the staging-first gate, fingerprinted across every tree and blob the bundle is built from rather than one directory. **Owner:** the Cloudflare-side build for `spreads` / `spreads-staging` is now redundant and should be turned off in Workers & Pages → the project → Settings → Builds, or two things will publish the same worker and the dashboard's Deployments tab will be confusing to read.

- [needs owner] 2026-09-07 · duty-engineer · `228fea9` (the scanner's market-hours message and scan-loop backoff, on `staging` since 2026-09-04) has never been on `main` and no PR for it exists — `git merge-base --is-ancestor 228fea9 origin/main` fails, and `git diff origin/main origin/staging -- src/lib/marketSession.js src/components/open/useScanLoop.js supabase/functions/_shared/optionScan.ts` shows the file is entirely missing from `main` and the loop/scan changes are absent there. Three days of ledger entries logged it as shipped without the `(staging)` tag it needed. Not a duty-engineer fix (not a bug, and not this run's change) — flagging so the owner can open/merge a PR if it was just missed, or say if it's being held back deliberately.

- [needs owner] 2026-09-03 · **Decide whether EU/UK visitors need a consent banner before analytics run.** Raised by compliance-gate reviewing cc855e7, severity high, and explicitly not fixable by privacy-policy wording. Google Analytics and Hotjar both fire unconditionally for every visitor to `deltamint.app` — the hostname guard keeps staging out of the data, it is not a consent gate. The policy's remedy is opt-out ("use a blocker"), whereas ePrivacy/GDPR expectations for non-essential cookies, and for session recording in particular, generally call for consent *before* the script runs. Hotjar raises the stakes because it keeps an individual replay of a visit, not only aggregate heatmaps. Note the exposure predates Hotjar: GA has run unconsented since 3 Sep. Options are (a) accept the risk while traffic is small and mostly US, (b) add a consent banner for all visitors, (c) geo-gate the scripts for EU/UK only — Cloudflare gives `request.cf.country` in the landing Worker, so (c) is a small change to `trackingTags(env)` plus the inline snippets. Needs the owner's decision, not an engineer's.

## Escalated

- [escalated 2026-09-02] duty-engineer · `oauthDiag` (`supabase/functions/oauthDiag/index.ts`) is gated only by `requireUser` — any signed-in user, not just admins, can trigger a live Alpaca OAuth token exchange using the app's own client id/secret (the secret itself is never returned, only the client id — already public — and Alpaca's response). Exposure is a probing/rate-limit risk against our own Alpaca app credentials, not a credential leak. Outside duty-engineer's plain-bug authority (touches OAuth credentials) — systems-engineer to judge whether it needs admin-gating or is fine as a diagnostic any signed-in user can run. Proposed patch if gating is wanted: apply the same admin check `adminData`'s handler uses before the `requireUser` call.
- [escalated 2026-09-08] duty-engineer · **A closed DEBIT vertical is still filed as two unpaired legs.** Verified against `supabase/functions/_shared/tradeReconstruction.ts` lines 558-577: `nearestLong` only accepts a long whose strike sits on the *credit* side of the short (`strike > short.strike` for a call), the same rule `spreadPairing` used before `pairSide` learned to pair a debit vertical using an order as proof the two legs were filled together. `tradeReconstruction` has no equivalent proof to check — it groups closed lots by a strategy-string prefix, not by order id — so loosening the strike test here would pair legs on nothing but proximity, the exact unproven guess the live path just stopped making. Both legs' money and the P/L totals are already right; only the grouping and the `unpaired` flag differ, so no number is wrong, only a trade's filing. Outside plain-bug authority: a safe fix means recording order provenance on the lot (a schema addition) so reconstruction can tell "filled together" from "merely adjacent," which is a design decision. Proposed direction: carry the broker order id already available at fill time onto the stored lot, then let `nearestLong` prefer a same-order long before falling back to strike proximity where no provenance exists.
- [escalated 2026-09-02] duty-engineer · `openPosition` (`supabase/functions/openPosition/index.ts`) never calls `recordAttempt` — `closeSpread/index.ts` writes an `order_attempts` row on every close (success and failure alike), opens write none, so the audit trail is one-sided. No test harness covers either function's `Deno.serve` handler (only `_shared/` modules are unit tested), so duty-engineer could not reproduce-first per its mandate; it also touches the order-submission path, which duty-engineer escalates rather than fixes on its own judgment. Proposed patch (mirrors `closeSpread` exactly, reusing the existing, already-tested, error-swallowing `recordAttempt` helper — no new dependency or schema): import `recordAttempt` from `../_shared/orderAttempts.ts`; wrap both the single-leg (around line 144) and multi-leg (around line 169) `alpacaFetch` calls in try/catch, recording `intent: "open"` with the error on failure and the `brokerOrderId`/`status` on success — the same shape `closeSpread/index.ts` lines 76-89 and 122-132 already use.

## Open

## Fixed

- [fixed 2026-09-08] 2026-09-08 · owner found · **The stock repair was shown in
  pieces.** Long 1x 352.50 call against short 2x 362.50 over 210 shares is one
  trade the owner placed. It read as two covered calls plus a loose long call;
  then, once the vertical pairing learned the debit direction, as a
  352.50/362.50 call spread plus a covered call — which split two contracts
  sold in a single trade across two cards, and was worse. New `pairRatios`
  matches a call ratio (one long strike, one short strike, one expiry, more
  shorts than longs) before the verticals and emits it as one
  `call_ratio_spread` row, 1x2 on its badge. Claimed on provenance when an
  order proves it, and without provenance only when the ticker holds 100+
  shares — the stock is what makes the shape unambiguous, and repairs are
  placed leg by leg as often as in one order.
  Its excess short queues for cover through the same allocator every other
  short call uses, so the ratio and a covered call cannot both claim the same
  hundred shares. Covered, its max risk is what it cost; uncovered, null.
  Risk, both break-evens, close cost, expiration value and the strike ladder
  all carry the two leg counts; the ladder marks the upside break-even, which
  is the number that matters on a repair and sits outside both strikes. The
  ratio and the share row are tagged one **Stock repair**.

- [fixed 2026-09-08] 2026-09-08 · All seven remaining findings from
  head-of-trading's audit of the live TSLA stock repair, plus two the owner
  found while they were being fixed. One commit, tests on each.
  - `totals.notional` no longer coerces an unbounded position to zero: it
    carries `notionalComplete` and the tickers it could not size, and the
    Notional tile reads `$76,993+` with the reason. **This was the blocking
    one.**
  - The account stress total shocks each ticker ONCE and takes the worse of
    the down and up move (`positionKinds.stressTotal`), instead of summing a
    −15% and a +15% loss on the same name — which also removes a second
    double count, of a covered call's shares against the share row.
  - Cover allocation moved into one shared module, `_shared/callCover.ts`,
    read by both `spreadPairing` and `watchRules`, so the dashboard and the
    watch cannot answer the same question differently again.
  - Cover is now counted per contract: a partly covered short call is emitted
    as a covered call AND a naked call, in both the live view and trade
    reconstruction, instead of the whole leg taking the name of its worst part.
  - An adjusted contract is no longer judged at all — new kind
    `short_call_unjudged`, risk withheld rather than "Unlimited", and a
    `cover_unjudged` info note in the watch in place of a false critical. It
    also consumes no cover, leaving the shares for contracts that can use them.
  - `pairSide` pairs debit verticals where an order proves the legs were filled
    together, with direction-aware max risk, break-even, close cost and
    moneyness (`moneynessLeg`, so a debit spread's best case is not painted
    red); a repair's rows carry a `stock_repair` tag so the app names it.
  - `docs/trading/alert-rules.md` rewritten to the rule as it actually runs.
- [fixed 2026-09-08] 2026-09-08 · owner found · **"210 (10 free)" on a lot of
  210 TSLA shares.** Two separate mistakes behind one label. First, cover was
  allocated shares-first, so both short 375 calls took 100 shares each while a
  long 352.50 call sat unused beside them; longs are now offered first and the
  row reads 100 backing calls, 110 free. Second, and worse, `qtyAvailable` had
  been clamped to the unencumbered remainder, so the close ticket offered a
  maximum of 10 shares out of 210 the owner holds outright — the app
  substituting its opinion for his authority over his own stock. The broker's
  number is the only cap now; the encumbrance is a note, and the close ticket
  warns before it lets him uncover a call rather than refusing to.

- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY` as a GitHub Actions secret. Verified: email-digest run 34131321857 sent the first digest that has ever left this repo (landed on `main` in `ad3eb33`/`a7cea26`/`1ac077a`; mirrored here from `main`'s queue.md, which this branch's `docs/ops/2026-09-07.md` runs had not yet seen).
- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY_STAGING` as a GitHub Actions secret. Verified: publish-blog-staging.yml run 34141439632 re-ran green and published four posts to the staging blog (same mirror as above).

- [fixed 8bd2168] 2026-09-03 · The landing site had no CI, so `landing/` changes reached `main` and never went live — which is how the Google Analytics tag sat merged and invisible for a day. `deploy-landing.yml` and `deploy-landing-staging.yml` added (f2d8369); owner set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Verified on staging first — run 33800093983's deploy step ran 20:04:35→20:04:46 UTC and Cloudflare reports `deltamint-landing-staging` modified at 20:04:46.565Z — then production run 33800417948, all steps green including the staging-first tree gate, deploy step 20:07:51→20:08:04 against `deltamint-landing` modified 20:08:03.954Z. The deployed bundle carries `analyticsTag(env)` reading `GA_MEASUREMENT_ID`, confirmed by reading the live Worker code. Also supersedes the 2026-09-02 "set `GA_MEASUREMENT_ID` as a variable on the landing Worker" half of the metrics item: it is set in `landing/wrangler.jsonc` and deployed. `deltamint.app` itself could not be fetched to see the rendered tag — the domain is 403 at CONNECT from a session (allowlist item above still open).

- [fixed 2514c1b] 2026-09-02 · duty-engineer · `Layout.jsx` nav said "dashboard" while the page H1 says "Positions Monitor" — the word `brand.md` forbids (canonical name: Positions Monitor). Nav label changed to "positions", matching the single-word style of the other tabs. Lint and build green; no component test harness exists in this repo to unit-test the JSX label.
- [fixed a7db799] 2026-09-02 · vp-product found · `positionWatch` called `sharesByTicker`, which did not exist; every account would have been reported unreadable. Written, tested, shipped to production 12:25 UTC.
