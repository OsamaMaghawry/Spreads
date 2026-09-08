# Queue

Format: `- [state] YYYY-MM-DD · who · what · evidence`. States: `open`,
`fixed <commit>`, `escalated <date>`, `needs owner`. Oldest first.

## Needs owner

- [needs owner] 2026-09-02 · Stripe, test mode first: create the product "DeltaMint Live" with two prices ($29 monthly, $290 yearly); set on the **staging** Supabase project the function secrets `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL=https://dev-dash.deltamint.app`; add a webhook endpoint in Stripe pointing at `https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/stripeWebhook` for events `customer.subscription.*`. Repeat with live keys on production on the day billing goes live.
- [needs owner] 2026-09-02 · Decide who the watch emails (decision 8 in `docs/product/pricing.md`). Until then "alerts" stays off the pricing page.
- [needs owner] 2026-09-02 · Options Wheel staging account has no `wheel_client_prefix`, so its adjusted basis reads "broker basis".
- [needs owner] 2026-09-02 · Allowlist for the research environment: `tiblio.com`, `optionstrat.com`, `optionalpha.com`, `quantwheel.com`, and our own `deltamint.app` / `dashboard.deltamint.app` (403 at CONNECT since 31 Aug).
- [needs owner] 2026-09-02 · Metrics: create a GA4 property, verify Search Console for `deltamint.app`, create a Google Cloud service account with read on both, store its JSON as the GitHub secret `GOOGLE_METRICS_SA`, and set `GA_MEASUREMENT_ID` as a variable on the landing Worker. Nothing is pulled until these exist.
- [needs owner] 2026-09-02 · Ops health token: set `OPS_TOKEN` as a function secret on both Supabase projects and `DELTAMINT_OPS_TOKEN` on the Claude environment, so the hourly duty engineer can read order errors and alerts. Until then its runs are code-and-site only.
- [needs owner] 2026-09-02 · duty-engineer · Confirm migration `0024_broker_feed_dumps.sql` is applied on the **production** Supabase project (`yecfbeohyakuoyczvdbj`) — it shipped to `main` and was said to be "applied by hand on 2 Sep," but duty-engineer has no production database access to verify and never touches production. Owner (or whoever ran it) to confirm.

- [needs owner] 2026-09-03 · Confirm the **app** Worker actually reaches production traffic. Its Cloudflare Workers Build runs `npm run build && npx wrangler versions upload`, and `versions upload` publishes a *preview* version only — the build log itself prints "To deploy this version to production traffic use the command `wrangler versions deploy`". If nothing promotes it, `dashboard.deltamint.app` may be serving older code than `main` holds. Check Cloudflare → Workers & Pages → `spreads` → Deployments: does the active deployment match the latest `main` commit? Not verifiable from a Claude session — `api.cloudflare.com` and `dashboard.deltamint.app` are both 403 at CONNECT, and the Cloudflare connector is read-only for Workers.

- [needs owner] 2026-09-07 · duty-engineer · `228fea9` (the scanner's market-hours message and scan-loop backoff, on `staging` since 2026-09-04) has never been on `main` and no PR for it exists — `git merge-base --is-ancestor 228fea9 origin/main` fails, and `git diff origin/main origin/staging -- src/lib/marketSession.js src/components/open/useScanLoop.js supabase/functions/_shared/optionScan.ts` shows the file is entirely missing from `main` and the loop/scan changes are absent there. Three days of ledger entries logged it as shipped without the `(staging)` tag it needed. Not a duty-engineer fix (not a bug, and not this run's change) — flagging so the owner can open/merge a PR if it was just missed, or say if it's being held back deliberately.

- [needs owner] 2026-09-03 · **Decide whether EU/UK visitors need a consent banner before analytics run.** Raised by compliance-gate reviewing cc855e7, severity high, and explicitly not fixable by privacy-policy wording. Google Analytics and Hotjar both fire unconditionally for every visitor to `deltamint.app` — the hostname guard keeps staging out of the data, it is not a consent gate. The policy's remedy is opt-out ("use a blocker"), whereas ePrivacy/GDPR expectations for non-essential cookies, and for session recording in particular, generally call for consent *before* the script runs. Hotjar raises the stakes because it keeps an individual replay of a visit, not only aggregate heatmaps. Note the exposure predates Hotjar: GA has run unconsented since 3 Sep. Options are (a) accept the risk while traffic is small and mostly US, (b) add a consent banner for all visitors, (c) geo-gate the scripts for EU/UK only — Cloudflare gives `request.cf.country` in the landing Worker, so (c) is a small change to `trackingTags(env)` plus the inline snippets. Needs the owner's decision, not an engineer's.

## Escalated

- [escalated 2026-09-02] duty-engineer · `oauthDiag` (`supabase/functions/oauthDiag/index.ts`) is gated only by `requireUser` — any signed-in user, not just admins, can trigger a live Alpaca OAuth token exchange using the app's own client id/secret (the secret itself is never returned, only the client id — already public — and Alpaca's response). Exposure is a probing/rate-limit risk against our own Alpaca app credentials, not a credential leak. Outside duty-engineer's plain-bug authority (touches OAuth credentials) — systems-engineer to judge whether it needs admin-gating or is fine as a diagnostic any signed-in user can run. Proposed patch if gating is wanted: apply the same admin check `adminData`'s handler uses before the `requireUser` call.
- [escalated 2026-09-02] duty-engineer · `openPosition` (`supabase/functions/openPosition/index.ts`) never calls `recordAttempt` — `closeSpread/index.ts` writes an `order_attempts` row on every close (success and failure alike), opens write none, so the audit trail is one-sided. No test harness covers either function's `Deno.serve` handler (only `_shared/` modules are unit tested), so duty-engineer could not reproduce-first per its mandate; it also touches the order-submission path, which duty-engineer escalates rather than fixes on its own judgment. Proposed patch (mirrors `closeSpread` exactly, reusing the existing, already-tested, error-swallowing `recordAttempt` helper — no new dependency or schema): import `recordAttempt` from `../_shared/orderAttempts.ts`; wrap both the single-leg (around line 144) and multi-leg (around line 169) `alpacaFetch` calls in try/catch, recording `intent: "open"` with the error on failure and the `brokerOrderId`/`status` on success — the same shape `closeSpread/index.ts` lines 76-89 and 122-132 already use.

## Open

Seven findings from head-of-trading's 2026-09-08 audit of the live TSLA stock
repair. Three pairing/model defects from that same audit are already fixed
(`92a78ed`, `c642dcc`, `dcb5f5f`); these are the ones that were left because
each changes what a number means, which is not a duty-engineer fix. Ordered
worst first.

- [open] 2026-09-08 · head-of-trading · **Blocking. `totals.notional` counts an
  unbounded position as zero and says nothing.** `syncAccounts/index.ts:444`
  is `stockLike.reduce((a, r) => a + (Number(r.notionalRisk) || 0), 0)`. A naked
  call's `notionalRisk` is null (no bound), so `|| 0` adds nothing and the
  account's "Stock to zero" total reads as if that position did not exist —
  the one case where the figure is most wrong is the case it silently drops.
  Twelve lines above, `totals.risk` handles exactly this correctly: it carries
  `riskComplete` and an `undefinedRisk` ticker list. Fix is the same shape —
  a `notionalComplete` flag plus the tickers, and a dashboard total that says
  "incomplete" rather than printing a number that is short by an unbounded
  amount.
- [open] 2026-09-08 · head-of-trading · **The account stress total adds a −15%
  and a +15% shock on the same underlying.** `syncAccounts/index.ts:436` sums
  `r.stressLoss` across every stock-like row. `stressLossOfKind`
  (`positionKinds.ts:70`) shocks shares and puts *down* and naked calls *up*
  — deliberately, each is that position's adverse direction. Summed, one
  ticker holding both is charged for two moves that cannot both happen, so
  the total overstates. A margin engine shocks the underlying once and sums
  the P/L of every position at that price. Fix: group stock-like rows by
  ticker, evaluate each group at the down move and at the up move, take the
  worse of the two, then sum across tickers.
- [open] 2026-09-08 · head-of-trading · **`classifyLeg` is all-or-nothing per
  symbol, and disagrees with the watch on the same book.**
  `positionKinds.ts:48` returns `COVERED_CALL` only when shares cover *every*
  contract, else `NAKED_CALL` for the whole row — so ten short calls against
  100 shares report as ten naked, and `riskOfKind` then returns null
  (unbounded) for all ten when only nine are. `watchRules.nakedShortCalls`
  (`watchRules.ts:41`) already does this properly: it allocates shares and
  long calls contract by contract and reports the uncovered remainder. Two
  engines, one book, different answers. Fix: split the row, or return a
  covered/uncovered contract count `riskOfKind` can read.
- [open] 2026-09-08 · head-of-trading · **`pairSide` cannot name a ratio or a
  long-below-short structure, so the owner's stock repair is still shown
  decomposed.** `spreadPairing.ts:101` requires the long strike above the
  short (calls) and `:102` requires an identical expiry, so long 1 lower call
  vs short 2 higher calls never pairs, and no diagonal ever pairs. The legs
  are no longer lost (`92a78ed`) and the shorts are no longer called naked
  (`dcb5f5f`), but the app still describes the position as a covered call plus
  a loose long call rather than the repair it is. Fix is a named structure
  with its own risk arithmetic, not a loosened strike test — a ratio's risk is
  not a vertical's.
- [open] 2026-09-08 · head-of-trading · **An adjusted contract reads as naked in
  both engines.** A post-split or post-merger OCC symbol carries a
  non-standard deliverable, so "100 shares per contract" is false for it;
  `classifyLeg` and `nakedShortCalls` both assume 100. `positionWatch` can
  therefore raise a false critical on a fully covered position. `parseOCCSymbol`
  already flags adjusted contracts (that is `B12`, fixed 2 Sep) — the flag just
  is not read here. Fix: refuse to judge coverage on an adjusted contract and
  say so, rather than assuming the standard deliverable.
- [open] 2026-09-08 · head-of-trading · **`tradeReconstruction` labels a closed
  half by a different rule than `classifyLeg` labels the open one.**
  `tradeReconstruction.ts:602-610` decides `cash_secured_put` / `covered_call`
  from the contract type and the shares held at reconstruction time;
  `classifyLeg` decides from shares held now. The same trade can appear as a
  covered call while open and something else once closed, which moves it
  between Trade History's strategy tabs. Fix: one classifier, called from both.
- [open] 2026-09-08 · head-of-trading · **`docs/trading/alert-rules.md:16` is
  stale.** The `naked_short_call` row still reads "a short call with fewer than
  100 shares per contract behind it". Since `dcb5f5f` a long call of the same
  name expiring on or after the short also covers it (`watchRules.ts:61`), and
  the doc is what the rule is judged against. Doc-only, but it is the rule of
  record.

## Fixed

- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY` as a GitHub Actions secret. Verified: email-digest run 34131321857 sent the first digest that has ever left this repo (landed on `main` in `ad3eb33`/`a7cea26`/`1ac077a`; mirrored here from `main`'s queue.md, which this branch's `docs/ops/2026-09-07.md` runs had not yet seen).
- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY_STAGING` as a GitHub Actions secret. Verified: publish-blog-staging.yml run 34141439632 re-ran green and published four posts to the staging blog (same mirror as above).

- [fixed 8bd2168] 2026-09-03 · The landing site had no CI, so `landing/` changes reached `main` and never went live — which is how the Google Analytics tag sat merged and invisible for a day. `deploy-landing.yml` and `deploy-landing-staging.yml` added (f2d8369); owner set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Verified on staging first — run 33800093983's deploy step ran 20:04:35→20:04:46 UTC and Cloudflare reports `deltamint-landing-staging` modified at 20:04:46.565Z — then production run 33800417948, all steps green including the staging-first tree gate, deploy step 20:07:51→20:08:04 against `deltamint-landing` modified 20:08:03.954Z. The deployed bundle carries `analyticsTag(env)` reading `GA_MEASUREMENT_ID`, confirmed by reading the live Worker code. Also supersedes the 2026-09-02 "set `GA_MEASUREMENT_ID` as a variable on the landing Worker" half of the metrics item: it is set in `landing/wrangler.jsonc` and deployed. `deltamint.app` itself could not be fetched to see the rendered tag — the domain is 403 at CONNECT from a session (allowlist item above still open).

- [fixed 2514c1b] 2026-09-02 · duty-engineer · `Layout.jsx` nav said "dashboard" while the page H1 says "Positions Monitor" — the word `brand.md` forbids (canonical name: Positions Monitor). Nav label changed to "positions", matching the single-word style of the other tabs. Lint and build green; no component test harness exists in this repo to unit-test the JSX label.
- [fixed a7db799] 2026-09-02 · vp-product found · `positionWatch` called `sharesByTicker`, which did not exist; every account would have been reported unreadable. Written, tested, shipped to production 12:25 UTC.
