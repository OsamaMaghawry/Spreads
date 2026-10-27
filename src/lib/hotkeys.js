// Trading hotkeys: keys the trader sets, each bound to an action with its own
// size, kept with the account (lib/terminalPrefs.js, "hotkeys").
//
// The owner, 25 Oct 2026: "Can I set hotkeys for high frequency trading. I set
// them myself and they get to keep saved going forward. And I need the key to
// be with quantities too. Like having the default quantity or percentage of
// the portfolio per position i can set. exiting full position has a key.
// Partial exit has a key with its default percentage of position ... stop loss
// order in general; with keys initially."
//
// A key press sends at once, with no review, so the order each key would send
// is worked out here, in full, and shown in the hotkey list before it is ever
// pressed. Pure and tested (hotkeys.test.js); the page listens for the keys.

import { amountToQty, px } from "./terminal.js";

export const ACTIONS = {
  buy: { label: "Buy", sized: true, priced: true },
  sell: { label: "Sell (or short)", sized: true, priced: true },
  exit: { label: "Exit position", percent: true },
  stop: { label: "Stop loss on position", stop: true },
  // A distance like the stop's, on the other side of the price (25 Oct: "I
  // want to add take profit too"). With a stop working, the two go as one
  // one-cancels-other order (functions/terminal protect).
  target: { label: "Take profit on position", stop: true },
  cancelSymbol: { label: "Cancel this symbol's orders" },
  cancelAll: { label: "Cancel all orders" }
};

export const SIZE_MODES = [["shares", "Shares or coins"], ["usd", "Dollars"], ["equity", "% of portfolio"], ["bp", "% of buying power"]];
export const PRICE_MODES = [["market", "Market"], ["ask", "Limit at the ask"], ["bid", "Limit at the bid"], ["mid", "Limit at the mid"]];
export const STOP_MODES = [["pct", "% from price"], ["usd", "$ from price"]];

// Keys the browser or the chart already uses: offered with a warning.
const BROWSER = new Set(["Ctrl+W", "Ctrl+T", "Ctrl+N", "Ctrl+R", "Ctrl+L", "Ctrl+Q", "Meta+W", "Meta+T", "Meta+N", "Meta+R", "Meta+Q", "Ctrl+Tab"]);
const CHART = new Set(["Delete", "Backspace", "Escape"]);
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Dead"]);

/**
 * A key press as the text a binding stores: modifiers first ("Shift+B",
 * "Ctrl+Alt+1", "F2", "ArrowUp"). Letters and digits are read from the key's
 * position, so Shift+1 stays "Shift+1" rather than "!" on any keyboard.
 */
export function comboOf(e) {
  if (!e || MODIFIER_KEYS.has(e.key)) return null;
  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code || "")) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code || "")) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code || "")) key = `Num${e.code.slice(6)}`;
  else if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.metaKey && "Meta", e.shiftKey && "Shift"].filter(Boolean);
  return [...mods, key].join("+");
}

/** Why a key is a poor choice, or null. */
export function keyWarning(combo, list = [], selfId = null) {
  if (!combo) return "Press a key.";
  if (list.some((h) => h.keys === combo && h.id !== selfId)) return `${combo} is already set for another hotkey.`;
  if (BROWSER.has(combo)) return `${combo} belongs to the browser and cannot be used.`;
  if (CHART.has(combo)) return `${combo} deletes or cancels on the chart; add Shift or Alt.`;
  if (!/[+]/.test(combo) && /^[A-Z0-9]$/.test(combo)) return `A single ${combo} fires while you type anywhere on the page outside a box; Shift+${combo} is safer.`;
  return null;
}

const n = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** A saved hotkey list, checked: unknown actions, empty keys and bad numbers dropped. */
export function cleanHotkeys(list) {
  const out = [];
  for (const h of Array.isArray(list) ? list : []) {
    if (!h || typeof h.keys !== "string" || !h.keys || !ACTIONS[h.action]) continue;
    if (out.some((x) => x.keys === h.keys)) continue;
    const id = typeof h.id === "string" && h.id ? h.id : `k${out.length}${Date.now().toString(36)}`;
    const k = { id, keys: h.keys, action: h.action };
    if (ACTIONS[h.action].sized) {
      k.size = SIZE_MODES.some(([m]) => m === h.size) ? h.size : "shares";
      k.amount = n(h.amount) > 0 ? n(h.amount) : 1;
    }
    if (ACTIONS[h.action].priced) {
      k.price = PRICE_MODES.some(([m]) => m === h.price) ? h.price : "market";
      k.offset = n(h.offset) ?? 0;
    }
    if (ACTIONS[h.action].percent) k.percent = n(h.percent) > 0 && n(h.percent) <= 100 ? n(h.percent) : 100;
    if (ACTIONS[h.action].stop) {
      k.stopMode = STOP_MODES.some(([m]) => m === h.stopMode) ? h.stopMode : "pct";
      k.stopValue = n(h.stopValue) > 0 ? n(h.stopValue) : 2;
      k.from = h.from === "entry" ? "entry" : "last";
    }
    out.push(k);
  }
  return out.slice(0, 40);
}

let seq = 0;
const id = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;
/** A starting set, offered once, to edit or delete. */
export function suggestedHotkeys() {
  return cleanHotkeys([
    { id: id(), keys: "Shift+B", action: "buy", size: "usd", amount: 1000, price: "ask", offset: 0 },
    { id: id(), keys: "Shift+S", action: "sell", size: "usd", amount: 1000, price: "bid", offset: 0 },
    { id: id(), keys: "Shift+F", action: "exit", percent: 100 },
    { id: id(), keys: "Shift+H", action: "exit", percent: 50 },
    { id: id(), keys: "Shift+L", action: "stop", stopMode: "pct", stopValue: 2, from: "last" },
    { id: id(), keys: "Shift+T", action: "target", stopMode: "pct", stopValue: 4, from: "last" },
    { id: id(), keys: "Shift+X", action: "cancelSymbol" }
  ]);
}

const money = (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** What a hotkey does, in words, for the list. */
export function describe(h) {
  const a = ACTIONS[h.action];
  if (!a) return "";
  if (h.action === "exit") return h.percent >= 100 ? "Exit the whole position" : `Exit ${h.percent}% of the position`;
  if (h.action === "stop") return `Stop ${h.stopMode === "pct" ? `${h.stopValue}%` : money(h.stopValue)} from the ${h.from === "entry" ? "average entry" : "last price"}, for the whole position (replaces its stop)`;
  if (h.action === "target") return `Take profit ${h.stopMode === "pct" ? `${h.stopValue}%` : money(h.stopValue)} from the ${h.from === "entry" ? "average entry" : "last price"}, for the whole position (with the stop, one cancels the other)`;
  if (!a.sized) return a.label;
  const size = h.size === "shares" ? `${h.amount}` : h.size === "usd" ? money(h.amount) : `${h.amount}% of ${h.size === "equity" ? "portfolio" : "buying power"}`;
  const price = h.price === "market" ? "at market" : `limit at the ${h.price}${h.offset ? ` ${h.offset > 0 ? "+" : ""}${h.offset}` : ""}`;
  return `${h.action === "buy" ? "Buy" : "Sell"} ${size}, ${price}`;
}

/**
 * The order a buy or sell hotkey sends now: { order } for the server, or a
 * reason it cannot go. `ctx`: symbol, crypto, quote {bid, ask, last}, equity,
 * buyingPower, step (a coin's quantity step), session ("regular", "extended",
 * "closed"; coins ignore it).
 *
 * The price is the side of the quote the order trades against: the ask to
 * buy, the bid to sell; a limit sits there plus the offset (positive pays
 * more to buy, accepts less to sell). Outside regular hours shares cannot be
 * bought or sold at market, so a market key sends a limit at the ask or bid
 * for the extended session.
 */
export function hotkeyOrder(h, ctx) {
  const buy = h.action === "buy";
  const q = ctx.quote || {};
  const bid = n(q.bid);
  const ask = n(q.ask);
  const last = n(q.last);
  const touch = buy ? ask ?? last : bid ?? last;
  const mid = bid && ask ? (bid + ask) / 2 : last;
  if (!ctx.crypto && ctx.session === "closed") return { reason: "Shares cannot trade now (overnight or weekend); the extended session opens at 4:00 a.m. New York." };
  let price = h.price === "market" ? touch : h.price === "ask" ? ask : h.price === "bid" ? bid : mid;
  if (!(price > 0)) return { reason: `No ${h.price === "market" ? (buy ? "ask" : "bid") : h.price} price for ${ctx.symbol} yet.` };
  const extended = !ctx.crypto && ctx.session === "extended";
  let type = h.price === "market" && !extended ? "market" : "limit";
  if (type === "limit") {
    if (h.price !== "market") price += (buy ? 1 : -1) * (h.offset || 0);
    price = price >= 1 ? Math.round(price * 100) / 100 : Math.round(price * 10000) / 10000;
    if (!(price > 0)) return { reason: "The offset takes the price to zero." };
  }
  const amount = h.size === "usd" ? h.amount : h.size === "equity" ? (n(ctx.equity) || 0) * h.amount / 100 : h.size === "bp" ? (n(ctx.buyingPower) || 0) * h.amount / 100 : null;
  if (amount !== null && !(amount > 0)) return { reason: `No ${h.size === "equity" ? "portfolio value" : "buying power"} to size from.` };
  let qty = h.size === "shares" ? (ctx.crypto ? h.amount : Math.floor(h.amount)) : amountToQty(amount, price, { crypto: ctx.crypto, step: ctx.step });
  const order = { symbol: ctx.symbol, side: buy ? "buy" : "sell", qty, type, timeInForce: ctx.crypto ? "gtc" : "day" };
  if (type === "limit") order.limitPrice = price;
  if (extended) order.extendedHours = true;
  // Too small here: said, with the order as it would have gone, so the other
  // accounts picked beside this one can still take their own sizes.
  if (!(qty > 0)) return { reason: `${money(amount ?? 0)} is less than one ${ctx.crypto ? "step" : "share"} at ${px(price)}.`, tooSmall: true, order: { ...order, qty: null }, price };
  // A sale of shares held (or a buy back of a short) closes them: never more
  // than is held, so one key never turns a holding into its opposite.
  const held = n(ctx.held) || 0;
  let all = false;
  if ((!buy && held > 0 && qty > held) || (buy && held < 0 && qty > -held)) { qty = Math.abs(held); all = true; order.qty = qty; }
  const words = `${buy ? "Buy" : "Sell"} ${qty} ${ctx.symbol}${all ? " (all held)" : ""} ${type === "market" ? "at market" : `limit ${px(price)}`}${extended ? " (extended hours)" : ""}`;
  return { order, words, value: qty * price, price };
}

/**
 * A hotkey sized by the account's own size instead, where the account has
 * one (27 Oct: "I need to set the quantities by account"; lib/accountGroup.js):
 * a percent of its portfolio, dollars, shares, or a multiple of the hotkey's.
 */
export function withOwnSize(h, rule) {
  const v = n(rule?.value);
  if (!rule || rule.mode === "prorata" || !(v > 0)) return h;
  if (rule.mode === "percent") return { ...h, size: "equity", amount: v };
  if (rule.mode === "dollars") return { ...h, size: "usd", amount: v };
  if (rule.mode === "shares") return { ...h, size: "shares", amount: v };
  if (rule.mode === "times") return { ...h, amount: (n(h.amount) || 0) * v };
  return h;
}

/**
 * The hotkey's size as a percent of the account's portfolio (or buying
 * power), for the other accounts picked beside it to take the same percent
 * of their own: a percent as it is, dollars or shares over this account's
 * value. Null when there is nothing to measure it against.
 */
export function hotkeyPercent(h, { equity, buyingPower, price }) {
  if (h.size === "equity" || h.size === "bp") return n(h.amount);
  const base = n(equity);
  if (!(base > 0)) return null;
  if (h.size === "usd") return (n(h.amount) / base) * 100;
  if (h.size === "shares" && n(price) > 0) return ((n(h.amount) * n(price)) / base) * 100;
  return null;
}
