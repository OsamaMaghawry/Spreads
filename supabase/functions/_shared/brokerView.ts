// The broker's own position list, passed through and not interpreted.
//
// Everything else in this app groups, pairs, names and derives. Every one of
// those steps is a place to be wrong, and on 8 Sep several of them were at
// once: two legs of a live position vanished from the dashboard because the
// pairing could not name their shape, and the close ticket would have sent an
// order for a structure the account does not hold.
//
// This is the floor underneath all of it. One row per line the broker
// reports, carrying the BROKER's numbers — its quantity, its average entry,
// its market value, its unrealised P/L — with no arithmetic of ours anywhere
// near them. If our grouping is wrong, or names something oddly, or hides a
// leg, this row is still here and still closes, because it is a single symbol
// and a single quantity and needs no structure to be understood.
//
// It is deliberately dull. The moment this file starts deriving something it
// stops being the thing you can trust when everything else is suspect.

import { parseOCCSymbol } from "./occ.ts";

const num = (v: any) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export function brokerView(positions: any[]) {
  return (positions || [])
    .map((p: any) => {
      const qty = num(p.qty) ?? 0;
      const occ = parseOCCSymbol(p.symbol);
      // qty_available is the broker's own answer to "how much of this will you
      // accept an order for right now" — the holding less whatever a working
      // order already claims. Passed through, never recomputed.
      const available = p.qty_available === undefined || p.qty_available === null ? qty : num(p.qty_available) ?? qty;
      return {
        symbol: p.symbol,
        // What it IS, from the symbol alone. An OCC symbol parses; anything
        // else is stock. No pairing, no cover, no classification.
        assetClass: occ ? "option" : "equity",
        ticker: occ ? occ.ticker : p.symbol,
        underlying: occ ? occ.underlying : p.symbol,
        optionType: occ ? occ.type : null,
        strike: occ ? occ.strike : null,
        expiry: occ ? occ.expiryFormatted : null,
        // A corporate action changed what this contract delivers. Shown so the
        // row can say so; nothing here depends on it, because nothing here
        // multiplies by a deliverable.
        adjusted: !!occ?.adjusted,
        qty,
        qtyAvailable: available,
        side: qty < 0 ? "short" : "long",
        avgEntryPrice: num(p.avg_entry_price),
        currentPrice: num(p.current_price),
        marketValue: num(p.market_value),
        costBasis: num(p.cost_basis),
        // The BROKER's unrealised P/L, not ours. Where the two disagree, this
        // is the one the statement will agree with, and that disagreement is
        // itself worth being able to see.
        unrealizedPL: num(p.unrealized_pl),
        unrealizedPLPct: num(p.unrealized_plpc),
        // What closing this one line means at the broker: sell what is held
        // long, buy back what is held short. The only judgement in the file,
        // and it is the same judgement Alpaca itself makes.
        closeAction: qty < 0 ? "buy_to_close" : "sell_to_close"
      };
    })
    // Options first, then stock, then by ticker: the order a trader scans in.
    .sort((a, b) =>
      a.ticker === b.ticker
        ? a.assetClass === b.assetClass
          ? String(a.symbol).localeCompare(String(b.symbol))
          : a.assetClass === "option" ? -1 : 1
        : String(a.ticker).localeCompare(String(b.ticker))
    );
}

// What the app's own view claims to hold, in the same terms, so the two can be
// compared line by line. A symbol the broker reports and the dashboard does
// not is the failure this whole view exists to catch.
export function coverageGaps(rawPositions: any[], pairedRows: any[]) {
  const held = new Map<string, number>();
  for (const p of rawPositions || []) {
    const q = num(p.qty) ?? 0;
    if (q) held.set(p.symbol, (held.get(p.symbol) || 0) + q);
  }

  const shown = new Map<string, number>();
  for (const r of pairedRows || []) {
    const units = Math.abs(Number(r.qty) || 0);
    if (r.type === "shares" || r.shares) {
      const sym = r.longSymbol || r.ticker;
      const q = Number(r.shareQty ?? r.qty) || 0;
      if (sym && q) shown.set(sym, (shown.get(sym) || 0) + q);
      continue;
    }
    for (const l of r.legs || []) {
      if (!l?.symbol) continue;
      const q = (l.side === "short" ? -1 : 1) * (Number(l.ratio) || 1) * units;
      shown.set(l.symbol, (shown.get(l.symbol) || 0) + q);
    }
  }

  const gaps: any[] = [];
  for (const [symbol, qty] of held) {
    const on = shown.get(symbol) || 0;
    // Rounded because a share lot can be fractional and a cent of float is
    // not a missing position.
    if (Math.abs(on - qty) > 0.0001) {
      gaps.push({ symbol, broker: qty, dashboard: on, missing: Math.round((qty - on) * 10000) / 10000 });
    }
  }
  // And the reverse: something on screen the broker does not report.
  for (const [symbol, qty] of shown) {
    if (!held.has(symbol) && Math.abs(qty) > 0.0001) {
      gaps.push({ symbol, broker: 0, dashboard: qty, missing: -qty });
    }
  }
  return gaps;
}
