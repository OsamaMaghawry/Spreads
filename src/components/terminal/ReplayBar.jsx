import { useState } from "react";
import { Play, Pause, SkipForward, RotateCcw, X, History } from "lucide-react";
import { px, sizeText } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The replay's controls and its practice account, across the top of the
// chart while a replay runs (lib/replay.js has the rules). Amber throughout,
// so a replayed chart is never mistaken for the live one.

const UNITS = [["candle", "1 candle"], ["1Min", "1 minute"], ["5Min", "5 minutes"], ["15Min", "15 minutes"], ["1Hour", "1 hour"], ["1Day", "1 day"]];
const SPEEDS = [0.5, 1, 2, 5, 10];
const field = "rounded border border-amber-300 bg-white px-1 py-0.5 text-[11px] tabular-nums focus:outline-none";

/** The form that starts a replay: from when, to when. */
export function ReplayStart({ crypto, onStart, onCancel, busy }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [time, setTime] = useState(crypto ? "00:00" : "09:30");
  const [to, setTo] = useState(today);
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const why = !from || !to ? "Pick both dates."
    : from < "2016-01-04" ? "Alpaca's history starts in 2016."
      : from >= today ? "Start before today."
        : end <= start ? "End after the start."
          : end - start > 366 * 86400000 ? "At most a year at a time." : null;
  return (
    <div className="absolute left-0 z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center gap-1 font-semibold text-slate-800"><History className="h-4 w-4 text-amber-600" />Bar replay</div>
      <p className="mb-2 text-[11px] leading-snug text-slate-500">The chart goes back to the moment you pick and plays forward from there, at every interval, with a practice account. Nothing is sent to the broker.</p>
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1.5">
        <label htmlFor="rp-from" className="text-slate-600">From</label>
        <div className="flex gap-1">
          <input id="rp-from" type="date" className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5" value={from} max={today} min="2016-01-04" onChange={(e) => setFrom(e.target.value)} />
          <input type="time" aria-label="Start time" className="w-20 rounded border border-slate-300 px-1 py-0.5" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <label htmlFor="rp-to" className="text-slate-600">Until</label>
        <input id="rp-to" type="date" className="rounded border border-slate-300 px-1 py-0.5" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{crypto ? "Times in UTC." : "Times in New York; 9:30 is the open."}</p>
      {why && <p className="mt-1 text-[11px] text-amber-700">{why}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!!why || busy} onClick={() => onStart({ from, time, to })}
          className="flex-1 rounded bg-amber-600 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-40">{busy ? "Loading…" : "Start replay"}</button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

export default function ReplayBar({ clock, playing, loading, note, unit, speed, value, acct, price, symbol, crypto, onPlay, onStep, onRestart, onUnit, onSpeed, onJump, onExit, onTrade, onFlatten, onStop }) {
  const [qty, setQty] = useState(crypto ? "0.1" : "100");
  const [stopAt, setStopAt] = useState("");
  const [jump, setJump] = useState("");
  const pos = acct?.qty || 0;
  const stop = acct?.stops?.[0];
  const pnl = (v) => <span className={v >= 0 ? "text-emerald-700" : "text-rose-700"}>{v >= 0 ? "+" : ""}{fmtMoney(v)}</span>;
  return (
    <div className="space-y-1 border-b border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Replay</span>
        <span className="font-semibold tabular-nums">{clock}</span>
        <button type="button" title="Back to the start (the practice account starts over)" onClick={onRestart} className="rounded p-1 hover:bg-amber-100"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button type="button" title={playing ? "Pause" : "Play"} onClick={onPlay} disabled={loading && !playing} className="rounded bg-amber-600 p-1 text-white hover:bg-amber-700 disabled:opacity-50">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title="Step forward" onClick={onStep} disabled={playing || loading} className="rounded p-1 hover:bg-amber-100 disabled:opacity-40"><SkipForward className="h-3.5 w-3.5" /></button>
        <label className="flex items-center gap-1">step
          <select className={field} value={unit} onChange={(e) => onUnit(e.target.value)} aria-label="Step">{UNITS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label className="flex items-center gap-1">
          <select className={field} value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Speed">{SPEEDS.map((s) => <option key={s} value={s}>{s} per second</option>)}</select>
        </label>
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (jump) onJump(jump); }}>
          <input type="date" aria-label="Jump to" className={field} value={jump} onChange={(e) => setJump(e.target.value)} />
          <button type="submit" disabled={!jump} className="rounded border border-amber-400 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">Jump</button>
        </form>
        {loading && <span className="text-amber-700">loading candles…</span>}
        {note && <span className="text-amber-800">{note}</span>}
        <button type="button" onClick={onExit} className="ml-auto flex items-center gap-1 rounded border border-amber-400 px-1.5 py-0.5 font-medium hover:bg-amber-100"><X className="h-3 w-3" />Exit replay</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">Practice</span>
        <input className={`${field} w-16`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Practice quantity" />
        <button type="button" onClick={() => onTrade("buy", Number(qty))} className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:bg-emerald-700">Buy</button>
        <button type="button" onClick={() => onTrade("sell", Number(qty))} className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700">Sell</button>
        <button type="button" onClick={onFlatten} disabled={!pos} className="rounded border border-amber-400 px-2 py-0.5 hover:bg-amber-100 disabled:opacity-40">Flatten</button>
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (Number(stopAt) > 0) onStop(Number(stopAt)); }}>
          <input className={`${field} w-16`} inputMode="decimal" placeholder="stop" value={stopAt} onChange={(e) => setStopAt(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Practice stop price" />
          <button type="submit" disabled={!pos || !(Number(stopAt) > 0)} className="rounded border border-amber-400 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">Set stop</button>
        </form>
        <span className="tabular-nums">
          {pos ? `${pos > 0 ? "Long" : "Short"} ${sizeText(Math.abs(pos))} ${symbol} at ${px(acct.avg)}` : "Flat"}
          {stop ? ` · stop ${px(stop.stopPrice)}` : ""}
          {" · price "}{px(price)}
        </span>
        {value && <span className="ml-auto tabular-nums">Open {pnl(value.unrealized)} · Closed {pnl(value.realized)} · Equity {fmtMoney(value.equity)}{acct?.trades?.length ? ` · ${acct.trades.length} trade${acct.trades.length === 1 ? "" : "s"}` : ""}</span>}
      </div>
    </div>
  );
}
