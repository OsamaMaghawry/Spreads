// Gamma exposure in the screener (8 Nov 2026, the owner, approving the design:
// "let's try this combination and see"): each morning the server works out
// gamma for the most traded optionable shares and funds (functions/terminal
// "gexScreenJob", kept in gex_daily); the screener then reads each one's
// figures at the live price. Expiries within 30 days, as the Gamma page shows
// by default; the options expiring today counted (they matter today).
//
// What is kept per share is small: the net gamma, flip and walls at the price
// then, and the total at 49 prices from 12% below to 12% above it, so the
// regime and net gamma can follow the price through the day without reading
// the chain again. Pure, and tested (src/lib/gexScreen.test.js).

import { prepare, pick, byStrike, walls, profile, flipOf } from "./gex.js";

export const SCREEN_EXPIRY_DAYS = 30;
const SPAN = 0.12;
const STEPS = 49;
const r4 = (v) => Math.round(v * 10000) / 10000;

/** A share's figures from its chain (functions/terminal gexChain) read at `now`; null when nothing is open. */
export function screenSummary(chain, now) {
  const prepared = prepare(chain, now);
  const contracts = pick(prepared, { days: SCREEN_EXPIRY_DAYS });
  const spot = Number(chain?.spot);
  if (!contracts.length || !(spot > 0)) return null;
  const g = byStrike(contracts, spot, "gex");
  const w = walls(g.rows);
  const points = profile(contracts, spot, { span: SPAN, steps: STEPS });
  const flip = flipOf(points, spot);
  return {
    spot, at: chain.at || null, oiDate: chain.oiDate || null, contracts: contracts.length,
    net: Math.round(g.totals.netGex),
    flip: flip === null ? null : Math.round(flip * 100) / 100,
    callWall: w.call, putWall: w.put,
    // The total at each of the prices from `lo` to `hi`, in $ thousands.
    lo: r4(points[0].price), hi: r4(points[points.length - 1].price),
    k: points.map((p) => Math.round(p.total / 1000))
  };
}

/** Net gamma (dollars per 1% move) at a price, read off the kept profile; null outside it. */
export function gammaAt(s, price) {
  const n = s?.k?.length || 0;
  if (n < 2 || !(price > 0) || !(s.hi > s.lo)) return null;
  const x = ((price - s.lo) / (s.hi - s.lo)) * (n - 1);
  if (x < 0 || x > n - 1) return null;
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  return (s.k[i] * (1 - f) + s.k[i + 1] * f) * 1000;
}

/**
 * The screener's gamma figures for a share at its price now: net gamma and
 * its sign, the hedge against a normal day's dollar volume (`avgDollar20`;
 * a fraction, shown as a percentage), and the distances from the price to the
 * flip and the walls (fractions; plus when the level is above). Null when the
 * share has none kept.
 */
export function gammaFields(s, price, avgDollar20) {
  if (!s || !(price > 0)) return null;
  const net = gammaAt(s, price);
  const rel = (v) => (v === null || v === undefined ? null : v / price - 1);
  const toFlip = rel(s.flip);
  const toCall = rel(s.callWall);
  const toPut = rel(s.putWall);
  const walls2 = [toCall, toPut].filter((v) => v !== null);
  return {
    gexNet: net,
    gexSign: net === null ? null : net >= 0 ? 1 : -1,
    gexHedge: net !== null && avgDollar20 > 0 ? net / avgDollar20 : null,
    gexFlip: s.flip ?? null,
    gexToFlip: toFlip,
    gexFlipAbs: toFlip === null ? null : Math.abs(toFlip),
    gexCallWall: s.callWall ?? null,
    gexToCall: toCall,
    gexPutWall: s.putWall ?? null,
    gexToPut: toPut,
    gexWallAbs: walls2.length ? Math.min(...walls2.map(Math.abs)) : null,
    gexAt: s.at || null
  };
}

/**
 * The shares to work out on a day: the most dollars traded in the last full
 * session before it, among those with options listed. `bars`: symbol → daily
 * candles ({ t, c, v }, oldest first).
 */
export function screenUniverse(bars, day, count = 300) {
  const out = [];
  for (const [symbol, list] of Object.entries(bars || {})) {
    const done = (list || []).filter((b) => String(b.t).slice(0, 10) < day);
    const last = done[done.length - 1];
    if (!last || !(last.c > 0) || !(last.v > 0)) continue;
    out.push({ symbol, dollarVol: last.c * last.v });
  }
  return out.sort((a, b) => b.dollarVol - a.dollarVol).slice(0, count);
}
