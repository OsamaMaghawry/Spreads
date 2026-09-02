// How far the underlying has moved today, against yesterday's official close.
//
// The previous close travels from the broker's snapshot (marketPrice.ts) and
// the price does not: the dashboard overlays a streaming price on every
// position, so the move is computed where it is shown and keeps up with the
// tick beside it.
//
// Returns null rather than zero whenever there is nothing to measure. "0.00%"
// is a claim that the name has not moved, and a missing previous close — a
// first day of trading, a halted name, a feed gap — is not that claim.

export function dayChange(price, prevClose) {
  const p = Number(price);
  const base = Number(prevClose);
  if (!Number.isFinite(p) || !Number.isFinite(base) || p <= 0 || base <= 0) return null;
  const abs = p - base;
  return { abs, pct: (abs / base) * 100, up: abs >= 0 };
}

// "+1.24%" / "−0.38%" — a real minus sign, and always signed: an unsigned
// percentage next to a price reads as a size, not a direction.
export function dayChangeLabel(change) {
  if (!change) return null;
  const sign = change.pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(change.pct).toFixed(2)}%`;
}
