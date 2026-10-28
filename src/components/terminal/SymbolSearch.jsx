import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { invokeFunction } from "@/lib/functions";

// Any symbol on the chart, from the chart itself (28 Oct: "I want to be able
// to change the chart and the stock on focus from the chart itself not only
// to add it first to the watchlist then open it"). Opened by clicking the
// chart's symbol, or by typing a letter while the terminal has the focus, as
// on a desk platform. Enter takes the first match (or the symbol as typed),
// arrows move through the list, Esc closes; the watchlist is left as it is
// unless "+" is pressed beside a match.
const SHAPE = /^[A-Z][A-Z0-9.]{0,9}(\/[A-Z]{3,5})?$/;

export default function SymbolSearch({ accountId, initial = "", onPick, onAdd, onClose, watch = [], className = "" }) {
  const [text, setText] = useState(initial);
  const [matches, setMatches] = useState([]);
  const [at, setAt] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const q = text.trim();
    if (!q || !accountId) { setMatches([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      invokeFunction("terminal", { action: "search", accountId, q }).then((r) => {
        if (!alive) return;
        setMatches((r?.data?.results || []).slice(0, 10));
        setAt(0);
      });
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [text, accountId]);
  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [onClose]);
  const typed = text.trim().toUpperCase();
  const pick = (s) => { onPick(s); onClose(); };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, matches.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      // The match whose symbol is exactly what was typed, else the one marked.
      const exact = matches.find((m) => m.symbol === typed);
      if (exact || matches[at]) pick((exact || matches[at]).symbol);
      else if (SHAPE.test(typed)) pick(typed);
    }
  };
  return (
    <div ref={box} className={`z-40 w-80 rounded-md border border-slate-200 bg-white p-1.5 text-xs shadow-lg ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          placeholder="Symbol, company or coin" aria-label="Chart a symbol"
          className="w-full rounded border border-slate-300 py-1 pl-7 pr-2 text-sm uppercase placeholder:normal-case focus:border-emerald-500 focus:outline-none" />
      </div>
      <div className="mt-1 max-h-72 overflow-auto">
        {matches.map((r, i) => (
          <div key={r.symbol} onMouseEnter={() => setAt(i)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 ${i === at ? "bg-emerald-50" : ""}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => pick(r.symbol)}>
              <span className="font-semibold">{r.symbol}</span>
              <span className="truncate text-slate-500">{r.name}</span>
              {r.assetClass === "crypto" && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Crypto</span>}
            </button>
            {onAdd && !watch.includes(r.symbol) && (
              <button type="button" title={`Add ${r.symbol} to the watchlist`} onClick={() => onAdd(r.symbol)}
                className="shrink-0 rounded border border-emerald-300 px-1 text-[10px] text-emerald-700 hover:bg-emerald-50">
                <Plus className="inline h-3 w-3" />List
              </button>
            )}
          </div>
        ))}
        {!matches.length && typed && (
          <p className="px-2 py-1 text-slate-500">{SHAPE.test(typed) ? <>Enter to chart <b>{typed}</b></> : "No match yet"}</p>
        )}
      </div>
      <p className="mt-1 border-t border-slate-100 px-1 pt-1 text-[10px] text-slate-400">Enter: chart it · ↑↓: choose · Esc: close · the watchlist stays as it is</p>
    </div>
  );
}
