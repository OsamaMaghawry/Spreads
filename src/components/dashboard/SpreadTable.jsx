import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import SpreadStructure from "./SpreadStructure";
import { isSingle, kindOf, riskText, riskIsUnbounded } from "@/lib/positionKind";
import LegRows from "./LegRows";

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-4 whitespace-nowrap tabular-nums";

const COL_COUNT = 21;

export default function SpreadTable({ spreads, accountId, onClose }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const totals = spreads.reduce(
    (a, s) => ({
      totalCredit: a.totalCredit + (s.totalCredit || 0),
      maxRisk: a.maxRisk + (s.adjusted ? 0 : s.maxRisk || 0),
      closeCost: a.closeCost + (s.closeCost || 0),
      unrealizedPL: a.unrealizedPL + (s.unrealizedPL || 0),
      expirationPL: a.expirationPL + (s.expirationPL || 0)
    }),
    { totalCredit: 0, maxRisk: 0, closeCost: 0, unrealizedPL: 0, expirationPL: 0 }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-slate-700">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className={`${th} w-8`}></th>
            <th className={th}>Ticker</th>
            <th className={th}>Structure</th>
            <th className={th}>Entry</th>
            <th className={th}>Expiry</th>
            <th className={`${th} text-right`}>Stock</th>
            <th className={`${th} text-center`}>Money</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Short Entry</th>
            <th className={`${th} text-right`}>Long Entry</th>
            <th className={`${th} text-right`}>Width</th>
            <th className={`${th} text-right`}>Net Credit</th>
            <th className={`${th} text-right`}>Total Credit</th>
            <th className={`${th} text-right`}>Max Risk</th>
            <th className={`${th} text-right`}>Break-Even</th>
            <th className={`${th} text-right`}>Cur Short</th>
            <th className={`${th} text-right`}>Cur Long</th>
            <th className={`${th} text-right`}>Close Cost</th>
            <th className={`${th} text-right`}>Unrlzd P/L</th>
            <th className={`${th} text-right`} title="P/L if every position expired right now at the current stock price (intrinsic value only, no time premium)">
              Exp P/L
            </th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {spreads.map((s, i) => {
            const key = `${s.shortSymbol}_${s.longSymbol}_${i}`;
            const isOpen = !!expanded[key];
            return [
            <tr
              key={key}
              className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                s.openOrders?.length > 0 ? "bg-amber-50" : ""
              }`}
            >
              <td className={`${td} pr-0`}>
                <button
                  onClick={() => toggle(key)}
                  title={isOpen ? "Hide individual legs" : "Show individual legs"}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200/70 transition-colors"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
              </td>
              <td className={`${td} font-semibold text-slate-900`}>
                {s.ticker}
                {s.type === "iron_condor" && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    IC
                  </span>
                )}
                {s.type === "call_spread" && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                    CALL
                  </span>
                )}
                {isSingle(s) && kindOf(s) && (
                  <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${kindOf(s).cls}`} title={kindOf(s).label}>
                    {kindOf(s).badge.toUpperCase()}
                  </span>
                )}
                {s.openOrders?.length > 0 && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    OPEN ORDER
                  </span>
                )}
              </td>
              <td className={td}><SpreadStructure spread={s} /></td>
              <td className={`${td} text-slate-500`}>{s.entryDate}</td>
              <td className={`${td} text-slate-500`}>{s.expiryFormatted}</td>
              <td className={`${td} text-right`}>{s.stockPrice ? fmtMoney(s.stockPrice) : "—"}</td>
              <td className={`${td} text-center`}>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.moneyness === "ITM"
                      ? "bg-rose-100 text-rose-700"
                      : s.moneyness === "OTM"
                        ? "bg-emerald-100 text-emerald-700"
                        // No price to judge against. Green here would be an
                        // answer; this is the absence of one.
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s.moneyness || "—"}
                </span>
              </td>
              <td className={`${td} text-right`}>{s.qty}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.shortEntryPrice)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.longEntryPrice)}</td>
              {/* Width, risk and break-even are all computed from a
                  deliverable an adjusted contract no longer has. A dash is
                  the honest cell; a number here would be arithmetic about a
                  contract that does not exist. */}
              <td className={`${td} text-right`}>{s.adjusted || s.spreadWidth === null ? "—" : fmtMoney(s.spreadWidth)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.netCredit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.totalCredit)}</td>
              {/* "Unlimited" rather than a dash: a naked short call is the one
                  position here that can lose without bound, and a blank cell
                  reads as nothing to worry about. */}
              <td className={`${td} text-right ${riskIsUnbounded(s) ? "font-semibold text-rose-700" : ""}`}>
                {riskText(s, fmtMoney)}
              </td>
              <td className={`${td} text-right`}>
                {s.adjusted ? "—" : fmtMoney(s.breakEven)}
                {!s.adjusted && s.breakEvenHigh != null && (
                  <span className="text-slate-400"> – {fmtMoney(s.breakEvenHigh)}</span>
                )}
              </td>
              <td className={`${td} text-right`}>{fmtMoney(s.shortCurrentPrice)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.longCurrentPrice)}</td>
              <td className={`${td} text-right`}>{fmtMoney(s.closeCost)}</td>
              <td className={`${td} text-right font-semibold ${s.unrealizedPL > 0 ? "text-emerald-600" : s.unrealizedPL < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(s.unrealizedPL)}
                {/* Still counted in the totals — just not presented as a mark. */}
                {s.priceSource === "broker" && (
                  <span className="ml-1 font-normal text-amber-600" title="No live quote for every leg — priced from the broker's last-trade values">
                    *
                  </span>
                )}
              </td>
              <td className={`${td} text-right font-semibold ${s.expirationPL > 0 ? "text-emerald-600" : s.expirationPL < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(s.expirationPL)}
              </td>
              <td className={td}>
                <button
                  onClick={() => onClose(s)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  Close
                </button>
              </td>
            </tr>,
            isOpen ? (
              <LegRows
                key={`${key}_legs`}
                spread={{ ...s, accountId }}
                colSpan={COL_COUNT}
                onCloseLeg={(leg) => onClose({ ...s, presetLegSymbol: leg.symbol })}
              />
            ) : null
            ];
          })}
          {spreads.length > 0 && (
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className={td}></td>
              <td className={`${td} text-[11px] uppercase tracking-wider text-slate-500`}>Totals</td>
              <td className={td} colSpan={10}></td>
              <td className={`${td} text-right`}>{fmtMoney(totals.totalCredit)}</td>
              <td className={`${td} text-right`}>{fmtMoney(totals.maxRisk)}</td>
              <td className={td} colSpan={3}></td>
              <td className={`${td} text-right`}>{fmtMoney(totals.closeCost)}</td>
              <td className={`${td} text-right ${totals.unrealizedPL > 0 ? "text-emerald-600" : totals.unrealizedPL < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(totals.unrealizedPL)}
              </td>
              <td className={`${td} text-right ${totals.expirationPL > 0 ? "text-emerald-600" : totals.expirationPL < 0 ? "text-rose-600" : ""}`}>
                {fmtMoney(totals.expirationPL)}
              </td>
              <td className={td}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}