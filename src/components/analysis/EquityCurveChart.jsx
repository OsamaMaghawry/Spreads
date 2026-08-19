import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtMoney } from "@/lib/format";

export default function EquityCurveChart({ curve }) {
  const data = curve.map((p, i) => ({ ...p, i }));
  const positive = (data[data.length - 1]?.cum || 0) >= 0;
  const color = positive ? "#059669" : "#e11d48";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-slate-900 mb-3">Cumulative realized P/L</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
              formatter={(v, n) => [fmtMoney(v), n === "cum" ? "Cumulative" : "Trade P/L"]}
            />
            <Area type="monotone" dataKey="cum" stroke={color} strokeWidth={2} fill="url(#curveFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}