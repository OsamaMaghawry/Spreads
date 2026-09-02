import test from "node:test";
import assert from "node:assert/strict";
import { basisByTicker } from "./wheelBasis.ts";

// The broker records the strike as the entry price on assignment and books the
// put premium as a separate closed trade. Every wheel tracker corrects that the
// same way: adjusted basis = strike - every credit collected on the name.

const lot = (o: any = {}) => ({
  ticker: "AMD", qty: 100, acquired_price: 465, acquired_date: "2026-08-14",
  acquired_source: "assignment", chain_id: "AMD260814P00465000@2026-08-14", disposed_date: null, ...o
});
const rec = (o: any = {}) => ({
  ticker: "AMD", strategy: "wheel", net_credit: 3, qty: 1, open_date: "2026-08-01",
  close_date: "2026-08-14", chain_id: "AMD260814P00465000@2026-08-14", ...o
});

test("the assigning put's premium comes off the basis", () => {
  const b = basisByTicker([lot()], [rec()]);
  assert.equal(b.AMD.source, "adjusted");
  assert.equal(b.AMD.brokerBasis, 465, "what the broker says");
  assert.equal(b.AMD.basis, 462, "what it actually cost: 465 - 3");
  assert.equal(b.AMD.collected, 300);
});

test("later covered-call premiums keep lowering it", () => {
  const cc = rec({ chain_id: "AMD260918C00470000@2026-09-18", net_credit: 2, open_date: "2026-08-20", close_date: "2026-09-04" });
  const b = basisByTicker([lot()], [rec(), cc]);
  assert.equal(b.AMD.basis, 460, "465 - 3 (put) - 2 (call)");
  assert.equal(b.AMD.collected, 500);
});

test("a credit sold BEFORE the shares arrived is not this cycle's", () => {
  const earlier = rec({ chain_id: "AMD260731C00480000@2026-07-31", net_credit: 9, open_date: "2026-07-01", close_date: "2026-07-31" });
  const b = basisByTicker([lot()], [rec(), earlier]);
  assert.equal(b.AMD.basis, 462, "the July call was a different cycle");
});

test("shares with no chain keep the broker's basis, and say so", () => {
  const b = basisByTicker([lot({ chain_id: null, acquired_source: "trade" })], [rec()]);
  assert.equal(b.AMD.source, "broker");
  assert.equal(b.AMD.basis, 465);
  assert.equal(b.AMD.collected, 0, "nothing can be attributed without a chain");
});

test("a chain whose put is not in the records is treated as unchained", () => {
  const b = basisByTicker([lot()], []);
  assert.equal(b.AMD.source, "broker");
  assert.equal(b.AMD.basis, 465);
});

test("premium is spread across every share held in the name", () => {
  // Two assignments, 200 shares, one 1-contract call sold afterwards for $2.
  const l1 = lot();
  const l2 = lot({ acquired_price: 455, chain_id: "AMD260821P00455000@2026-08-21", acquired_date: "2026-08-21" });
  const p2 = rec({ chain_id: l2.chain_id, net_credit: 4, close_date: "2026-08-21" });
  const cc = rec({ chain_id: "AMD260918C00470000@2026-09-18", net_credit: 2, open_date: "2026-08-25", close_date: "2026-09-04" });
  const b = basisByTicker([l1, l2], [rec(), p2, cc]);
  // broker basis (465*100 + 455*100)/200 = 460; credits 300 + 400 + 200 = 900; /200 = 4.50
  assert.equal(b.AMD.brokerBasis, 460);
  assert.equal(b.AMD.collected, 900);
  assert.equal(b.AMD.basis, 455.5);
  assert.equal(b.AMD.shares, 200);
});

test("non-wheel records and debit rows are ignored", () => {
  const spread = rec({ strategy: "spreads", chain_id: "x", net_credit: 50, open_date: "2026-08-20" });
  const debit = rec({ chain_id: "y", net_credit: -1.5, open_date: "2026-08-20" });
  const b = basisByTicker([lot()], [rec(), spread, debit]);
  assert.equal(b.AMD.basis, 462);
});

test("disposed lots and other tickers do not leak in", () => {
  const sold = lot({ disposed_date: "2026-08-30" });
  const other = lot({ ticker: "NVDA", chain_id: "NVDA@x" });
  const b = basisByTicker([sold, other], [rec()]);
  assert.equal(b.AMD, undefined, "nothing held in AMD");
  assert.equal(b.NVDA.source, "broker");
});

test("no lots means no basis at all", () => {
  assert.deepEqual(basisByTicker([], [rec()]), {});
  assert.deepEqual(basisByTicker(null as any, null as any), {});
});
