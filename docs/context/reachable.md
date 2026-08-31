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
| dashboard.deltamint.app | ✅ 200 | 2026-08-31 | Our app — deploys verifiable directly |
| deltamint.app | ✅ 200 | 2026-08-31 | Landing |
| spreads.osamamaghawry.workers.dev | ✅ 301 → dashboard | 2026-08-31 | Canonical redirect confirmed live |
| optionstrat.com | ✅ 200 | 2026-08-31 | Full page content |
| docs.alpaca.markets | ✅ 302 → /us/ | 2026-08-31 | Broker docs at source |
| barchart.com | ❌ EGRESS_BLOCKED | 2026-08-31 | WebFetch refused at the proxy (earlier curl saw 301 → www; either way unreachable). Barchart teardown done via WebSearch instead |
| www.barchart.com | ❌ EGRESS_BLOCKED | 2026-08-31 | WebFetch refused at the proxy. Owner to add `www.barchart.com`; until then Barchart facts come from WebSearch, and two owner screenshots are requested in `docs/product/teardowns/barchart-options-screener.md` (`barchart-bull-put-screener-filters.png`, `barchart-premier-pricing.png`) |
| reddit.com | ⚠️ 301 → www (blocked) | 2026-08-31 | Blocked until the owner adds `www.reddit.com` / `old.reddit.com` to the allowlist. **Do not route around the block with a mismatched `Host:` header** — that circumvents a security control the owner set, and it is not an approved technique here (see the rule below). Until then, Reddit facts come from WebSearch |
| youtube.com | ⚠️ 301 → www (blocked) | 2026-08-31 | Owner to add `www.youtube.com` |
| g2.com | ⚠️ 301 → www (blocked) | 2026-08-31 | Owner to add `www.g2.com` |
| apps.apple.com | ⚠️ 301 | 2026-08-31 | Follow-up hop untested |
| www.trustpilot.com | ❌ 000 | 2026-08-31 | Owner to add |
| www.cboe.com | ❌ 000 | 2026-08-31 | Owner to add |
| infomemo.theocc.com | ❌ 000 | 2026-08-31 | Owner to add |
| theocc.com | ❌ 403 (their WAF) | 2026-08-31 | Likely blocks datacenter traffic regardless — use WebSearch for OCC facts |
| www.optionstrat.com | ❌ EGRESS_BLOCKED | 2026-08-30 | Apex works; www not listed |
| en.wikipedia.org | ❌ EGRESS_BLOCKED | 2026-08-30 | Use WebSearch |
| www.tradersync.com, optionalpha.com, tastylive.com, unusualwhales.com, marketchameleon.com | untested since allowlist change | — | Re-test on first use, record here |

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
