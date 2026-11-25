import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, isCrypto } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { bookTrips } from "@/lib/replay";
import { demoBook, periodStart, customPeriod, customBounds } from "@/lib/demoTrades";
import { SIDES, TIMEFRAMES, MISTAKES, TINY_RISK, cleanPlay, withPlays, playStats, playSplits, sampleFlag } from "@/lib/playbook";
import useAccountSetting from "./useAccountSetting";

// The terminal's Playbook (20 Nov 2026, the owner: "I need to implement the
// Playbook too", then "Yes start phase 1, load the four example plays"; the
// design is the DeltaMint Playbook prototype of 16 Nov). Plays: the rules a
// person trades by. Trades: the account's round trips, each with the play of
// the order that opened it (functions/terminal marks every entry sent while a
// play is active), its R and a review. Results: each play's figures and what
// they split by. The rules live in lib/playbook.js, shared with the server.

const money = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${fmtMoney(v)}`);
const tone = (v) => (v > 1e-9 ? "text-emerald-700" : v < -1e-9 ? "text-rose-700" : "text-slate-600");
const fR = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}R`);
const pct = (v) => (v === null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
const pf = (v) => (v === null ? "—" : v === Infinity ? "no losses" : v.toFixed(2));
const when = (t, symbol) => (t ? new Date(t * 1000).toLocaleString("en-US", { timeZone: isCrypto(symbol) ? "UTC" : "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "open");
const hold = (s) => {
  if (s === null || !Number.isFinite(s)) return "—";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
};
const FOLLOWED_TEXT = { yes: "Followed", partly: "Partly", no: "Broke plan" };
const FOLLOWED_TONE = { yes: "bg-emerald-50 text-emerald-800 border-emerald-200", partly: "bg-amber-50 text-amber-800 border-amber-200", no: "bg-rose-50 text-rose-800 border-rose-200" };
const input = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "30 days"], ["custom", "Custom"]];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanPeriod = (v) => ({
  id: PERIODS.some(([id]) => id === v?.id) ? v.id : "week",
  from: DATE.test(String(v?.from)) ? v.from : "",
  to: DATE.test(String(v?.to)) ? v.to : ""
});

/** The active play, in the top bar: entries from the ticket and the hotkeys are tagged with it. */
export function PlayChip({ plays, activeId, onPick }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const active = plays.find((p) => p.id === activeId && !p.archived) || null;
  return (
    <div className="relative" ref={box}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        title="Your next entries, from the ticket or a hotkey, are tagged with this play"
        className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm ${active ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-300 text-slate-500"}`}>
        <span className="text-slate-500">Play:</span>
        <span className="font-medium">{active ? active.name : "None"}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg">
          <p className="px-2 py-1 text-xs text-slate-500">Your next entries, from the ticket or a hotkey, are tagged with this play.</p>
          {plays.filter((p) => !p.archived).map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === activeId} onClick={() => { onPick(p.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-50 ${p.id === activeId ? "font-medium text-indigo-900" : ""}`}>
              <span className={`h-2 w-2 rounded-full ${p.id === activeId ? "bg-indigo-600" : "border border-slate-400"}`} />
              {p.name}<span className="ml-auto font-mono text-[11px] text-slate-400">{p.code}</span>
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" role="menuitemradio" aria-checked={!active} onClick={() => { onPick(""); setOpen(false); }}
            className="w-full rounded px-2 py-1.5 text-left text-slate-600 hover:bg-slate-50">None: entries go untagged</button>
        </div>
      )}
    </div>
  );
}

/**
 * The Playbook page: Plays, Trades and Results for the account on screen.
 * `plays`: the person's plays (the page above keeps them, for the chip too);
 * `onPlays(list)`: after one is saved, archived or restored.
 */
export default function Playbook({ accountId, account, plays, onPlays, active }) {
  const [tab, setTab] = useAccountSetting("pbtab", { localKey: "dm.terminal.pbtab", initial: () => "trades", clean: (v) => (["plays", "trades", "results"].includes(v) ? v : "trades"), fromLocal: (r) => r, toLocal: (v) => v });
  const book = usePlaybookTrades({ accountId, active, plays });
  const counts = { plays: plays.filter((p) => !p.archived).length, trades: book.trips ? book.trips.length : null };
  return (
    <div className="mx-auto max-w-[1320px] px-1 py-2 text-sm">
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <h2 className="text-lg font-semibold">Playbook</h2>
        <span className="text-xs text-slate-500">Your rules, the trades linked to them, and how each play has done in your recorded trades.</span>
      </div>
      <div className="mb-3 flex gap-5 border-b border-slate-200" role="tablist" aria-label="Playbook">
        {[["plays", "Plays"], ["trades", "Trades"], ["results", "Results"]].map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-0.5 pb-2 pt-1 ${tab === id ? "border-indigo-600 font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {name}{counts[id] !== null && counts[id] !== undefined && <span className="ml-1 font-mono text-[11px] text-slate-400">{counts[id]}</span>}
          </button>
        ))}
      </div>
      {tab === "plays" && <PlaysTab plays={plays} onPlays={onPlays} tagged={book.tagged} />}
      {tab === "trades" && <TradesTab book={book} plays={plays} account={account} />}
      {tab === "results" && <ResultsTab book={book} plays={plays} account={account} />}
    </div>
  );
}

// ---------- the account's trades, with their plays ----------

function usePlaybookTrades({ accountId, active, plays }) {
  const [pick, setPick] = useAccountSetting("pbperiod", { localKey: "dm.terminal.pbperiod", initial: () => cleanPeriod(null), clean: cleanPeriod });
  const bounds = customBounds();
  const from = pick.from || bounds.max;
  const to = pick.to || bounds.max;
  const custom = pick.id === "custom";
  const win = custom ? customPeriod(from, to) : { start: periodStart(pick.id), end: null };
  const key = win && accountId ? `${accountId}|${pick.id}|${win.start}|${win.end ?? "now"}` : "";
  const [state, setState] = useState({ key: "", data: null, error: null, loading: false });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!active || !key) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const req = { action: "playbook", op: "trades", accountId, start: new Date(win.start * 1000).toISOString(), custom };
    if (win.end !== null) req.end = new Date(win.end * 1000).toISOString();
    invokeFunction("terminal", req).then((r) => {
      if (!alive) return;
      if (r?.data?.error || !r?.data) setState({ key, data: null, error: r?.data?.error || "Your trades could not be read.", loading: false });
      else setState({ key, data: { ...r.data, startSec: win.start, endSec: r.data.end ? Date.parse(r.data.end) / 1000 : null }, error: null, loading: false });
    });
    return () => { alive = false; };
  }, [active, key, nonce]);
  const data = state.key === key ? state.data : null;
  const trips = useMemo(() => {
    // Nothing shown from a read cut short, or from an ended period whose share
    // movements could not all be read (as on the P/L tab).
    if (!data || data.truncated || (data.endSec !== null && data.eventsRead === false)) return null;
    // Left out as on the P/L tab: a symbol whose shares changed without a trade.
    const skip = new Set((data.heldBack || []).map((e) => e.symbol).filter(Boolean));
    const keep = (s) => !skip.has(s);
    const built = demoBook({
      fills: data.fills.filter((f) => keep(f.symbol)), positions: Object.fromEntries(Object.entries(data.positions).filter(([s]) => keep(s))),
      marks: data.marks || {}, start: data.startSec, end: data.endSec, fees: (data.fees || []).filter((f) => keep(f.symbol))
    });
    // Positions held from before the period are not trades made in it (they
    // still bound the next trade's stop, so they are read first).
    return withPlays(bookTrips(built.book), { marks: data.orderMarks || {}, stops: data.stops || [], reviews: data.reviews || {} })
      .filter((t) => !t.carried).sort((a, b) => b.entryTime - a.entryTime);
  }, [data]);
  const tagged = useMemo(() => {
    const n = {};
    for (const t of trips || []) if (t.play) n[t.play] = (n[t.play] || 0) + 1;
    return n;
  }, [trips]);
  // The play alone, from the Trades table: the rest of the review stays.
  const savePlay = async (trip, play) => {
    const r = await invokeFunction("terminal", { action: "playbook", op: "setplay", accountId, key: trip.key, play: play || "none" });
    if (r?.data?.error) return r.data.error;
    const cleared = { play: play || "none", followed: null, checks: [], checksFor: null };
    setState((s) => (s.data ? { ...s, data: { ...s.data, reviews: { ...(s.data.reviews || {}), [trip.key]: { mistakes: [], notes: "", stop: null, ...(s.data.reviews?.[trip.key] || {}), ...cleared } } } } : s));
    return null;
  };
  const saveReview = async (trip, review) => {
    const r = await invokeFunction("terminal", { action: "playbook", op: "review", accountId, key: trip.key, review });
    if (r?.data?.error) return r.data.error;
    // Kept on screen at once; read again in the background.
    setState((s) => (s.data ? { ...s, data: { ...s.data, reviews: { ...(s.data.reviews || {}), [trip.key]: review } } } : s));
    return null;
  };
  // The period in words, from the trading days it covers (8:00 p.m. New York the evening before).
  const day = (sec) => new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
  const periodText = data ? `${day(data.startSec)}, 8:00 p.m. to ${data.endSec !== null ? `${day(data.endSec)}, 8:00 p.m.` : "now"}` : "";
  return {
    pick, setPick, bounds, from, to, custom, win, data, trips, tagged, plays, periodText,
    error: state.key === key ? state.error : null, loading: state.loading, reload: () => setNonce((n) => n + 1), saveReview, savePlay
  };
}

function PeriodBar({ book, children }) {
  const { pick, setPick, bounds, from, to, custom, win, loading, reload } = book;
  const setDates = (next) => setPick((p) => ({ ...p, from, to, ...next }));
  const dateInput = "rounded border border-slate-300 px-1 py-0.5 text-xs";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold uppercase tracking-wider text-slate-500">Period</span>
      <div className="flex overflow-hidden rounded border border-slate-300" role="group" aria-label="Period">
        {PERIODS.map(([id, name]) => (
          <button key={id} type="button" onClick={() => setPick((p) => ({ ...p, id }))} className={`px-2 py-0.5 ${pick.id === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
        ))}
      </div>
      {custom && (
        <span className="flex items-center gap-1 text-slate-500">
          <label className="flex items-center gap-1">From
            <input type="date" className={dateInput} value={from} min={bounds.min} max={bounds.max} onChange={(e) => e.target.value && setDates({ from: e.target.value, ...(e.target.value > to ? { to: e.target.value } : {}) })} />
          </label>
          <label className="flex items-center gap-1">To
            <input type="date" className={dateInput} value={to} min={from} max={bounds.max} onChange={(e) => e.target.value && setDates({ to: e.target.value })} />
          </label>
        </span>
      )}
      <button type="button" onClick={reload} className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50" disabled={loading}>{loading ? "Reading…" : "Refresh"}</button>
      {children}
      {custom && !win && <span className="text-amber-800">Pick dates with at least one trading day, within the last 92 days.</span>}
    </div>
  );
}

function Problems({ book }) {
  const { error, data } = book;
  if (error) return <p className="mb-2 text-rose-700">{error}</p>;
  if (data?.truncated) return <p className="mb-2 text-amber-800">More fills from the start to now than can be read at once, so what was held at the start cannot be worked out and no figures are shown. Choose a later start.</p>;
  if (data && data.eventsRead === false && data.endSec !== null) return <p className="mb-2 text-amber-800">Assignments, splits and transfers since the start could not all be read, so no figures are shown. Try again.</p>;
  const left = (data?.heldBack || []).filter((e) => e.symbol);
  return (
    <>
      {data && data.eventsRead === false && <p className="mb-2 text-amber-800">Assignments, splits and transfers could not be checked this time: if a symbol had one since the start, its trades here are off.</p>}
      {left.length > 0 && <p className="mb-2 text-amber-800">{`Left out: ${[...new Set(left.map((e) => e.symbol))].join(", ")}: shares changed without a trade (a split, transfer or corporate action), so their trades cannot be worked out from the fills.`}</p>}
    </>
  );
}

// When a stop order was placed, against the entry.
const stopWhen = (s) => (Math.abs(s) < 60 ? "placed with the entry" : s < 0 ? `placed ${Math.round(-s / 60)} min before the entry` : `placed ${Math.round(s / 60)} min after the entry`);
// How the trade's initial stop was found, in words.
const stopWords = (t) => (t.typedWrong ? "The stop typed is on the wrong side of the entry, so it is not used. " : "") + (!t.stop ? "No initial stop found: add it in Review."
  : `Stop ${px(t.stop)}: ${t.stopFrom === "hand" ? "typed in review" : t.stopFrom === "bracket" ? "from the entry's bracket" : `a stop order ${stopWhen(t.stopAfter)}`}.${t.tinyRisk ? " Under 0.05% from the entry: too close to measure R by." : ""}`);

// ---------- Plays ----------

const BLANK = { id: null, code: "", name: "", side: "Long", timeframe: "5 min", checklist: ["", ""], entry: "", stop: "", exit: "", risk: "", invalid: "", notes: "", archived: false };

function PlaysTab({ plays, onPlays, tagged }) {
  const [sel, setSel] = useState(plays[0]?.id || "new");
  const current = plays.find((p) => p.id === sel) || null;
  const [draft, setDraft] = useState(() => (current ? { ...current, checklist: [...current.checklist] } : { ...BLANK }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const p = plays.find((x) => x.id === sel);
    setDraft(p ? { ...p, checklist: [...p.checklist] } : { ...BLANK, checklist: ["", ""] });
    setMsg(null);
  }, [sel]);
  const check = cleanPlay(draft);
  const dup = check.play && plays.some((p) => p.id !== draft.id && p.code === check.play.code);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    setBusy(true);
    const r = await invokeFunction("terminal", { action: "plays", op: "save", play: { ...draft, id: draft.id || undefined } });
    setBusy(false);
    if (r?.data?.error) { setMsg({ bad: true, text: r.data.error }); return; }
    const p = r.data.play;
    onPlays(draft.id ? plays.map((x) => (x.id === p.id ? p : x)) : [...plays, p]);
    setSel(p.id);
    setMsg(r.data.warning ? { bad: true, text: r.data.warning } : { text: `${p.name} saved.` });
  };
  const archive = async () => {
    if (!current) return;
    setBusy(true);
    const r = await invokeFunction("terminal", { action: "plays", op: "archive", id: current.id, archived: !current.archived });
    setBusy(false);
    if (r?.data?.error) { setMsg({ bad: true, text: r.data.error }); return; }
    onPlays(plays.map((x) => (x.id === r.data.play.id ? r.data.play : x)));
    setMsg({ text: r.data.play.archived ? `${r.data.play.name} archived: it stays on its trades but can no longer be picked.` : `${r.data.play.name} can be picked again.` });
  };
  const item = (p) => (
    <button key={p.id} type="button" onClick={() => setSel(p.id)} aria-current={p.id === sel}
      className={`grid w-full grid-cols-[10px_1fr_auto] items-center gap-2 rounded px-2 py-2 text-left ${p.id === sel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
      <span className={`h-2 w-2 rounded-full ${p.archived ? "border border-slate-400" : "bg-indigo-600"}`} />
      <span><span className={`block font-medium ${p.archived ? "text-slate-500" : ""}`}>{p.name}</span><span className="block text-xs text-slate-500">{p.code} · {p.side} · {p.timeframe}</span></span>
      <span className="font-mono text-xs text-slate-400" title="Trades tagged in the period on the Trades tab">{tagged[p.id] || 0}</span>
    </button>
  );
  const label = "pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="h-fit rounded-lg border border-slate-200 bg-white p-1.5">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Plays</span>
          <button type="button" onClick={() => setSel("new")} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50">+ New play</button>
        </div>
        {plays.filter((p) => !p.archived).map(item)}
        {plays.some((p) => p.archived) && <div className="px-2 pb-1 pt-3 text-[11px] uppercase tracking-wider text-slate-400">Archived</div>}
        {plays.filter((p) => p.archived).map(item)}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(180px,1fr)_96px_120px_120px]">
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1"><span className={label}>Name</span><input className={input} value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className={label}>Code</span><input className={`${input} font-mono`} maxLength={6} value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
            {draft.code && !/^[A-Z0-9]{1,6}$/.test(draft.code) && <span className="text-xs text-rose-700">1 to 6 letters or digits</span>}
            {dup && <span className="text-xs text-rose-700">Already used</span>}</label>
          <label className="flex flex-col gap-1"><span className={label}>Side</span><select className={input} value={draft.side} onChange={(e) => set("side", e.target.value)}>{SIDES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className={label}>Timeframe</span><select className={input} value={draft.timeframe} onChange={(e) => set("timeframe", e.target.value)}>{[...new Set([...TIMEFRAMES, draft.timeframe])].map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-[120px_1fr]">
          <span className={label}>Checklist</span>
          <div>
            <div className="flex flex-col gap-1.5">
              {draft.checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-slate-400" aria-hidden="true">☐</span>
                  <input className={input} value={c} aria-label={`Checklist item ${i + 1}`} onChange={(e) => set("checklist", draft.checklist.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button type="button" aria-label="Remove" onClick={() => set("checklist", draft.checklist.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set("checklist", [...draft.checklist, ""])} className="mt-1 text-xs text-indigo-700 hover:underline">+ Add item</button>
            <p className="mt-0.5 text-xs text-slate-500">You tick these on each trade in its review. Results then splits by each one. Renaming an item in place keeps its answers on past trades.</p>
          </div>
          {[["entry", "Entry"], ["stop", "Stop"], ["exit", "Exit"]].map(([k, name]) => (
            <FragmentRow key={k} label={name} cls={label}><textarea className={input} rows={2} value={draft[k]} onChange={(e) => set(k, e.target.value)} /></FragmentRow>
          ))}
          <FragmentRow label="Risk" cls={label}><input className={input} value={draft.risk} onChange={(e) => set("risk", e.target.value)} /></FragmentRow>
          <FragmentRow label="Invalidation" cls={label}><input className={input} value={draft.invalid} onChange={(e) => set("invalid", e.target.value)} /></FragmentRow>
          <FragmentRow label="Notes" cls={label}><textarea className={input} rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></FragmentRow>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <span className={`mr-auto text-xs ${msg?.bad ? "text-rose-700" : "text-slate-500"}`}>
            {msg?.text || (check.error && draft.name ? check.error : current ? "Archived plays stay on their old trades." : "A new play.")}
          </span>
          {current && <button type="button" disabled={busy} onClick={archive} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">{current.archived ? "Restore" : "Archive"}</button>}
          <button type="button" disabled={busy || !!check.error || dup} onClick={save} className="rounded bg-indigo-700 px-3 py-1 font-medium text-white hover:bg-indigo-800 disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ label, cls, children }) {
  return (<><span className={cls}>{label}</span><div>{children}</div></>);
}

// ---------- Trades ----------

function TradesTab({ book, plays, account }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const trips = book.trips || [];
  const rows = trips.filter((t) => (filter === "all" ? true : filter === "none" ? !t.play : t.play === filter));
  const closed = trips.filter((t) => !t.open);
  const total = closed.reduce((a, t) => a + t.realized, 0);
  const options = (sel) => [
    <option key="" value="">No play</option>,
    ...plays.filter((p) => !p.archived || p.id === sel).map((p) => <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archived)" : ""}</option>)
  ];
  const setPlay = async (t, id) => {
    // A new play: the old one's answers (followed, checklist) no longer apply; the rest stays.
    setErr(await book.savePlay(t, id));
  };
  const th = "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const td = "whitespace-nowrap border-b border-slate-100 px-2 py-1.5";
  return (
    <div>
      <PeriodBar book={book}>
        <span className="font-semibold uppercase tracking-wider text-slate-500">Play</span>
        <select className="rounded border border-slate-300 px-1 py-0.5" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option><option value="none">No play</option>
          {plays.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="ml-auto text-slate-500">{account?.name}{account?.type ? ` · ${account.type}` : ""}</span>
      </PeriodBar>
      <Problems book={book} />
      {err && <p className="mb-2 text-rose-700">{err}</p>}
      {book.trips && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-7 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
            {[["Round trips", String(trips.length)], ["Closed trades' P/L", money(total), tone(total)], ["Won", `${closed.filter((t) => t.realized > 1e-9).length} of ${closed.length}`],
              ["Linked to a play", `${trips.filter((t) => t.play).length} of ${trips.length}`], ["Reviewed", `${trips.filter((t) => t.review?.followed).length} of ${trips.length}`]].map(([k, v, c]) => (
              <div key={k}><div className="text-xs text-slate-500">{k}</div><div className={`font-mono text-base ${c || ""}`}>{v}</div></div>
            ))}
          </div>
          {!rows.length ? <p className="px-1 py-4 text-slate-500">No trades {filter === "all" ? "in this period" : "for this play in this period"}.</p> : (
            <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0"><tr>
                  {["Opened", "Symbol", "Side", "Size", "Entry", "Exit", "P/L", "R", "Held", "Play", "Review"].map((h, i) => <th key={h} className={`${th} ${i >= 3 && i <= 8 ? "text-right" : ""}`}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((t) => (
                  <tr key={t.key} className="hover:bg-slate-50">
                    <td className={`${td} font-mono`}>{when(t.entryTime, t.symbol)}</td>
                    <td className={`${td} font-mono font-semibold`}>{t.symbol}</td>
                    <td className={td}>{t.side === "long" ? "Long" : "Short"}</td>
                    <td className={`${td} text-right font-mono`}>{sizeText(t.size)}</td>
                    <td className={`${td} text-right font-mono`}>{px(t.avgEntry)}</td>
                    <td className={`${td} text-right font-mono`}>{t.avgExit === null ? "—" : px(t.avgExit)}</td>
                    <td className={`${td} text-right font-mono ${tone(t.realized)}`}>{t.open ? "open" : money(t.realized)}</td>
                    <td className={`${td} text-right font-mono ${tone(t.r ?? 0)}`} title={stopWords(t)}>{fR(t.r, 1)}{(t.tinyRisk || t.typedWrong) && <span className="ml-0.5 text-amber-700">!</span>}</td>
                    <td className={`${td} text-right font-mono text-slate-500`}>{t.open ? "—" : hold(t.exitTime - t.entryTime)}</td>
                    <td className={td}>
                      <select aria-label={`Play for ${t.symbol} ${when(t.entryTime, t.symbol)}`} title="Changing the play clears this trade's checklist and 'followed the plan' answers (they belonged to the old play); its mistakes, notes and stop stay." value={t.play || ""} onChange={(e) => setPlay(t, e.target.value)}
                        className={`max-w-[190px] rounded border px-1 py-0.5 ${t.play ? "border-slate-300" : "border-dashed border-slate-300 text-slate-500"}`}>{options(t.play)}</select>
                    </td>
                    <td className={td}>
                      <button type="button" onClick={() => setOpen(t.key)} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.review?.followed ? FOLLOWED_TONE[t.review.followed] : "border-slate-300 text-indigo-700"}`}>
                        {t.review?.followed ? FOLLOWED_TEXT[t.review.followed] : "Review"}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="mt-2 max-w-[75ch] text-xs text-slate-500">
            {`From this account's share and coin fills, trades opened in this period; before commission and fees; option fills not included. A trade's play is the one active when the order that opened it was sent from the ticket or a hotkey, or the one you pick here. R: the result over the risk at entry (the opening order's size × its distance to the initial stop). The initial stop: typed in review, else the entry's bracket, else a stop order sent while the entry was working or within five minutes of it; "—" when there is none (add it in Review) or it is under 0.05% from the entry. Positions held from before the period are not counted. Open trades show "open".`}
          </p>
        </>
      )}
      {open && <ReviewDrawer trip={trips.find((t) => t.key === open)} plays={plays} onClose={() => setOpen(null)} onSave={book.saveReview} />}
    </div>
  );
}

function ReviewDrawer({ trip, plays, onClose, onSave }) {
  const [d, setD] = useState(() => ({
    play: trip?.play || "", stop: trip?.review?.stop ?? (trip?.stop ?? ""), followed: trip?.review?.followed || null,
    mistakes: trip?.review?.mistakes || [], checks: trip?.review?.checks || [], notes: trip?.review?.notes || ""
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!trip) return null;
  const play = plays.find((p) => p.id === d.play) || null;
  const stopNum = Number(d.stop);
  const typed = d.stop !== "" && stopNum > 0 && stopNum !== trip.stop;
  const stop = stopNum > 0 ? stopNum : null;
  // Against the opening order's price, as Results (lib/playbook.js withPlays).
  const wrongSide = stop !== null && (trip.side === "long" ? stop >= trip.entry : stop <= trip.entry);
  const tiny = stop !== null && !wrongSide && Math.abs(trip.entry - stop) / trip.entry < TINY_RISK;
  const risk = stop !== null && !wrongSide ? Math.abs(trip.entry - stop) * trip.openQty : null;
  const r = !trip.open && risk > 0 && !tiny ? trip.realized / risk : null;
  const save = async () => {
    if (wrongSide) { setErr(`The initial stop is ${trip.side === "long" ? "below" : "above"} the entry (${px(trip.entry)}) for a ${trip.side}.`); return; }
    setBusy(true);
    const review = {
      // The checklist answered for this play: its unticked items are a "no".
      checksFor: play && play.checklist.length ? play.id : null,
      // A stop typed (or one found, then changed); cleared, none typed.
      play: d.play || "none", stop: d.stop === "" ? null : typed ? stopNum : trip.stopFrom === "hand" ? trip.stop : null, followed: d.followed,
      mistakes: d.mistakes, checks: d.checks.filter((c) => play?.checklist.includes(c)), notes: d.notes
    };
    const e = await onSave(trip, review);
    setBusy(false);
    if (e) setErr(e); else onClose();
  };
  const toggle = (k, v) => setD((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const label = "pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const source = typed || trip.stopFrom === "hand" ? "Typed" : trip.stopFrom === "bracket" ? "From the entry's bracket" : trip.stopFrom === "stop order" ? stopWhen(trip.stopAfter).replace(/^p/, "P") : "No stop found";
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-900/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`Review ${trip.symbol}`} className="fixed bottom-0 right-0 top-0 z-[61] flex w-full max-w-[560px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start gap-2 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">{trip.symbol} {trip.side} · <span className={tone(trip.realized)}>{trip.open ? "open" : money(trip.realized)}</span> · <span className={tone(r ?? 0)}>{fR(r)}</span></div>
            <div className="mt-0.5 text-xs text-slate-500">{when(trip.entryTime, trip.symbol)} → {trip.open ? "open" : when(trip.exitTime, trip.symbol)} · {sizeText(trip.size)} at {px(trip.avgEntry)}{trip.avgExit !== null ? ` → ${px(trip.avgExit)}` : ""} · {trip.fills} fills{trip.open ? "" : ` · held ${hold(trip.exitTime - trip.entryTime)}`}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-[128px_1fr]">
            <span className={label}>Play</span>
            <select className={input} value={d.play} onChange={(e) => setD((x) => ({ ...x, play: e.target.value, checks: [], followed: null }))}>
              <option value="">No play</option>
              {plays.filter((p) => !p.archived || p.id === d.play).map((p) => <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archived)" : ""}</option>)}
            </select>
            <span className={label}>Initial stop</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${input} w-28 font-mono`} type="number" step="0.01" placeholder="—" value={d.stop} onChange={(e) => setD((x) => ({ ...x, stop: e.target.value }))} />
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">{source}</span>
              </div>
              {trip.bracket > 0 && typed && <p className="mt-1 text-xs text-slate-500">The entry&apos;s bracket stop was {px(trip.bracket)}.</p>}
              {wrongSide && <p className="mt-1 text-xs text-rose-700">{`A ${trip.side}'s stop is ${trip.side === "long" ? "below" : "above"} the entry (${px(trip.entry)}).`}</p>}
              {tiny && <p className="mt-1 text-xs text-amber-800">Under 0.05% from the entry: too close to measure R by. Check the price.</p>}
              <RBar r={r} risk={risk} />
            </div>
            <span className={label}>Followed the plan</span>
            <div className="flex w-fit overflow-hidden rounded border border-slate-300">
              {["yes", "partly", "no"].map((v) => (
                <button key={v} type="button" aria-pressed={d.followed === v} onClick={() => setD((x) => ({ ...x, followed: x.followed === v ? null : v }))}
                  className={`border-r border-slate-300 px-3 py-1 last:border-r-0 ${d.followed === v ? (v === "yes" ? "bg-emerald-700 text-white" : v === "partly" ? "bg-amber-600 text-white" : "bg-rose-700 text-white") : "hover:bg-slate-50"}`}>
                  {v === "yes" ? "Yes" : v === "partly" ? "Partly" : "No"}
                </button>
              ))}
            </div>
            <span className={label}>Checklist present</span>
            <div className="flex flex-col gap-1.5">
              {play?.checklist.length > 0 && <span className="text-xs text-slate-500">Saving counts an unticked item as not present.</span>}
              {play ? (play.checklist.length ? play.checklist.map((c) => (
                <label key={c} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={d.checks.includes(c)} onChange={() => toggle("checks", c)} />{c}</label>
              )) : <span className="pt-1 text-slate-500">This play has no checklist.</span>) : <span className="pt-1 text-slate-500">Pick a play to see its checklist.</span>}
            </div>
            <span className={label}>Mistakes</span>
            <div className="flex flex-wrap gap-1.5">
              {MISTAKES.map((m) => (
                <button key={m} type="button" aria-pressed={d.mistakes.includes(m)} onClick={() => toggle("mistakes", m)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${d.mistakes.includes(m) ? "border-rose-300 bg-rose-50 font-semibold text-rose-800" : "border-slate-300 hover:bg-slate-50"}`}>{m}</button>
              ))}
            </div>
            <span className={label}>Notes</span>
            <textarea className={input} rows={3} placeholder="What you saw, what you would do again" value={d.notes} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} />
            {play && (<><span className={label}>The play&apos;s rules</span>
              <div className="text-xs leading-relaxed text-slate-600"><b>Entry</b> {play.entry || "—"}<br /><b>Stop</b> {play.stop || "—"}<br /><b>Exit</b> {play.exit || "—"}<br /><b>Invalid</b> {play.invalid || "—"}</div></>)}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {err && <span className="mr-auto text-xs text-rose-700">{err}</span>}
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={busy} onClick={save} className="rounded bg-indigo-700 px-3 py-1 font-medium text-white hover:bg-indigo-800 disabled:opacity-40">Save review</button>
        </footer>
      </aside>
    </>
  );
}

function RBar({ r, risk }) {
  if (r === null) return <p className="mt-1 text-xs text-slate-500">{risk ? "Shown once the trade is closed, with a stop at least 0.05% from the entry." : "Add the stop to see the trade in R."}</p>;
  const lo = Math.min(-1.5, Math.floor(r) - 0.5);
  const hi = Math.max(1.5, Math.ceil(r) + 0.5);
  const W = 380; const L = 12; const R = 14;
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const ticks = [];
  for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) ticks.push(v);
  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${W} 54`} className="h-auto w-full" role="img" aria-label={`Result ${fR(r)} against 1R of risk`}>
        {ticks.map((v) => (<g key={v}><line x1={x(v)} x2={x(v)} y1="8" y2="34" stroke="#e2e8f0" /><text x={x(v)} y="48" textAnchor="middle" fontSize="10" fill="#64748b">{v > 0 ? "+" : ""}{v}R</text></g>))}
        <rect x={x(-1)} y="14" width={x(0) - x(-1)} height="6" rx="2" fill="#be123c" opacity="0.35" />
        <rect x={Math.min(x(0), x(r))} y="22" width={Math.abs(x(r) - x(0))} height="8" rx="2" fill={r >= 0 ? "#047857" : "#be123c"} />
        <line x1={x(0)} x2={x(0)} y1="6" y2="36" stroke="#94a3b8" />
      </svg>
      <p className="text-xs text-slate-500">Thin bar: 1R, the risk at entry ({fmtMoney(risk)}: the opening order&apos;s size × its distance to the stop). Thick bar: the result.</p>
    </div>
  );
}

// ---------- Results ----------

function ResultsTab({ book, plays, account }) {
  const trips = book.trips || [];
  const groups = useMemo(() => {
    const used = plays.filter((p) => trips.some((t) => t.play === p.id)).map((p) => ({ id: p.id, name: p.name, play: p, list: trips.filter((t) => t.play === p.id) }));
    const none = trips.filter((t) => !t.play);
    return [...used, ...(none.length ? [{ id: "none", name: "No play", play: null, list: none }] : [])].filter((g) => g.list.some((t) => !t.open));
  }, [trips, plays]);
  const [sel, setSel] = useState(null);
  const g = groups.find((x) => x.id === sel) || groups[0] || null;
  const th = "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const td = "whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-right font-mono";
  return (
    <div>
      <PeriodBar book={book}><span className="ml-auto text-slate-500">{account?.name}{account?.type ? ` · ${account.type}` : ""} only: accounts are never added together.</span></PeriodBar>
      <Problems book={book} />
      {book.trips && !groups.length && <p className="px-1 py-4 text-slate-500">No closed trades in this period.</p>}
      {groups.length > 0 && (
        <>
          <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className={`${th} text-left`}>Play</th>{["Trades", "Win rate", "Avg R", "Total R", "With an R", "Profit factor", "Avg hold", "P/L", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{groups.map((x) => {
                const s = playStats(x.list);
                const dim = s.n < 10;
                // R rests on the trades with a stop: greyed under 10 of them.
                const dimR = s.nR < 10;
                return (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${x.id === g?.id ? "bg-indigo-50" : "hover:bg-slate-50"} ${dim ? "text-slate-400" : ""}`}>
                    <td className={`${td} text-left font-sans font-semibold text-slate-800`}>{x.name}</td>
                    <td className={`${td} text-slate-800`}>{s.n}</td><td className={td}>{pct(s.winRate)}</td>
                    <td className={`${td} ${dimR ? "text-slate-400" : tone(s.avgR ?? 0)}`}>{fR(s.avgR)}</td><td className={`${td} ${dimR ? "text-slate-400" : ""}`}>{fR(s.totalR, 1)}</td>
                    <td className={`${td} ${s.nR < s.n ? "text-amber-800" : ""}`}>{s.nR} of {s.n}</td>
                    <td className={td}>{pf(s.profitFactor)}</td><td className={td}>{hold(s.avgHold)}</td>
                    <td className={`${td} ${dim ? "" : tone(s.pl)}`}>{money(s.pl)}</td>
                    <td className={`${td} font-sans`}>{sampleFlag(s.n) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{sampleFlag(s.n)}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {g && <PlayDetail group={g} account={account} book={book} />}
        </>
      )}
    </div>
  );
}

function PlayDetail({ group, account, book }) {
  const all = group.list;
  const list = all.filter((t) => !t.open).sort((a, b) => a.entryTime - b.entryTime);
  const s = playStats(all);
  const sp = playSplits(list, group.play?.checklist || [], group.play?.id ?? null);
  const dim = s.n < 10;
  const dimR = s.nR < 10;
  const scale = Math.max(1, ...list.map((t) => Math.abs(t.r ?? 0)));
  const kpi = "border-r border-slate-100 px-3.5 py-2.5 last:border-r-0";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-base font-semibold">{group.name}</h3>
        {sampleFlag(s.n) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{sampleFlag(s.n)}</span>}
        <span className="text-xs text-slate-500">{account?.name}{account?.type ? ` (${account.type})` : ""} · {book.periodText} · your recorded trades. Past results do not predict future ones.</span>
      </div>
      <div className={`grid grid-cols-2 rounded-lg border border-slate-200 bg-white sm:grid-cols-4 lg:grid-cols-7 ${dim ? "[&_.v]:text-slate-400" : ""}`}>
        {[["Trades", String(s.n), "text-slate-900"], ["Win rate", pct(s.winRate)], [`Avg R (${s.nR} of ${s.n})`, fR(s.avgR), dimR ? "text-slate-400" : tone(s.avgR ?? 0)], ["Total R", fR(s.totalR, 1), dimR ? "text-slate-400" : tone(s.totalR ?? 0)],
          ["Profit factor", pf(s.profitFactor)], ["Avg hold", hold(s.avgHold)], ["P/L", money(s.pl), tone(s.pl)]].map(([k, v, c]) => (
          <div key={k} className={kpi}><div className="text-xs text-slate-500">{k}</div><div className={`v mt-0.5 font-mono text-lg ${c || ""}`}>{v}</div></div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {dim ? `With ${s.n} trade${s.n === 1 ? "" : "s"} the figures are greyed: under 10 trades they are too few to read, and 10 to 29 is a small sample. Every split below shows its own count. ` : ""}
        {s.nR < s.n ? `R rests on the ${s.nR} trade${s.nR === 1 ? "" : "s"} with an initial stop; the other ${s.n - s.nR} made ${money(s.noRPl)} and are not in it. ` : ""}
        {s.typedR ? `${s.typedR} R figure${s.typedR === 1 ? " rests" : "s rest"} on a stop typed in review. ` : ""}
        {s.open ? `${s.open} open trade${s.open === 1 ? " is" : "s are"} not counted (taken so far: ${money(s.openRealized)}). ` : ""}
        {`Closed trades opened in this period, from this account's own fills${account?.type === "Paper" ? " (a paper account: its fills are simulated)" : ""}; before commission and fees; option fills not included; shares from an option assignment open trades with no play; positions held from before the period are not counted.`}
      </p>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2"><h4 className="font-semibold">R per trade, in order</h4><span className="text-xs text-slate-500">Bars: each trade. Line: running total.</span></div>
        <RChart list={list} dim={dimR} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Split title="Followed the plan" note={`answered on ${sp.answered.followed} of ${sp.answered.of}`} rows={sp.followed} scale={scale} empty="No answers yet: mark it in each trade's review." />
        <Split title="Time of day (New York)" rows={sp.times} scale={scale} />
        <Split title="Checklist on the trade" note={`answered on ${sp.answered.checks} of ${sp.answered.of}`} rows={sp.checks} scale={scale} empty={group.play ? (group.play.checklist.length ? "No checklist answered yet: tick it in each trade's review." : "This play has no checklist.") : "Trades with no play have no checklist."} />
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <h4 className="font-semibold">Trades marked with each mistake</h4>
          <p className="mb-2 text-xs text-slate-500">The whole trade&apos;s result; a trade can carry several mistakes.</p>
          {sp.mistakes.length ? sp.mistakes.map((m) => (
            <div key={m.label} className="grid grid-cols-[minmax(0,1fr)_52px_80px_88px] items-center gap-2 border-b border-slate-100 py-1.5 text-xs last:border-b-0">
              <span className="truncate">{m.label}</span><span className="text-right font-mono text-slate-500">×{m.n}</span>
              <span className={`text-right font-mono ${tone(m.r ?? 0)}`} title={`R over ${m.nR} of ${m.n}`}>{fR(m.r, 1)}</span><span className={`text-right font-mono ${tone(m.pl)}`}>{money(m.pl)}</span>
            </div>
          )) : <p className="text-xs text-slate-500">None marked.</p>}
        </div>
      </div>
    </div>
  );
}

function Split({ title, note = "", rows, scale, empty = "" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2"><h4 className="font-semibold">{title}</h4>{note && <span className="text-xs text-slate-500">{note}</span>}</div>
      {!rows.length ? <p className="text-xs text-slate-500">{empty}</p> : rows.map((g) => {
        // An average shown only on 5 R figures or more.
        const a = g.stats.nR >= 5 ? g.stats.avgR : null;
        const w = a === null ? 0 : Math.min(1, Math.abs(a) / scale) * 50;
        return (
          <div key={g.label} className={`grid grid-cols-[minmax(0,1.4fr)_44px_minmax(0,1fr)_64px] items-center gap-2 border-b border-slate-100 py-1.5 text-xs last:border-b-0 ${g.n < 10 ? "opacity-60" : ""}`}>
            <span className="truncate" title={g.label}>{g.label}</span>
            <span className="text-right font-mono text-slate-500" title={`${g.stats.nR} with an R`}>n={g.n}</span>
            <span className="relative h-3 rounded bg-slate-100">
              <span className="absolute -bottom-0.5 -top-0.5 left-1/2 w-px bg-slate-400" />
              {a !== null && <span className={`absolute bottom-0.5 top-0.5 rounded-sm ${a >= 0 ? "bg-emerald-600" : "bg-rose-600"}`} style={a >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
            </span>
            <span className={`text-right font-mono ${tone(a ?? 0)}`} title={a === null ? "Under 5 trades with an R" : ""}>{fR(a)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RChart({ list, dim = false }) {
  const rs = list.filter((t) => t.r !== null);
  if (!rs.length) return <p className="mt-2 text-xs text-slate-500">No trade in this play has a stop yet, so there is no R to chart.</p>;
  let cum = 0;
  const cums = rs.map((t) => (cum += t.r));
  const lo = Math.min(-2, Math.floor(Math.min(...rs.map((t) => t.r), ...cums)));
  const hi = Math.max(2, Math.ceil(Math.max(...rs.map((t) => t.r), ...cums)));
  const W = 760; const H = 240; const L = 40; const R = 92; const T = 14; const B = 30;
  const n = rs.length;
  const bw = Math.min(36, ((W - L - R) / n) * 0.62);
  const xc = (i) => L + ((i + 0.5) * (W - L - R)) / n;
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
  const grid = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const path = cums.map((c, i) => `${i ? "L" : "M"}${xc(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label="R for each trade with the running total">
      {grid.map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#94a3b8" : "#eef2f7"} /><text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#64748b">{v > 0 ? "+" : ""}{v}R</text></g>))}
      {rs.map((t, i) => (
        <rect key={t.key} x={xc(i) - bw / 2} y={Math.min(y(0), y(t.r))} width={bw} height={Math.max(1, Math.abs(y(t.r) - y(0)))} rx="2" fill={t.r >= 0 ? "#047857" : "#be123c"}>
          <title>{`${t.symbol} ${when(t.entryTime, t.symbol)} · ${fR(t.r)}`}</title>
        </rect>
      ))}
      <path d={path} fill="none" stroke={dim ? "#94a3b8" : "#4338ca"} strokeWidth="2" />
      <circle cx={xc(n - 1)} cy={y(cums[n - 1])} r="4" fill={dim ? "#94a3b8" : "#4338ca"} />
      <text x={xc(n - 1) + 10} y={y(cums[n - 1]) + 4} fontSize="11" fontWeight="600" fill={dim ? "#94a3b8" : "#4338ca"}>{fR(cums[n - 1], 1)} total</text>
      {rs.map((t, i) => ((n <= 14 || i % Math.ceil(n / 12) === 0) ? <text key={`l${t.key}`} x={xc(i)} y={H - 12} textAnchor="middle" fontSize="10" fill="#64748b">{t.symbol}</text> : null))}
    </svg>
  );
}
