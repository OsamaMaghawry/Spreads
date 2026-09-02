// How a non-spread position reads on screen.
//
// The dashboard used to render only what spreadPairing could pair, so a wheel
// account -- cash-secured puts, covered calls, assigned shares -- showed nothing
// at all, and a naked short call was the one position guaranteed to be hidden.
// These are the labels for everything that now comes through.

export const SINGLE_KINDS = {
  cash_secured_put: { badge: "CSP", label: "Cash-secured put", cls: "border-violet-200 bg-violet-100 text-violet-700" },
  naked_put: { badge: "Short put", label: "Short put (uncovered)", cls: "border-amber-200 bg-amber-100 text-amber-800" },
  covered_call: { badge: "CC", label: "Covered call", cls: "border-sky-200 bg-sky-100 text-sky-700" },
  naked_call: { badge: "Naked call", label: "Naked call", cls: "border-rose-200 bg-rose-100 text-rose-700" },
  long_option: { badge: "Long", label: "Long option", cls: "border-slate-200 bg-slate-100 text-slate-700" },
  shares: { badge: "Shares", label: "Shares", cls: "border-slate-200 bg-slate-100 text-slate-700" }
};

export const isSingle = (s) => !!s?.single;
export const kindOf = (s) => SINGLE_KINDS[s?.type] || null;

// Max risk as text.
//
// A naked call can lose without limit, so it never shows a number and never
// shows a blank that could be read as "nothing to worry about". Saying
// "Unlimited" out loud is the entire point of surfacing these positions.
export function riskText(s, fmtMoney) {
  if (s.adjusted) return "—";
  if (s.type === "naked_call") return "Unlimited";
  if (s.maxRisk === null || s.maxRisk === undefined) return "—";
  return fmtMoney(s.maxRisk);
}

export const riskIsUnbounded = (s) => s?.type === "naked_call";
