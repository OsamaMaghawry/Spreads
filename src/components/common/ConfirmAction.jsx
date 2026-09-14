import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// A button that asks before it acts.
//
// The owner: *"I want a confirmation after clicking on any option; Cancel
// order or Change or Private."* Three buttons sat on a working order and every
// one of them was a single click away from changing money at the broker --
// cancelling it, repricing it, or pulling it off the market. On a phone, with
// the buttons a thumb-width apart, that is a misfire waiting to happen.
//
// WHY IT CONFIRMS IN PLACE RATHER THAN IN A MODAL. A dialog over the order
// hides the thing being decided about: the legs, the limit and the live market
// are the context for "are you sure", and covering them with a box that says
// "Are you sure?" removes the only information that could answer it. So the
// row swaps to a question and two buttons, and everything above stays visible.
//
// THE QUESTION NAMES THE CONSEQUENCE, not the control. "Cancel this order?" is
// a restatement of the button; "This order stops working at the broker and
// nothing fills" is what the trader actually needs to weigh. Callers pass that
// sentence; it is required, not optional, so a confirmation cannot be added
// without saying what it is confirming.
//
// PURE PRESENTATION -- it owns no async state of its own beyond the armed flag,
// and `busy` comes from the caller, so the spinner belongs to the real request
// rather than to a timer here.
export default function ConfirmAction({
  label,
  question,
  confirmLabel,
  onConfirm,
  busy = false,
  disabled = false,
  icon = null,
  className = "",
  tone = "neutral"
}) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef(null);

  // The confirm button takes focus when it appears, so the keyboard and a
  // screen reader both land on the decision rather than on whatever followed
  // it in the DOM.
  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  // A confirmation left armed is a trap: the trader looks away, comes back,
  // and a stray tap answers a question they have forgotten. It disarms itself.
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 12000);
    return () => clearTimeout(t);
  }, [armed]);

  const tones = {
    neutral: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
    go: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
  };
  const confirmTones = {
    neutral: "border-slate-800 bg-slate-800 text-white hover:bg-slate-900",
    danger: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
    go: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
  };

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        disabled={disabled || busy}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 ${tones[tone]} ${className}`}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white p-2.5">
      <p className="text-xs text-slate-700 leading-relaxed">{question}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          ref={confirmRef}
          onClick={async () => {
            // Disarmed FIRST. If the action throws, the row must not be left
            // holding a live confirmation the trader could press again on top
            // of a request that may already have reached the broker.
            setArmed(false);
            await onConfirm?.();
          }}
          disabled={busy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${confirmTones[tone]}`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {confirmLabel || `Yes, ${String(label).toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-transparent text-slate-600 text-xs hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
