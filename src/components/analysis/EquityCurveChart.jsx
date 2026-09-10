import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { fmtMoney } from "@/lib/format";

// A real daily line, from stored daily values.
//
// WHAT WAS WRONG. This chart accumulated closed trades in the order they closed
// and then added ONE dashed step at the right-hand edge for the shares still
// held. The owner: *"the one I have right now is just an adjustment from
// yesterday to today, it became like a pole… from one thousand something to
// twelve thousand. Equity chart means equity chart."*
//
// He was right, and the answer was not a better-drawn step. `equityHistory`
// now recalculates the portfolio for every session day since the account's
// first trade — the option legs closed by that day, the lots already sold, and
// the mark on lots still held at THAT DAY'S closing price — and stores it in
// `account_equity_daily`. So the eleven thousand dollars of share appreciation
// arrives over the weeks it actually accrued, one point per day, instead of in
// a single vertical line dated today. There is nothing dashed left to draw.
//
// TWO LINES, ONE AT A TIME, because they answer different questions and share
// no axis:
//
//   Performance    cumulative result of the strategy. Blind to deposits and
//                  withdrawals, which is what makes it a performance line
//                  rather than a bank balance.
//   Account value  the broker's own end-of-day equity — the $140k to $151k
//                  path. Includes every deposit, so a funding day shows as a
//                  step that is not a gain.

const MODES = [
  { key: "performance", label: "Performance", hint: "Cumulative result of this strategy" },
  { key: "value", label: "Account value", hint: "The broker's end-of-day equity" }
];

export default function EquityCurveChart({
  curve,
  view = "whole",
  mode = "performance",
  onModeChange,
  hasValueSeries = false,
  fallbackReason = null
}) {
  const points = Array.isArray(curve?.points) ? curve.points : [];
  if (!points.length) return null;

  const isValue = curve.mode === "value";
  const end = curve.end;
  const change = curve.change;
  // An account-value line is coloured by what the window did, not by whether a
  // balance is above zero — every balance is above zero, so colouring by `end`
  // would paint it green forever.
  const positive = (isValue ? (change ?? 0) : (end ?? 0)) >= 0;
  const color = positive ? "#059669" : "#e11d48";

  const title = isValue
    ? "Account value, end of each day"
    : view === "premium"
      ? "Option legs, cumulative"
      : "Strategy performance, cumulative";

  const subtitle = isValue
    ? "The broker's own figure, including deposits and withdrawals"
    : view === "premium"
      ? "Credits taken and debits paid on closed option trades. Shares are not in this line."
      : curve.mode === "booked"
        ? "Money booked by this strategy, in the order it booked it"
        : "Option legs, shares already sold, and the mark on shares still held — priced at each day's close";

  // An account balance never has a meaningful zero on screen; a P/L line does,
  // and the axis has to REACH it or a losing window renders as a wedge rising
  // off nothing. The first version wrote the same pair on both sides of the
  // ternary, which stripped recharts' own zero anchor and then silently
  // discarded the <ReferenceLine y={0}> below it (`ifOverflow` defaults to
  // "discard"), so the one line that gives the chart a sense of scale was never
  // drawn on exactly the charts that needed it.
  const domain = isValue
    ? ["auto", "auto"]
    : [(min) => Math.min(0, min), (max) => Math.max(0, max)];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-900">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="text-right ml-auto">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            {isValue ? "Today" : "Ends at"}
          </div>
          <div
            className={`text-lg font-semibold tabular-nums ${
              end === null ? "text-slate-400" : positive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {end === null ? "—" : fmtMoney(end)}
          </div>
          {isValue && change !== null && (
            <div className={`text-[11px] tabular-nums ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {change >= 0 ? "+" : ""}
              {fmtMoney(change)} over this window
            </div>
          )}
        </div>

        {/* Only offered when the account-value series actually exists. A
            control that switches to an empty chart is worse than no control. */}
        {hasValueSeries && onModeChange && (
          <div className="w-full sm:w-auto flex gap-1 bg-slate-100 rounded-lg p-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onModeChange(m.key)}
                aria-pressed={mode === m.key}
                title={m.hint}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={40} />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`}
              width={70}
              domain={domain}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(v) => (v === null || v === undefined ? ["—", isValue ? "Account value" : "Cumulative"] : [fmtMoney(v), isValue ? "Account value" : "Cumulative"])}
            />
            {!isValue && <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />}
            {/* connectNulls={false} on purpose: a day the book could not be
                valued is a gap in what we know, and bridging it would draw a
                line through a value nobody can state. */}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#curveFill)"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1">
        {curve.rebased && (
          <p className="text-[11px] text-slate-500">
            Measured from the close of the last day before this date range, so the line shows what
            this window did rather than everything that came before it.
          </p>
        )}
        {curve.mode === "booked" && fallbackReason && (
          <p className="text-[11px] text-amber-700 leading-relaxed">{fallbackReason}</p>
        )}
        {curve.missing > 0 && (
          <p className="text-[11px] text-amber-700 leading-relaxed">
            {curve.missing} day{curve.missing === 1 ? "" : "s"} could not be valued and {curve.missing === 1 ? "is" : "are"}{" "}
            left as a break in the line rather than drawn at zero
            {curve.unpricedTickers?.length ? ` — ${curve.unpricedTickers.join(", ")}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
