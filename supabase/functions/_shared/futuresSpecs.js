// CME futures contracts as the practice account trades them: what a point and a
// tick are worth, and when Globex is open. Futures are simulated only (Alpaca
// carries none); bars come from Databento's GLBX.MDP3 dataset. Shared by the
// browser (src/lib/replay.js) and functions/terminal.
//
// Money is worked in whole ticks, never in fractional points, so 0.1 + 0.2
// never reaches a dollar figure: a move is rounded to a tick count first, then
// multiplied by the tick's dollar value.
//
// The commission is a starting value for one contract, one side, to be set to
// the trader's own firm's rate; it is not any broker's published price.

import { easter, observed } from "./usHolidays.js";

// size: "standard" (the full contract), "e-mini" or "micro". pointValue is
// dollars for a move of 1.00 in the quoted price (grains are quoted in cents
// a bushel, cattle and hogs in cents a pound, so a "point" there is a cent).
const spec = (root, name, group, size, pointValue, tick, decimals, commission = size === "micro" ? 0.5 : 2.0) =>
  Object.freeze({
    root, name, group, size, micro: size === "micro", pointValue, tick, decimals,
    tickValue: Math.round(pointValue * tick * 1e6) / 1e6,
    commission,
    dataset: "GLBX.MDP3", // CME, CBOT, NYMEX and COMEX
    continuous: `${root}.v.0` // the front contract by volume, rolled by Databento
  });

/** The contracts the practice account trades, by root. Contract terms as CME publishes them. */
export const FUTURES = Object.freeze(Object.fromEntries([
  // Equity index (CME, CBOT)
  spec("ES", "E-mini S&P 500", "Equity index", "e-mini", 50, 0.25, 2),
  spec("MES", "Micro E-mini S&P 500", "Equity index", "micro", 5, 0.25, 2),
  spec("NQ", "E-mini Nasdaq-100", "Equity index", "e-mini", 20, 0.25, 2),
  spec("MNQ", "Micro E-mini Nasdaq-100", "Equity index", "micro", 2, 0.25, 2),
  spec("YM", "E-mini Dow ($5)", "Equity index", "e-mini", 5, 1, 0),
  spec("MYM", "Micro E-mini Dow", "Equity index", "micro", 0.5, 1, 0),
  spec("RTY", "E-mini Russell 2000", "Equity index", "e-mini", 50, 0.1, 1),
  spec("M2K", "Micro E-mini Russell 2000", "Equity index", "micro", 5, 0.1, 1),
  spec("EMD", "E-mini S&P MidCap 400", "Equity index", "e-mini", 100, 0.1, 1),
  // Energy (NYMEX)
  spec("CL", "Crude Oil (WTI)", "Energy", "standard", 1000, 0.01, 2),
  spec("QM", "E-mini Crude Oil", "Energy", "e-mini", 500, 0.025, 3),
  spec("MCL", "Micro WTI Crude Oil", "Energy", "micro", 100, 0.01, 2),
  spec("NG", "Henry Hub Natural Gas", "Energy", "standard", 10000, 0.001, 3),
  spec("QG", "E-mini Natural Gas", "Energy", "e-mini", 2500, 0.005, 3),
  spec("MNG", "Micro Henry Hub Natural Gas", "Energy", "micro", 1000, 0.001, 3),
  spec("RB", "RBOB Gasoline", "Energy", "standard", 42000, 0.0001, 4),
  spec("HO", "NY Harbor ULSD (Heating Oil)", "Energy", "standard", 42000, 0.0001, 4),
  // Metals (COMEX, NYMEX)
  spec("GC", "Gold", "Metals", "standard", 100, 0.1, 1),
  spec("QO", "E-mini Gold", "Metals", "e-mini", 50, 0.25, 2),
  spec("MGC", "Micro Gold", "Metals", "micro", 10, 0.1, 1),
  spec("SI", "Silver", "Metals", "standard", 5000, 0.005, 3),
  spec("QI", "E-mini Silver", "Metals", "e-mini", 2500, 0.0125, 4),
  spec("SIL", "Micro Silver", "Metals", "micro", 1000, 0.005, 3),
  spec("HG", "Copper", "Metals", "standard", 25000, 0.0005, 4),
  spec("MHG", "Micro Copper", "Metals", "micro", 2500, 0.0005, 4),
  spec("PL", "Platinum", "Metals", "standard", 50, 0.1, 1),
  // Currencies (CME), quoted in US dollars per unit
  spec("6E", "Euro FX", "Currencies", "standard", 125000, 0.00005, 5),
  spec("E7", "E-mini Euro FX", "Currencies", "e-mini", 62500, 0.0001, 4),
  spec("M6E", "Micro EUR/USD", "Currencies", "micro", 12500, 0.0001, 4),
  spec("6B", "British Pound", "Currencies", "standard", 62500, 0.0001, 4),
  spec("M6B", "Micro GBP/USD", "Currencies", "micro", 6250, 0.0001, 4),
  spec("6J", "Japanese Yen", "Currencies", "standard", 12500000, 0.0000005, 7),
  spec("J7", "E-mini Japanese Yen", "Currencies", "e-mini", 6250000, 0.000001, 6),
  spec("6A", "Australian Dollar", "Currencies", "standard", 100000, 0.00005, 5),
  spec("M6A", "Micro AUD/USD", "Currencies", "micro", 10000, 0.0001, 4),
  spec("6C", "Canadian Dollar", "Currencies", "standard", 100000, 0.00005, 5),
  spec("6S", "Swiss Franc", "Currencies", "standard", 125000, 0.00005, 5),
  // Interest rates (CBOT), in points of par; a 32nd is 0.03125
  spec("ZT", "2-Year T-Note", "Interest rates", "standard", 2000, 0.00390625, 8),
  spec("ZF", "5-Year T-Note", "Interest rates", "standard", 1000, 0.0078125, 7),
  spec("ZN", "10-Year T-Note", "Interest rates", "standard", 1000, 0.015625, 6),
  spec("ZB", "U.S. Treasury Bond", "Interest rates", "standard", 1000, 0.03125, 5),
  spec("UB", "Ultra U.S. Treasury Bond", "Interest rates", "standard", 1000, 0.03125, 5),
  // Grains (CBOT), in cents a bushel
  spec("ZC", "Corn", "Grains", "standard", 50, 0.25, 2),
  spec("XC", "Mini Corn", "Grains", "e-mini", 10, 0.125, 3),
  spec("ZS", "Soybeans", "Grains", "standard", 50, 0.25, 2),
  spec("XK", "Mini Soybeans", "Grains", "e-mini", 10, 0.125, 3),
  spec("ZW", "Chicago SRW Wheat", "Grains", "standard", 50, 0.25, 2),
  spec("XW", "Mini Chicago SRW Wheat", "Grains", "e-mini", 10, 0.125, 3),
  // Livestock (CME), in cents a pound
  spec("LE", "Live Cattle", "Livestock", "standard", 400, 0.025, 3),
  spec("GF", "Feeder Cattle", "Livestock", "standard", 500, 0.025, 3),
  spec("HE", "Lean Hogs", "Livestock", "standard", 400, 0.025, 3),
  // Crypto (CME), in US dollars a coin
  spec("BTC", "Bitcoin (5 BTC)", "Crypto", "standard", 5, 5, 0),
  spec("MBT", "Micro Bitcoin (0.1 BTC)", "Crypto", "micro", 0.1, 5, 0),
  spec("ETH", "Ether (50 ETH)", "Crypto", "standard", 50, 0.5, 1),
  spec("MET", "Micro Ether (0.1 ETH)", "Crypto", "micro", 0.1, 0.5, 1)
].map((x) => [x.root, x])));

/** The full-size contract a mini or micro is a fraction of, and how many of them make one (for a firm that counts micros as a tenth). */
export const PARENT = Object.freeze({
  MES: ["ES", 10], MNQ: ["NQ", 10], MYM: ["YM", 10], M2K: ["RTY", 10],
  QM: ["CL", 2], MCL: ["CL", 10], QG: ["NG", 4], MNG: ["NG", 10],
  QO: ["GC", 2], MGC: ["GC", 10], QI: ["SI", 2], SIL: ["SI", 5], MHG: ["HG", 10],
  E7: ["6E", 2], M6E: ["6E", 10], M6B: ["6B", 10], J7: ["6J", 2], M6A: ["6A", 10],
  XC: ["ZC", 5], XK: ["ZS", 5], XW: ["ZW", 5], MBT: ["BTC", 50], MET: ["ETH", 500]
});

const MONTH_CODES = "FGHJKMNQUVXZ";

/**
 * The contract a symbol names, or null: "ES", "/ES", "ES1!" or a dated
 * contract such as "ESZ6" / "ESZ26" all give ES. Share tickers that happen to
 * share letters (ES is also Eversource) are told apart by the caller's market
 * kind, never by this function alone.
 */
export function futuresSpec(symbol) {
  const s = String(symbol ?? "").trim().toUpperCase().replace(/^\//, "").replace(/1!$/, "");
  if (FUTURES[s]) return FUTURES[s];
  const m = s.match(/^([A-Z0-9]{1,3}?)([A-Z])(\d{1,2})$/);
  if (m && MONTH_CODES.includes(m[2]) && FUTURES[m[1]]) return FUTURES[m[1]];
  return null;
}

/** Whole ticks between two prices (signed, to - from). */
export function ticksBetween(from, to, s) {
  return Math.round((Number(to) - Number(from)) / s.tick);
}

/** A price on the contract's tick grid. */
export function roundToTick(price, s, mode = "nearest") {
  const n = Number(price) / s.tick;
  const k = mode === "up" ? Math.ceil(n - 1e-9) : mode === "down" ? Math.floor(n + 1e-9) : Math.round(n);
  return Number((k * s.tick).toFixed(s.decimals));
}

/** Dollars made or lost on `qty` contracts (negative = short) from `from` to `to`. */
export function futuresPL(from, to, qty, s) {
  return round2(ticksBetween(from, to, s) * s.tickValue * Number(qty));
}

/** Dollars a move of `points` is worth on one contract. */
export const dollarsPerPoint = (s) => s.pointValue;

const round2 = (x) => Math.round(x * 100) / 100 || 0;

// ---- Globex hours (New York time) ----
//
// Sunday 18:00 to Friday 17:00, halted 17:00-18:00 each weekday. The trade
// date rolls at 18:00: Sunday 18:00 belongs to Monday's session. Full
// closures kept here are New Year's Day, Good Friday and Christmas. On the
// other US holidays Globex opens with an early halt whose time differs by
// product and year; a replay takes those from the bars themselves (no bars,
// no trading), and they are not guessed here.

const HALT = 17 * 60;
const REOPEN = 18 * 60;
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
const shift = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return iso(y, m, d + n);
};

const closures = new Map();
/** CME Globex full-day closures in a year, as trade dates "YYYY-MM-DD". */
export function cmeClosures(y) {
  if (closures.has(y)) return closures.get(y);
  const [em, ed] = easter(y);
  const set = new Set([observed(y, 1, 1, false), iso(y, em, ed - 2), observed(y, 12, 25)].filter(Boolean));
  closures.set(y, set);
  return set;
}

/** The trade date a New York date and minute (0-1439) belong to, or null in the halt or at the weekend. */
export function cmeTradeDate(day, minutes) {
  if (minutes >= HALT && minutes < REOPEN) return null;
  const date = minutes >= REOPEN ? shift(day, 1) : day;
  const w = weekday(date);
  if (w === 0 || w === 6) return null;
  if (cmeClosures(Number(date.slice(0, 4))).has(date)) return null;
  return date;
}

/** Whether Globex is open at a New York date and minute. */
export const cmeOpenAt = (day, minutes) => cmeTradeDate(day, minutes) !== null;
