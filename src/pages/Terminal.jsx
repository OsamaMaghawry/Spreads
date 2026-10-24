import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { readWatchlist, cleanWatchlist, tapeRow, pushTape, px, pctText, sizeText } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import useTerminalStream from "@/components/terminal/useTerminalStream";
import PriceChart from "@/components/terminal/PriceChart";
import OrderTicket from "@/components/terminal/OrderTicket";
import { TimeAndSales, Positions, Orders, Depth } from "@/components/terminal/Panels";

// The trading terminal, a staging test (LAB).
//
// The owner, 24 Oct 2026: "a full stock trading app, using alpaca prices ...
// time and sales and order book ... to be like tws", charted with TradingView's
// free library on the account's own Alpaca price feed. Watchlist, chart,
// quote, ticket, time & sales, positions and orders on one screen. Prices are
// the selected account's own (the free IEX feed); orders go to paper accounts
// only during the test, enforced by the server (functions/terminal).

const WATCH_KEY = "dm.terminal.watchlist";
const POLL_MS = 4000;

export default function Terminal() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [watch, setWatch] = useState(() => {
    try { return readWatchlist(localStorage.getItem(WATCH_KEY)); } catch { return readWatchlist(null); }
  });
  const [symbol, setSymbol] = useState(() => watch[0]);
  const [interval, setInterval_] = useState("5Min");
  const [snaps, setSnaps] = useState({});
  const [view, setView] = useState(null);
  const [tape, setTape] = useState([]);
  const [tab, setTab] = useState("tape");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const quoteRef = useRef(null);

  useEffect(() => {
    invokeFunction("syncAccounts", {}).then((r) => {
      const list = (r?.data?.accounts || []).filter((a) => !a.readOnly);
      setAccounts(list);
      setAccountId((cur) => cur || (list.find((a) => a.type === "Paper") || list[0])?.id || "");
    }).catch(() => setAccounts([]));
  }, []);
  const account = accounts.find((a) => a.id === accountId) || null;

  useEffect(() => {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(watch)); } catch { /* private window */ }
  }, [watch]);

  const streamSymbols = useMemo(() => cleanWatchlist([symbol, ...watch]).slice(0, 30), [symbol, watch]);
  const { quotes: live, status, listen } = useTerminalStream(accountId, streamSymbols);

  // Opening quotes and the previous close, for the change column.
  useEffect(() => {
    if (!accountId) return;
    invokeFunction("terminal", { action: "snapshot", accountId, symbols: streamSymbols }).then((r) => {
      if (r?.data?.quotes) setSnaps((s) => ({ ...s, ...r.data.quotes }));
    });
  }, [accountId, streamSymbols]);

  const quoteOf = useCallback((s) => {
    const a = snaps[s] || {};
    const b = live[s] || {};
    const last = b.last ?? a.last ?? null;
    const prev = a.prevClose ?? null;
    return { ...a, ...b, last, change: last !== null && prev ? last - prev : null, changePct: last !== null && prev ? (last - prev) / prev : null };
  }, [snaps, live]);
  const quote = quoteOf(symbol);
  quoteRef.current = quote;

  // The account's shares and orders, every few seconds while the tab is open.
  const loadView = useCallback(() => {
    if (!accountId || document.visibilityState === "hidden") return;
    invokeFunction("terminal", { action: "account", accountId }).then((r) => { if (!r?.data?.error) setView(r.data); });
  }, [accountId]);
  useEffect(() => {
    setView(null);
    loadView();
    const t = setInterval(loadView, POLL_MS);
    return () => clearInterval(t);
  }, [loadView]);

  // The tape for the selected symbol.
  useEffect(() => {
    setTape([]);
    return listen((m) => {
      if (m.type === "trade" && m.symbol === symbol) setTape((rows) => pushTape(rows, tapeRow(m, quoteRef.current)));
    });
  }, [listen, symbol]);

  // Symbol search.
  useEffect(() => {
    if (!q.trim() || !accountId) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      invokeFunction("terminal", { action: "search", accountId, q }).then((r) => setResults(r?.data?.results || []));
    }, 250);
    return () => clearTimeout(t);
  }, [q, accountId]);

  const pick = (s) => { setSymbol(s); setQ(""); setResults([]); };
  const held = (view?.positions || []).find((p) => p.symbol === symbol)?.qty || 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col gap-2 text-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold">Terminal</h1>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Staging test</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0].symbol); }}
            placeholder="Symbol or company" className="w-56 rounded-md border border-slate-300 py-1 pl-7 pr-2 text-sm" />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-80 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <div key={r.symbol} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50">
                  <button type="button" className="flex-1 text-left" onClick={() => pick(r.symbol)}>
                    <span className="font-semibold">{r.symbol}</span> <span className="text-xs text-slate-500">{r.name}</span>
                  </button>
                  <button type="button" title="Add to watchlist" onClick={() => { setWatch((w) => cleanWatchlist([...w, r.symbol])); pick(r.symbol); }}>
                    <Plus className="h-4 w-4 text-slate-400 hover:text-emerald-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <span className={`ml-auto text-xs ${status.state === "live" ? "text-emerald-700" : status.state === "error" ? "text-rose-700" : "text-slate-500"}`}>
          {status.state === "live" ? "● Live · IEX feed" : status.state === "error" ? status.message : status.state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[220px_1fr_300px]">
        {/* Watchlist */}
        <div className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white">
          {watch.map((s) => {
            const w = quoteOf(s);
            return (
              <div key={s} className={`group flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1.5 ${s === symbol ? "bg-emerald-50" : "hover:bg-slate-50"}`} onClick={() => setSymbol(s)}>
                <span className="w-14 text-sm font-semibold">{s}</span>
                <span className="flex-1 text-right text-sm tabular-nums">{px(w.last)}</span>
                <span className={`w-16 text-right text-xs tabular-nums ${w.changePct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{pctText(w.changePct)}</span>
                <button type="button" title="Remove" className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setWatch((l) => l.filter((x) => x !== s)); }}>
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Chart and lower panels */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-baseline gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xl font-semibold">{symbol}</span>
            <span className="text-xl tabular-nums">{px(quote.last)}</span>
            <span className={`text-sm tabular-nums ${quote.change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{quote.change !== null ? `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}` : ""} {pctText(quote.changePct)}</span>
            <span className="ml-auto text-xs tabular-nums text-slate-500">
              Bid <b className="text-slate-800">{px(quote.bid)}</b> × {sizeText(quote.bidSize)} · Ask <b className="text-slate-800">{px(quote.ask)}</b> × {sizeText(quote.askSize)}
            </span>
          </div>
          <div className="min-h-[300px] flex-[3] overflow-hidden rounded-lg border border-slate-200 bg-white">
            <PriceChart accountId={accountId} symbol={symbol} interval={interval} onInterval={setInterval_} listen={listen} />
          </div>
          <div className="flex min-h-[180px] flex-[2] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex gap-1 border-b border-slate-200 px-2 py-1">
              {[["tape", "Time & sales"], ["positions", `Positions${view?.positions?.length ? ` (${view.positions.length})` : ""}`], ["orders", `Orders${view?.orders?.length ? ` (${view.orders.length})` : ""}`], ["depth", "Level 2"]].map(([id, name]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`rounded px-2 py-0.5 text-xs font-medium ${tab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{name}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {tab === "tape" && <TimeAndSales rows={tape} symbol={symbol} />}
              {tab === "positions" && <Positions positions={view?.positions || []} onPick={setSymbol} />}
              {tab === "orders" && <Orders accountId={accountId} orders={view?.orders || []} onChanged={loadView} />}
              {tab === "depth" && <Depth accountId={accountId} symbol={symbol} />}
            </div>
          </div>
        </div>

        {/* Quote detail and ticket */}
        <div className="min-h-0 space-y-2 overflow-auto">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <div className="grid grid-cols-2 gap-y-1 tabular-nums">
              <span className="text-slate-500">Open</span><span className="text-right">{px(quote.open)}</span>
              <span className="text-slate-500">High</span><span className="text-right">{px(quote.high)}</span>
              <span className="text-slate-500">Low</span><span className="text-right">{px(quote.low)}</span>
              <span className="text-slate-500">Prev close</span><span className="text-right">{px(quote.prevClose)}</span>
              <span className="text-slate-500">Volume (IEX)</span><span className="text-right">{sizeText(quote.volume)}</span>
            </div>
            {view && (
              <div className="mt-2 grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-2 tabular-nums">
                <span className="text-slate-500">Equity</span><span className="text-right">{fmtMoney(view.equity)}</span>
                <span className="text-slate-500">Buying power</span><span className="text-right">{fmtMoney(view.buyingPower)}</span>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <OrderTicket account={account} symbol={symbol} quote={quote} held={held} buyingPower={view?.buyingPower ?? null} onPlaced={loadView} />
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-slate-400">Prices from your own Alpaca account's free IEX feed: real time, but IEX trades only. Charts by TradingView Lightweight Charts. Not investment advice.</p>
        </div>
      </div>
    </div>
  );
}
