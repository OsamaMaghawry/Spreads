# Reachability register

What the environment's network can actually reach, tested — not assumed.
Check here before declaring anything blocked; add a row when you learn
something; **never report "blocked" without a row here and the workaround you
used instead.** The egress allowlist is an environment setting the owner
controls; additions go to him with the exact hostname.

The allowlist matches **exact hostnames** — an allowed apex whose site 301s to
`www.` dies at the hop unless `www.` is also listed.

| Host | Status | Tested | Note |
| --- | --- | --- | --- |
| **Fetch + real content** | | | Allowlist open AND the site serves us |
| www.barchart.com | ✅ 200 | 2026-09-01 | Full page. Membership pricing readable without a login at `/membership-comparison` and `/get-barchart-premier`; `/solutions` is the *enterprise* page and carries no consumer prices. `/membership`, `/pricing`, `/premier`, `/subscribe`, `/my/subscribe` all 404 — don't guess the path, follow the `data-ng-href` links off any screener page. **Not** Playwright-screenshottable (see the Chromium row below) |
| www.optionstrat.com | ⚠️ 301 → dead | 2026-09-01 | `www.` is allowlisted but OptionStrat 301s *every* path to the apex `optionstrat.com`, which is **not** allowlisted → 403 at CONNECT on the hop. Net effect: OptionStrat is unreachable. The 2026-08-31 row read "✅ 200/301" because only the redirect status was checked, not the hop. Fix is one allowlist addition: `optionstrat.com` |
| www.marketchameleon.com | ✅ 302 | 2026-08-31 | |
| www.tastylive.com | ✅ 200 | 2026-08-31 | |
| www.tastytrade.com | ✅ 301 | 2026-08-31 | |
| www.unusualwhales.com | ✅ 307 | 2026-08-31 | |
| www.cboe.com | ✅ 200 | 2026-08-31 | "Cboe Global Markets" returned |
| www.youtube.com | ✅ 200 | 2026-08-31 | |
| www.irs.gov | ✅ 200 | 2026-08-31 | |
| en.wikipedia.org | ✅ 200 | 2026-08-31 | Now reachable (was blocked pre-allowlist) |
| docs.alpaca.markets / alpaca.markets | ✅ | 2026-08-31 | Broker facts at source |
| play.google.com | ✅ 302 | 2026-08-31 | App-store listings |
| apps.apple.com | ✅ (404 on fake path; host answers) | 2026-08-31 | Use a real app URL |
| **www.sec.gov** | ✅ 200 **with EDGAR UA** | 2026-08-31 | 403 with a normal UA; 200 when the User-Agent is `DeltaMint research osamamaghawry@gmail.com` (SEC EDGAR requires a contact UA). Not a workaround — SEC's stated access rule |
| **Not on the allowlist — 403 at CONNECT, before the site is ever asked** | | | The gateway refuses the tunnel. Reported, not routed around. Fix is an allowlist addition |
| tiblio.com / www.tiblio.com | ❌ 403 (policy) | 2026-09-01 | **The closest named competitor** (`docs/context/positioning.md`: screener + Alpaca OAuth + order routing + position tracking, ~$35/mo). A teardown to standard is impossible until this is allowed. Highest-value single addition for vp-product |
| www.puthouse.com | ❌ 403 (policy) | 2026-09-01 | Second Alpaca-connected competitor named in positioning.md |
| wingmantracker.com / www.wingmantracker.com | ❌ 403 (policy) | 2026-09-01 | The "Wingman" teardown listed as pending in `docs/product/pricing.md` |
| optionstrat.com (apex) | ❌ 403 (policy) | 2026-09-01 | See the `www.optionstrat.com` row — the apex is where the content actually lives |
| **Reached, but the site's own bot-wall refuses (403)** | | | Allowlist is fine; the *origin* blocks datacenter traffic. Not circumventable within the rules — use WebSearch |
| www.tradersync.com | ❌ 403 (site) | 2026-09-01 | Re-tested; unchanged. Browser UA does not help |
| www.reddit.com / old.reddit.com | ✅ allowlisted, ❌ content | 2026-09-01 | **Allowlist is open** — Reddit's edge answers (`server: snooserv`). But logged-out datacenter reads are refused: `old.reddit.com/r/*/new/` 302s to `/login/?reason=lor2`, `www.reddit.com/r/*/new/.json` returns 403 + block page. Do **not** ask for the allowlist again — it is done. Quote via WebSearch; the owner verifies and posts in a browser. **Do not spoof around it** |
| oauth.reddit.com | ✅ allowlisted | 2026-09-01 | Proxy CONNECT returns 200; the 403 that follows is Reddit's own (`server: snooserv`) for an unauthenticated call. Reachable — needs only a token. An earlier test this day read as a proxy block and was wrong |
| www.reddit.com/api/v1/access_token | ✅ 401 | 2026-09-01 | Reachable; 401 = credentials missing, not blocked |
| www.g2.com | ❌ 403 (site) | 2026-08-31 | Use WebSearch review summaries |
| www.trustpilot.com | ❌ 403 (site) | 2026-08-31 | " |
| www.capterra.com | ❌ 403 (site) | 2026-08-31 | " |
| www.producthunt.com | ❌ 403 (site) | 2026-08-31 | " |
| www.theocc.com / infomemo.theocc.com | ❌ 403 (site WAF) | 2026-08-31 | Blocks datacenter traffic; WebSearch for OCC symbology/adjustment facts |
| www.investopedia.com | ⚠️ 402 | 2026-08-31 | Origin answers but gates content; WebSearch is better here |
| **Ours** | | | |
| dashboard.deltamint.app / deltamint.app | ❌ 403 at CONNECT (was ✅ 200) | 2026-09-02 | Regression: both `curl` and WebFetch to `deltamint.app/blog` now die at the proxy tunnel (`CONNECT tunnel failed, response 403`), where 2026-08-31 had it reachable. Nothing changed on our side that would explain it (no allowlist edit is in this repo's history). Could not run the seo-editor site check (structured data on `/blog`, a category hub, one post, `/sitemap.xml`, `/blog/feed.xml`) this run. Owner to check whether the allowlist entry was removed or the proxy policy changed |
| www.deltamint.app | ⚠️ 522 | 2026-08-31 | Cloudflare has no origin for the www host — cosmetic; canonical is the apex + dashboard |
| spreads.osamamaghawry.workers.dev | ✅ 301 → dashboard | 2026-08-31 | Canonical redirect confirmed live |
| yecfbeohyakuoyczvdbj.supabase.co | ❌ 403 at CONNECT | 2026-09-02 | Same regression as the `deltamint.app` row, same run: `curl -X POST .../functions/v1/sendDigest` died with `CONNECT tunnel failed, response 403` (agent-proxy status confirms `connect_rejected` for this host). This is the **production** Supabase project — the one `sendDigest` (the agent-to-owner email path) lives on. The weekly digest for 2026-09-02 could not be sent for this reason; not attempted around, per the rule above. Owner to check the egress policy for both this host and `deltamint.app` together — the timing suggests one change, not two |


Channels that are not the proxy:

- **WebSearch** — always available, runs service-side; returns page substance
  (live pricing figures verified). First resort for anything blocked.
- **Owner screenshots** — `docs/product/research/`; images are read directly.
- **Playwright + Chromium** (`/opt/pw-browsers`) — **does not currently work,
  for any host.** Tested 2026-09-01 against `www.barchart.com` and
  `en.wikipedia.org`, both of which `curl` fetches fine: Chromium gets
  `ERR_CONNECTION_RESET`, and the proxy records
  `ws_closed_mid_exchange … 1790 B sent, 39 B received` — a TLS handshake the
  browser aborts. Cause: Chromium does not read `/root/.ccr/ca-bundle.crt`; it
  wants the CA in an NSS store, and this image has neither `~/.pki/nssdb` nor
  `certutil`. Launching with `proxy: { server: process.env.HTTPS_PROXY }`
  changes nothing. Not worked around — `--ignore-certificate-errors*` is
  weakening TLS verification, which the rules forbid.
  **What to do instead:** `curl` the HTML (it trusts the bundle correctly) and
  parse it — a vendor's own page fetched this way is `verified` under the
  teardown standard, which asks for "the vendor's own docs or pricing page",
  not specifically an image. For anything that only exists after JavaScript
  runs, or behind a login, ask the owner for one screenshot into
  `docs/product/research/` and name the exact screen.
  Settled by either `certutil` + an NSS store in the image, or the ca-bundle
  installed where Chromium reads it.

## The one rule that overrides "find a workaround"

The egress allowlist is a security control the owner set deliberately. When a
domain is blocked, the workaround is **to ask the owner to allowlist it** — not
to defeat the control. Specifically forbidden, however well it works:

- spoofing a `Host:` header to reach a blocked hostname through an allowed one;
- tunnelling through an intermediary, proxy, cache, or translator to fetch a
  blocked origin;
- any technique whose purpose is to make a request the policy is set to refuse.

vp-growth's "a blocker is a finding only with a workaround" rule means
resourcefulness within the rules — a reachable alternative source, WebSearch,
an owner screenshot — never circumvention of them. An agent that finds such a
hole records it here as a hole to close and stops; it does not use it.

## Reddit API — status as of 1 Sep 2026

Attempted, not finished. What is established:

- `www.reddit.com`, `old.reddit.com` **and** `oauth.reddit.com` are all
  allowlisted. Nothing on the network side is blocking Reddit.
- Anonymous reads are refused by Reddit itself (bot gate), so the allowlist alone
  buys nothing. Authenticated access is the only path to agent-side scouting.
- **The sole remaining blocker is credentials** — a Reddit app's client id and
  secret. There is no allowlist ask left to make; do not raise one.
- Creating a Reddit **script** app is blocked at Reddit's own form: submitting
  returns a pointer to the Responsible Builder Policy, with no field-level error
  and no acknowledgement control. The owner tried it, including renaming the app
  away from "scraper" — that made no difference. This is Reddit's access-approval
  gate, not a form-entry mistake, and it is not something we can fix from our
  side or predict a date for. `support.reddithelp.com` is itself egress-blocked,
  so the policy text cannot be read from here either.
- **Treat agent-side Reddit access as unavailable indefinitely.** It is not a
  blocker to route around, ask about, or re-test on a cadence.
- **Do not raise this with the owner again.** He has been through the form and it
  does not work. No weekly ask, no status check, no "have you had a chance to".
  Do not write a play that depends on agent-side Reddit reads. Posting the queued
  replies is a browser step the owner does himself and needs none of this; if
  Reddit is ever wanted as a channel beyond that, he will say so.
