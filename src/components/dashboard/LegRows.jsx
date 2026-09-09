import { fmtMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { spreadLegs } from "@/lib/spreadLegs";
import useLegQuotes from "./useLegQuotes";

// Per-leg detail shown beneath an expanded spread row.
export default function LegRows({ spread, colSpan, onCloseLeg }) {
  // Prefer the backend-paired legs; fall back to deriving them from the spread's
  // symbols so the row always expands.
  const legs = (spread.legs && spread.legs.length ? spread.legs : spreadLegs(spread)).map((l) => ({
    ...l,
    entryPrice: l.entryPrice ?? (l.side === "short" ? spread.shortEntryPrice : spread.longEntryPrice),
    currentPrice: l.currentPrice ?? (l.side === "short" ? spread.shortCurrentPrice : spread.longCurrentPrice)
  }));

  const { quotes, loading } = useLegQuotes(spread.accountId, legs);

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
            const q = quotes ? quotes[l.symbol] : null;
            // The NBBO mid when there is one, the broker's stored price only
            // when there is not.
            //
            // This row printed Alpaca's last-trade `current_price` under the
            // heading "Current" and computed the P/L from it, immediately
            // beside a live bid/ask on the SAME row that contradicted it: the
            // TSLA 352.50 call read $638 at 19.95 next to 20.23 / 20.66, where
            // the mid gives $687.50. Meanwhile the card above added its total
            // from mids. One contract, two prices, one screen — the exact
            // failure the card's own pricing comment says was fixed and never
            // was here.
            const mid = q && Number.isFinite(q.bidDebit) && Number.isFinite(q.askDebit)
              ? (q.bidDebit + q.askDebit) / 2
              : null;
            const mark = mid ?? l.currentPrice;
            const pl = (l.entryPrice - mark) * dir * qty * 100;
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
                <span className="text-right" title={mid === null ? "Broker's last trade — nobody is quoting this contract right now." : "NBBO mid"}>
                  {fmtMoney(mark)}
                  {mid === null && <span className="text-amber-600"> *</span>}
                </span>
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