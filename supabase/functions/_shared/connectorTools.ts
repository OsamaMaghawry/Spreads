// The Claude connector's tools: what Claude can ask DeltaMint, and how the
// answers are shaped for a model to read.
//
// READ-ONLY, ALL OF THEM. Nothing here places, changes or cancels an order, and
// the token the connector holds could not do so anyway (connectorToken.ts,
// migration 0058). Acting on anything Claude finds is done by the user, in
// DeltaMint.
//
// NOT ADVICE. find_trades returns setups that match filters the user states,
// ranked by return on risk -- the same scan, filters and ranking as the
// Strategy Scanner (_shared/entryScan.ts), because a second ranking would be a
// second opinion and DeltaMint gives none. The words matter as much as the
// numbers: no tool calls anything "best", "recommended" or a "signal", and the
// server instructions tell Claude to present results as matches to the user's
// criteria. mcpProtocol.test.ts holds the descriptions to that.
//
// Every figure that could not be trusted stays null rather than becoming a
// number, the house rule, and every price travels with its time and source.
//
// The I/O is injected (ConnectorDeps) so the shaping here is tested without a
// broker or a database.

import type { Tool, ToolResult } from "./mcpProtocol.ts";
import { legsOf } from "./positionLegs.ts";
import { structureName } from "./structureName.ts";
import { prepare, pick as pickExpiries, byStrike, profile, flipOf, walls, byExpiry, readout, money } from "./gex.js";

export type AccountRow = { id: string; name: string; is_paper: boolean; provider?: string | null };

export type ConnectorDeps = {
  listAccounts: () => Promise<AccountRow[]>;
  // `only`: one account's id, read alone (7 Nov: reading a friend's eight
  // Robinhood accounts at once for one of them timed every one of them out).
  syncAccounts: (only?: string) => Promise<{ accounts: any[]; syncedAt: string }>;
  scan: (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;
  chain: (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;
  // The account's stored trade records -- the rows Trade History shows -- and
  // when they were last synced from the broker. Never triggers a sync.
  tradeHistory: (accountId: string) => Promise<{ trades: any[]; syncedAt: string | null; syncError: string | null }>;
  // The trading terminal's read actions, asked with the user's own token
  // (functions/terminal answers a connector token for reads only:
  // connectorToken.ts TERMINAL_READS). Absent where the terminal is not on
  // for this user.
  terminal?: (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;
  now: () => Date;
};

const STRATEGIES = {
  put_spread: "Put credit spread",
  call_spread: "Call credit spread",
  iron_condor: "Iron condor",
  cash_secured_put: "Cash-secured put",
  covered_call: "Covered call"
} as const;

// The Strategy Scanner's own defaults (src/components/scanner/ScannerConfig.jsx),
// so "find me put spreads on SPY" here and an untouched Scanner ask the same
// question.
export const SCANNER_DEFAULTS = {
  dteMin: 0, dteMax: 5, deltaMin: 0.12, deltaMax: 0.22, widthMin: 1, widthMax: 3, minCredit: 0.2
};

// Each ticker is a chain walk per expiry; past a handful the request outlives
// the function. The Scanner batches four at a time for the same reason.
export const MAX_TICKERS = 5;

const r2 = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;
};
const r4 = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000;
};

export function daysTo(expiry: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ""))) return null;
  const end = Date.UTC(+expiry.slice(0, 4), +expiry.slice(5, 7) - 1, +expiry.slice(8, 10));
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - start) / 86400000);
}

// The account a call is about: the one named, or the only one there is.
export async function pickAccount(deps: ConnectorDeps, accountId: unknown) {
  const accounts = await deps.listAccounts();
  if (!accounts.length) {
    return { error: "No brokerage account is connected to DeltaMint yet. Connect one in DeltaMint under Accounts." };
  }
  if (accountId) {
    const hit = accounts.find((a) => a.id === accountId);
    return hit ? { account: hit } : { error: `No account ${String(accountId)} for this user. Call list_accounts for the ids.` };
  }
  if (accounts.length === 1) return { account: accounts[0] };
  return {
    error:
      `This user has ${accounts.length} accounts. Pass account_id -- ` +
      accounts.map((a) => `${a.name} (${a.is_paper ? "paper" : "live"}): ${a.id}`).join("; ")
  };
}

const accountLabel = (a: AccountRow) => ({ account_id: a.id, name: a.name, type: a.is_paper ? "Paper" : "Live" });

// ---------- shaping: positions ----------

export function shapePosition(row: any) {
  const legs = legsOf(row);
  const named = structureName(legs);
  const be = [row.breakEvenLow, row.breakEven, row.breakEvenHigh].map(r2).filter((v) => v !== null);
  return {
    ticker: row.ticker ?? null,
    structure: named.label,
    expiry: row.expiry ?? null,
    quantity: r2(row.qty),
    direction: row.direction ?? null,
    credit_received: r2(row.totalCredit),
    // Null where the loss is not bounded or could not be computed -- never 0.
    max_loss: r2(row.maxRisk),
    unrealized_pl: r2(row.unrealizedPL),
    break_even: [...new Set(be)],
    moneyness: row.moneyness ?? null,
    underlying_price: r2(row.stockPrice),
    underlying_price_trusted: row.spotTrusted === true,
    underlying_price_source: row.spotSource ?? null,
    adjusted_contract: row.adjusted === true,
    legs: legs.map((l: any) => ({
      symbol: l.symbol,
      type: l.type === "S" ? "shares" : l.type === "C" ? "call" : "put",
      quantity: r2(l.qty),
      strike: r2(l.strike),
      expiry: l.expiry ?? null,
      entry_price: r2(l.entryPrice)
    }))
  };
}

export function shapeAccountSnapshot(acct: any) {
  if (!acct?.ok) {
    return { name: acct?.name ?? null, error: acct?.error || "The broker could not be read just now.", positions: [] };
  }
  return {
    name: acct.name,
    type: acct.type,
    equity: r2(acct.equity),
    cash: r2(acct.cash),
    buying_power: r2(acct.buyingPower),
    options_buying_power: r2(acct.optionsBuyingPower),
    open_pl: r2(acct.totals?.pl),
    // The Dashboard's risk total; null when some position's loss is unbounded,
    // because a sum that leaves one out is not the account's risk.
    total_max_loss: acct.riskComplete === false ? null : r2(acct.totals?.risk),
    open_orders: Array.isArray(acct.orders) ? acct.orders.length : null,
    positions: (acct.spreads || []).map(shapePosition)
  };
}

// ---------- shaping: scan candidates ----------

const legOf = (l: any) => {
  const role = String(l.role || "");
  return {
    action: l.side === "sell" ? "sell" : "buy",
    type: role.endsWith("_call") ? "call" : "put",
    strike: r2(l.strike),
    symbol: l.symbol ?? null,
    bid: r2(l.bid),
    ask: r2(l.ask),
    delta: r4(l.delta)
  };
};

export function shapeCandidate(c: any, i: number, now: Date) {
  const single = c.strategy === "cash_secured_put" || c.strategy === "covered_call";
  const credit = Number(c.credit);
  const maxRisk = Number(c.maxRisk);
  const out: Record<string, unknown> = {
    rank: i + 1,
    ticker: c.ticker,
    strategy: STRATEGIES[c.strategy as keyof typeof STRATEGIES] || c.strategy,
    expiry: c.expiry,
    days_to_expiry: daysTo(c.expiry, now),
    legs: (c.legs || []).map(legOf),
    credit_per_share: r2(credit),
    credit_per_contract: Number.isFinite(credit) ? r2(credit * 100) : null,
    max_loss_per_contract: r2(maxRisk),
    return_on_risk_pct: Number.isFinite(credit) && maxRisk > 0 ? r2((credit * 100 * 100) / maxRisk) : null,
    break_even_low: r2(c.breakEvenLow),
    break_even_high: r2(c.breakEvenHigh),
    underlying_price: r2(c.spot),
    underlying_price_source: c.spotSource ?? null,
    underlying_price_as_of: c.spotAsOf ?? null,
    earnings_before_expiry: c.earnings
      ? { date: c.earnings.date, session: c.earnings.session ?? null, days_away: c.earnings.daysAway ?? null }
      : c.earningsUnknown ? "unknown -- not on the earnings calendar" : null
  };
  if (single) {
    out.collateral = r2(c.collateral);
    out.percent_out_of_the_money = c.otmPct === null || c.otmPct === undefined ? null : r2(Number(c.otmPct) * 100);
  }
  if (c.strategy === "covered_call") {
    out.share_basis = r2(c.basis);
    out.share_basis_source = c.basisSource ?? null;
    out.profit_if_called = r2(c.ifCalled);
  }
  if (c.coverInUse) out.cover_already_in_use = c.coverInUse;
  return out;
}

// ---------- shaping: option chain ----------

const side = (o: any) =>
  o
    ? {
        symbol: o.symbol,
        bid: r2(o.bid),
        ask: r2(o.ask),
        last: r2(o.last),
        delta: r4(o.delta),
        implied_vol_pct: o.iv === null || o.iv === undefined ? null : r2(Number(o.iv) * 100),
        open_interest: o.openInterest ?? null,
        volume: o.volume ?? null
      }
    : null;

export function shapeChain(b: any, eachSide: number) {
  const ladder = Array.isArray(b.ladder) ? b.ladder : [];
  const atm = Math.max(0, Math.min(Number(b.atTheMoney) || 0, ladder.length - 1));
  const from = Math.max(0, atm - eachSide);
  const rows = ladder.slice(from, atm + eachSide + 1).map((s: any) => ({
    strike: r2(s.strike), call: side(s.call), put: side(s.put)
  }));
  return {
    ticker: b.ticker,
    expiry: b.expiry,
    other_expiries: (b.expiries || []).filter((d: string) => d !== b.expiry).slice(0, 24),
    more_expiries_listed: (b.expiries || []).length > 25 || !!b.expiriesTruncated,
    underlying_price: r2(b.spot),
    underlying_price_trusted: !!b.spotTrusted,
    underlying_price_source: b.spotSource ?? null,
    underlying_price_as_of: b.spotAsOf ?? null,
    strikes_shown: rows.length,
    strikes_listed: ladder.length,
    rows,
    shares_held: b.shares ?? 0,
    shares_free_to_cover_calls: b.sharesFree ?? 0,
    cover_already_in_use: b.coverInUse ?? null,
    share_basis: r2(b.basis),
    share_basis_source: b.basisSource ?? null
  };
}

// ---------- shaping: trade history ----------

// The History page's categories (src/lib/strategies.js), by the stored key.
export const TRADE_CATEGORIES: Record<string, string> = {
  spreads: "Spreads",
  cash_secured_put: "Cash-secured puts",
  covered_call: "Covered calls",
  long_put: "Long puts",
  long_call: "Long calls",
  wheel: "Wheel (not yet synced)",
  unknown: "Untagged"
};
const categoryOf = (t: any) => (TRADE_CATEGORIES[t?.strategy] ? t.strategy : "unknown");
const sum = (rows: any[], f: string) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);

// Analysis counts a trade towards the win rate only when its result is final
// (not provisional: no shares from an assignment still held) and not flagged by
// the integrity checks; a win is realized P/L above zero. Same rule here, so
// the rate Claude quotes is the rate DeltaMint shows (src/lib/analytics.js).
const settled = (t: any) => !t.provisional && !t.integrity_code;

export function shapeTrade(t: any) {
  const strike = (v: unknown) => (Number(v) > 0 ? r2(v) : null);
  return {
    ticker: t.ticker,
    category: TRADE_CATEGORIES[categoryOf(t)],
    open_date: t.open_date ?? null,
    close_date: t.close_date ?? null,
    expiry: t.expiry ?? null,
    how_it_closed: t.close_reason ?? null,
    quantity: r2(t.qty),
    short_strike: strike(t.short_strike),
    long_strike: strike(t.long_strike),
    short_symbol: t.short_symbol || null,
    long_symbol: t.long_symbol || null,
    // Per share, as the broker quotes options; the P/L fields are dollars.
    credit_per_share: r2(t.net_credit),
    close_cost_per_share: r2(t.close_debit),
    realized_pl: r2(t.realized_pl),
    premium_pl: r2(t.premium_pl),
    early_close_pl: r2(t.early_close_pl),
    assignment_pl: r2(t.stock_pl),
    result_final: !t.provisional,
    counts_in_win_rate: settled(t),
    integrity_flag: t.integrity_code || null
  };
}

export function summarizeTrades(rows: any[]) {
  const s = rows.filter(settled);
  const wins = s.filter((t) => (Number(t.realized_pl) || 0) > 0).length;
  const losses = s.filter((t) => (Number(t.realized_pl) || 0) < 0).length;
  const by = Object.keys(TRADE_CATEGORIES)
    .map((k) => {
      const g = rows.filter((t) => categoryOf(t) === k);
      return g.length
        ? {
            category: TRADE_CATEGORIES[k], trades: g.length, realized_pl: r2(sum(g, "realized_pl")),
            premium_pl: r2(sum(g, "premium_pl")), early_close_pl: r2(sum(g, "early_close_pl")), assignment_pl: r2(sum(g, "stock_pl"))
          }
        : null;
    })
    .filter(Boolean);
  const dates = rows.map((t) => t.close_date).filter(Boolean).sort();
  return {
    trades: rows.length,
    first_close: dates[0] ?? null,
    last_close: dates[dates.length - 1] ?? null,
    realized_pl: r2(sum(rows, "realized_pl")),
    premium_pl: r2(sum(rows, "premium_pl")),
    early_close_pl: r2(sum(rows, "early_close_pl")),
    assignment_pl: r2(sum(rows, "stock_pl")),
    win_rate: {
      wins, losses, flat: s.length - wins - losses, counted: s.length,
      not_counted: rows.length - s.length,
      percent: s.length ? r2((wins / s.length) * 100) : null,
      rule: "Final results only: a trade still holding shares from an assignment, or flagged by DeltaMint's integrity checks, is left out, as on the Analysis page. A win is realized P/L above zero."
    },
    by_category: by
  };
}

// ---------- the tools ----------

const ACCOUNT_ID = {
  type: "string",
  description: "The account to use, from list_accounts. May be left out when the user has only one account."
};

export function connectorTools({ terminal = true }: { terminal?: boolean } = {}): Tool<ConnectorDeps>[] {
  return [
    {
      name: "list_accounts",
      title: "List connected accounts",
      description:
        "Lists the brokerage accounts the user has connected to DeltaMint, each with its account_id and whether it is a paper or live account. Call this first when the user has more than one account.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async (_args, deps): Promise<ToolResult> => {
        const accounts = await deps.listAccounts();
        if (!accounts.length) {
          return { text: "No brokerage account is connected to DeltaMint yet.", data: { accounts: [] } };
        }
        return { text: `${accounts.length} connected account(s).`, data: { accounts: accounts.map(accountLabel) } };
      }
    },

    {
      name: "get_positions",
      title: "Get open positions",
      description:
        "Reads the user's open positions from their broker through DeltaMint, grouped the way the DeltaMint Dashboard shows them: each spread, condor, cash-secured put, covered call or share lot as one position, with credit received, maximum loss, unrealized P/L, break-even and moneyness, plus account equity, cash and buying power. A null figure means DeltaMint could not compute it reliably; say so rather than estimating it.",
      inputSchema: { type: "object", properties: { account_id: ACCOUNT_ID }, additionalProperties: false },
      run: async (args, deps): Promise<ToolResult> => {
        const pick = await pickAccount(deps, args.account_id);
        if ("error" in pick) return { text: pick.error as string, isError: true };
        const { accounts, syncedAt } = await deps.syncAccounts(pick.account!.id);
        const acct = accounts.find((a: any) => a.id === pick.account!.id);
        if (!acct) return { text: "That account could not be read just now. Try again shortly.", isError: true };
        const snap = shapeAccountSnapshot(acct);
        const n = snap.positions.length;
        // Read through SnapTrade (Robinhood and the other linked brokers): its
        // copy of the account, which SnapTrade refreshes from the broker about
        // once a day, so the figures are as of that refresh, not this read.
        const via = acct.source === "snaptrade";
        const brokerAsOf = via ? acct.brokerAsOf ?? null : null;
        return {
          text: via
            ? `${pick.account!.name}: ${n} open position(s), from SnapTrade's copy of the account${brokerAsOf ? `, last refreshed from the broker at ${brokerAsOf}` : " (refresh time not given)"}; read at ${syncedAt}. Trades made since that refresh are not in it yet.`
            : `${pick.account!.name}: ${n} open position(s), read from the broker at ${syncedAt}.`,
          data: { account: accountLabel(pick.account!), as_of: syncedAt, source: via ? "snaptrade" : "broker", broker_data_as_of: brokerAsOf, ...snap },
          isError: "error" in snap
        };
      }
    },

    {
      name: "get_trade_history",
      title: "Get closed trades",
      description:
        "Reads the user's closed trades -- the rows DeltaMint's Trade History page shows -- newest first, with each trade's dates, strikes, credit, how it closed, and realized P/L split into premium, early-close and assignment parts. " +
        "Filter by close date, ticker or category; page through long histories with offset. The summary covers every matching trade, not just the page: totals by category as the History page shows them, and the win rate counted the way DeltaMint's Analysis page counts it. " +
        "Records are as of the last sync from the broker (synced_at); trades closed since then appear after DeltaMint next syncs.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: ACCOUNT_ID,
          from_date: { type: "string", description: "Earliest close date, YYYY-MM-DD." },
          to_date: { type: "string", description: "Latest close date, YYYY-MM-DD." },
          ticker: { type: "string", description: "Only this underlying, e.g. \"TSLA\"." },
          category: { type: "string", enum: Object.keys(TRADE_CATEGORIES), description: "Only this category: spreads, cash_secured_put, covered_call, long_put, long_call." },
          limit: { type: "integer", description: "Trades to return in this page, 1-500. Default 100." },
          offset: { type: "integer", description: "Trades to skip, for the next page. Default 0." }
        },
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const pick = await pickAccount(deps, args.account_id);
        if ("error" in pick) return { text: pick.error as string, isError: true };
        const day = /^\d{4}-\d{2}-\d{2}$/;
        for (const k of ["from_date", "to_date"]) {
          if (args[k] !== undefined && !day.test(String(args[k]))) return { text: `${k} must be YYYY-MM-DD.`, isError: true };
        }
        const { trades, syncedAt, syncError } = await deps.tradeHistory(pick.account!.id);
        const ticker = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : null;
        const rows = trades
          .filter((t: any) => t.close_date)
          .filter((t: any) => !args.from_date || String(t.close_date) >= String(args.from_date))
          .filter((t: any) => !args.to_date || String(t.close_date) <= String(args.to_date))
          .filter((t: any) => !ticker || String(t.ticker).toUpperCase() === ticker)
          .filter((t: any) => !args.category || categoryOf(t) === args.category)
          .sort((a: any, b: any) => String(b.close_date).localeCompare(String(a.close_date)));
        const limit = Math.max(1, Math.min(500, typeof args.limit === "number" ? args.limit : 100));
        const offset = Math.max(0, typeof args.offset === "number" ? args.offset : 0);
        const page = rows.slice(offset, offset + limit);
        const more = offset + page.length < rows.length;
        return {
          text:
            `${rows.length} closed trade(s) match; showing ${page.length ? `${offset + 1}-${offset + page.length}` : "none"}, newest first.` +
            (more ? ` Call again with offset ${offset + page.length} for the next page.` : "") +
            (syncError ? ` The last sync from the broker failed (${syncError}); these are the records from before it.` : ""),
          data: {
            account: accountLabel(pick.account!),
            synced_at: syncedAt,
            sync_error: syncError,
            summary: summarizeTrades(rows),
            offset, returned: page.length, more,
            trades: page.map(shapeTrade)
          }
        };
      }
    },

    {
      name: "find_trades",
      title: "Find trades matching your filters",
      description:
        "Runs DeltaMint's Strategy Scanner on the user's account: sweeps the given tickers across the expiry, delta and width ranges given, and returns the setups that pass, ranked by return on risk -- the same scan and ranking as the Scanner screen. " +
        "Strategies: put_spread and call_spread (credit spreads), iron_condor, cash_secured_put, and covered_call (written only on shares or long calls the account already holds; tickers are taken from the account). " +
        "Unset filters use the Scanner's defaults: 0-5 days to expiry, short delta 0.12-0.22, $1-$3 wide, at least $0.20 credit. Each result carries live bid/ask, its price time, and any earnings date before expiry. " +
        "These are matches to the user's filters, not recommendations: present them that way, never as the best trade. Prices are a snapshot; DeltaMint re-checks them before any order is sent.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: ACCOUNT_ID,
          strategy: { type: "string", enum: Object.keys(STRATEGIES), description: "Which structure to look for." },
          tickers: {
            type: "array", items: { type: "string" }, maxItems: MAX_TICKERS,
            description: `Up to ${MAX_TICKERS} underlying symbols, e.g. ["SPY","QQQ"]. Not used for covered_call.`
          },
          min_days: { type: "integer", description: "Fewest calendar days to expiry. Default 0." },
          max_days: { type: "integer", description: "Most calendar days to expiry. Default 5." },
          min_delta: { type: "number", description: "Smallest short-leg delta, as a positive number (0.12 = 12 delta). Default 0.12." },
          max_delta: { type: "number", description: "Largest short-leg delta. Default 0.22." },
          min_width: { type: "number", description: "Narrowest spread, in dollars between strikes. Spreads and condors only. Default 1." },
          max_width: { type: "number", description: "Widest spread, in dollars. Default 3." },
          min_credit: { type: "number", description: "Smallest credit per share, in dollars (0.20 = $20 a contract). Default 0.20." },
          max_loss: { type: "number", description: "Largest loss per contract, in dollars (for spreads); largest collateral per contract for cash-secured puts and covered calls." },
          min_return_on_risk_pct: { type: "number", description: "Drop setups returning less than this percent of the money at risk." },
          limit: { type: "integer", description: "How many matches to return, 1-25. Default 10." }
        },
        required: ["strategy"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const strategy = String(args.strategy);
        const pick = await pickAccount(deps, args.account_id);
        if ("error" in pick) return { text: pick.error as string, isError: true };

        const covered = strategy === "covered_call";
        const tickers = covered
          ? ["HELD"]
          : [...new Set(((args.tickers as string[]) || []).map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
        if (!covered && tickers.length === 0) {
          return { text: "Give at least one ticker to scan, e.g. tickers: [\"SPY\"].", isError: true };
        }
        if (tickers.length > MAX_TICKERS) {
          return { text: `At most ${MAX_TICKERS} tickers per call; split the list and call again.`, isError: true };
        }
        const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
        const D = SCANNER_DEFAULTS;
        const filters = {
          dteMin: num(args.min_days, D.dteMin),
          dteMax: num(args.max_days, D.dteMax),
          deltaMin: num(args.min_delta, D.deltaMin),
          deltaMax: num(args.max_delta, D.deltaMax),
          widthMin: num(args.min_width, D.widthMin),
          widthMax: num(args.max_width, D.widthMax),
          minCredit: num(args.min_credit, D.minCredit),
          maxCredit: 1000,
          maxRisk: typeof args.max_loss === "number" ? args.max_loss : null,
          putRatio: 1,
          callRatio: 1
        };
        if (filters.dteMin < 0 || filters.dteMax < filters.dteMin) {
          return { text: "max_days must be at least min_days, and neither below 0.", isError: true };
        }
        if (filters.deltaMin <= 0 || filters.deltaMax >= 1 || filters.deltaMax < filters.deltaMin) {
          return { text: "Deltas are between 0 and 1, with max_delta at least min_delta (e.g. 0.12 to 0.22).", isError: true };
        }

        const r = await deps.scan({ accountId: pick.account!.id, tickers, strategy, ...filters });
        if (r.status !== 200) return { text: r.body?.error || `The scan failed (${r.status}).`, isError: true };

        const now = deps.now();
        const floor = typeof args.min_return_on_risk_pct === "number" ? args.min_return_on_risk_pct : null;
        const limit = Math.max(1, Math.min(25, num(args.limit, 10)));
        const all = (r.body?.candidates || []).map((c: any, i: number) => shapeCandidate(c, i, now));
        const kept = (floor === null ? all : all.filter((c: any) => (c.return_on_risk_pct ?? -Infinity) >= floor))
          .slice(0, limit)
          .map((c: any, i: number) => ({ ...c, rank: i + 1 }));
        const skipped = (r.body?.skipped || []).slice(0, 10).map((s: any) => ({ ticker: s.ticker, reason: s.reason }));

        const head = kept.length
          ? `${kept.length} setup(s) matching the filters, ranked by return on risk (not a recommendation).`
          : r.body?.reason || "No setup passed the filters." + (skipped.length ? " The skipped list says why for each ticker." : "");
        return {
          text: head,
          data: {
            account: accountLabel(pick.account!),
            as_of: now.toISOString(),
            strategy: STRATEGIES[strategy as keyof typeof STRATEGIES] || strategy,
            filters_used: {
              days: [filters.dteMin, filters.dteMax],
              short_delta: [filters.deltaMin, filters.deltaMax],
              ...(strategy.endsWith("spread") || strategy === "iron_condor" ? { width: [filters.widthMin, filters.widthMax] } : {}),
              min_credit_per_share: filters.minCredit,
              max_loss: filters.maxRisk,
              min_return_on_risk_pct: floor
            },
            ranked_by: "return on risk",
            matches: kept,
            skipped,
            note: "Matches to the filters given, not advice. Prices are a snapshot; DeltaMint re-checks them when an order is placed in the app."
          }
        };
      }
    },

    {
      name: "get_option_chain",
      title: "Get an option chain",
      description:
        "Reads the option chain for one underlying and one expiry: calls and puts by strike around the current price, with bid, ask, last, delta, implied volatility, open interest and volume, plus the listed expiries and what the user's account holds of the underlying (shares, shares free to cover a call, cost basis).",
      inputSchema: {
        type: "object",
        properties: {
          account_id: ACCOUNT_ID,
          ticker: { type: "string", description: "Underlying symbol, e.g. \"AAPL\"." },
          expiry: { type: "string", description: "Expiry date YYYY-MM-DD. Default: the nearest listed expiry." },
          strikes_each_side: { type: "integer", description: "Strikes to show above and below the current price, 1-30. Default 8." }
        },
        required: ["ticker"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const pick = await pickAccount(deps, args.account_id);
        if ("error" in pick) return { text: pick.error as string, isError: true };
        const r = await deps.chain({ accountId: pick.account!.id, ticker: args.ticker, expiry: args.expiry || undefined });
        if (r.status !== 200) return { text: r.body?.error || `The chain could not be read (${r.status}).`, isError: true };
        const each = Math.max(1, Math.min(30, typeof args.strikes_each_side === "number" ? args.strikes_each_side : 8));
        const shaped = shapeChain(r.body, each);
        const asked = typeof args.expiry === "string" && args.expiry && args.expiry !== shaped.expiry;
        return {
          text:
            `${shaped.ticker} ${shaped.expiry}: ${shaped.strikes_shown} of ${shaped.strikes_listed} strikes around ` +
            `${shaped.underlying_price ?? "an unknown price"}.` +
            (asked ? ` ${args.expiry} is not a listed expiry, so the nearest listed one is shown.` : ""),
          data: { account: accountLabel(pick.account!), ...shaped }
        };
      }
    },
    ...(terminal ? terminalTools() : [])
  ];
}

// ---------- the trading terminal's reads ----------
//
// 7 Nov, the owner: "make sure that the connector has everything on deltamint,
// including the gamma and terminal, everything, and the screener". What the
// terminal shows, read through the terminal itself (functions/terminal, which
// answers a connector token for its read actions only), so Claude and the
// screen read the same figures the same way. Never an order: the terminal
// refuses every action that is not a read from a connector token.

const TICKER = /^[A-Z][A-Z0-9.]{0,5}$/;
const COIN = /^[A-Z0-9]{2,10}\/[A-Z]{3,4}$/;
const tickerOf = (v: unknown) => String(v || "").toUpperCase().trim();
const pctOf = (v: number | null, base: number | null) => (v === null || !base ? null : r2(((v - base) / base) * 100));
const iso = (ms: number) => new Date(ms).toISOString();

// The terminal reads market data through one of the user's own Alpaca
// accounts: the one named, else the first connected.
async function terminalAccount(deps: ConnectorDeps, accountId: unknown) {
  if (!deps.terminal) return { error: "The trading terminal's data is not available to this sign-in." };
  const accounts = await deps.listAccounts();
  const direct = accounts.filter((a) => !a.provider || a.provider === "alpaca");
  if (accountId) {
    const hit = direct.find((a) => a.id === accountId);
    if (hit) return { account: hit };
    return {
      error: accounts.some((a) => a.id === accountId)
        ? "That account is read through SnapTrade, which carries no market data; the terminal reads through a directly connected Alpaca account."
        : `No account ${String(accountId)} for this user. Call list_accounts for the ids.`
    };
  }
  if (!direct.length) return { error: "The terminal reads market data through a directly connected Alpaca account, and none is connected." };
  return { account: direct[0] };
}

async function askTerminal(deps: ConnectorDeps, body: Record<string, unknown>) {
  const r = await deps.terminal!(body);
  if (r.status >= 400 || r.body?.error) return { error: String(r.body?.error || `The terminal answered ${r.status}.`) };
  return { body: r.body };
}

const SCREEN_SORTS = {
  change_pct: "change since the previous close",
  gap_pct: "gap at the open",
  volume: "volume",
  dollar_volume: "dollar volume",
  volume_vs_yesterday: "volume against the previous day's"
} as const;

function terminalTools(): Tool<ConnectorDeps>[] {
  return [
    {
      name: "get_gamma_exposure",
      title: "Get gamma exposure (GEX)",
      description:
        "Estimates options dealers' gamma exposure for a stock or fund, as DeltaMint's Gamma page shows it: the dollars of stock dealers would trade per 1% move, from every listed contract within 90 days and 20% of the price. " +
        "Returns net gamma and its regime (positive tends to damp moves, negative to add to them), the zero-gamma flip, the call wall and put wall, the largest strikes, the split by expiry, the strikes within 5% of the price, and a plain read-out. " +
        "An estimate that assumes dealers hold the other side of customers' trades (long calls, short puts); open interest is as of the previous close. Present it as context, not as advice.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "A stock or fund, e.g. \"SPY\", \"QQQ\", \"TSLA\"." },
          expiries: { type: "string", enum: ["nearest", "week", "month", "all"], description: "Which expiries count: the nearest only, within 7 days, within 30 days (default), or all within 90 days." },
          expiry: { type: "string", description: "One expiry alone, YYYY-MM-DD, instead of a window." },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        required: ["symbol"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const symbol = tickerOf(args.symbol);
        if (!TICKER.test(symbol)) return { text: "Gamma exposure is for a stock or fund symbol, e.g. SPY.", isError: true };
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const got = await askTerminal(deps, { action: "gex", accountId: acct.account!.id, symbol, days: 90 });
        if ("error" in got) return { text: got.error as string, isError: true };
        const chain = got.body;
        const prepared = prepare(chain, deps.now().getTime());
        const win = typeof args.expiries === "string" ? args.expiries : "month";
        let one: number | null = null;
        if (args.expiry !== undefined) {
          one = prepared.expiries.findIndex((e: any) => e.expiry === args.expiry && e.open);
          if (one < 0) {
            return { text: `No open ${symbol} expiry ${String(args.expiry)} within 90 days. Expiries: ${prepared.expiries.filter((e: any) => e.open).map((e: any) => e.expiry).join(", ")}.`, isError: true };
          }
        }
        const days = win === "nearest" ? 0 : win === "week" ? 7 : win === "all" ? null : 30;
        const contracts = pickExpiries(prepared, one !== null ? { expiry: one } : { days });
        if (!contracts.length) return { text: `No ${symbol} contracts with open interest in that window.`, isError: true };
        const spot = Number(chain.spot);
        const g = byStrike(contracts, spot, "gex");
        const w = walls(g.rows);
        const flip = flipOf(profile(contracts, spot), spot);
        const expiries = byExpiry(prepared, pickExpiries(prepared), spot);
        const nearest = expiries[0] || null;
        const net = g.totals.netGex;
        const counted = one !== null ? `the ${args.expiry} expiry` : win === "nearest" ? "the nearest expiry" : win === "week" ? "expiries within 7 days" : win === "all" ? "all expiries within 90 days" : "expiries within 30 days";
        const lines = readout({ symbol, spot, netGex: net, flip, wall: w, nearest, oiDate: chain.oiDate });
        const round = (v: number) => Math.round(v);
        return {
          text:
            `${symbol} at ${r2(spot)} (read ${chain.at}), ${counted}: net gamma ${money(net)} per 1% move, ${net >= 0 ? "positive" : "negative"}; ` +
            `zero-gamma flip ${flip === null ? "none within 12%" : `${r2(flip)} (${pctOf(flip, spot)}%)`}; call wall ${w.call ?? "none"}, put wall ${w.put ?? "none"}. ` +
            `An estimate of dealer positioning; open interest as of ${chain.oiDate || "the last close"}.`,
          data: {
            symbol, price: r2(spot), read_at: chain.at, open_interest_as_of: chain.oiDate || null, expiries_counted: counted, contracts_counted: contracts.length,
            net_gamma_per_1pct_move: round(net), regime: net >= 0 ? "positive" : "negative",
            zero_gamma_flip: flip === null ? null : r2(flip), flip_distance_pct: pctOf(flip, spot),
            call_wall: w.call, call_wall_distance_pct: pctOf(w.call, spot), put_wall: w.put, put_wall_distance_pct: pctOf(w.put, spot),
            largest_strikes: w.top.map((t: any) => ({ strike: t.strike, net_gamma: round(t.net), distance_pct: pctOf(t.strike, spot) })),
            by_expiry: expiries.slice(0, 12).map((e: any) => ({ expiry: e.expiry, days: e.days, call_gamma: round(e.call), put_gamma: round(e.put), net_gamma: round(e.net), share_of_gamma_pct: r2(e.share * 100) })),
            strikes_within_5pct: g.rows.filter((r: any) => Math.abs(r.strike - spot) / spot <= 0.05).map((r: any) => ({
              strike: r.strike, call_gamma: round(r.callGex), put_gamma: round(r.putGex), net_gamma: round(r.callGex + r.putGex),
              call_open_interest: r.callOi, put_open_interest: r.putOi, call_volume_today: r.callVol, put_volume_today: r.putVol
            })),
            read_out: lines.map((l: any) => l.text),
            method: "Per contract: Black-Scholes gamma from its own implied volatility x open interest x 100 x price^2 x 1%, calls plus and puts minus; the flip is where the total crosses zero as the price is moved. Strikes within 20% of the price, expiries within 90 days."
          }
        };
      }
    },

    {
      name: "screen_stocks",
      title: "Screen stocks",
      description:
        "Runs DeltaMint's stock screener over every listed US share: the day's price, change, gap at the open, volume and dollar volume, against the previous day, with whether it has options, can be sold short, is a fund, and its next earnings date. " +
        "Returns the shares matching the user's filters, sorted by the field asked. A filter left out does not apply. Present the results as matches to the user's filters, not as picks.",
      inputSchema: {
        type: "object",
        properties: {
          min_price: { type: "number" }, max_price: { type: "number" },
          min_change_pct: { type: "number", description: "Change since the previous close, percent; negative for losers." },
          max_change_pct: { type: "number" },
          min_gap_pct: { type: "number", description: "Today's open against the previous close, percent." },
          max_gap_pct: { type: "number" },
          min_volume: { type: "number", description: "Shares traded today." },
          min_dollar_volume: { type: "number", description: "Price x shares traded today." },
          min_volume_vs_yesterday: { type: "number", description: "Today's volume over the previous day's, e.g. 2 for twice." },
          optionable: { type: "boolean", description: "Only shares with listed options." },
          shortable: { type: "boolean", description: "Only shares Alpaca can lend for a short sale." },
          funds: { type: "string", enum: ["include", "exclude", "only"], description: "Funds (ETFs and the like): include (default), exclude, or only." },
          sort_by: { type: "string", enum: Object.keys(SCREEN_SORTS), description: "Default change_pct." },
          ascending: { type: "boolean", description: "Smallest first (e.g. the biggest losers by change_pct). Default false." },
          limit: { type: "integer", description: "Shares to return, 1-100. Default 25." },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const PARTS = 4;
        const parts = await Promise.all(Array.from({ length: PARTS }, (_, part) => askTerminal(deps, { action: "screen", accountId: acct.account!.id, part, parts: PARTS })));
        const ok = parts.filter((p: any) => !p.error).map((p: any) => p.body);
        if (!ok.length) return { text: `The screener could not be read: ${(parts[0] as any).error}`, isError: true };
        const cols: string[] = ok[0].columns;
        const at = (row: any[], c: string) => row[cols.indexOf(c)];
        const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const all = ok.flatMap((b: any) => b.rows).map((row: any[]) => {
          const price = n(at(row, "price"));
          const prev = n(at(row, "prevClose"));
          const open = n(at(row, "open"));
          const volume = n(at(row, "volume"));
          const prevVolume = n(at(row, "prevVolume"));
          return {
            symbol: at(row, "symbol"), name: at(row, "name"), exchange: at(row, "exchange"), trading_day: at(row, "day"),
            price, price_at: at(row, "priceAt"), change_pct: pctOf(price, prev), gap_pct: pctOf(open, prev),
            open, high: n(at(row, "high")), low: n(at(row, "low")), prev_close: prev, vwap: n(at(row, "vwap")),
            volume, prev_volume: prevVolume, volume_vs_yesterday: volume !== null && prevVolume ? r2(volume / prevVolume) : null,
            dollar_volume: price !== null && volume !== null ? Math.round(price * volume) : null,
            options: !!at(row, "options"), shortable: !!at(row, "shortable"), easy_to_borrow: !!at(row, "easyToBorrow"), fund: !!at(row, "fund"),
            earnings_date: at(row, "earnDate") || null, earnings_session: at(row, "earnSession") || null
          };
        });
        const min = (v: number | null, m: unknown) => typeof m !== "number" || (v !== null && v >= m);
        const max = (v: number | null, m: unknown) => typeof m !== "number" || (v !== null && v <= m);
        const matched = all.filter((r: any) =>
          min(r.price, args.min_price) && max(r.price, args.max_price) &&
          min(r.change_pct, args.min_change_pct) && max(r.change_pct, args.max_change_pct) &&
          min(r.gap_pct, args.min_gap_pct) && max(r.gap_pct, args.max_gap_pct) &&
          min(r.volume, args.min_volume) && min(r.dollar_volume, args.min_dollar_volume) &&
          min(r.volume_vs_yesterday, args.min_volume_vs_yesterday) &&
          (args.optionable !== true || r.options) && (args.shortable !== true || r.shortable) &&
          (args.funds === "exclude" ? !r.fund : args.funds === "only" ? r.fund : true));
        const sortBy = typeof args.sort_by === "string" && args.sort_by in SCREEN_SORTS ? args.sort_by as keyof typeof SCREEN_SORTS : "change_pct";
        const dir = args.ascending === true ? 1 : -1;
        matched.sort((a: any, b: any) => {
          const x = a[sortBy];
          const y = b[sortBy];
          if (x === null && y === null) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (x - y) * dir;
        });
        const limit = Math.max(1, Math.min(100, typeof args.limit === "number" ? Math.floor(args.limit) : 25));
        const listed = ok.reduce((t: number, b: any) => t + (b.listed || 0), 0);
        return {
          text:
            `${matched.length} of ${all.length} priced shares match (${listed} listed); showing ${Math.min(limit, matched.length)}, ` +
            `${args.ascending === true ? "smallest" : "largest"} ${SCREEN_SORTS[sortBy]} first. Read ${ok[0].at}; the day's candle and volume from ${ok[0].dayFeed === "delayed_sip" ? "every exchange, fifteen minutes late" : "IEX"}.` +
            (ok.length < PARTS ? ` ${PARTS - ok.length} of ${PARTS} parts of the market could not be read; this is the rest.` : ""),
          data: { read_at: ok[0].at, day_feed: ok[0].dayFeed, matched: matched.length, priced: all.length, listed, sort_by: sortBy, shares: matched.slice(0, limit) }
        };
      }
    },

    {
      name: "get_quotes",
      title: "Get quotes",
      description: "Reads the latest price, change since the previous close, bid and ask, and the day's open, high, low and volume for up to 25 shares, funds or coins (\"BTC/USD\"), as the terminal shows them, each with the time of its last trade.",
      inputSchema: {
        type: "object",
        properties: {
          symbols: { type: "array", items: { type: "string" }, description: "Up to 25 symbols." },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        required: ["symbols"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const symbols = [...new Set((Array.isArray(args.symbols) ? args.symbols : []).map(tickerOf))].filter((s) => TICKER.test(s) || COIN.test(s)).slice(0, 25);
        if (!symbols.length) return { text: "Give one or more symbols, e.g. [\"SPY\", \"BTC/USD\"].", isError: true };
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const got = await askTerminal(deps, { action: "snapshot", accountId: acct.account!.id, symbols });
        if ("error" in got) return { text: got.error as string, isError: true };
        const q = got.body.quotes || {};
        const quotes = symbols.filter((s) => q[s]).map((s) => ({
          symbol: s, last: r4(q[s].last), change: r4(q[s].change), change_pct: q[s].changePct === null || q[s].changePct === undefined ? null : r2(q[s].changePct * 100),
          bid: r4(q[s].bid), ask: r4(q[s].ask), open: r4(q[s].open), high: r4(q[s].high), low: r4(q[s].low), volume: q[s].volume ?? null,
          prev_close: r4(q[s].prevClose), last_trade_at: q[s].at || null
        }));
        const missing = symbols.filter((s) => !q[s]);
        return {
          text: `${quotes.length} quote(s)${missing.length ? `; none for ${missing.join(", ")}` : ""}. Shares from ${got.body.feed === "iex" ? "IEX in real time (IEX trades only)" : String(got.body.feed || "the account's feed")}.`,
          data: { feed: got.body.feed || null, quotes, missing }
        };
      }
    },

    {
      name: "get_price_history",
      title: "Get price history",
      description: "Reads candles (open, high, low, close, volume) for a share, fund or coin at an interval from one minute to one month, as the terminal's chart draws them; the most recent ones, with the change and range over them.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          interval: { type: "string", enum: ["1Min", "5Min", "15Min", "30Min", "1Hour", "4Hour", "1Day", "1Week", "1Month"], description: "Default 1Day." },
          bars: { type: "integer", description: "How many of the most recent candles, 1-500. Default 60." },
          session: { type: "string", enum: ["regular", "all"], description: "Shares intraday: regular hours only (default) or including pre-market and after hours." },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        required: ["symbol"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const symbol = tickerOf(args.symbol);
        if (!TICKER.test(symbol) && !COIN.test(symbol)) return { text: "Give a symbol, e.g. SPY or BTC/USD.", isError: true };
        const interval = typeof args.interval === "string" ? args.interval : "1Day";
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const got = await askTerminal(deps, { action: "bars", accountId: acct.account!.id, symbol, interval, session: args.session === "all" ? "" : "regular" });
        if ("error" in got) return { text: got.error as string, isError: true };
        const want = Math.max(1, Math.min(500, typeof args.bars === "number" ? Math.floor(args.bars) : 60));
        const list = (got.body.bars || []).slice(-want).map((b: any) => ({ time: iso(b.time * 1000), open: r4(b.open), high: r4(b.high), low: r4(b.low), close: r4(b.close), volume: b.volume ?? null }));
        if (!list.length) return { text: `No ${interval} candles for ${symbol}.`, isError: true };
        const first = list[0];
        const last = list[list.length - 1];
        const high = Math.max(...list.map((b: any) => b.high ?? -Infinity));
        const low = Math.min(...list.map((b: any) => b.low ?? Infinity));
        return {
          text: `${symbol}, ${list.length} ${interval} candle(s) from ${first.time} to ${last.time}: ${first.open} to ${last.close} (${pctOf(last.close, first.open)}%), high ${high}, low ${low}.`,
          data: { symbol, interval, feed: got.body.feed || null, change_pct: pctOf(last.close, first.open), high, low, candles: list }
        };
      }
    },

    {
      name: "get_news",
      title: "Get news",
      description: "Reads recent news headlines for a share, fund or coin, newest first, with source, time, link and summary, as the terminal's News tab shows them.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          days: { type: "integer", description: "How far back, 1-30 days. Default 3." },
          limit: { type: "integer", description: "Headlines, 1-50. Default 15." },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        required: ["symbol"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const symbol = tickerOf(args.symbol);
        if (!TICKER.test(symbol) && !COIN.test(symbol)) return { text: "Give a symbol, e.g. NVDA.", isError: true };
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const days = Math.max(1, Math.min(30, typeof args.days === "number" ? Math.floor(args.days) : 3));
        const limit = Math.max(1, Math.min(50, typeof args.limit === "number" ? Math.floor(args.limit) : 15));
        const now = deps.now().getTime();
        const got = await askTerminal(deps, { action: "news", accountId: acct.account!.id, symbols: [symbol], start: iso(now - days * 86400000), end: iso(now), sort: "desc", max: limit });
        if ("error" in got) return { text: got.error as string, isError: true };
        const items = (got.body.news || []).slice(0, limit).map((x: any) => ({
          headline: x.headline, source: x.source, at: x.at, url: x.url || null,
          summary: String(x.summary || "").slice(0, 400) || null, symbols: x.symbols || []
        }));
        return { text: `${items.length} headline(s) for ${symbol} in the last ${days} day(s), newest first.`, data: { symbol, days, news: items } };
      }
    },

    {
      name: "get_earnings",
      title: "Get earnings dates",
      description: "Reads a company's next earnings date (before the open, after the close, or during the day, when known) and its recent reports with earnings per share and revenue against estimates, as the terminal's chart marks them.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          account_id: { type: "string", description: "The Alpaca account to read through; the first connected when left out." }
        },
        required: ["symbol"],
        additionalProperties: false
      },
      run: async (args, deps): Promise<ToolResult> => {
        const symbol = tickerOf(args.symbol);
        if (!TICKER.test(symbol)) return { text: "Give a company's symbol, e.g. AAPL.", isError: true };
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const got = await askTerminal(deps, { action: "events", accountId: acct.account!.id, symbol });
        if ("error" in got) return { text: got.error as string, isError: true };
        const SESSION: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours" };
        const shape = (e: any) => ({
          date: e.date, when: e.session ? SESSION[e.session] || e.session : null, period: e.period || null,
          eps_actual: e.epsActual ?? null, eps_estimate: e.epsEstimate ?? null, revenue_actual: e.revenueActual ?? null, revenue_estimate: e.revenueEstimate ?? null
        });
        const list = got.body.earnings || [];
        const next = list.find((e: any) => e.upcoming) || null;
        const past = list.filter((e: any) => !e.upcoming).slice(-8).reverse();
        return {
          text: next ? `${symbol} next reports on ${next.date}${next.session ? `, ${SESSION[next.session] || next.session}` : ""}; ${past.length} recent report(s).` : `No upcoming ${symbol} report on the calendar; ${past.length} recent report(s).`,
          data: { symbol, next: next ? shape(next) : null, recent: past.map(shape) }
        };
      }
    },

    {
      name: "get_orders",
      title: "Get orders",
      description: "Reads an Alpaca account's working orders and the last week's finished ones (filled, cancelled, rejected), with the account's equity, cash, buying power and day trades, as the terminal's Orders and Account tabs show them. Accounts linked through SnapTrade (Robinhood and others) are not read here; get_positions gives their open-order count.",
      inputSchema: { type: "object", properties: { account_id: ACCOUNT_ID }, additionalProperties: false },
      run: async (args, deps): Promise<ToolResult> => {
        const acct = await terminalAccount(deps, args.account_id);
        if ("error" in acct) return { text: acct.error as string, isError: true };
        const got = await askTerminal(deps, { action: "account", accountId: acct.account!.id });
        if ("error" in got) return { text: got.error as string, isError: true };
        const v = got.body;
        const working = (v.orders || []).map((o: any) => ({
          symbol: o.symbol, side: o.side, quantity: o.qty, notional: o.notional, filled: o.filled, type: o.type, limit: o.limit, stop: o.stop,
          time_in_force: o.tif, status: o.status, order_class: o.orderClass, submitted_at: o.submittedAt,
          legs: (o.legs || []).map((l: any) => ({ side: l.side, type: l.type, limit: l.limit, stop: l.stop, status: l.status }))
        }));
        const recent = (v.recent || []).map((o: any) => ({
          symbol: o.symbol, side: o.side, quantity: o.qty, filled: o.filled, average_price: o.avgPrice, type: o.type, limit: o.limit, stop: o.stop,
          status: o.status, submitted_at: o.submittedAt, filled_at: o.filledAt
        }));
        const s = v.summary || {};
        return {
          text: `${acct.account!.name}: ${working.length} working order(s), ${recent.length} finished in the last week.`,
          data: {
            account: accountLabel(acct.account!),
            equity: r2(s.equity), day_change: r2(s.dayChange), cash: r2(s.cash), buying_power: r2(s.buyingPower), options_buying_power: r2(s.optionsBuyingPower),
            day_trades: s.dayTradeCount ?? null, pattern_day_trader: !!s.patternDayTrader,
            working, recent
          }
        };
      }
    }
  ];
}

// What Claude is told about this server when it connects.
export const CONNECTOR_INSTRUCTIONS = [
  "DeltaMint reads the user's own brokerage account and option market data. Every tool is read-only: nothing here places, changes or cancels an order.",
  "find_trades returns setups that match the filters the user gives, ranked by return on risk, exactly as DeltaMint's Strategy Scanner ranks them. Present them as matches to the user's criteria. Do not describe any of them as the best trade, a recommendation or a signal, and do not tell the user what to buy or sell.",
  "Quote prices with the time they were read. A scan is a snapshot: DeltaMint re-checks price and strikes when the user places an order in the app.",
  "A figure DeltaMint returns as null could not be computed reliably. Say that, and do not estimate it.",
  "Accounts linked through SnapTrade (Robinhood and other brokers) are SnapTrade's copy of the account, which SnapTrade refreshes from the broker about once a day: say when, from broker_data_as_of, and that trades made since are not in it yet.",
  "get_gamma_exposure is an estimate of dealer positioning, and screen_stocks returns shares matching the user's filters: present both as context and matches, not as what to trade.",
  "To act on a setup, the user opens DeltaMint. DeltaMint is software, not a broker-dealer or investment adviser."
].join("\n");
