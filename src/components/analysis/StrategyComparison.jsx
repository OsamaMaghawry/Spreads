import { fmtMoney } from "@/lib/format";

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const pct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(2));

// `openMark`: what everything still open is worth at today's prices, added
// under the table so the rows, their total and the account result read as one
// sum. undefined = the page is not adding the open book here (premium view, a
// date window, nothing open), so no lines are drawn; null = something open has
// no price, so the two lines print "—" rather than a total missing a part.
export default function StrategyComparison({ rows, splitCount = 0, openMark }) {
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
  // Every row is measured under the selected view, so the P/L column means the
  // whole position or the option legs alone depending on the control above.
  const view = (whole || rows[0])?.stats?.view;
  const showOpen = openMark !== undefined && !!whole;
  const openKnown = typeof openMark === "number" && isFinite(openMark);
  const accountResult = showOpen && openKnown ? whole.stats.totalPL + openMark : null;
  const signed = (v) => (v === null ? "text-slate-500" : v >= 0 ? "text-emerald-600" : "text-rose-600");
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
              <th className={`${th} text-right`}>{view === "premium" ? "Option-leg P/L" : "Booked P/L"}</th>
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
                {/* Withheld on the same rule StatCards applies, and for the
                    same reason: a reversible paper gain on an open position,
                    divided by equity, times 365 and compounded, reads as a
                    performance claim. The rule landed on the cards and missed
                    this table -- which is the one that goes into the exported
                    PDF. */}
                <td className={`${td} text-right`}>{pct(stats.annualized, 0)}</td>
                <td className={`${td} text-right`}>{pct(stats.cagr, 0)}</td>
                <td className={`${td} text-right text-rose-600`}>{fmtMoney(stats.maxDrawdown ? -stats.maxDrawdown : 0)}</td>
              </tr>
            ))}
          </tbody>
          {/* The rows above are closed trades only, so "All strategies" is
              their sum. What is still open belongs to the account, not to one
              strategy, so it is added here once, and the last line is the
              same account result the top of the page gives. */}
          {showOpen && (
            <tfoot className="border-t-2 border-slate-200">
              <tr className="border-b border-slate-100">
                <td className={`${td} text-slate-600`} colSpan={3}>Still open, at today&rsquo;s prices</td>
                <td className={`${td} text-right ${signed(openKnown ? openMark : null)}`}>
                  {openKnown ? fmtMoney(openMark) : "—"}
                </td>
                <td colSpan={7} />
              </tr>
              <tr>
                <td className={`${td} font-semibold text-slate-900`} colSpan={3}>Account result</td>
                <td className={`${td} text-right font-semibold ${signed(accountResult)}`}>
                  {accountResult === null ? "—" : fmtMoney(accountResult)}
                </td>
                <td colSpan={7} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* A ROW HERE CAN BE STRUCTURALLY MISLEADING, not merely incomplete, and
          the table has to say so where it happens rather than leave the reader
          to find the contradiction. The owner did find it: *"the CC never lost
          2k"* — and he was right, because on his account every covered call was
          written on shares an assigned put had delivered. The put keeps the
          share result, the call keeps the buyback cost, and no single strategy
          row can hold both halves. "By setup" above is where those rows are put
          back together. */}
      {splitCount > 0 && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          {splitCount} position{splitCount === 1 ? "" : "s"} on this page {splitCount === 1 ? "spans" : "span"}{" "}
          more than one of these rows &mdash; a put assigned into shares and the calls written on
          those shares are one position filed under two strategies, with the shares&rsquo; result on
          the put and the call&rsquo;s buyback cost on the call. Neither row states what the position
          did. &ldquo;By setup&rdquo; above counts {splitCount === 1 ? "it" : "them"} whole.
        </p>
      )}
      {notFinal > 0 && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          Win rate, expectancy and profit factor are measured over settled trades. {notFinal} position
          {notFinal === 1 ? "" : "s"} closed by assignment {notFinal === 1 ? "still holds" : "still hold"}{" "}
          shares, so {notFinal === 1 ? "its result is" : "their results are"} not final and{" "}
          {notFinal === 1 ? "it is" : "they are"} left out of those three. Trades, P/L and max
          drawdown count every row.
        </p>
      )}
    </div>
  );
}