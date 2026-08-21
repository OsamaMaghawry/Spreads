import { fmtMoney } from "@/lib/format";

// Horizontal strike ladder: pale emerald profit zone, pale rose max-loss wings,
// dashed marker for the live stock price.
export default function StrikeLadder({ spread }) {
  const isCondor = spread.type === "iron_condor";
  const isCall = spread.type === "call_spread";

  const strikes = isCondor
    ? [
        { label: "Long Put", value: spread.longStrike },
        { label: "Short Put", value: spread.shortStrike },
        { label: "Short Call", value: spread.callShortStrike },
        { label: "Long Call", value: spread.callLongStrike }
      ]
    : isCall
      ? [
          { label: "Short Call", value: spread.shortStrike },
          { label: "Long Call", value: spread.longStrike }
        ]
      : [
          { label: "Long Put", value: spread.longStrike },
          { label: "Short Put", value: spread.shortStrike }
        ];

  const values = strikes.map((s) => s.value).filter((v) => typeof v === "number");
  const price = spread.stockPrice || 0;
  if (values.length === 0) return null;

  const lo = Math.min(...values, price || Infinity);
  const hi = Math.max(...values, price || -Infinity);
  const span = hi - lo || 1;
  const pad = span * 0.18;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v) => ((v - min) / (max - min)) * 100;

  // Profit region (emerald) and max-loss wings (rose).
  const zones = [];
  if (isCondor) {
    zones.push({ tone: "loss", from: 0, to: pos(spread.longStrike) });
    zones.push({ tone: "profit", from: pos(spread.shortStrike), to: pos(spread.callShortStrike) });
    zones.push({ tone: "loss", from: pos(spread.callLongStrike), to: 100 });
  } else if (isCall) {
    zones.push({ tone: "profit", from: 0, to: pos(spread.shortStrike) });
    zones.push({ tone: "loss", from: pos(spread.longStrike), to: 100 });
  } else {
    zones.push({ tone: "loss", from: 0, to: pos(spread.longStrike) });
    zones.push({ tone: "profit", from: pos(spread.shortStrike), to: 100 });
  }

  return (
    <div className="px-6 pt-3 pb-5">
      <div className="relative h-[132px]">
        {zones.map((z, i) => (
          <div
            key={i}
            className={`absolute top-8 bottom-0 rounded-sm ${z.tone === "profit" ? "bg-emerald-100/60" : "bg-rose-100/60"}`}
            style={{ left: `${z.from}%`, width: `${Math.max(0, z.to - z.from)}%` }}
          />
        ))}

        {/* Axis */}
        <div className="absolute left-0 right-0 top-[74px] h-px bg-slate-300" />

        {/* Stock price marker */}
        {price > 0 && (
          <div className="absolute top-0 bottom-0" style={{ left: `${pos(price)}%` }}>
            <div className="absolute top-8 bottom-0 -translate-x-1/2 border-l-2 border-dashed border-slate-800" />
            <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 shadow-sm">
              {fmtMoney(price)}
            </div>
          </div>
        )}

        {/* Strike ticks + labels */}
        {strikes.map((s) => (
          <div key={s.label} className="absolute top-8 bottom-0" style={{ left: `${pos(s.value)}%` }}>
            <div className="absolute top-[30px] -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
              {s.label}
            </div>
            <div className="absolute top-[62px] h-[10px] -translate-x-1/2 border-l-2 border-slate-500" />
            <div className="absolute top-[78px] -translate-x-1/2 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">
              {fmtMoney(s.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}