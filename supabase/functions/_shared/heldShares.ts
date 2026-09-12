// The shares an account holds, and what they cost -- the covered call's inputs.
//
// Read live from the broker (positions are never stored), then priced at the
// wheel's adjusted basis where the history layer can link the shares to the
// put that produced them, else the broker's basis, labelled as such. Shared
// by scanEntries and findEntry so the two agree on which tickers a covered
// call may be written on.
import { tradingBase, alpacaFetch } from "./alpaca.ts";
import { selectAllWhere } from "./paging.ts";
import { parseOCCSymbol } from "./occ.ts";
import { basisByTicker } from "./wheelBasis.ts";

export async function heldShares(admin: any, account: any) {
  const positions = await alpacaFetch(`${tradingBase(account)}/positions`, account);
  const shares: Record<string, number> = {};
  const brokerBasis: Record<string, number> = {};
  for (const p of Array.isArray(positions) ? positions : []) {
    if (parseOCCSymbol(p.symbol)) continue;
    const qty = parseFloat(p.qty);
    if (!(qty > 0)) continue;
    const sym = String(p.symbol).toUpperCase();
    shares[sym] = (shares[sym] || 0) + qty;
    const avg = parseFloat(p.avg_entry_price);
    if (avg > 0) brokerBasis[sym] = avg;
  }

  let basis: Record<string, any> = {};
  try {
    // PAGED. An adjusted basis built from a truncated lot set is a WRONG
    // basis, not a missing one: the tickers past the cap silently fall back to
    // the broker's average entry price while still being labelled adjusted.
    const [lots, wheelRecords] = await Promise.all([
      selectAllWhere(admin, "stock_lots",
        "ticker, qty, acquired_price, acquired_date, chain_id, disposed_date", "id",
        (q: any) => q.eq("account_id", account.id).is("disposed_date", null)),
      selectAllWhere(admin, "trade_records",
        "ticker, strategy, chain_id, net_credit, qty, open_date, close_date", "id",
        (q: any) => q.eq("account_id", account.id).eq("strategy", "wheel"))
    ]);
    basis = basisByTicker(lots || [], wheelRecords || []);
  } catch (e) {
    console.error("held shares basis lookup failed", account.id, e?.message || e);
  }
  // A ticker the history layer has no lot for still has the broker's own
  // average entry price; that is a basis, labelled broker.
  for (const sym of Object.keys(shares)) {
    if (!basis[sym] && brokerBasis[sym]) {
      basis[sym] = { basis: brokerBasis[sym], brokerBasis: brokerBasis[sym], collected: 0, shares: shares[sym], source: "broker" };
    }
  }
  return { shares, basis, tickers: Object.keys(shares).filter((t) => shares[t] >= 100) };
}
