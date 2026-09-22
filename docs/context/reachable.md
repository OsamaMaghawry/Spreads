# Reachability register

What the environment's network can actually reach, tested — not assumed.
Check here before declaring anything blocked; add a row when you learn
something; **never report "blocked" without a row here and the workaround you
used instead.** The egress allowlist is an environment setting the owner
controls; additions go to him with the exact hostname.

The allowlist matches **exact hostnames** — an allowed apex whose site 301s to
`www.` dies at the hop unless `www.` is also listed.

**The `www.` → apex trap is the single biggest cause of false "reachable" rows
in this file, and on 2026-09-22 it was found to account for four of them.** A
row recorded from a bare status code (`301`, `302`, `308`) says only that the
redirect was issued; the hop to the apex is a *second* CONNECT, and if the apex
is not allowlisted it is refused. **Test with `curl -sL` and read
`%{url_effective}` and `%{size_download}`, never the first status line.**
Affected and re-tested 2026-09-22: `optionstrat`, `marketchameleon`,
`optionalpha`, `wingmantracker` — all four are `www.`-allowlisted and all four
are unreachable in practice. The fix in every case is one allowlist addition:
the apex.

**Net position as of 2026-09-22: no competitor site is directly fetchable.**
Barchart — the only vendor whose pricing page we had ever fetched at source —
went behind an AWS WAF challenge some time after 2026-09-01. Everything
competitor-side is now `reported` via WebSearch until an apex is allowlisted or
the owner drops a screenshot into `docs/product/research/`. This is recorded
here, not routed around.

| Host | Status | Tested | Note |
| --- | --- | --- | --- |
| **Fetch + real content** | | | Allowlist open AND the site serves us |
| alpaca.markets (incl. `/blog/*`) | ✅ 200 | 2026-09-22 | **Newly useful, and the best competitor route left.** Alpaca publishes a capability write-up for each app that integrates its APIs, so a blocked competitor's own behaviour can be sourced `verified` from the broker: `alpaca.markets/blog/puthouse-integrates-with-alpacas-trading-api-to-automate-options-income-strategies` (27 Jul 2026) describes PutHouse's automation in detail, and `/blog/alpaca-launches-index-options-via-trading-api` (02 Sep 2026) is the source for live index options. Only partners Alpaca has chosen to write up are covered — `?s=<name>` searches for tiblio, quantwheel, wingman and trade-steward all return the same shell page, i.e. no post. Bare `alpaca.markets/blog` index lists only a handful; guess the slug from WebSearch and fetch it directly |
| docs.alpaca.markets | ✅ 200 | 2026-09-22 | Deep paths fine (`/docs/options-trading` 200, redirecting to `/us/docs/...`). The bare host root returned `000` in the same run — **do not read that as blocked**; use a real doc path |
| www.barchart.com | ⚠️ **202, empty** | **2026-09-22** | **Regression.** Was ✅ 200 full page on 2026-09-01. `HEAD` still answers 200, and every `GET` (including with a browser UA and `--compressed`) now returns **HTTP 202 with a 2 KB AWS WAF challenge shell** — `window.awsWafCookieDomainList`, `gokuProps`, and a `token.awswaf.com/challenge.js`. Not an allowlist problem and not fixable by an allowlist addition; it is the origin's bot wall, and solving a JS challenge is not something to do. **Consequence: teardown row E6 (Barchart Premier $29.95/mo), our only directly-fetched competitor price, can no longer be re-verified at source.** Worked around by WebSearch (monthly $29.95 re-confirmed 2026-09-22; the annual figure now conflicts — see `docs/product/teardowns/barchart-options-screener.md`). An owner screenshot of `/membership-comparison` would settle it |
| www.optionstrat.com | ⚠️ 301 → dead | 2026-09-01 | `www.` is allowlisted but OptionStrat 301s *every* path to the apex `optionstrat.com`, which is **not** allowlisted → 403 at CONNECT on the hop. Net effect: OptionStrat is unreachable. The 2026-08-31 row read "✅ 200/301" because only the redirect status was checked, not the hop. Fix is one allowlist addition: `optionstrat.com` |
| www.marketchameleon.com | ⚠️ **301 → dead** | **2026-09-22** | **Corrected.** The 2026-08-31 row read "✅ 302" from the redirect status alone. Every path — `/`, `/Account/Subscribe`, `/Reports/OptionScreener` — redirects to the apex `marketchameleon.com`, which is **not** allowlisted: `connect_rejected` at CONNECT, 0 bytes. Market Chameleon is unreachable. It matters more than it did: it is the competitor that exposes an **ATM bid-ask-spread** screener filter, which is backlog #2's comparison row. Fix is one allowlist addition: `marketchameleon.com` |
| www.optionalpha.com | ⚠️ **301 → dead** | **2026-09-22** | New row. `www.` answers 301; the hop to the apex `optionalpha.com` is `connect_rejected`. Previously recorded only as an allowlist *ask* in `pricing.md` §6 decision 9. Fix: allowlist `optionalpha.com` |
| www.wingmantracker.com | ⚠️ **308 → dead** | **2026-09-22** | **Corrected.** The 2026-09-01 row said 403 at CONNECT for both hosts; `www.` in fact answers **308**, and it is the apex hop that is refused. Fix: allowlist `wingmantracker.com` |
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
| www.puthouse.com / puthouse.com | ❌ 403 (policy) | 2026-09-22 | Re-tested, unchanged. Second Alpaca-connected competitor named in positioning.md. **Worked around**: Alpaca's own integration write-up (see the `alpaca.markets` row) yields a `verified` capability description without the vendor site — used for the 2026-09-22 positioning update |
| wingmantracker.com (apex) | ❌ 403 (policy) | 2026-09-22 | The apex is where the site actually lives; `www.` 308s to it. See the `www.wingmantracker.com` row |
| optionalpha.com (apex) | ❌ 403 (policy) | 2026-09-22 | See the `www.optionalpha.com` row |
| marketchameleon.com (apex) | ❌ 403 (policy) | 2026-09-22 | See the `www.marketchameleon.com` row |
| quantwheel.com | ❌ 403 (policy) | 2026-09-22 | First test. Named in positioning.md and priced `reported, self-inconsistent` in `pricing.md` |
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
| dashboard.deltamint.app / deltamint.app | ❌ 403 (policy, at CONNECT) | **2026-09-22** (re-tested; unchanged since 2026-09-04) | Was ✅ 200 on 2026-08-31; blocked since 31 Aug per `docs/ops/queue.md`'s 2026-09-02 allowlist item (already open, not re-escalated here). Re-tested 04 Sep: `/`, `/blog`, `/pricing` and `dashboard.deltamint.app` all 403 at the proxy CONNECT, same failure mode as the other allowlist rows above — not a site-side issue |
| www.deltamint.app | ⚠️ 522 | 2026-08-31 | Cloudflare has no origin for the www host — cosmetic; canonical is the apex + dashboard |
| spreads.osamamaghawry.workers.dev | ✅ 301 → dashboard | 2026-08-31 | Canonical redirect confirmed live |
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
