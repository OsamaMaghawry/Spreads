import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Plus, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import {
  decodeUniverse, screenRow, FIELDS, FIELD, GROUPS, parseAmount, cleanScreen, passes, sortRows, needsDaily,
  PRESETS, presetScreen, dailyCandidates, bigNumber, TREND_CHOICES, EMPTY_SCREEN
} from "@/lib/screener";
import { px, pctText } from "@/lib/terminal";

// The stock screener (24 Oct 2026: "Stock Screener, with some extensive
// filtrations like the advanced tools to see the stocks in play"). The whole
// listed US market, from the selected account's own Alpaca data, filtered as
// you type: ready-made screens for stocks in play on the left, every filter
// below them, the matches on the right. Click a row to chart and trade it.
// The arithmetic is lib/screener.js; the reads are functions/terminal "screen".

const SCREEN_KEY = "dm.screener.v1";
const DAILY_KEY = "dm.screener.daily.v1";
const SHOW_MAX = 300;
const DAILY_BATCH = 200;
const DAILY_PARALLEL = 2;
const AUTO_MS = 60000;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* full or private */ } }
};
const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const COLUMNS = [
  ["symbol", "Symbol"], ["price", "Price"], ["changePct", "Chg %"], ["gapPct", "Gap %"], ["volume", "Volume"], ["relVol", "Rel vol"],
  ["dollarVol", "$ Vol"], ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"],
  ["vsSma50", "vs 50d"], ["perf1m", "1 month"], ["earningsIn", "Earnings"]
];
const SESSION = { bmo: "before open", amc: "after close", dmh: "in session" };

function cell(row, key) {
  const v = row[key];
  if (key === "symbol") return null;
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return <span className="text-slate-300">—</span>;
  if (key === "price") return px(v);
  if (key === "volume") return bigNumber(v);
  if (key === "dollarVol" || key === "marketCap") return `$${bigNumber(v)}`;
  if (key === "relVol") return `${v.toFixed(2)}×`;
  if (key === "rsi") return v.toFixed(0);
  if (key === "earningsIn") return `${v === 0 ? "today" : `in ${v}d`}${row.earnSession ? ` · ${SESSION[row.earnSession] || ""}` : ""}`;
  if (FIELD[key]?.pct) {
    const tone = ["changePct", "gapPct", "perf1m", "fromVwap"].includes(key) ? (v >= 0 ? "text-emerald-700" : "text-rose-700") : "";
    return <span className={tone}>{key === "atrPct" ? `${(v * 100).toFixed(1)}%` : pctText(v)}</span>;
  }
  return String(v);
}

// One filter's minimum and maximum, as typed ("500k", "2.5m", "3").
function RangeRow({ field, value, onChange }) {
  const [text, setText] = useState({ min: value?.min ?? "", max: value?.max ?? "" });
  useEffect(() => { setText({ min: value?.min ?? "", max: value?.max ?? "" }); }, [value?.min, value?.max]);
  const set = (side, t) => {
    setText((x) => ({ ...x, [side]: t }));
    const n = parseAmount(t);
    if (t.trim() && n === null) return;
    onChange(field.id, { ...(value || { min: null, max: null }), [side]: n });
  };
  const on = value && (value.min !== null || value.max !== null);
  const unit = field.unit === "$" ? "$" : field.unit === "%" ? "%" : field.unit === "x" ? "×" : "";
  return (
    <div className={`flex items-center gap-1 rounded px-1 py-0.5 ${on ? "bg-emerald-50" : ""}`}>
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={field.hint || field.label}>{field.label}</span>
      {["min", "max"].map((side) => (
        <input key={side} value={text[side]} onChange={(e) => set(side, e.target.value)} placeholder={side} aria-label={`${field.label} ${side}`}
          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] tabular-nums focus:border-emerald-500 focus:outline-none" />
      ))}
      <span className="w-3 text-[10px] text-slate-400">{unit}</span>
    </div>
  );
}

export default function Screener({ accountId, active, watch, onPick, onAdd }) {
  const [universe, setUniverse] = useState({ rows: [], at: null, dayFeed: null, listed: 0, loading: false, error: null });
  const [daily, setDaily] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0, loading: false, error: null });
  const [screen, setScreen] = useState(() => {
    try { return cleanScreen(JSON.parse(store.get(SCREEN_KEY) || "null") || presetScreen("gainers")); } catch { return presetScreen("gainers"); }
  });
  const [preset, setPreset] = useState(() => { try { return JSON.parse(store.get(SCREEN_KEY) || "null")?.preset || "gainers"; } catch { return "gainers"; } });
  const [open, setOpen] = useState(() => new Set(["Price and volume", "Today"]));
  const [auto, setAuto] = useState(true);
  const dailyRef = useRef({});
  const loadingDaily = useRef(false);

  useEffect(() => { store.set(SCREEN_KEY, JSON.stringify({ ...screen, preset })); }, [screen, preset]);

  // The day's cached daily numbers for this account, if any.
  useEffect(() => {
    try {
      const c = JSON.parse(store.get(DAILY_KEY) || "null");
      dailyRef.current = c && c.account === accountId && c.date === nyToday() ? c.stats || {} : {};
    } catch { dailyRef.current = {}; }
    setDaily({ ...dailyRef.current });
  }, [accountId]);

  // The daily numbers for the most traded shares, a batch at a time, kept
  // for the day: they change only after the close.
  const loadDaily = useCallback(async (rows) => {
    if (loadingDaily.current || !accountId) return;
    const want = dailyCandidates(rows).filter((s) => !(s in dailyRef.current));
    if (!want.length) { setProgress((p) => ({ ...p, loading: false })); return; }
    loadingDaily.current = true;
    const total = Object.keys(dailyRef.current).length + want.length;
    setProgress({ done: Object.keys(dailyRef.current).length, total, loading: true, error: null });
    const batches = [];
    for (let i = 0; i < want.length; i += DAILY_BATCH) batches.push(want.slice(i, i + DAILY_BATCH));
    let failed = null;
    for (let i = 0; i < batches.length; i += DAILY_PARALLEL) {
      // A batch refused (the broker's per-minute allowance, say) is tried
      // once more after a pause.
      const read = (symbols) => invokeFunction("terminal", { action: "screen", stage: "daily", accountId, symbols })
        .then((r) => (r?.data?.stats && !r.data.error ? r.data.stats : Promise.reject(new Error(r?.data?.error || "No answer"))));
      const got = await Promise.all(batches.slice(i, i + DAILY_PARALLEL).map((symbols) =>
        read(symbols).catch(() => new Promise((ok) => setTimeout(ok, 4000)).then(() => read(symbols)))
          .catch((e) => { failed = String(e?.message || e); return {}; })));
      for (const stats of got) for (const [s, v] of Object.entries(stats)) dailyRef.current[s] = v;
      setDaily({ ...dailyRef.current });
      setProgress({ done: Object.keys(dailyRef.current).length, total, loading: true, error: null });
    }
    store.set(DAILY_KEY, JSON.stringify({ account: accountId, date: nyToday(), stats: dailyRef.current }));
    setProgress({ done: Object.keys(dailyRef.current).length, total, loading: false, error: failed });
    loadingDaily.current = false;
  }, [accountId]);

  const refresh = useCallback(() => {
    if (!accountId) return;
    setUniverse((u) => ({ ...u, loading: true, error: null }));
    invokeFunction("terminal", { action: "screen", accountId }).then((r) => {
      if (r?.data?.error || !r?.data?.rows) { setUniverse((u) => ({ ...u, loading: false, error: r?.data?.error || "The screen could not be read." })); return; }
      const rows = decodeUniverse(r.data);
      setUniverse({ rows, at: r.data.at, dayFeed: r.data.dayFeed, listed: r.data.listed, loading: false, error: null });
      loadDaily(rows.map((u) => screenRow(u, null, nyToday())));
    }).catch((e) => setUniverse((u) => ({ ...u, loading: false, error: String(e?.message || e) })));
  }, [accountId, loadDaily]);

  // Read when first opened, then every minute while on screen.
  useEffect(() => {
    if (!active || !accountId) return undefined;
    if (!universe.at) refresh();
    if (!auto) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, AUTO_MS);
    return () => clearInterval(t);
  }, [active, accountId, auto, refresh]);

  const today = nyToday();
  const rows = useMemo(() => universe.rows.map((u) => screenRow(u, daily[u.symbol], today)), [universe.rows, daily, today]);
  const matches = useMemo(() => sortRows(rows.filter((r) => passes(r, screen)), screen.sort), [rows, screen]);
  const covered = rows.filter((r) => r.hasDaily).length;

  const choosePreset = (id) => { setPreset(id); setScreen(presetScreen(id)); };
  const setRange = (id, v) => {
    setPreset(null);
    setScreen((s) => {
      const ranges = { ...s.ranges };
      if (v.min === null && v.max === null) delete ranges[id];
      else ranges[id] = v;
      return { ...s, ranges };
    });
  };
  const setChoice = (k, v) => { setPreset(null); setScreen((s) => ({ ...s, [k]: v })); };
  const sortBy = (key) => setScreen((s) => ({ ...s, sort: { key, dir: s.sort.key === key && s.sort.dir === "desc" ? "asc" : "desc" } }));
  const toggleGroup = (g) => setOpen((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const activeRanges = Object.entries(screen.ranges);
  const presetInfo = PRESETS.find((p) => p.id === preset);

  return (
    <div className="flex min-h-[70vh] gap-2 text-slate-800">
      <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">Stocks in play</div>
        <div className="grid grid-cols-2 gap-1 px-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" title={p.note} onClick={() => choosePreset(p.id)}
              className={`rounded border px-1.5 py-1 text-left text-[11px] ${preset === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center border-t border-slate-200 px-2 pt-2 text-xs font-semibold text-slate-700">
          Filters
          <button type="button" onClick={() => { setPreset(null); setScreen(cleanScreen({ ...EMPTY_SCREEN, sort: screen.sort })); }} className="ml-auto text-[11px] font-normal text-slate-500 hover:underline">Clear all</button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
          <div className="grid grid-cols-2 gap-1">
            <select value={screen.type} onChange={(e) => setChoice("type", e.target.value)} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]" aria-label="Type">
              <option value="all">Stocks and funds</option><option value="stocks">Stocks only</option><option value="funds">Funds only (ETFs, by name)</option>
            </select>
            <select value={screen.exchange} onChange={(e) => setChoice("exchange", e.target.value)} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]" aria-label="Exchange">
              <option value="all">Any exchange</option>{["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <select value={screen.trend} onChange={(e) => setChoice("trend", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-0.5 text-[11px]" aria-label="Trend">
            {TREND_CHOICES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="flex gap-3 px-1 text-[11px] text-slate-600">
            <label className="flex items-center gap-1"><input type="checkbox" checked={screen.options} onChange={(e) => setChoice("options", e.target.checked)} />Has options</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={screen.shortable} onChange={(e) => setChoice("shortable", e.target.checked)} />Shortable</label>
          </div>
          {GROUPS.map((g) => (
            <div key={g} className="rounded border border-slate-100">
              <button type="button" onClick={() => toggleGroup(g)} className="flex w-full items-center gap-1 px-1 py-1 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                {open.has(g) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{g}
                {FIELDS.some((f) => f.group === g && screen.ranges[f.id]) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </button>
              {open.has(g) && FIELDS.filter((f) => f.group === g).map((f) => <RangeRow key={f.id} field={f} value={screen.ranges[f.id]} onChange={setRange} />)}
            </div>
          ))}
          <p className="px-1 pt-1 text-[10px] leading-snug text-slate-400">Type 500k, 2.5m or 1b for amounts; percentages as numbers (3 for 3%). Hover a filter for what it measures.</p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-1.5 text-xs">
          <span className="font-semibold">{matches.length.toLocaleString()} match{matches.length === 1 ? "" : "es"}</span>
          <span className="text-slate-500">of {rows.length.toLocaleString()} listed shares{presetInfo ? ` · ${presetInfo.note}` : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Every minute</label>
            <button type="button" onClick={refresh} disabled={universe.loading} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${universe.loading ? "animate-spin" : ""}`} />{universe.loading ? "Reading…" : "Refresh"}
            </button>
          </div>
        </div>
        {activeRanges.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1">
            {activeRanges.map(([id, { min, max }]) => {
              const f = FIELD[id];
              const u = f.unit === "%" ? "%" : f.unit === "x" ? "×" : "";
              const amt = (v) => (f.unit === "$" ? `$${bigNumber(v)}` : f.unit === "shares" ? bigNumber(v) : `${v}${u}`);
              return (
                <span key={id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                  {f.label} {min !== null && max !== null ? `${amt(min)} to ${amt(max)}` : min !== null ? `≥ ${amt(min)}` : `≤ ${amt(max)}`}
                  <button type="button" aria-label={`Remove ${f.label}`} onClick={() => setRange(id, { min: null, max: null })}><X className="h-3 w-3" /></button>
                </span>
              );
            })}
          </div>
        )}
        {(universe.error || progress.error) && <p className="px-2 py-1 text-xs text-rose-700">{universe.error || `Daily figures: ${progress.error}`}</p>}
        {needsDaily(screen) && (progress.loading || covered < rows.length) && rows.length > 0 && (
          <p className="px-2 py-1 text-[11px] text-amber-800">
            {progress.loading ? `Reading a year of daily candles: ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} shares. Matches fill in as they arrive.` : `Averages, RSI, ATR, 52-week and performance figures cover the ${covered.toLocaleString()} most traded shares.`}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500">
              <tr>
                {COLUMNS.map(([key, name]) => (
                  <th key={key} className={`cursor-pointer whitespace-nowrap px-2 py-1 font-medium hover:text-slate-900 ${key === "symbol" ? "text-left" : "text-right"}`}
                    title={FIELD[key]?.hint || FIELD[key]?.label || "Symbol"} onClick={() => sortBy(key)}>
                    {name}{screen.sort.key === key ? (screen.sort.dir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="px-1" />
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, SHOW_MAX).map((r) => (
                <tr key={r.symbol} className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50" onClick={() => onPick(r.symbol)}>
                  <td className="max-w-[14rem] px-2 py-1">
                    <span className="font-semibold">{r.symbol}</span>
                    {r.options && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500" title="Options listed">OPT</span>}
                    <span className="ml-1.5 truncate text-[11px] text-slate-400" title={r.name}>{r.name.replace(/ (Common Stock|Class A Common Stock|Ordinary Shares)$/i, "").slice(0, 28)}</span>
                  </td>
                  {COLUMNS.slice(1).map(([key]) => <td key={key} className="whitespace-nowrap px-2 py-1 text-right">{cell(r, key)}</td>)}
                  <td className="px-1" onClick={(e) => e.stopPropagation()}>
                    {watch.includes(r.symbol) ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="In watchlist" />
                      : <button type="button" title="Add to watchlist" onClick={() => onAdd(r.symbol)} className="rounded p-0.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700"><Plus className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!universe.loading && universe.at && matches.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">Nothing matches every filter. Loosen one, or pick a ready-made screen.</p>}
          {!universe.at && universe.loading && <p className="px-3 py-6 text-center text-xs text-slate-500">Reading every listed share…</p>}
          {matches.length > SHOW_MAX && <p className="px-3 py-2 text-center text-[11px] text-slate-500">Showing the first {SHOW_MAX} of {matches.length.toLocaleString()}. Narrow the filters or sort differently to see others.</p>}
        </div>
        <p className="border-t border-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-400">
          {universe.at ? `Read ${new Date(universe.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })} New York. ` : ""}
          From your own Alpaca account: prices are the last trade (IEX, real time, pre-market and after hours included); volume and the day&apos;s candle are the consolidated tape{universe.dayFeed === "delayed_sip" ? ", 15 minutes delayed" : universe.dayFeed ? " (IEX only: this account cannot read the consolidated tape, so volumes are IEX's share)" : ""}; daily figures from consolidated daily candles. Market cap uses shares outstanding from the company&apos;s latest SEC filing; earnings dates from the earnings calendar. A screen is a filter, not a recommendation.
        </p>
      </section>
    </div>
  );
}
