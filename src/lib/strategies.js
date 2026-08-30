// The categories a closed position falls into, defined once.
//
// A cash-secured put and a covered call used to share one label, "wheel". They
// are the two halves of a cycle — one takes delivery of shares, the other gives
// them away — and reading a cycle back means telling them apart.
//
// `wheel` is still listed because rows written before the split keep that value
// until the next sync recomputes them, which happens on its own. It is
// labelled so it is obvious those rows are stale rather than a category anyone
// should be choosing.
export const STRATEGIES = [
  { key: "spreads", label: "Spreads", badge: "bg-indigo-100 text-indigo-700" },
  { key: "cash_secured_put", label: "Cash-secured puts", badge: "bg-amber-100 text-amber-700" },
  { key: "covered_call", label: "Covered calls", badge: "bg-teal-100 text-teal-700" },
  { key: "wheel", label: "Wheel (not yet synced)", badge: "bg-orange-100 text-orange-700" },
  { key: "unknown", label: "Untagged", badge: "bg-slate-100 text-slate-600" }
];

const byKey = Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));

export const strategyOf = (trade) => byKey[trade?.strategy] ? trade.strategy : "unknown";
export const strategyLabel = (key) => (byKey[key] || byKey.unknown).label;
export const strategyBadge = (key) => (byKey[key] || byKey.unknown).badge;

// The three parts of a result, in the order they happen: what was taken at
// open, what closing it cost, what the shares did afterwards.
export const COMPONENTS = [
  { key: "premium_pl", label: "Premium" },
  { key: "early_close_pl", label: "Early close" },
  { key: "stock_pl", label: "From assignment" }
];

export const sumBy = (rows, field) => rows.reduce((a, r) => a + (Number(r[field]) || 0), 0);
