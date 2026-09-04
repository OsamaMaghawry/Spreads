import { useMemo } from "react";
import PriceControl from "@/components/common/PriceControl";
import { netQuote } from "@/lib/priceVerdict";
import { walkBounds } from "@/lib/openWalk";
import { fmtMoney } from "@/lib/format";

// How the opening order is priced -- shared by the screener's ticket and Open
// Position, so the two cannot drift apart.
//
// The walk here starts OPTIMISTIC and concedes, which is the opposite of the
// close ticket and the reason the defaults below are what they are. The
// scanner's credit is short.bid - long.ask: the price the market is already
// bidding, so it should fill immediately. Starting there means never finding out
// whether someone would have paid more. So:
//
//   start  = the ask side of the structure -- the best credit worth asking for
//   floor  = the scanner's own credit -- never accept less than the trade you
//            were shown, because conceding credit raises max risk
//
// The walk therefore tries to beat the scan and cannot do worse than it.

export const MODES = [
  { id: "walk", label: "Walk to fill" },
  { id: "manual", label: "Set my price" },
  { id: "market", label: "Market" }
];

export function openingDefaults(setup) {
  const q = netQuote(setup?.legs);
  const scan = typeof setup?.credit === "number" ? Math.round(setup.credit * 100) / 100 : null;
  return {
    quote: q,
    // A structure with no usable quote falls back to the scan's own number
    // rather than inventing one.
    start: q?.ask ?? scan,
    floor: scan
  };
}

export default function OpenPricing({
  setup, qty, unit,
  priceMode, onPriceMode,
  credit, onCredit,
  minCredit, onMinCredit,
  liveQuote = null
}) {
  const { quote: scanQuote } = useMemo(() => openingDefaults(setup), [setup]);
  // The live quote, when the ticket has one, is what the verdict and the chips
  // are measured against: "crosses now" means now, not at scan time.
  const quote = liveQuote || scanQuote;
  const bounds = useMemo(() => walkBounds(credit, quote, minCredit), [credit, quote, minCredit]);

  const label = "text-xs text-slate-500 block mb-1.5";
  const input =
    "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 tabular-nums focus:outline-none focus:border-emerald-500";

  return (
    <>
      <div>
        <label className={label}>How to price it</label>
        <div className="flex rounded-lg overflow-hidden border border-slate-300">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPriceMode(m.id)}
              className={`flex-1 py-2 text-sm transition-colors ${
                priceMode === m.id
                  ? "bg-emerald-100 text-emerald-700 font-medium"
                  : "bg-white text-slate-500 hover:text-slate-900"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Only "Set my price" gets a price control. The walk chooses its own
          starting credit from the ask side of the structure and concedes from
          there, so a slider next to it invited the user to set a number the
          walk was going to move anyway — and made an automatic mechanism look
          like a manual one. What the user actually controls on a walk is the
          floor, which is the input below. Matches the close ticket, where the
          walk has never had a slider. */}
      {priceMode === "manual" && (
        <PriceControl
          price={credit}
          onChange={onCredit}
          quote={quote}
          unit={unit}
          qty={qty}
          side="credit"
          id="open-limit-credit"
        />
      )}

      {priceMode === "walk" && (
        <div>
          <label className={label} htmlFor="open-min-credit">
            Never accept less than
          </label>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">$</span>
            <input
              id="open-min-credit"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="—"
              value={typeof minCredit === "number" ? minCredit.toFixed(2) : ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onMinCredit(isFinite(v) ? Math.max(0.01, Math.round(v * 100) / 100) : null);
              }}
              className={input}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            {bounds.willWalk
              ? `Starts at ${fmtMoney(bounds.start)} and concedes toward the bid every 30s until it fills — never below ${fmtMoney(bounds.floor)}. Bigger steps on a wider market.`
              : bounds.floor === null
                ? "No quote to walk against, so it will rest at the credit above rather than concede."
                : `${fmtMoney(bounds.start)} is already at or below ${fmtMoney(bounds.floor)}, so there is nothing to concede — it rests here.`}
            {" "}
            An open that never fills costs nothing; conceding credit raises your maximum loss, which is why the floor is yours to set.
          </p>
        </div>
      )}

      {priceMode === "market" && (
        <p className="text-xs text-slate-500 leading-relaxed">
          Market order executes immediately — the credit received may be lower than quoted.
        </p>
      )}
    </>
  );
}
