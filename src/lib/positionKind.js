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

// The stress figure, for stock-like rows: what the position loses if the
// underlying moves against it by the configured shock. This is what rolls
// into the account. Stock-to-zero stays available as the tooltip.
export const movePct = (s) => Math.round(((s?.stressMove ?? 0.15) * 100));
export const stressLabel = (s) => `Loss at −${movePct(s)}%`;
export function stressText(s, fmtMoney) {
  if (s.stressLoss === null || s.stressLoss === undefined) return "—";
  if (s.stressLoss === 0) return "survives";
  return fmtMoney(s.stressLoss);
}
export function stressNote(s, fmtMoney) {
  const zero = s.notionalRisk ?? s.maxRisk;
  const base = `Loss if the stock moves ${movePct(s)}% against this position — the shock clearing and margin engines use.`;
  if (s.type === "naked_call") return `${base} The loss has no upper bound.`;
  if (zero === null || zero === undefined) return base;
  return `${base} Worst case with the stock at zero: ${fmtMoney(zero)} — the same as owning the shares.`;
}

export const riskIsUnbounded = (s) => s?.type === "naked_call";

// Whether the stress figure earns its place on the row.
//
// On a cash-secured put or a covered call it does not. Both are fully
// collateralised by construction -- cash set aside for the put, shares already
// held for the call -- so the number that matters is the capital committed, and
// it is on the row already. A second, smaller figure derived from an arbitrary
// 15% shock reads as a new risk the position does not have, and invites the
// question "15% of what, and why 15?" every time it is seen.
//
// It stays for an uncovered position, where the loss is genuinely open-ended
// and a shock figure is the only way to put a number near it at all.
export const showsStress = (s) => s?.type === "naked_call" || s?.type === "naked_put";

// A wheel position's worst case is the stock going to zero -- the same as
// owning the shares. True, and a different KIND of number from a spread's
// defined risk, so the label says which.
export const isStockRisk = (s) => s?.type === "covered_call" || s?.type === "shares"
  || s?.type === "cash_secured_put" || s?.type === "naked_put";
export const riskLabel = (s) => (isStockRisk(s) ? "Max loss (stock to 0)" : "Max Risk");

// "Adjusted" means the wheel's premiums have been subtracted from the
// assignment strike; "broker" means we could not link them and this is what
// the broker reports. Never silently one or the other.
export const basisNote = (s) =>
  s?.basisSource === "adjusted"
    ? `Adjusted basis — ${s.premiumCollected > 0 ? `$${Number(s.premiumCollected).toFixed(0)} of premium collected on this name` : "premiums counted"}`
    : s?.basisSource === "broker"
      ? "Broker basis — premiums could not be linked to these shares"
      : undefined;
