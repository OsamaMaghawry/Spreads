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
| www.tastylive.com | ✅ 200 | 2026-08-31 | |
| www.tastytrade.com | ✅ 301 | 2026-08-31 | |
| www.cboe.com | ✅ 200 | 2026-08-31 | "Cboe Global Markets" returned |
| www.youtube.com | ✅ 200 | 2026-08-31 | |
| www.irs.gov | ✅ 200 | 2026-08-31 | |
| en.wikipedia.org | ✅ 200 | 2026-08-31 | Now reachable (was blocked pre-allowlist) |
| docs.alpaca.markets / alpaca.markets | ✅ | 2026-08-31 | Broker facts at source |
| play.google.com | ✅ 302 | 2026-08-31 | App-store listings |
| apps.apple.com | ✅ (404 on fake path; host answers) | 2026-08-31 | Use a real app URL |
| **www.sec.gov** | ✅ 200 **with EDGAR UA** | 2026-08-31 | 403 with a normal UA; 200 when the User-Agent is `DeltaMint research osamamaghawry@gmail.com` (SEC EDGAR requires a contact UA). Not a workaround — SEC's stated access rule |
| **`www.` allowlisted, apex NOT — the redirect dies at the hop** | | | The register's own warning, in reverse. A 30x status here is **not** success: nothing was ever fetched |
| www.marketchameleon.com → marketchameleon.com | ❌ 302 → apex EGRESS_BLOCKED | 2026-09-01 | Earlier row read "✅ 302" — that 302 was the redirect, not content. `/Account/Subscribe` 302s to the blocked apex. Pricing unverifiable; WebSearch only |
| www.optionstrat.com → optionstrat.com | ❌ 301 → apex EGRESS_BLOCKED | 2026-09-01 | Earlier rows called this ✅ then a site bot-wall; it is neither. Proxy answers 403 to CONNECT for the **apex**. `/pricing` 301s to apex `/` |
| www.unusualwhales.com → unusualwhales.com | ❌ 307 → apex EGRESS_BLOCKED | 2026-09-01 | Same pattern. Ask the owner to allowlist the three apexes; `www.` alone is useless for all of them |
| **Reached, but the site's own bot-wall refuses (403)** | | | Allowlist is fine; the *origin* blocks datacenter traffic. Not circumventable within the rules — use WebSearch |
| www.tradersync.com | ❌ 403 (site) | 2026-08-31 | Browser UA does not help |
| www.reddit.com / old.reddit.com | ❌ 403 (site) | 2026-08-31 | Reddit blocks datacenter IPs regardless of UA. Quote via WebSearch; the owner verifies in a browser. **Do not spoof around it** |
| www.g2.com | ❌ 403 (site) | 2026-08-31 | Use WebSearch review summaries |
| www.trustpilot.com | ❌ 403 (site) | 2026-08-31 | " |
| www.capterra.com | ❌ 403 (site) | 2026-08-31 | " |
| www.producthunt.com | ❌ 403 (site) | 2026-08-31 | " |
| www.theocc.com / infomemo.theocc.com | ❌ 403 (site WAF) | 2026-08-31 | Blocks datacenter traffic; WebSearch for OCC symbology/adjustment facts |
| www.tiblio.com / tiblio.com | ❌ EGRESS_BLOCKED (proxy) | 2026-09-01 | Not on the allowlist at all (proxy-level block, not a site 403). WebSearch for Tiblio facts; this is our closest named competitor per positioning.md, so worth an allowlist add |
| puthouse.com / www.puthouse.com | ❌ EGRESS_BLOCKED (proxy) | 2026-09-01 | Both hosts denied at CONNECT. Alpaca's own blog post about PutHouse **is** reachable (alpaca.markets) and is the better source anyway |
| optionalpha.com | ❌ EGRESS_BLOCKED (proxy) | 2026-09-01 | `www.optionalpha.com` returns 301 and looks allowlisted, but it redirects to the blocked apex — same trap as the group above |
| tradesteward.com / www.tradesteward.com | ❌ EGRESS_BLOCKED (proxy) | 2026-09-01 | Both denied at CONNECT. WebSearch only |
| quantwheel.com / www.quantwheel.com | ❌ EGRESS_BLOCKED (proxy) | 2026-09-01 | Both denied at CONNECT. **Priority allowlist request** — QuantWheel appears to have repositioned into post-fill position management, which bears on positioning.md's one "uncontested" claim, and it cannot be checked at source |
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
