import test from "node:test";
import assert from "node:assert/strict";
import { brokerView, coverageGaps } from "./brokerView.ts";
import { pairSpreads } from "./spreadPairing.ts";

const pos = (symbol: string, qty: string, extra: any = {}) => ({
  symbol, qty, avg_entry_price: "10", current_price: "12",
  market_value: "1200", cost_basis: "1000", unrealized_pl: "200", unrealized_plpc: "0.2", ...extra
});

test("every line the broker sends comes through, with the broker's own numbers", () => {
  const v = brokerView([pos("TSLA260918C00362500", "-2"), pos("TSLA", "210")]);
  assert.equal(v.length, 2);
  const call = v.find((r) => r.assetClass === "option")!;
  assert.equal(call.qty, -2);
  assert.equal(call.side, "short");
  assert.equal(call.strike, 362.5);
  assert.equal(call.optionType, "C");
  assert.equal(call.unrealizedPL, 200, "the broker's figure, not one of ours");
  assert.equal(call.closeAction, "buy_to_close");
  const stock = v.find((r) => r.assetClass === "equity")!;
  assert.equal(stock.qty, 210);
  assert.equal(stock.closeAction, "sell_to_close");
});

test("qty_available is passed through, never recomputed", () => {
  const [r] = brokerView([pos("TSLA", "210", { qty_available: "150" })]);
  assert.equal(r.qty, 210);
  assert.equal(r.qtyAvailable, 150);
});

test("an adjusted contract is flagged, and nothing here depends on the flag", () => {
  const [r] = brokerView([pos("AAPL1260918C00250000", "-1")]);
  assert.equal(r.adjusted, true);
  assert.equal(r.qty, -1, "still a row, still closable");
  assert.equal(r.closeAction, "buy_to_close");
});

// --- The check this whole view exists for ----------------------------------

test("no gaps when the dashboard accounts for everything the broker holds", () => {
  const raw = [
    { symbol: "TSLA", qty: "210", avg_entry_price: "364.31", current_price: "366", market_value: "76860" },
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17" },
    { symbol: "TSLA260918C00362500", qty: "-2", avg_entry_price: "8.69", current_price: "12" }
  ];
  const rows = pairSpreads(raw, [], [], { cash: 0 });
  assert.deepEqual(coverageGaps(raw, rows), []);
});

test("a contract the dashboard drops is named, with how much is missing", () => {
  const raw = [
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17" },
    { symbol: "TSLA260918C00362500", qty: "-2", avg_entry_price: "8.69", current_price: "12" }
  ];
  const rows = pairSpreads(raw, [], [], { cash: 0 });
  // Drop one row on purpose — this is the 8 Sep failure, simulated.
  const gaps = coverageGaps(raw, rows.slice(0, 1));
  assert.ok(gaps.length > 0, "a hidden position must be reported, not inferred by eye");
  for (const g of gaps) assert.notEqual(g.missing, 0);
});

test("a quantity shown short of what is held is a gap too, not just a whole missing row", () => {
  const raw = [{ symbol: "X260918C00100000", qty: "-10", avg_entry_price: "1", current_price: "1" }];
  const shown = [{ type: "naked_call", qty: 3, legs: [{ symbol: "X260918C00100000", side: "short", ratio: 1 }] }];
  const [g] = coverageGaps(raw, shown);
  assert.equal(g.broker, -10);
  assert.equal(g.dashboard, -3);
  assert.equal(g.missing, -7);
});

test("something on screen the broker does not report is also a gap", () => {
  const shown = [{ type: "naked_call", qty: 1, legs: [{ symbol: "GHOST", side: "short", ratio: 1 }] }];
  const [g] = coverageGaps([], shown);
  assert.equal(g.symbol, "GHOST");
  assert.equal(g.broker, 0);
});

test("a fractional share is not a missing position", () => {
  const raw = [{ symbol: "TSLA", qty: "210.00001", avg_entry_price: "1", current_price: "1" }];
  const shown = [{ type: "shares", shares: true, qty: 210, shareQty: 210, longSymbol: "TSLA" }];
  assert.deepEqual(coverageGaps(raw, shown), []);
});
