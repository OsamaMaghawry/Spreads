import { Loader2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { spreadLegs } from "@/lib/spreadLegs";
import useLegQuotes from "./useLegQuotes";

function Metric({ label, value, tone }) {
  return (
    <div className="min-w-[62px]">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[11px] font-medium tabular-nums ${tone || "text-slate-700"}`}>{value}</div>
    </div>
  );
}

// Per-leg detail strip revealed when a position card is expanded.
export default function CardLegs({ spread, accountId, onCloseLeg }) {
  const legs = (spread.legs && spread.legs.length ? spread.legs : spreadLegs(spread)).map((l) => ({
    ...l,
    entryPrice: l.entryPrice ?? (l.side === "short" ? spread.shortEntryPrice : spread.longEntryPrice),
    currentPrice: l.currentPrice ?? (l.side === "short" ? spread.shortCurrentPrice : spread.longCurrentPrice)
  }));
  const { quotes, loading } = useLegQuotes(accountId, legs);

  if (legs.length === 0) return null;

  return (
    <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Individual legs
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      <div className="space-y-2">
        {legs.map((l) => {
          const qty = (l.ratio || 1) * spread.qty;
          const dir = l.side === "short" ? 1 : -1;
          const pl = (l.entryPrice - l.currentPrice) * dir * qty * 100;
          const q = quotes ? quotes[l.symbol] : null;
          return (
            <div
              key={l.symbol}
              className="flex flex-wrap items-end gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="min-w-[110px]">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Leg</div>
                <div className="text-[11px] font-semibold">
                  <span className={l.side === "short" ? "text-rose-600" : "text-slate-700"}>
                    {l.side === "short" ? "Short" : "Long"} {fmtMoney(l.strike)}
                  </span>
                  <span className="text-slate-400"> {l.kind}</span>
                </div>
              </div>
              <Metric label="Qty" value={qty} />
              <Metric label="Entry" value={fmtMoney(l.entryPrice)} />
              <Metric label="Current" value={fmtMoney(l.currentPrice)} />
              <Metric
                label="Bid / Ask"
                value={loading ? "…" : q ? `${fmtMoney(q.bidDebit)} / ${fmtMoney(q.askDebit)}` : "—"}
                tone="text-slate-500"
              />
              <Metric
                label="Unrlzd P/L"
                value={fmtMoney(pl)}
                tone={pl > 0 ? "text-emerald-600 font-semibold" : pl < 0 ? "text-rose-600 font-semibold" : ""}
              />
              <button
                onClick={() => onCloseLeg(l)}
                className="ml-auto rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
              >
                Close leg
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}