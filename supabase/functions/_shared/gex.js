// Gamma exposure (GEX): how much stock option dealers would have to buy or
// sell as the price moves, worked out from every listed contract's open
// interest and implied volatility (7 Nov 2026, the owner: "Can we build a
// powerful GEX charts or Gamma Exposure analysis? ... SPY, QQQ & stocks ...
// Build it on Terminal ... add tools to how to analyze and make it easy, yet
// informative and very professional").
//
// The convention every published GEX follows: dealers are taken to be long
// the calls and short the puts their customers trade, so a call's gamma counts
// plus and a put's minus. Real dealer positions are not public; this is an
// estimate of them, and the page says so.
//
// One contract's exposure, in dollars of stock per 1% move:
//   gamma x open interest x 100 x price^2 x 1%
// Gamma comes from Black-Scholes with the contract's own implied volatility,
// so the exposure at any other price (the profile, and the zero-gamma flip
// where it crosses zero) is worked out the same way as at the price now.
// Pure, and tested (src/lib/gex.test.js); shared by the Gamma page and the
// Claude connector (connectorTools.ts). The terminal reads the chain (functions/
// terminal "gex") and draws (components/terminal/GexPage.jsx).

export const MULTIPLIER = 100;
// A rate near the short-term Treasury yield; gamma barely moves with it.
const RATE = 0.04;
const YEAR_MS = 365 * 86400000;
// An option in its last minutes is not infinitely sharp: fifteen minutes is the least time counted.
const MIN_YEARS = 15 / (365 * 24 * 60);
const IV_MIN = 0.01;
const IV_MAX = 5;

// New York's 4 p.m. close on a date, in UTC milliseconds: 20:00 UTC while
// daylight saving runs (second Sunday of March to first Sunday of November), else 21:00.
export function closeOf(expiry) {
  const [y, m, d] = String(expiry).split("-").map(Number);
  const dow = (mm, dd) => new Date(Date.UTC(y, mm - 1, dd)).getUTCDay();
  const marchStart = 8 + ((7 - dow(3, 8)) % 7);
  const novEnd = 1 + ((7 - dow(11, 1)) % 7);
  const day = m * 100 + d;
  const summer = day >= 300 + marchStart && day < 1100 + novEnd;
  return Date.UTC(y, m - 1, d, summer ? 20 : 21);
}

const pdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

/** Black-Scholes gamma (per $1 move of the stock). */
export function bsGamma(spot, strike, years, iv, rate = RATE) {
  if (!(spot > 0 && strike > 0 && years > 0 && iv > 0)) return 0;
  const sd = iv * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + iv * iv / 2) * years) / sd;
  return pdf(d1) / (spot * sd);
}

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The chain as the server sends it, made ready to price: `chain.rows` are
 * [strike, expiry index, 1 for a call, open interest, implied volatility,
 * today's volume]. A contract with no volatility of its own takes its
 * expiry's median; one whose expiry has closed is left out.
 */
// Today's date in New York, "YYYY-MM-DD".
const nyToday = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
const dayNumber = (date) => Date.UTC(...String(date).split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0))) / 86400000;

export function prepare(chain, now = Date.now()) {
  const today = dayNumber(nyToday(now));
  const expiries = (chain?.expiries || []).map((expiry) => {
    const years = (closeOf(expiry) - now) / YEAR_MS;
    // Calendar days to expiry in New York: 0 on the day itself.
    return { expiry, years, days: Math.max(0, dayNumber(expiry) - today), open: years > 0 };
  });
  const ivs = expiries.map(() => []);
  for (const r of chain?.rows || []) if (r[4] >= IV_MIN && r[4] <= IV_MAX && ivs[r[1]]) ivs[r[1]].push(r[4]);
  const fill = ivs.map(median);
  const contracts = [];
  let filled = 0;
  let skipped = 0;
  for (const [strike, ei, call, oi, iv, vol] of chain?.rows || []) {
    const e = expiries[ei];
    if (!e || !e.open || !(strike > 0)) continue;
    const own = iv >= IV_MIN && iv <= IV_MAX;
    const sigma = own ? iv : fill[ei];
    if (!sigma) { skipped += 1; continue; }
    if (!own) filled += 1;
    const years = Math.max(e.years, MIN_YEARS);
    const sd = sigma * Math.sqrt(years);
    contracts.push({
      strike, ei, call: call === 1, oi: Number(oi) || 0, vol: Number(vol) || 0, iv: sigma,
      // Black-Scholes pieces that do not depend on the price, worked once.
      lnK: Math.log(strike), drift: (RATE + sigma * sigma / 2) * years, sd
    });
  }
  return { contracts, expiries, filled, skipped };
}

/** One contract's gamma at a price. */
const gammaAt = (c, spot) => {
  const d1 = (Math.log(spot) - c.lnK + c.drift) / c.sd;
  return pdf(d1) / (spot * c.sd);
};

/** One contract's signed exposure in dollars per 1% move: calls plus, puts minus. */
export const exposureOf = (c, spot) => (c.call ? 1 : -1) * gammaAt(c, spot) * c.oi * MULTIPLIER * spot * spot * 0.01;

/**
 * Which contracts count: an expiry window (`days`: at most this many days
 * out; 0 for the nearest expiry only) or one expiry (`expiry` index).
 */
export function pick(prepared, { days = null, expiry = null } = {}) {
  const open = prepared.expiries.map((e, i) => ({ ...e, i })).filter((e) => e.open);
  let keep;
  if (expiry !== null && expiry !== undefined && expiry !== "") keep = new Set([Number(expiry)]);
  else if (days === 0) keep = new Set(open.slice(0, 1).map((e) => e.i));
  else if (days) keep = new Set(open.filter((e) => e.days <= days).map((e) => e.i));
  else keep = new Set(open.map((e) => e.i));
  return prepared.contracts.filter((c) => keep.has(c.ei));
}

/**
 * Per strike: call and put exposure (puts negative) and their net, with the
 * open interest and volume behind them, at a price. `metric` "gex" (dollars
 * per 1% move), "oi" (contracts open) or "volume" (traded today) sets what
 * `call`, `put` and `net` hold; the rest ride along for the tooltip.
 */
export function byStrike(contracts, spot, metric = "gex") {
  const rows = new Map();
  const totals = { call: 0, put: 0, net: 0, callGex: 0, putGex: 0 };
  for (const c of contracts) {
    let r = rows.get(c.strike);
    if (!r) { r = { strike: c.strike, call: 0, put: 0, net: 0, callGex: 0, putGex: 0, callOi: 0, putOi: 0, callVol: 0, putVol: 0 }; rows.set(c.strike, r); }
    const g = exposureOf(c, spot);
    const v = metric === "oi" ? c.oi : metric === "volume" ? c.vol : Math.abs(g);
    if (c.call) { r.call += v; r.callGex += g; r.callOi += c.oi; r.callVol += c.vol; } else { r.put -= v; r.putGex += g; r.putOi += c.oi; r.putVol += c.vol; }
  }
  const list = [...rows.values()].sort((a, b) => a.strike - b.strike);
  for (const r of list) {
    r.net = r.call + r.put;
    totals.call += r.call; totals.put += r.put; totals.callGex += r.callGex; totals.putGex += r.putGex;
  }
  totals.net = totals.call + totals.put;
  totals.netGex = totals.callGex + totals.putGex;
  return { rows: list, totals };
}

/**
 * Strikes grouped into at most `max` bands of a round width, for a chart that
 * would otherwise draw hundreds of hairline bars. Each band is labelled by its
 * lowest strike and sums what is in it.
 */
export function band(rows, max = 90) {
  if (rows.length <= max) return { rows, width: null };
  const span = rows[rows.length - 1].strike - rows[0].strike;
  const raw = span / max;
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  const width = steps.find((s) => s >= raw) || Math.ceil(raw);
  const out = new Map();
  for (const r of rows) {
    const k = Math.floor(r.strike / width + 1e-9) * width;
    let b = out.get(k);
    if (!b) { b = { strike: k, to: k + width, call: 0, put: 0, net: 0, callGex: 0, putGex: 0, callOi: 0, putOi: 0, callVol: 0, putVol: 0 }; out.set(k, b); }
    for (const f of ["call", "put", "net", "callGex", "putGex", "callOi", "putOi", "callVol", "putVol"]) b[f] += r[f];
  }
  return { rows: [...out.values()].sort((a, b) => a.strike - b.strike), width };
}

/**
 * Total exposure at prices around the price now (`span`, a fraction either
 * side): the gamma profile. Where it crosses zero is the zero-gamma flip.
 */
export function profile(contracts, spot, { span = 0.12, steps = 97 } = {}) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const price = spot * (1 - span + (2 * span * i) / (steps - 1));
    let total = 0;
    for (const c of contracts) total += exposureOf(c, price);
    out.push({ price, total });
  }
  return out;
}

/** The zero-gamma flip: where the profile crosses zero, the crossing nearest the price now; null if it never does. */
export function flipOf(points, spot) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.total === 0 || Math.sign(a.total) === Math.sign(b.total)) continue;
    const price = a.price + ((0 - a.total) / (b.total - a.total)) * (b.price - a.price);
    if (best === null || Math.abs(price - spot) < Math.abs(best - spot)) best = price;
  }
  return best;
}

/**
 * The walls: the strike with the most call exposure and the one with the
 * most put exposure; and the strikes with the most net exposure either way.
 */
export function walls(rows) {
  let call = null;
  let put = null;
  for (const r of rows) {
    if (r.callGex > 0 && (!call || r.callGex > call.callGex)) call = r;
    if (r.putGex < 0 && (!put || r.putGex < put.putGex)) put = r;
  }
  const net = [...rows].map((r) => ({ strike: r.strike, net: r.callGex + r.putGex })).filter((r) => r.net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 6);
  return { call: call ? call.strike : null, put: put ? put.strike : null, top: net };
}

/** Exposure per expiry, soonest first (`i`: its index in the chain), with each one's share of all the gamma (calls and puts both counted). */
export function byExpiry(prepared, contracts, spot) {
  const rows = prepared.expiries.map((e, i) => ({ ...e, i, call: 0, put: 0, net: 0, share: 0 }));
  let gross = 0;
  for (const c of contracts) {
    const g = exposureOf(c, spot);
    if (c.call) rows[c.ei].call += g; else rows[c.ei].put += g;
    gross += Math.abs(g);
  }
  for (const r of rows) { r.net = r.call + r.put; r.share = gross ? (Math.abs(r.call) + Math.abs(r.put)) / gross : 0; }
  return rows.filter((r) => r.open && (r.call || r.put));
}

/** Dollars in short form: $1.24B, $356M, $12.4K. */
export function money(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

/** A count in short form: 1.2M, 45.3K, 812. */
export function count(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(a).toLocaleString("en-US")}`;
}

const pct = (a, b) => ((a - b) / b) * 100;
const at = (v) => (v >= 100 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2));

/**
 * The picture in plain sentences: the regime, where the flip and the walls
 * sit against the price, how much expires soonest, and what the figures
 * stand on. Description only: what the estimate shows, never what to trade.
 */
export function readout({ symbol, spot, netGex, flip, wall, nearest, oiDate }) {
  const out = [];
  if (netGex > 0) {
    out.push({ kind: "regime", tone: "pos", text: `Positive gamma: dealers are estimated long ${money(netGex)} of gamma per 1% move. Their hedging leans against the move (selling rallies, buying dips), which tends to damp swings and pull price toward the large strikes.` });
  } else if (netGex < 0) {
    out.push({ kind: "regime", tone: "neg", text: `Negative gamma: dealers are estimated short ${money(-netGex)} of gamma per 1% move. Their hedging goes with the move (buying rallies, selling dips), which tends to widen swings and speed up breaks.` });
  }
  if (flip) {
    const d = pct(spot, flip);
    out.push({ kind: "flip", text: `${symbol} at ${at(spot)} is ${Math.abs(d).toFixed(1)}% ${d >= 0 ? "above" : "below"} the zero-gamma flip at ${at(flip)}. ${d >= 0 ? "Below the flip the estimated regime turns negative." : "Above the flip the estimated regime turns positive."}` });
  } else {
    out.push({ kind: "flip", text: `No zero-gamma flip within 12% of ${at(spot)}: the regime holds across that whole range.` });
  }
  if (wall.call !== null || wall.put !== null) {
    const parts = [];
    if (wall.call !== null) parts.push(`the call wall at ${at(wall.call)} (${pct(wall.call, spot) >= 0 ? "+" : ""}${pct(wall.call, spot).toFixed(1)}%)`);
    if (wall.put !== null) parts.push(`the put wall at ${at(wall.put)} (${pct(wall.put, spot) >= 0 ? "+" : ""}${pct(wall.put, spot).toFixed(1)}%)`);
    out.push({ kind: "walls", text: `The most hedging sits at ${parts.join(" and ")}. Large strikes like these often act as reference levels: price tends to slow near them in positive gamma and can run through them in negative gamma.` });
  }
  if (nearest && nearest.share >= 0.2) {
    out.push({ kind: "expiry", text: `${Math.round(nearest.share * 100)}% of the gamma expires ${nearest.days === 0 ? "today" : nearest.days === 1 ? "tomorrow" : `on ${nearest.expiry}`}: these levels can shift once it rolls off.` });
  }
  if (oiDate) out.push({ kind: "data", text: `Open interest as of ${oiDate} (published once a day); exposure moves through the day with the price only.` });
  return out;
}
