// Crypto for the staging trading terminal: what a crypto symbol looks like,
// and a crypto order, checked before it is built.
//
// The owner, 24 Oct 2026: "I don't see Cryptos to select from ... make sure the
// order book is working and time and sales for anything that is available like
// cryptos". Alpaca trades crypto around the clock, in fractions, with rules
// unlike shares: market, limit and stop-limit orders only; good till cancelled
// or immediate-or-cancel only; no short selling, no take-profit/stop-loss
// brackets, no extended-hours flag (there are no hours). Each coin also has its
// own minimum order and its own step for quantity and price, read from the
// broker's asset list; a quantity or price off the step is refused by the
// broker with a code, so it is rounded or refused here in words first.
//
// Pure: functions/terminal adds only the I/O.

/** "BTC/USD": a coin and the currency it is priced in, as Alpaca writes it. */
export const CRYPTO = /^[A-Z0-9]{1,10}\/(USD|USDT|USDC|BTC)$/;
export const isCrypto = (s: unknown) => CRYPTO.test(String(s || ""));

// The currencies a coin is priced in at Alpaca.
const QUOTES = ["USDT", "USDC", "USD", "BTC"];

/**
 * Alpaca's positions write a coin without its slash ("BTCUSD") while its
 * orders, assets and market data write it with one ("BTC/USD"). The terminal
 * uses the slashed form everywhere, so a position matches its chart and quote.
 */
export function cryptoSymbol(symbol: unknown): string {
  const s = String(symbol || "").toUpperCase().trim();
  if (CRYPTO.test(s)) return s;
  for (const q of QUOTES) {
    if (s.length > q.length && s.endsWith(q)) return `${s.slice(0, -q.length)}/${q}`;
  }
  return s;
}

export type CryptoAsset = {
  symbol: string;
  minOrderSize: number | null;
  minTradeIncrement: number | null;
  priceIncrement: number | null;
};

export type CryptoOrderInput = {
  symbol: string;
  side: "buy" | "sell";
  qty: number | string;
  type: "market" | "limit" | "stop_limit";
  timeInForce?: "gtc" | "ioc";
  limitPrice?: number | string | null;
  stopPrice?: number | string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Decimal places in a step such as 0.000000001 or 1e-9. */
export function decimalsOf(step: number): number {
  if (!(step > 0)) return 9;
  for (let d = 0; d <= 12; d++) {
    if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-9) return d;
  }
  return 12;
}

/**
 * A value on the step, as the decimal string the broker wants. Down for a
 * quantity (never more than was asked); to the nearest step for a price.
 */
export function onStep(value: number, step: number | null, mode: "down" | "nearest"): string {
  const s = step && step > 0 ? step : null;
  if (!s) return String(value);
  const d = decimalsOf(s);
  const units = value / s;
  // The epsilon keeps 0.3 / 0.1 = 2.9999999999999996 from rounding down a whole step.
  const n = mode === "down" ? Math.floor(units + 1e-9) : Math.round(units);
  return (n * s).toFixed(d);
}

/** The order body for POST /v2/orders, or the first reason it cannot be sent. */
export function cryptoOrderBody(input: CryptoOrderInput, clientId: string, asset: CryptoAsset | null, held = 0):
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const symbol = cryptoSymbol(input?.symbol);
  if (!CRYPTO.test(symbol)) return { ok: false, reason: "Choose a crypto pair, such as BTC/USD." };
  if (!asset) return { ok: false, reason: `${symbol} is not tradable at the broker right now.` };
  if (input.side !== "buy" && input.side !== "sell") return { ok: false, reason: "Choose buy or sell." };

  const asked = num(input.qty);
  if (asked === null || !(asked > 0)) return { ok: false, reason: "Enter a quantity." };
  const qty = onStep(asked, asset.minTradeIncrement, "down");
  if (!(Number(qty) > 0)) return { ok: false, reason: `That quantity is smaller than ${symbol}'s smallest step (${asset.minTradeIncrement}).` };
  if (asset.minOrderSize && Number(qty) < asset.minOrderSize) {
    return { ok: false, reason: `The smallest ${symbol} order is ${asset.minOrderSize}.` };
  }
  // A sale of more than is held would be a short, which crypto does not allow.
  if (input.side === "sell" && Number(qty) > held + 1e-12) {
    return { ok: false, reason: held > 0 ? `You hold ${held} ${symbol.split("/")[0]}; crypto cannot be sold short.` : `You hold no ${symbol.split("/")[0]}; crypto cannot be sold short.` };
  }

  const type = input.type;
  if (!["market", "limit", "stop_limit"].includes(type)) return { ok: false, reason: "Crypto takes market, limit or stop-limit orders." };
  const tif = input.timeInForce === "ioc" ? "ioc" : "gtc";

  const limit = num(input.limitPrice);
  const stop = num(input.stopPrice);
  if ((type === "limit" || type === "stop_limit") && !(limit && limit > 0)) return { ok: false, reason: "Enter a limit price." };
  if (type === "stop_limit" && !(stop && stop > 0)) return { ok: false, reason: "Enter a stop price." };

  const body: Record<string, unknown> = { symbol, side: input.side, qty, type, time_in_force: tif, client_order_id: clientId };
  if (limit && type !== "market") body.limit_price = onStep(limit, asset.priceIncrement, "nearest");
  if (stop && type === "stop_limit") body.stop_price = onStep(stop, asset.priceIncrement, "nearest");
  return { ok: true, body };
}
