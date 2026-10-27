// One order, several accounts: how much each account gets (27 Oct: "I want to
// select more than one and the orders go for all of them proportionately ...
// if I have the hot key on buying 1% of the portfolio").
//
// The order is set up on the account on screen (the lead). Every other
// account in the group gets its share:
//
//   - Opening or adding: in proportion to the account's size, its equity
//     against the lead's (or its buying power, for an order sized from buying
//     power). A hotkey buying 1% of the lead's portfolio buys 1% of each.
//   - Reducing or closing a position the lead holds: in proportion to what
//     each account holds of it, never more than it holds. A sale of half the
//     lead's shares sells half of each account's; a sale of all of them, all
//     of each; an account that holds none sells none.
//
// Shares are rounded down to whole shares (part shares only when the lead's
// own order is in part shares), coins down to a billionth (the order then
// rounds to the coin's step), dollars to the cent. An account whose share
// comes to nothing is skipped, and says why.

export type Book = {
  id: string;
  name: string;
  equity: number | null;
  buyingPower: number | null;
  held: number; // the symbol held, signed: negative for a short
};

export type Share = {
  id: string;
  name: string;
  qty: number | null;
  notional: number | null;
  all: boolean; // the whole holding: sent as exactly what is held
  basis: "equity" | "buyingPower" | "holding";
  skip: string | null;
};

const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const down = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
const clean = (v: number) => Number(v.toFixed(9));

export function allocate(
  order: { side: "buy" | "sell"; qty?: number | null; notional?: number | null },
  lead: Book,
  others: Book[],
  opts: { basis?: "equity" | "buyingPower"; crypto?: boolean; symbol?: string } = {}
): Share[] {
  const qty = fin(order.qty);
  const notional = fin(order.notional);
  const leadHeld = fin(lead.held) || 0;
  const what = opts.symbol || "it";
  const reducing = (order.side === "sell" && leadHeld > 0) || (order.side === "buy" && leadHeld < 0);
  // Whole shares unless the lead's own order is in part shares; coins always in parts.
  const step = opts.crypto || (qty !== null && !Number.isInteger(qty)) ? 1e-9 : 1;
  const unit = opts.crypto ? "step" : "share";

  if (reducing && qty !== null) {
    const leadAbs = Math.abs(leadHeld);
    const part = qty / leadAbs;
    return others.map((b) => {
      const held = fin(b.held) || 0;
      const same = Math.sign(held) === Math.sign(leadHeld) ? Math.abs(held) : 0;
      const base = { id: b.id, name: b.name, notional: null, basis: "holding" as const };
      if (!(same > 0)) return { ...base, qty: null, all: false, skip: `holds no ${what} to ${order.side === "sell" ? "sell" : "buy back"}` };
      if (part >= 1 - 1e-9) return { ...base, qty: same, all: true, skip: null };
      const mine = clean(down(same * part, step));
      if (!(mine > 0)) return { ...base, qty: null, all: false, skip: `its part of ${same} comes to less than one ${unit}` };
      return { ...base, qty: Math.min(mine, same), all: mine >= same, skip: null };
    });
  }

  const basis = opts.basis === "buyingPower" ? "buyingPower" : "equity";
  const leadSize = fin(lead[basis]);
  return others.map((b) => {
    const base = { id: b.id, name: b.name, all: false, basis };
    const size = fin(b[basis]);
    const word = basis === "equity" ? "portfolio value" : "buying power";
    if (!(leadSize && leadSize > 0)) return { ...base, qty: null, notional: null, skip: `no ${word} on the account on screen to size from` };
    if (!(size && size > 0)) return { ...base, qty: null, notional: null, skip: `no ${word} to size from` };
    const ratio = size / leadSize;
    if (notional !== null) {
      const dollars = Math.floor(notional * ratio * 100) / 100;
      if (!(dollars >= 1)) return { ...base, qty: null, notional: null, skip: "its part comes to less than $1" };
      return { ...base, qty: null, notional: dollars, skip: null };
    }
    if (qty === null) return { ...base, qty: null, notional: null, skip: "no quantity to share out" };
    const mine = clean(down(qty * ratio, step));
    if (!(mine > 0)) return { ...base, qty: null, notional: null, skip: `its part comes to less than one ${unit}` };
    return { ...base, qty: mine, notional: null, skip: null };
  });
}
