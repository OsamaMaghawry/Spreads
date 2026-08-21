import { fmtMoney } from "@/lib/format";

// Legs-mode quote readout. Backend returns a signed net debit per unit:
// negative = credit received (selling a long leg), positive = debit paid.
export default function LegsQuoteSummary({ quote, qty }) {
  const midDebit = quote.midDebit ?? 0;
  const isCredit = midDebit < 0;
  const cash = -midDebit * qty * 100;
  const lo = Math.min(quote.bidDebit, quote.askDebit);
  const hi = Math.max(quote.bidDebit, quote.askDebit);

  return (
    <div className="grid grid-cols-2 gap-y-1.5 tabular-nums">
      <span className="text-slate-500">{isCredit ? "Mid credit to close" : "Mid debit to close"}</span>
      <span className={`text-right font-medium ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
        {fmtMoney(Math.abs(midDebit))}
      </span>
      <span className="text-slate-500">{isCredit ? "Credit range (bid / ask)" : "Bid / Ask debit"}</span>
      <span className="text-right">
        {isCredit
          ? `${fmtMoney(Math.abs(hi))} / ${fmtMoney(Math.abs(lo))}`
          : `${fmtMoney(quote.bidDebit)} / ${fmtMoney(quote.askDebit)}`}
      </span>
      <span className="text-slate-500">
        {isCredit ? "Estimated cash received" : "Estimated cash paid"} for {qty} unit{qty > 1 ? "s" : ""}
      </span>
      <span className={`text-right font-semibold ${cash >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
        {fmtMoney(cash)}
      </span>
    </div>
  );
}