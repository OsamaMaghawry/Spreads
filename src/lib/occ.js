// The OCC symbol facts the interface needs, mirroring
// supabase/functions/_shared/occ.ts.
//
// Only what can be read from a stored symbol, so a row can be labelled without
// a column to carry the label.

const OCC = /^([A-Z][A-Z0-9]{0,5})(\d{6})([CP])(\d{8})$/;

// A corporate action -- split, spin-off, special dividend -- appends a digit to
// the root: AAPL becomes AAPL1. Those contracts no longer deliver 100 shares of
// the underlying at the strike, so every figure this app derives from strike
// times 100 is approximate on them, and the row has to say so.
export function isAdjustedOption(symbol) {
  const match = String(symbol || "").match(OCC);
  return !!match && /\d$/.test(match[1]);
}

export const isAdjustedTrade = (t) =>
  isAdjustedOption(t?.short_symbol) || isAdjustedOption(t?.long_symbol);
