import test from "node:test";
import assert from "node:assert/strict";
import { closeShortfall, closeRefusal } from "./closeCheck.ts";

// The owner's INTC 1x99 / 2x100 call ratio on Alton Live, and the close the
// page sent for it: buy back the two 100s, sell the 99.
const close = [
  { symbol: "INTC261023C00100000", action: "buy_to_close", ratio: 2 },
  { symbol: "INTC261023C00099000", action: "sell_to_close", ratio: 1 }
];
const book = [
  { symbol: "INTC", qty: "200", side: "long" },
  { symbol: "INTC261023P00095000", qty: "1", side: "long" },
  { symbol: "INTC261023C00100000", qty: "-2", side: "short" },
  { symbol: "INTC261023C00099000", qty: "1", side: "long" }
];

test("close: a position still held, nothing working against it, goes through", () => {
  assert.equal(closeShortfall(close, 1, book, []), null);
});

test("close: the second send of a close that already filled is stopped, in plain words", () => {
  // After 16:39:40 the calls were gone; the shares and the put remained.
  const after = book.filter((p) => !p.symbol.startsWith("INTC261023C"));
  const problem = closeShortfall(close, 1, after, []);
  assert.deepEqual(problem, { reason: "missing", symbol: "INTC261023C00100000", held: 0, need: 2 });
  assert.match(closeRefusal(problem)!, /no longer holds the INTC 2026-10-23 100 call/);
  assert.match(closeRefusal(problem)!, /that order went through/);
});

test("close: contracts a working close already holds are not offered twice", () => {
  const working = [{
    id: "a", order_class: "mleg", qty: "1", filled_qty: "0",
    legs: [
      { symbol: "INTC261023C00100000", side: "buy", ratio_qty: "2", position_intent: "buy_to_close" },
      { symbol: "INTC261023C00099000", side: "sell", ratio_qty: "1", position_intent: "sell_to_close" }
    ]
  }];
  const problem = closeShortfall(close, 1, book, working);
  assert.equal(problem?.reason, "working");
  assert.match(closeRefusal(problem)!, /already closing/);
  // Once it has filled, it no longer holds anything.
  assert.equal(closeShortfall(close, 1, book, [{ ...working[0], filled_qty: "1" }]), null);
});

test("close: more than is held is refused with the number held", () => {
  const problem = closeShortfall(close, 2, book, []);
  assert.deepEqual(problem, { reason: "missing", symbol: "INTC261023C00100000", held: 2, need: 4 });
  assert.match(closeRefusal(problem)!, /holds 2 .* would close 4/);
});

test("close: a short read as short from its side alone; the wrong way round is not held", () => {
  const sideOnly = book.map((p) => (p.symbol === "INTC261023C00100000" ? { ...p, qty: "2" } : p));
  assert.equal(closeShortfall(close, 1, sideOnly, []), null);
  // Selling to close a contract the account is short is not a close.
  const wrong = [{ symbol: "INTC261023C00100000", action: "sell_to_close", ratio: 1 }];
  assert.equal(closeShortfall(wrong, 1, book, [])?.reason, "missing");
});

test("close: shares are left to the broker", () => {
  assert.equal(closeShortfall([{ symbol: "INTC", action: "sell_to_close" }], 300, book, []), null);
});
