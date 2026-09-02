// What a wheel position's shares actually cost, once the premiums are counted.
//
// On assignment the broker records the STRIKE as the entry price and books the
// put premium as a separate closed option trade. Alpaca's own docs say the
// premium "reduces your effective cost basis" -- but the position never carries
// it. So an assigned-then-covered lot shows a max loss, a break-even and an
// unrealized P/L that are all overstated by the put premium, and by every
// covered-call premium collected since.
//
// Every wheel tracker converges on one definition, and it is the one a wheel
// trader means by "my basis":
//
//     adjusted basis = assignment strike - every credit collected on the name
//
// This module is the arithmetic, kept pure so the definition is testable. The
// history layer already stores what it needs: open stock_lots carry chain_id
// pointing at the put that produced them, and trade_records carry net_credit
// per share for every closed wheel option. Nothing new is recorded.
//
// Where a lot has no chain -- shares bought outright, or acquired before the
// visible activity window -- the broker's basis is returned and LABELLED as
// such. Never silently one or the other.

const SHARES_PER_CONTRACT = 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

// lots:     open stock_lots rows for one account
//           { ticker, qty, acquired_price, acquired_date, chain_id }
// records:  closed trade_records with strategy = 'wheel' for the same account
//           { ticker, chain_id, net_credit (per share), qty (contracts), open_date }
//
// Returns per ticker: { basis, brokerBasis, collected, shares, source }.
//   basis        -- per share, adjusted where a chain exists
//   collected    -- total dollars of premium credited against this ticker's held shares
//   source       -- "adjusted" | "broker"
export function basisByTicker(lots: any[], records: any[]) {
  const out: Record<string, any> = {};
  const openLots = (lots || []).filter((l) => !l.disposed_date && num(l.qty) && num(l.qty)! > 0);
  if (openLots.length === 0) return out;

  const byTicker: Record<string, any[]> = {};
  for (const l of openLots) (byTicker[l.ticker] = byTicker[l.ticker] || []).push(l);

  const wheel = (records || []).filter((r) => r.strategy === "wheel" && num(r.net_credit) !== null && num(r.net_credit)! > 0);

  for (const ticker of Object.keys(byTicker)) {
    const tLots = byTicker[ticker];
    const totalShares = tLots.reduce((s, l) => s + num(l.qty)!, 0);
    const brokerBasis = tLots.reduce((s, l) => s + (num(l.acquired_price) || 0) * num(l.qty)!, 0) / totalShares;

    // The put that produced each lot, matched by the chain the history layer
    // wrote. A lot without a chain has no premium we can attribute to it.
    let chainDollars = 0;
    let chained = 0;
    const earliestAcquired = tLots.map((l) => l.acquired_date).filter(Boolean).sort()[0] || null;
    const chainIds = new Set(tLots.map((l) => l.chain_id).filter(Boolean));
    for (const l of tLots) {
      if (!l.chain_id) continue;
      const put = wheel.find((r) => r.chain_id === l.chain_id && r.ticker === ticker);
      if (!put) continue;
      chained += num(l.qty)!;
      chainDollars += num(put.net_credit)! * num(l.qty)!;
    }

    // Every wheel credit on the name sold on or after the shares arrived, other
    // than the puts already counted. Spread across every share held, which is
    // how the trackers define it and the only allocation that survives a lot
    // being partially covered.
    let laterDollars = 0;
    if (earliestAcquired) {
      for (const r of wheel) {
        if (r.ticker !== ticker) continue;
        if (r.chain_id && chainIds.has(r.chain_id)) continue;
        if (!r.open_date || r.open_date < earliestAcquired) continue;
        laterDollars += num(r.net_credit)! * (num(r.qty) || 0) * SHARES_PER_CONTRACT;
      }
    }

    const collected = round2(chainDollars + laterDollars);
    const source = chained > 0 ? "adjusted" : "broker";
    const basis = source === "adjusted" ? round2(brokerBasis - collected / totalShares) : round2(brokerBasis);
    out[ticker] = { basis, brokerBasis: round2(brokerBasis), collected, shares: totalShares, source };
  }
  return out;
}
