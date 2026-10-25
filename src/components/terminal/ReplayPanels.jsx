import { useMemo } from "react";
import { px, sizeText, isCrypto } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { bookValue, bookTrips, tradeStats } from "@/lib/replay";

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
const HOW = { stop: "Stop", target: "Take-profit", "": "By hand" };
const how = (list) => list.map((w) => HOW[w] ?? w).join(", ") || "—";
const th = "whitespace-nowrap px-2 py-1 text-right font-medium";
const td = "whitespace-nowrap px-2 py-1 text-right";

/** What the practice book holds, symbol by symbol, with its stop and take-profits. */
export function PracticePositions({ book, priceOf, ended = false, onPick, onFlatten }) {
  const rows = Object.entries(book).filter(([, a]) => a.qty || a.trades.length);
  const v = bookValue(book, priceOf);
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
              const open = a.qty && last ? (last - a.avg) * a.qty : 0;
              return (
                <tr key={s} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1"><button type="button" className="font-semibold hover:underline" onClick={() => onPick?.(s)}>{s}</button></td>
                  <td className={td}>{a.qty ? `${a.qty > 0 ? "Long" : "Short"} ${sizeText(Math.abs(a.qty))}` : "Flat"}</td>
                  <td className={td}>{a.qty ? px(a.avg) : "—"}</td>
                  <td className={td}>{px(last)}</td>
                  <td className={`${td} ${tone(open)}`}>{a.qty ? money(open) : "—"}</td>
                  <td className={`${td} ${tone(a.realized)}`}>{money(a.realized)}</td>
                  <td className={td}>{a.stop ? px(a.stop) : "—"}</td>
                  <td className={td}>{a.targets.length ? [...a.targets].sort((x, y) => (a.qty > 0 ? x.price - y.price : y.price - x.price)).map((t) => `${px(t.price)} × ${t.qty === null ? "rest" : sizeText(t.qty)}`).join(", ") : "—"}</td>
                  <td className="px-1">{!ended && a.qty ? <button type="button" onClick={() => onFlatten?.(s)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-100">Flatten</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The results: the statistics, each symbol's share, and every round trip. */
export function ReplayResults({ book, priceOf, ended = false }) {
  const trips = useMemo(() => bookTrips(book), [book]);
  const stats = useMemo(() => tradeStats(trips), [trips]);
  const v = bookValue(book, priceOf);
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
  if (!trips.length) return <p className="px-3 py-4 text-xs text-slate-500">No practice trades yet. Results appear here as soon as a trade is made.</p>;
  const tiles = [
    ["Net P/L", money(v.realized + v.unrealized), tone(v.realized + v.unrealized), "Closed plus open"],
    ["Closed P/L", money(v.realized), tone(v.realized), "Profit taken, every symbol"],
    ["Open P/L", money(v.unrealized), tone(v.unrealized), "Positions still held, at the replay's price"],
    ["Trades", `${stats.trades}${stats.open ? ` + ${stats.open} open` : ""}`, "", "Round trips, flat to flat"],
    ["Win rate", stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}% (${stats.wins}/${stats.trades})`, "", "Closed trips that made money"],
    ["Profit factor", stats.profitFactor === null ? (stats.grossProfit > 0 ? "no losses" : "—") : stats.profitFactor.toFixed(2), "", "Gross profit ÷ gross loss"],
    ["Average win", money(stats.avgWin), tone(stats.avgWin), ""],
    ["Average loss", money(stats.avgLoss), tone(stats.avgLoss), ""],
    ["Expectancy", money(stats.expectancy), tone(stats.expectancy), "The average closed trip"],
    ["Largest win", money(stats.largestWin), tone(stats.largestWin), ""],
    ["Largest loss", money(stats.largestLoss), tone(stats.largestLoss), ""],
    ["Average hold", held(stats.avgHold), "", "Replay time, open to close"]
  ];
  return (
    <div className="h-full overflow-auto text-xs tabular-nums">
      {ended && <p className="border-b border-slate-100 bg-amber-50 px-2 py-1 text-amber-950">The last replay, as it stood when it ended. A new replay starts a fresh account.</p>}
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
            <th className={th}>P/L</th><th className={th}>Return</th><th className={th}>Held</th><th className={th}>Closed by</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={`${t.symbol}${t.entryTime}${i}`} className="border-t border-slate-100">
              <td className="px-2 py-1 text-slate-400">{i + 1}</td>
              <td className="px-2 py-1 font-semibold">{t.symbol}</td>
              <td className={`${td} ${t.side === "long" ? "text-emerald-700" : "text-rose-700"}`}>{t.side === "long" ? "Long" : "Short"}</td>
              <td className={td}>{when(t.entryTime, t.symbol)}</td>
              <td className={td}>{t.open ? <span className="rounded bg-amber-100 px-1 text-amber-800">open</span> : when(t.exitTime, t.symbol)}</td>
              <td className={td}>{sizeText(t.size)}</td>
              <td className={td}>{px(t.avgEntry)}</td>
              <td className={td}>{t.avgExit === null ? "—" : px(t.avgExit)}</td>
              <td className={`${td} font-medium ${tone(t.realized)}`}>{t.open && !t.closedQty ? "—" : money(t.realized)}</td>
              <td className={`${td} ${tone(t.realized)}`}>{t.returnPct === null ? "—" : `${t.returnPct >= 0 ? "+" : ""}${(t.returnPct * 100).toFixed(2)}%`}</td>
              <td className={td}>{t.open ? "—" : held(t.exitTime - t.entryTime)}</td>
              <td className={td}>{how(t.closedBy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 py-1 text-[10px] text-slate-400">Practice trades in the replay, filled at the replayed prices with no commission or slippage. Return is on the cost of the part closed.</p>
    </div>
  );
}
