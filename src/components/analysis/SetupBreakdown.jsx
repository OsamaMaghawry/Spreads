import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { strategyLabel } from "@/lib/strategies";
import { setupTotals } from "@/lib/campaigns";

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
// table is the only place the position appears whole. See src/lib/campaigns.js
// for what is linked and what is deliberately not.

const th = "px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";

const shape = (s) => {
  if (s.legs.length === 1) return strategyLabel(s.strategies[0]);
  const has = (k) => s.strategies.includes(k);
  if (has("cash_secured_put") && has("covered_call")) return "Wheel — put assigned, calls written on the shares";
  if (has("covered_call") && s.lots.length) return "Covered calls on shares held";
  return `${s.legs.length} legs · ${s.strategies.map(strategyLabel).join(", ")}`;
};

export default function SetupBreakdown({ setups: list }) {
  const [openKey, setOpenKey] = useState(null);
  const rows = (list || []).filter((s) => s.legs.length > 1 || s.lots.length > 0);
  if (rows.length === 0) return null;
  const t = setupTotals(list);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-900">By setup</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          Each position counted once, whole. A put assigned into shares, the calls written on those
          shares and the shares themselves are one setup here &mdash; the strategy table above has to
          split them, because a share lot and the call written on it are not the same strategy.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Setups that finished and lost</div>
          <div className="text-lg font-semibold tabular-nums text-rose-600 mt-1">
            {fmtMoney(t.settledLosses)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            {t.settledLossCount} of {t.setups} setups · every leg counted, shares included
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Still running</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900 mt-1">{t.stillOpen}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            Shares from these are still held, so what they booked so far is not their result
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">Spanning more than one strategy</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900 mt-1">
            {(list || []).filter((s) => s.split.length > 0).length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            The strategy table cannot state these on one row
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className={th}>Setup</th>
              <th className={th}>What it was</th>
              <th className={`${th} text-right`}>Legs</th>
              <th className={`${th} text-right`}>Option legs</th>
              <th className={`${th} text-right`}>Shares</th>
              <th className={`${th} text-right`}>Booked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isOpen = openKey === s.key;
              return [
                <tr
                  key={s.key}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setOpenKey(isOpen ? null : s.key)}
                >
                  <td className={`${td} font-medium text-slate-900`}>
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {s.ticker}
                    </span>
                    <div className="text-[10px] text-slate-400 font-normal pl-5">
                      {s.from} &rarr; {s.to}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-600">
                    {shape(s)}
                    {s.open && (
                      <div className="text-[10px] text-amber-700">
                        Still running &mdash; {s.sharesOpen} shares held, {fmtMoney(s.sharesCost)} of cost
                      </div>
                    )}
                  </td>
                  <td className={`${td} text-right`}>{s.legs.length}</td>
                  <td className={`${td} text-right ${s.optionPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtMoney(s.optionPL)}
                  </td>
                  <td className={`${td} text-right ${s.sharePL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {s.sharePL === 0 ? "—" : fmtMoney(s.sharePL)}
                  </td>
                  {/* THE HEADLINE OF THE ROW, and the only figure here that
                      answers "what did this position do". On a setup still
                      holding shares it is money booked so far and the label
                      above says so -- a running position has no result yet,
                      and printing one would be the same mistake in a new
                      table. */}
                  <td className={`${td} text-right font-semibold ${s.booked >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtMoney(s.booked)}
                    {s.open && <span className="block text-[10px] font-normal text-slate-400">so far</span>}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${s.key}-legs`} className="bg-slate-50 border-b border-slate-100">
                    <td colSpan={6} className="px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                        The legs, as they closed
                      </div>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {s.legs.map((leg, i) => (
                            <tr key={leg.id || i} className="text-slate-600">
                              <td className="py-1 pr-3 whitespace-nowrap">{leg.close_date}</td>
                              <td className="py-1 pr-3">{strategyLabel(leg.strategy)}</td>
                              <td className="py-1 pr-3 whitespace-nowrap text-slate-400">
                                {leg.qty}&times; {leg.short_strike > 0 ? leg.short_strike : leg.long_strike}
                                {leg.close_reason ? ` · ${leg.close_reason}` : ""}
                              </td>
                              <td
                                className={`py-1 text-right tabular-nums ${
                                  (leg.realized_pl || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                                }`}
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
      </div>

      <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
        A setup links shares to the option that delivered them, the option that took them away, and
        any covered call written while they were held. A cash-secured put opened while shares are
        held is the next turn of the wheel and is left on its own; so is a long put held alongside
        shares, because nothing stored says whether it was protection or a bet of its own. Nothing
        here restates a stored figure &mdash; this table only says which rows were one position.
      </p>
    </div>
  );
}
