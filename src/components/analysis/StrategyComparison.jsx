import { fmtMoney } from "@/lib/format";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(2));

export default function StrategyComparison({ rows }) {
  // Three of these columns are measured over settled trades and three over
  // every row. Unsaid, the table reads as one population and a reader would
  // divide one column by another -- which is how "12 trades, 100% win rate,
  // -$5,900" gets onto a screen and stays there unexplained.
  //
  // Summed across rows this counted every unfinished position twice: the rows
  // include an "All strategies" row that already contains the others, so the
  // footnote printed double the figure the page footer gives for the same
  // thing, 200px away. The whole-book row is the one to read it off.
  const whole = rows.find((r) => r.stats?.provisionalTrades !== undefined && /all/i.test(r.label));
  const notFinal = (whole || rows[0])?.stats?.provisionalTrades || 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <h3 className="text-sm font-medium text-slate-900 px-4 py-3 border-b border-slate-200">Strategy comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>Strategy</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Win rate</th>
              <th className={`${th} text-right`}>Realized P/L</th>
              <th className={`${th} text-right`}>Expectancy</th>
              <th className={`${th} text-right`}>Profit factor</th>
              <th className={`${th} text-right`}>Return on risk</th>
              <th className={`${th} text-right`}>ROE</th>
              <th className={`${th} text-right`}>Annualized</th>
              <th className={`${th} text-right`}>CAGR</th>
              <th className={`${th} text-right`}>Max DD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, stats }) => (
              <tr key={label} className="border-b border-slate-100 last:border-0">
                <td className={`${td} font-medium text-slate-900`}>{label}</td>
                <td className={`${td} text-right`}>{stats.trades}</td>
                <td className={`${td} text-right`}>{pct(stats.winRate, 0)}</td>
                <td className={`${td} text-right font-semibold ${stats.totalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {fmtMoney(stats.totalPL)}
                </td>
                <td className={`${td} text-right`}>{fmtMoney(stats.avgPL)}</td>
                <td className={`${td} text-right`}>{num(stats.profitFactor)}</td>
                <td className={`${td} text-right`}>{pct(stats.returnOnRisk)}</td>
                <td className={`${td} text-right`}>{pct(stats.roe)}</td>
                <td className={`${td} text-right`}>{pct(stats.annualized, 0)}</td>
                <td className={`${td} text-right`}>{pct(stats.cagr, 0)}</td>
                <td className={`${td} text-right text-rose-600`}>{fmtMoney(stats.maxDrawdown ? -stats.maxDrawdown : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notFinal > 0 && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          Win rate, expectancy and profit factor are measured over settled trades. {notFinal} position
          {notFinal === 1 ? "" : "s"} closed by assignment {notFinal === 1 ? "still holds" : "still hold"}{" "}
          shares, so {notFinal === 1 ? "its result is" : "their results are"} not final and{" "}
          {notFinal === 1 ? "it is" : "they are"} left out of those three. Trades, realized P/L and max
          drawdown count every row.
        </p>
      )}
    </div>
  );
}