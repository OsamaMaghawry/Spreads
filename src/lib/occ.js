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

// The readable parts of a contract symbol, for labelling a row.
//
// Returns null rather than a partly-filled object when the symbol is not an OCC
// contract: a caller that falls back to showing the raw symbol is right, and one
// that renders "undefined undefined" is not.
//
// Strike is eight digits in thousandths, so 00757000 is 757 and 00212500 is
// 212.5 -- printed without trailing zeros because a half-strike matters and a
// ".000" does not.
export function parseOCC(symbol) {
  const match = String(symbol || "").match(OCC);
  if (!match) return null;
  const [, root, yymmdd, type, strike8] = match;
  return {
    ticker: root,
    expiry: `${yymmdd.slice(2, 4)}/${yymmdd.slice(4, 6)}`,
    type,
    strike: Number(strike8) / 1000,
    adjusted: /\d$/.test(root)
  };
}
