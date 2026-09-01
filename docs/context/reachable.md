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
| www.barchart.com | ✅ 200 | 2026-08-31 | Full page — "Options Screener" title returned. Playwright-screenshottable |
| www.optionstrat.com / optionstrat.com | ✅ 200/301 | 2026-08-31 | |
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
| **Reached, but the site's own bot-wall refuses (403)** | | | Allowlist is fine; the *origin* blocks datacenter traffic. Not circumventable within the rules — use WebSearch |
| www.tradersync.com | ❌ 403 (site) | 2026-08-31 | Browser UA does not help |
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
| dashboard.deltamint.app / deltamint.app | ✅ 200 | 2026-08-31 | Deploys verifiable directly |
| www.deltamint.app | ⚠️ 522 | 2026-08-31 | Cloudflare has no origin for the www host — cosmetic; canonical is the apex + dashboard |
| spreads.osamamaghawry.workers.dev | ✅ 301 → dashboard | 2026-08-31 | Canonical redirect confirmed live |


Channels that are not the proxy:

- **WebSearch** — always available, runs service-side; returns page substance
  (live pricing figures verified). First resort for anything blocked.
- **Owner screenshots** — `docs/product/research/`; images are read directly.
- **Playwright + Chromium** (`/opt/pw-browsers`) — renders and screenshots any
  reachable host; same allowlist as everything else.

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
