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
// portfolio, a number of shares, or dollars. Since 3 Nov the terminal sends
// every account with a size of its own or the key's own size as one (the
// owner's approved design: "Same as the key", $, shares, % of its
// portfolio), and that size counts on a sale of what is held too, never
// more than the account holds. Pro rata stays for a size not given.
//
// `closing: "group"`: the account on screen is not sent to (not ticked), so
// whether an order closes is read from the accounts that are: a sale where
// any of them holds the symbol sells what each holds, and skips one that
// holds none, rather than opening a short there.

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
// Division in binary floating point lands just under whole numbers (16 /
// 0.000000001 is 15999999999.999998; 1.14 * 100 is 113.99999999999999), so
// the count of steps is settled to the 15 digits a number holds before
// rounding down (six decimals, as cryptoOrder.ts onStep settles, is not
// enough at 16 billion billionths): what was asked for is kept, anything
// genuinely between two steps still rounds down (18 Nov review: 16 shares
// went out as 15.999999999, $1.14 as $1.13).
const settle = (x: number) => Number(x.toPrecision(15));
const steps = (v: number, step: number) => Math.floor(settle(v / step));
const down = (v: number, step: number) => steps(v, step) * step;
const clean = (v: number) => Number(v.toFixed(9));

export function allocate(
  order: { side: "buy" | "sell"; qty?: number | null; notional?: number | null },
  lead: Book,
  others: Book[],
  opts: {
    basis?: "equity" | "buyingPower"; crypto?: boolean; symbol?: string; price?: number | null; pct?: number | null; closing?: "lead" | "group";
    // The stock trades in part shares at Alpaca; `parts`: part shares asked
    // for (the ticket's Part shares), else whole shares, a part share only
    // where a buy comes to less than one.
    fractionable?: boolean; parts?: boolean;
  } = {}
): Share[] {
  const qty = fin(order.qty);
  const notional = fin(order.notional);
  const leadHeld = fin(lead.held) || 0;
  const what = opts.symbol || "it";
  // Whether the order closes a holding: a sale of shares held, a buy back of a short.
  const closes = (held: number) => (order.side === "sell" && held > 0) || (order.side === "buy" && held < 0);
  const reducing = opts.closing === "group" ? others.some((b) => closes(fin(b.held) || 0)) : closes(leadHeld);
  // Whole shares unless part shares are asked for (or, said nowhere, the
  // lead's own order is in part shares); coins always in parts.
  const step = opts.crypto || (opts.parts ?? (qty !== null && !Number.isInteger(qty))) ? 1e-9 : 1;
  const unit = opts.crypto ? "step" : "share";
  // A buy that comes to less than one whole share of a stock Alpaca trades in
  // part shares: the part share, never under Alpaca's $1 smallest (3 Nov, the
  // owner: "It refuses to buy QQQ below 1 share!"). Not for an account short
  // the stock: part shares cannot be held short.
  const partOf = (b: Book, shares: number) => {
    if (!opts.fractionable || opts.crypto || order.side !== "buy" || (fin(b.held) || 0) < 0) return 0;
    const p = fin(opts.price);
    const mine = clean(down(shares, 1e-9));
    return mine > 0 && (!p || mine * p >= 1) ? mine : 0;
  };

  const basis = opts.basis === "buyingPower" ? "buyingPower" : "equity";
  const price = fin(opts.price);
  // A hotkey sized as a percent of the portfolio (or buying power) sizes each
  // account from its own (27 Oct, a $600 account on screen whose 0.5% was
  // less than one share: the others' 0.5% is their own, not a share of that).
  const pct = fin(opts.pct);
  const pctOn = !!(pct && pct > 0 && price && price > 0) && notional === null;
  const word = basis === "equity" ? "portfolio value" : "buying power";
  // A percent of an account's own value in whole shares: to the nearest
  // share, not down (18 Nov, the owner, on 2.5% keys sending 60 and 2 for
  // 60.79 and 2.88: "Are you sure the Prorata is accurate?"), never past its
  // buying power on a buy (then down). Part shares and coins: to the step.
  const toShares = (b: Book, want: number) => {
    if (step !== 1) return clean(down(want, step));
    // Under one share of a stock traded in part shares, a buy (not while
    // short) is left to `partOf`, the exact part share: half a share rounded
    // up to one would be twice the percent (18 Nov review).
    if (opts.fractionable && order.side === "buy" && (fin(b.held) || 0) >= 0 && settle(want) < 1) return 0;
    const up = Math.round(settle(want));
    const bp = fin(b.buyingPower);
    return order.side === "buy" && bp !== null && price !== null && up * price > bp ? steps(want, 1) : up;
  };
  const ofOwn = (b: Book, times = 1) => {
    const size = fin(b[basis]);
    if (!(size && size > 0)) return { skip: `no ${word} to size from` };
    const want = (size * pct! / 100 / price!) * times;
    const mine = toShares(b, want) || partOf(b, want);
    return mine > 0 ? { qty: mine } : { skip: `its ${pct}% comes to less than one ${unit} at ${price}` };
  };
  // An account's own size in shares at the order's price: a percent of its
  // portfolio, dollars, or shares.
  const ownRule = (b: Book, rule: Rule) => {
    const v = fin(rule.value);
    if (!(v && v > 0)) return { skip: "no size set for it" };
    if (rule.mode === "shares") {
      const mine = clean(down(v, step));
      return mine > 0 ? { qty: mine } : { skip: `less than one ${unit}` };
    }
    if (!(price && price > 0)) return { skip: "no price to turn its size into shares" };
    const equity = fin(b.equity);
    if (rule.mode === "percent" && !(equity && equity > 0)) return { skip: "no portfolio value to size from" };
    const dollars = rule.mode === "percent" ? equity! * v / 100 : v;
    // Its own percent to the nearest share; its own dollars stay a ceiling.
    const mine = rule.mode === "percent" ? toShares(b, dollars / price!) : clean(down(dollars / price!, step));
    return mine > 0 ? { qty: mine } : { skip: `$${Math.floor(dollars * 100) / 100} is less than one ${unit} at ${price}` };
  };
  // Never more than an account holds when the order closes its position.
  const capped = (b: Book, row: any) => {
    const held = fin(b.held) || 0;
    if (!closes(held) || row.qty === null || row.skip) return row;
    const most = Math.abs(held);
    return row.qty >= most ? { ...row, qty: most, all: true } : row;
  };

  // A sale of shares an account holds sells at least one of them, never more
  // than it holds (28 Oct: "Sell 1 share" rather than skip it as under one).
  const atLeastOne = (b: Book, row: Share): Share => {
    const held = fin(b.held) || 0;
    if (order.side !== "sell" || opts.crypto || !(held > 0) || row.qty !== null || !/less than one share/.test(row.skip || "")) return row;
    const one = Math.min(1, held);
    return { ...row, qty: one, notional: null, all: one >= held, skip: null };
  };

  const leadSize = fin(lead[basis]);
  const cents = (v: number) => steps(v, 0.01) / 100;

  if (reducing) {
    const leadAbs = Math.abs(leadHeld);
    const part = qty !== null && leadAbs > 0 ? qty / leadAbs : null;
    return others.map((b) => atLeastOne(b, ((): Share => {
      const held = fin(b.held) || 0;
      const same = closes(held) ? Math.abs(held) : 0;
      const base = { id: b.id, name: b.name, notional: null, basis: "holding" as const };
      if (!(same > 0)) return { ...base, qty: null, all: false, skip: `holds no ${what} to ${order.side === "sell" ? "sell" : "buy back"}` };
      const rule = b.rule && RULES.has(b.rule.mode) ? b.rule : null;
      // Its own size (or the key's, sent as its own), never more than it holds.
      if (rule && rule.mode !== "times") {
        const r = ownRule(b, rule);
        if (r.skip) return { ...base, qty: null, all: false, skip: r.skip };
        return { ...base, qty: Math.min(r.qty!, same), all: r.qty! >= same, skip: null };
      }
      if (pctOn) {
        // The key's percent of its own portfolio (times its multiple); never more than it holds.
        const r = ofOwn(b, rule ? fin(rule.value) || 0 : 1);
        if (r.skip) return { ...base, qty: null, all: false, skip: r.skip };
        return { ...base, qty: Math.min(r.qty!, same), all: r.qty! >= same, skip: null };
      }
      if (part === null) return capped(b, share(b));
      if (part >= 1 - 1e-9) return { ...base, qty: same, all: true, skip: null };
      const mine = clean(down(same * part, step));
      if (!(mine > 0)) return { ...base, qty: null, all: false, skip: `its part of ${same} comes to less than one ${unit}` };
      return { ...base, qty: Math.min(mine, same), all: mine >= same, skip: null };
    })()));
  }

  return others.map((b) => capped(b, atLeastOne(b, share(b))));
  function share(b: Book): Share {
    // The account's own size, where it has one.
    const rule = b.rule && RULES.has(b.rule.mode) ? b.rule : null;
    if (rule && rule.mode !== "times") {
      const mode = rule.mode as "percent" | "shares" | "dollars";
      const out = { id: b.id, name: b.name, all: false, basis: mode, qty: null, notional: null };
      const v = fin(rule.value);
      if (!(v && v > 0)) return { ...out, skip: "no size set for it" };
      if (mode === "shares") {
        const mine = clean(down(v, step)) || partOf(b, v);
        return mine > 0 ? { ...out, qty: mine, skip: null } : { ...out, skip: `less than one ${unit}` };
      }
      const equity = fin(b.equity);
      if (mode === "percent" && !(equity && equity > 0)) return { ...out, skip: "no portfolio value to size from" };
      const dollars = mode === "percent" ? equity! * v / 100 : v;
      if (notional !== null) {
        return cents(dollars) >= 1 ? { ...out, notional: cents(dollars), skip: null } : { ...out, skip: "its size comes to less than $1" };
      }
      if (!(price && price > 0)) return { ...out, skip: "no price to turn its size into shares" };
      const mine = (mode === "percent" ? toShares(b, dollars / price) : clean(down(dollars / price, step))) || partOf(b, dollars / price);
      return mine > 0 ? { ...out, qty: mine, skip: null } : { ...out, skip: opts.fractionable && order.side === "buy" && (fin(b.held) || 0) >= 0 ? `$${cents(dollars)} is under Alpaca's $1 smallest part share` : `$${cents(dollars)} is less than one ${unit} at ${price}` };
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
    const mine = clean(down(qty * ratio, step)) || partOf(b, qty * ratio);
    if (!(mine > 0)) return { ...base, qty: null, notional: null, skip: `its part comes to less than one ${unit}` };
    return { ...base, qty: mine, notional: null, skip: null };
  }
}

// ---------------------------------------------------------------------------
// The ticket's order as one total, shared out over every account it goes to
// (18 Nov, the owner: "When I need to sell or buy 50 stocks for example, I
// need them pro rata not 25 per each as the account sizes are different";
// asked what to share by: "The sizing based on equity"). The hotkeys keep
// `allocate` above and each account's own size.
//
//   - Each account's part is the total times its portfolio value (equity)
//     over all of theirs, the account on screen included when it is ticked.
//   - Rounded down to whole shares (part shares when asked for, or typed;
//     coins to a billionth; dollars to the cent), and what rounding leaves
//     goes a step at a time to the largest remainders, so the parts add up to
//     exactly the total.
//   - An order that closes a holding (a sale where any of the accounts holds
//     the symbol, a buy back where any is short) is shared among the accounts
//     that hold it, and never takes more than an account holds: what is over
//     stays unsent and the review says so. An account holding none sits it
//     out rather than open the other way.
//   - A part that comes to nothing (or under Alpaca's $1 for dollars) is
//     skipped, with why.
// ---------------------------------------------------------------------------

export function splitTotal(
  order: { side: "buy" | "sell"; qty?: number | null; notional?: number | null },
  books: Book[],
  opts: { crypto?: boolean; symbol?: string; parts?: boolean } = {}
): Share[] {
  const qty = fin(order.qty);
  const notional = fin(order.notional);
  const dollars = notional !== null;
  const total = dollars ? notional : qty;
  const what = opts.symbol || "it";
  const closes = (held: number) => (order.side === "sell" && held > 0) || (order.side === "buy" && held < 0);
  const closing = books.some((b) => closes(fin(b.held) || 0));
  const step = dollars ? 0.01 : opts.crypto || opts.parts || (qty !== null && !Number.isInteger(qty)) ? 1e-9 : 1;
  const unit = opts.crypto ? "step" : "share";
  const blank = (b: Book): Share => ({ id: b.id, name: b.name, qty: null, notional: null, all: false, basis: "equity", skip: null });
  if (!(total !== null && total > 0)) return books.map((b) => ({ ...blank(b), skip: "no quantity to share out" }));
  // A sale of what is held is shared by the number of shares, never in
  // dollars: a dollar part could not be held to what an account holds
  // (18 Nov review: $379.76 shown, half a share sold).
  if (dollars && closing) return books.map((b) => ({ ...blank(b), skip: "a sale of shares held is sized in shares: switch the ticket to shares" }));

  const out = books.map((b): Share => {
    const held = fin(b.held) || 0;
    if (closing && !closes(held)) return { ...blank(b), skip: `holds no ${what} to ${order.side === "sell" ? "sell" : "buy back"}` };
    const equity = fin(b.equity);
    if (!(equity !== null && equity > 0)) return { ...blank(b), skip: "no portfolio value to size from" };
    return blank(b);
  });
  const taking = books.map((b, i) => ({ b, i })).filter(({ i }) => !out[i].skip);
  const sum = taking.reduce((s, { b }) => s + (fin(b.equity) as number), 0);
  if (!(sum > 0)) return out;

  // In whole steps: each part rounded down, then one step more for the
  // largest remainders until the total is met.
  const count = Math.round(total / step);
  const parts = taking.map(({ b, i }) => {
    const raw = (count * (fin(b.equity) as number)) / sum;
    const whole = Math.floor(settle(raw));
    return { i, equity: fin(b.equity) as number, whole, rest: raw - whole };
  });
  let left = count - parts.reduce((s, p) => s + p.whole, 0);
  for (const p of [...parts].sort((x, y) => y.rest - x.rest || y.equity - x.equity)) {
    if (left <= 0) break;
    p.whole += 1;
    left -= 1;
  }
  // Settling can round one part up past its share: never more than the total.
  for (const p of [...parts].sort((x, y) => x.rest - y.rest || x.equity - y.equity)) {
    if (left >= 0) break;
    if (p.whole > 0) { p.whole -= 1; left += 1; }
  }

  for (const p of parts) {
    const b = books[p.i];
    const amount = clean(p.whole * step);
    if (dollars) {
      out[p.i] = amount >= 1 ? { ...out[p.i], notional: Math.round(amount * 100) / 100 } : { ...out[p.i], skip: amount > 0 ? "its part comes to less than $1" : "its part comes to nothing" };
      continue;
    }
    if (!(amount > 0)) { out[p.i] = { ...out[p.i], skip: `its part comes to less than one ${unit}` }; continue; }
    const held = fin(b.held) || 0;
    if (closes(held) && amount >= Math.abs(held) - 1e-12) out[p.i] = { ...out[p.i], qty: Math.abs(held), all: true };
    else out[p.i] = { ...out[p.i], qty: amount };
  }
  return out;
}

/**
 * Every ticked account's whole holding, on the side the order closes (18 Nov
 * review: Close, Stop and Max on a position close it on each account, as they
 * did before the total was shared out): each holder its exact holding, an
 * account holding none sits it out.
 */
export function wholeHoldings(side: "buy" | "sell", books: Book[], opts: { symbol?: string } = {}): Share[] {
  const what = opts.symbol || "it";
  return books.map((b): Share => {
    const held = fin(b.held) || 0;
    const closes = (side === "sell" && held > 0) || (side === "buy" && held < 0);
    const base = { id: b.id, name: b.name, notional: null, basis: "holding" as const };
    return closes ? { ...base, qty: Math.abs(held), all: true, skip: null }
      : { ...base, qty: null, all: false, skip: `holds no ${what} to ${side === "sell" ? "sell" : "buy back"}` };
  });
}
