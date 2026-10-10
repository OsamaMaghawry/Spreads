// SnapTrade's account history, in the shape the trade engine reads.
//
// The any-broker plan (10 Oct): read accounts at Schwab, Fidelity, IBKR or
// Robinhood through SnapTrade and run the SAME reconstruction DeltaMint runs
// on Alpaca. The engine needs very little -- option and share fills, and the
// expiries, assignments and exercises that close an option without a fill --
// and pairs spread legs itself, so this translation is the whole adapter.
//
// It is proven against an account DeltaMint already reads natively: the
// owner's Alpaca paper account, connected through SnapTrade as well. Both
// readings go through `reconstruct`, and `compareTrades` says where they part.

const ENGINE_TYPE: Record<string, string> = {
  OPTIONEXPIRATION: "OPEXP",
  OPTIONASSIGNMENT: "OPASN",
  OPTIONEXERCISE: "OPEXC"
};

const day = (v: unknown) => String(v || "").slice(0, 10);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

// "XOP   261009P00177000" is the OCC symbol with its root padded to six
// characters; the engine and our records write it unpadded.
export const occOf = (ticker: unknown) => String(ticker || "").replace(/\s+/g, "");

export function toEngineActivities(rows: any[]): { activities: any[]; skipped: Record<string, number> } {
  const activities: any[] = [];
  const skipped: Record<string, number> = {};
  const skip = (t: string) => { skipped[t] = (skipped[t] || 0) + 1; };

  for (const r of rows || []) {
    const type = String(r?.type || "").toUpperCase();
    const option = r?.option_symbol?.ticker ? occOf(r.option_symbol.ticker) : null;
    const qty = Math.abs(num(r?.units) ?? 0);

    if (ENGINE_TYPE[type]) {
      if (!option) { skip(`${type} without a contract`); continue; }
      activities.push({ id: r.id, activity_type: ENGINE_TYPE[type], symbol: option, qty, date: day(r.trade_date || r.settlement_date) });
      continue;
    }

    if (type === "BUY" || type === "SELL") {
      // A share fill names the stock; an option fill names the contract.
      const symbol = option || r?.symbol?.symbol || r?.symbol?.raw_symbol || null;
      const price = num(r?.price);
      if (!symbol || !qty || price === null) { skip(`${type} unreadable`); continue; }
      activities.push({
        id: r.id,
        activity_type: "FILL",
        symbol,
        side: type === "BUY" ? "buy" : "sell",
        qty,
        price,
        transaction_time: String(r.trade_date || r.settlement_date || ""),
        // No order id on SnapTrade activities. The engine reads one only for
        // the client-order-id strategy prefix, which no other broker carries.
        order_id: null
      });
      continue;
    }

    // Fees, deposits, dividends, and OPTRD -- the share delivery behind an
    // assignment, which the engine derives from the assignment itself.
    skip(type || "unknown");
  }
  return { activities, skipped };
}

// Two readings of one account, trade by trade. Keyed on what a trade IS --
// its legs, the day it closed and how -- not on strategy, which DeltaMint
// reads from Alpaca's client order ids and no other broker has.
export function compareTrades(ours: any[], theirs: any[], { from = "", to = "" } = {}) {
  const inWindow = (t: any) => {
    const d = day(t.close_date);
    return (!from || d >= from) && (!to || d <= to);
  };
  const key = (t: any) => [t.short_symbol || "", t.long_symbol || "", day(t.close_date), t.close_reason].join("|");
  const group = (list: any[]) => {
    const m = new Map<string, { qty: number; pl: number; n: number }>();
    for (const t of list.filter(inWindow)) {
      const g = m.get(key(t)) || { qty: 0, pl: 0, n: 0 };
      g.qty += Number(t.qty) || 0;
      g.pl += Number(t.realized_pl) || 0;
      g.n += 1;
      m.set(key(t), g);
    }
    return m;
  };
  const a = group(ours);
  const b = group(theirs);
  const matched: string[] = [];
  const differ: any[] = [];
  const onlyOurs: string[] = [];
  const onlyTheirs: string[] = [];
  for (const [k, g] of a) {
    const h = b.get(k);
    if (!h) onlyOurs.push(k);
    else if (Math.abs(g.qty - h.qty) < 1e-9 && Math.abs(g.pl - h.pl) < 0.01) matched.push(k);
    else differ.push({ key: k, ours: { qty: g.qty, pl: Math.round(g.pl * 100) / 100 }, theirs: { qty: h.qty, pl: Math.round(h.pl * 100) / 100 } });
  }
  for (const k of b.keys()) if (!a.has(k)) onlyTheirs.push(k);
  const total = (m: Map<string, { pl: number }>) => Math.round([...m.values()].reduce((s, g) => s + g.pl, 0) * 100) / 100;
  return {
    window: { from: from || null, to: to || null },
    ours: { trades: a.size, realized: total(a) },
    theirs: { trades: b.size, realized: total(b) },
    matched: matched.length,
    differ: differ.slice(0, 20),
    differCount: differ.length,
    onlyOurs: onlyOurs.slice(0, 20),
    onlyOursCount: onlyOurs.length,
    onlyTheirs: onlyTheirs.slice(0, 20),
    onlyTheirsCount: onlyTheirs.length
  };
}
