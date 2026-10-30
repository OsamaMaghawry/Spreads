// Stops outside regular hours: the rules, pure and tested (stopGuard.test.ts).
// stopGuardRun.ts does the reading and sending; the open terminal's relay
// (marketStream) and the minute job (functions/terminal "guardStops") watch.
//
// The owner, 26 Oct 2026, 490 RENT held with a stop and a take profit before
// the open: "The stop loss price was hit but never executed." Alpaca triggers
// stop orders from 9:30 to 16:00 New York only, and takes only limit orders
// for the day outside those hours. Asked, the owner chose that the terminal
// fire its own stops then: when a trade reaches the stop, cancel the stop (a
// pair's take profit with it) and send a limit at the stop price, pre-market
// and after hours included. A limit at the stop price never sells below the
// stop; if the price runs straight through it, it may not fill. Said so in
// the terminal. Unfilled at the open, or at the end of its day, it is taken
// back and the stop (with its take profit) put back as it was: from 9:30
// Alpaca's own stop works again, as it would have without the terminal.
//
// Take profits the same way (27 Oct, AIOK on two paper accounts before the
// open: "Orders for TP and SL still don't get executed"). Alpaca works a take
// profit, like a stop, from 9:30 only; when a trade reaches it outside those
// hours the terminal cancels the pair and sends a limit at the take-profit
// price, pre-market and after hours included, put back at the open if it
// has not filled. The take profit of a one-cancels-other pair, one placed on
// its own, and the two exits of a bracket whose entry has filled.

import { stopLimitPrice } from "./positionTools.ts";

/**
 * What becomes of a fired stop's limit (`status`: the broker's): filled,
 * done; cancelled by someone else, left so; expired, or still working once
 * regular hours begin, the stop goes back.
 */
export function handBack(status: string, regular: boolean): "done" | "cancelled" | "return" | "wait" {
  if (status === "filled") return "done";
  if (status === "canceled") return "cancelled";
  if (["expired", "done_for_day", "rejected", "stopped", "suspended"].includes(status)) return "return";
  return regular ? "return" : "wait";
}

export type Guard = {
  orderId: string; // the one it is known by: the stop, or the pair's take profit (which cancels both)
  cancel: string[]; // every order to cancel before the exit goes (a bracket's two exits)
  symbol: string;
  side: "buy" | "sell"; // the closing side: sell for a long, buy back for a short
  qty: number;
  stop: number | null; // null for a take profit on its own
  limit: number | null; // a stop-limit's own limit; the stop price otherwise
  pair: boolean;
  target: number | null; // the take profit
  since: number; // when it was placed (ms): a trade before then does not count
};

export type Kind = "stop" | "target";

const SHARE = /^[A-Z][A-Z0-9.]{0,9}$/;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const placed = (o: any) => {
  const t = Date.parse(o?.created_at || o?.submitted_at || "");
  return Number.isFinite(t) ? t : 0;
};

const WORKING = new Set(["new", "accepted", "pending_new", "accepted_for_bidding", "held", "partially_filled"]);

/**
 * The terminal's own share exits among the account's open orders (read with
 * nested=true): a stop or stop-limit; a one-cancels-other pair (its take
 * profit is the order the pair goes by); a take profit on its own (a limit
 * good till cancelled, regular hours only); and the two exits of a bracket
 * whose entry has filled. The terminal's orders carry a client order id
 * beginning TERM_; anything else on the account is left alone, and so are
 * trailing stops, whose price moves.
 */
export function guardedStops(orders: any[]): Guard[] {
  const out: Guard[] = [];
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!String(o?.client_order_id || "").startsWith("TERM_")) continue;
    if (o.asset_class && o.asset_class !== "us_equity") continue;
    const symbol = String(o.symbol || "");
    if (!SHARE.test(symbol) || (o.side !== "buy" && o.side !== "sell")) continue;
    const qty = num(o.qty);
    if (!qty || qty <= 0) continue;
    const base = { symbol, since: placed(o) };
    if (o.order_class === "oco") {
      const leg = (o.legs || []).find((l: any) => l?.type === "stop" || l?.type === "stop_limit");
      const stop = num(leg?.stop_price);
      if (!stop) continue;
      out.push({ ...base, orderId: String(o.id), cancel: [String(o.id)], side: o.side, qty, stop, limit: leg.type === "stop_limit" ? num(leg.limit_price) : null, pair: true, target: num(o.limit_price) });
    } else if (o.order_class === "bracket") {
      // The entry filled; its two exits still working, each its own order.
      if (o.status !== "filled") continue;
      const legs = (o.legs || []).filter((l: any) => WORKING.has(l?.status));
      const sl = legs.find((l: any) => l?.type === "stop" || l?.type === "stop_limit");
      const tp = legs.find((l: any) => l?.type === "limit");
      const first = tp || sl;
      if (!first || (first.side !== "buy" && first.side !== "sell")) continue;
      const legQty = num(first.qty) || qty;
      out.push({
        ...base, orderId: String(first.id), cancel: [tp, sl].filter(Boolean).map((l: any) => String(l.id)), side: first.side, qty: legQty,
        stop: num(sl?.stop_price), limit: sl?.type === "stop_limit" ? num(sl.limit_price) : null, pair: !!(tp && sl), target: num(tp?.limit_price)
      });
    } else if (!o.order_class || o.order_class === "simple") {
      if (o.type === "stop" || o.type === "stop_limit") {
        const stop = num(o.stop_price);
        if (!stop) continue;
        out.push({ ...base, orderId: String(o.id), cancel: [String(o.id)], side: o.side, qty, stop, limit: o.type === "stop_limit" ? num(o.limit_price) : null, pair: false, target: null });
      } else if (o.type === "limit" && o.time_in_force === "gtc" && !o.extended_hours) {
        // A take profit on its own: it waits for 9:30 like a stop.
        const target = num(o.limit_price);
        if (!target) continue;
        out.push({ ...base, orderId: String(o.id), cancel: [String(o.id)], side: o.side, qty, stop: null, limit: null, pair: false, target });
      }
    }
  }
  return out;
}

/**
 * Which exit a trade reaches, if any: the stop at or through it (at or below
 * for a sale, at or above for a buy back), the take profit at or beyond it
 * (at or above for a sale, at or below for a buy back). Odd lots (under 100
 * shares) do not count, as they do not set the consolidated last sale a
 * broker's stop goes by.
 */
export function hit(g: Guard, price: number, size: number): Kind | null {
  if (!(price > 0) || !(size >= 100)) return null;
  const sell = g.side === "sell";
  if (g.stop && (sell ? price <= g.stop : price >= g.stop)) return "stop";
  if (g.target && (sell ? price >= g.target : price <= g.target)) return "target";
  return null;
}

/** Whether a trade reaches the stop (hit, for the stop alone). */
export function reaches(g: Guard, price: number, size: number) {
  return hit(g, price, size) === "stop";
}

function nyMinutes(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { weekend: p.weekday === "Sat" || p.weekday === "Sun", m: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Whether the terminal fires stops now, from this source of prices: outside
 * 9:30 to 16:00 New York on a weekday, while the source has real-time trades
 * (EODHD's stream, 4:00 to 20:00; the free IEX feed, 8:00 to 17:00). In
 * regular hours Alpaca's own stop works and is left to.
 */
export function guardHours(ms: number, source: "eodhd" | "iex" | string | null) {
  const { weekend, m } = nyMinutes(ms);
  if (weekend || (m >= 570 && m < 960)) return false;
  if (source === "eodhd") return m >= 240 && m < 1200;
  if (source === "iex") return m >= 480 && m < 1020;
  return false;
}

const price = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(4));

/**
 * The order that replaces a fired exit: a limit, for the day, pre-market and
 * after hours included, for what the exit covered and is still held. At the
 * stop price (a stop-limit's own limit, if it had one) for a stop; at the
 * take-profit price for a take profit. Refused when the holding is gone or
 * the other way round: an exit is fired to close a position, never to open
 * one.
 */
export function exitOrder(g: Guard, heldQty: number | null, clientId: string, kind: Kind = "stop"):
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const held = num(heldQty) || 0;
  if (g.side === "sell" ? held <= 0 : held >= 0) return { ok: false, reason: `No ${g.side === "sell" ? "long" : "short"} ${g.symbol} position left to close.` };
  const at = kind === "target" ? g.target : g.limit ?? g.stop;
  if (!at) return { ok: false, reason: `No ${kind === "target" ? "take-profit" : "stop"} price to send.` };
  const qty = Math.min(g.qty, Math.abs(held));
  return {
    ok: true,
    body: {
      symbol: g.symbol, side: g.side, qty: String(qty), type: "limit", limit_price: price(at),
      time_in_force: "day", extended_hours: true, client_order_id: clientId
    }
  };
}

/**
 * The stop put back as it was, good till cancelled, so the open still
 * protects: when the limit is refused, and when it has not filled by the
 * open or by the end of its day. A pair comes back as a pair, with its take
 * profit, on whole shares.
 */
export function restoreOrder(g: Pick<Guard, "symbol" | "side" | "stop" | "limit" | "target">, qty: number, clientId: string): Record<string, unknown> {
  // Stops go back as stop-limits, as every stop is now (positionTools stopPlan).
  const limit = g.stop ? g.limit ?? stopLimitPrice(g.side, g.stop) : null;
  if (g.target && g.stop && Number.isInteger(qty)) {
    return {
      symbol: g.symbol, side: g.side, qty: String(qty), type: "limit", time_in_force: "gtc", order_class: "oco", client_order_id: clientId,
      take_profit: { limit_price: price(g.target) }, stop_loss: { stop_price: price(g.stop), limit_price: price(limit!) }
    };
  }
  // A take profit on its own (or one whose stop cannot pair with it).
  if (!g.stop && g.target) {
    return { symbol: g.symbol, side: g.side, qty: String(qty), type: "limit", limit_price: price(g.target), time_in_force: Number.isInteger(qty) ? "gtc" : "day", client_order_id: clientId };
  }
  if (!g.stop) throw new Error("Nothing to put back.");
  return {
    symbol: g.symbol, side: g.side, qty: String(qty), type: "stop_limit", stop_price: price(g.stop),
    limit_price: price(limit!), time_in_force: Number.isInteger(qty) ? "gtc" : "day", client_order_id: clientId
  };
}

// A fired stop's sale follows the market until it fills (28 Oct, the owner,
// after a live DAVI stop's limit at 4.02 sat unfilled under a falling price:
// "Chase the bid"). Its exit carries this label, so only such sales are
// followed and moved, and none is handed back as a stop at the open.
export const CHASE_LABEL = "TERM_XC_";
// A quote further than this from the last price is not taken for the market.
const CHASE_BAND = 0.03;
// With no quote near the last price: this far through it.
const CHASE_THROUGH = 0.02;

/**
 * Where the chasing limit goes: at the bid (selling) or the ask (buying back
 * a short), or, with no quote near the last price, 2% through the last price.
 * With `current` (the limit working now): only a move toward the market, else
 * null, as it is never taken back.
 */
export function chasePrice(side: "buy" | "sell", q: { bid?: number | null; ask?: number | null; last?: number | null }, current: number | null = null): number | null {
  const sell = side === "sell";
  const last = num(q.last);
  const quoted = num(sell ? q.bid : q.ask);
  const near = quoted && quoted > 0 && (!last || !(last > 0) || Math.abs(quoted - last) / last <= CHASE_BAND) ? quoted : null;
  const raw = near ?? (last && last > 0 ? last * (sell ? 1 - CHASE_THROUGH : 1 + CHASE_THROUGH) : null);
  if (!raw || !(raw > 0)) return null;
  const next = Number(price(raw));
  if (current !== null && current > 0 && (sell ? next >= current : next <= current)) return null;
  return next;
}
