# Ideas — the waiting room

Unevidenced ideas wait here. No cadence reads this file; nothing in it is
work. `vp-product` may promote an entry to the backlog only when evidence
arrives, and deletes freely.

- Alert center in the app (the `positionWatch` alerts table will need a
  surface). Note: the *recipient* half of this is now backlog #1; a screen that
  reads `alerts` is still nobody's request.
- Multi-broker support beyond Alpaca (the positioning doc's admitted biggest
  gap)
- ~~Expand scan universe beyond the S&P 500 list~~ — **shipped, 2026-09-09
  or earlier**, without passing through the backlog: `_shared/universe.ts`
  sweeps every listed US equity behind a price band, a shares-traded floor, a
  share-quote-width cap and a capital-per-contract cap
  (`src/components/scanner/ScannerConfig.jsx`, universe `market`). Teardown row
  E8's gap (Barchart sweeps the full optionable universe; we shipped an S&P
  list) is closed for equities and still open for ETFs and indices — the index
  half is backlog #3. Kept here struck through rather than deleted, because the
  fact that a killed idea shipped anyway is a finding about the loop.
- An open-interest / volume floor on **option** results, Barchart-style
  (teardown row E3) — parked behind the cheaper quoted-width test in backlog
  #2; needs a new field plumbed from Alpaca's `/options/contracts`, where
  width needs nothing. Note the shipped `minVolume` sieve is the **share's**
  volume, not the contract's.
- Surface `order_attempts` to the user ("what did the app actually try?") —
  the table shipped 2026-08-31 with RLS letting a user read their own rows, and
  there is still no screen. Post-first-trade, so it is trust and retention, not
  activation; needs a user asking for it before it competes for a slot.
- Debit-spread support surfaced properly (riskOf math exists; UX does not)
- **Probability-of-profit column and sort — returned from the backlog
  2026-09-22.** Killed there; see `backlog.md` § Killed. Carries verified
  teardown row **E4**: Barchart's bull-put screener defaults to descending
  break-even probability and shows probability of loss per row. It comes back
  when a user asks for it in their own words, or when
  `_shared/optionScan.ts` `impliedVol()` gains a provenance flag for some other
  reason (today it silently returns a hard-coded `0.25` when the bisection
  cannot bracket a root) and the column becomes nearly free.
- **`scan_runs` — record what was scanned — returned from the backlog
  2026-09-22.** Killed on its own criterion at n=4 users. The observation
  stands: nothing records a scan, anywhere. **Trigger to return: the month
  signups exceed ~25**, when a share computed from scans stops being one
  person's afternoon.
- ~~Index/cash-settled products once Alpaca takes them out of paper-only~~ —
  **promoted to backlog #3 on 2026-09-22.** The trigger fired: Alpaca launched
  **live** index options (SPX, SPXW, VIX, VIXW, DJX, XSP) via the Trading API
  on 2026-09-02, verified at source.
