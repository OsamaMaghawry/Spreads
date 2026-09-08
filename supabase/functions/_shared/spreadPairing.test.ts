import test from "node:test";
import assert from "node:assert/strict";
import { pairSpreads } from "./spreadPairing.ts";
import { KINDS } from "./positionKinds.ts";

// An Options Wheel account onboarded with a complete history and a completely
// empty positions screen: pairSpreads returned only what it could pair, and a
// wheel has nothing to pair. The regression guard matters as much as the fix —
// the provenance pairing in this file exists because legs bolted to the wrong
// protective long once produced spreads nobody had traded.

const opt = (sym: string, qty: number, entry = 1, price = 1) =>
  ({ symbol: sym, asset_class: "us_option", qty: String(qty), avg_entry_price: String(entry), current_price: String(price) });
const stock = (sym: string, qty: number, entry = 95, mv = 9600) =>
  ({ symbol: sym, asset_class: "us_equity", qty: String(qty), avg_entry_price: String(entry), current_price: "96", market_value: String(mv) });

// AMD 2026-09-18: 465P / 460P / 470C / 475C
const P465 = "AMD260918P00465000";
const P460 = "AMD260918P00460000";
const C470 = "AMD260918C00470000";
const C475 = "AMD260918C00475000";

test("a real put vertical still pairs exactly as before", () => {
  const out = pairSpreads([opt(P465, -1, 3), opt(P460, 1, 1.5)], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "put_spread");
  assert.equal(out[0].shortSymbol, P465);
  assert.equal(out[0].longSymbol, P460);
  assert.equal(out[0].qty, 1);
});

test("an iron condor from one order still pairs as one condor", () => {
  const order = {
    filled_at: "2026-09-01T14:00:00Z",
    legs: [
      { symbol: P465, side: "sell", filled_qty: "1" },
      { symbol: P460, side: "buy", filled_qty: "1" },
      { symbol: C470, side: "sell", filled_qty: "1" },
      { symbol: C475, side: "buy", filled_qty: "1" }
    ]
  };
  const out = pairSpreads(
    [opt(P465, -1), opt(P460, 1), opt(C470, -1), opt(C475, 1)], [], [order]
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "iron_condor");
});

// --- What used to vanish ---------------------------------------------------

test("a lone short put appears instead of vanishing", () => {
  const out = pairSpreads([opt(P465, -2, 3)], [], [], { cash: 200000 });
  assert.equal(out.length, 1, "today this returns an empty array");
  assert.equal(out[0].type, KINDS.CASH_SECURED_PUT);
  assert.equal(out[0].qty, 2);
  assert.equal(out[0].shortSymbol, P465);
  assert.equal(out[0].maxRisk, (465 - 3) * 100 * 2);
  assert.equal(out[0].collateral, 465 * 100 * 2);
});

test("a lone short put is cash-secured even when cash reads below the strike", () => {
  // Margin account: cash sits below the strike while buying power covers it.
  // Alpaca has no uncovered tier, so if the order went through it was secured.
  const out = pairSpreads([opt(P465, -1, 3)], [], [], { cash: 100 });
  assert.equal(out[0].type, KINDS.CASH_SECURED_PUT);
  assert.equal(out[0].collateral, 46500, "and the collateral is therefore known");
});

test("shares survive buildLegs and are reported", () => {
  const out = pairSpreads([stock("AMD", 100)], []);
  assert.equal(out.length, 1, "line 23 used to drop every share position");
  assert.equal(out[0].type, KINDS.SHARES);
  assert.equal(out[0].shareQty, 100);
});

test("a short call against shares is covered, and the shares still show in full", () => {
  // The covering shares used to be removed from the output entirely — at
  // exact cover a trader holding 100 shares saw no stock row at all. They are
  // reported now, whole, with the encumbrance named, and the call carries no
  // risk of its own so nothing is counted twice.
  const out = pairSpreads([opt(C470, -1, 2), stock("AMD", 100, 95, 9600)], []);
  assert.equal(out.length, 2);
  const cc = out.find((o) => o.type === KINDS.COVERED_CALL);
  const sh = out.find((o) => o.type === KINDS.SHARES);
  assert.equal(cc.shareBasis, 95);
  assert.equal(cc.maxRisk, 0, "the call adds no loss; the shares carry it");
  assert.equal(sh.shareQty, 100, "the holding is the holding");
  assert.equal(sh.encumberedQty, 100);
  assert.equal(sh.freeQty, 0);
  // The broker's number, and only the broker's. Writing a call against your
  // own shares does not stop you selling them -- it makes the call naked if
  // you do, which is the owner's decision and our job to warn about, not to
  // veto. Clamping this to the unencumbered remainder offered a maximum of
  // zero on a hundred shares he owns outright.
  assert.equal(sh.qtyAvailable, 100, "the broker will sell all of them");
  assert.equal(sh.maxRisk, 95 * 100 - 2 * 100, "cost, less the premium written against it");
});

test("a short call with no shares is NAKED and carries no risk number", () => {
  const out = pairSpreads([opt(C470, -1, 2)], []);
  assert.equal(out[0].type, KINDS.NAKED_CALL);
  assert.equal(out[0].maxRisk, null, "unbounded loss must never render as a figure");
});

test("surplus shares beyond the covered calls still show as stock", () => {
  const out = pairSpreads([opt(C470, -1, 2), stock("AMD", 300, 95, 28800)], []);
  const kinds = out.map((o) => o.type).sort();
  assert.deepEqual(kinds, [KINDS.COVERED_CALL, KINDS.SHARES].sort());
  const shares = out.find((o) => o.type === KINDS.SHARES);
  assert.equal(shares.shareQty, 300, "the trader owns 300, whatever is written against them");
  assert.equal(shares.encumberedQty, 100, "100 of the 300 back the call");
  assert.equal(shares.freeQty, 200);
});

test("a whole wheel book renders, where today it renders nothing", () => {
  const out = pairSpreads(
    [opt(P465, -1, 3), opt(C470, -1, 2), stock("AMD", 100, 95, 9600)],
    [], [], { cash: 100000 }
  );
  assert.equal(out.length, 3, "the covering shares are a position too");
  assert.deepEqual(
    out.map((o) => o.type).sort(),
    [KINDS.CASH_SECURED_PUT, KINDS.COVERED_CALL, KINDS.SHARES].sort()
  );
});

test("a leftover leg from a half-closed spread is not lost either", () => {
  // The short was assigned away; the long remains. On any account, not just a
  // wheel — this is the same hole.
  const out = pairSpreads([opt(P460, 1, 1.5)], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, KINDS.LONG_OPTION);
  assert.equal(out[0].maxRisk, 150);
});

test("a spread plus an unrelated naked leg yields both", () => {
  const out = pairSpreads([opt(P465, -1, 3), opt(P460, 1, 1.5), opt(C470, -1, 2)], []);
  assert.equal(out.length, 2);
  assert.ok(out.some((o) => o.type === "put_spread"));
  assert.ok(out.some((o) => o.type === KINDS.NAKED_CALL));
});

test("a fully closed leg produces no row", () => {
  assert.deepEqual(pairSpreads([opt(P465, 0)], []), []);
  assert.deepEqual(pairSpreads([], []), []);
});

// --- Adjusted basis flows through to the position ---------------------------

test("a covered call on assigned shares carries the adjusted basis, and its risk drops by the premiums", () => {
  const basis = { AMD: { basis: 460, brokerBasis: 465, collected: 500, shares: 100, source: "adjusted" } };
  const out = pairSpreads([opt(C470, -1, 2), stock("AMD", 100, 465, 46000)], [], [], { basisByTicker: basis });
  const cc = out.find((o) => o.type === KINDS.COVERED_CALL);
  const sh = out.find((o) => o.type === KINDS.SHARES);
  assert.equal(cc.shareBasis, 460);
  assert.equal(cc.basisSource, "adjusted");
  assert.equal(cc.premiumCollected, 500);
  assert.equal(cc.breakEven, 458, "OIC: shares' cost less the call premium");
  // The risk moved to the shares, and the adjusted basis still drives it.
  assert.equal(sh.shareBasis, 460);
  assert.equal(sh.maxRisk, 460 * 100 - 2 * 100, "not 465*100 - 200");
});

test("shares with no linkable premiums say broker basis, and use it", () => {
  const [sh] = pairSpreads([stock("AMD", 100, 465, 46000)], [], [], { basisByTicker: { AMD: { basis: 465, brokerBasis: 465, collected: 0, shares: 100, source: "broker" } } });
  assert.equal(sh.basisSource, "broker");
  assert.equal(sh.shareBasis, 465);
  assert.equal(sh.maxRisk, 46500, "cost from inception, not market value");
});

test("with no basis map at all every lot is broker basis", () => {
  const [sh] = pairSpreads([stock("AMD", 100, 95, 9600)], []);
  assert.equal(sh.basisSource, "broker");
  assert.equal(sh.premiumCollected, 0);
});

// A ratio spread sent as one order: long 1x 352.50 call against short 2x
// 362.50 calls, both expiring the same day. pairSide will not pair them --
// for a call the long has to sit ABOVE the short -- and the order-claim used
// to deduct both legs from the pool before finding that out, so both
// disappeared off the dashboard entirely. Reported on a live account holding
// exactly this, where the missing short calls also freed 200 shares that were
// then miscounted against a different call.
test("legs an order claims but cannot pair are still described", () => {
  const positions = [
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17.85" },
    { symbol: "TSLA260918C00362500", qty: "-2", avg_entry_price: "8.69", current_price: "12.10" }
  ];
  const orders = [
    {
      status: "filled",
      filled_at: "2026-09-08T13:30:00Z",
      legs: [
        { symbol: "TSLA260918C00352500", side: "buy", filled_qty: "1" },
        { symbol: "TSLA260918C00362500", side: "sell", filled_qty: "2" }
      ]
    }
  ];

  const out = pairSpreads(positions, [], orders, { cash: 0 });
  const symbols = JSON.stringify(out);
  assert.ok(symbols.includes("TSLA260918C00352500"), "the long call must not vanish");
  assert.ok(symbols.includes("TSLA260918C00362500"), "the short calls must not vanish");
  // Nothing pairs, so both are described on their own.
  assert.equal(out.length, 2);
});

// The same order, the right way round: long 365 above short 360 is a real
// call spread and must still pair into one position rather than two singles.
test("a genuine vertical from one order still pairs", () => {
  const positions = [
    { symbol: "TSLA260918C00365000", qty: "1", avg_entry_price: "2.00", current_price: "2.50" },
    { symbol: "TSLA260918C00360000", qty: "-1", avg_entry_price: "4.00", current_price: "4.50" }
  ];
  const orders = [
    {
      status: "filled",
      filled_at: "2026-09-08T13:30:00Z",
      legs: [
        { symbol: "TSLA260918C00365000", side: "buy", filled_qty: "1" },
        { symbol: "TSLA260918C00360000", side: "sell", filled_qty: "1" }
      ]
    }
  ];
  const out = pairSpreads(positions, [], orders, { cash: 0 });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "call_spread");
  assert.equal(out[0].qty, 1);
});

// The share row must never offer more than it says it holds.
//
// qtyAvailable was carried from the parent lot, so a row reporting the
// uncommitted remainder handed the close ticket the broker's whole holding —
// 210 offered on a row reading 10. The close ticket defaults to qtyAvailable,
// so that was one confirm from selling the entire position and turning two
// covered calls naked.
test("a partly written share lot offers what the broker offers, and says what is backing calls", () => {
  const positions = [
    { symbol: "TSLA", qty: "210", qty_available: "210", avg_entry_price: "364.31", current_price: "364.80", market_value: "76608" },
    { symbol: "TSLA260918C00362500", qty: "-2", avg_entry_price: "8.69", current_price: "12.10" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const shares = out.find((p) => p.type === "shares" && p.ticker === "TSLA");
  assert.ok(shares, "the free shares must still be reported");
  assert.equal(shares.qty, 210, "the row reports the whole holding");
  assert.equal(shares.encumberedQty, 200);
  assert.equal(shares.freeQty, 10);
  assert.equal(
    shares.qtyAvailable, 210,
    "210 shares he owns, 210 the broker will sell — the two covered calls are a warning, not a lock"
  );
});

// A long call covers a short call, and the strike does not decide it.
//
// classifyLeg counted only shares, so a short 375 call sitting behind a long
// 352.50 call read NAKED with unbounded risk — on a live book, while
// watchRules.nakedShortCalls read the same account and correctly raised
// nothing. Two engines, one repo, opposite answers.
test("a long call covers a short call whatever its strike", () => {
  const positions = [
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17.85" },
    { symbol: "TSLA260911C00375000", qty: "-1", avg_entry_price: "2.26", current_price: "2.99" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const short = out.find((o) => o.shortSymbol === "TSLA260911C00375000");
  assert.equal(short.type, KINDS.COVERED_CALL, "a bounded loss is not a naked call");
  assert.notEqual(short.maxRisk, null);
});

// ...but only if it outlives it. A long that expires first leaves the short
// bare for the rest of its life, and no broker margins that as a spread.
test("a long call expiring before the short does not cover it", () => {
  const positions = [
    { symbol: "TSLA260911C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17.85" },
    { symbol: "TSLA260918C00375000", qty: "-1", avg_entry_price: "2.26", current_price: "2.99" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const short = out.find((o) => o.shortSymbol === "TSLA260918C00375000");
  assert.equal(short.type, KINDS.NAKED_CALL);
  assert.equal(short.maxRisk, null, "unbounded loss must never render as a figure");
});

// One long covers one short. Two shorts behind one long is the ratio-naked
// family and the second one is genuinely uncovered.
test("one long call covers one of two short calls, and the other is named naked", () => {
  // The whole leg used to take the name of its worst part: two shorts against
  // one long reported as one naked call for both contracts, so the covered
  // one vanished and the account's risk went unbounded on account of a
  // contract that was not. It is one of each, and it is shown as one of each.
  const positions = [
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17.85" },
    { symbol: "TSLA260918C00362500", qty: "-2", avg_entry_price: "8.69", current_price: "12.10" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const rows = out.filter((o) => o.shortSymbol === "TSLA260918C00362500");
  assert.equal(rows.length, 2);
  const covered = rows.find((r) => r.type === KINDS.COVERED_CALL);
  const naked = rows.find((r) => r.type === KINDS.NAKED_CALL);
  assert.ok(covered && naked, "one covered by the long, one with nothing behind it");
  assert.equal(covered.qty, 1);
  assert.equal(naked.qty, 1);
  assert.equal(naked.maxRisk, null, "the uncovered one is still unbounded");
  // The long sits BELOW the short, so the pair cannot lose more than the long
  // cost — and that cost is carried on the long's own row.
  assert.equal(covered.maxRisk, 0);
  assert.equal(covered.coverLongs[0].symbol, "TSLA260918C00352500");
});

// ---------------------------------------------------------------------------
// The live stock repair, read the way the owner holds it
// ---------------------------------------------------------------------------

test("a stock repair: the long call covers a short before the shares are asked", () => {
  // 210 shares, one long 352.50 call, two short 375s. Cover used to be
  // allocated shares-first, so both shorts took 100 shares each and the row
  // read "210 (10 free)" — with a long call sitting right there, unused,
  // covering one of them. A long is the cheaper cover and the one a trader
  // means to use, so it goes first, and 110 shares are left doing nothing.
  const positions = [
    { symbol: "TSLA", qty: "210", qty_available: "210", avg_entry_price: "364.31", current_price: "367.77", market_value: "77232" },
    { symbol: "TSLA260918C00352500", qty: "1", avg_entry_price: "13.57", current_price: "17.85" },
    { symbol: "TSLA260918C00375000", qty: "-2", avg_entry_price: "8.69", current_price: "12.10" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const shares = out.find((o) => o.type === KINDS.SHARES);
  const cc = out.find((o) => o.type === KINDS.COVERED_CALL);

  assert.equal(shares.shareQty, 210);
  assert.equal(shares.encumberedQty, 100, "one short is on the long call, not on the stock");
  assert.equal(shares.freeQty, 110);
  assert.equal(shares.qtyAvailable, 210, "and all 210 can still be sold");
  assert.equal(cc.qty, 2, "neither short is naked");
  assert.equal(out.find((o) => o.type === KINDS.NAKED_CALL), undefined);
  // The three rows are one trade, and say so.
  for (const r of out) assert.equal(r.structure, "stock_repair");
});

test("an adjusted short call is not judged covered or naked", () => {
  // AAPL1 is a post-corporate-action root: the contract no longer delivers
  // 100 AAPL shares, so counting shares against it answers a question about a
  // deliverable it does not have — and answered it in the alarming direction,
  // which is a critical alert on a position that may be perfectly covered.
  const positions = [
    { symbol: "AAPL1260918C00250000", qty: "-1", avg_entry_price: "3.10", current_price: "4.00" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, KINDS.SHORT_CALL_UNJUDGED);
  assert.equal(out[0].maxRisk, null, "not unlimited — unknown");
});

test("an adjusted contract leaves the shares for the contracts that can use them", () => {
  const positions = [
    { symbol: "AAPL", qty: "100", qty_available: "100", avg_entry_price: "200", current_price: "210", market_value: "21000" },
    { symbol: "AAPL1260918C00250000", qty: "-1", avg_entry_price: "3.10", current_price: "4.00" },
    { symbol: "AAPL260918C00260000", qty: "-1", avg_entry_price: "2.00", current_price: "2.50" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  const plain = out.find((o) => o.shortSymbol === "AAPL260918C00260000");
  assert.equal(plain.type, KINDS.COVERED_CALL, "the hundred shares went where they could be used");
  assert.equal(out.find((o) => o.shortSymbol === "AAPL1260918C00250000").type, KINDS.SHORT_CALL_UNJUDGED);
});

test("an order that filled a debit vertical is one, not two loose legs", () => {
  // Long below short on calls is a debit spread. pairSide could only see the
  // credit direction, so every one of these was broken into an orphan short
  // and an orphan long. With the order behind them there is nothing to guess.
  const positions = [
    { symbol: "NVDA260918C00200000", qty: "1", avg_entry_price: "12.00", current_price: "14.00" },
    { symbol: "NVDA260918C00220000", qty: "-1", avg_entry_price: "5.00", current_price: "6.00" }
  ];
  const orders = [{
    filled_at: "2026-09-01T14:00:00Z",
    legs: [
      { symbol: "NVDA260918C00200000", side: "buy", filled_qty: "1" },
      { symbol: "NVDA260918C00220000", side: "sell", filled_qty: "1" }
    ]
  }];
  const out = pairSpreads(positions, [], orders, { cash: 0 });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "call_spread");
  assert.equal(out[0].direction, "debit");
  assert.equal(out[0].longStrike, 200);
  assert.equal(out[0].shortStrike, 220);
});

test("without an order behind them, a long below a short is left to the cover rule", () => {
  // The same two legs with no provenance could equally be a repair against
  // stock the owner holds. Pairing them would take the shares' cover away and
  // rename a position he recognises, so the loose pass does not guess.
  const positions = [
    { symbol: "NVDA260918C00200000", qty: "1", avg_entry_price: "12.00", current_price: "14.00" },
    { symbol: "NVDA260918C00220000", qty: "-1", avg_entry_price: "5.00", current_price: "6.00" }
  ];
  const out = pairSpreads(positions, [], [], { cash: 0 });
  assert.equal(out.find((o) => o.type === "call_spread"), undefined);
  assert.equal(out.find((o) => o.shortSymbol === "NVDA260918C00220000").type, KINDS.COVERED_CALL);
});
