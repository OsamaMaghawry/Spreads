import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Plus, Check, X, ChevronDown, ChevronRight, History, LineChart } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { readPref, savePref } from "@/lib/terminalPrefs";
import {
  decodeUniverse, uniqueBySymbol, screenRow, FIELDS, FIELD, fieldLabel, fieldHint, GROUPS, parseAmount, cleanScreen, passes, sortRows, needsDaily,
  PRESETS, dailyCandidates, bigNumber, TREND_CHOICES, EMPTY_SCREEN, partialStats, fieldKnown, presetKnown, combineScreens, conflicts, premarketPicks, afterHoursPicks
} from "@/lib/screener";
import { px, pctText } from "@/lib/terminal";
import { gammaFields } from "@/lib/gexScreen";
import { money } from "@/lib/gex";
import { gapWindow, liveWindow, bySymbol, quietWindow, settleQuiet } from "@/lib/news";
import { SESSION_KINDS, dayTag } from "@/lib/sessions";

// The stock screener (24 Oct 2026: "Stock Screener, with some extensive
// filtrations like the advanced tools to see the stocks in play"). The whole
// listed US market, from the selected account's own Alpaca data, filtered as
// you type: ready-made screens for stocks in play on the left, every filter
// below them, the matches on the right. Click a row to chart and trade it.
// The ready-made screens switch on and off, any number at once, and every
// condition of each, and of your own filters, must hold (25 Oct: "Make no Or
// in the screener. All should be and and I filter whatever I want").
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
//
// Before the open (26 Oct, 5:50 New York: "Screener is not working", every
// screen on today's volume empty because there was none yet), today's volume
// is the pre-market's: read for the biggest moves and the most traded shares,
// again every five minutes until it reaches 9:30, and kept for the day.

const SCREEN_KEY = "dm.screener.v1";
const DAILY_KEY = "dm.screener.daily.v1";
const SHOW_MAX = 300;
const DAILY_BATCH = 200;
const DAILY_PARALLEL = 2;
// A past day comes in parts (the server's time per request), two at a time,
// then the pre-market of its biggest gaps among liquid shares.
const HISTORY_PARTS = 4;
// Today's screen in parts read side by side: whole, it ran past the server's
// processing time on a fresh start (29 Oct: "Edge Function returned a non-2xx
// status code"). Share counts are read on their own and kept for hours.
const UNIVERSE_PARTS = 4;
const SHARES_KEEP_MS = 6 * 3600000;
const PM_PICK = 300;
const PM_BATCH = 100;
const PM_ACTIVE = 100;
const PM_EVERY = 5 * 60000;
const NEWS_ROWS = 100;
const NEWS_BATCH = 50;
// "No news in the last N days": the news is read for this many matches, in
// the screen's order.
const QUIET_ROWS = 300;
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

// Gamma's columns (8 Nov, the approved design), live only: worked out each
// morning (lib/gexScreen.js), read at the price now.
const GAMMA_COLUMNS = [["gexSign", "Gamma"], ["gexNet", "Net gamma"], ["gexHedge", "Hedge vs vol"], ["gexToFlip", "To flip"], ["gexToCall", "Call wall"], ["gexToPut", "Put wall"]];
const GAMMA_KEYS = new Set(GAMMA_COLUMNS.map(([k]) => k));
const GAMMA_REFRESH_MS = 10 * 60000;

// The table's columns, live and on a past day at its open or close.
const COLUMN_SETS = {
  live: [
    ["symbol", "Symbol"], ["price", "Price"], ["changePct", "Chg %"], ["gapPct", "Gap %"], ["volume", "Volume"], ["relVol", "Rel vol"],
    ["dollarVol", "$ Vol"], ...GAMMA_COLUMNS, ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"],
    ["vsSma50", "vs 50d"], ["perf1m", "1 month"], ["earningsIn", "Earnings"], ["pmChangePct", "Pre-mkt %"], ["pmVolume", "Pre-mkt vol"],
    ["ahChangePct", "After-hrs %"], ["ahVolume", "After-hrs vol"], ["onChangePct", "Overnight %"], ["onVolume", "Overnight vol"], ["news", "News"]
  ],
  // Live before the open: the move so far is the gap.
  preOpen: [
    ["symbol", "Symbol"], ["price", "Price"], ["changePct", "Pre-mkt %"], ["news", "News"], ["volume", "Pre-mkt vol"], ["dollarVol", "Pre-mkt $ vol"], ["ahChangePct", "After-hrs %"], ["ahVolume", "After-hrs vol"], ["onChangePct", "Overnight %"], ["onVolume", "Overnight vol"], ["prevDollarVol", "$ Vol day before"],
    ...GAMMA_COLUMNS, ["relVol", "Rel vol"], ["marketCap", "Mkt cap"], ["rsi", "RSI"], ["atrPct", "ATR %"], ["fromHigh52", "vs 52w high"], ["vsSma50", "vs 50d"], ["perf1m", "1 month"], ["earningsIn", "Earnings"]
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
  if (key === "gexSign") return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${v < 0 ? "bg-rose-50 text-rose-800" : "bg-blue-50 text-blue-800"}`}>{v < 0 ? "Negative" : "Positive"}</span>;
  if (key === "gexNet") return <span className={v < 0 ? "text-rose-700" : "text-blue-800"}>{money(v)}</span>;
  if (key === "gexHedge") return <span className={`font-semibold ${v < 0 ? "text-rose-700" : "text-blue-800"}`}>{pctText(v)}</span>;
  if (key === "gexToFlip") return <span title={`Flip at ${px(row.gexFlip)}`} className={Math.abs(v) <= 0.01 ? "rounded bg-violet-100 px-1 font-semibold text-violet-900" : ""}>{pctText(v)}</span>;
  if (key === "gexToCall" || key === "gexToPut") {
    const level = key === "gexToCall" ? row.gexCallWall : row.gexPutWall;
    return <span title={`${pctText(v)} from the price`}>{px(level)} <span className="text-slate-400">({pctText(v)})</span></span>;
  }
  if (key === "price") return px(v);
  if (FIELD[key]?.unit === "shares") return bigNumber(v);
  if (FIELD[key]?.session && FIELD[key].unit === "$") return px(v);
  if (key === "dollarVol" || key === "marketCap" || key === "prevDollarVol" || key === "avgDollar20") return `$${bigNumber(v)}`;
  if (key === "relVol") return `${v.toFixed(2)}×`;
  if (key === "rsi") return v.toFixed(0);
  if (key === "earningsIn") return `${v === 0 ? "today" : `in ${v}d`}${row.earnSession ? ` · ${SESSION[row.earnSession] || ""}` : ""}`;
  if (FIELD[key]?.pct) {
    const tone = ["changePct", "gapPct", "perf1m", "fromVwap"].includes(key) || FIELD[key].session ? (v >= 0 ? "text-emerald-700" : "text-rose-700") : "";
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

// No news in the last N days: whole days, 1 to 90; empty for off.
function QuietRow({ days, onChange }) {
  const [text, setText] = useState(days ?? "");
  useEffect(() => { setText(days ?? ""); }, [days]);
  const set = (t) => {
    setText(t);
    const n = Number(t);
    if (!t.trim()) onChange(null);
    else if (Number.isInteger(n) && n >= 1 && n <= 90) onChange(n);
  };
  return (
    <div className={`flex items-center gap-1 rounded px-1 py-0.5 ${days ? "bg-emerald-50" : ""}`}>
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title="Leaves out shares named in any news article, earnings reports included, in this many calendar days up to the screen's moment. Market roundups naming more than five shares (stocks moving pre-market, earnings calendars) do not count.">No news in the last</span>
      <input value={text} onChange={(e) => set(e.target.value)} placeholder="days" inputMode="numeric" aria-label="No news in the last days"
        className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] tabular-nums focus:border-emerald-500 focus:outline-none" />
      <span className="text-[10px] text-slate-400">days</span>
    </div>
  );
}

// One filter's minimum and maximum, as typed ("500k", "2.5m", "3").
function RangeRow({ field, value, onChange, preOpen = false, days = null }) {
  const label = fieldLabel(field, preOpen, days);
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
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={fieldHint(field, preOpen, days)}>{label}</span>
      {["min", "max"].map((side) => (
        <input key={side} value={text[side]} onChange={(e) => set(side, e.target.value)} placeholder={side} aria-label={`${label} ${side}`}
          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] tabular-nums focus:border-emerald-500 focus:outline-none" />
      ))}
      <span className="w-3 text-[10px] text-slate-400">{unit}</span>
    </div>
  );
}

export default function Screener({ accountId, active, watch, onPick, onAdd, onReplay = () => {}, onGamma = null }) {
  const [universe, setUniverse] = useState({ rows: [], at: null, dayFeed: null, listed: 0, loading: false, error: null });
  const [daily, setDaily] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0, loading: false, error: null });
  // Your own filters (`screen`) and the ready-made screens switched on
  // (`presets`). A screen saved before they combined held its one ready-made
  // screen's figures as filters: those become the ready-made screen again.
  const [saved] = useState(() => { try { return JSON.parse(store.get(SCREEN_KEY) || "null"); } catch { return null; } });
  const [screen, setScreen] = useState(() => {
    const fresh = cleanScreen({ ...EMPTY_SCREEN, sort: { key: "changePct", dir: "desc" } });
    if (!saved) return fresh;
    if (!Array.isArray(saved.presets) && saved.preset) return cleanScreen({ ...EMPTY_SCREEN, sort: saved.sort });
    return cleanScreen(saved);
  });
  const [presets, setPresets] = useState(() => {
    const ids = !saved ? ["gainers"] : Array.isArray(saved.presets) ? saved.presets : saved.preset ? [saved.preset] : [];
    return ids.filter((id) => PRESETS.some((p) => p.id === id));
  });
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

  // Kept with the account too ("screener", lib/terminalPrefs.js), as every
  // terminal setting is: the account's copy replaces this browser's once
  // read, unless the filters were changed meanwhile; this browser's is sent
  // up when the account has none.
  const screenSynced = useRef(false);
  const screenTouched = useRef(false);
  const screenFirst = useRef(true);
  useEffect(() => {
    let alive = true;
    readPref("screener").then((v) => {
      if (!alive) return;
      screenSynced.current = true;
      if (screenTouched.current) return;
      if (v && typeof v === "object") {
        setScreen(cleanScreen(v));
        setPresets((Array.isArray(v.presets) ? v.presets : []).filter((id) => PRESETS.some((p) => p.id === id)));
      } else if (saved) savePref("screener", { ...screen, presets });
    }).catch(() => { screenSynced.current = true; });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    store.set(SCREEN_KEY, JSON.stringify({ ...screen, presets }));
    if (screenFirst.current) { screenFirst.current = false; return; }
    if (!screenSynced.current) screenTouched.current = true;
    savePref("screener", { ...screen, presets });
  }, [screen, presets]);

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
    const rows = uniqueBySymbol(got.flatMap((d) => decodeUniverse(d)));
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

  const sharesRef = useRef(null);
  const readToday = useCallback(async () => {
    const ask = (part) => invokeFunction("terminal", { action: "screen", accountId, part, parts: UNIVERSE_PARTS })
      .then((r) => (r?.data?.rows && !r.data.error ? r.data : Promise.reject(new Error(r?.data?.error || "The screen could not be read."))));
    const once = (part) => ask(part).catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(() => ask(part)));
    const kept = sharesRef.current && Date.now() - sharesRef.current.at < SHARES_KEEP_MS ? sharesRef.current.map : null;
    const sharesRead = kept ? Promise.resolve(kept) : invokeFunction("terminal", { action: "screen", stage: "shares", accountId })
      .then((r) => {
        const map = r?.data?.shares && Object.keys(r.data.shares).length ? r.data.shares : null;
        if (map) sharesRef.current = { at: Date.now(), map };
        return map;
      }).catch(() => null);
    const [settled, shares] = await Promise.all([Promise.allSettled([...Array(UNIVERSE_PARTS).keys()].map(once)), sharesRead]);
    const got = settled.filter((x) => x.status === "fulfilled").map((x) => x.value);
    if (!got.length) throw settled[0].reason;
    const rows = uniqueBySymbol(got.flatMap((d) => decodeUniverse(d)));
    if (shares) for (const u of rows) if (u.shares == null && shares[u.symbol]) u.shares = shares[u.symbol];
    const missing = settled.length - got.length;
    return {
      rows, at: got.map((d) => d.at).sort().pop(), dayFeed: got[0].dayFeed, listed: got.reduce((n, d) => n + (Number(d.listed) || 0), 0), premarket: null,
      warning: missing ? `${missing} of ${settled.length} parts of the market could not be read just now; showing the rest. It is read again in a minute.` : null
    };
  }, [accountId]);

  const refresh = useCallback(() => {
    if (!accountId) return;
    const started = modeRef.current;
    setUniverse((u) => ({ ...u, loading: true, error: null }));
    const read = when.date ? readPast() : readToday();
    read.then((d) => {
      if (modeRef.current !== started) return;
      setUniverse({ ...d, loading: false, error: d.warning || null, mode: started });
      loadDaily(d.rows.map((u) => screenRow(u, when.date ? partialStats(u) : null, when.date || nyToday())));
    }).catch((e) => {
      if (modeRef.current !== started) return;
      setUniverse((u) => ({ ...u, rows: when.date ? [] : u.rows, loading: false, error: String(e?.message || e) }));
    });
  }, [accountId, loadDaily, readPast, readToday, when.date]);

  // Read when first opened (and for each moment chosen), then, live, every
  // minute while on screen.
  useEffect(() => {
    if (!active || !accountId) return undefined;
    if (universe.mode !== modeKey) { setUniverse((u) => ({ ...u, rows: [], at: null, mode: modeKey })); refresh(); }
    if (!auto || when.date) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, AUTO_MS);
    return () => clearInterval(t);
  }, [active, accountId, auto, refresh, modeKey]);

  // Each session's latest, live (10 Nov, the owner: "every time or every
  // session I can filter correctly ... I need it accurate"): overnight,
  // pre-market, regular and after hours (lib/sessions.js, functions/terminal
  // "session"), read for the biggest movers and the most traded (overnight:
  // among the shares Alpaca trades overnight; after hours: and those reporting
  // after the close); again every five minutes while a session runs, and when
  // the next of its kind begins. One kind at a time, to spare the data limit.
  const [sess, setSess] = useState({});
  const sessBusy = useRef(false);
  const [sessTick, setSessTick] = useState(0);
  useEffect(() => {
    if (when.date || !active || !accountId) return undefined;
    const t = setInterval(() => setSessTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, [when.date, active, accountId]);
  useEffect(() => {
    if (when.date || !active || !accountId || !universe.rows.length || sessBusy.current) return;
    const now = Date.now();
    const due = SESSION_KINDS.filter((kind) => {
      const x = sess[kind];
      if (!x || x.account !== accountId) return true;
      if (x.next && now >= x.next) return true;
      return !x.complete && now - x.at >= PM_EVERY;
    });
    if (!due.length) return;
    const day = nyToday();
    const base = universe.rows.map((u) => screenRow(u, null, day));
    sessBusy.current = true;
    (async () => {
      for (const kind of due) {
        const pool = kind === "overnight" ? base.filter((r) => r.overnight) : base;
        const picks = kind === "regular" || kind === "afterhours" ? afterHoursPicks(pool, day, PM_PICK, PM_ACTIVE) : premarketPicks(pool, PM_PICK, PM_ACTIVE);
        const batches = [];
        for (let i = 0; i < picks.length; i += PM_BATCH) batches.push(picks.slice(i, i + PM_BATCH));
        if (!batches.length) batches.push([]);
        setSess((p) => ({ ...p, [kind]: { ...(p[kind] || { account: accountId, by: {}, complete: false, at: 0 }), loading: true } }));
        const got = (await Promise.all(batches.map((symbols) => invokeFunction("terminal", { action: "screen", stage: "session", kind, accountId, symbols })
          .then((r) => (r?.data && !r.data.error && r.data.session ? r.data : null)).catch(() => null)))).filter(Boolean);
        setSess((p) => {
          const was = p[kind];
          if (!got.length) return { ...p, [kind]: { ...(was || { account: accountId, by: {}, complete: false }), at: Date.now(), loading: false } };
          const session = got[0].session;
          const same = was && was.account === accountId && was.session?.date === session.date;
          const by = { ...(same ? was.by : {}) };
          for (const g of got) Object.assign(by, g.stats || {});
          return {
            ...p,
            [kind]: {
              account: accountId, session, current: got[0].sessions?.current ?? null, next: got[0].sessions?.next?.[kind] ?? null, by,
              through: got.map((g) => g.through).filter(Boolean).sort().at(-1) || null,
              complete: got.length === batches.length && got.every((g) => g.complete), at: Date.now(), loading: false
            }
          };
        });
      }
    })().finally(() => { sessBusy.current = false; });
  }, [active, accountId, when.date, universe.at, universe.rows, sess, sessTick]);

  // Gamma: each share's latest morning figures (functions/terminal
  // "gexScreen"), read again every ten minutes while today's run fills in.
  const [gamma, setGamma] = useState({ by: {}, today: null, day: null });
  useEffect(() => {
    if (!active || when.date) return undefined;
    let alive = true;
    const read = () => invokeFunction("terminal", { action: "gexScreen" })
      .then((r) => {
        if (!alive || r?.data?.error || !Array.isArray(r?.data?.rows)) return;
        const by = {};
        for (const [symbol, day, , summary] of r.data.rows) if (summary) by[symbol] = { ...summary, day };
        setGamma({ by, today: r.data.today || null, day: r.data.day || null });
      })
      .catch(() => {});
    read();
    const t = setInterval(() => { if (document.visibilityState === "visible") read(); }, GAMMA_REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [active, when.date]);

  const today = when.date || nyToday();
  // Each session's figures merged into the rows; today's pre-market is also
  // the day's volume before the open (screenRow).
  const live = (kind) => (!when.date && sess[kind]?.account === accountId ? sess[kind] : null);
  const pmNow = live("premarket")?.session?.date === today ? live("premarket") : null;
  const sessionDays = useMemo(() => (when.date ? { premarket: dayTag(when.date) }
    : Object.fromEntries(SESSION_KINDS.map((k) => [k, sess[k]?.account === accountId && sess[k].session?.date ? dayTag(sess[k].session.date) : null]))), [sess, accountId, when.date]);
  const rows = useMemo(() => universe.rows.map((u) => {
    let x = u;
    if (!when.date) {
      const got = {};
      for (const kind of SESSION_KINDS) {
        const v = sess[kind]?.account === accountId ? sess[kind].by[u.symbol] : null;
        if (v) got[kind] = v;
      }
      x = { ...u, sess: got };
      if (pmNow && got.premarket) x = { ...x, pmVolume: got.premarket.v, pmLast: got.premarket.last };
    }
    const row = screenRow(x, daily[u.symbol] || (when.date ? partialStats(u) : null), today);
    // Gamma at the price now, live only.
    const g = !when.date ? gamma.by[u.symbol] : null;
    return g ? { ...row, ...gammaFields(g, row.price, row.avgDollar20) } : row;
  }), [universe.rows, daily, today, when.date, sess, accountId, pmNow, gamma.by]);
  // Live before the open (most rows' day candle still the last session's).
  const preOpen = !when.date && rows.length > 0 && rows.filter((r) => r.preOpen).length > rows.length / 2;
  const lastSession = preOpen ? universe.rows.find((u) => u.day)?.day : null;
  // Filters on figures this moment does not know are set aside, and said so.
  // Everything switched on, as one screen: all must hold.
  const combined = useMemo(() => combineScreens(screen, presets), [screen, presets]);
  const ignored = Object.keys(combined.ranges).filter((id) => !fieldKnown(id, mode));
  const effective = useMemo(() => {
    const ranges = Object.fromEntries(Object.entries(combined.ranges).filter(([id]) => fieldKnown(id, mode)));
    return { ...combined, ranges, sort: fieldKnown(combined.sort.key, mode) ? combined.sort : { key: "gapPct", dir: "desc" } };
  }, [combined, mode]);
  const clash = conflicts(effective);
  const matches = useMemo(() => sortRows(rows.filter((r) => passes(r, effective)), effective.sort), [rows, effective]);

  // No news in the last N days (10 Nov, the owner: "I want something that has
  // no news over the last 3-4 days, 5 days, 10 days ... I need it to work in
  // the past"): N calendar days back from the screen's moment (a past day's
  // open or close, or now), every article naming the share in the account's
  // Alpaca news, earnings reports among them. Read for the first QUIET_ROWS
  // matches; a batch whose articles run past the limit before naming a share
  // asks about that share again in a smaller one, so a busy name never hides
  // a quiet one's article.
  const quietWin = useMemo(() => {
    if (!screen.quietDays) return null;
    if (when.date) return quietWindow(when.date, when.asOf, screen.quietDays);
    return universe.at ? quietWindow(null, null, screen.quietDays, Math.floor(Date.parse(universe.at) / 300000) * 300) : null;
  }, [screen.quietDays, when.date, when.asOf, universe.at]);
  const quietKey = quietWin ? `${quietWin.start}|${quietWin.end}` : "";
  const quietRef = useRef({ key: "", by: {}, error: null });
  const [, setQuietTick] = useState(0);
  const quietAsk = quietWin ? matches.slice(0, QUIET_ROWS).map((r) => r.symbol).join(",") : "";
  useEffect(() => {
    if (!active || !accountId || !quietWin || !quietAsk) return;
    if (quietRef.current.key !== quietKey) quietRef.current = { key: quietKey, by: {}, error: null };
    const state = quietRef.current;
    const want = quietAsk.split(",").filter((sym) => !(sym in state.by));
    if (!want.length) return;
    for (const sym of want) state.by[sym] = null;
    setQuietTick((n) => n + 1);
    const span = { start: new Date(quietWin.start * 1000).toISOString(), end: new Date(quietWin.end * 1000).toISOString() };
    (async () => {
      let left = want;
      for (const size of [50, 10, 2, 1]) {
        if (!left.length || quietRef.current !== state) break;
        const again = [];
        const batches = [];
        for (let i = 0; i < left.length; i += size) batches.push(left.slice(i, i + size));
        await Promise.all(batches.map(async (batch) => {
          const r = await invokeFunction("terminal", { action: "news", accountId, symbols: batch, ...span, sort: "desc", max: 500 }).catch((e) => ({ data: { error: String(e?.message || e) } }));
          if (r?.data?.error) {
            state.error = r.data.error;
            for (const sym of batch) state.by[sym] = "error";
            return;
          }
          const got = settleQuiet(batch, r?.data?.news || [], !!r?.data?.truncated);
          for (const sym of got.news) state.by[sym] = "news";
          for (const sym of got.none) state.by[sym] = "quiet";
          again.push(...got.again);
        }));
        setQuietTick((n) => n + 1);
        left = again;
      }
    })();
  }, [active, accountId, quietKey, quietAsk]);
  const quietBy = quietWin && quietRef.current.key === quietKey ? quietRef.current.by : {};
  const quietPool = quietWin ? matches.slice(0, QUIET_ROWS) : [];
  const quietLeft = quietPool.filter((r) => !quietBy[r.symbol]).length;
  const quietFailed = quietPool.filter((r) => quietBy[r.symbol] === "error").length;
  // What the table lists: the matches, or with the news filter on, those of
  // the first QUIET_ROWS whose news has been read and found empty.
  const listed = quietWin ? quietPool.filter((r) => quietBy[r.symbol] === "quiet") : matches;
  const COLUMNS = COLUMN_SETS[preOpen ? "preOpen" : mode];

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
  const shownSymbols = listed.slice(0, NEWS_ROWS).map((r) => r.symbol).join(",");
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

  // A ready-made screen on or off; switched on, its order of rows becomes the sort.
  const togglePreset = (id) => {
    const on = presets.includes(id);
    setPresets((list) => (on ? list.filter((x) => x !== id) : [...list, id]));
    const sort = PRESETS.find((p) => p.id === id)?.screen.sort;
    if (!on && sort) setScreen((s) => ({ ...s, sort }));
  };
  const setRange = (id, v) => {
    setScreen((s) => {
      const ranges = { ...s.ranges };
      if (v.min === null && v.max === null) delete ranges[id];
      else ranges[id] = v;
      return { ...s, ranges };
    });
  };
  const setChoice = (k, v) => setScreen((s) => ({ ...s, [k]: v }));
  const sortBy = (key) => setScreen((s) => ({ ...s, sort: { key, dir: s.sort.key === key && s.sort.dir === "desc" ? "asc" : "desc" } }));
  const toggleGroup = (g) => setOpen((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const activeRanges = Object.entries(screen.ranges);
  const chosen = PRESETS.filter((p) => presets.includes(p.id));

  return (
    <div className="flex min-h-[70vh] flex-col gap-2 text-slate-800 md:flex-row">
      <button type="button" onClick={() => setShowFilters((v) => !v)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium md:hidden">
        {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Screens and filters{chosen.length ? ` · ${chosen.map((p) => p.label).join(" + ")}` : ""}{activeRanges.length ? ` · ${activeRanges.length} filter${activeRanges.length === 1 ? "" : "s"}` : ""}
      </button>
      <aside className={`${showFilters ? "flex" : "hidden"} max-h-[70vh] w-full shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white md:flex md:max-h-none md:w-72`}>
        <div className="flex items-baseline gap-2 border-b border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">
          Stocks in play<span className="text-[10px] font-normal text-slate-500">pick any: all must hold, with your filters</span>
        </div>
        <div className="grid grid-cols-2 gap-1 px-2">
          {PRESETS.filter((p) => !p.set && (mode !== "live" || presetKnown(p, "live"))).map((p) => {
            const known = presetKnown(p, mode);
            const on = presets.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={on} disabled={!known && !on} title={known ? p.note : `${p.note}. Needs the whole day: choose "At the close".`} onClick={() => togglePreset(p.id)}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 text-left text-[11px] disabled:opacity-40 ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${on ? "border-white bg-white text-slate-900" : "border-slate-300"}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                {p.label}
              </button>
            );
          })}
        </div>
        {mode === "live" && (
          <div className="px-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-800">Gamma</div>
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.filter((p) => p.set === "gamma").map((p) => {
                const on = presets.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} title={p.note} onClick={() => togglePreset(p.id)}
                    className={`flex items-center gap-1 rounded border px-1.5 py-1 text-left text-[11px] ${on ? "border-violet-900 bg-violet-900 text-white" : "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"}`}>
                    <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${on ? "border-white bg-white text-violet-900" : "border-violet-300"}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center border-t border-slate-200 px-2 pt-2 text-xs font-semibold text-slate-700">
          Filters
          <button type="button" onClick={() => { setPresets([]); setScreen(cleanScreen({ ...EMPTY_SCREEN, sort: screen.sort })); }} className="ml-auto text-[11px] font-normal text-slate-500 hover:underline">Clear all</button>
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
            <label className="flex items-center gap-1" title="Alpaca trades part shares of it"><input type="checkbox" checked={!!screen.fractionable} onChange={(e) => setChoice("fractionable", e.target.checked)} />Fractionable</label>
            <label className="flex items-center gap-1" title="Alpaca trades it overnight, 20:00 to 4:00 New York, on Blue Ocean"><input type="checkbox" checked={!!screen.overnight} onChange={(e) => setChoice("overnight", e.target.checked)} />Trades overnight</label>
          </div>
          {/* Only the groups with something to set at this moment: on a past day
              the events and gamma groups hold live figures only, and opened
              empty (10 Nov, the owner: "it doesn't open, doesn't drop down"). */}
          {GROUPS.filter((g) => FIELDS.some((f) => f.group === g && !f.hidden && fieldKnown(f.id, mode)) || (g === "Gamma (options)" && mode === "live") || g === "Company and events").map((g) => (
            <div key={g} className="rounded border border-slate-100">
              <button type="button" onClick={() => toggleGroup(g)} className="flex w-full items-center gap-1 px-1 py-1 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                {open.has(g) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{g}
                {(FIELDS.some((f) => f.group === g && screen.ranges[f.id]) || (g === "Gamma (options)" && (screen.gamma !== "any" || screen.gammaOnly)) || (g === "Company and events" && screen.quietDays)) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </button>
              {open.has(g) && g === "Gamma (options)" && mode === "live" && (
                <div className="space-y-1 px-1 pb-1 text-[11px] text-slate-600">
                  <label className="flex items-center justify-between gap-2">Gamma at the price
                    <select value={screen.gamma} onChange={(e) => setChoice("gamma", e.target.value)} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]">
                      <option value="any">Any</option><option value="positive">Positive</option><option value="negative">Negative</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={screen.gammaOnly} onChange={(e) => setChoice("gammaOnly", e.target.checked)} />Only shares with gamma worked out</label>
                </div>
              )}
              {open.has(g) && g === "Company and events" && <QuietRow days={screen.quietDays} onChange={(d) => setChoice("quietDays", d)} />}
              {open.has(g) && FIELDS.filter((f) => f.group === g && !f.hidden && fieldKnown(f.id, mode)).map((f) => <RangeRow key={f.id} field={f} value={screen.ranges[f.id]} onChange={setRange} preOpen={preOpen} days={sessionDays} />)}
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
        {preOpen && (
          <p className="border-b border-sky-100 bg-sky-50 px-2 py-1 text-[11px] text-sky-900">
            Before the open: the change is against {lastSession ? new Date(`${lastSession}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "the last session"}&apos;s close, and today&apos;s volume is the pre-market&apos;s
            {pmNow?.through
              ? `, 4:00 to ${new Date(pmNow.through).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} New York (every exchange, 15 minutes behind), for ${Object.keys(pmNow.by).length.toLocaleString()} shares: the biggest moves among those trading $1M a day, and the most traded. Read again every five minutes.`
              : sess.premarket?.loading ? ": reading it…" : ": it shows from 4:16 New York."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-1.5 text-xs">
          <span className="font-semibold">{listed.length.toLocaleString()} match{listed.length === 1 ? "" : "es"}</span>
          <span className="text-slate-500">of {rows.length.toLocaleString()} {when.date ? "shares that traded that day" : "listed shares"}{chosen.length ? ` · ${chosen.map((p) => p.note.charAt(0).toLowerCase() + p.note.slice(1)).join(", and ")}`.replace(/^ · ./, (m) => m.toUpperCase()) : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            {!when.date && <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Every minute</label>}
            <button type="button" onClick={refresh} disabled={universe.loading} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${universe.loading ? "animate-spin" : ""}`} />{universe.loading ? "Reading…" : "Refresh"}
            </button>
          </div>
        </div>
        {(activeRanges.length > 0 || chosen.length > 0 || screen.quietDays) && (
          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1">
            {screen.quietDays && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                No news in {screen.quietDays} day{screen.quietDays === 1 ? "" : "s"}
                <button type="button" aria-label="Remove no news" onClick={() => setChoice("quietDays", null)}><X className="h-3 w-3" /></button>
              </span>
            )}
            {chosen.map((p) => (
              <span key={p.id} className="flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white" title={p.note}>
                {p.label}
                <button type="button" aria-label={`Switch off ${p.label}`} onClick={() => togglePreset(p.id)}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {activeRanges.map(([id, { min, max }]) => {
              const f = FIELD[id];
              const u = f.unit === "%" ? "%" : f.unit === "x" ? "×" : "";
              const amt = (v) => (f.unit === "$" ? `$${bigNumber(v)}` : f.unit === "shares" ? bigNumber(v) : `${v}${u}`);
              return (
                <span key={id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                  {fieldLabel(f, preOpen, sessionDays)} {min !== null && max !== null ? `${amt(min)} to ${amt(max)}` : min !== null ? `≥ ${amt(min)}` : `≤ ${amt(max)}`}
                  <button type="button" aria-label={`Remove ${fieldLabel(f, preOpen, sessionDays)}`} onClick={() => setRange(id, { min: null, max: null })}><X className="h-3 w-3" /></button>
                </span>
              );
            })}
          </div>
        )}
        {quietWin && (quietLeft > 0 || quietFailed > 0 || matches.length > QUIET_ROWS) && (
          <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-slate-500">
            {quietLeft > 0 ? `Reading the news: ${(quietPool.length - quietLeft).toLocaleString()} of ${quietPool.length.toLocaleString()} matches. ` : ""}
            {quietFailed > 0 ? <span className="text-rose-700">News not read for {quietFailed}: {quietRef.current.error}. </span> : ""}
            {matches.length > QUIET_ROWS ? `News read for the first ${QUIET_ROWS} of ${matches.length.toLocaleString()} matches, in this order.` : ""}
          </p>
        )}
        {clash.length > 0 && (
          <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-rose-700">
            No share can match: {clash.map((id) => fieldLabel(FIELD[id], preOpen, sessionDays)).join(", ")} cannot be above and below at once with what is switched on. Switch one off.
          </p>
        )}
        {(universe.error || progress.error) && <p className="px-2 py-1 text-xs text-rose-700">{universe.error || `Daily figures: ${progress.error}`}</p>}
        {needsDaily(effective) && (progress.loading || covered < rows.length) && rows.length > 0 && (
          <p className="px-2 py-1 text-[11px] text-amber-800">
            {progress.loading ? `Reading a year of daily candles: ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} shares. Matches fill in as they arrive.` : `Averages, RSI, ATR, 52-week and performance figures cover the ${covered.toLocaleString()} most traded shares.`}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500">
              <tr>
                {COLUMNS.map(([key, name]) => (
                  <th key={key} className={`whitespace-nowrap px-2 py-1 font-medium ${key === "news" ? "" : "cursor-pointer hover:text-slate-900"} ${key === "symbol" ? "text-left" : "text-right"} ${GAMMA_KEYS.has(key) ? "bg-violet-50 text-violet-900" : ""}`}
                    title={key === "news" ? `Articles naming the share, ${newsWhen}. Click a count for the headlines.` : FIELD[key] ? `${fieldLabel(FIELD[key], preOpen, sessionDays)}: ${fieldHint(FIELD[key], preOpen, sessionDays)}` : "Symbol"} onClick={() => key !== "news" && sortBy(key)}>
                    {name}{FIELD[key]?.session && sessionDays?.[FIELD[key].session] ? <span className="font-normal text-slate-400"> {FIELD[key].session === "overnight" ? "→" : ""}{sessionDays[FIELD[key].session].split(" ")[1]}</span> : null}{screen.sort.key === key ? (screen.sort.dir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="px-1" />
              </tr>
            </thead>
            <tbody>
              {listed.slice(0, SHOW_MAX).map((r) => (
                <Fragment key={r.symbol}>
                <tr className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50" onClick={() => onPick(r.symbol)}>
                  <td className="max-w-[14rem] px-2 py-1">
                    <span className="font-semibold">{r.symbol}</span>
                    {r.options && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] text-slate-500" title="Options listed">OPT</span>}
                    {onGamma && r.gexNet !== undefined && r.gexNet !== null && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onGamma(r.symbol); }} title={`Open ${r.symbol} on the Gamma page`} aria-label={`Open ${r.symbol} on the Gamma page`}
                        className="ml-1 rounded p-0.5 align-middle text-violet-700 hover:bg-violet-100"><LineChart className="h-3 w-3" /></button>
                    )}
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
          {!universe.loading && universe.at && listed.length === 0 && !quietLeft && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              {preOpen && !pmNow?.through ? "Before the open, screens on today's volume fill in once the pre-market has been read." : "Nothing matches every filter. Loosen one, or pick a ready-made screen."}
            </p>
          )}
          {!universe.at && universe.loading && <p className="px-3 py-6 text-center text-xs text-slate-500">{when.date ? `Reading every listed share on ${when.date}: about ten seconds the first time.` : "Reading every listed share…"}</p>}
          {listed.length > SHOW_MAX && <p className="px-3 py-2 text-center text-[11px] text-slate-500">Showing the first {SHOW_MAX} of {listed.length.toLocaleString()}. Narrow the filters or sort differently to see others.</p>}
        </div>
        {when.date ? (
          <p className="border-t border-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-400">
            {when.date} {when.asOf === "open" ? "at the open: the opening price and gap; pre-market (4:00 to 9:30) for the biggest gaps among shares trading $1M a day" : "at the close: the whole day"}; averages, RSI and 52-week figures from the days before. From your own Alpaca account, consolidated daily candles{universe.dayFeed && universe.dayFeed !== "sip" ? " (IEX only: this account cannot read the consolidated tape)" : ""}. Only shares listed today are included, so companies delisted since are missing; names, market cap (today&apos;s shares outstanding) and options are today&apos;s. A screen is a filter, not a recommendation.
          </p>
        ) : <p className="border-t border-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-400">
          {universe.at ? `Read ${new Date(universe.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" })} New York. ` : ""}
          From your own Alpaca account: prices are the later of the last trade on IEX (real time, 8:00 to 17:00 New York) and on the consolidated tape (every exchange, 15 minutes delayed); before the open, volume is the pre-market&apos;s; otherwise volume and the day&apos;s candle are the consolidated tape{universe.dayFeed === "delayed_sip" ? ", 15 minutes delayed" : universe.dayFeed ? " (IEX only: this account cannot read the consolidated tape, so volumes are IEX's share)" : ""}; daily figures from consolidated daily candles. Market cap uses shares outstanding from the company&apos;s latest SEC filing; earnings dates from the earnings calendar.
          {" "}Gamma: {gamma.today?.listed
            ? (gamma.today.done < gamma.today.listed ? `today's run has worked out ${gamma.today.done} of ${gamma.today.listed} shares so far; the rest show the day before's` : `worked out this morning for the ${gamma.today.listed} optionable shares that traded the most dollars the session before`)
            : Object.keys(gamma.by).length ? `the latest morning's figures, for ${Object.keys(gamma.by).length} shares` : "worked out each weekday from 7:00 New York"}
          {" "}(open interest of 6:30, expiries within 30 days, today&apos;s counted), then read at the price now; &quot;—&quot; for others. An estimate of dealer positioning.
          {" "}A screen is a filter, not a recommendation.
        </p>}
      </section>
    </div>
  );
}
