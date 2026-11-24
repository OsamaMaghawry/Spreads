// The phone ticket's order, as the server takes it (functions/terminal
// "order", checked again by _shared/stockOrder.ts). Shares only: a coin or a
// futures contract goes through the full ticket or the replay.
//
// Extended hours are the default (24 Nov, the owner: "make sure to make the
// default is extended hours and give the option to make it market hours. But
// I don't want to place an order and find it not executed because I am not
// checking the extended hours"). Alpaca takes only a limit order for the day
// outside 9:30 to 16:00, with no take-profit and stop-loss bracket, and
// fires no stop then. So, outside regular hours:
//   - a market order goes as a limit 0.5% through the ask (buy) or bid (sell),
//     for the day, extended hours, so it fills at once (as exits do,
//     functions/terminal exitPosition);
//   - a stop and target go on once the entry fills (functions/terminal
//     "protect"); DeltaMint's stop guard covers them until 9:30;
//   - an order set to regular hours only waits for 9:30, and says so.

import { sessionOf, overnightOf } from "./terminal.js";
import { stopOf } from "./accountGroup.js";

/** "regular", "extended" (pre-market, after hours), "overnight" (20:00 to 4:00) or "closed". */
export function phoneSession(sec) {
  const s = sessionOf(sec);
  if (s === "regular") return "regular";
  if (s === "pre" || s === "post") return "extended";
  if (overnightOf(sec)) return "overnight";
  return "closed";
}

export const SESSION_LABEL = { regular: "Regular hours", extended: "Extended hours", overnight: "Overnight", closed: "Market closed" };

/** A price to the cent at a dollar and above, to the hundredth of a cent below. */
export const roundPrice = (p) => {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  return n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
};
/** One price step: a cent at a dollar and above, a hundredth of a cent below. */
export const tickOf = (p) => (Number(p) >= 1 ? 0.01 : 0.0001);
/** `p` moved by `steps` cents (or hundredths of a cent under a dollar), never to zero or below. */
export function stepPrice(p, steps) {
  const n = Number(p);
  if (!(n > 0)) return null;
  const next = roundPrice(n + steps * tickOf(n));
  return next > 0 ? next : n;
}

/** The limit that fills at once outside regular hours: 0.5% through the touch. */
export function marketableLimit(side, quote) {
  const ask = Number(quote?.ask) || Number(quote?.last) || 0;
  const bid = Number(quote?.bid) || Number(quote?.last) || 0;
  const p = side === "buy" ? ask * 1.005 : bid * 0.995;
  return p > 0 ? roundPrice(p) : null;
}

const fmt = (p) => (Number(p) >= 1 ? Number(p).toFixed(2) : Number(p).toFixed(4));

/**
 * The order for a phone ticket draft.
 * draft: { symbol, side "buy"|"sell", qty, type "market"|"limit"|"stop", limit, stop, ext, sl, tp }
 * ctx: { session (phoneSession), quote, play }
 * Returns { error } or { order, later: { stop, target } | null, words, notes, entry }.
 * `later`: exits to set with "protect" once the entry fills.
 */
export function buildPhoneOrder(draft, { session = "regular", quote = null, play = null } = {}) {
  const d = draft || {};
  const side = d.side === "sell" ? "sell" : "buy";
  const qty = Number(d.qty);
  if (!(qty > 0) || !Number.isInteger(qty)) return { error: "Enter a whole number of shares." };
  const type = ["market", "limit", "stop"].includes(d.type) ? d.type : "limit";
  const limit = type === "limit" ? roundPrice(d.limit) : null;
  const stop = type === "stop" ? roundPrice(d.stop) : null;
  if (type === "limit" && !(limit > 0)) return { error: "Enter a limit price." };
  if (type === "stop" && !(stop > 0)) return { error: "Enter a stop price." };
  const touch = side === "buy" ? Number(quote?.ask) || Number(quote?.last) : Number(quote?.bid) || Number(quote?.last);
  const outside = session !== "regular";
  const ext = d.ext !== false;
  const notes = [];
  /** @type {Record<string, any>} */
  const order = { symbol: d.symbol, side, qty, notional: null, timeInForce: "day", reference: touch || null, parts: false, ...(play ? { play } : {}) };
  let entry = touch || null;
  // Overnight the screen's quote stopped at 20:00, and with the market closed
  // nothing fills: a limit at a price of your own, never one worked out here.
  if (type === "market" && (session === "overnight" || session === "closed")) {
    return { error: session === "overnight" ? "Overnight the screen's price stopped at 20:00: use a limit order at your own price." : "The market is closed: use a limit order; it waits for the next session." };
  }
  if (type === "market" && outside && ext) {
    const p = marketableLimit(side, quote);
    if (!p) return { error: "No price yet to send at in extended hours." };
    Object.assign(order, { type: "limit", limitPrice: p, extendedHours: true });
    entry = p;
    notes.push(`Outside 9:30 to 16:00 the broker takes no market orders, so this goes as a limit at ${fmt(p)}, 0.5% through the ${side === "buy" ? "ask" : "bid"}, to fill at once.`);
  } else if (type === "market") {
    Object.assign(order, { type: "market", extendedHours: false });
    if (outside) notes.push("Regular hours only: this waits for 9:30 and does not fill now.");
  } else if (type === "limit") {
    // In regular hours a stop and target go with the entry as one bracket,
    // which the broker takes for regular hours only (a day order that ends at
    // 16:00); extended hours then apply to an entry placed outside them.
    const bracket = !outside && d.sl && d.tp;
    Object.assign(order, { type: "limit", limitPrice: limit, extendedHours: ext && !bracket });
    entry = limit;
    if (outside && !ext) notes.push("Regular hours only: this waits for 9:30 and does not fill now.");
  } else {
    // The broker takes no stop order for extended hours: it works 9:30 to 16:00.
    Object.assign(order, { type: "stop", stopPrice: stop, extendedHours: false });
    entry = stop;
    if (outside) notes.push("A stop order works 9:30 to 16:00 only: this one waits for the open.");
  }
  const sl = d.sl !== null && d.sl !== undefined && d.sl !== "" ? roundPrice(d.sl) : null;
  const tp = d.tp !== null && d.tp !== undefined && d.tp !== "" ? roundPrice(d.tp) : null;
  if (entry) {
    const below = (p) => (side === "buy" ? p < entry : p > entry);
    if (sl && !below(sl)) return { error: `The stop must be ${side === "buy" ? "below" : "above"} the entry (${fmt(entry)}).` };
    if (tp && below(tp)) return { error: `The target must be ${side === "buy" ? "above" : "below"} the entry (${fmt(entry)}).` };
  }
  let later = null;
  if (sl && tp && !order.extendedHours) {
    Object.assign(order, { stopLoss: sl, takeProfit: tp });
    if (order.type === "limit" && ext && !outside) notes.push("With its stop and target attached, this works until 16:00 today, not after hours (the broker takes these together in regular hours only).");
  } else if (sl || tp) {
    later = { stop: sl, target: tp };
    notes.push(`The ${[sl && "stop", tp && "target"].filter(Boolean).join(" and ")} go${sl && tp ? "" : "es"} on once it fills, while DeltaMint is open.`);
  }
  const how = order.type === "market" ? "at market" : order.type === "limit" ? `limit ${fmt(order.limitPrice)}` : `stop ${fmt(order.stopPrice)}`;
  const words = `${side === "buy" ? "Buy" : "Sell"} ${qty} ${d.symbol} ${how}` +
    (order.extendedHours ? ", extended hours" : outside ? ", regular hours only" : "") +
    (sl ? `, stop ${fmt(sl)}` : "") + (tp ? `, target ${fmt(tp)}` : "");
  return { order, later, words, notes, entry };
}

/** The dollars at risk and in reward for `qty` from `entry` (null where not set). */
export function riskReward({ side, qty, entry, sl, tp }) {
  const q = Number(qty) || 0;
  const e = Number(entry) || 0;
  const dir = side === "sell" ? -1 : 1;
  const risk = sl && e ? (e - Number(sl)) * dir * q : null;
  const reward = tp && e ? (Number(tp) - e) * dir * q : null;
  return { risk, reward, r: risk > 0 && reward !== null ? reward / risk : null };
}

/**
 * A position's working exits, from the account's open orders: the stop (a stop
 * or stop-limit, or a pair's stop leg) and the target (a pair's limit, or a
 * plain limit on the closing side).
 */
export function positionExits(orders, symbol, short) {
  const closing = short ? "buy" : "sell";
  const mine = (Array.isArray(orders) ? orders : []).filter((o) => o.symbol === symbol && o.side === closing);
  let stop = null;
  let target = null;
  for (const o of mine) {
    if (stop === null && (["stop", "stop_limit"].includes(o.type) || o.orderClass === "oco")) stop = Number(stopOf(o)) || null;
    // The last one, as the server reads them (functions/terminal existingExits).
    if (o.type === "limit" && Number(o.limit) > 0) target = Number(o.limit);
  }
  return { stop, target };
}
