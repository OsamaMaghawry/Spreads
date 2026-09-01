import { Minus, Plus } from "lucide-react";
import { fmtMoney } from "@/lib/format";

// Setting a closing price by hand.
//
// Once the walk is switched off, the only question that matters is whether the
// price will cross now or rest, and that is a comparison against the live bid
// and ask. Asking someone to hold three numbers in their head and work it out
// is how a limit gets left somewhere it can never fill — so the control shows
// the mark against the spread and says, in a sentence, what will happen.

const STEP = 0.01;
const round2 = (n) => Math.round(n * 100) / 100;

export default function PriceControl({ price, onChange, quote, unit, qty }) {
  const bid = quote?.bidDebit;
  const ask = quote?.askDebit;
  const mid = quote?.midDebit;
  const last = quote?.lastAttemptDebit;
  const priced = typeof bid === "number" && typeof ask === "number" && ask >= bid;

  const set = (v) => onChange(Math.max(0.01, round2(v)));

  const chips = [
    { label: "Bid", value: bid },
    { label: "Mid", value: mid },
    { label: "Ask", value: ask },
    { label: "Last", value: last }
  ].filter((c) => typeof c.value === "number" && isFinite(c.value) && c.value > 0);

  // Where the mark sits on the bid–ask track, clamped so a price far outside
  // the spread still renders at an edge rather than off the end of the bar.
  const span = priced ? Math.max(ask - bid, 0.01) : 0;
  const pos = priced ? Math.min(1, Math.max(0, (price - bid) / span)) : 0.5;

  let verdict = null;
  if (priced) {
    if (price >= ask) {
      verdict = {
        tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
        text: "At or above the ask — marketable, so this should fill straight away."
      };
    } else if (price <= bid) {
      verdict = {
        tone: "bg-amber-50 border-amber-200 text-amber-800",
        text: "At or below the bid — unlikely to fill unless the market comes to you."
      };
    } else {
      verdict = {
        tone: "bg-amber-50 border-amber-200 text-amber-800",
        text: "Between the quotes — it may rest unfilled until the market moves."
      };
    }
  }

  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1.5" htmlFor="limit-debit">
        Limit debit, per {unit}
      </label>

      <div className="flex rounded-lg border border-slate-300 overflow-hidden">
        <button
          type="button"
          onClick={() => set(price - STEP)}
          aria-label="Lower the limit by one cent"
          className="w-11 flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-0.5 border-x border-slate-300 px-2">
          <span className="text-slate-400 text-sm">$</span>
          <input
            id="limit-debit"
            type="number"
            step="0.01"
            min="0.01"
            value={price.toFixed(2)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) set(v);
            }}
            className="w-24 py-2.5 text-lg tabular-nums text-slate-900 text-center bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          onClick={() => set(price + STEP)}
          aria-label="Raise the limit by one cent"
          className="w-11 flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex gap-1.5 mt-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => set(c.value)}
              className="flex-1 border border-slate-200 rounded-lg py-1.5 text-center hover:border-emerald-400 hover:text-emerald-700 transition-colors group"
            >
              <span className="block text-[10px] uppercase tracking-wide text-slate-400 group-hover:text-emerald-600">
                {c.label}
              </span>
              <span className="block text-xs tabular-nums font-medium text-slate-800 group-hover:text-emerald-700">
                {fmtMoney(c.value)}
              </span>
            </button>
          ))}
        </div>
      )}

      {priced && (
        <div className="mt-3">
          <div className="relative h-6 rounded-md bg-gradient-to-r from-emerald-50 via-slate-100 to-rose-50 border border-slate-200">
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-slate-300 rounded" style={{ left: "8%" }} />
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-slate-300 rounded" style={{ left: "92%" }} />
            <span
              className="absolute -top-1.5 -bottom-1.5 w-[3px] bg-emerald-600 rounded ring-4 ring-emerald-600/15"
              style={{ left: `${8 + pos * 84}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] tabular-nums text-slate-400">
            <span>bid {fmtMoney(bid)}</span>
            <span>mid {fmtMoney(mid)}</span>
            <span>ask {fmtMoney(ask)}</span>
          </div>
        </div>
      )}

      {verdict && (
        <p className={`mt-2 text-xs rounded-lg border px-3 py-2 leading-relaxed ${verdict.tone}`}>{verdict.text}</p>
      )}

      {!priced && (
        <p className="mt-2 text-xs text-amber-600 leading-relaxed">
          No live quote, so there is nothing to judge your price against — the market may be closed.
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500 leading-relaxed">
        Your price stays where you put it. It is not walked, not adjusted and not cancelled — it rests
        until it fills or you cancel it. Total {fmtMoney(price * 100 * qty)} to close {qty} {unit}
        {qty > 1 ? "s" : ""}.
      </p>
    </div>
  );
}
