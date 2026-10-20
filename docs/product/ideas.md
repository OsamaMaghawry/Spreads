# Ideas — the waiting room

Unevidenced ideas wait here. No cadence reads this file; nothing in it is
work. `vp-product` may promote an entry to the backlog only when evidence
arrives, and deletes freely.

Last pruned 2026-10-20.

- **Record what was scanned (`scan_runs`)** — killed from the backlog
  2026-10-20 after half-shipping: Claude-connector scans are logged in
  `connector_calls` (migration 0059); Scanner scans and all scan *results*
  are not. Returns when there are enough users that asking them is slower
  than counting — roughly 25 connected accounts — or when a screener
  question comes up that the connector log and a conversation cannot answer.
- **Tell a user their broker connection dropped, and how to reconnect** —
  the funnel's connected count fell 4 → 3 between the 23 and 27 Sep snapshots
  and has stayed there. Cause unknown: a token that lapsed, a deliberate
  disconnect, or the owner deleting a test account. Promote only if
  funnel-instrumentation finds it was involuntary.
- **Claude connector that can place orders** — Alpaca's own free MCP server
  already places multi-leg orders (verified, `docs.alpaca.markets`, 20 Oct).
  Ours is read-only by design (`docs/product/connector.md`). No user has
  asked for writes; parity with a free broker tool is not a reason. Needs a
  user asking, and agent-manager's money-path view, before it competes.
- Alert center in the app (the `positionWatch` alerts table still has no
  surface, and the watch still emails only the owner — pricing decision 8)
- Multi-broker support beyond Alpaca — Tradier and SnapTrade are built as
  lab evaluations on staging (`docs/product/broker-apis.md`); both wait on
  owner credentials or a SnapTrade answer (`docs/ops/queue.md`).
- Surface `order_attempts` to the user ("what did the app actually try?") —
  post-first-trade, so trust and retention, not activation; needs a user
  asking for it.
- Debit-spread support surfaced properly (riskOf math exists; UX does not)
- Index/cash-settled products once Alpaca takes them out of paper-only

Removed 2026-10-20:

- *Expand scan universe beyond the S&P 500* — shipped 9–22 Sep on the
  owner's request ("Entire market — filtered below", `scanUniverse`).
- *Open-interest / volume floor, Barchart-style* — folded into backlog #1,
  whose cost section now carries it.
