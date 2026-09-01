# Ideas — the waiting room

Unevidenced ideas wait here. No cadence reads this file; nothing in it is
work. `vp-product` may promote an entry to the backlog only when evidence
arrives, and deletes freely.

Seeded from things this week's engineering surfaced but nobody has validated
with a user:

- Alert center in the app (the `positionWatch` alerts table will need a surface)
- Multi-broker support beyond Alpaca (the positioning doc's admitted biggest gap)
- Expand scan universe beyond the S&P 500 list in `src/lib/sp500.js` —
  **returned from the backlog 2026-09-01.** Carries a verified competitor fact
  (teardown row E8: Barchart sweeps the full optionable US+Canada universe,
  ETFs and indices included) but no way to test demand: nothing records a scan,
  and `scan_last_used` keeps one overwritten row per user, not a history. It
  returns to the backlog when `scan_runs` exists and the number clears the bar,
  or when a user asks for it in their own words.
- An open-interest / volume floor on scan results, Barchart-style (row E3) —
  parked behind the cheaper width test in backlog #1; needs a new field plumbed
  from Alpaca's `/options/contracts`, where width needs nothing.
- Surface `order_attempts` to the user ("what did the app actually try?") —
  the table shipped 2026-08-31 with RLS letting a user read their own rows, and
  there is no screen. Post-first-trade, so it is trust and retention, not
  activation; needs a user asking for it before it competes for a slot.
- Debit-spread support surfaced properly (riskOf math exists; UX does not)
- Index/cash-settled products once Alpaca takes them out of paper-only
