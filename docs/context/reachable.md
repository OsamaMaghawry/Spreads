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
| www.barchart.com | ⚠️ 202 WAF challenge | 2026-10-20 | **Changed since 1 Sep.** `/membership-comparison` now answers `HTTP/2 202`, `content-length: 0`, `x-amzn-waf-action: challenge` (AWS WAF via CloudFront) — with or without a browser User-Agent. The allowlist is fine; Barchart's own edge now wants a JavaScript challenge solved, which curl cannot do and Playwright cannot reach (Chromium row below). Not routed around. vp-product used WebSearch instead (Premier $29.95/mo, $239.95/yr reported by several 2026 reviews, `reported` not `verified`). Settled by one owner screenshot of `/membership-comparison` into `docs/product/research/`. Earlier note, 2026-09-01: Full page. Membership pricing readable without a login at `/membership-comparison` and `/get-barchart-premier`; `/solutions` is the *enterprise* page and carries no consumer prices. `/membership`, `/pricing`, `/premier`, `/subscribe`, `/my/subscribe` all 404 — don't guess the path, follow the `data-ng-href` links off any screener page. **Not** Playwright-screenshottable (see the Chromium row below) |
| www.optionstrat.com | ⚠️ 301 → dead | 2026-09-01 | `www.` is allowlisted but OptionStrat 301s *every* path to the apex `optionstrat.com`, which is **not** allowlisted → 403 at CONNECT on the hop. Net effect: OptionStrat is unreachable. The 2026-08-31 row read "✅ 200/301" because only the redirect status was checked, not the hop. Fix is one allowlist addition: `optionstrat.com` |
| www.marketchameleon.com | ✅ 302 | 2026-08-31 | |
| www.tastylive.com | ✅ 200 | 2026-08-31 | |
| www.tastytrade.com | ✅ 301 | 2026-08-31 | |
| www.unusualwhales.com | ✅ 307 | 2026-08-31 | |
| www.cboe.com | ✅ 200 | 2026-08-31 | "Cboe Global Markets" returned |
| www.youtube.com | ✅ 200 | 2026-08-31 | |
| www.irs.gov | ✅ 200 | 2026-08-31 | |
| en.wikipedia.org | ✅ 200 | 2026-08-31 | Now reachable (was blocked pre-allowlist) |
| docs.alpaca.markets / alpaca.markets | ✅ | 2026-10-20 | Broker facts at source. `docs.alpaca.markets/docs/alpaca-mcp-server` 301s to a page that returns 200 with full text (curl `-L`) — Alpaca's own MCP server, read 2026-10-20 by vp-product |
| www.optionalpha.com | ⚠️ 301 → dead | 2026-10-20 | Same trap as OptionStrat: `www.` answers 301 to the apex `optionalpha.com`, which fails at CONNECT. Fix is one allowlist addition: `optionalpha.com` |
| github.com | ❌ 403 | 2026-10-20 | `github.com/alpacahq/alpaca-mcp-server` returned 403 to curl. Not investigated further (vendor docs page above carries the same facts); use `gh` (preconfigured for the proxy) if a repo read is ever needed |
| play.google.com | ✅ 302 | 2026-08-31 | App-store listings |
| apps.apple.com | ✅ (404 on fake path; host answers) | 2026-08-31 | Use a real app URL |
| **www.sec.gov** | ✅ 200 **with EDGAR UA** | 2026-08-31 | 403 with a normal UA; 200 when the User-Agent is `DeltaMint research osamamaghawry@gmail.com` (SEC EDGAR requires a contact UA). Not a workaround — SEC's stated access rule |
| **Not on the allowlist — 403 at CONNECT, before the site is ever asked** | | | The gateway refuses the tunnel. Reported, not routed around. Fix is an allowlist addition |
| tiblio.com / www.tiblio.com | ❌ 403 (policy) | 2026-09-01 | **The closest named competitor** (`docs/context/positioning.md`: screener + Alpaca OAuth + order routing + position tracking, ~$35/mo). A teardown to standard is impossible until this is allowed. Highest-value single addition for vp-product |
| tiblio.ai / www.tiblio.ai | ❌ 403 (policy) | 2026-10-20 | Tiblio's press uses "Tiblio AI"; the `.ai` host fails at CONNECT like `.com`. `tiblio.com` re-tested the same day: still 403 at CONNECT. Tiblio's price is now unverifiable three ways (third-party listings say $34.95, $38 and $49.99) |
| public.com | ❌ 403 (policy) | 2026-10-20 | Public's brokerage MCP guide (`/learn/trade-stocks-options-crypto-using-claude`). curl fails at CONNECT; WebFetch reports DNS failure. Fact taken from WebSearch summary only, `reported` |
| quantwheel.com, tradesteward.com, optionclaws.com | ❌ 403 (policy) | 2026-10-20 | All fail at CONNECT. "OptionClaws" (named in `docs/product/connector.md`) returns nothing on WebSearch either — its existence is unverified |
| www.puthouse.com | ❌ 403 (policy) | 2026-10-20 | Re-tested; unchanged. WebSearch for "Puthouse options Alpaca" returns nothing relevant — the competitor named in positioning.md cannot be confirmed to exist from any reachable source | Second Alpaca-connected competitor named in positioning.md |
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
| dashboard.deltamint.app / deltamint.app | ❌ 403 (policy, at CONNECT) | 2026-10-20 | Re-tested 20 Oct by vp-product: still 403 at CONNECT. Earlier: | Was ✅ 200 on 2026-08-31; blocked since 31 Aug per `docs/ops/queue.md`'s 2026-09-02 allowlist item (already open, not re-escalated here). Re-tested 04 Sep: `/`, `/blog`, `/pricing` and `dashboard.deltamint.app` all 403 at the proxy CONNECT, same failure mode as the other allowlist rows above — not a site-side issue |
| www.deltamint.app | ⚠️ 522 | 2026-08-31 | Cloudflare has no origin for the www host — cosmetic; canonical is the apex + dashboard |
| spreads.osamamaghawry.workers.dev | ✅ 301 → dashboard | 2026-08-31 | Canonical redirect confirmed live |
| wpwaomzgpbozzghohwmf.supabase.co (staging project, edge functions) | ❌ 403 (policy, at CONNECT) | 2026-09-14 | Tested for the first time by duty-engineer, looking for any reachable `sendDigest` after the production one failed. Blocked identically. **So no Supabase host of ours is reachable from a session** — the brief's "email the owner through `sendDigest`" step cannot run at all, on either project. Also tried `email-digest.yml` (this repo's CI substitute): `workflow_dispatch` returns `403 Resource not accessible by integration` for the session token. Recorded, not routed around; filed as a `needs owner` item in `docs/ops/queue.md` |
| yecfbeohyakuoyczvdbj.supabase.co (production project, edge functions incl. `sendDigest`) | ❌ 403 (policy, at CONNECT) | 2026-09-09 | duty-engineer tried to email the owner via `sendDigest` per its brief (`.claude/agents/duty-engineer.md`) over a live production security finding and got `CONNECT tunnel failed, response 403` — same failure mode as `deltamint.app`. Not tested before; needs an allowlist addition alongside the `dashboard.deltamint.app` item already open in `docs/ops/queue.md` if the duty-engineer email step is meant to work from this environment. Worked around by using `PushNotification` to reach the owner directly instead — recorded, not routed around |


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
