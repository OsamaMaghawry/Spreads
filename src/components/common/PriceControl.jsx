import { Minus, Plus } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { verdictFor, markPosition, round2 } from "@/lib/priceVerdict";

// Setting a price by hand, on either side of the trade.
//
// Once the walk is switched off, the only question that matters is whether the
// price will cross now or rest, and that is a comparison against the live bid
// and ask. Asking someone to hold three numbers in their head and work it out is
// how a limit gets left somewhere it can never fill -- so the control shows the
// mark against the spread and says, in a sentence, what will happen.
//
// side="debit"  -- closing. You pay; a higher number crosses.
// side="credit" -- opening. You are paid; a LOWER number crosses.
// The comparison itself lives in lib/priceVerdict.js, tested, because getting
// that direction backwards on the open side costs real money.

const STEP = 0.01;

export default function PriceControl({ price, onChange, quote, unit, qty, side = "debit", id = "limit-price" }) {
  const bid = quote?.bid;
  const ask = quote?.ask;
  const mid = quote?.mid;
  const last = quote?.last;
  const priced = typeof bid === "number" && typeof ask === "number" && ask >= bid;
  // A price is not chosen until a quote gives it somewhere sane to start.
  // Rendering the control regardless is the point: with the market closed there
  // is no mid to seed from, and a ticket that throws is worse than one that says
  // it cannot price anything yet.
  const empty = typeof price !== "number" || !Number.isFinite(price);

  // Stepping from nothing needs a starting point, and the mid is the honest one.
  const from = () => (empty ? (typeof mid === "number" ? mid : typeof bid === "number" ? bid : 0.01) : price);
  const set = (v) => onChange(Math.max(0.01, round2(v)));

  const chips = [
    { label: "Bid", value: bid },
    { label: "Mid", value: mid },
    { label: "Ask", value: ask },
    { label: "Last", value: last }
  ].filter((c) => typeof c.value === "number" && isFinite(c.value) && c.value > 0);

  const pos = markPosition({ price, bid, ask });
  const verdict = verdictFor({ price, bid, ask, side });
  const noun = side === "credit" ? "Limit credit" : "Limit debit";

  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1.5" htmlFor={id}>
        {noun}, per {unit}
      </label>

      <div className="flex rounded-lg border border-slate-300 overflow-hidden">
        <button
          type="button"
          onClick={() => set(from() - (empty ? 0 : STEP))}
          aria-label={`Lower the ${side === "credit" ? "credit" : "limit"} by one cent`}
          className="w-11 flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-0.5 border-x border-slate-300 px-2">
          <span className="text-slate-400 text-sm">$</span>
          <input
            id={id}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="—"
            value={empty ? "" : price.toFixed(2)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) set(v);
              else onChange(null);
            }}
            className="w-24 py-2.5 text-lg tabular-nums text-slate-900 text-center bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          onClick={() => set(from() + (empty ? 0 : STEP))}
          aria-label={`Raise the ${side === "credit" ? "credit" : "limit"} by one cent`}
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

      {priced && pos !== null && (
        <div className="mt-3">
          {/* The track IS the slider. A native range input sits over it, thumb
              hidden, wired to the same set() the stepper, the chips and the
              text field call -- so typing, stepping and dragging are one
              number, not three. The range extends past bid and ask by the
              8% the track already reserves, so the ticks stay put and a price
              a little outside the quotes can still be dragged to. */}
          <div className="relative h-6 rounded-md bg-gradient-to-r from-emerald-50 via-slate-100 to-rose-50 border border-slate-200">
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-slate-300 rounded" style={{ left: "8%" }} />
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-slate-300 rounded" style={{ left: "92%" }} />
            <span
              className="absolute -top-1.5 -bottom-1.5 w-[3px] bg-emerald-600 rounded ring-4 ring-emerald-600/15 pointer-events-none"
              style={{ left: `${8 + pos * 84}%` }}
            />
            <input
              type="range"
              aria-label={`Drag to set the ${side === "credit" ? "credit" : "limit"}`}
              min={round2(bid - Math.max(ask - bid, 0.01) * (8 / 84))}
              max={round2(ask + Math.max(ask - bid, 0.01) * (8 / 84))}
              step="0.01"
              value={empty ? (typeof mid === "number" ? mid : bid) : price}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (isFinite(v)) set(v);
              }}
              className="absolute inset-0 w-full h-full cursor-ew-resize opacity-0 [appearance:none] bg-transparent"
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

      {priced && empty && (
        <p className="mt-2 text-xs text-amber-600 leading-relaxed">
          Pick a price — tap one of the marks above, or step up from the mid.
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500 leading-relaxed">
        Your price stays where you put it. It is not walked, not adjusted and not cancelled — it rests
        until it fills or you cancel it.
        {!empty && (
          <>
            {" "}
            Total {fmtMoney(price * 100 * (Number(qty) || 1))} to {side === "credit" ? "collect on" : "close"}{" "}
            {Number(qty) || 1} {unit}
            {(Number(qty) || 1) > 1 ? "s" : ""}.
          </>
        )}
      </p>
    </div>
  );
}
