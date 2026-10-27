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
//
// Each account can carry its own size instead (27 Oct: "I need to set the
// quantities by account ... if account is small and I set 1%, it doesn't
// work with it"): a multiple of its pro-rata share, a percent of its own
// portfolio, a number of shares, or dollars. These size what is bought or
// opened; a sale of what is held stays in proportion to each holding.

export type Rule = { mode: "prorata" | "times" | "percent" | "shares" | "dollars"; value?: number | null };

export type Book = {
  id: string;
  name: string;
  equity: number | null;
  buyingPower: number | null;
  held: number; // the symbol held, signed: negative for a short
  rule?: Rule | null; // its own size, if not pro rata
};

export type Share = {
  id: string;
  name: string;
  qty: number | null;
  notional: number | null;
  all: boolean; // the whole holding: sent as exactly what is held
  basis: "equity" | "buyingPower" | "holding" | "times" | "percent" | "shares" | "dollars";
  skip: string | null;
};

const RULES = new Set(["times", "percent", "shares", "dollars"]);

const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const down = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
const clean = (v: number) => Number(v.toFixed(9));

export function allocate(
  order: { side: "buy" | "sell"; qty?: number | null; notional?: number | null },
  lead: Book,
  others: Book[],
  opts: { basis?: "equity" | "buyingPower"; crypto?: boolean; symbol?: string; price?: number | null; pct?: number | null } = {}
): Share[] {
  const qty = fin(order.qty);
  const notional = fin(order.notional);
  const leadHeld = fin(lead.held) || 0;
  const what = opts.symbol || "it";
  const reducing = (order.side === "sell" && leadHeld > 0) || (order.side === "buy" && leadHeld < 0);
  // Whole shares unless the lead's own order is in part shares; coins always in parts.
  const step = opts.crypto || (qty !== null && !Number.isInteger(qty)) ? 1e-9 : 1;
  const unit = opts.crypto ? "step" : "share";

  const basis = opts.basis === "buyingPower" ? "buyingPower" : "equity";
  const price = fin(opts.price);
  // A hotkey sized as a percent of the portfolio (or buying power) sizes each
  // account from its own (27 Oct, a $600 account on screen whose 0.5% was
  // less than one share: the others' 0.5% is their own, not a share of that).
  const pct = fin(opts.pct);
  const pctOn = !!(pct && pct > 0 && price && price > 0) && notional === null;
  const word = basis === "equity" ? "portfolio value" : "buying power";
  const ofOwn = (b: Book, times = 1) => {
    const size = fin(b[basis]);
    if (!(size && size > 0)) return { skip: `no ${word} to size from` };
    const mine = clean(down((size * pct! / 100 / price!) * times, step));
    return mine > 0 ? { qty: mine } : { skip: `its ${pct}% comes to less than one ${unit} at ${price}` };
  };
  // Never more than an account holds when the order closes its position.
  const capped = (b: Book, row: any) => {
    const held = fin(b.held) || 0;
    const closes = (order.side === "sell" && held > 0) || (order.side === "buy" && held < 0);
    if (!closes || row.qty === null || row.skip) return row;
    const most = Math.abs(held);
    return row.qty >= most ? { ...row, qty: most, all: true } : row;
  };

  if (reducing && (qty !== null || pctOn)) {
    const leadAbs = Math.abs(leadHeld);
    const part = qty !== null ? qty / leadAbs : 0;
    return others.map((b) => {
      const held = fin(b.held) || 0;
      const same = Math.sign(held) === Math.sign(leadHeld) ? Math.abs(held) : 0;
      const base = { id: b.id, name: b.name, notional: null, basis: "holding" as const };
      if (!(same > 0)) return { ...base, qty: null, all: false, skip: `holds no ${what} to ${order.side === "sell" ? "sell" : "buy back"}` };
      if (pctOn) {
        const r = ofOwn(b);
        if (r.skip) return { ...base, qty: null, all: false, skip: r.skip };
        return { ...base, qty: Math.min(r.qty!, same), all: r.qty! >= same, skip: null };
      }
      if (part >= 1 - 1e-9) return { ...base, qty: same, all: true, skip: null };
      const mine = clean(down(same * part, step));
      if (!(mine > 0)) return { ...base, qty: null, all: false, skip: `its part of ${same} comes to less than one ${unit}` };
      return { ...base, qty: Math.min(mine, same), all: mine >= same, skip: null };
    });
  }

  const leadSize = fin(lead[basis]);
  const cents = (v: number) => Math.floor(v * 100) / 100;
  return others.map((b) => capped(b, share(b)));
  function share(b: Book): Share {
    // The account's own size, where it has one.
    const rule = b.rule && RULES.has(b.rule.mode) ? b.rule : null;
    if (rule && rule.mode !== "times") {
      const mode = rule.mode as "percent" | "shares" | "dollars";
      const out = { id: b.id, name: b.name, all: false, basis: mode, qty: null, notional: null };
      const v = fin(rule.value);
      if (!(v && v > 0)) return { ...out, skip: "no size set for it" };
      if (mode === "shares") {
        const mine = clean(down(v, step));
        return mine > 0 ? { ...out, qty: mine, skip: null } : { ...out, skip: `less than one ${unit}` };
      }
      const equity = fin(b.equity);
      if (mode === "percent" && !(equity && equity > 0)) return { ...out, skip: "no portfolio value to size from" };
      const dollars = mode === "percent" ? equity! * v / 100 : v;
      if (notional !== null) {
        return cents(dollars) >= 1 ? { ...out, notional: cents(dollars), skip: null } : { ...out, skip: "its size comes to less than $1" };
      }
      if (!(price && price > 0)) return { ...out, skip: "no price to turn its size into shares" };
      const mine = clean(down(dollars / price, step));
      return mine > 0 ? { ...out, qty: mine, skip: null } : { ...out, skip: `$${cents(dollars)} is less than one ${unit} at ${price}` };
    }
    const times = rule ? fin(rule.value) : 1;
    const base = { id: b.id, name: b.name, all: false, basis: rule ? "times" as const : basis };
    if (!(times && times > 0)) return { ...base, qty: null, notional: null, skip: "no multiple set for it" };
    if (pctOn) {
      const r = ofOwn(b, times);
      return r.skip ? { ...base, qty: null, notional: null, skip: r.skip } : { ...base, qty: r.qty!, notional: null, skip: null };
    }
    const size = fin(b[basis]);
    if (!(leadSize && leadSize > 0)) return { ...base, qty: null, notional: null, skip: `no ${word} on the account on screen to size from` };
    if (!(size && size > 0)) return { ...base, qty: null, notional: null, skip: `no ${word} to size from` };
    const ratio = (size / leadSize) * times;
    if (notional !== null) {
      const dollars = Math.floor(notional * ratio * 100) / 100;
      if (!(dollars >= 1)) return { ...base, qty: null, notional: null, skip: "its part comes to less than $1" };
      return { ...base, qty: null, notional: dollars, skip: null };
    }
    if (qty === null) return { ...base, qty: null, notional: null, skip: "no quantity to share out" };
    const mine = clean(down(qty * ratio, step));
    if (!(mine > 0)) return { ...base, qty: null, notional: null, skip: `its part comes to less than one ${unit}` };
    return { ...base, qty: mine, notional: null, skip: null };
  }
}
