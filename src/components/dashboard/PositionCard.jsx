import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import StrikeLadder from "./StrikeLadder";
import CardLegs from "./CardLegs";
import { isSingle, kindOf, riskText, riskLabel, isStockRisk, basisNote, stressLabel, stressText, stressNote } from "@/lib/positionKind";
import { dayChange, dayChangeLabel } from "@/lib/dayChange";

const badge = "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border";

export default function PositionCard({ spread: s, accountId, onClose }) {
  const [open, setOpen] = useState(false);
  // The UNDERLYING's move today -- not this position's return, which is the
  // unrealized P/L on the other side of the header. Labelled for that reason.
  const change = dayChange(s.stockPrice, s.prevClose);

  const breakEven = {
    label: "Break-Even",
    value: s.adjusted
      ? "—"
      : s.breakEvenHigh != null
        ? `${fmtMoney(s.breakEven)} – ${fmtMoney(s.breakEvenHigh)}`
        : fmtMoney(s.breakEven),
    title: basisNote(s)
  };
  // Withheld on an adjusted contract: the width it is derived from is not
  // what the contract delivers any more. On a naked call it is not withheld
  // but stated -- "Unlimited" is the most important word on the card.
  const risk = { label: riskLabel(s), value: riskText(s, fmtMoney), tone: "text-rose-600" };
  // Stock-like rows headline the loss at a defined adverse move -- the figure
  // that rolls into the account -- with stock-to-zero in the tooltip. Summing
  // stock-to-zero across a book is notional, not risk.
  const stress = {
    label: stressLabel(s),
    value: s.type === "naked_call" ? `Unlimited · ${stressText(s, fmtMoney)}` : stressText(s, fmtMoney),
    tone: s.stressLoss === 0 ? "text-emerald-600" : "text-rose-600",
    title: stressNote(s, fmtMoney)
  };
  const footer = isStockRisk(s)
    // A wheel is run against its break-even, so that leads.
    ? [
        breakEven,
        { label: "Qty", value: s.type === "shares" ? s.shareQty : s.qty },
        { label: "Capital tied up", value: s.collateral != null ? fmtMoney(s.collateral) : "—" },
        stress,
        { label: "Expiry", value: s.expiryFormatted || "—" }
      ]
    : [
        { label: "Qty", value: s.qty },
        breakEven,
        risk,
        { label: "Net Credit", value: fmtMoney(s.totalCredit), tone: "text-emerald-600" },
        { label: "Expiry", value: s.expiryFormatted || "—" }
      ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-slate-900">{s.ticker}</span>
          {change && (
            <span
              title={`${s.ticker} today, against yesterday's close of ${fmtMoney(s.prevClose)}`}
              className={`text-xs font-semibold tabular-nums ${change.up ? "text-emerald-600" : "text-rose-600"}`}
            >
              {dayChangeLabel(change)} <span className="font-normal text-slate-400">today</span>
            </span>
          )}
          {s.type === "iron_condor" && <span className={`${badge} border-indigo-200 bg-indigo-100 text-indigo-700`}>IC</span>}
          {s.type === "call_spread" && <span className={`${badge} border-sky-200 bg-sky-100 text-sky-700`}>Call</span>}
          {s.type === "put_spread" && <span className={`${badge} border-violet-200 bg-violet-100 text-violet-700`}>Put</span>}
          {isSingle(s) && kindOf(s) && (
            <span className={`${badge} ${kindOf(s).cls}`} title={kindOf(s).label}>{kindOf(s).badge}</span>
          )}
          <span
            className={`${badge} ${
              s.moneyness === "ITM"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : s.moneyness === "OTM"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  // No price to judge against, so no verdict to paint.
                  : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            {s.moneyness || "—"}
          </span>
          {s.openOrders?.length > 0 && <span className={`${badge} border-amber-200 bg-amber-100 text-amber-700`}>Open order</span>}
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Unrealized P/L</div>
          <div
            className={`text-2xl font-semibold tabular-nums ${
              s.unrealizedPL > 0 ? "text-emerald-600" : s.unrealizedPL < 0 ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {s.unrealizedPL > 0 ? "+" : ""}
            {fmtMoney(s.unrealizedPL)}
          </div>
          {/* Priced from the broker's stored per-leg price because a live quote
              was missing. That price is last-trade based and goes stale on thin
              contracts, so say so rather than presenting it as a mark. */}
          {s.priceSource === "broker" && (
            <div className="text-[10px] text-amber-600" title="No live bid/ask for every leg, so this is priced from the last trade the broker has on record — it may be stale">
              last trade — no live quote
            </div>
          )}
        </div>
      </div>

      <StrikeLadder spread={s} />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
        {footer.map((f) => (
          <div key={f.label} title={f.title}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{f.label}</div>
            <div className={`text-sm font-medium tabular-nums ${f.tone || "text-slate-900"}`}>{f.value}</div>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Legs
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => onClose(s)}
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
          >
            Close
          </button>
        </div>
      </div>

      {open && (
        <CardLegs
          spread={s}
          accountId={accountId}
          onCloseLeg={(leg) => onClose({ ...s, presetLegSymbol: leg.symbol })}
        />
      )}
    </div>
  );
}