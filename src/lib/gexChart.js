// Gamma on the price chart (10 Nov 2026, the owner: "when we open the chart,
// can we add the walls levels and something about gamma? ... we need to have
// the option to add it or hide it", then "sometimes I see it, sometimes not.
// It seems that I have to open the gamma page first ... make sure to have it
// and to put it in the chart"). Each chart reads its own symbol's chain
// (functions/terminal "gex"); the figures are the screener's, expiries within
// 30 days (gexScreen.js screenSummary), so the chart, the screener and the
// Gamma page's default agree. Pure, and tested (gexChart.test.js).

import { screenSummary } from "./gexScreen.js";

export const GEX_LINE_KINDS = [["call", "Call wall"], ["put", "Put wall"], ["flip", "Zero-gamma flip"]];
export const GEX_LINES_DEFAULT = { call: true, put: true, flip: true };

/** The chart's gamma switches, any stored value made safe. */
export const cleanGexLines = (v) =>
  Object.fromEntries(GEX_LINE_KINDS.map(([k]) => [k, typeof v?.[k] === "boolean" ? v[k] : GEX_LINES_DEFAULT[k]]));
export const anyGexLine = (v) => GEX_LINE_KINDS.some(([k]) => v?.[k] === true);

/** The hedge against volume (a fraction) as the screener shows it: "2.4%", "−12%"; "—" when unknown. */
export const hedgePct = (h) => {
  if (h === null || h === undefined || !Number.isFinite(h)) return "—";
  const p = h * 100;
  const one = Math.abs(p).toFixed(1);
  return `${p < 0 ? "−" : ""}${Number(one) >= 10 ? Math.abs(p).toFixed(0) : one}%`;
};

/** What the chart shows from a chain: the walls, the flip, net gamma and the hedge against volume; null when nothing is open. */
export function chartGamma(chain, now) {
  const s = chain ? screenSummary(chain, now) : null;
  if (!s) return null;
  const adv = Number(chain.avgDollar20);
  return {
    symbol: chain.symbol || null, spot: s.spot, at: s.at, net: s.net,
    flip: s.flip, callWall: s.callWall, putWall: s.putWall,
    hedge: adv > 0 ? s.net / adv : null
  };
}

/** The price lines for the switches that are on: [{ kind, price, title }]; one line when both walls share a strike. */
export function gexLines(g, show) {
  if (!g) return [];
  const call = show?.call && g.callWall > 0 ? g.callWall : null;
  const put = show?.put && g.putWall > 0 ? g.putWall : null;
  return [
    call !== null && call === put ? { kind: "both", price: call, title: "GEX call+put wall" } : null,
    call !== null && call !== put ? { kind: "call", price: call, title: "GEX call wall" } : null,
    put !== null && call !== put ? { kind: "put", price: put, title: "GEX put wall" } : null,
    show?.flip && g.flip > 0 ? { kind: "flip", price: g.flip, title: "Zero gamma" } : null
  ].filter(Boolean);
}
