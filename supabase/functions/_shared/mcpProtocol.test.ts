import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMessage, negotiateVersion, checkArgs, connectorAddresses, callSucceeded, recordedArgs, SUPPORTED_PROTOCOL_VERSIONS } from "./mcpProtocol.ts";
import {
  connectorTools, CONNECTOR_INSTRUCTIONS, SCANNER_DEFAULTS, MAX_TICKERS, daysTo, shapeChain, type ConnectorDeps
} from "./connectorTools.ts";

// The Claude connector's protocol and tools, without a network, a broker or a
// database: the I/O is injected, so what Claude would receive is asserted here.

const server = { name: "deltamint", title: "DeltaMint", version: "test" };
const NOW = new Date("2026-10-08T15:00:00Z");

function fakeDeps(over: Partial<ConnectorDeps> = {}): ConnectorDeps & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    listAccounts: async () => [{ id: "acc-1", name: "Main", is_paper: true }],
    syncAccounts: async () => ({ accounts: [], syncedAt: NOW.toISOString() }),
    scan: async (body) => { calls.push(body); return { status: 200, body: { ok: true, candidates: [], skipped: [] } }; },
    chain: async (body) => { calls.push(body); return { status: 200, body: { ladder: [], expiries: [] } }; },
    tradeHistory: async () => ({ trades: [], syncedAt: NOW.toISOString(), syncError: null }),
    now: () => NOW,
    ...over
  } as any;
}

const rpc = (method: string, params?: any, id: any = 1) => ({ jsonrpc: "2.0", id, method, params });
const call = async (deps: ConnectorDeps, name: string, args: any = {}) => {
  const res: any = await handleMessage(rpc("tools/call", { name, arguments: args }), {
    tools: connectorTools(), ctx: deps, server, instructions: CONNECTOR_INSTRUCTIONS
  });
  const text = res.result.content[0].text as string;
  return { res, text, data: res.result.structuredContent, isError: !!res.result.isError };
};

// ---------- protocol ----------

test("initialize: echoes a supported version, falls back to the newest otherwise", async () => {
  const opts = { tools: connectorTools(), ctx: fakeDeps(), server, instructions: CONNECTOR_INSTRUCTIONS };
  const a: any = await handleMessage(rpc("initialize", { protocolVersion: "2025-06-18" }), opts);
  assert.equal(a.result.protocolVersion, "2025-06-18");
  assert.deepEqual(a.result.capabilities, { tools: { listChanged: false } });
  assert.equal(a.result.serverInfo.name, "deltamint");
  assert.match(a.result.instructions, /read-only/);
  assert.equal(negotiateVersion("1999-01-01"), SUPPORTED_PROTOCOL_VERSIONS[0]);
});

test("notifications get no response; bad messages and methods get JSON-RPC errors", async () => {
  const opts = { tools: connectorTools(), ctx: fakeDeps(), server, instructions: "" };
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" } as any, opts), null);
  const bad: any = await handleMessage({ id: 3, method: "ping" } as any, opts);
  assert.equal(bad.error.code, -32600);
  const none: any = await handleMessage(rpc("resources/list"), opts);
  assert.equal(none.error.code, -32601);
  const tool: any = await handleMessage(rpc("tools/call", { name: "place_order" }), opts);
  assert.equal(tool.error.code, -32602);
  const ping: any = await handleMessage(rpc("ping", undefined, 9), opts);
  assert.deepEqual(ping, { jsonrpc: "2.0", id: 9, result: {} });
});

test("every tool is listed, and every one is marked read-only", async () => {
  const res: any = await handleMessage(rpc("tools/list"), { tools: connectorTools(), ctx: fakeDeps(), server, instructions: "" });
  const names = res.result.tools.map((t: any) => t.name);
  assert.deepEqual(names, [
    "list_accounts", "get_positions", "get_trade_history", "find_trades", "get_option_chain",
    "get_gamma_exposure", "screen_stocks", "get_quotes", "get_price_history", "get_news", "get_earnings", "get_orders"
  ]);
  for (const t of res.result.tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.equal(t.inputSchema.type, "object", t.name);
  }
  // The trading terminal's reads are listed only where the terminal is open to the user (admins).
  const plain: any = await handleMessage(rpc("tools/list"), { tools: connectorTools({ terminal: false }), ctx: fakeDeps(), server, instructions: "" });
  assert.deepEqual(plain.result.tools.map((t: any) => t.name), ["list_accounts", "get_positions", "get_trade_history", "find_trades", "get_option_chain"]);
});

test("argument checks turn a malformed call into a sentence the model can fix", () => {
  const schema = { type: "object", properties: { n: { type: "integer" }, s: { type: "string", enum: ["a", "b"] } }, required: ["s"], additionalProperties: false };
  assert.equal(checkArgs(schema, {}), "s is required.");
  assert.equal(checkArgs(schema, { s: "c" }), "s must be one of: a, b.");
  assert.equal(checkArgs(schema, { s: "a", n: 1.5 }), "n must be a whole number.");
  assert.equal(checkArgs(schema, { s: "a", x: 1 }), "x is not a parameter of this tool.");
  assert.equal(checkArgs(schema, { s: "a", n: 2 }), null);
});

// ---------- NOT ADVICE ----------
//
// DeltaMint gives no investment advice, signals or recommendations. Whatever
// Claude says is Claude's, but what this server tells Claude must not lean the
// other way: any sentence that mentions "best", "recommend" or "signal" has to
// be saying it is NOT one.
test("tool descriptions and server instructions never present a result as advice", () => {
  const texts = [CONNECTOR_INSTRUCTIONS, ...connectorTools().flatMap((t) => [t.title, t.description, JSON.stringify(t.inputSchema)])];
  for (const text of texts) {
    for (const sentence of text.split(/(?<=[.:])\s+/)) {
      if (/\b(best|recommend\w*|signals?|top picks?|should (buy|sell))\b/i.test(sentence)) {
        assert.match(sentence, /\b(not|never|no|do not)\b/i, `advice-like wording: "${sentence}"`);
      }
    }
  }
});

// ---------- tools ----------

test("one account is used without asking; several need account_id", async () => {
  const two = fakeDeps({
    listAccounts: async () => [
      { id: "a", name: "Live", is_paper: false },
      { id: "b", name: "Paper", is_paper: true }
    ]
  });
  const r = await call(two, "get_positions");
  assert.equal(r.isError, true);
  assert.match(r.text, /2 accounts\. Pass account_id/);
  const wrong = await call(two, "find_trades", { strategy: "put_spread", tickers: ["SPY"], account_id: "zzz" });
  assert.match(wrong.text, /No account zzz/);
});

test("find_trades asks the scanner the Scanner screen's own question", async () => {
  const deps = fakeDeps();
  await call(deps, "find_trades", { strategy: "put_spread", tickers: ["spy", " qqq", "SPY"] });
  const body = deps.calls[0];
  assert.deepEqual(body.tickers, ["SPY", "QQQ"]);
  assert.equal(body.accountId, "acc-1");
  for (const [k, v] of Object.entries(SCANNER_DEFAULTS)) assert.equal(body[k], v, k);
  assert.equal(body.maxRisk, null);
});

test("covered calls scan the account's own holdings, as the Scanner does", async () => {
  const deps = fakeDeps();
  await call(deps, "find_trades", { strategy: "covered_call", tickers: ["IGNORED"], min_days: 20, max_days: 45 });
  assert.deepEqual(deps.calls[0].tickers, ["HELD"]);
  assert.equal(deps.calls[0].dteMin, 20);
  assert.equal(deps.calls[0].dteMax, 45);
});

test("find_trades refuses what it cannot do in one request", async () => {
  const deps = fakeDeps();
  assert.match((await call(deps, "find_trades", { strategy: "put_spread" })).text, /at least one ticker/);
  const many = Array.from({ length: MAX_TICKERS + 1 }, (_, i) => `T${i}`);
  assert.match((await call(deps, "find_trades", { strategy: "put_spread", tickers: many })).text, /At most 5 tickers/);
  assert.match((await call(deps, "find_trades", { strategy: "put_spread", tickers: ["SPY"], min_delta: 0.3, max_delta: 0.2 })).text, /Deltas/);
  assert.match((await call(deps, "find_trades", { strategy: "strangle", tickers: ["SPY"] })).text, /must be one of/);
  assert.equal(deps.calls.length, 0);
});

const SPREAD = {
  ticker: "SPY", strategy: "put_spread", expiry: "2026-10-16", credit: 0.5, maxRisk: 150, width: 2,
  breakEvenLow: 569.5, breakEvenHigh: null, spot: 600.12, spotSource: "trade", spotAsOf: "2026-10-08T14:59:58Z",
  returnOnRisk: 0.333,
  legs: [
    { role: "short_put", side: "sell", strike: 570, bid: 1.2, ask: 1.25, delta: -0.1834, symbol: "SPY261016P00570000" },
    { role: "long_put", side: "buy", strike: 568, bid: 0.7, ask: 0.72, delta: -0.15, symbol: "SPY261016P00568000" }
  ],
  earnings: null, earningsUnknown: false
};

test("a scan match carries its legs, money per contract, price time and earnings", async () => {
  const deps = fakeDeps({
    scan: async () => ({
      status: 200,
      body: {
        ok: true,
        candidates: [
          SPREAD,
          { ...SPREAD, ticker: "QQQ", credit: 0.2, maxRisk: 180, earnings: { date: "2026-10-14", session: "amc", daysAway: 6 } },
          { ...SPREAD, ticker: "IWM", earningsUnknown: true, coverInUse: "x" }
        ],
        skipped: [{ ticker: "ABC", reason: "No expiry between 0 and 5 days." }]
      }
    })
  });
  const r = await call(deps, "find_trades", { strategy: "put_spread", tickers: ["SPY", "QQQ", "IWM", "ABC"] });
  assert.equal(r.isError, false);
  assert.match(r.text, /ranked by return on risk \(not a recommendation\)/);
  const [a, b, c] = r.data.matches;
  assert.equal(a.rank, 1);
  assert.equal(a.days_to_expiry, 8);
  assert.equal(a.credit_per_contract, 50);
  assert.equal(a.max_loss_per_contract, 150);
  assert.equal(a.return_on_risk_pct, 33.33);
  assert.equal(a.underlying_price_as_of, "2026-10-08T14:59:58Z");
  assert.deepEqual(a.legs[0], { action: "sell", type: "put", strike: 570, symbol: "SPY261016P00570000", bid: 1.2, ask: 1.25, delta: -0.1834 });
  assert.equal(a.earnings_before_expiry, null);
  assert.deepEqual(b.earnings_before_expiry, { date: "2026-10-14", session: "amc", days_away: 6 });
  assert.match(c.earnings_before_expiry, /unknown/);
  assert.equal(c.cover_already_in_use, "x");
  assert.deepEqual(r.data.skipped, [{ ticker: "ABC", reason: "No expiry between 0 and 5 days." }]);
  assert.match(r.data.note, /not advice/);
});

test("a return-on-risk floor drops matches and re-ranks what is left", async () => {
  const deps = fakeDeps({
    scan: async () => ({ status: 200, body: { candidates: [SPREAD, { ...SPREAD, ticker: "QQQ", credit: 0.2, maxRisk: 180 }], skipped: [] } })
  });
  const r = await call(deps, "find_trades", { strategy: "put_spread", tickers: ["SPY", "QQQ"], min_return_on_risk_pct: 20 });
  assert.deepEqual(r.data.matches.map((m: any) => [m.rank, m.ticker]), [[1, "SPY"]]);
});

test("a failed scan or a thrown error reaches the model as a readable error", async () => {
  const refused = fakeDeps({ scan: async () => ({ status: 400, body: { error: "Unsupported strategy" } }) });
  assert.equal((await call(refused, "find_trades", { strategy: "put_spread", tickers: ["SPY"] })).text, "Unsupported strategy");
  const thrown = fakeDeps({ scan: async () => { throw new Error("broker timeout"); } });
  const r = await call(thrown, "find_trades", { strategy: "put_spread", tickers: ["SPY"] });
  assert.equal(r.isError, true);
  assert.match(r.text, /broker timeout/);
});

test("positions are shaped from the Dashboard's own rows, unknowns left null", async () => {
  const row = {
    ticker: "SPY", expiry: "2026-10-16", qty: 2, direction: "credit", totalCredit: 100, maxRisk: null,
    unrealizedPL: 35.5, breakEven: 569.5, breakEvenHigh: null, moneyness: "OTM", stockPrice: 600.1,
    spotTrusted: true, spotSource: "trade",
    legs: [
      { symbol: "SPY261016P00570000", kind: "put", side: "short", qty: 2, strike: 570, expiry: "2026-10-16", entryPrice: 1.2 },
      { symbol: "SPY261016P00568000", kind: "put", side: "long", qty: 2, strike: 568, expiry: "2026-10-16", entryPrice: 0.7 }
    ]
  };
  const deps = fakeDeps({
    syncAccounts: async () => ({
      syncedAt: NOW.toISOString(),
      accounts: [{
        id: "acc-1", name: "Main", type: "Paper", ok: true, equity: 10000, cash: 5000, buyingPower: 8000,
        optionsBuyingPower: 4000, totals: { pl: 35.5, risk: 400 }, riskComplete: false, orders: [{}], spreads: [row]
      }]
    })
  });
  const r = await call(deps, "get_positions");
  assert.equal(r.isError, false);
  const p = r.data.positions[0];
  assert.equal(p.ticker, "SPY");
  assert.equal(p.max_loss, null);
  assert.deepEqual(p.break_even, [569.5]);
  assert.equal(p.legs.length, 2);
  assert.equal(r.data.total_max_loss, null, "an unbounded position withholds the total, never a partial sum");
  assert.equal(r.data.open_orders, 1);
});

test("an account the broker could not read says so instead of showing nothing held", async () => {
  const deps = fakeDeps({
    syncAccounts: async () => ({ syncedAt: NOW.toISOString(), accounts: [{ id: "acc-1", name: "Main", ok: false, error: "401 from broker" }] })
  });
  const r = await call(deps, "get_positions");
  assert.equal(r.isError, true);
  assert.equal(r.data.error, "401 from broker");
});

test("the chain is centred on the money and passes the expiry through", async () => {
  const ladder = Array.from({ length: 21 }, (_, i) => ({
    strike: 90 + i,
    call: { symbol: `C${i}`, bid: 1, ask: 1.1, last: 1.05, delta: 0.5, iv: 0.25, openInterest: 10, volume: 2 },
    put: null
  }));
  const deps = fakeDeps({
    chain: async (body) => { deps.calls.push(body); return { status: 200, body: { ticker: "XYZ", expiry: "2026-10-16", expiries: ["2026-10-16", "2026-10-23"], ladder, atTheMoney: 10, spot: 100.2, spotTrusted: true, shares: 200, sharesFree: 100 } }; }
  });
  const r = await call(deps, "get_option_chain", { ticker: "xyz", expiry: "2026-10-16", strikes_each_side: 2 });
  assert.equal(deps.calls[0].ticker, "xyz");
  assert.equal(deps.calls[0].expiry, "2026-10-16");
  assert.deepEqual(r.data.rows.map((x: any) => x.strike), [98, 99, 100, 101, 102]);
  assert.equal(r.data.rows[0].call.implied_vol_pct, 25);
  assert.equal(r.data.rows[0].put, null);
  assert.deepEqual(r.data.other_expiries, ["2026-10-23"]);
  assert.equal(r.data.shares_free_to_cover_calls, 100);
});

test("chain window clamps at the ends of the ladder", () => {
  const ladder = [{ strike: 1, call: null, put: null }, { strike: 2, call: null, put: null }];
  assert.equal(shapeChain({ ladder, atTheMoney: 0, expiries: [] }, 5).rows.length, 2);
  assert.equal(shapeChain({ ladder: [], atTheMoney: 0 }, 5).rows.length, 0);
});

test("days to expiry are calendar days in UTC", () => {
  assert.equal(daysTo("2026-10-08", NOW), 0);
  assert.equal(daysTo("2026-10-16", NOW), 8);
  assert.equal(daysTo("not a date", NOW), null);
});

// ---------- trade history ----------

const T = (o: any) => ({
  ticker: "SPY", strategy: "spreads", qty: 1, short_strike: 570, long_strike: 568, net_credit: 0.5, close_debit: 0.1,
  realized_pl: 40, premium_pl: 50, early_close_pl: -10, stock_pl: 0, close_reason: "closed",
  provisional: false, integrity_code: null, open_date: "2026-09-01", close_date: "2026-09-05", ...o
});

const HISTORY = [
  T({ close_date: "2026-09-05" }),
  T({ close_date: "2026-09-12", realized_pl: -60, premium_pl: 40, early_close_pl: -100 }),
  T({ close_date: "2026-09-19", ticker: "TSLA", strategy: "cash_secured_put", long_strike: 0, realized_pl: 0, premium_pl: 0, early_close_pl: 0 }),
  // Assigned, shares still held: money counts, the outcome does not yet.
  T({ close_date: "2026-09-26", ticker: "TSLA", strategy: "cash_secured_put", long_strike: 0, provisional: true, realized_pl: 120, premium_pl: 120, early_close_pl: 0 }),
  // Flagged by the integrity checks: in the totals, out of the win rate.
  T({ close_date: "2026-10-01", integrity_code: "impossible_loss", realized_pl: -999 }),
  T({ close_date: "2026-10-02", ticker: "TSLA", strategy: "covered_call", long_strike: 0, realized_pl: 79, premium_pl: 86, early_close_pl: -7 })
];

test("trade history: every closed trade, newest first, totals and win rate as the app counts them", async () => {
  const deps = fakeDeps({ tradeHistory: async () => ({ trades: HISTORY, syncedAt: "2026-10-08T07:00:00Z", syncError: null }) });
  const r = await call(deps, "get_trade_history");
  assert.equal(r.isError, false);
  assert.equal(r.data.synced_at, "2026-10-08T07:00:00Z");
  assert.deepEqual(r.data.trades.map((t: any) => t.close_date), ["2026-10-02", "2026-10-01", "2026-09-26", "2026-09-19", "2026-09-12", "2026-09-05"]);
  const s = r.data.summary;
  assert.equal(s.trades, 6);
  assert.equal(s.realized_pl, 40 - 60 + 0 + 120 - 999 + 79);
  // Counted: the four final, unflagged trades -- 2 wins (40, 79), 1 loss (-60), 1 flat (0).
  assert.deepEqual([s.win_rate.wins, s.win_rate.losses, s.win_rate.flat, s.win_rate.counted, s.win_rate.not_counted], [2, 1, 1, 4, 2]);
  assert.equal(s.win_rate.percent, 50);
  assert.deepEqual(s.by_category.map((c: any) => [c.category, c.trades]), [["Spreads", 3], ["Cash-secured puts", 2], ["Covered calls", 1]]);
  const csp = r.data.trades.find((t: any) => t.close_date === "2026-09-26");
  assert.equal(csp.result_final, false);
  assert.equal(csp.counts_in_win_rate, false);
  assert.equal(csp.long_strike, null, "a single leg has no long strike, not a $0 one");
  assert.equal(r.data.trades.find((t: any) => t.close_date === "2026-10-01").integrity_flag, "impossible_loss");
});

test("trade history: filters and pages, with the summary over every match", async () => {
  const deps = fakeDeps({ tradeHistory: async () => ({ trades: HISTORY, syncedAt: null, syncError: null }) });
  const tsla = await call(deps, "get_trade_history", { ticker: "tsla", limit: 2 });
  assert.equal(tsla.data.summary.trades, 3);
  assert.equal(tsla.data.returned, 2);
  assert.equal(tsla.data.more, true);
  assert.match(tsla.text, /offset 2 for the next page/);
  const next = await call(deps, "get_trade_history", { ticker: "TSLA", limit: 2, offset: 2 });
  assert.deepEqual(next.data.trades.map((t: any) => t.close_date), ["2026-09-19"]);
  assert.equal(next.data.more, false);
  const window = await call(deps, "get_trade_history", { from_date: "2026-09-10", to_date: "2026-09-30", category: "cash_secured_put" });
  assert.deepEqual(window.data.trades.map((t: any) => t.close_date), ["2026-09-26", "2026-09-19"]);
  assert.match((await call(deps, "get_trade_history", { from_date: "Sept 1" })).text, /YYYY-MM-DD/);
});

test("trade history says when the broker sync failed instead of passing old rows off as current", async () => {
  const deps = fakeDeps({ tradeHistory: async () => ({ trades: HISTORY, syncedAt: "2026-10-01T00:00:00Z", syncError: "401 from broker" }) });
  const r = await call(deps, "get_trade_history");
  assert.match(r.text, /last sync from the broker failed \(401 from broker\)/);
  assert.equal(r.data.sync_error, "401 from broker");
});

test("connector address: our site when it is on the list, the function's own otherwise", () => {
  const own = "https://ref.supabase.co/functions/v1/mcp";
  const ownAuth = "https://ref.supabase.co/auth/v1";
  const allowed = ["https://dev-landing.deltamint.app"];
  assert.deepEqual(connectorAddresses("https://dev-landing.deltamint.app", own, ownAuth, allowed), {
    resource: "https://dev-landing.deltamint.app/mcp",
    metadata: "https://dev-landing.deltamint.app/.well-known/oauth-protected-resource/mcp",
    authServer: "https://dev-landing.deltamint.app"
  });
  const fallback = { resource: own, metadata: `${own}/.well-known/oauth-protected-resource`, authServer: ownAuth };
  for (const origin of [null, "", "https://evil.example", "https://dev-landing.deltamint.app.evil.example", "http://dev-landing.deltamint.app"]) {
    assert.deepEqual(connectorAddresses(origin, own, ownAuth, allowed), fallback, String(origin));
  }
});

test("usage record: a call failed on a protocol error or a tool error, succeeded otherwise", () => {
  assert.equal(callSucceeded({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }), true);
  assert.equal(callSucceeded({ jsonrpc: "2.0", id: 1, result: { content: [], isError: true } }), false);
  assert.equal(callSucceeded({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Unknown tool" } }), false);
  assert.equal(callSucceeded(null), false);
});

test("usage record: arguments kept when small, replaced by a note when not", () => {
  assert.deepEqual(recordedArgs({ tickers: ["SPY"], strategy: "put_spread" }), { tickers: ["SPY"], strategy: "put_spread" });
  assert.equal(recordedArgs(undefined), null);
  assert.deepEqual(recordedArgs({ blob: "x".repeat(3000) }), { truncated: true, chars: 3011 });
});


// ---------- the trading terminal's reads ----------

// A terminal that answers each read action from a table, and records what it was asked.
function terminalDeps(answers: Record<string, any>, over: Partial<ConnectorDeps> = {}) {
  const asked: any[] = [];
  const deps = fakeDeps({
    listAccounts: async () => [
      { id: "rh-1", name: "Robinhood", is_paper: false, provider: "snaptrade" },
      { id: "alp-1", name: "Paper", is_paper: true, provider: "alpaca" }
    ],
    terminal: async (body: any) => {
      asked.push(body);
      const a = answers[body.action];
      return typeof a === "function" ? a(body) : a ?? { status: 400, body: { error: "unknown action" } };
    },
    ...over
  });
  return { deps, asked };
}

test("terminal tools read through a direct Alpaca account, never through SnapTrade", async () => {
  const { deps, asked } = terminalDeps({ snapshot: { status: 200, body: { feed: "iex", quotes: { SPY: { last: 600.5, prevClose: 595, change: 5.5, changePct: 0.00924, at: "2026-10-08T14:59:58Z" } } } } });
  const r = await call(deps, "get_quotes", { symbols: ["spy", "nope!!"] });
  assert.equal(r.isError, false, r.text);
  assert.equal(asked[0].accountId, "alp-1");
  assert.deepEqual(asked[0].symbols, ["SPY"]);
  assert.equal(r.data.quotes[0].change_pct, 0.92);
  assert.equal(r.data.quotes[0].last_trade_at, "2026-10-08T14:59:58Z");

  const viaRh = await call(deps, "get_quotes", { symbols: ["SPY"], account_id: "rh-1" });
  assert.equal(viaRh.isError, true);
  assert.match(viaRh.text, /SnapTrade/);

  const none = await call(fakeDeps({ listAccounts: async () => [{ id: "rh-1", name: "RH", is_paper: false, provider: "snaptrade" }], terminal: async () => ({ status: 200, body: {} }) } as any), "get_quotes", { symbols: ["SPY"] });
  assert.equal(none.isError, true);
  assert.match(none.text, /Alpaca account/);

  const closed = await call(fakeDeps({ terminal: undefined } as any), "get_quotes", { symbols: ["SPY"] });
  assert.equal(closed.isError, true);
});

test("a refusal from the terminal reaches the model as a readable error", async () => {
  const { deps } = terminalDeps({ bars: { status: 403, body: { error: "Read-only through the Claude connector." } } });
  const r = await call(deps, "get_price_history", { symbol: "SPY" });
  assert.equal(r.isError, true);
  assert.match(r.text, /Read-only/);
});

test("gamma exposure: the Gamma page's own numbers, walls and flip, for the window asked", async () => {
  // As in gex.test.js: a big call strike above and a big put strike below in the week's expiry.
  const chain = {
    symbol: "SPY", spot: 600, prevClose: 598, at: "2026-10-08T14:59:00Z", oiDate: "2026-10-07",
    expiries: ["2026-10-08", "2026-10-09", "2026-11-20"],
    rows: [
      [600, 0, 1, 2000, 0.14, 30000], [600, 0, 0, 2000, 0.16, 25000],
      [610, 1, 1, 50000, 0.15, 20000], [590, 1, 0, 40000, 0.18, 15000],
      [620, 1, 1, 30000, 0.15, 5000], [650, 2, 1, 10000, 0.16, 100]
    ],
    counts: {}
  };
  const { deps, asked } = terminalDeps({ gex: { status: 200, body: chain } });
  const r = await call(deps, "get_gamma_exposure", { symbol: "spy", expiries: "week" });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(asked[0], { action: "gex", accountId: "alp-1", symbol: "SPY", days: 90 });
  assert.equal(r.data.call_wall, 610);
  assert.equal(r.data.put_wall, 590);
  assert.equal(r.data.open_interest_as_of, "2026-10-07");
  assert.equal(r.data.contracts_counted, 5); // the 20 November expiry is outside the week
  assert.equal(r.data.by_expiry.length, 3); // the split by expiry always covers them all
  assert.ok(r.data.read_out.length >= 3);
  assert.match(r.text, /estimate/);

  const one = await call(deps, "get_gamma_exposure", { symbol: "SPY", expiry: "2026-11-20" });
  assert.equal(one.data.contracts_counted, 1);
  assert.equal(one.data.put_wall, null);
  const bad = await call(deps, "get_gamma_exposure", { symbol: "SPY", expiry: "2026-12-31" });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /2026-10-09/);
  const coin = await call(deps, "get_gamma_exposure", { symbol: "BTC/USD" });
  assert.equal(coin.isError, true);
});

test("the screener reads every part of the market, filters and sorts as asked", async () => {
  const columns = ["symbol", "name", "exchange", "price", "priceAt", "day", "prevClose", "open", "high", "low", "close", "volume", "prevVolume", "vwap", "trades", "bid", "ask", "options", "shortable", "easyToBorrow", "fund", "shares", "earnDate", "earnSession", "fractionable"];
  const row = (symbol: string, price: number, prev: number, open: number, volume: number, prevVolume: number, options: boolean, fund = false) =>
    [symbol, symbol + " Inc", "NASDAQ", price, "2026-10-08T14:59:00Z", "2026-10-08", prev, open, price, open, null, volume, prevVolume, price, 1, null, null, options, true, true, fund, null, null, null, true];
  const parts: Record<number, any[]> = {
    0: [row("AAA", 11, 10, 10.5, 5e6, 1e6, true), row("BBB", 50, 52, 51, 2e6, 2e6, true)],
    1: [row("CCC", 5, 4, 4.4, 9e6, 1e6, false)],
    2: [row("QQQ", 500, 495, 496, 3e7, 3e7, true, true)],
    3: []
  };
  const { deps, asked } = terminalDeps({
    screen: (b: any) => ({ status: 200, body: { columns, rows: parts[b.part], dayFeed: "delayed_sip", priceFeed: "iex", at: "2026-10-08T15:00:00Z", listed: 100 } })
  });
  const r = await call(deps, "screen_stocks", { min_change_pct: 1, funds: "exclude" });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(asked.map((a) => a.part).sort(), [0, 1, 2, 3]);
  assert.deepEqual(r.data.shares.map((s: any) => s.symbol), ["CCC", "AAA"]); // QQQ is a fund, BBB fell
  assert.equal(r.data.shares[0].change_pct, 25);
  assert.equal(r.data.shares[0].gap_pct, 10);
  assert.equal(r.data.shares[0].volume_vs_yesterday, 9);
  assert.equal(r.data.listed, 400);

  const losers = await call(deps, "screen_stocks", { sort_by: "change_pct", ascending: true, optionable: true, limit: 1 });
  assert.deepEqual(losers.data.shares.map((s: any) => s.symbol), ["BBB"]);
  assert.equal(losers.data.matched, 3);
});

test("price history: the latest candles asked, with their change and range", async () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({ time: 1791100800 + i * 86400, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 }));
  const { deps, asked } = terminalDeps({ bars: { status: 200, body: { feed: "iex", bars } } });
  const r = await call(deps, "get_price_history", { symbol: "aapl", bars: 3 });
  assert.equal(asked[0].interval, "1Day");
  assert.equal(asked[0].session, "regular");
  assert.equal(r.data.candles.length, 3);
  assert.equal(r.data.candles[0].open, 107);
  assert.equal(r.data.high, 111);
  assert.equal(r.data.low, 106);
});

test("news, earnings and orders come back shaped, read only", async () => {
  const { deps, asked } = terminalDeps({
    news: { status: 200, body: { news: [{ headline: "Chips up", summary: "x".repeat(900), source: "benzinga", url: "https://e.x/1", at: "2026-10-08T12:00:00Z", symbols: ["NVDA"] }] } },
    events: { status: 200, body: { earnings: [
      { date: "2026-08-27", session: "amc", upcoming: false, epsActual: 1.1, epsEstimate: 1, period: "Q2" },
      { date: "2026-11-19", session: "amc", upcoming: true }
    ] } },
    account: { status: 200, body: {
      summary: { equity: 1000.123, dayChange: 5, cash: 400, buyingPower: 800, optionsBuyingPower: 400, dayTradeCount: 1, patternDayTrader: false },
      orders: [{ id: "o1", symbol: "SPY", side: "sell", qty: 2, filled: 0, type: "stop", stop: 590, tif: "gtc", status: "new", orderClass: "simple", submittedAt: "2026-10-08T14:00:00Z", legs: [] }],
      recent: [{ id: "o0", symbol: "SPY", side: "buy", qty: 2, filled: 2, avgPrice: 598, type: "market", status: "filled", submittedAt: "2026-10-08T13:31:00Z", filledAt: "2026-10-08T13:31:01Z" }]
    } }
  });
  const n = await call(deps, "get_news", { symbol: "NVDA", days: 2 });
  assert.equal(n.data.news[0].summary.length, 400);
  assert.equal(asked[0].start, "2026-10-06T15:00:00.000Z");
  const e = await call(deps, "get_earnings", { symbol: "NVDA" });
  assert.equal(e.data.next.date, "2026-11-19");
  assert.equal(e.data.next.when, "after the close");
  assert.equal(e.data.recent[0].eps_actual, 1.1);
  const o = await call(deps, "get_orders", {});
  assert.equal(o.data.working[0].stop, 590);
  assert.equal(o.data.recent[0].average_price, 598);
  assert.equal(o.data.equity, 1000.12);
  assert.ok(asked.every((a) => ["news", "events", "account"].includes(a.action)));
});

test("SnapTrade positions say how old SnapTrade's copy is, and only the account asked is read", async () => {
  const synced: any[] = [];
  const deps = fakeDeps({
    listAccounts: async () => [{ id: "rh-1", name: "Robinhood", is_paper: false, provider: "snaptrade" }],
    syncAccounts: async (only?: string) => {
      synced.push(only);
      return { syncedAt: NOW.toISOString(), accounts: [{ id: "rh-1", name: "Robinhood", ok: true, type: "Live", source: "snaptrade", brokerAsOf: "2026-10-08T06:10:00Z", spreads: [], orders: [] }] };
    }
  } as any);
  const r = await call(deps, "get_positions", {});
  assert.deepEqual(synced, ["rh-1"]);
  assert.match(r.text, /SnapTrade/);
  assert.equal(r.data.broker_data_as_of, "2026-10-08T06:10:00Z");
});
