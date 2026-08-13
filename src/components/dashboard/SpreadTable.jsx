import { fmtMoney } from "@/lib/format";

const th = "px-3 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2.5 whitespace-nowrap tabular-nums";

export default function SpreadTable({ spreads, onClose }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-slate-300">
        <thead>
          <tr className="border-b border-white/[0.06] text-left">
            <th className={th}>Ticker</th>
            <th className={th}>Entry</th>
            <th className={th}>Expiry</th>
            <th className={`${th} text-right`}>Stock</th>
            <th className={`${th} text-center`}>Money</th>
            <th className={`${th} text-right`}>Strikes</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Net Credit</th>
            <th className={`${th} text-right`}>Total Credit</th>
            <th className={`${th} text-right`}>Max Risk</th>
            <th className={`${th} text-right`}>Break-Even</th>
            <th className={`${th} text-right`}>Close Cost</th>
            <th className={`${th} text-right`}>Unrlzd P/L</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {spreads.map((s, i) => (
            <tr
              key={`${s.shortSymbol}_${s.longSymbol}_${i}`}
              className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                s.openOrders?.length > 0 ? "bg-amber-500/[0.05]" : ""
              }`}
            >
              <td className={`${td} font-semibold text-white`}>
                {s.ticker}
                {s.openOrders?.length > 0 && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    OPEN ORDER
                  </span>
                )}
              </td>
              <td className={`${td} text-slate-400`}>{s.entryDate}</td>
              <td className={`${td} text-slate-400`}>{s.expiryFormatted}</td>
              <td className={`${td} text-right`}>{s.stockPrice ? fmtMoney(s.stockPrice) : "—"}</td>
              <td className={`${td} text-center`}>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.moneyness === "ITM" ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"
                  }`}
                >
                  {s.moneyness}
                </span>
              </td>
              <td className={`${td} text-right`}>{s.shortStrike} / {s.longStrike}</td>
              <td className={`${td} text-right`}>{s.qty}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.netCredit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.totalCredit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.maxRisk)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.breakEven)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.closeCost)}</td>
              <td className={`${td} text-right font-semibold ${s.unrealizedPL > 0 ? "text-emerald-400" : s.unrealizedPL < 0 ? "text-rose-400" : ""}`}>
                {fmtMoney(s.unrealizedPL)}
              </td>
              <td className={td}>
                <button
                  onClick={() => onClose(s)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20 transition-colors"
                >
                  Close
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}