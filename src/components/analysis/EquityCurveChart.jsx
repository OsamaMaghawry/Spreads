import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtMoney } from "@/lib/format";

// The curve for the view being shown, not one curve for both.
//
// The owner: "the graph doesn't go with the filter." It accumulated
// `realized_pl` whichever view was selected, so it ended at the realized total
// -- a number that is NEITHER headline. Premium only reported -$751 over a
// chart ending at +$594.
//
// Whole view now draws the realized path it can prove and one DASHED step to
// today's mark. Dashed and dated today on purpose: there is no history of
// unrealized value anywhere in this product -- `stock_lots` records what a lot
// cost and, once sold, what it made, and nothing in between -- so a solid line
// through that final point would claim the book travelled a path nobody can
// reconstruct.

export default function EquityCurveChart({ curve, view = "whole", unrealized = null }) {
  const points = Array.isArray(curve?.points) ? curve.points : Array.isArray(curve) ? curve : [];
  if (!points.length) return null;

  const marked = !!curve?.marked;
  const end = typeof curve?.end === "number" ? curve.end : points[points.length - 1]?.cum || 0;
  const positive = end >= 0;
  const color = positive ? "#059669" : "#e11d48";

  const title =
    view === "premium"
      ? "Cumulative option-leg P/L"
      : marked
        ? "Cumulative realized P/L, stepped to today's mark"
        : "Cumulative realized P/L";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h3 className="text-sm font-medium text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          ends at <strong className={positive ? "text-emerald-600" : "text-rose-600"}>{fmtMoney(end)}</strong>
        </span>
        {marked && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
            <svg width="22" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            unrealized on shares held, at today&rsquo;s price
          </span>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} width={60} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(v, n) =>
                v === null || v === undefined
                  ? null
                  : [fmtMoney(v), n === "cum" ? "Cumulative" : n === "mark" ? "With today's mark" : "Trade P/L"]
              }
            />
            <Area type="monotone" dataKey="cum" stroke={color} strokeWidth={2} fill="url(#curveFill)" connectNulls={false} />
            {/* The mark leg. `connectNulls` joins the last historical point to
                today across the nulls between them; without it the two ends
                never meet and the step draws nothing. */}
            {marked && (
              <Line
                type="linear"
                dataKey="mark"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500 leading-relaxed">
        {view === "premium" ? (
          <>Credits taken and debits paid on closed option trades, in the order they closed. Shares are not in this line.</>
        ) : marked ? (
          <>
            The solid line is money booked, trade by trade. The dashed step is today only — there is no
            record of what these shares were worth on any earlier day, so the path to it is not drawn.
          </>
        ) : (
          <>Money booked, trade by trade. Shares still held are not priced in this line.</>
        )}
      </p>
    </div>
  );
}
