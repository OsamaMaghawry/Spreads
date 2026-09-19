// Grouping closed rows into the SETUP they were part of.
//
// WHAT WAS WRONG. The owner, on the 2026-09-19 report:
//
//   *"I don't think the 8k loss is an accurate number. The analysis gives the
//   p/l for separate legs… I never lost 8k, and the CC never lost 2k. Maybe
//   these numbers are part of a multi-leg setup or campaign that ends as a
//   total profit or loss but as part of a complete setup, not by its own. The
//   only strong net loss that is clear is from the spreads 2 trades WMT and
//   ARKK. When I see loss in cc because the buyback I feel not the full
//   picture, misleading."*
//
// He was right, and the page was already carrying the proof. On that report
// "Covered calls" read -$1,674 while "By ticker" read TSLA +$1,437.91 — the
// same trades, two tables apart, because a strategy row cannot hold a position
// that spans two strategies.
//
// The mechanism, from his own account. On 7 September two cash-secured puts
// were assigned and delivered 200 TSLA shares. On the 8th he wrote calls
// against those shares. TSLA rallied, so on the 9th the calls cost more to buy
// back than he took in — booked as -$2,221 — and the shares underneath them
// were sold into that same rally for +$1,258.91. The share result went onto the
// PUT that delivered them, because that is the row assignment attaches shares
// to; the call that was written on those same shares carries stock_pl = 0 by
// construction. So "Covered calls" is structurally incapable of showing what a
// covered call did on this account: it is the losing half of a hedge, filed on
// its own, and the winning half is in another row.
//
// This file puts the halves back together. It does NOT change any stored
// figure and invents nothing — it only says which rows were one position.
//
// THE LINKING RULE, and what it deliberately refuses to link:
//
//   1. A lot and the option that DELIVERED it — `chain_id` matches
//      `acquired_chain_id`. Written by the reconstruction, exact, no guessing.
//   2. A lot and the option that TOOK IT AWAY — `disposed_chain_id`. A covered
//      call assigned away is the end of the setup, not a separate trade.
//   3. A lot and any COVERED CALL on that ticker whose life overlaps the
//      holding. A call bought back leaves no chain to follow, which is exactly
//      the case the owner is complaining about, so the overlap is what carries
//      it. A short call is only a covered call when shares back it — that is
//      what the strategy field already means — so the overlap is evidence, not
//      a coincidence.
//   4. Two lots on one ticker held at the same time, because one call can be
//      written across both.
//
// NOT LINKED, on purpose, because the data cannot tell us and a wrong link
// would move real money onto the wrong position:
//
//   - A cash-secured put opened while shares are held. It is secured by cash,
//     not by those shares; it is the next turn of the wheel, not this one.
//   - A long put held alongside shares. It may be protective and it may be a
//     directional bet, and nothing stored says which. Left standing alone and
//     said out loud, rather than folded in to flatter a setup.
//
// A row that links to nothing is its own setup of one. That is the honest
// answer for the WMT and ARKK spreads, and it is why this grouping does not
// soften them: they remain exactly the losses the owner says they are.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const optionPL = (t) => num(t.premium_pl) + num(t.early_close_pl);

// ISO dates compare correctly as strings, and an open lot has no end.
const OPEN_END = "9999-12-31";

/** Minimal union-find over string ids. */
function unionFind() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) { const next = parent.get(x); parent.set(x, r); x = next; }
    return r;
  };
  return { find, union: (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); } };
}

const lotId = (l, i) => `lot:${l.id || l.lot_key || i}`;
const tradeId = (t, i) => `trade:${t.id || t.trade_key || i}`;
const holdStart = (l) => l.acquired_date || "";
const holdEnd = (l) => l.disposed_date || OPEN_END;

/**
 * Group closed trades and share lots into setups.
 *
 * @param trades     closed trade_records, already filtered to the window
 * @param stockLots  stock_lots rows for the account, any mix of open and sold
 * @returns setups, newest first
 *
 * Each setup carries:
 *   booked      the money this setup has actually booked, every row counted
 *   optionPL    the option legs alone, signed
 *   sharePL     what the shares contributed, from the rows that own them
 *   open        true while shares from this setup are still held
 *   sharesOpen  how many, and `sharesCost` what they cost
 *   legs, lots  the rows themselves, so the detail is one click away
 *   split       the strategies this setup spans — the reason it needed grouping
 */
export function setups(trades, stockLots) {
  const rows = (trades || []).filter((t) => t && t.close_date);
  const lots = (stockLots || []).filter((l) => l && l.acquired_date);
  if (rows.length === 0) return [];

  const uf = unionFind();
  rows.forEach((t, i) => uf.find(tradeId(t, i)));

  // 1 & 2 — the chain the reconstruction already wrote.
  const byChain = new Map();
  rows.forEach((t, i) => {
    if (t.chain_id) {
      if (!byChain.has(t.chain_id)) byChain.set(t.chain_id, []);
      byChain.get(t.chain_id).push(tradeId(t, i));
    }
  });
  lots.forEach((l, i) => {
    const id = lotId(l, i);
    uf.find(id);
    for (const chain of [l.acquired_chain_id, l.disposed_chain_id, l.chain_id]) {
      if (!chain) continue;
      for (const t of byChain.get(chain) || []) uf.union(id, t);
    }
  });

  // 3 — a covered call written on shares that were held while it was alive.
  //
  // The window is the CALL's life against the LOT's holding, inclusive at both
  // ends: a call written the day shares arrive and a call assigned away on the
  // day the shares leave are both part of the same setup, and a half-open
  // interval would drop exactly those two.
  lots.forEach((l, i) => {
    const id = lotId(l, i);
    const from = holdStart(l);
    const to = holdEnd(l);
    rows.forEach((t, j) => {
      if (t.strategy !== "covered_call") return;
      if ((t.ticker || "") !== (l.ticker || "")) return;
      const opened = t.open_date || t.close_date;
      if (opened <= to && t.close_date >= from) uf.union(id, tradeId(t, j));
    });
  });

  // 4 — lots on one ticker held at the same time.
  lots.forEach((a, i) => {
    lots.forEach((b, j) => {
      if (j <= i || (a.ticker || "") !== (b.ticker || "")) return;
      if (holdStart(a) <= holdEnd(b) && holdStart(b) <= holdEnd(a)) uf.union(lotId(a, i), lotId(b, j));
    });
  });

  // Collect.
  const groups = new Map();
  const bucket = (id) => {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, { legs: [], lots: [] });
    return groups.get(root);
  };
  rows.forEach((t, i) => bucket(tradeId(t, i)).legs.push(t));
  lots.forEach((l, i) => bucket(lotId(l, i)).lots.push(l));

  const out = [];
  for (const [key, g] of groups) {
    // A group of lots with no legs in this window is not a setup this page can
    // report — its option rows closed outside the date range, and inventing a
    // setup out of shares alone would put a figure on screen with nothing to
    // attribute it to.
    if (g.legs.length === 0) continue;

    const openLots = g.lots.filter((l) => !l.disposed_date && num(l.qty) > 0);
    const dates = g.legs.map((t) => t.close_date).concat(g.lots.map(holdStart)).filter(Boolean).sort();
    const opens = g.legs.map((t) => t.open_date).concat(g.lots.map(holdStart)).filter(Boolean).sort();
    const strategies = [...new Set(g.legs.map((t) => t.strategy || "unknown"))];

    out.push({
      key,
      ticker: g.legs[0].ticker || g.lots[0]?.ticker || "—",
      from: opens[0] || dates[0] || null,
      to: dates[dates.length - 1] || null,
      legs: g.legs.slice().sort((a, b) => (a.close_date || "").localeCompare(b.close_date || "")),
      lots: g.lots,
      booked: g.legs.reduce((a, t) => a + num(t.realized_pl), 0),
      optionPL: g.legs.reduce((a, t) => a + optionPL(t), 0),
      sharePL: g.legs.reduce((a, t) => a + num(t.stock_pl), 0),
      // STILL RUNNING. Shares from this setup are held, so its result is money
      // booked so far and not the result of the setup. Everything downstream
      // reads this flag rather than deciding for itself.
      open: openLots.length > 0,
      sharesOpen: openLots.reduce((a, l) => a + num(l.qty), 0),
      sharesCost: openLots.reduce((a, l) => a + num(l.qty) * num(l.acquired_price), 0),
      // The strategies this one position was filed under. More than one is the
      // whole reason this grouping exists, and the screen says so.
      split: strategies.length > 1 ? strategies : [],
      strategies,
      // Any row whose own result we could not attribute taints the setup's
      // total the same way it taints a strategy row.
      withheld: g.legs.filter((t) => t.integrity_code).length
    });
  }

  return out.sort((a, b) => (b.to || "").localeCompare(a.to || "") || (b.from || "").localeCompare(a.from || ""));
}

/**
 * The setups whose figures a strategy row cannot state on its own — the ones
 * that span more than one strategy, or that are still holding shares.
 *
 * This is what the Strategy comparison table needs to caveat itself honestly,
 * and what the "By setup" panel leads with.
 */
export function splitSetups(list) {
  return (list || []).filter((s) => s.split.length > 0 || s.open);
}

/**
 * Setups rolled up by ticker, for a table that has to show 135 positions.
 *
 * THIS EXISTS AS A TESTED FUNCTION BECAUSE THE FIRST VERSION OF THE PANEL LOST
 * ROWS. It filtered to multi-leg setups inside the component, which on the
 * owner's account showed six positions out of 135 under a heading that claimed
 * to be every setup — *"totally inaccurate setups and results!! NVDA just two
 * setups!!!!"* The grouping had been right the whole time; the rendering threw
 * the rest away. A filter living in JSX had no test that could catch that, so
 * the roll-up lives here, where `every setup appears exactly once` is an
 * assertion rather than a hope.
 */
export function byTicker(list) {
  const by = new Map();
  for (const s of list || []) {
    if (!by.has(s.ticker)) by.set(s.ticker, { ticker: s.ticker, setups: [], legs: 0, booked: 0, open: 0, split: 0 });
    const b = by.get(s.ticker);
    b.setups.push(s);
    b.legs += s.legs.length;
    b.booked += s.booked;
    if (s.open) b.open += 1;
    if (s.split.length > 0) b.split += 1;
  }
  return [...by.values()]
    .map((b) => ({ ...b, setups: b.setups.slice().sort((a, c) => (c.to || "").localeCompare(a.to || "")) }))
    .sort((a, b) => b.setups.length - a.setups.length || Math.abs(b.booked) - Math.abs(a.booked));
}

/** Money this grouping says is attributed to a setup rather than to one leg. */
export function setupTotals(list) {
  const all = list || [];
  const multi = all.filter((s) => s.legs.length > 1);
  return {
    setups: all.length,
    multiLeg: multi.length,
    stillOpen: all.filter((s) => s.open).length,
    // Every setup that is finished and lost money. This is the honest answer to
    // "what did I actually lose", and it is the figure the owner was looking
    // for when he said the only clear losses were WMT and ARKK.
    settledLosses: all.filter((s) => !s.open && s.booked < 0).reduce((a, s) => a + s.booked, 0),
    settledLossCount: all.filter((s) => !s.open && s.booked < 0).length,
    booked: all.reduce((a, s) => a + s.booked, 0)
  };
}
