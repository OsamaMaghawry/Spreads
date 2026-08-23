import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

// Two-step guard: every order submission must be explicitly confirmed.
//
// `warnings` renders above the confirm buttons, so anything the trader should
// weigh — an earnings date inside the holding period, an outsized share of the
// account — is in front of them at the moment of commitment rather than one
// screen back.
export default function ConfirmSubmit({ label, summary, warnings, onConfirm, disabled, submitting, tone = "emerald" }) {
  const [armed, setArmed] = useState(false);

  const toneCls =
    tone === "rose"
      ? "bg-rose-500/90 hover:bg-rose-500"
      : "bg-emerald-500/90 hover:bg-emerald-500";

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        disabled={disabled}
        className={`w-full py-2.5 rounded-lg ${toneCls} text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-3">
      <div className="flex gap-2 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Confirm this order — it will be sent to the broker.</span>
          {summary && <div className="mt-1 text-amber-700">{summary}</div>}
        </div>
      </div>
      {warnings && <div className="space-y-2">{warnings}</div>}

      <div className="flex gap-2">
        <button
          onClick={() => setArmed(false)}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className={`flex-1 py-2.5 rounded-lg ${toneCls} text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Yes, submit
        </button>
      </div>
    </div>
  );
}