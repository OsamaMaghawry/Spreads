// What to send the broker to change a resting order's price or size.
//
// Alpaca's PATCH takes the new limit as a signed number under the same
// convention the order was placed with: a multi-leg credit order carries a
// NEGATIVE limit (see openPosition), a single option order a positive one.
// The sign is read from the order as the broker holds it rather than from the
// caller, so a client cannot flip a credit into a debit by sending the wrong
// sign -- the worst outcome a reprice could have.
//
// Returns null when there is nothing valid to send; the caller answers 400.

export interface ReplaceInput {
  order: { limit_price?: string | number | null; type?: string | null; qty?: string | number | null } | null;
  limitPrice?: unknown;
  qty?: unknown;
}

export function replaceBody({ order, limitPrice, qty }: ReplaceInput): Record<string, string> | null {
  if (!order) return null;
  const body: Record<string, string> = {};

  const price = Number(limitPrice);
  if (limitPrice !== undefined && limitPrice !== null && limitPrice !== "") {
    if (!Number.isFinite(price) || price <= 0) return null;
    if (order.type && order.type !== "limit") return null;
    const current = Number(order.limit_price);
    const sign = Number.isFinite(current) && current < 0 ? -1 : 1;
    body.limit_price = String(sign * Math.round(price * 100) / 100);
  }

  if (qty !== undefined && qty !== null && qty !== "") {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return null;
    body.qty = String(n);
  }

  return Object.keys(body).length ? body : null;
}
