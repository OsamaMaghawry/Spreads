// OCC option symbol parsing.
//
// Its own module so the trade-reconstruction logic can import it without
// pulling in alpaca.ts, which reaches for the credential-encryption key at
// import time and therefore cannot run outside an edge function.

export function parseOCCSymbol(symbol) {
  const match = String(symbol || "").match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const raw = match[2];
  return {
    ticker: match[1],
    expiry: raw,
    expiryFormatted: `20${raw.substring(0, 2)}-${raw.substring(2, 4)}-${raw.substring(4, 6)}`,
    type: match[3],
    strike: parseFloat(match[4]) / 1000
  };
}
