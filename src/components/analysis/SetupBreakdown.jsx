import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { strategyLabel } from "@/lib/strategies";
import { setupTotals, byTicker } from "@/lib/campaigns";

// What each position actually did, as ONE position.
//
// The owner, on the 2026-09-19 report: *"I never lost 8k, and the CC never lost
// 2k. Maybe these numbers are part of a multi-leg setup or campaign that ends
// as a total profit or loss but as part of a complete setup, not by its own."*
//
// Every other table on this page slices by something — strategy, month, ticker
// — and a wheel is none of those. It is a put that became shares, calls written
// on those shares, and the shares themselves, and it lands in two strategy
// buckets with the losing half in one and the winning half in the other. This
// table is the only place the position appears whole.
//
// WHAT WAS WRONG WITH THE FIRST VERSION, and it was worse than the defect it
// was fixing. It filtered to setups with more than one leg or a share lot,
// which on this account is SIX rows out of 135 — and still headed itself "By
// setup". The owner: *"totally inaccurate setups and results!! NVDA just two
// setups!!!! NVDA alone has at least 25+ in profit from CSP for more than 2
// months of trading."*
//
// He was right and the grouping was not the problem: NVDA really is 54 setups
// booking +$2,853, which ties to the By-ticker table exactly. The panel was
// throwing 129 of them away and presenting the remainder as the whole account.
// A table that names itself after a population must show that population.
//
// So every setup is here now, under its ticker, and the ticker rows sum to the
// account's own total. A single put that expired worthless is a setup of one —
// a complete position, which is the whole point — and it is counted like any
// other. See src/lib/campaigns.js for what is linked and what is deliberately
// not.

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const money = (v) => (v >= 0 ? "text-emerald-600" : "text-rose-600");

const shape = (s) => {
  if (s.legs.length === 1 && s.lots.length === 0) return strategyLabel(s.strategies[0]);
  const has = (k) => s.strategies.includes(k);
  if (has("cash_secured_put") && has("covered_call")) return "Wheel — put assigned, calls written on the shares";
  if (s.lots.length > 0 && s.legs.length === 1) return `${strategyLabel(s.strategies[0])} — assigned into shares`;
  if (has("covered_call") && s.lots.length) return "Covered calls on shares held";
  return `${s.legs.length} legs · ${s.strategies.map(strategyLabel).join(", ")}`;
};

export default function SetupBreakdown({ setups: list }) {
  const [openTicker, setOpenTicker] = useState(null);
  const [openSetup, setOpenSetup] = useState(null);
  const rows = list || [];

  // One row per ticker, because 135 positions is a list nobody reads and the
  // figure a reader checks first is the ticker total — which is the number the
  // By-ticker table is already showing them two panels down.
  const tickers = useMemo(() => byTicker(rows), [rows]);

  if (rows.length === 0) return null;
  const t = setupTotals(rows);
  const grouped = rows.filter((s) => s.legs.length > 1).length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-900">By setup</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          Every position on this page, counted once and whole. A put assigned into shares, the calls
          written on those shares and the shares themselves are one setup here &mdash; the strategy
          table has to split them, because a share lot and the call written on it are not the same
          strategy. Open a ticker for its positions, and a position for its legs.
        </p>
      </div>

      <div className="grid sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Positions</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900 mt-1">{t.setups}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            across {tickers.length} tickers · {grouped} built from more than one leg
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Booked</div>
          <div className={`text-lg font-semibold tabular-nums mt-1 ${money(t.booked)}`}>{fmtMoney(t.booked)}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            Every leg and every share counted once &mdash; this is the account&rsquo;s own total
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Finished and lost</div>
          <div className="text-lg font-semibold tabular-nums text-rose-600 mt-1">{fmtMoney(t.settledLosses)}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            {t.settledLossCount} of {t.setups} positions, shares included
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Still running</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900 mt-1">{t.stillOpen}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            Shares from {t.stillOpen === 1 ? "this one are" : "these are"} still held, so what{" "}
            {t.stillOpen === 1 ? "it has" : "they have"} booked is not {t.stillOpen === 1 ? "its" : "their"} result
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>Ticker</th>
              <th className={`${th} text-right`}>Positions</th>
              <th className={`${th} text-right`}>Legs</th>
              <th className={`${th} text-right`}>Booked</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((b) => {
              const isOpen = openTicker === b.ticker;
              return [
                <tr
                  key={b.ticker}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setOpenTicker(isOpen ? null : b.ticker)}
                >
                  <td className={`${td} font-medium text-slate-900`}>
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {b.ticker}
                    </span>
                    {/* The reason this table exists, said only where it
                        happened. On a ticker whose positions each sat in one
                        strategy row, "By setup" and "By strategy" agree and
                        there is nothing here to explain. */}
                    {(b.split > 0 || b.open > 0) && (
                      <div className="text-[10px] text-amber-700 font-normal pl-5">
                        {b.split > 0 && `${b.split} span${b.split === 1 ? "s" : ""} more than one strategy`}
                        {b.split > 0 && b.open > 0 && " · "}
                        {b.open > 0 && `${b.open} still running`}
                      </div>
                    )}
                  </td>
                  <td className={`${td} text-right`}>{b.setups.length}</td>
                  <td className={`${td} text-right text-slate-400`}>{b.legs}</td>
                  <td className={`${td} text-right font-semibold ${money(b.booked)}`}>{fmtMoney(b.booked)}</td>
                </tr>,
                isOpen && (
                  <tr key={`${b.ticker}-open`} className="bg-slate-50 border-b border-slate-100">
                    <td colSpan={4} className="px-3 py-2">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                            <th className="text-left font-medium py-1">Closed</th>
                            <th className="text-left font-medium py-1">What it was</th>
                            <th className="text-right font-medium py-1">Option legs</th>
                            <th className="text-right font-medium py-1">Shares</th>
                            <th className="text-right font-medium py-1">Booked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.setups.map((s) => {
                            const expandable = s.legs.length > 1;
                            const showLegs = openSetup === s.key;
                            return [
                              <tr
                                key={s.key}
                                className={`border-t border-slate-200 ${expandable ? "cursor-pointer hover:bg-white" : ""}`}
                                onClick={expandable ? () => setOpenSetup(showLegs ? null : s.key) : undefined}
                              >
                                <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500">
                                  {expandable && (
                                    <ChevronRight
                                      className={`inline w-3 h-3 mr-1 text-slate-400 transition-transform ${showLegs ? "rotate-90" : ""}`}
                                    />
                                  )}
                                  {s.to}
                                </td>
                                <td className="py-1.5 pr-3 text-slate-600">
                                  {shape(s)}
                                  {s.open && (
                                    <span className="text-amber-700">
                                      {" "}&mdash; {s.sharesOpen} shares still held
                                    </span>
                                  )}
                                </td>
                                <td className={`py-1.5 text-right tabular-nums ${money(s.optionPL)}`}>
                                  {fmtMoney(s.optionPL)}
                                </td>
                                <td className={`py-1.5 pl-3 text-right tabular-nums ${money(s.sharePL)}`}>
                                  {s.sharePL === 0 ? "—" : fmtMoney(s.sharePL)}
                                </td>
                                {/* On a setup still holding shares this is money
                                    booked so far, not a result, and it says so
                                    rather than printing a figure the position
                                    has not finished earning. */}
                                <td className={`py-1.5 pl-3 text-right tabular-nums font-semibold ${money(s.booked)}`}>
                                  {fmtMoney(s.booked)}
                                  {s.open && <span className="block text-[10px] font-normal text-slate-400">so far</span>}
                                </td>
                              </tr>,
                              showLegs && (
                                <tr key={`${s.key}-legs`} className="bg-white">
                                  <td colSpan={5} className="px-3 py-1.5">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                                      The legs, as they closed
                                    </div>
                                    <table className="w-full text-[11px]">
                                      <tbody>
                                        {s.legs.map((leg, i) => (
                                          <tr key={leg.id || i} className="text-slate-600">
                                            <td className="py-0.5 pr-3 whitespace-nowrap">{leg.close_date}</td>
                                            <td className="py-0.5 pr-3">{strategyLabel(leg.strategy)}</td>
                                            <td className="py-0.5 pr-3 whitespace-nowrap text-slate-400">
                                              {leg.qty}&times; {leg.short_strike > 0 ? leg.short_strike : leg.long_strike}
                                              {leg.close_reason ? ` · ${leg.close_reason}` : ""}
                                            </td>
                                            <td
                                              className={`py-0.5 text-right tabular-nums ${money(leg.realized_pl || 0)}`}
                                            >
                                              {fmtMoney(leg.realized_pl || 0)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )
                            ];
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
        A setup links shares to the option that delivered them, the option that took them away, and
        any covered call written while they were held. A cash-secured put opened while shares are
        held is the next turn of the wheel and stands on its own; so does a long put held alongside
        shares, because nothing stored says whether it was protection or a bet of its own. A position
        that links to nothing is a setup of one. Nothing here restates a stored figure &mdash; this
        table only says which rows were one position, so the booked column above sums to the same
        total as the rest of the page.
      </p>
    </div>
  );
}
