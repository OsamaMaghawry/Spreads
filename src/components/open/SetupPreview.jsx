import { fmtMoney } from "@/lib/format";

const ROLE_LABEL = {
  short_put: "Short put",
  long_put: "Long put",
  short_call: "Short call",
  long_call: "Long call"
};

export default function SetupPreview({ setup, qty }) {
  const unit = setup.strategy === "iron_condor" ? "condor" : "spread";
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{setup.ticker} · Expiry {setup.expiry}</span>
        <span>Spot {fmtMoney(setup.spot)}</span>
      </div>

      <div className="space-y-1">
        {setup.legs.map((l) => (
          <div key={l.symbol} className="flex items-center justify-between tabular-nums">
            <span className="text-slate-500">
              {l.side === "sell" ? "Sell" : "Buy"} {l.ratio}× {ROLE_LABEL[l.role]} {fmtMoney(l.strike)}
            </span>
            <span className="text-slate-700">
              {fmtMoney(l.bid)} / {fmtMoney(l.ask)}
              <span className="text-slate-400 ml-2">Δ {l.delta.toFixed(2)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 tabular-nums border-t border-slate-200 pt-2">
        {/* Credit and width are quoted per share; risk and totals are per
            contract. Scaling the credit here keeps every dollar figure in this
            block on the same footing — a $0.93 credit beside a $157.00 risk
            reads as a mistake even when the arithmetic behind it is right. */}
        <span className="text-slate-500">Credit / {unit}</span>
        <span className="text-right text-emerald-600 font-medium">{fmtMoney(setup.credit * 100)}</span>
        <span className="text-slate-500">Widest side width</span>
        <span className="text-right">{fmtMoney(setup.width * 100)}</span>
        <span className="text-slate-500">Max risk / {unit}</span>
        <span className="text-right">{fmtMoney(setup.maxRisk)}</span>
        <span className="text-slate-500">Total credit ({qty} {unit}{qty > 1 ? "s" : ""})</span>
        <span className="text-right text-emerald-600 font-semibold">{fmtMoney(setup.credit * qty * 100)}</span>
        <span className="text-slate-500">Total max risk</span>
        <span className="text-right font-semibold">{fmtMoney(setup.maxRisk * qty)}</span>
        <span className="text-slate-500">Break-even</span>
        <span className="text-right">
          {setup.breakEvenLow != null ? fmtMoney(setup.breakEvenLow) : "—"}
          {setup.breakEvenHigh != null && <span className="text-slate-400"> – {fmtMoney(setup.breakEvenHigh)}</span>}
        </span>
      </div>
    </div>
  );
}