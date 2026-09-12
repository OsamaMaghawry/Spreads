# Queue

Format: `- [state] YYYY-MM-DD · who · what · evidence`. States: `open`,
`fixed <commit>`, `escalated <date>`, `needs owner`. Oldest first.

## Needs owner

- [needs owner] 2026-09-12 · **The Vault row named `service_role_key` contains
  the ANON key, on staging.** Found while verifying the scheduled equity
  rebuild: the new all-accounts endpoint refused its own cron, correctly. The
  row's JWT payload reads `"role":"anon"` — the public key that ships in the
  browser bundle. Every pg_cron trigger in this product reads that row:
  `trigger_trade_sync`, `trigger_position_watch`, `trigger_weekly_digest`,
  `trigger_equity_history`. It has always "worked" because `verify_jwt = true`
  only asks for a valid JWT and the anon key is one.

  **Owner action:** replace the secret's value with the project's real
  service-role key, on staging AND on production (production is unverified —
  check it the same way: `select left(decrypted_secret,3), length(...)` and the
  decoded payload's `role` claim, never the key itself). Do not paste the key
  into a session; set it from the Supabase dashboard or the CLI.

  **Live exposure until then, filed for the bench:** `syncTrades` and
  `positionWatch` accept an all-accounts job from any caller that clears
  verify_jwt, and the key that clears it is published. Neither was changed in
  this branch — both are on the money path and belong in a review of their
  own. `equityHistory`'s scheduled path is already covered by the single-use
  `cron_tickets` mechanism (migration 0038), which needs no secret to travel
  between the scheduler and the function; the same mechanism is what those two
  should adopt.


- [needs owner] 2026-09-09 · duty-engineer · **`yecfbeohyakuoyczvdbj.supabase.co` (the production Supabase project, including the `sendDigest` edge function) is 403 at CONNECT from this environment**, same failure mode as `dashboard.deltamint.app`/`deltamint.app`. Discovered trying to run the brief's own "email the owner" step (`.claude/agents/duty-engineer.md`) over the `dumpBrokerFeed` finding below — couldn't send. Recorded in `docs/context/reachable.md`; worked around this run with `PushNotification` instead. If duty-engineer is meant to email directly, this host needs the allowlist addition alongside the existing `dashboard.deltamint.app` item.
- [needs owner] 2026-09-08 · **Turn off the Cloudflare-side Workers Build for `spreads` / `spreads-staging`** — Workers & Pages → the project → Settings → Builds. It is redundant now that `deploy-app.yml` and `deploy-app-staging.yml` deploy from this repo, and it is doing something that should not be left running: the **production** `spreads` script was modified at 19:25:06Z on 8 Sep, twenty seconds after a push to `staging` triggered the new staging deploy (19:24:05–19:24:48Z), and no workflow ran on `main` after 12:42Z that day. So the Cloudflare build is building the staging branch onto the production worker. Because it runs `wrangler versions upload` this is almost certainly a preview version that carries no traffic — but that leaves a bundle built against the STAGING Supabase project sitting on the production script, one "Deploy version" click away from serving it to real users. Not verifiable from a session (`api.cloudflare.com` is 403 at CONNECT and the connector is read-only for Workers), so it needs the owner's eyes. Two publishers on one worker also makes the Deployments tab unreadable, which is how the original "is production even current?" question went unanswered for five days.

- [needs owner] 2026-09-02 · Stripe, test mode first: create the product "DeltaMint Live" with two prices ($29 monthly, $290 yearly); set on the **staging** Supabase project the function secrets `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL=https://dev-dash.deltamint.app`; add a webhook endpoint in Stripe pointing at `https://wpwaomzgpbozzghohwmf.supabase.co/functions/v1/stripeWebhook` for events `customer.subscription.*`. Repeat with live keys on production on the day billing goes live.
- [needs owner] 2026-09-02 · Decide who the watch emails (decision 8 in `docs/product/pricing.md`). Until then "alerts" stays off the pricing page.
- [needs owner] 2026-09-02 · Options Wheel staging account has no `wheel_client_prefix`, so its adjusted basis reads "broker basis".
- [needs owner] 2026-09-02 · Allowlist for the research environment: `tiblio.com`, `optionstrat.com`, `optionalpha.com`, `quantwheel.com`, and our own `deltamint.app` / `dashboard.deltamint.app` (403 at CONNECT since 31 Aug).
- [needs owner] 2026-09-02 · Metrics: create a GA4 property, verify Search Console for `deltamint.app`, create a Google Cloud service account with read on both, store its JSON as the GitHub secret `GOOGLE_METRICS_SA`, and set `GA_MEASUREMENT_ID` as a variable on the landing Worker. Nothing is pulled until these exist.
- [needs owner] 2026-09-02 · Ops health token: set `OPS_TOKEN` as a function secret on both Supabase projects and `DELTAMINT_OPS_TOKEN` on the Claude environment, so the hourly duty engineer can read order errors and alerts. Until then its runs are code-and-site only.
- [fixed 2026-09-09] 2026-09-02 · duty-engineer · Confirm migration `0024_broker_feed_dumps.sql` is applied on the **production** Supabase project (`yecfbeohyakuoyczvdbj`). **Confirmed by listing production's migration history**, not by trusting the branch: `broker_feed_dumps` appears twice — `20260901181705` (the hand-run of 2 Sep) and `20260902084446` (the migration file catching the repo up). The table exists and the code that writes it has been live since. Same run applied the two that were still missing, on the owner's word: `0028_broker_feed_positions` and `0029_broker_feed_filled_orders`, both `add column if not exists`, verified afterwards by reading `information_schema` — `positions`, `position_count`, `open_orders`, `filled_orders`, `filled_order_count` all present. Production's schema is now ahead of `main`'s code, which is the order AGENTS.md requires.

- [fixed 2026-09-08] 2026-09-03 · **The app Worker never reached traffic, and it cost a whole afternoon.** Supersedes the 3 Sep owner item below. Cloudflare's Workers Build integration runs `wrangler versions upload`, which publishes a PREVIEW version and never routes it — its own log says "To deploy this version to production traffic use the command `wrangler versions deploy`", and nothing ran that. So four commits of dashboard work landed green on 8 Sep and the owner opened dev-dash and saw none of it. New `deploy-app-staging.yml` and `deploy-app.yml` run a real `wrangler deploy`, the same move the landing site made on 3 Sep (`f2d8369`), using the same two secrets, plus a new root `wrangler.staging.jsonc` for `spreads-staging` on dev-dash. Production carries the staging-first gate, fingerprinted across every tree and blob the bundle is built from rather than one directory. **Owner:** the Cloudflare-side build for `spreads` / `spreads-staging` is now redundant and should be turned off in Workers & Pages → the project → Settings → Builds, or two things will publish the same worker and the dashboard's Deployments tab will be confusing to read.

- [needs owner] 2026-09-07 · duty-engineer · `228fea9` (the scanner's market-hours message and scan-loop backoff, on `staging` since 2026-09-04) has never been on `main` and no PR for it exists — `git merge-base --is-ancestor 228fea9 origin/main` fails, and `git diff origin/main origin/staging -- src/lib/marketSession.js src/components/open/useScanLoop.js supabase/functions/_shared/optionScan.ts` shows the file is entirely missing from `main` and the loop/scan changes are absent there. Three days of ledger entries logged it as shipped without the `(staging)` tag it needed. Not a duty-engineer fix (not a bug, and not this run's change) — flagging so the owner can open/merge a PR if it was just missed, or say if it's being held back deliberately.

- [fixed 7ed6ee8+] 2026-09-03 · **EU/UK consent before analytics run.** Raised by
  compliance-gate on cc855e7 at high severity: Google Analytics fired for every
  visitor to `deltamint.app` from 3 Sep and Hotjar from 8 Sep, both before any
  consent, with the privacy policy offering "use a blocker" — an opt-out where
  ePrivacy expects consent *before* a non-essential tracker loads. Hotjar was
  the sharper end: an individual replay, not an aggregate.

  **Owner's decision, 9 Sep: do it.** Option (c), geo-gate, was implemented.

  Not gated at the edge, as originally scoped — that scoping was wrong. The
  home, pricing, privacy and terms pages carry their own inline snippets and
  are static assets (`run_worker_first` covers only `/blog`, `/blog/*` and
  `/sitemap.xml`), so a `request.cf.country` test in the Worker would have
  gated the blog and left those four tracking unchanged; and the blog
  responses live in `caches.default`, where a country-varying body serves one
  visitor's variant to the next. So the gate runs in the browser, defined
  identically in both halves, reading Cloudflare's own `/cdn-cgi/trace` on our
  origin. Fails closed. Privacy policy section 5 rewritten.

  compliance-gate re-reviewed and returned four findings; three applied in the
  follow-up commit — the Worker's copy of the gate was missing the hostname
  guard the inline copies carry (staging was excluded only because
  `wrangler.staging.jsonc` omits the two ids, which is a config accident, not
  a protection); GI, JE, GG and IM added, being GDPR-aligned and reported
  separately from GB; and "no third party is contacted" softened to "no
  additional third party", since Cloudflare is itself a disclosed third-party
  infrastructure provider. Its fourth finding was this queue entry, which said
  the decision was still the owner's after the code had already made it.
- [needs owner] 2026-09-03 · **Decide whether EU/UK visitors need a consent banner before analytics run.** Raised by compliance-gate reviewing cc855e7, severity high, and explicitly not fixable by privacy-policy wording. Google Analytics and Hotjar both fire unconditionally for every visitor to `deltamint.app` — the hostname guard keeps staging out of the data, it is not a consent gate. The policy's remedy is opt-out ("use a blocker"), whereas ePrivacy/GDPR expectations for non-essential cookies, and for session recording in particular, generally call for consent *before* the script runs. Hotjar raises the stakes because it keeps an individual replay of a visit, not only aggregate heatmaps. Note the exposure predates Hotjar: GA has run unconsented since 3 Sep. Options are (a) accept the risk while traffic is small and mostly US, (b) add a consent banner for all visitors, (c) geo-gate the scripts for EU/UK only — Cloudflare gives `request.cf.country` in the landing Worker, so (c) is a small change to `trackingTags(env)` plus the inline snippets. Needs the owner's decision, not an engineer's.

## Escalated

- [fixed 0ac2e27] 2026-09-09 · duty-engineer · **`dumpBrokerFeed` is unauthenticated in production right now.** Verified by reading `supabase/functions/dumpBrokerFeed/index.ts` at `origin/main` (`60814dc`): it takes an `accountId` from the request body, loads that account with the admin client, decrypts its Alpaca credentials and fetches its full activity/position/order history — with no auth check of any kind. Any caller holding the app's public anon key (embedded in every client bundle) can name any account id and trigger this. `systems-engineer` already found and fixed this on `staging` in `af75776` — signed-in + (owner or admin) is now required — but that commit has not been merged to `main`, so production is unprotected until it is. Not a duty-engineer fix (touches credentials/auth, outside plain-bug authority; also the fix already exists and only needs merging, which is the owner's own release step). Proposed action: merge/deploy the `staging` fix to `main` as soon as possible — no schema or behavior change beyond the auth check, `303` server tests green on `staging`. Emailed the owner.

  **Confirmed fixed in production, 2026-09-10.** The owner merged `staging` to `main` himself at `0ac2e27` ("Ship staging to production: auth fix, quote sanity, multi-close, Broker tab, universe scan, analytics consent"), which carries `af75776`. `git merge-base --is-ancestor af75776 origin/main` now succeeds. The hole is closed.
- [escalated 2026-09-02] duty-engineer · `oauthDiag` (`supabase/functions/oauthDiag/index.ts`) is gated only by `requireUser` — any signed-in user, not just admins, can trigger a live Alpaca OAuth token exchange using the app's own client id/secret (the secret itself is never returned, only the client id — already public — and Alpaca's response). Exposure is a probing/rate-limit risk against our own Alpaca app credentials, not a credential leak. Outside duty-engineer's plain-bug authority (touches OAuth credentials) — systems-engineer to judge whether it needs admin-gating or is fine as a diagnostic any signed-in user can run. Proposed patch if gating is wanted: apply the same admin check `adminData`'s handler uses before the `requireUser` call.
- [escalated 2026-09-08] duty-engineer · **A closed DEBIT vertical is still filed as two unpaired legs.** Verified against `supabase/functions/_shared/tradeReconstruction.ts` lines 558-577: `nearestLong` only accepts a long whose strike sits on the *credit* side of the short (`strike > short.strike` for a call), the same rule `spreadPairing` used before `pairSide` learned to pair a debit vertical using an order as proof the two legs were filled together. `tradeReconstruction` has no equivalent proof to check — it groups closed lots by a strategy-string prefix, not by order id — so loosening the strike test here would pair legs on nothing but proximity, the exact unproven guess the live path just stopped making. Both legs' money and the P/L totals are already right; only the grouping and the `unpaired` flag differ, so no number is wrong, only a trade's filing. Outside plain-bug authority: a safe fix means recording order provenance on the lot (a schema addition) so reconstruction can tell "filled together" from "merely adjacent," which is a design decision. Proposed direction: carry the broker order id already available at fill time onto the stored lot, then let `nearestLong` prefer a same-order long before falling back to strike proximity where no provenance exists.
- [escalated 2026-09-02] duty-engineer · `openPosition` (`supabase/functions/openPosition/index.ts`) never calls `recordAttempt` — `closeSpread/index.ts` writes an `order_attempts` row on every close (success and failure alike), opens write none, so the audit trail is one-sided. No test harness covers either function's `Deno.serve` handler (only `_shared/` modules are unit tested), so duty-engineer could not reproduce-first per its mandate; it also touches the order-submission path, which duty-engineer escalates rather than fixes on its own judgment. Proposed patch (mirrors `closeSpread` exactly, reusing the existing, already-tested, error-swallowing `recordAttempt` helper — no new dependency or schema): import `recordAttempt` from `../_shared/orderAttempts.ts`; wrap both the single-leg (around line 144) and multi-leg (around line 169) `alpacaFetch` calls in try/catch, recording `intent: "open"` with the error on failure and the `brokerOrderId`/`status` on success — the same shape `closeSpread/index.ts` lines 76-89 and 122-132 already use.

## Open

- [needs owner] 2026-09-10 · owner found in Search Console · **`www.deltamint.app`
  returns a server error, and only Cloudflare can fix it.** All five report
  categories were read; this is the only genuine defect among them.

  Googlebot got a **5xx** from `https://www.deltamint.app/` on 29 Aug and
  `http://www.deltamint.app/` on 1 Sep. Nothing in this repo serves www: the
  apex is attached to the landing Worker as a custom domain in the Cloudflare
  dashboard, and www was never attached to anything. **No code change can fix
  it** — the landing Worker also only runs for `/blog`, `/blog/*` and
  `/sitemap.xml` on production, so even routing www at it would leave the
  homepage unserved.

  **Diagnosed precisely, from this session.** `www.deltamint.app` resolves to
  `2606:4700:3030::6815:22a2` / `2606:4700:3031::ac43:a311` — **the same
  Cloudflare addresses as the apex and the dashboard**. So the DNS record
  exists and is proxied. Fetching it returns **HTTP 522**, Cloudflare's
  "connection timed out to origin". Cloudflare is answering for www and then
  looking for an origin server that does not exist, because www was never
  attached to the landing Worker the way the apex was. Not NXDOMAIN, not a
  missing record, not a certificate problem: an orphaned proxied hostname.

  Owner action, in Cloudflare, one of two — **the Redirect Rule is the right
  one** because it sends 301 to the canonical host and creates no second copy
  of the site for Google to weigh:

  - Rules → Redirect Rules → `www.deltamint.app/*` →
    `https://deltamint.app/$1`, status 301, preserve query string; **or**
  - Workers & Pages → `deltamint-landing` → Settings → Domains & Routes → add
    `www.deltamint.app` as a custom domain, which serves the site on www and
    then needs a canonical decision of its own.

  A person typing the address they are used to typing currently gets a server
  error, and Google has seen it twice.

  Now monitored: `site:health --live` checks both www forms daily at 06:17 UTC
  (`scripts/site-health.mjs`), so this cannot again be discovered by a crawler
  weeks after the fact.

- [fixed a19d911] 2026-09-10 · **`dashboard.deltamint.app/login` filed as
  "duplicate without user-selected canonical"** — already fixed, awaiting
  re-crawl. Google crawled it **27 Aug**; the `X-Robots-Tag: noindex, nofollow`
  header on every dashboard response shipped **31 Aug** in `a19d911`, four days
  later. `dev-dash` already sits correctly under "excluded by noindex" in the
  same report, which is the same mechanism working. Nothing to do but let
  Google re-crawl; do not "fix" it again.

- 2026-09-10 · **The other three Search Console categories are correct
  behaviour and need no work.** Recorded so nobody spends a day on them:
  *Alternate page with proper canonical tag* (5) — trailing-slash and http
  variants correctly pointing at the canonical, which is exactly what the
  canonical tag is for. *Page with redirect* (3) — `http://` forms of /terms,
  /pricing, /privacy redirecting to https. *Excluded by noindex* (2) —
  `dev-dash.deltamint.app`, which carries `NOINDEX=1` on purpose.

  Verified while reading them: everything this repo emits is already canonical.
  The sitemap lists `/`, `/pricing`, `/blog`, `/terms`, `/privacy` with no
  trailing slashes over https; robots.txt points at the https sitemap; no
  internal link anywhere uses `http://` or a trailing-slash form. `html_handling`
  is now declared explicitly in both wrangler configs rather than inherited
  from a platform default.

- 2026-09-09 · owner found on the live account · **The multi-close reads
  availability once, when the selection is made.** Closing a TSLA book: every
  order went through except the sale of the main share line. The shares were
  encumbered at selection time — collateral for the short calls, or an order
  already working — so `asLeg` capped the line to its free quantity and
  `nothingFree` dropped it from the plan entirely. But the sequence's own
  buy-backs retire those shorts before the share order's turn comes, so by the
  time it would have been sent the shares were free. The plan is built against
  a snapshot of a state the plan itself then changes.

  What is fixed (`0d48c92`): the screen now names every held line and how much
  of it is free, in the selection bar and again in the ticket, instead of one
  unattributed sentence about "a working order".

  What is not: each order should re-read `qty_available` for its own symbols
  immediately before it is sent, and close what is free *then* — with the
  ticket saying which lines are expected to be released by an earlier order
  rather than silently omitting them. Needs head-of-trading before it is
  built: re-reading availability mid-sequence is a second place the sequence
  can decide to send more than the user authorised.

Two bench reviews of the leg-first rebuild, 2026-09-09. head-of-trading returned
**STOP** on the risk engine; systems-engineer returned **FIX FIRST** on the
wiring plan. They converged independently on the same two defects. The gate
findings are fixed (see Fixed); these are what remains.

All four prerequisites systems-engineer named before any wiring are now done:
multi-expiry refusal and equity legs in `2918301`, ticker-book risk and the
`filled_orders` capture below it. The `mleg` cap is the first item of the
wiring itself, not a prerequisite to it — it lands with the close path.

- [open] 2026-09-09 · systems-engineer · **Alpaca caps `mleg` at 4 legs, and requires leg ratios with GCD 1.** Layer 1 will group 5- and 6-leg books; `closeSpread` will hand them all to `mleg` and the broker will reject. The rejection is visible rather than silent, but "unclosable" is the owner's stated requirement. The close ticket must know the cap: refuse the whole-position button above 4 legs and route to the leg picker, or split into ≤4-leg orders with the legging risk stated. Also keep shares out of any option group — `mleg` is options-only.
- [open] 2026-09-09 · systems-engineer · **React keys are built from `shortSymbol`/`longSymbol`** in `PositionCards.jsx:7`, `TickerPanel.jsx:172`, `SpreadTable.jsx:118`. Retire those fields and every key becomes `undefined_undefined_0`; React reuses the wrong component instance across a sync, so a card shows another position's leg quotes intermittently and not reproducibly. Replace with a sorted leg-set key in the same commit.
- [open] 2026-09-09 · systems-engineer · **`type` has three load-bearing readers**, not just the badge: `positionKind.riskIsUnbounded` (a naked call that stops being named `naked_call` stops saying "Unlimited"), `syncAccounts`' totals router (a name in neither `iron_condor` nor `STOCK_LIKE` lands in `flat` and has its raw maxRisk summed — on a repair that is a stock-sized number added to an options total), and `tickerBook.js`'s four `type === "shares"` tests (a renamed share row silently drops out of the combined payoff curve, the one number that panel exists for).
- [open] 2026-09-09 · systems-engineer · **`netCredit` is read by the close ticket while the user is choosing a price** (`CloseDialog:195`). Retiring it makes the P/L `NaN`, or worse `0`, which reads as "this position was free". The identity `netCredit === netPremium(legs) / (100 × qty)` holds — wire it rather than dropping it.
- [open] 2026-09-09 · systems-engineer · **`legMath` has no answer for collateral**, and cannot: collateral is a broker margin rule, not a payoff question. `collateralOfKind` must stay, and be said to stay, or "Capital tied up" quietly becomes zero. The STRESS shock, by contrast, should move: `min over ±move of payoffAt(tickerLegs, price)` deletes `stressPL`, `stressLossOfKind` and `STOCK_LIKE` — ~21 case labels — in one change.
- [open] 2026-09-09 · systems-engineer · **`StrikeLadder.jsx:254`'s final else describes any unrecognised type as a put spread** and paints zones from `shortStrike`/`longStrike`. Safe today only because an unknown type has no such fields and it renders nothing. It stays safe only if those fields are NOT shimmed onto leg-first rows for compatibility. Delete them; do not keep them warm.
- [open] 2026-09-09 · systems-engineer · **Reconstruction stays name-first this pass, and the reason is the schema, not effort.** `trade_records` is strictly two-legged; a closed 3-leg or ratio position has no representation. Worse, `trade_key` includes both symbols, so changing the pairing changes every key, `writeResultsInner` marks the unmatched rows stale, and `refuseMassDelete` throws for every account with more than a handful of trades — sync stops for everyone until a person intervenes. Follow `splitOrphanShort`'s pattern instead: make reconstruction AGREE with the leg-first result case by case. A `trade_legs` child table with a per-account backfill is a separate, larger pass.
- [open] 2026-09-09 · systems-engineer · `tradeReconstruction:1082` computes the write-guard's max loss from a name-implied vertical formula (`width × 100 × qty − premium_pl`). Should ask `legMath.maxLoss`. Fails safe today; it is a formula being deleted everywhere else.
- [open] 2026-09-09 · head-of-trading · **`structureName`'s `kind` vocabulary collides with `positionKinds.KINDS`** — `covered_call`, `shares`, `long_option` are three of the seven, and `riskOfKind(kind: string)` takes a bare string. Nothing calls it that way today, but "this file gates nothing" is a comment rather than a property. Prefix the label kinds or make them a closed union.
- [open] 2026-09-09 · head-of-trading · `structureName` uses `Math.abs(shares)`, so SHORT stock counts as cover: short 100 shares + short 105C reads "Covered call 105", confident. Same for "Protective put" and "Collar" on short stock. Numbers stay correct; the name is reassuring and wrong.
- [open] 2026-09-09 · head-of-trading · `structureName` returns identical confident labels for opposite structures: "Risk reversal 90/110" for both directions; "Call ladder" for the bounded ladder and for the unbounded long-at-top; a short butterfly reads as a ladder because the branch does not check the body quantity; a conversion reads as "Collar 100/100"; "Stock repair" fires on 50 shares + a 1×2 and on an unbounded 1×3.
- [open] 2026-09-09 · head-of-trading · Taxonomy gaps worth adding: double diagonal (currently confidently "Iron condor"), jade lizard, conversion/reversal, covered strangle, backspread, short butterfly and short condor, seagull, strap/strip, jelly roll, and two lots of one structure at different expiries on one ticker.
- [open] 2026-09-09 · head-of-trading · The property test at `legMath.test.ts` sweeps `payoffAt` and compares against a minimum taken over `payoffAt`, so it proves the kink SELECTION and not the payoff — a sign error inside `legPLAt` would pass silently. It also `continue`s on unbounded, so a false "unbounded" is never checked. Needs an independent payoff oracle.
- [open] 2026-09-09 · head-of-trading · `breakEvens` reports the endpoints of an interval where the payoff is flat at exactly zero (a box bought at exactly its width returns `[0, 100, 110]`) — incomplete rather than wrong. And it rounds to the cent, so on a 3-contract book the payoff at the reported price can be off by ~$3.
- [open] 2026-09-09 · systems-engineer · `pairSide` iterates shorts in broker list order, so with shorts at 100/105 and one long at 95, whichever the broker lists first takes the long — different max risk and different naming across syncs, non-deterministically. A leg-first grouper must sort before consuming.
- [open] 2026-09-09 · systems-engineer · `useLegQuotes` makes one `spreadQuote` call per leg, and each runs a full `GET /orders?status=all&limit=100`. Expanding a 4-leg condor is four order-history fetches; six legs is six, per card, per expand. Batch it.
- [open] 2026-09-09 · systems-engineer · Option legs never read `qty_available` (`buildLegs` handles shares only), so the close ticket can offer more contracts than the broker will accept when a leg is held by a working order. Pre-existing; worse with more legs, because availability is the min across them.
- [open] 2026-09-09 · systems-engineer · `order_attempts.legs` already holds two incompatible shapes (the app's leg list from the custom branch, the Alpaca wire from the paired one). Layer 3 collapses it to one, but historic rows keep the old — write a `schema` discriminator. And record the TRANSLATED body in both branches: the table's stated purpose is what was actually sent, and the translation is the only place a translation bug would show.


Head-of-trading's STOP audit of 2026-09-08 named what it did NOT examine, and
silence there is not clearance. All of it is still open:

- [open] 2026-09-08 · head-of-trading · `positionWatch` / `watchRules` have never been run against a `call_ratio_spread` shape. Unknown whether the rules fire correctly on it, or whether `price_untrusted` withholds properly. This is the Thursday cadence.
- [open] 2026-09-08 · head-of-trading · `PayoffChart`, `TickerPanel` and `tickerBook` (shipped `fbd520e`) were not read at all. The ticker panel is where a ratio's real bounded risk now lives, since the position row withholds it — so it needs its own pass before anyone relies on that number.
- [open] 2026-09-08 · investment-analyst · `tradeReconstruction` for a CLOSED ratio, and whether the max-loss cap holds against `2×short − 1×long`. Note the queue already carries an escalated debit-vertical reconstruction item.
- [open] 2026-09-08 · tax-accountant · The tax framing of a ratio close.
- [open] 2026-09-08 · head-of-trading · `manageOrder`'s replace path beyond its `> 0` guard, which this pass changed to "finite and non-zero" so a resting credit order can be repriced.
- [open] 2026-09-08 · **A re-audit before any of this goes to production.** Every fix above was made against a STOP verdict and none of them has been read back by the bench.


## Fixed

- [fixed 2026-09-09] 2026-09-09 · owner · **A missing offer priced a sale at half the bid.** SPY shares quoted bid $746.01 / ask $0.00; `q.ap || 0` in both close-quote builders turned the absent offer into a real price of zero, so the mid came out $373.01. The ticket showed that as "Market now", computed a -$5,210.35 P/L against it, seeded the limit with it, and armed "Sell 13 shares at $373.01" into a $746.01 bid — while printing "No live quote, so there is nothing to judge your price against" immediately above. `_shared/quoteSanity.ts` now holds the rule syncAccounts always had (`ask > 0 && bid >= 0 && ask >= bid`) and both builders read it; a zero BID stays valid because a worthless contract is one a trader especially needs to close. In the browser: `?? 0` became `?? null` with the P/L withheld rather than computed against nothing, and PriceControl no longer offers Bid/Mid/Ask chips — or reads the sign of the order — off a market it has itself judged unpriced. Sent to head-of-trading for verdict before production.
- [fixed 2026-09-09] 2026-09-09 · systems-engineer · **Layer 2 is now ticker-book level.** `_shared/bookRisk.ts` computes a whole ticker's max loss, break-evens and net premium from `legsOfAll(rows)`, so the covered call's cover on the share row and the call on its own row are one book again. The test that matters asserts the failure directly: hand the engine the call row alone and it reads `unbounded: "up"`; hand it both rows and it reads $39,400 at price 0 with a break-even of 394. It ships as a SHADOW field on the account payload (`totals.books`, `totals.bookRisk`) and drives nothing on screen — one known difference is by design (a book holding stock floors at the stock going to zero, which is the notional, while `totals.risk` shocks stock by a defined move), and separating that from a real disagreement is what the shadow week is for.
- [fixed 2026-09-09] 2026-09-09 · systems-engineer · **`syncAccounts` quotes every leg a row holds.** One `symbolsOf(row)` helper, `legsOf` unioned with the four legacy names so the set can only ever be a superset of what was fetched before. Used by both callers — the quote fetch and the adjusted-contract check, which had the same four-name blind spot and would have judged a five-leg structure as though its deliverable were standard.
- [fixed 2026-09-09] 2026-09-09 · systems-engineer · **`dumpBrokerFeed` captures filled orders, and checks who is asking.** Migration `0029` adds `filled_orders` and `filled_order_count`; the capture makes the identical `status=closed&nested=true&limit=200&direction=desc` request `syncAccounts` makes, because a different query string is a different set of orders and therefore a different grouping. The ownership hole is closed in the same commit: the caller must be signed in and must either own the account or be an administrator, where before any valid project key could name any account id and have its credentials decrypted and its whole history pulled. "Not yours" and "no such account" return the same 404 — the difference would confirm the id is real.
- [fixed 2026-09-09] 2026-09-09 · **head-of-trading's six blocking findings on `legMath`, all inside one function.** Its verdict: "the arithmetic is correct and the module is the right idea; every defect is `priceable` being too permissive." It cleared the mathematics explicitly — the piecewise-linearity claim verified independently, `slopeAbove` correct to ignore puts including when the top strike is a put, the downside genuinely always bounded including short stock, and 400 random books with a dense sweep finding 0 missed and 0 invented break-evens. What it broke was the input domain.
  - A missing `entryPrice` defaulted to 0, so a long call bought for nothing "cannot lose": `[C200 +1 no entry, C220 −1 @5]` returned maxLoss $0, maxProfit $2,500 and a +$500 net premium on a DEBIT spread.
  - A leg type outside `{C,P,S}` was valued as a put by `legPLAt` and sloped as a call by `slopeAbove` — the same else-defaults-to-put defect `1ee4e8f` had just removed from `spreadLegs.js`, one layer down. A naked short call came back with a $0 floor and `unbounded: null`, so it summed into an account total as finite and complete.
  - `Number(null) === 0`, so a null or empty strike passed the gate as a strike-0 contract and was then dropped from the kinks: a 5-wide spread reported a $9,700 maximum profit.
  - Nothing read `expiry`. A reverse calendar reported **maxLoss $0, bounded** on a position that becomes a naked short call the day the near leg dies; a double diagonal priced and confidently named as an iron condor; a jelly roll as a box. Multi-expiry is now refused, not flattened — the limitation was stated in a test comment, which is not a runtime withholding.
  - Nothing checked the underlying: `[AAPL 180P short, TSLA 340P long]` came back as a "Bull put spread 180/340" with a $300 max loss.
  - `CONTRACT = 100` with no per-leg multiplier; an unknown one is now refused rather than assumed.
  - `netPremium` never called the gate, so it answered −$300 for a structure whose every other figure withheld. And `breakEvens` returning `[]` meant both "none" and "could not be computed" — `priceability` now returns the REASON, so a screen can say which.
- [fixed 2026-09-09] 2026-09-09 · systems-engineer B2 · **`positionLegs` turned a stock leg inside a structure into a zero-strike put.** No row puts stock in `legs` today, which is the only reason it was dormant — "one order, one position" produces exactly that on day one, since a covered call filled by one ticket is a share leg and a call leg in one row. Reproduced: 100 long puts struck at zero, a −$2,998,800 net premium, and the confident name "Risk reversal 0/400". Now branches on `assetClass === "equity"`, and every option leg carries its expiry and underlying so the new gate can do its work. `bookByTicker` added and the book-level precondition asserted by a test rather than written in a comment.


- [fixed 2026-09-08] 2026-09-08 · **All ten of head-of-trading's STOP findings on the ratio close path**, plus one more found while fixing them. Market was closed, so nothing was exposed while this was done.
  - **The wire.** A 1x2 was quoted and ORDERED as 1x1 because every whole-position path speaks `putRatio`/`callRatio`. Rather than teach four wire builders a new vocabulary, a ratio now takes the explicit-legs path singles already use — `spreadLegs` was the one function that had it right, and `closeSpread`'s legs branch already sends `ratio_qty` per leg. `needsExplicitLegs` moved to `src/lib/spreadLegs.js` so the routing rule is pure and pinned by a test. The dialog's QUOTE routes the same way, which is what makes the +$1,053 resolve to -$319.50.
  - **The resumed limit.** `lastAttemptDebit` matched on "any order touching any of these symbols", so a cancelled single-leg $9.89 per contract resumed as a two-leg net. Now `_shared/resumeLimit.ts` — pure, ten tests — requires the same symbol SET and the same leg COUNT. And `walkStart` in `closeWalk.js` clamps the starting price to the same ask + $0.05 ceiling every later step obeys, so a stale price can carry the walk forward but never past what the market will bear. When it is clamped the ticket says so instead of silently displaying a start it will not use.
  - **MAX RISK on a ratio is now null**, not $0.00. The options row is unbounded above whatever the shares do; the shares are a row of their own and the bounded truth lives on the ticker panel. The Detailed table's totals row had the same `|| 0` swallow and now marks itself a floor.
  - Credit-aware whole-position readout (it said "Mid debit −$6.72" where the legs tab said "Mid credit"); "ratio" as the unit noun; `PriceControl` can express a credit at all (it clamped everything to $0.01, so a manual close of any credit-to-close structure was impossible or submitted with the opposite sign); leg rows price from the NBBO mid they were already displaying rather than the broker's last trade; "Below $376.31" instead of "— – $376.31"; "NET DEBIT" in rose instead of "NET CREDIT −$300" in emerald; the legs button says walk or limit.
  - `callCover.test.ts` and the new `resumeLimit.test.ts` added to `npm test`. `crypto.test.ts` cannot be: it imports from a `jsr:` URL that node's loader refuses. Documented in the file rather than left as a puzzle. 240 tests pass, up from 219.


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
- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY` as a GitHub Actions secret. Verified: email-digest run 34131321857 sent the first digest that has ever left this repo.
- [fixed 2026-09-07] 2026-09-07 · owner · Added `SUPABASE_SERVICE_ROLE_KEY_STAGING` as a GitHub Actions secret. Verified: publish-blog-staging.yml run 34141439632 re-ran green and published four posts to the staging blog.

- [fixed 8bd2168] 2026-09-03 · The landing site had no CI, so `landing/` changes reached `main` and never went live — which is how the Google Analytics tag sat merged and invisible for a day. `deploy-landing.yml` and `deploy-landing-staging.yml` added (f2d8369); owner set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Verified on staging first — run 33800093983's deploy step ran 20:04:35→20:04:46 UTC and Cloudflare reports `deltamint-landing-staging` modified at 20:04:46.565Z — then production run 33800417948, all steps green including the staging-first tree gate, deploy step 20:07:51→20:08:04 against `deltamint-landing` modified 20:08:03.954Z. The deployed bundle carries `analyticsTag(env)` reading `GA_MEASUREMENT_ID`, confirmed by reading the live Worker code. Also supersedes the 2026-09-02 "set `GA_MEASUREMENT_ID` as a variable on the landing Worker" half of the metrics item: it is set in `landing/wrangler.jsonc` and deployed. `deltamint.app` itself could not be fetched to see the rendered tag — the domain is 403 at CONNECT from a session (allowlist item above still open).

- [fixed 2514c1b] 2026-09-02 · duty-engineer · `Layout.jsx` nav said "dashboard" while the page H1 says "Positions Monitor" — the word `brand.md` forbids (canonical name: Positions Monitor). Nav label changed to "positions", matching the single-word style of the other tabs. Lint and build green; no component test harness exists in this repo to unit-test the JSX label.
- [fixed a7db799] 2026-09-02 · vp-product found · `positionWatch` called `sharesByTicker`, which did not exist; every account would have been reported unreadable. Written, tested, shipped to production 12:25 UTC.
