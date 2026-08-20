import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { fmtMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { spreadLegs } from "@/lib/spreadLegs";

// Per-leg detail shown beneath an expanded spread row.
export default function LegRows({ spread, colSpan, onCloseLeg }) {
  const [quotes, setQuotes] = useState(null);
  const [loading, setLoading] = useState(true);
  // Prefer the backend-paired legs; fall back to deriving them from the spread's
  // symbols so the row always expands.
  const legs = (spread.legs && spread.legs.length ? spread.legs : spreadLegs(spread)).map((l) => ({
    ...l,
    entryPrice: l.entryPrice ?? (l.side === "short" ? spread.shortEntryPrice : spread.longEntryPrice),
    currentPrice: l.currentPrice ?? (l.side === "short" ? spread.shortCurrentPrice : spread.longCurrentPrice)
  }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      legs.map((l) =>
        base44.functions
          .invoke("spreadQuote", {
            accountId: spread.accountId,
            legs: [{ symbol: l.symbol, ratio: 1, action: "buy_to_close" }]
          })
          .then((res) => [l.symbol, res.data])
          .catch(() => [l.symbol, null])
      )
    ).then((pairs) => {
      if (!alive) return;
      setQuotes(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.accountId, legs.map((l) => l.symbol).join(",")]);

  if (legs.length === 0) return null;

  return (
    <tr className="bg-slate-50/70 border-b border-slate-200">
      <td colSpan={colSpan} className="p-0">
        <div className="sticky left-0 w-[min(920px,100vw-4rem)] px-8 py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
          Individual legs
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <div className="grid grid-cols-[minmax(160px,1.4fr)_repeat(5,minmax(80px,1fr))_auto] gap-x-4 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
            <span>Leg</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Current</span>
            <span className="text-right">Bid / Ask</span>
            <span className="text-right">Unrlzd P/L</span>
            <span />
          </div>
          {legs.map((l) => {
            const qty = (l.ratio || 1) * spread.qty;
            const dir = l.side === "short" ? 1 : -1;
            const pl = (l.entryPrice - l.currentPrice) * dir * qty * 100;
            const q = quotes ? quotes[l.symbol] : null;
            return (
              <div
                key={l.symbol}
                className="grid grid-cols-[minmax(160px,1.4fr)_repeat(5,minmax(80px,1fr))_auto] gap-x-4 px-3 py-2 items-center border-b border-slate-100 last:border-0 text-xs tabular-nums"
              >
                <span className="whitespace-nowrap">
                  <span className={l.side === "short" ? "text-rose-600 font-medium" : "text-slate-700 font-medium"}>
                    {l.side === "short" ? "Short" : "Long"} {fmtMoney(l.strike)}
                  </span>
                  <span className="text-slate-400"> {l.kind}</span>
                </span>
                <span className="text-right">{qty}</span>
                <span className="text-right">{fmtMoney(l.entryPrice)}</span>
                <span className="text-right">{fmtMoney(l.currentPrice)}</span>
                <span className="text-right text-slate-500">
                  {loading ? "…" : q ? `${fmtMoney(q.bidDebit)} / ${fmtMoney(q.askDebit)}` : "—"}
                </span>
                <span className={`text-right font-semibold ${pl > 0 ? "text-emerald-600" : pl < 0 ? "text-rose-600" : ""}`}>
                  {fmtMoney(pl)}
                </span>
                <button
                  onClick={() => onCloseLeg(l)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  Close leg
                </button>
              </div>
            );
          })}
        </div>
        </div>
      </td>
    </tr>
  );
}