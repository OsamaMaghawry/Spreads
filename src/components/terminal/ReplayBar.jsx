import { useState } from "react";
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, X, History } from "lucide-react";
import { px, sizeText } from "@/lib/terminal";
import { replayClock } from "@/lib/replay";
import { fmtMoney } from "@/lib/format";

// The replay's controls and its practice account, across the top of the
// chart while a replay runs (lib/replay.js has the rules). Amber throughout,
// so a replayed chart is never mistaken for the live one.

const UNITS = [["candle", "1 candle"], ["1Min", "1 minute"], ["5Min", "5 minutes"], ["15Min", "15 minutes"], ["1Hour", "1 hour"], ["1Day", "1 day"]];
const SPEEDS = [0.5, 1, 2, 5, 10];
const UNIT_WORDS = { candle: "one candle of the active chart", "1Min": "one minute", "5Min": "five minutes", "15Min": "15 minutes", "1Hour": "one hour", "1Day": "one day" };
const field = "rounded border border-amber-300 bg-white px-1 py-0.5 text-[11px] tabular-nums focus:outline-none";

const AT_CHOICES = [["open", "Open"], ["close", "Close"], ["time", "Time"]];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const plusDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const agoText = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * The form that starts a replay (`initial`: filled in, from the screener),
 * with the replays kept with the account above it to continue where they
 * were left (1 Nov: "I need to make sure that I can also save a specific test
 * that I can continue in later with its P&L and everything"). `daily`: the
 * active chart shows days or longer, so the replay starts at the day's close.
 */
export function ReplayStart({ crypto, onStart, onCancel, busy, initial = null, daily = false, saved = [], onContinue, onDelete }) {
  const now = today();
  const [from, setFrom] = useState(initial?.from || plusDays(now, -30));
  const [at, setAt] = useState(initial?.at || (daily ? "close" : "open"));
  const [time, setTime] = useState(initial?.time || (crypto ? "12:00" : "10:00"));
  const [to, setTo] = useState(initial?.to && initial.to <= now ? initial.to : now);
  const [sure, setSure] = useState(null);
  const why = !from || !to ? "Pick both dates."
    : from < "2016-01-04" ? "Alpaca's history starts in 2016."
      : from > now ? "Start on or before today."
        : to < from ? "End on or after the start."
          : Date.parse(to) - Date.parse(from) > 366 * 86400000 ? "At most a year at a time (a jump can go further)." : null;
  const where = at === "open" ? (crypto ? "From midnight UTC: the day's first minute is on the chart." : "From 9:30: the day's first minute is on the chart, the rest plays from there.")
    : at === "close" ? "The whole day on the chart, its daily candle complete; the next day plays from there."
      : `Everything up to ${time} ${crypto ? "UTC" : "New York"} on that day is on the chart.`;
  const pnl = (v) => <span className={v >= 0 ? "text-emerald-700" : "text-rose-700"}>{v >= 0 ? "+" : ""}{fmtMoney(v)}</span>;
  return (
    <div className="absolute left-0 z-30 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center gap-1 font-semibold text-slate-800"><History className="h-4 w-4 text-amber-600" />Bar replay</div>
      {saved.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Continue where you left it</div>
          <div className="max-h-48 space-y-1 overflow-auto">
            {saved.map((k) => {
              const p = (k.summary?.realized || 0) + (k.summary?.unrealized || 0);
              return (
                <div key={k.id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{k.name}</span>
                    <button type="button" onClick={() => onContinue(k)} className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700">Continue</button>
                    {sure === k.id ? (
                      <button type="button" onClick={() => { setSure(null); onDelete(k.id); }} className="rounded border border-rose-400 px-1.5 py-0.5 text-rose-700 hover:bg-rose-50">Delete</button>
                    ) : (
                      <button type="button" title="Delete this saved replay" aria-label={`Delete ${k.name}`} onClick={() => setSure(k.id)} className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <div className="text-[11px] tabular-nums text-slate-600">
                    at {replayClock(k.cursor, !!k.crypto)} · P&amp;L {pnl(p)} · {k.summary?.fills || 0} fill{k.summary?.fills === 1 ? "" : "s"} · saved {agoText(k.savedAt)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Or start a new one</div>
        </div>
      )}
      {!saved.length && <p className="mb-2 text-[11px] leading-snug text-slate-500">The charts go back to the day you pick and play forward from there, at every interval and every symbol you open, with a practice account. Nothing is sent to the broker. It is saved as it runs, to continue later.</p>}
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1.5">
        <label htmlFor="rp-from" className="text-slate-600">Day</label>
        <input id="rp-from" type="date" className="rounded border border-slate-300 px-1 py-0.5" value={from} max={now} min="2016-01-04" onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-600">Start at</span>
        <div className="flex items-center gap-1">
          <div className="flex overflow-hidden rounded border border-slate-300" role="group" aria-label="Start at">
            {AT_CHOICES.map(([id, name]) => (
              <button key={id} type="button" aria-pressed={at === id || (id === "time" && /:/.test(at))} onClick={() => setAt(id === "time" ? time : id)}
                className={`px-2 py-0.5 ${at === id || (id === "time" && /:/.test(at)) ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{name}</button>
            ))}
          </div>
          {/:/.test(at) && <input type="time" aria-label="Start time" className="w-20 rounded border border-slate-300 px-1 py-0.5" value={time} onChange={(e) => { setTime(e.target.value); setAt(e.target.value || "open"); }} />}
        </div>
        <label htmlFor="rp-to" className="text-slate-600">Until</label>
        <input id="rp-to" type="date" className="rounded border border-slate-300 px-1 py-0.5" value={to} max={now} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{where}</p>
      {why && <p className="mt-1 text-[11px] text-amber-700">{why}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!!why || busy} onClick={() => onStart({ from, at, to })}
          className="flex-1 rounded bg-amber-600 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-40">{busy ? "Loading…" : "Start replay"}</button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

/** The practice stop: a price, Set, and once set the level with an × to remove it. */
function StopField({ level, pos, onSet }) {
  const [text, setText] = useState("");
  const value = Number(text);
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (value > 0) { onSet("stop", value); setText(""); } }}>
      <input className={`${field} w-20`} inputMode="decimal" placeholder="stop" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Practice stop price" />
      <button type="submit" aria-label="Set stop" disabled={!pos || !(value > 0)} className="rounded border border-amber-400 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">Set</button>
      {level ? (
        <span className="flex items-center gap-0.5 rounded bg-rose-100 px-1 tabular-nums text-rose-800">
          Stop {px(level)} · all
          <button type="button" title="Remove the stop" aria-label="Remove the stop" onClick={() => onSet("stop", null)} className="rounded hover:bg-white/60"><X className="h-3 w-3" /></button>
        </span>
      ) : null}
    </form>
  );
}

/**
 * Take-profits, as many as wanted, each for part of the position: a price and
 * a size (blank for all that is left, "50%", or a number), then Add. Each set
 * one shows with its size and an × to remove it.
 */
function TargetField({ targets, pos, crypto, onAdd, onRemove }) {
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const value = Number(price);
  const sorted = [...targets].sort((a, b) => (pos > 0 ? a.price - b.price : b.price - a.price));
  return (
    <form className="flex flex-wrap items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (value > 0 && onAdd(value, size)) { setPrice(""); setSize(""); } }}>
      <input className={`${field} w-20`} inputMode="decimal" placeholder="take profit" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Practice take profit price" />
      <input className={`${field} w-12`} placeholder="all" title={`Size: blank for all that is left, a percentage like 50%, or a number of ${crypto ? "coins" : "shares"}`}
        value={size} onChange={(e) => setSize(e.target.value.replace(/[^\d.%a-zA-Z]/g, ""))} aria-label="Practice take profit size" />
      <button type="submit" aria-label="Add take profit" disabled={!pos || !(value > 0)} className="rounded border border-amber-400 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">Add</button>
      {sorted.map((t, i) => (
        <span key={t.id} className="flex items-center gap-0.5 rounded bg-emerald-100 px-1 tabular-nums text-emerald-800">
          TP{sorted.length > 1 ? i + 1 : ""} {px(t.price)} · {t.qty === null ? "rest" : sizeText(t.qty)}
          <button type="button" title="Remove this take-profit" aria-label={`Remove the take-profit at ${px(t.price)}`} onClick={() => onRemove(t.id)} className="rounded hover:bg-white/60"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </form>
  );
}

export default function ReplayBar({ clock, playing, loading, note, unit, speed, value, acct, price, symbol, crypto, trades = 0, name = "", savedAt = null, at = "open", onRename, onPlay, onStep, onStepBack, onRestart, onUnit, onSpeed, onJump, onExit, onTrade, onFlatten, onStop, onAddTarget, onRemoveTarget }) {
  const [qty, setQty] = useState(crypto ? "0.1" : "100");
  const [jump, setJump] = useState("");
  const [jumpAt, setJumpAt] = useState(at === "close" ? "close" : "open");
  const pos = acct?.qty || 0;
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
        {/* One candle back or forward (30 Oct: "if am on 29 daily interval, i
            want to click a button to move to 30 or back to 28"). */}
        <span className="flex items-center rounded border border-amber-400 bg-white">
          <button type="button" title={`Back ${UNIT_WORDS[unit] || "one candle"}`} aria-label="Step back" onClick={onStepBack} disabled={playing || loading}
            className="rounded-l px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <select className="border-x border-amber-300 bg-white px-1 py-0.5 text-[11px] focus:outline-none" value={unit} onChange={(e) => onUnit(e.target.value)} aria-label="Step">{UNITS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <button type="button" title={`Forward ${UNIT_WORDS[unit] || "one candle"}`} aria-label="Step forward" onClick={onStep} disabled={playing || loading}
            className="rounded-r px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </span>
        <label className="flex items-center gap-1">
          <select className={field} value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Speed">{SPEEDS.map((s) => <option key={s} value={s}>{s} per second</option>)}</select>
        </label>
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (jump) onJump(jump, jumpAt); }}>
          <input type="date" aria-label="Jump to" className={field} value={jump} min="2016-01-04" onChange={(e) => setJump(e.target.value)} />
          <select className={field} value={jumpAt} onChange={(e) => setJumpAt(e.target.value)} aria-label="Jump to the day's open or close">
            <option value="open">open</option><option value="close">close</option>
          </select>
          <button type="submit" disabled={!jump || loading} className="rounded border border-amber-400 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">Jump</button>
        </form>
        {loading && <span className="text-amber-700">loading candles…</span>}
        {note && <span className="text-amber-800">{note}</span>}
        <span className="ml-auto flex items-center gap-1">
          <input className={`${field} w-40`} value={name} onChange={(e) => onRename?.(e.target.value)} aria-label="This replay's name" title="Its name in the list of saved replays" />
          <span className="whitespace-nowrap text-[10px] text-amber-800" title="Kept with your account as it runs: continue it from Replay, after leaving it, a refresh or another device">
            {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Saving…"}
          </span>
        </span>
        <button type="button" onClick={onExit} title="Leave the replay; it stays saved to continue later" className="flex items-center gap-1 rounded border border-amber-400 px-1.5 py-0.5 font-medium hover:bg-amber-100"><X className="h-3 w-3" />Exit replay</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">Practice <b>{symbol}</b></span>
        <input className={`${field} w-16`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Practice quantity" />
        <button type="button" onClick={() => onTrade("buy", Number(qty))} className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:bg-emerald-700">Buy</button>
        <button type="button" onClick={() => onTrade("sell", Number(qty))} className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700">Sell</button>
        <button type="button" onClick={onFlatten} disabled={!pos} className="rounded border border-amber-400 px-2 py-0.5 hover:bg-amber-100 disabled:opacity-40">Flatten</button>
        <StopField level={acct?.stop} pos={pos} onSet={onStop} />
        <TargetField targets={acct?.targets || []} pos={pos} crypto={crypto} onAdd={onAddTarget} onRemove={onRemoveTarget} />
        <span className="tabular-nums">
          {pos ? `${pos > 0 ? "Long" : "Short"} ${sizeText(Math.abs(pos))} ${symbol} at ${px(acct.avg)}` : "Flat"}
          {" · price "}{px(price)}
        </span>
        {value && <span className="ml-auto tabular-nums" title="The whole practice account, every symbol">Open {pnl(value.unrealized)} · Closed {pnl(value.realized)} · Equity {fmtMoney(value.equity)}{trades ? ` · ${trades} fill${trades === 1 ? "" : "s"}` : ""}</span>}
      </div>
    </div>
  );
}
