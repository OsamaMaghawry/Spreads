import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Plus, Check, X, ChevronDown, ChevronRight, History } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import {
  decodeUniverse, screenRow, FIELDS, FIELD, GROUPS, parseAmount, cleanScreen, passes, sortRows, needsDaily,
  PRESETS, presetScreen, dailyCandidates, bigNumber, TREND_CHOICES, EMPTY_SCREEN, partialStats, fieldKnown, presetKnown
} from "@/lib/screener";
import { px, pctText } from "@/lib/terminal";
import { gapWindow, liveWindow, bySymbol } from "@/lib/news";

// The stock screener (24 Oct 2026: "Stock Screener, with some extensive
// filtrations like the advanced tools to see the stocks in play"). The whole
// listed US market, from the selected account's own Alpaca data, filtered as
// you type: ready-made screens for stocks in play on the left, every filter
// below them, the matches on the right. Click a row to chart and trade it.
// The arithmetic is lib/screener.js; the reads are functions/terminal "screen".
//
// Or a past day (25 Oct: "Historical screener to filter stock in history to
// get the criteria for the stocks in play at that period"): the market as it
// stood at that day's open or its close, only the figures known by then, and
// a Replay button on each row that opens the share in the bar replay at that
// day's open (several can be opened into the same replay).
//
// The News column counts each share's articles since the close before: on a
// past day, up to its open (or its close), so a gap's catalyst shows; click
// it for the headlines. Read for the first hundred rows on screen.

const SCREEN_KEY = "dm.screener.v1";
const DAILY_KEY = "dm.screener.daily.v1";
const SHOW_MAX = 300;
const DAILY_BATCH = 200;
const DAILY_PARALLEL = 2;
// A past day comes in parts (the server's time per request), two at a time,
// then the pre-market of its biggest gaps among liquid shares.
const HISTORY_PARTS = 4;
const PM_PICK = 300;
const PM_BATCH = 100;
const NEWS_ROWS = 100;
const NEWS_BATCH = 50;
const AUTO_MS = 60000;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* full or private */ } }
};
const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const nyYesterday = () => new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
// The last weekday before today, New York: where a past day starts.
const lastWeekday = () => {
  for (let back = 1; back < 8; back++) {
    const d = new Date(Date.now() - back * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
  return nyYesterday();
};

// The table's columns, live and on a past day at its open or close.
const COLUMN_SETS = {
  live: [
    ["symbol", "Symbol"], ["price", "Price"], ["changePct", "Chg %"], ["gapPct", "Gap %"], ["volume", "Volume"], ["relVol", "Rel vol"],
    ["dollarVol", "$ Vol"], ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"],
    ["vsSma50", "vs 50d"], ["perf1m", "1 month"], ["earningsIn", "Earnings"], ["news", "News"]
  ],
  open: [
    ["symbol", "Symbol"], ["price", "Open"], ["gapPct", "Gap %"], ["news", "News"], ["pmChangePct", "Pre-mkt %"], ["pmVolume", "Pre-mkt vol"], ["prevDollarVol", "$ Vol day before"],
    ["avgVol20", "Avg vol"], ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"], ["vsSma50", "vs 50d"], ["perf1m", "1 month"]
  ],
  close: [
    ["symbol", "Symbol"], ["price", "Close"], ["changePct", "Chg %"], ["gapPct", "Gap %"], ["news", "News"], ["volume", "Volume"], ["relVol", "Rel vol"], ["dollarVol", "$ Vol"],
    ["rangePos", "In range"], ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"], ["vsSma50", "vs 50d"], ["perf1m", "1 month"]
  ]
};
const SESSION = { bmo: "before open", amc: "after close", dmh: "in session" };

function cell(row, key) {
  const v = row[key];
  if (key === "symbol") return null;
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return <span className="text-slate-300">—</span>;
  if (key === "price") return px(v);
  if (key === "volume" || key === "pmVolume" || key === "avgVol20") return bigNumber(v);
  if (key === "dollarVol" || key === "marketCap" || key === "prevDollarVol" || key === "avgDollar20") return `$${bigNumber(v)}`;
  if (key === "relVol") return `${v.toFixed(2)}×`;
  if (key === "rsi") return v.toFixed(0);
  if (key === "earningsIn") return `${v === 0 ? "today" : `in ${v}d`}${row.earnSession ? ` · ${SESSION[row.earnSession] || ""}` : ""}`;
  if (FIELD[key]?.pct) {
    const tone = ["changePct", "gapPct", "pmChangePct", "perf1m", "fromVwap"].includes(key) ? (v >= 0 ? "text-emerald-700" : "text-rose-700") : "";
    return <span className={tone}>{key === "atrPct" ? `${(v * 100).toFixed(1)}%` : pctText(v)}</span>;
  }
  return String(v);
}

// A row's news count: still reading, none, or a count to open.
function newsCell(n, onOpen, open) {
  if (n === undefined) return <span className="text-slate-300">—</span>;
  if (n === null) return <span className="text-slate-300">…</span>;
  if (n.error) return <span className="text-rose-400" title={n.error}>!</span>;
  if (!n.items.length) return <span className="text-slate-300">0</span>;
  return (
    <button type="button" onClick={onOpen} title={n.items.slice(0, 3).map((a) => a.headline).join("\n")}
      className={`rounded px-1.5 font-semibold ${open ? "bg-sky-700 text-white" : "bg-sky-100 text-sky-800 hover:bg-sky-200"}`}>
      {n.items.length}{n.more ? "+" : ""}
    </button>
  );
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

export default function Screener({ accountId, active, watch, onPick, onAdd, onReplay = () => {} }) {
  const [universe, setUniverse] = useState({ rows: [], at: null, dayFeed: null, listed: 0, loading: false, error: null });
  const [daily, setDaily] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0, loading: false, error: null });
  const [screen, setScreen] = useState(() => {
    try { return cleanScreen(JSON.parse(store.get(SCREEN_KEY) || "null") || presetScreen("gainers")); } catch { return presetScreen("gainers"); }
  });
  const [preset, setPreset] = useState(() => { try { return JSON.parse(store.get(SCREEN_KEY) || "null")?.preset || "gainers"; } catch { return "gainers"; } });
  const [open, setOpen] = useState(() => new Set(["Price and volume", "Today"]));
  const [auto, setAuto] = useState(true);
  // On a phone the screens and filters fold away above the results (25 Oct:
  // "The screener dissapeared on phone"); on a wider screen they sit beside them.
  const [showFilters, setShowFilters] = useState(false);
  // The market now, or on a past day ("YYYY-MM-DD") at its open or close.
  const [when, setWhen] = useState({ date: "", asOf: "open" });
  const mode = when.date ? when.asOf : "live";
  const modeKey = `${when.date}|${when.asOf}`;
  const modeRef = useRef(modeKey);
  modeRef.current = modeKey;
  const pastDaily = useRef(new Map());
  const [pastPick, setPastPick] = useState(lastWeekday);
  const dailyRef = useRef({});
  const loadingDaily = useRef(false);

  useEffect(() => { store.set(SCREEN_KEY, JSON.stringify({ ...screen, preset })); }, [screen, preset]);

  // The day's cached daily numbers for this account, if any; a past day's
  // are kept while the page is open.
  useEffect(() => {
    loadingDaily.current = false;
    if (when.date) {
      const k = `${accountId}|${when.date}`;
      if (!pastDaily.current.has(k)) pastDaily.current.set(k, {});
      dailyRef.current = pastDaily.current.get(k);
    } else {
      try {
        const c = JSON.parse(store.get(DAILY_KEY) || "null");
        dailyRef.current = c && c.account === accountId && c.date === nyToday() ? c.stats || {} : {};
      } catch { dailyRef.current = {}; }
    }
    setDaily({ ...dailyRef.current });
    setProgress({ done: 0, total: 0, loading: false, error: null });
  }, [accountId, when.date]);

  // The daily numbers for the most traded shares, a batch at a time, kept
  // for the day: they change only after the close.
  const loadDaily = useCallback(async (rows) => {
    if (loadingDaily.current || !accountId) return;
    // Written into this moment's numbers only, and stopped if the moment changes.
    const target = dailyRef.current;
    const started = modeRef.current;
    const asOf = when.date;
    const want = dailyCandidates(rows).filter((s) => !(s in target));
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
      if (modeRef.current !== started) break;
      const read = (symbols) => invokeFunction("terminal", { action: "screen", stage: "daily", accountId, symbols, asOf: asOf || undefined })
        .then((r) => (r?.data?.stats && !r.data.error ? r.data.stats : Promise.reject(new Error(r?.data?.error || "No answer"))));
      const got = await Promise.all(batches.slice(i, i + DAILY_PARALLEL).map((symbols) =>
        read(symbols).catch(() => new Promise((ok) => setTimeout(ok, 4000)).then(() => read(symbols)))
          .catch((e) => { failed = String(e?.message || e); return {}; })));
      for (const stats of got) for (const [s, v] of Object.entries(stats)) target[s] = v;
      if (modeRef.current !== started) break;
      setDaily({ ...target });
      setProgress({ done: Object.keys(target).length, total, loading: true, error: null });
    }
    if (modeRef.current !== started) return;
    if (!asOf) store.set(DAILY_KEY, JSON.stringify({ account: accountId, date: nyToday(), stats: target }));
    setProgress({ done: Object.keys(target).length, total, loading: false, error: failed });
    loadingDaily.current = false;
  }, [accountId, when.date]);

  // A past day: its parts, then (at the open) the pre-market of the biggest
  // gaps among shares trading $1M a day, merged into the rows.
  const readPast = useCallback(async () => {
    const ask = (body) => invokeFunction("terminal", { action: "screen", accountId, ...body })
      .then((r) => (r?.data && !r.data.error ? r.data : Promise.reject(new Error(r?.data?.error || "No answer"))));
    const once = (body) => ask(body).catch(() => new Promise((ok) => setTimeout(ok, 2000)).then(() => ask(body)));
    const got = [];
    for (let i = 0; i < HISTORY_PARTS; i += 2) {
      got.push(...await Promise.all([i, i + 1].filter((k) => k < HISTORY_PARTS)
        .map((part) => once({ stage: "history", date: when.date, asOf: when.asOf, part, parts: HISTORY_PARTS }))));
    }
    const rows = got.flatMap((d) => decodeUniverse(d));
    if (!rows.length) throw new Error(`No trading on ${when.date}: a weekend or a market holiday.`);
    let premarket = null;
    if (when.asOf === "open") {
      const gap = (u) => (u.prevClose ? Math.abs(u.open / u.prevClose - 1) : 0);
      const picks = rows.filter((u) => u.prevClose >= 1 && (u.avgDollar20 || 0) >= 1e6).sort((a, b) => gap(b) - gap(a)).slice(0, PM_PICK).map((u) => u.symbol);
      const batches = [];
      for (let i = 0; i < picks.length; i += PM_BATCH) batches.push(picks.slice(i, i + PM_BATCH));
      const pm = Object.assign({}, ...(await Promise.all(batches.map((symbols) => once({ stage: "premarket", date: when.date, symbols }).then((d) => d.pm).catch(() => ({}))))));
      for (const u of rows) if (pm[u.symbol]) Object.assign(u, pm[u.symbol]);
      premarket = Object.keys(pm).length;
    }
    return { rows, at: got[0].at, dayFeed: got[0].dayFeed, listed: got[0].listed, premarket };
  }, [accountId, when.date, when.asOf]);

  const refresh = useCallback(() => {
    if (!accountId) return;
    const started = modeRef.current;
    setUniverse((u) => ({ ...u, loading: true, error: null }));
    const read = when.date ? readPast() : invokeFunction("terminal", { action: "screen", accountId }).then((r) => {
      if (r?.data?.error || !r?.data?.rows) throw new Error(r?.data?.error || "The screen could not be read.");
      return { rows: decodeUniverse(r.data), at: r.data.at, dayFeed: r.data.dayFeed, listed: r.data.listed, premarket: null };
    });
    read.then((d) => {
      if (modeRef.current !== started) return;
      setUniverse({ ...d, loading: false, error: null, mode: started });
      loadDaily(d.rows.map((u) => screenRow(u, when.date ? partialStats(u) : null, when.date || nyToday())));
    }).catch((e) => {
      if (modeRef.current !== started) return;
      setUniverse((u) => ({ ...u, rows: when.date ? [] : u.rows, loading: false, error: String(e?.message || e) }));
    });
  }, [accountId, loadDaily, readPast, when.date]);

  // Read when first opened (and for each moment chosen), then, live, every
  // minute while on screen.
  useEffect(() => {
    if (!active || !accountId) return undefined;
    if (universe.mode !== modeKey) { setUniverse((u) => ({ ...u, rows: [], at: null, mode: modeKey })); refresh(); }
    if (!auto || when.date) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, AUTO_MS);
    return () => clearInterval(t);
  }, [active, accountId, auto, refresh, modeKey]);

  const today = when.date || nyToday();
  const rows = useMemo(() => universe.rows.map((u) => screenRow(u, daily[u.symbol] || (when.date ? partialStats(u) : null), today)), [universe.rows, daily, today, when.date]);
  // Filters on figures this moment does not know are set aside, and said so.
  const ignored = Object.keys(screen.ranges).filter((id) => !fieldKnown(id, mode));
  const effective = useMemo(() => {
    const ranges = Object.fromEntries(Object.entries(screen.ranges).filter(([id]) => fieldKnown(id, mode)));
    return { ...screen, ranges, sort: fieldKnown(screen.sort.key, mode) ? screen.sort : { key: "gapPct", dir: "desc" } };
  }, [screen, mode]);
  const matches = useMemo(() => sortRows(rows.filter((r) => passes(r, effective)), effective.sort), [rows, effective]);
  const COLUMNS = COLUMN_SETS[mode];

  // Each share's news since the close before (live: until now, in five-minute
  // steps; a past day: to its open or its close), for the rows on screen.
  const lastDate = useMemo(() => universe.rows.find((u) => u.lastDate)?.lastDate || null, [universe.rows]);
  const newsWin = useMemo(() => {
    if (when.date) return lastDate ? gapWindow(when.date, lastDate, when.asOf) : null;
    if (!universe.at) return null;
    const w = liveWindow(Date.parse(universe.at) / 1000);
    return { ...w, end: Math.floor(w.end / 300) * 300 };
  }, [when.date, when.asOf, lastDate, universe.at]);
  const newsKey = newsWin ? `${newsWin.start}|${newsWin.end}` : "";
  const newsRef = useRef({ key: "", by: {} });
  const [, setNewsTick] = useState(0);
  const [openNews, setOpenNews] = useState(null);
  const shownSymbols = matches.slice(0, NEWS_ROWS).map((r) => r.symbol).join(",");
  useEffect(() => {
    if (!active || !accountId || !newsWin || !shownSymbols) return;
    if (newsRef.current.key !== newsKey) newsRef.current = { key: newsKey, by: {} };
    const by = newsRef.current.by;
    const want = shownSymbols.split(",").filter((sym) => !(sym in by));
    if (!want.length) return;
    for (const sym of want) by[sym] = null;
    setNewsTick((n) => n + 1);
    const key = newsKey;
    for (let i = 0; i < want.length; i += NEWS_BATCH) {
      const batch = want.slice(i, i + NEWS_BATCH);
      invokeFunction("terminal", { action: "news", accountId, symbols: batch, start: new Date(newsWin.start * 1000).toISOString(), end: new Date(newsWin.end * 1000).toISOString(), sort: "desc", max: 500 })
        .then((r) => {
          if (newsRef.current.key !== key) return;
          if (r?.data?.error) { for (const sym of batch) by[sym] = { error: r.data.error, items: [] }; return; }
          const found = bySymbol(r?.data?.news || [], batch);
          for (const sym of batch) by[sym] = { items: found[sym], more: !!r?.data?.truncated };
        })
        .catch(() => { for (const sym of batch) if (newsRef.current.key === key) delete by[sym]; })
        .finally(() => setNewsTick((n) => n + 1));
    }
  }, [active, accountId, newsKey, shownSymbols]);
  const newsOf = (sym) => (newsRef.current.key === newsKey ? newsRef.current.by[sym] : undefined);
  const newsWhen = newsWin
    ? `${new Date(newsWin.start * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} to ${when.date ? new Date(newsWin.end * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "now"} New York`
    : "";
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
    <div className="flex min-h-[70vh] flex-col gap-2 text-slate-800 md:flex-row">
      <button type="button" onClick={() => setShowFilters((v) => !v)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium md:hidden">
        {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Screens and filters{presetInfo ? ` · ${presetInfo.label}` : ""}{activeRanges.length ? ` · ${activeRanges.length} filter${activeRanges.length === 1 ? "" : "s"}` : ""}
      </button>
      <aside className={`${showFilters ? "flex" : "hidden"} max-h-[70vh] w-full shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white md:flex md:max-h-none md:w-72`}>
        <div className="border-b border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">Stocks in play</div>
        <div className="grid grid-cols-2 gap-1 px-2">
          {PRESETS.filter((p) => mode !== "live" || presetKnown(p, "live")).map((p) => {
            const known = presetKnown(p, mode);
            return (
              <button key={p.id} type="button" disabled={!known} title={known ? p.note : `${p.note}. Needs the whole day: choose "At the close".`} onClick={() => { choosePreset(p.id); setShowFilters(false); }}
                className={`rounded border px-1.5 py-1 text-left text-[11px] disabled:opacity-40 ${preset === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {p.label}
              </button>
            );
          })}
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
              {open.has(g) && FIELDS.filter((f) => f.group === g && fieldKnown(f.id, mode)).map((f) => <RangeRow key={f.id} field={f} value={screen.ranges[f.id]} onChange={setRange} />)}
            </div>
          ))}
          <p className="px-1 pt-1 text-[10px] leading-snug text-slate-400">Type 500k, 2.5m or 1b for amounts; percentages as numbers (3 for 3%). Hover a filter for what it measures.</p>
        </div>
      </aside>

      <section className="flex min-h-[60vh] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className={`flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs ${when.date ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
          <div className="flex rounded border border-slate-300 bg-white" role="group" aria-label="When">
            <button type="button" onClick={() => setWhen((w) => ({ ...w, date: "" }))} className={`px-2 py-0.5 ${!when.date ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Live</button>
            <button type="button" onClick={() => setWhen((w) => ({ ...w, date: pastPick }))} className={`px-2 py-0.5 ${when.date ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>A past day</button>
          </div>
          {when.date && (
            <>
              <input type="date" aria-label="Past day" value={pastPick} min="2016-01-04" max={nyYesterday()} onChange={(e) => setPastPick(e.target.value)}
                className="rounded border border-amber-300 bg-white px-1 py-0.5" />
              {pastPick !== when.date && pastPick && <button type="button" onClick={() => setWhen((w) => ({ ...w, date: pastPick }))} className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700">Screen this day</button>}
              <div className="flex rounded border border-amber-300 bg-white" role="group" aria-label="At the open or the close">
                {[["open", "At the open"], ["close", "At the close"]].map(([id, name]) => (
                  <button key={id} type="button" onClick={() => setWhen((w) => ({ ...w, asOf: id }))}
                    title={id === "open" ? "As it stood at 9:30: the gap, the pre-market and the days before. Nothing the day went on to do." : "The whole day: its move, volume and range. Hindsight: you know how the day ended."}
                    className={`px-2 py-0.5 ${when.asOf === id ? "bg-amber-600 text-white" : "text-amber-900 hover:bg-amber-100"}`}>{name}</button>
                ))}
              </div>
              <span className="text-[11px] text-amber-900">{new Date(`${when.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
            </>
          )}
        </div>
        {ignored.length > 0 && (
          <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-amber-800">
            Set aside {mode === "open" ? "at the open" : "on a past day"}, not known then: {ignored.map((id) => FIELD[id].label).join(", ")}.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-1.5 text-xs">
          <span className="font-semibold">{matches.length.toLocaleString()} match{matches.length === 1 ? "" : "es"}</span>
          <span className="text-slate-500">of {rows.length.toLocaleString()} {when.date ? "shares that traded that day" : "listed shares"}{presetInfo ? ` · ${presetInfo.note}` : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            {!when.date && <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Every minute</label>}
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
                  <th key={key} className={`whitespace-nowrap px-2 py-1 font-medium ${key === "news" ? "" : "cursor-pointer hover:text-slate-900"} ${key === "symbol" ? "text-left" : "text-right"}`}
                    title={key === "news" ? `Articles naming the share, ${newsWhen}. Click a count for the headlines.` : FIELD[key]?.hint || FIELD[key]?.label || "Symbol"} onClick={() => key !== "news" && sortBy(key)}>
                    {name}{screen.sort.key === key ? (screen.sort.dir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="px-1" />
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, SHOW_MAX).map((r) => (
                <Fragment key={r.symbol}>
                <tr className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50" onClick={() => onPick(r.symbol)}>
                  <td className="max-w-[14rem] px-2 py-1">
                    <span className="font-semibold">{r.symbol}</span>
                    {r.options && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500" title="Options listed">OPT</span>}
                    <span className="ml-1.5 truncate text-[11px] text-slate-400" title={r.name}>{r.name.replace(/ (Common Stock|Class A Common Stock|Ordinary Shares)$/i, "").slice(0, 28)}</span>
                  </td>
                  {COLUMNS.slice(1).map(([key]) => (key === "news"
                    ? <td key={key} className="whitespace-nowrap px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>{newsCell(newsOf(r.symbol), () => setOpenNews(openNews === r.symbol ? null : r.symbol), openNews === r.symbol)}</td>
                    : <td key={key} className="whitespace-nowrap px-2 py-1 text-right">{cell(r, key)}</td>))}
                  <td className="whitespace-nowrap px-1" onClick={(e) => e.stopPropagation()}>
                    {when.date && (
                      <button type="button" title={`Replay ${r.symbol} from ${when.date}, 9:30 New York (or add it to the replay running)`} aria-label={`Replay ${r.symbol}`}
                        onClick={() => onReplay(r.symbol, when.date)} className="mr-1 rounded p-0.5 text-amber-600 hover:bg-amber-100"><History className="h-3.5 w-3.5" /></button>
                    )}
                    {watch.includes(r.symbol) ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="In watchlist" />
                      : <button type="button" title="Add to watchlist" onClick={() => onAdd(r.symbol)} className="rounded p-0.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700"><Plus className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
                {openNews === r.symbol && newsOf(r.symbol)?.items && (
                  <tr className="bg-slate-50">
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-1.5">
                      <div className="mb-1 text-[10px] text-slate-500">{r.symbol} news, {newsWhen}</div>
                      {newsOf(r.symbol).items.length === 0 ? <p className="text-[11px] text-slate-500">None.</p> : newsOf(r.symbol).items.slice(0, 12).map((a) => (
                        <div key={a.id} className="flex gap-2 py-0.5 text-[11px]">
                          <span className="w-28 shrink-0 tabular-nums text-slate-500">{new Date(a.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-slate-800 hover:text-emerald-800 hover:underline">{a.headline}</a>
                          {a.source && <span className="shrink-0 text-[10px] uppercase text-slate-400">{a.source}</span>}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!universe.loading && universe.at && matches.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">Nothing matches every filter. Loosen one, or pick a ready-made screen.</p>}
          {!universe.at && universe.loading && <p className="px-3 py-6 text-center text-xs text-slate-500">{when.date ? `Reading every listed share on ${when.date}: about ten seconds the first time.` : "Reading every listed share…"}</p>}
          {matches.length > SHOW_MAX && <p className="px-3 py-2 text-center text-[11px] text-slate-500">Showing the first {SHOW_MAX} of {matches.length.toLocaleString()}. Narrow the filters or sort differently to see others.</p>}
        </div>
        {when.date ? (
          <p className="border-t border-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-400">
            {when.date} {when.asOf === "open" ? "at the open: the opening price and gap; pre-market (4:00 to 9:30) for the biggest gaps among shares trading $1M a day" : "at the close: the whole day"}; averages, RSI and 52-week figures from the days before. From your own Alpaca account, consolidated daily candles{universe.dayFeed && universe.dayFeed !== "sip" ? " (IEX only: this account cannot read the consolidated tape)" : ""}. Only shares listed today are included, so companies delisted since are missing; names, market cap (today&apos;s shares outstanding) and options are today&apos;s. A screen is a filter, not a recommendation.
          </p>
        ) : <p className="border-t border-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-400">
          {universe.at ? `Read ${new Date(universe.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })} New York. ` : ""}
          From your own Alpaca account: prices are the last trade (IEX, real time, pre-market and after hours included); volume and the day&apos;s candle are the consolidated tape{universe.dayFeed === "delayed_sip" ? ", 15 minutes delayed" : universe.dayFeed ? " (IEX only: this account cannot read the consolidated tape, so volumes are IEX's share)" : ""}; daily figures from consolidated daily candles. Market cap uses shares outstanding from the company&apos;s latest SEC filing; earnings dates from the earnings calendar. A screen is a filter, not a recommendation.
        </p>}
      </section>
    </div>
  );
}
