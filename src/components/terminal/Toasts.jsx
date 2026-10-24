import { CheckCircle2, Loader2, XCircle, X } from "lucide-react";

// Order news at the front of the screen. The owner, 24 Oct: "The order
// notification is still so confusing ... don't even know if it placed or not.
// Make it more obvious. In the front of screen pop whether placed or there is
// a problem." One card per order, top centre, replaced in place as the order
// moves (sending, placed, filled), so there is one line to read, never a
// stack of repeats. Good news goes by itself after a few seconds; a problem
// stays until closed.

const STYLE = {
  ok: { box: "border-emerald-300 bg-emerald-50 text-emerald-950", Icon: CheckCircle2, icon: "text-emerald-600" },
  wait: { box: "border-sky-300 bg-white text-slate-900", Icon: Loader2, icon: "animate-spin text-sky-600" },
  muted: { box: "border-slate-300 bg-white text-slate-900", Icon: XCircle, icon: "text-slate-400" },
  bad: { box: "border-rose-300 bg-rose-50 text-rose-950", Icon: XCircle, icon: "text-rose-600" }
};

export default function Toasts({ toasts, onClose }) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const s = STYLE[t.tone] || STYLE.wait;
        return (
          <div key={t.key} role={t.tone === "bad" ? "alert" : "status"} aria-live={t.tone === "bad" ? "assertive" : "polite"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${s.box}`}>
            <s.Icon className={`mt-0.5 h-6 w-6 shrink-0 ${s.icon}`} />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold leading-tight">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-sm tabular-nums opacity-90">{t.detail}</div>}
            </div>
            {t.action && (
              <button type="button" onClick={t.action.run} className="shrink-0 self-center rounded-md border border-current px-2 py-1 text-xs font-medium hover:bg-white/60">
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Close" onClick={() => onClose(t.key)} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
