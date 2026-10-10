// A SnapTrade account, read in the shapes the Alpaca code already consumes.
//
// The Dashboard sync (accountSync.ts) and the trade history sync
// (tradeHistory) were written against Alpaca's account, positions, order and
// activity objects. Rather than teach each of them a second broker, a
// SnapTrade account is translated at the door: same fields, same meanings, so
// pairing, risk, P/L, the wheel basis and the reconstruction run unchanged.
//
// Proven on the owner's Alpaca paper account read both ways (10 Oct): the
// rebuilt history matched 53 of 53 trades to the cent, and the positions and
// balance matched the native read. The option POSITION shape is the one part
// not yet seen from a real account holding options, so the mapper reads every
// place SnapTrade is documented to put a contract and says so where it
// cannot find one, rather than guessing.

import { snapFetch } from "./snaptrade.ts";
import { loadSnapUser } from "./snaptradeUser.ts";
import { toEngineActivities, occOf } from "./snaptradeHistory.ts";
import { parseOCCSymbol } from "./occ.ts";

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

// The list inside a SnapTrade response, wherever they put it.
export const listOf = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
};

// The contract a position or order names, as an OCC symbol, or null when the
// row is not an option. Read from every place their API carries one.
export function contractOf(row: any): string | null {
  const inst = row?.instrument ?? row?.symbol ?? {};
  const candidates = [
    row?.option_symbol?.ticker,
    inst?.option_symbol?.ticker,
    /option/i.test(String(inst?.kind ?? inst?.type ?? "")) ? inst?.symbol ?? inst?.raw_symbol : null
  ];
  for (const c of candidates) {
    const occ = c ? occOf(c) : "";
    if (occ && parseOCCSymbol(occ)) return occ;
  }
  return null;
}

/**
 * /accounts/{id}/positions/all -> Alpaca /v2/positions rows.
 *
 * Shares: `price` and `cost_basis` are per share (AMZN 262.43 and 226.91 on
 * the owner's paper account, the same as the native read). Options are read
 * the same way, per share of the contract, which is how option premiums are
 * quoted everywhere; flagged on the row until an account holding options
 * confirms it.
 */
export function toAlpacaPositions(rows: any[]): any[] {
  const out: any[] = [];
  for (const r of rows || []) {
    const units = num(r?.units);
    if (units === null || units === 0) continue;
    const price = num(r?.price);
    const basis = num(r?.cost_basis ?? r?.average_purchase_price);
    const option = contractOf(r);
    const symbol = option || String(r?.instrument?.symbol ?? r?.symbol?.symbol ?? r?.symbol ?? "");
    if (!symbol) continue;
    const multiplier = option ? 100 : 1;
    const qty = units;
    const marketValue = price === null ? null : price * qty * multiplier;
    const costBasis = basis === null ? null : basis * qty * multiplier;
    out.push({
      symbol,
      qty: String(qty),
      qty_available: String(qty),
      side: qty < 0 ? "short" : "long",
      asset_class: option ? "us_option" : "us_equity",
      avg_entry_price: basis === null ? null : String(basis),
      current_price: price === null ? null : String(price),
      market_value: marketValue === null ? null : String(marketValue),
      cost_basis: costBasis === null ? null : String(costBasis),
      unrealized_pl: marketValue === null || costBasis === null ? null : String(marketValue - costBasis),
      source: "snaptrade",
      ...(option ? { priceUnitUnverified: true } : {})
    });
  }
  return out;
}

// Balances and the account's own total -> the fields syncOne reads off
// Alpaca's /v2/account.
export function toAlpacaInfo(account: any, balances: any[]): Record<string, string> {
  const usd = (balances || []).find((b) => String(b?.currency?.code ?? b?.currency ?? "").toUpperCase() === "USD") || balances?.[0] || {};
  const cash = num(usd?.cash) ?? 0;
  const bp = num(usd?.buying_power) ?? cash;
  const equity = num(account?.balance?.total?.amount) ?? cash;
  return {
    equity: String(equity),
    cash: String(cash),
    buying_power: String(bp),
    options_buying_power: String(bp)
  };
}

/**
 * Executed orders -> Alpaca-style multi-leg orders, for the one thing pairing
 * reads them for: legs opened together by one order form one structure.
 * SnapTrade marks the legs of one multi-leg order with a shared
 * `brokerage_group_order_id` (the AMD 527.5/530 call spread on 10 Oct).
 */
export function toAlpacaMultiLegOrders(orders: any[]): any[] {
  const groups = new Map<string, any[]>();
  for (const o of orders || []) {
    const g = o?.brokerage_group_order_id;
    if (!g || String(o?.status || "").toUpperCase() !== "EXECUTED") continue;
    const list = groups.get(g) || [];
    list.push(o);
    groups.set(g, list);
  }
  const out: any[] = [];
  for (const [id, legs] of groups) {
    if (legs.length < 2) continue;
    const mapped = legs
      .map((l) => ({
        symbol: contractOf(l),
        side: String(l?.action || "").toUpperCase().startsWith("BUY") ? "buy" : "sell",
        filled_qty: String(num(l?.filled_quantity) ?? 0),
        status: "filled"
      }))
      .filter((l) => l.symbol);
    if (mapped.length < 2) continue;
    const times = legs.map((l) => String(l?.time_executed || l?.time_updated || "")).filter(Boolean).sort();
    out.push({ id, status: "filled", filled_at: times[times.length - 1] || null, submitted_at: times[0] || null, legs: mapped });
  }
  return out;
}

async function scopedFor(admin: any, account: any) {
  const user = await loadSnapUser(admin, account.user_id);
  if (!user) throw new Error("This account's SnapTrade connection is missing. Connect the broker again from Accounts.");
  if (!account.snaptrade_account_id) throw new Error("This account has no SnapTrade account id.");
  return { userId: user.snapTradeUserId, userSecret: user.userSecret };
}

// The Dashboard refreshes continuously and waits for its slowest account.
// SnapTrade's own copy of a broker account moves about once a day on the plan
// in use, so re-reading it on every refresh bought nothing and cost seventeen
// seconds on the first real run (10 Oct). Each instance keeps the last read
// for a few minutes, and no single call may hold the page past the timeout.
const READ_CACHE_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 8_000;
const lastRead = new Map<string, { at: number; value: any }>();

// Everything syncOne fetches from Alpaca, from SnapTrade instead.
export async function fetchSnapTradeRaw(admin: any, account: any) {
  const id = account.snaptrade_account_id;
  const hit = lastRead.get(id);
  if (hit && Date.now() - hit.at < READ_CACHE_MS) return hit.value;

  const scoped = { ...(await scopedFor(admin, account)), timeoutMs: READ_TIMEOUT_MS };
  const [acct, balances, positions, orders, activities] = await Promise.all([
    snapFetch<any>({ path: `/accounts/${id}`, ...scoped }),
    snapFetch<any>({ path: `/accounts/${id}/balances`, ...scoped }),
    snapFetch<any>({ path: `/accounts/${id}/positions/all`, ...scoped }),
    snapFetch<any>({ path: `/accounts/${id}/orders`, query: { days: 90 }, ...scoped }),
    snapFetch<any>({ path: `/accounts/${id}/activities`, query: { start_date: "2024-01-01", limit: 1000 }, ...scoped })
  ]);
  if (!positions.ok) throw new Error(`SnapTrade positions: ${positions.status} ${positions.error || ""}`.trim());
  const value = {
    info: toAlpacaInfo(acct.ok ? acct.data : null, listOf(balances.data)),
    positions: toAlpacaPositions(listOf(positions.data)),
    activities: toEngineActivities(listOf(activities.data)).activities,
    openOrders: [],
    filledOrders: toAlpacaMultiLegOrders(listOf(orders.data)),
    freshness: (positions.data as any)?.data_freshness ?? null
  };
  lastRead.set(id, { at: Date.now(), value });
  return value;
}

// The whole history, for the trade engine. Paged, because an account with
// years of activity runs past one page of a thousand rows.
export async function fetchSnapTradeHistory(admin: any, account: any) {
  const scoped = await scopedFor(admin, account);
  const rows: Record<string, unknown>[] = [];
  for (let page = 0, offset = 0; page < 50; page++) {
    const res = await snapFetch<unknown>({
      path: `/accounts/${account.snaptrade_account_id}/activities`,
      query: { start_date: "2015-01-01", limit: 1000, offset },
      ...scoped
    });
    if (!res.ok) throw new Error(`SnapTrade activities: ${res.status} ${res.error || ""}`.trim());
    const list = listOf(res.data);
    rows.push(...list);
    if (list.length < 1000) break;
    offset += list.length;
  }
  return toEngineActivities(rows);
}
