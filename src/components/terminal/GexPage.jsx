import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, RefreshCw, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { prepare } from "@/lib/gex";
import useAccountSetting from "@/components/terminal/useAccountSetting";
import { WINDOWS, RANGES, METRICS, Seg } from "@/components/terminal/gexParts";
import GexBoard from "@/components/terminal/GexBoard";
import GexHistory from "@/components/terminal/GexHistory";

// The Gamma page: gamma exposure for a stock or fund, from every listed
// contract (7 Nov 2026, the owner: "add tools to how to analyze and make it
// easy, yet informative and very professional and explaining how to use it").
// The chain comes from functions/terminal "gex"; the figures from lib/gex.js.
// Its parts: gexParts.jsx (shared pieces), GexBoard.jsx (the figures and
// charts for one chain, Live's or a past day's), GexHistory.jsx (past days).

const REFRESH_MS = 5 * 60000;
const MODES = [["live", "Live"], ["history", "History"]];

const cleanView = (v) => {
  const o = v && typeof v === "object" ? v : {};
  return {
    sym: typeof o.sym === "string" && /^[A-Z][A-Z0-9.]{0,5}$/.test(o.sym) ? o.sym : "SPY",
    win: WINDOWS.some(([id]) => id === o.win) ? o.win : "30",
    range: RANGES.some(([r]) => r === o.range) ? o.range : 0.05,
    metric: METRICS.some(([id]) => id === o.metric) ? o.metric : "gex",
    view: o.view === "net" ? "net" : "split",
    lines: o.lines !== false,
    // Live, or past days (GexHistory.jsx), and the symbol History shows.
    mode: o.mode === "history" ? "history" : "live",
    hsym: typeof o.hsym === "string" && /^[A-Z][A-Z0-9.]{0,5}$/.test(o.hsym) ? o.hsym : ""
  };
};

function Guide({ onClose }) {
  const H = ({ children }) => <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h4>;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/20" onClick={onClose} role="presentation">
      <aside role="dialog" aria-label="How to read gamma exposure" onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 text-[13px] leading-relaxed text-slate-700 shadow-2xl">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-500" />
          <h3 className="flex-1 text-base font-semibold text-slate-900">How to read gamma exposure</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <H>What it shows</H>
        <p>Dealers who sell options hedge them with the stock. Gamma exposure (GEX) estimates how many dollars of stock they would buy or sell if the price moved 1%, worked out from every listed contract&apos;s open interest and implied volatility. Calls count plus and puts minus: the standard assumption that dealers hold the other side of what customers trade (long calls, short puts).</p>
        <H>Positive or negative gamma</H>
        <p><b className="text-slate-900">Positive</b> (blue): dealers&apos; hedging leans against the move. They sell into rallies and buy dips, so swings tend to be smaller and prices tend to stick near big strikes.</p>
        <p className="mt-1"><b className="text-slate-900">Negative</b> (red): hedging goes with the move. They buy rallies and sell dips, so swings tend to be wider and breaks tend to run.</p>
        <H>The zero-gamma flip</H>
        <p>The price where total exposure crosses zero (the violet dashed line). Above it the estimate is usually positive, below it negative. How far the price sits from the flip says how far it has to move before the behaviour is expected to change.</p>
        <H>Call wall and put wall</H>
        <p>The strikes holding the most call gamma and the most put gamma. Traders watch them as reference levels: in positive gamma price tends to slow near them; in negative gamma they can give way. Close to expiry, a large strike near the price can act like a magnet.</p>
        <H>A routine</H>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Read the regime on the <b>Net gamma</b> tile.</li>
          <li>Check the distance to the <b>flip</b>: close means the regime can change quickly.</li>
          <li>Mark the <b>walls</b>; tick <b>Levels on chart</b> to draw them on the Trade page.</li>
          <li>Check <b>Expiring soonest</b>: when today&apos;s expiry carries much of the gamma, the map changes after the close.</li>
          <li>Switch <b>Measure</b> to <b>Volume today</b> to see where fresh trading is building.</li>
          <li>Refresh after a large move; the page also refreshes itself every five minutes.</li>
        </ol>
        <H>Tools on this page</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Expiries</b>: the nearest only, a week, a month, or all within 90 days. Click a column under <b>Gamma by expiry</b> to show that expiry alone.</li>
          <li><b>Range</b>: how far from the price the strike chart reaches; wide ranges group strikes into bands.</li>
          <li><b>Measure</b>: dollars of gamma, open interest, or contracts traded today.</li>
          <li><b>Calls &amp; puts / Net</b>: both sides of each strike, or what is left after they offset.</li>
          <li>Hover any bar or line for its figures.</li>
        </ul>
        <H>History</H>
        <p>Switch <b>View</b> to <b>History</b> to see gamma on past days, each as it stood a minute before that day&apos;s close, and what the price did after. Click a day on the chart or in the table to open it: the same figures and charts as Live, for that day. The table <b>How it moved after each regime</b> compares the days that closed in positive gamma with those in negative gamma. A handful of days proves little: read it as a record, not a rule.</p>
        <H>Limits</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>An estimate: real dealer positions are not published, and customers do not only buy calls and sell puts.</li>
          <li>Open interest is published once a day, as of the previous close. During the day the exposure moves with the price only; today&apos;s new positions show under Volume today, which cannot say whether they opened or closed.</li>
          <li>Volatility from Alpaca&apos;s option feed; strikes within 20% of the price, expiries within 90 days.</li>
          <li>For context, not a recommendation to trade.</li>
        </ul>
      </aside>
    </div>
  );
}

/**
 * `accountId`: whose Alpaca account reads the chain; `chartSymbol`: the Trade
 * page's symbol, offered as a shortcut; `priceOf(symbol)`: the live price,
 * when streaming; `onSymbol` tells the page which symbol to stream;
 * `onLevels(symbol, levels)` puts the walls and flip on the Trade charts.
 */
export default function GexPage({ accountId, active, chartSymbol, priceOf, onSymbol, onLevels, stockFeed = "iex" }) {
  const [view, setView] = useAccountSetting("gexview", { localKey: "dm.terminal.gexView", initial: () => cleanView(null), clean: cleanView });
  const set = useCallback((patch) => setView((v) => ({ ...v, ...patch })), [setView]);
  const [typed, setTyped] = useState(view.sym);
  const [expiry, setExpiry] = useState(null);
  const [chain, setChain] = useState(null);
  const [state, setState] = useState({ loading: false, error: null });
  const [guide, setGuide] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sym = view.sym;
  useEffect(() => { setTyped(sym); setExpiry(null); onSymbol?.(sym); }, [sym, onSymbol]);

  const load = useCallback(() => {
    if (!accountId || !sym) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    invokeFunction("terminal", { action: "gex", accountId, symbol: sym, days: 90, stockFeed })
      .then((r) => {
        if (r?.data?.error) { setState({ loading: false, error: r.data.error }); return; }
        setChain(r.data);
        setNow(Date.now());
        setState({ loading: false, error: null });
      })
      .catch((e) => setState({ loading: false, error: String(e?.message || e) }));
  }, [accountId, sym, stockFeed]);
  // Today's chain is read only while Live is shown.
  const liveOn = active && view.mode === "live";
  useEffect(() => { if (liveOn) load(); }, [liveOn, load]);
  useEffect(() => {
    if (!liveOn) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [liveOn, load]);

  const mine = chain && chain.symbol === sym ? chain : null;
  const prepared = useMemo(() => (mine ? prepare(mine, now) : null), [mine, now]);
  const live = priceOf?.(sym) ?? null;
  const spot0 = mine?.spot || null;
  // Worked again each 0.1% the price moves, not on every trade.
  const spot = spot0 ? (live ? Math.round(live / (spot0 * 0.001)) * spot0 * 0.001 : spot0) : null;
  const shownSpot = live ?? spot0;
  const go = (s) => { const v = String(s || "").toUpperCase().trim(); if (/^[A-Z][A-Z0-9.]{0,5}$/.test(v)) set({ sym: v }); };
  const quick = [...new Set(["SPY", "QQQ", chartSymbol && !chartSymbol.includes("/") ? chartSymbol : null].filter(Boolean))];
  const at2 = mine ? new Date(mine.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  if (view.mode === "history") {
    return (
      <div className="flex flex-col gap-2 px-1 pb-4 text-slate-800">
        <GexHistory active={active} view={view} set={set} modeSwitch={<Seg label="View" value={view.mode} options={MODES} onChange={(m) => set({ mode: m })} />} onGuide={() => setGuide(true)} />
        {guide && <Guide onClose={() => setGuide(false)} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-1 pb-4 text-slate-800">
      {/* The tools, in one row. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Seg label="View" value={view.mode} options={MODES} onChange={(m) => set({ mode: m })} />
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); go(typed); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} aria-label="Symbol" placeholder="Symbol"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold uppercase" />
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => go(q)} className={`rounded-md border px-2 py-1 text-xs ${q === sym ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{q}</button>
          ))}
        </form>
        <Seg label="Expiries" value={expiry !== null ? null : view.win} options={WINDOWS} onChange={(id) => { setExpiry(null); set({ win: id }); }} />
        {prepared && (
          <select value={expiry ?? ""} onChange={(e) => setExpiry(e.target.value === "" ? null : Number(e.target.value))} aria-label="One expiry"
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
            <option value="">One expiry…</option>
            {prepared.expiries.map((e, i) => e.open && <option key={e.expiry} value={i}>{e.expiry} ({e.days === 0 ? "today" : `${e.days}d`})</option>)}
          </select>
        )}
        <Seg label="Range" value={view.range} options={RANGES} onChange={(r) => set({ range: r })} />
        <Seg label="Measure" value={view.metric} options={METRICS} onChange={(m) => set({ metric: m })} />
        <label className="flex items-center gap-1.5 text-xs text-slate-700" title="Draw the call wall, put wall and zero-gamma flip on the Trade page's charts of this symbol">
          <input type="checkbox" checked={view.lines} onChange={(e) => set({ lines: e.target.checked })} />Levels on chart
        </label>
        <div className="ml-auto flex items-center gap-2">
          {at2 && <span className="text-[11px] text-slate-500">Read {at2}</span>}
          <button type="button" onClick={load} disabled={state.loading} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1 rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800">
            <BookOpen className="h-3.5 w-3.5" />How to read this
          </button>
        </div>
      </div>

      {state.error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p>}
      {!mine && state.loading && <p className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Reading every {sym} contract within 90 days…</p>}

      {mine && spot && (
        <GexBoard sym={sym} mine={mine} prepared={prepared} spot={spot} shownSpot={shownSpot} view={view} set={set}
          expiry={expiry} setExpiry={setExpiry} onLevels={onLevels} />
      )}
      {guide && <Guide onClose={() => setGuide(false)} />}
    </div>
  );
}
