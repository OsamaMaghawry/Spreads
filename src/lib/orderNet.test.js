import { test } from "node:test";
import assert from "node:assert/strict";
import { netKind, legsAreEquity, orderNetKind, saveRefusalFor, isClosingTicket, matchPositionForTicket, maxCloseQty, tooPrecise, QTY_DECIMALS } from "./orderNet.js";

// The owner: *"I want to show up if the order is Debit or Credit (Options
// only). For stocks, no need."*
//
// The trap this guards is the sign convention. `spreadQuote` answers in
// DEBITS, so a CREDIT spread quotes NEGATIVE -- the same convention Alpaca's
// multi-leg limit uses. Read the sign the other way round and every credit
// spread in the product is labelled a debit, on the screen where a trader
// decides whether money is coming in or going out.

test("a negative net is money coming in, and is named a credit", () => {
  const k = netKind(-2.49, false);
  assert.equal(k.kind, "credit");
  assert.equal(k.label, "Credit");
  // The amount is unsigned: the word carries the direction, so "-$2.49 credit"
  // would say it twice and contradict itself.
  assert.equal(k.amount, 2.49);
});

test("a positive net is money going out, and is named a debit", () => {
  const k = netKind(1.15, false);
  assert.equal(k.kind, "debit");
  assert.equal(k.amount, 1.15);
});

test("shares are never called a debit or a credit", () => {
  // Selling stock quotes as a negative debit. That is a sale, not a credit in
  // the sense a trader means, so equity gets no word at all.
  assert.equal(netKind(-412.5, true), null);
  assert.equal(netKind(412.5, true), null);
});

test("a figure we do not have is not labelled either way", () => {
  for (const v of [null, undefined, NaN, "", 0]) {
    assert.equal(netKind(v, false), null, `${String(v)} should carry no label`);
  }
});

test("option symbols are not equity, plain tickers are", () => {
  assert.equal(legsAreEquity([{ symbol: "TSLA251217P00320000" }]), false);
  assert.equal(
    legsAreEquity([{ symbol: "TSLA251217P00320000" }, { symbol: "TSLA260219P00370000" }]),
    false
  );
  assert.equal(legsAreEquity([{ symbol: "TSLA" }]), true);
  // Nothing to judge is not "equity" -- it is nothing, and calling it equity
  // would strip the debit/credit label off an option ticket whose legs simply
  // had not loaded yet.
  assert.equal(legsAreEquity([]), false);
  assert.equal(legsAreEquity(null), false);
});


// ---------------------------------------------------------------------------
// A whole order, which is a different question from a quoted net.
//
// Alpaca signs a MULTI-LEG limit and does NOT sign a single-leg one. Reading
// the sign on a lone short put -- the most common ticket this product writes --
// would label its credit a debit, on the row where the trader checks whether
// money is coming in.
// ---------------------------------------------------------------------------

const SHORT_PUT = { legs: [{ side: "sell_to_open", symbol: "TSLA251217P00320000" }], limitPrice: 2.49 };
const LONG_PUT = { legs: [{ side: "buy_to_open", symbol: "TSLA251217P00320000" }], limitPrice: 2.49 };

test("a single short option leg is a credit even though its limit is positive", () => {
  const k = orderNetKind(SHORT_PUT, false);
  assert.equal(k.kind, "credit");
  assert.equal(k.amount, 2.49);
});

test("a single long option leg is a debit", () => {
  assert.equal(orderNetKind(LONG_PUT, false).kind, "debit");
});

test("a multi-leg order is read from Alpaca's signed net, not from leg sides", () => {
  // Both legs present, net negative: a credit spread, whatever order the legs
  // happen to be listed in.
  const credit = {
    legs: [{ side: "sell_to_open", symbol: "TSLA251217P00320000" }, { side: "buy_to_open", symbol: "TSLA251217P00310000" }],
    limitPrice: -1.05
  };
  assert.equal(orderNetKind(credit, false).kind, "credit");
  assert.equal(orderNetKind(credit, false).amount, 1.05);
  // The same two legs with a positive net is a debit structure.
  const debit = { ...credit, limitPrice: 2.49 };
  assert.equal(orderNetKind(debit, false).kind, "debit");
});

test("a share order and a market order carry no debit/credit word", () => {
  assert.equal(orderNetKind({ legs: [{ side: "buy", symbol: "TSLA" }], limitPrice: 412.5 }, true), null);
  // No limit yet: nothing to name until it fills.
  assert.equal(orderNetKind({ legs: [{ side: "sell_to_open", symbol: "TSLA251217P00320000" }], limitPrice: null }, false), null);
  assert.equal(orderNetKind({ legs: [], limitPrice: 2.49 }, false), null);
});


// ---------------------------------------------------------------------------
// Never offer what we will refuse.
//
// The owner, on a working closing order: *"I clicked save it for later first
// time, and it didn't give me any status ... Then I clicked again, it gave me
// the attached message. Somehow it's confusing."* The button was live on an
// order that could never be parked, and the refusal arrived only after he had
// confirmed. These cases are what the card now asks before drawing the button.
// ---------------------------------------------------------------------------

test("a partly filled order cannot be parked, and the reason names the numbers", () => {
  const why = saveRefusalFor({
    legs: [{ side: "sell", intent: "sell_to_open", symbol: "TSLA251217P00320000" }],
    qty: 5,
    filledQty: 2
  });
  assert.match(why, /2 of 5/);
  assert.match(why, /re-open what filled/);
});

test("an untouched opening order can be parked", () => {
  assert.equal(
    saveRefusalFor({
      legs: [
        { side: "sell", intent: "sell_to_open", symbol: "TSLA251217P00320000" },
        { side: "buy", intent: "buy_to_open", symbol: "TSLA260219P00370000" }
      ],
      qty: 1,
      filledQty: 0
    }),
    null
  );
  // An order carrying no intent at all is not assumed to be closing — that
  // would refuse every order on a broker that omits the field.
  assert.equal(saveRefusalFor({ legs: [{ side: "sell", symbol: "QQQ" }], qty: 14, filledQty: 0 }), null);
});


// ---------------------------------------------------------------------------
// Anything can be parked, including an exit.
//
// The owner: *"So, why the closing position cannot be saved for later. I need
// anything to be saved for later."* He was right — the refusal was a symptom
// of routing every saved ticket through the OPEN dialog. A closing ticket now
// reopens against the position it belongs to.
// ---------------------------------------------------------------------------

test("a closing order can be saved now; only a partial fill still refuses", () => {
  const exit = { legs: [{ side: "sell", intent: "sell_to_close", symbol: "QQQ" }], qty: 14, filledQty: 0 };
  assert.equal(saveRefusalFor(exit), null);
});

test("closing is read from intent, because side cannot carry it", () => {
  // Both of these are "buy". Only the intent separates an exit from an entry,
  // and sending one down the other's path doubles a position instead of
  // flattening it.
  assert.equal(isClosingTicket([{ side: "buy", intent: "buy_to_close" }]), true);
  assert.equal(isClosingTicket([{ side: "buy", intent: "buy_to_open" }]), false);
  assert.equal(isClosingTicket([{ side: "sell", intent: "sell_to_close" }]), true);
  // One closing leg among several is a closing ticket.
  assert.equal(
    isClosingTicket([{ side: "sell", intent: "sell_to_open" }, { side: "buy", intent: "buy_to_close" }]),
    true
  );
  // No intent at all is not assumed to be closing.
  assert.equal(isClosingTicket([{ side: "buy" }]), false);
  assert.equal(isClosingTicket([]), false);
});

// The matcher, with `spreadLegs` stubbed the way the app injects it.
const legsOf = (s) => s.legs;

test("a saved exit finds the position holding exactly its contracts", () => {
  const target = { id: "a", legs: [{ symbol: "TSLA251217P00320000" }, { symbol: "TSLA251217P00310000" }] };
  const other = { id: "b", legs: [{ symbol: "NVDA251217P00100000" }] };
  const saved = [{ symbol: "TSLA251217P00310000" }, { symbol: "TSLA251217P00320000" }];
  // Order does not matter; the set does.
  assert.equal(matchPositionForTicket(saved, [other, target], legsOf).id, "a");
});

test("a position that merely overlaps is not a match", () => {
  // One leg of the saved ticket, plus a third contract. Sending an exit built
  // for two legs against a three-legged position would leave a naked leg.
  const partial = { id: "p", legs: [{ symbol: "TSLA251217P00320000" }, { symbol: "TSLA251217P00310000" }, { symbol: "TSLA251217P00300000" }] };
  const saved = [{ symbol: "TSLA251217P00310000" }, { symbol: "TSLA251217P00320000" }];
  assert.equal(matchPositionForTicket(saved, [partial], legsOf), null);
});

test("a position closed since the ticket was parked returns null, not a guess", () => {
  assert.equal(matchPositionForTicket([{ symbol: "QQQ" }], [], legsOf), null);
  assert.equal(matchPositionForTicket([], [{ id: "x", legs: [{ symbol: "QQQ" }] }], legsOf), null);
});

test("a position whose legs cannot be built is skipped rather than thrown on", () => {
  const bad = { id: "bad" };
  const good = { id: "good", legs: [{ symbol: "QQQ" }] };
  const throwing = (s) => { if (!s.legs) throw new Error("cannot pair"); return s.legs; };
  assert.equal(matchPositionForTicket([{ symbol: "QQQ" }], [bad, good], throwing).id, "good");
});


// ---------------------------------------------------------------------------
// How much of a closing order you may actually ask for.
//
// The owner: *"Why are you capping to 5 shares while I have more?"* I had
// capped at the quantity the order was sent for, which limits nothing -- it is
// just what he typed earlier. The ceiling is what he HOLDS.
// ---------------------------------------------------------------------------

test("the cap adds back what this order is already holding", () => {
  // 14 shares held, 5 of them claimed by this very working sell order, so the
  // broker reports 9 available. Replacing the order releases its own hold, so
  // he may raise it to the full 14 -- capping at 9 is the bug he hit.
  const order = { qty: 5, legs: [{ symbol: "QQQ", qty: 5 }] };
  const broker = [{ symbol: "QQQ", qty: 14, available: 9 }];
  assert.equal(maxCloseQty(order, broker, true), 14);
});

test("a multi-leg close is limited by its scarcest leg", () => {
  // One leg can cover 10 units, the other only 3.
  const order = {
    qty: 1,
    legs: [{ symbol: "TSLA251217P00320000", qty: 1 }, { symbol: "TSLA251217P00310000", qty: 1 }]
  };
  const broker = [
    { symbol: "TSLA251217P00320000", qty: 10, available: 9 },
    { symbol: "TSLA251217P00310000", qty: 3, available: 2 }
  ];
  assert.equal(maxCloseQty(order, broker, false), 3);
});

test("a ratio leg is divided by its ratio, not counted flat", () => {
  // Two contracts of the short per unit of the order: 10 held is 5 units.
  const order = { qty: 1, legs: [{ symbol: "AAA", qty: 2 }] };
  const broker = [{ symbol: "AAA", qty: 10, available: 8 }];
  assert.equal(maxCloseQty(order, broker, false), 5);
});

test("contracts floor; shares keep their fraction", () => {
  const order = { qty: 1, legs: [{ symbol: "SPY", qty: 1 }] };
  const broker = [{ symbol: "SPY", qty: 13.456789, available: 12.456789 }];
  // A share may be fractional -- rounding down would strip part of a holding
  // the trader is entitled to close.
  assert.equal(maxCloseQty(order, broker, true), 13.456789);
  // A contract may not be.
  assert.equal(maxCloseQty({ qty: 1, legs: [{ symbol: "X", qty: 1 }] }, [{ symbol: "X", qty: 2.9, available: 1.9 }], false), 2);
});

test("a leg the broker does not report leaves the cap unknown", () => {
  // Unknown is not zero and not "uncapped" -- the caller decides. Inventing a
  // number here would either block a legitimate order or wave through one the
  // broker will bounce.
  const order = { qty: 1, legs: [{ symbol: "GONE", qty: 1 }] };
  assert.equal(maxCloseQty(order, [{ symbol: "OTHER", qty: 5, available: 5 }], false), null);
  assert.equal(maxCloseQty(order, [], false), null);
  assert.equal(maxCloseQty({ qty: 0, legs: [] }, [], false), null);
});

test("a broker row with no qty_available falls back to the holding", () => {
  const order = { qty: 2, legs: [{ symbol: "QQQ", qty: 2 }] };
  // No `available` field at all: the holding is all we know, and the order's
  // own claim is still added back.
  assert.equal(maxCloseQty(order, [{ symbol: "QQQ", qty: 7 }], true), 9);
});


// ---------------------------------------------------------------------------
// Alpaca's precision, from Alpaca.
//
// The owner's own QQQ holding: 9.000000818 shares. "Both notional and qty
// fields can take up to 9 decimal point values"
// (docs.alpaca.markets/docs/fractional-trading). This module first rounded to
// six, which turns that holding into 9.000001 -- MORE than he holds, on a
// closing order. The broker refuses it, and it asks to sell a share that does
// not exist.
// ---------------------------------------------------------------------------

test("nine decimal places survive a holding exactly, uncapped and unrounded", () => {
  assert.equal(QTY_DECIMALS, 9);
  const order = { qty: 1, legs: [{ symbol: "QQQ", qty: 1 }] };
  // 9.000000818 held, 1 claimed by the working order, so 8.000000818 available.
  const broker = [{ symbol: "QQQ", qty: 9.000000818, available: 8.000000818 }];
  assert.equal(maxCloseQty(order, broker, true), 9.000000818);
});

test("the cap never rounds UP past the holding", () => {
  // Rounding is a ceiling on what can be sold, so the one forbidden direction
  // is up. A tenth digit must be dropped, never carried.
  const order = { qty: 0.000000001, legs: [{ symbol: "X", qty: 0.000000001 }] };
  const broker = [{ symbol: "X", qty: 5.0000000009, available: 5 }];
  const cap = maxCloseQty(order, broker, true);
  assert.ok(cap <= 5.000000001, `cap ${cap} exceeds the holding`);
});

test("more than nine decimals is refused before it reaches the broker", () => {
  assert.equal(tooPrecise("9.000000818"), false);   // exactly nine
  assert.equal(tooPrecise("9.0000008181"), true);   // ten
  assert.equal(tooPrecise("9"), false);
  assert.equal(tooPrecise("9."), false);
  assert.equal(tooPrecise(13), false);
  assert.equal(tooPrecise(""), false);
  assert.equal(tooPrecise(null), false);
});
