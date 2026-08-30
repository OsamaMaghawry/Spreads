// OCC option symbol parsing.
//
// Its own module so the trade-reconstruction logic can import it without
// pulling in alpaca.ts, which reaches for the credential-encryption key at
// import time and therefore cannot run outside an edge function.

// Root, six-digit expiry, C or P, eight-digit strike.
//
// The root is not always letters. When a corporate action changes what a
// contract delivers -- a split, a spin-off, a special dividend -- the OCC
// appends a digit: AAPL becomes AAPL1, and every contract written before the
// action keeps trading under the new root. A letters-only root refused those
// symbols outright, and refusal was not the harm; what followed was. The
// option was never reconstructed, so its premium vanished from the account
// total, and the symbol then fell through to the stock side -- which takes
// anything that is not an option -- and booked "1 share of
// AAPL1260828C00100000 at $2.50" into the share ledger.
//
// The root is anchored to at most six characters and the trailing 15 are
// fixed, so a numeric root digit cannot swallow the expiry.
const OCC = /^([A-Z][A-Z0-9]{0,5})(\d{6})([CP])(\d{8})$/;

export function parseOCCSymbol(symbol) {
  const match = String(symbol || "").match(OCC);
  if (!match) return null;
  const raw = match[2];
  const root = match[1];
  // The underlying without the adjustment digit, for the places that need to
  // know what stock this is about -- a price lookup, a label.
  const underlying = root.replace(/\d+$/, "") || root;
  return {
    // `ticker` is the root as written, adjustment digit included, and that is
    // deliberate: it is the key the share ledger runs FIFO on. Stripping the
    // digit put a fabricated "100 shares at the strike" lot -- fabricated
    // because an adjusted contract no longer delivers that -- into the same
    // queue as the account's real AAPL shares, where it consumed correct lots
    // and rewrote rows that carry no adjusted marking. Keeping the root keeps
    // an approximation confined to the position it is an approximation of,
    // which is also what stops a short AAPL 150P and a long AAPL1 145P pairing
    // into a spread with a width neither of them has.
    ticker: root,
    underlying,
    root,
    // What the contract delivers is no longer 100 shares of the underlying at
    // the strike, and the symbol alone does not say what it is instead. Every
    // figure derived from strike x 100 is a guess on these, which is why the
    // flag travels with the parse rather than being inferred later.
    adjusted: root !== underlying,
    expiry: raw,
    expiryFormatted: `20${raw.substring(0, 2)}-${raw.substring(2, 4)}-${raw.substring(4, 6)}`,
    type: match[3],
    strike: parseFloat(match[4]) / 1000
  };
}

// Whether a stored symbol is an adjusted contract, for callers that hold a
// symbol and no parse.
export function isAdjustedOption(symbol) {
  const parsed = parseOCCSymbol(symbol);
  return !!(parsed && parsed.adjusted);
}
