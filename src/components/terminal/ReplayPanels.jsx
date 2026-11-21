import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { px, pxFor, sizeText, isCrypto } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { bookValue, bookTrips, tradeStats, replayDate, practiceValue } from "@/lib/replay";
import { demoBook, periodStart, customPeriod, customBounds, tradingDay } from "@/lib/demoTrades";
import useAccountSetting from "./useAccountSetting";

// The replay's practice book in the account window: what is held in each
// symbol, and the results of the trades (25 Oct: "p/l taking the numbers
// based on the buy and sell happened on the reply"). The arithmetic is
// lib/replay.js; the book is components/terminal/useReplay.js's.

const money = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${fmtMoney(v)}`);
const tone = (v) => (v > 1e-9 ? "text-emerald-700" : v < -1e-9 ? "text-rose-700" : "text-slate-600");
const when = (t, symbol) => (t ? new Date(t * 1000).toLocaleString("en-US", { timeZone: isCrypto(symbol) ? "UTC" : "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "open");
const held = (s) => {
  if (s === null || !Number.isFinite(s)) return "—";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
};
const HOW = { stop: "Stop", target: "Take-profit", limit: "Limit order", stoporder: "Stop order", "": "By hand" };
const how = (list) => list.map((w) => HOW[w] ?? w).join(", ") || "—";
const th = "whitespace-nowrap px-2 py-1 text-right font-medium";
const td = "whitespace-nowrap px-2 py-1 text-right";

/** What the practice book holds, symbol by symbol, with its stop and take-profits, and every fill. */
export function PracticePositions({ book, priceOf, start = undefined, ended = false, onPick, onFlatten, onCancel, onReprice, onCancelOrder }) {
  const rows = Object.entries(book).filter(([, a]) => a.qty || a.trades.length);
  // The practice orders at a price still working, symbol by symbol.
  const orders = ended ? [] : Object.entries(book).flatMap(([s, a]) => (a.orders || []).map((o) => ({ ...o, symbol: s })));
  // A fill's price being changed: which one, and the price typed.
  const [pricing, setPricing] = useState(null);
  // A challenge's account starts at its account size (useReplay startOf).
  const v = bookValue(book, priceOf, start);
  // Every fill, newest first, each with its place in its symbol's list.
  const fills = Object.entries(book).flatMap(([s, a]) => a.trades.map((t, i) => ({ ...t, symbol: s, index: i }))).sort((a, b) => b.time - a.time);
  const [sure, setSure] = useState(null);
  return (
    <div className="h-full overflow-auto text-xs tabular-nums">
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-slate-100 bg-amber-50 px-2 py-1 text-amber-950">
        <span className="font-semibold">{ended ? "Last replay, when it ended" : "Practice account (replay)"}</span>
        <span>Equity {fmtMoney(v.equity)}</span>
        <span>Open <b className={tone(v.unrealized)}>{money(v.unrealized)}</b></span>
        <span>Closed <b className={tone(v.realized)}>{money(v.realized)}</b></span>
      </div>
      {rows.length === 0 ? <p className="px-3 py-4 text-slate-500">No practice trades yet. Buy or sell from the replay bar or with your hotkeys.</p> : (
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Symbol</th><th className={th}>Position</th><th className={th}>Avg</th><th className={th}>Last</th>
              <th className={th}>Open P/L</th><th className={th}>Closed P/L</th><th className={th}>Stop</th><th className={th}>Take-profits</th><th className="px-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map(([s, a]) => {
              const last = priceOf(s);
              const open = a.qty && last ? practiceValue(a, last).unrealized : 0;
              return (
                <tr key={s} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1"><button type="button" className="font-semibold hover:underline" onClick={() => onPick?.(s)}>{s}</button></td>
                  <td className={td}>{a.qty ? `${a.qty > 0 ? "Long" : "Short"} ${sizeText(Math.abs(a.qty))}` : "Flat"}</td>
                  <td className={td}>{a.qty ? pxFor(s, a.avg) : "—"}</td>
                  <td className={td}>{pxFor(s, last)}</td>
                  <td className={`${td} ${tone(open)}`}>{a.qty ? money(open) : "—"}</td>
                  <td className={`${td} ${tone(a.realized)}`}>{money(a.realized)}</td>
                  <td className={td}>{a.stop ? pxFor(s, a.stop) : "—"}</td>
                  <td className={td}>{a.targets.length ? [...a.targets].sort((x, y) => (a.qty > 0 ? x.price - y.price : y.price - x.price)).map((t) => `${pxFor(s, t.price)} × ${t.qty === null ? "rest" : sizeText(t.qty)}`).join(", ") : "—"}</td>
                  <td className="px-1">{!ended && a.qty ? <button type="button" onClick={() => onFlatten?.(s)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-100">Flatten</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {orders.length > 0 && (
        <>
          <div className="border-y border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
            Working orders <span className="font-normal text-slate-400">· each fills when the replay reaches its price</span>
          </div>
          <table className="w-full">
            <tbody>
              {orders.map((o) => (
                <tr key={`${o.symbol}:${o.id}`} className="border-t border-slate-100">
                  <td className="px-2 py-1 font-semibold">{o.symbol}</td>
                  <td className={`${td} ${o.side === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{o.side === "buy" ? "Buy" : "Sell"} {o.kind} {sizeText(o.qty)}</td>
                  <td className={td}>at {px(o.price)}</td>
                  <td className="px-1 text-right">
                    <button type="button" onClick={() => onCancelOrder?.(o.symbol, o.id)} className="inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-rose-400 hover:text-rose-700"><X className="h-3 w-3" />Cancel order</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {fills.length > 0 && (
        <>
          <div className="border-y border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
            Fills <span className="font-normal text-slate-400">· click a price to change it, or cancel a mistake: the position, the P&amp;L and the statistics follow</span>
          </div>
          <table className="w-full">
            <tbody>
              {fills.map((f) => {
                const key = `${f.symbol}:${f.index}`;
                return (
                  <tr key={`${key}:${f.time}`} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-500">{when(f.time, f.symbol)}</td>
                    <td className="px-2 py-1 font-semibold">{f.symbol}</td>
                    <td className={`${td} ${f.side === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{f.side === "buy" ? "Buy" : "Sell"} {sizeText(f.qty)}</td>
                    <td className={td}>
                      {pricing?.key === key ? (
                        <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (onReprice?.(f.symbol, f.index, Number(pricing.text)) !== false) setPricing(null); }}>
                          at <input autoFocus inputMode="decimal" value={pricing.text} onChange={(e) => setPricing({ key, text: e.target.value.replace(/[^\d.]/g, "") })}
                            aria-label="Fill price" className="w-20 rounded border border-amber-400 px-1 py-0.5 text-right" />
                          <button type="submit" className="rounded bg-amber-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Set</button>
                          <button type="button" onClick={() => setPricing(null)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]">Keep</button>
                          {f.range && <span className="text-[10px] text-slate-500">candle traded {px(f.range.low)} to {px(f.range.high)}</span>}
                        </form>
                      ) : (
                        <button type="button" disabled={!onReprice} onClick={() => setPricing({ key, text: String(f.price) })}
                          title="Change the price"
                          className="rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-amber-50 disabled:no-underline">at {px(f.price)}</button>
                      )}
                      {f.was && pricing?.key !== key ? <span className="ml-1 text-[10px] text-slate-400">was {px(f.was)}</span> : null}
                    </td>
                    <td className={`${td} text-slate-400`}>{HOW[f.why] ?? f.why ?? ""}</td>
                    <td className="px-1 text-right">
                      {sure === key ? (
                        <span className="inline-flex gap-1">
                          <button type="button" onClick={() => { setSure(null); onCancel?.(f.symbol, f.index); }} className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Cancel it</button>
                          <button type="button" onClick={() => setSure(null)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]">Keep</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setSure(key)} title="Cancel this fill: as if it had never been made"
                          className="inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-rose-400 hover:text-rose-700"><X className="h-3 w-3" />Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const dayText = (t, crypto) => new Date(`${replayDate(t, crypto)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/**
 * Every replay kept with the account, to read again whenever (1 Nov, the
 * owner: "save the results. So it doesn't go away. So I can revise them
 * wherever, whenever ... Even I started a new one, even I started a new
 * date"): the one picked with its statistics and round trips, renamed,
 * continued, or deleted (asked first). `current`: the replay running.
 */
export function SavedResults({ saved = [], current = null, onRename, onDelete, onContinue }) {
  const [pick, setPick] = useState(null);
  const [sure, setSure] = useState(false);
  const [naming, setNaming] = useState(null);
  const others = saved.filter((k) => k.id !== current?.id);
  const id = (pick && (pick === current?.id || others.some((k) => k.id === pick))) ? pick : current?.id ?? others[0]?.id ?? null;
  const shown = current && current.id === id ? current : others.find((k) => k.id === id);
  if (!shown) return <p className="px-3 py-4 text-xs text-slate-500">No replays saved yet. Every replay is saved as it runs and stays here until you delete it.</p>;
  const running = !!current && shown.id === current.id;
  const kept = saved.find((k) => k.id === shown.id);
  const priceOf = running ? current.priceOf : (s) => shown.prices?.[s] ?? null;
  const net = (k) => (k.summary ? (k.summary.realized || 0) + (k.summary.unrealized || 0) : 0);
  const label = (k) => `${k.name} · ${dayText(k.start, k.crypto)} to ${dayText(k.cursor, k.crypto)} · ${k.summary?.fills || 0} fills · ${money(net(k))}`;
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-amber-50 px-2 py-1 text-amber-950">
        <select value={id} onChange={(e) => { setPick(e.target.value); setSure(false); setNaming(null); }} aria-label="Saved replay"
          className="min-w-0 max-w-full flex-1 rounded border border-amber-300 bg-white px-1 py-0.5 sm:max-w-md">
          {current && <option value={current.id}>Running now: {current.name}</option>}
          {others.map((k) => <option key={k.id} value={k.id}>{label(k)}</option>)}
        </select>
        {naming !== null ? (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); onRename?.(shown.id, naming); setNaming(null); }}>
            <input value={naming} onChange={(e) => setNaming(e.target.value)} maxLength={80} aria-label="New name" className="w-40 rounded border border-amber-300 px-1 py-0.5" />
            <button type="submit" className="rounded bg-amber-600 px-1.5 py-0.5 font-semibold text-white">Rename</button>
          </form>
        ) : (
          <button type="button" onClick={() => setNaming(shown.name || "")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">Rename</button>
        )}
        {!running && <button type="button" onClick={() => onContinue?.(kept)} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">Continue it</button>}
        {!running && (sure ? (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => { setSure(false); setPick(null); onDelete?.(shown.id); }} className="rounded bg-rose-600 px-1.5 py-0.5 font-semibold text-white">Delete it for good</button>
            <button type="button" onClick={() => setSure(false)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setSure(true)} className="rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50">Delete…</button>
        ))}
        <span className="ml-auto text-[10px] text-amber-800">{saved.length} saved</span>
      </div>
      <div className="min-h-0 flex-1">
        <TradeResults book={shown.book || {}} priceOf={priceOf} start={shown.challenge?.rules?.accountSize}
          banner={running ? null : `${shown.name}: ${dayText(shown.start, shown.crypto)} to ${dayText(shown.cursor, shown.crypto)}, as saved ${new Date(shown.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Open positions at the replay's price then.`}
          empty="No practice trades in this replay." openHint="Positions still held, at the replay's price" holdHint="Replay time, open to close"
          note="Practice trades in the replay, filled at the replayed prices with no slippage. Shares and coins pay no commission; futures pay the commission set under Futures ▸ Settings, net in their P&L. Return is on the cost of the part closed, shown for shares and coins only (futures show points)." />
      </div>
    </div>
  );
}

/**
 * The statistics, each symbol's share, and every round trip of a book: the
 * replay's practice book, or the demo account's from its fills. `carriedAt`:
 * when holdings from before were brought in (the demo's), shown as such;
 * `showHow`: the column of what closed each trip, known in the replay only.
 */
export function TradeResults({ book, priceOf, start = undefined, banner = null, empty, openHint, holdHint, note, carriedAt = null, showHow = true, netHint = "Closed plus open", closedHint = "Profit taken, every symbol" }) {
  const trips = useMemo(() => bookTrips(book), [book]);
  const stats = useMemo(() => tradeStats(trips), [trips]);
  const v = bookValue(book, priceOf, start);
  const bySymbol = useMemo(() => {
    const out = {};
    for (const t of trips) {
      const x = out[t.symbol] || (out[t.symbol] = { trips: 0, wins: 0, closed: 0, realized: 0 });
      x.trips += 1;
      x.realized += t.realized;
      if (!t.open) { x.closed += 1; if (t.realized > 1e-9) x.wins += 1; }
    }
    return Object.entries(out).sort((a, b) => b[1].realized - a[1].realized);
  }, [trips]);
  if (!trips.length) return <p className="px-3 py-4 text-xs text-slate-500">{empty}</p>;
  const tiles = [
    ["Net P/L", money(v.realized + v.unrealized), tone(v.realized + v.unrealized), netHint],
    ["Closed P/L", money(v.realized), tone(v.realized), closedHint],
    ["Open P/L", money(v.unrealized), tone(v.unrealized), openHint],
    ["Trades", `${stats.trades}${stats.open ? ` + ${stats.open} open` : ""}`, "", "Round trips, flat to flat"],
    ["Win rate", stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}% (${stats.wins}/${stats.trades})`, "", "Closed trips that made money"],
    ["Profit factor", stats.profitFactor === null ? (stats.grossProfit > 0 ? "no losses" : "—") : stats.profitFactor.toFixed(2), "", "Gross profit ÷ gross loss"],
    ["Average win", money(stats.avgWin), tone(stats.avgWin), ""],
    ["Average loss", money(stats.avgLoss), tone(stats.avgLoss), ""],
    ["Expectancy", money(stats.expectancy), tone(stats.expectancy), "The average closed trip"],
    ["Largest win", money(stats.largestWin), tone(stats.largestWin), ""],
    ["Largest loss", money(stats.largestLoss), tone(stats.largestLoss), ""],
    ["Average hold", held(stats.avgHold), "", holdHint]
  ];
  return (
    <div className="h-full overflow-auto text-xs tabular-nums">
      {banner && <p className="border-b border-slate-100 bg-amber-50 px-2 py-1 text-amber-950">{banner}</p>}
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(([name, value, color, hint]) => (
          <div key={name} className="bg-white px-2 py-1" title={hint}>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{name}</div>
            <div className={`text-sm font-semibold ${color}`}>{value}</div>
          </div>
        ))}
      </div>
      {bySymbol.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-y border-slate-100 px-2 py-1">
          {bySymbol.map(([s, x]) => (
            <span key={s}><b>{s}</b> <span className={tone(x.realized)}>{money(x.realized)}</span> · {x.trips} trade{x.trips === 1 ? "" : "s"}{x.closed ? `, ${Math.round((x.wins / x.closed) * 100)}% won` : ""}</span>
          ))}
        </div>
      )}
      <table className="w-full">
        <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left font-medium">#</th><th className="px-2 py-1 text-left font-medium">Symbol</th><th className={th}>Side</th>
            <th className={th}>Opened</th><th className={th}>Closed</th><th className={th}>Size</th><th className={th}>Avg in</th><th className={th}>Avg out</th>
            <th className={th}>P/L</th><th className={th}>Return</th><th className={th}>Held</th>{showHow && <th className={th}>Closed by</th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={`${t.symbol}${t.entryTime}${i}`} className="border-t border-slate-100">
              <td className="px-2 py-1 text-slate-400">{i + 1}</td>
              <td className="px-2 py-1 font-semibold">{t.symbol}</td>
              <td className={`${td} ${t.side === "long" ? "text-emerald-700" : "text-rose-700"}`}>{t.side === "long" ? "Long" : "Short"}</td>
              <td className={td}>{carriedAt !== null && t.entryTime === carriedAt ? <span className="rounded bg-slate-100 px-1 text-slate-600" title="Held from before; counted from the last close before then">held before</span> : when(t.entryTime, t.symbol)}</td>
              <td className={td}>{t.open ? <span className="rounded bg-amber-100 px-1 text-amber-800">open</span> : when(t.exitTime, t.symbol)}</td>
              <td className={td}>{sizeText(t.size)}</td>
              <td className={td}>{px(t.avgEntry)}</td>
              <td className={td}>{t.avgExit === null ? "—" : px(t.avgExit)}</td>
              <td className={`${td} font-medium ${tone(t.realized)}`}>{t.open && !t.closedQty ? "—" : money(t.realized)}</td>
              <td className={`${td} ${tone(t.realized)}`}>{t.returnPct === null ? "—" : `${t.returnPct >= 0 ? "+" : ""}${(t.returnPct * 100).toFixed(2)}%`}</td>
              <td className={td}>{t.open ? "—" : held(t.exitTime - t.entryTime)}</td>
              {showHow && <td className={td}>{how(t.closedBy)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 py-1 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}

const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "30 days"], ["custom", "Custom"]];
const DEMO_REFRESH_MS = 30000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanPeriod = (v) => ({
  id: PERIODS.some(([id]) => id === v?.id) ? v.id : "today",
  from: DATE.test(String(v?.from)) ? v.from : "",
  to: DATE.test(String(v?.to)) ? v.to : ""
});
const dayName = (sec) => new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const dateName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
// Alpaca's names for what moved shares without a trade (functions/terminal accountFills).
const EVENT_NAMES = {
  OPASN: "option assignment", OPEXC: "option exercise", SPLIT: "split", SSP: "split", SPIN: "spin-off", SSO: "spin-off",
  MA: "merger", NC: "name change", SC: "symbol change", REO: "reorganisation", REORG: "reorganisation", ACATS: "transfer",
  JNLS: "share journal", OPCA: "option corporate action", FOPT: "transfer", VOF: "voluntary offer", EXTRD: "trade outside Alpaca",
  DVF: "settlement", OPTRD: "option delivery"
};

/**
 * The account's share and coin results, from its own fills (functions/terminal
 * "fills"): today's, the last 7 or 30 days', or a custom period's (19 Nov, the
 * owner: "for the P/L, I need custom period too"), read again every half
 * minute and after each order (`refreshKey`) while the period runs to now.
 * The period picked is kept with the person's account. A custom period that
 * has ended values what was still held then at that day's regular close, as
 * Alpaca's day does (the owner: "So the close same as Alpaca"). Shares that
 * moved without a trade: an assignment's or exercise's at the strike; a
 * split's, a transfer's or another corporate action's symbol is held back.
 */
export function DemoResults({ accountId, refreshKey = null }) {
  const [pick, setPick] = useAccountSetting("plperiod", { localKey: "dm.terminal.plperiod", initial: () => cleanPeriod(null), clean: cleanPeriod });
  const period = pick.id;
  const bounds = customBounds();
  const from = pick.from || bounds.max;
  const to = pick.to || bounds.max;
  const custom = period === "custom";
  const win = custom ? customPeriod(from, to) : { start: periodStart(period), end: null };
  const [state, setState] = useState({ key: "", data: null, error: null, loading: false });
  const [showNotes, setShowNotes] = useState(false);
  const key = win ? `${accountId}|${period}|${win.start}|${win.end ?? "now"}` : "";
  // A period that has ended does not change with an order, and nothing can be
  // shown from a read cut short: neither is read again after one (19 Nov review).
  const cutShort = state.key === key && !!state.data?.truncated;
  // Held at its last value once cut short, so the effect does not run (and read) once more.
  const lastRefresh = useRef(refreshKey);
  if (!cutShort) lastRefresh.current = refreshKey;
  const reread = win && win.end === null ? (cutShort ? lastRefresh.current : refreshKey) : null;
  useEffect(() => {
    if (!accountId || !win) return undefined;
    let alive = true;
    let timer = null;
    const { start, end } = win;
    // Read again while the period runs: every half minute, every two once
    // there are hundreds of fills to read each time.
    const again = (ms) => { if (alive && end === null) timer = setTimeout(load, ms); };
    function load() {
      if (document.visibilityState === "hidden") { again(DEMO_REFRESH_MS); return; }
      setState((s) => ({ ...s, loading: true }));
      const req = { action: "fills", accountId, start: new Date(start * 1000).toISOString(), custom };
      if (end !== null) req.end = new Date(end * 1000).toISOString();
      invokeFunction("terminal", req).then((r) => {
        if (!alive) return;
        if (r?.data?.error || !r?.data) setState({ key, data: null, error: r?.data?.error || "Your fills could not be read.", loading: false });
        else setState({ key, data: { ...r.data, startSec: start, endSec: r.data.end ? Date.parse(r.data.end) / 1000 : null }, error: null, loading: false });
        if (!r?.data?.truncated) again((r?.data?.fills?.length || 0) > 300 ? 4 * DEMO_REFRESH_MS : DEMO_REFRESH_MS);
      });
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [accountId, key, reread]);
  const data = state.key === key && key ? state.data : null;
  // Ended as the server read it: its closes are there.
  const ended = data ? data.endSec !== null : false;
  const heldBack = data?.heldBack || [];
  const skip = new Set(heldBack.map((e) => e.symbol).filter(Boolean));
  const named = heldBack.filter((e) => e.symbol);
  const unnamed = heldBack.filter((e) => !e.symbol);
  // A period that has ended, with the movements that were not trades unread:
  // one after it would be read into it, so nothing is shown.
  const unchecked = !!data && ended && data.eventsRead === false;
  const built = useMemo(() => {
    if (!data || data.truncated || unchecked) return null;
    const keep = (s) => !skip.has(s);
    return demoBook({
      fills: data.fills.filter((f) => keep(f.symbol)), positions: Object.fromEntries(Object.entries(data.positions).filter(([s]) => keep(s))),
      marks: data.marks, start: data.startSec, end: data.endSec, fees: (data.fees || []).filter((f) => keep(f.symbol))
    });
  }, [data, unchecked]);
  const priceOf = (s) => (ended ? data?.endMarks?.[s] ?? null : data?.positions?.[s]?.last ?? null);
  const carried = built ? Object.keys(built.carried).length : 0;
  const fromCost = built ? Object.entries(built.carried).filter(([, c]) => c.from === "cost").map(([s]) => s) : [];
  const unpriced = built && ended ? Object.entries(built.book).filter(([s, a]) => a.qty && !(data.endMarks?.[s] > 0)).map(([s]) => s) : [];
  const inWindow = (f) => f.time >= data.startSec && (!ended || f.time < data.endSec);
  const fillCount = data ? data.fills.filter((f) => !f.delivery && inWindow(f)).length : 0;
  const delivered = data && built ? data.fills.filter((f) => f.delivery && inWindow(f) && !skip.has(f.symbol)) : [];
  const fillText = `${fillCount} fill${fillCount === 1 ? "" : "s"}`;
  const closeName = ended ? (data.endClose ? dateName(data.endClose) : dayName(data.endSec - 3600)) : "";
  const label = !data ? (state.loading && win ? "Reading your fills…" : "")
    : custom ? `${fillText} from ${dayName(data.startSec)}, 8:00 p.m., to ${ended ? `${dayName(data.endSec - 3600)}, 8:00 p.m.` : "now"}`
      : `${fillText} since ${dayName(data.startSec)}, 8:00 p.m.${period === "today" ? ", when after-hours ended" : ""}`;
  const setDates = (next) => setPick((p) => ({ ...p, from, to, ...next }));
  // What to know about the figures, folded into one button by the period so
  // the figures stay in view in a short panel (19 Nov, the owner: "I can't
  // see nothing from all this text you put").
  const notes = [
    ...(built && named.length ? [{ warn: true, short: `${named.length} left out`, text: `Left out: ${named.map((e) => `${e.symbol} (${e.type === "SPLIT_SINCE" ? "a split since the start" : `${EVENT_NAMES[e.type] || e.type} on ${dateName(e.date)}`})`).join(", ")}. Shares changed without a trade, so these figures cannot be worked out from the fills.` }] : []),
    ...(built && unnamed.length ? [{ warn: true, short: "unnamed event", text: `Alpaca recorded ${unnamed.map((e) => `a ${EVENT_NAMES[e.type] || e.type} on ${dateName(e.date)}`).join(", ")} without naming the stock: if it moved shares you held, that stock's figures here are off.` }] : []),
    ...(delivered.length ? [{ warn: false, short: `${delivered.length} from options`, text: `Includes shares from options: ${delivered.map((f) => `${f.symbol} ${f.side === "buy" ? "bought" : "sold"} ${sizeText(f.qty)} at ${px(f.price)} on ${dateName(tradingDay(f.time))}`).join(", ")}, at the strike. What the option itself made or lost is not here.` }] : []),
    ...(built && data.eventsRead === false ? [{ warn: true, short: "not all checked", text: "Assignments, splits and transfers could not be checked this time: if a symbol had one since the start, its figures are off." }] : []),
    ...(fromCost.length ? [{ warn: true, short: `${fromCost.length} from cost`, text: `No close found before the start for ${fromCost.join(", ")}: counted from the average cost now, or else its first trade in the period.` }] : []),
    ...(unpriced.length ? [{ warn: true, short: `${unpriced.length} without a close`, text: `No close found for ${unpriced.join(", ")} at the end: held at cost, with no open P/L.` }] : [])
  ];
  const dateInput = "rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-700";
  const optionsText = data?.options ? `options not included (${data.options} fill${data.options === 1 ? "" : "s"})` : "shares and coins only";
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2 py-1">
        <span className="font-semibold text-slate-700">Share and coin P/L</span>
        <div className="flex overflow-hidden rounded border border-slate-200" role="group" aria-label="Period">
          {PERIODS.map(([id, name]) => (
            <button key={id} type="button" onClick={() => setPick((p) => ({ ...p, id }))} className={`px-2 py-0.5 ${period === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
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
        <span className="text-slate-500">{label}</span>
        {notes.length > 0 && (
          <button type="button" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} title="What to know about these figures"
            className={`rounded border px-1.5 py-0.5 text-[11px] ${notes.some((x) => x.warn) ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {`${notes.map((x) => x.short).join(" · ")} ${showNotes ? "▴" : "▾"}`}
          </button>
        )}
      </div>
      {custom && !win && <p className="px-2 py-1 text-amber-800">Pick dates with at least one trading day, within the last 92 days.</p>}
      {state.error && state.key === key && <p className="px-2 py-1 text-rose-700">{state.error}</p>}
      {data?.truncated && <p className="px-2 py-1 text-amber-800">{`More than ${custom ? "3,000" : "1,000"} fills from the start to now, so what was held at the start cannot be worked out and no figures are shown. ${custom ? "Choose a later From date." : "Choose a shorter period."}`}</p>}
      {unchecked && <p className="px-2 py-1 text-amber-800">Assignments, splits and transfers since the start could not all be read, so what was held then cannot be worked out and no figures are shown. Try again, or choose a later From date.</p>}
      {showNotes && notes.length > 0 && (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto border-b border-slate-100 px-2 py-1 text-[11px] leading-snug">
          {notes.map((x) => <li key={x.short} className={x.warn ? "text-amber-800" : "text-slate-600"}>{x.text}</li>)}
        </ul>
      )}
      <div className="min-h-0 flex-1">
        {built && (
          <TradeResults book={built.book} priceOf={priceOf} carriedAt={data.startSec} showHow={false}
            empty={`No share or coin trades ${period === "today" ? "today" : "in this period"}, and nothing held.`}
            netHint={`Closed plus open; ${optionsText}`}
            closedHint={carried ? "Profit taken; what was held before counts from the close before the period" : "Profit taken, every symbol"}
            openHint={ended ? `Positions still held at the end, at ${closeName}'s regular close` : "Positions still held, at the last price"} holdHint="Open to close"
            note={`From this account's own share and coin fills at Alpaca; options are not in it, nor commission, fees, dividends or interest. ${carried ? `Held from before the period (${carried} symbol${carried === 1 ? "" : "s"}): counted from the last regular close before then (a coin: its last daily close, UTC), not from what was paid; "held before" in the list. ` : ""}${ended ? "Trades after the period are left out; what was still held at its end is valued at that day's regular close (a coin: its daily close, UTC). " : ""}Shares delivered by an option assignment or exercise count as bought or sold at the strike, from the start of that trading day. Coin fees taken in the coin are left out: those coins count as never bought. Return is on the cost of the part closed.`} />
        )}
      </div>
    </div>
  );
}
