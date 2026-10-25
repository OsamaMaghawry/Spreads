import test from "node:test";
import assert from "node:assert/strict";
import { comboOf, keyWarning, cleanHotkeys, suggestedHotkeys, describe, hotkeyOrder } from "./hotkeys.js";

const key = (code, key, mods = {}) => ({ code, key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

test("a key press as text: modifiers first, letters and digits by position", () => {
  assert.equal(comboOf(key("KeyB", "B", { shiftKey: true })), "Shift+B");
  assert.equal(comboOf(key("Digit1", "!", { shiftKey: true })), "Shift+1");
  assert.equal(comboOf(key("KeyQ", "q", { ctrlKey: true, altKey: true })), "Ctrl+Alt+Q");
  assert.equal(comboOf(key("F2", "F2")), "F2");
  assert.equal(comboOf(key("ArrowUp", "ArrowUp", { altKey: true })), "Alt+ArrowUp");
  assert.equal(comboOf(key("Numpad3", "3")), "Num3");
  assert.equal(comboOf(key("ShiftLeft", "Shift", { shiftKey: true })), null);
});

test("poor keys are named: taken, the browser's, the chart's, a bare letter", () => {
  const list = [{ id: "a", keys: "Shift+B" }];
  assert.match(keyWarning("Shift+B", list), /already set/);
  assert.equal(keyWarning("Shift+B", list, "a"), null);
  assert.match(keyWarning("Ctrl+W"), /browser/);
  assert.match(keyWarning("Delete"), /chart/);
  assert.match(keyWarning("B"), /Shift\+B is safer/);
  assert.equal(keyWarning("F2"), null);
});

test("a saved list, checked: defaults filled, nonsense and duplicates dropped", () => {
  const out = cleanHotkeys([
    { id: "1", keys: "Shift+B", action: "buy", size: "usd", amount: 500, price: "ask" },
    { id: "2", keys: "Shift+B", action: "sell" },
    { id: "3", keys: "Shift+F", action: "exit", percent: 250 },
    { id: "4", keys: "", action: "buy" },
    { id: "5", keys: "Shift+Z", action: "launch" },
    { id: "6", keys: "Shift+L", action: "stop" }
  ]);
  assert.deepEqual(out.map((h) => h.id), ["1", "3", "6"]);
  assert.equal(out[0].offset, 0);
  assert.equal(out[1].percent, 100);
  assert.deepEqual([out[2].stopMode, out[2].stopValue, out[2].from], ["pct", 2, "last"]);
  assert.equal(cleanHotkeys(null).length, 0);
  assert.equal(suggestedHotkeys().length, 6);
});

test("each hotkey in words", () => {
  const [b, s, f, h, l, x] = suggestedHotkeys();
  assert.equal(describe(b), "Buy $1,000, limit at the ask");
  assert.equal(describe(s), "Sell $1,000, limit at the bid");
  assert.equal(describe(f), "Exit the whole position");
  assert.equal(describe(h), "Exit 50% of the position");
  assert.match(describe(l), /^Stop 2% from the last price/);
  assert.equal(describe(x), "Cancel this symbol's orders");
  assert.equal(describe({ action: "buy", size: "equity", amount: 5, price: "market" }), "Buy 5% of portfolio, at market");
});

const ctx = { symbol: "AAPL", crypto: false, quote: { bid: 349.9, ask: 350.1, last: 350 }, equity: 100000, buyingPower: 200000, session: "regular" };

test("sizes: shares, dollars, % of portfolio, % of buying power; whole shares", () => {
  const o = (h) => hotkeyOrder({ action: "buy", price: "market", offset: 0, ...h }, ctx);
  assert.equal(o({ size: "shares", amount: 100 }).order.qty, 100);
  assert.equal(o({ size: "usd", amount: 1000 }).order.qty, 2);       // $1,000 at the ask 350.10
  assert.equal(o({ size: "equity", amount: 5 }).order.qty, 14);      // $5,000
  assert.equal(o({ size: "bp", amount: 10 }).order.qty, 57);         // $20,000
  assert.match(o({ size: "usd", amount: 100 }).reason, /less than one share/);
});

test("prices: market; a limit at the ask, bid or mid with its offset; extended hours become limits", () => {
  const buy = (h, c = ctx) => hotkeyOrder({ action: "buy", size: "shares", amount: 10, offset: 0, ...h }, c);
  assert.deepEqual(buy({ price: "market" }).order, { symbol: "AAPL", side: "buy", qty: 10, type: "market", timeInForce: "day" });
  assert.equal(buy({ price: "ask", offset: 0.02 }).order.limitPrice, 350.12);
  assert.equal(buy({ price: "mid" }).order.limitPrice, 350);
  const sell = hotkeyOrder({ action: "sell", size: "shares", amount: 10, price: "bid", offset: 0.05 }, ctx);
  assert.deepEqual([sell.order.side, sell.order.limitPrice], ["sell", 349.85]);
  const pre = buy({ price: "market" }, { ...ctx, session: "extended" });
  assert.deepEqual([pre.order.type, pre.order.limitPrice, pre.order.extendedHours], ["limit", 350.1, true]);
  assert.match(pre.words, /extended hours/);
  assert.match(buy({ price: "market" }, { ...ctx, session: "closed" }).reason, /cannot trade now/);
  assert.match(buy({ price: "ask" }, { ...ctx, quote: {} }).reason, /No ask price/);
});

test("coins: fractions on the coin's step, good till cancelled, any hour", () => {
  const c = { symbol: "BTC/USD", crypto: true, quote: { bid: 80000, ask: 80010, last: 80005 }, equity: 100000, step: 0.000000001, session: "closed" };
  const r = hotkeyOrder({ action: "buy", size: "usd", amount: 1000, price: "market", offset: 0 }, c);
  assert.deepEqual([r.order.qty, r.order.type, r.order.timeInForce], [0.012498437, "market", "gtc"]);
});
