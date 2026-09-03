import { useState } from "react";
import PriceControl from "@/components/common/PriceControl";

// Changing the price of an order the user set by hand and left resting.
//
// The walk owns its own price and is never touched from here. A resting order
// is the user's instruction, so the only thing that changes it is the user:
// the control stays live under the log, against the live quote, and "Update
// price" asks the broker to replace the order. The old order is retired and a
// new one takes its place -- useOpenOrder follows the new id.

export default function RestingOrder({ credit, onCredit, quote, unit, qty, side = "credit", onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = typeof credit === "number" && credit > 0;

  const update = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(credit);
    } catch (e) {
      setError(e.message || "Could not change the price.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Your order is resting at the broker. Change the {side === "credit" ? "credit" : "price"} here and it is
        replaced at the new one — nothing is walked, and cancelling it is still yours to do from the Orders tab.
      </p>
      <PriceControl price={credit} onChange={onCredit} quote={quote} unit={unit} qty={qty} side={side} id="resting-price" />
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="button"
        onClick={update}
        disabled={busy || !ready}
        className="w-full py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update price"}
      </button>
    </div>
  );
}
