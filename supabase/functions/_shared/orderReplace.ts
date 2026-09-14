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
  order: {
    limit_price?: string | number | null;
    type?: string | null;
    qty?: string | number | null;
    // Alpaca's own classification. Present on every order it returns.
    asset_class?: string | null;
    symbol?: string | null;
  } | null;
  limitPrice?: unknown;
  qty?: unknown;
}

// Alpaca takes NINE decimal places on a fractional share quantity
// (docs.alpaca.markets/docs/fractional-trading). A contract has none.
const QTY_DECIMALS = 9;

// Shares or contracts? An option order carries `asset_class: "us_option"`;
// shares and crypto may be fractional. The symbol is the fallback for a broker
// payload that omits the field -- an OCC symbol ends in six digits of date, a
// C or P, and eight of strike.
//
// KNOWING NEITHER MEANS NO. A fraction is only permitted where it is positively
// established to be legal; with no class and no symbol this returns false and
// the quantity must be whole. Refusing is the direction that cannot do harm --
// it costs a resize the trader can still achieve by cancelling and re-sending,
// whereas guessing "fractional" on an option order sends the broker something
// it will reject and, worse, teaches this module to default to the permissive
// answer whenever a payload is thin.
function tradesFractions(order: ReplaceInput["order"]): boolean {
  const cls = String(order?.asset_class || "").toLowerCase();
  if (cls) return cls === "us_equity" || cls === "crypto";
  const sym = String(order?.symbol || "");
  if (!sym) return false;
  return !/^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(sym);
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
    if (!Number.isFinite(n) || n <= 0) return null;
    // A FRACTION IS VALID ON SHARES, and refusing it here was a real defect:
    // this check was written when only CONTRACTS could be resized, so the
    // moment the quantity field reached share orders every fractional size
    // came back "a whole-number quantity is required" -- including the exact
    // holding the trader was trying to close, which is fractional far more
    // often than not once a position has been added to over time.
    //
    // A CONTRACT still cannot be split, and that refusal stays.
    if (tradesFractions(order)) {
      // Nine places, rounded rather than truncated: the caller has already
      // bounded this by the holding, so there is nothing to overshoot.
      body.qty = String(Number(n.toFixed(QTY_DECIMALS)));
    } else {
      if (!Number.isInteger(n)) return null;
      body.qty = String(n);
    }
  }

  return Object.keys(body).length ? body : null;
}
