import { AlertTriangle, Info } from "lucide-react";

// What the server wants you to know, with the decision left where it belongs.
//
// The owner, after being refused an order on a Saturday: *"the app shouldn't
// decide for the user whether to put the order or not. It should just warn and
// the user can continue or not... Alpaca doesn't prevent anyone putting orders
// on weekends so do I."*
//
// So this panel has two buttons and no dead end. Nothing was sent when it
// appeared; "Send it anyway" sends exactly the order that was held, and "Back
// to the ticket" returns to it with the setup, quantity and price untouched.
//
// The notes themselves are written server-side, where the market is, and are
// rendered verbatim — a second, shorter version of a warning written here
// would be a second answer to "what is wrong", and the two would drift.
export default function OrderWarnings({ warnings, onSend, onBack }) {
  if (!warnings?.length) return null;
  const serious = warnings.some((w) => w.severity === "serious");

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border p-3 space-y-3 ${
          serious ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <p className={`text-xs font-semibold ${serious ? "text-amber-900" : "text-slate-700"}`}>
          Nothing has been sent. {warnings.length === 1 ? "One thing" : `${warnings.length} things`} worth
          knowing first:
        </p>
        <ul className="space-y-2.5">
          {warnings.map((w) => {
            const hard = w.severity === "serious";
            const Icon = hard ? AlertTriangle : Info;
            return (
              <li key={w.code} className="flex gap-2">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${hard ? "text-amber-600" : "text-slate-400"}`} />
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${hard ? "text-amber-900" : "text-slate-800"}`}>
                    {w.title}
                  </span>
                  <span className={`block text-xs leading-relaxed ${hard ? "text-amber-800" : "text-slate-600"}`}>
                    {w.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors"
        >
          Back to the ticket
        </button>
        <button
          onClick={onSend}
          className="flex-1 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
        >
          Send it anyway
        </button>
      </div>
    </div>
  );
}
