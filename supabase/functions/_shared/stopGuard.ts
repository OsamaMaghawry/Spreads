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
  orderId: string; // the order to cancel: the stop, or the pair's take profit (which cancels both)
  symbol: string;
  side: "buy" | "sell"; // the closing side: sell for a long, buy back for a short
  qty: number;
  stop: number;
  limit: number | null; // a stop-limit's own limit; the stop price otherwise
  pair: boolean;
  target: number | null; // the pair's take profit, to put back with the stop
  since: number; // when it was placed (ms): a trade before then does not count
};

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

/**
 * The terminal's own share stops among the account's open orders (read
 * with nested=true): a stop or stop-limit, and the stop of a
 * one-cancels-other pair, whose take profit is the order the pair goes by.
 * The terminal's orders carry a client order id beginning TERM_; anything
 * else on the account is left alone, and so are trailing stops, whose price
 * moves.
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
    if (o.order_class === "oco") {
      const leg = (o.legs || []).find((l: any) => l?.type === "stop" || l?.type === "stop_limit");
      const stop = num(leg?.stop_price);
      if (!stop) continue;
      out.push({ orderId: String(o.id), symbol, side: o.side, qty, stop, limit: leg.type === "stop_limit" ? num(leg.limit_price) : null, pair: true, target: num(o.limit_price), since: placed(o) });
    } else if ((o.type === "stop" || o.type === "stop_limit") && (!o.order_class || o.order_class === "simple")) {
      const stop = num(o.stop_price);
      if (!stop) continue;
      out.push({ orderId: String(o.id), symbol, side: o.side, qty, stop, limit: o.type === "stop_limit" ? num(o.limit_price) : null, pair: false, target: null, since: placed(o) });
    }
  }
  return out;
}

/**
 * Whether a trade reaches the stop: at or below it for a sale, at or above it
 * for a buy back. Odd lots (under 100 shares) do not count, as they do not
 * set the consolidated last sale a broker's stop goes by.
 */
export function reaches(g: Guard, price: number, size: number) {
  if (!(price > 0) || !(size >= 100)) return false;
  return g.side === "sell" ? price <= g.stop : price >= g.stop;
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
 * The order that replaces a fired stop: a limit at the stop price (a
 * stop-limit's own limit, if it had one), for the day, pre-market and after
 * hours included, for what the stop covered and is still held. Refused when
 * the holding is gone or the other way round: a stop is fired to close a
 * position, never to open one.
 */
export function exitOrder(g: Guard, heldQty: number | null, clientId: string):
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const held = num(heldQty) || 0;
  if (g.side === "sell" ? held <= 0 : held >= 0) return { ok: false, reason: `No ${g.side === "sell" ? "long" : "short"} ${g.symbol} position left to close.` };
  const qty = Math.min(g.qty, Math.abs(held));
  return {
    ok: true,
    body: {
      symbol: g.symbol, side: g.side, qty: String(qty), type: "limit", limit_price: price(g.limit ?? g.stop),
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
  if (g.target && !g.limit && Number.isInteger(qty)) {
    return {
      symbol: g.symbol, side: g.side, qty: String(qty), type: "limit", time_in_force: "gtc", order_class: "oco", client_order_id: clientId,
      take_profit: { limit_price: price(g.target) }, stop_loss: { stop_price: price(g.stop) }
    };
  }
  return {
    symbol: g.symbol, side: g.side, qty: String(qty), type: g.limit ? "stop_limit" : "stop", stop_price: price(g.stop),
    ...(g.limit ? { limit_price: price(g.limit) } : {}), time_in_force: Number.isInteger(qty) ? "gtc" : "day", client_order_id: clientId
  };
}
