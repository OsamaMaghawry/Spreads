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

export type AccountRow = { id: string; name: string; is_paper: boolean };

export type ConnectorDeps = {
  listAccounts: () => Promise<AccountRow[]>;
  syncAccounts: () => Promise<{ accounts: any[]; syncedAt: string }>;
  scan: (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;
  chain: (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;
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

// ---------- the tools ----------

const ACCOUNT_ID = {
  type: "string",
  description: "The account to use, from list_accounts. May be left out when the user has only one account."
};

export function connectorTools(): Tool<ConnectorDeps>[] {
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
        const { accounts, syncedAt } = await deps.syncAccounts();
        const acct = accounts.find((a: any) => a.id === pick.account!.id);
        if (!acct) return { text: "That account could not be read just now. Try again shortly.", isError: true };
        const snap = shapeAccountSnapshot(acct);
        const n = snap.positions.length;
        return {
          text: `${pick.account!.name}: ${n} open position(s), read from the broker at ${syncedAt}.`,
          data: { account: accountLabel(pick.account!), as_of: syncedAt, ...snap },
          isError: "error" in snap
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
    }
  ];
}

// What Claude is told about this server when it connects.
export const CONNECTOR_INSTRUCTIONS = [
  "DeltaMint reads the user's own brokerage account and option market data. Every tool is read-only: nothing here places, changes or cancels an order.",
  "find_trades returns setups that match the filters the user gives, ranked by return on risk, exactly as DeltaMint's Strategy Scanner ranks them. Present them as matches to the user's criteria. Do not describe any of them as the best trade, a recommendation or a signal, and do not tell the user what to buy or sell.",
  "Quote prices with the time they were read. A scan is a snapshot: DeltaMint re-checks price and strikes when the user places an order in the app.",
  "A figure DeltaMint returns as null could not be computed reliably. Say that, and do not estimate it.",
  "To act on a setup, the user opens DeltaMint. DeltaMint is software, not a broker-dealer or investment adviser."
].join("\n");
