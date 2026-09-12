// An order that has not been placed, priced the same way an open one is.
//
// The dashboard can already draw what a ticker is doing: `tickerBook` prices
// every open row at one underlying, adds them up and sweeps the result
// (`positionPLAt`, `payoffCurve`, `crossings`). The ticket had none of that —
// it showed a max risk, a max profit and a break-even as three separate
// numbers and left the shape between them to the imagination.
//
// The owner: *"'Analysis' inside the ticket before I submit to show the graph
// like the one with max loss and profit we have already. I want it to this
// position only. Then 'Advanced Analysis' to show how it reflects to the
// entire position if any if executed."*
//
// So this turns a SETUP into rows of exactly the shape `positionPLAt` reads.
// Nothing here re-derives a payoff: the same function prices the pending order
// and the open book, which is the only way the two pictures can be compared at
// all. A second payoff engine for "what if" would be a second answer to the
// same question, and this product has paid for that mistake before.

// Null, undefined and "" are NOT zero. `Number(null)` is 0, which would turn
// a builder's deliberate "this has no ceiling" into a $0.00 ceiling and a
// missing mid into a free contract.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A leg's kind comes from its ROLE, which every builder sets, rather than from
// `type`, which the scanner's legs inherit from the chain and the chain's own
// legs spell differently ("P" vs "put").
const kindOfLeg = (l) =>
  String(l?.role || "").endsWith("_call") || l?.type === "call" || l?.type === "C" ? "call" : "put";

// What one contract of the order is actually worth per share, from the legs.
// Positive is a credit taken in, negative a debit paid — the same sign
// convention `openPosition` reads.
export function legNet(legs) {
  return (legs || []).reduce((sum, l) => {
    const price = num(l.mid) ?? num(l.bid) ?? 0;
    const ratio = num(l.ratio) || 1;
    return sum + ratio * (l.side === "sell" ? price : -price);
  }, 0);
}

/**
 * The order as priceable rows.
 *
 * `net` is what the order will actually be done at, per contract, per share —
 * the limit on the ticket rather than the midpoint the setup was built from.
 * It is passed through exactly: a payoff at expiry depends on the legs' net
 * only as one additive term, so the difference between the limit and the mid
 * shifts the whole curve and changes nothing else. The shift is applied to the
 * first leg's entry (divided by its ratio, signed by its side) because that is
 * arithmetically identical to spreading it across all of them, and picking one
 * leg keeps the row readable.
 *
 * A COVERED CALL BRINGS ITS SHARES. "This position only" means the position,
 * and a covered call is not a naked call — the hundred shares per contract are
 * what make it covered, and drawing the call alone would show an unbounded
 * loss above the strike on a position that has none.
 */
export function pendingRows(setup, qty = 1, net = undefined) {
  if (!setup?.legs?.length) return [];
  const units = Math.max(1, Math.round(num(qty) || 1));

  const legs = setup.legs.map((l) => ({
    kind: kindOfLeg(l),
    side: l.side === "sell" ? "short" : "long",
    strike: num(l.strike) ?? 0,
    entryPrice: num(l.mid) ?? num(l.bid) ?? 0,
    ratio: num(l.ratio) || 1
  }));

  const target = num(net);
  if (target !== null) {
    const shift = target - legNet(setup.legs);
    if (shift !== 0) {
      const first = legs[0];
      first.entryPrice += (first.side === "short" ? shift : -shift) / (first.ratio || 1);
      // `positionPLAt` takes the absolute entry price, so a leg driven
      // negative by a large shift would silently flip sign. It cannot happen
      // from a limit a few cents off the mid, and if it ever did the row must
      // not quietly price the opposite trade.
      if (first.entryPrice < 0) return [];
    }
  }

  const rows = [{
    id: "pending",
    pending: true,
    ticker: setup.ticker,
    type: "option",
    qty: units,
    legs,
    stockPrice: num(setup.spot) ?? 0,
    // Never adjusted: the chain refuses to build a ticket from a contract
    // whose deliverable is not 100 shares, so anything reaching here is plain.
    adjusted: false
  }];

  if (setup.strategy === "covered_call" && num(setup.basis) > 0) {
    rows.push({
      id: "pending-shares",
      pending: true,
      ticker: setup.ticker,
      type: "shares",
      shareQty: units * 100,
      shareBasis: num(setup.basis),
      stockPrice: num(setup.spot) ?? 0,
      adjusted: false
    });
  }

  return rows;
}

/**
 * The most the order can make at expiry, per contract — or null where there
 * is no ceiling on that side either.
 *
 * A builder that has WORKED OUT the answer puts `maxProfit` on the setup, and
 * that answer wins, including when it is null: `spreadSetup` sets it to null
 * on a calendar or diagonal precisely because the two legs never settle
 * against each other and the width does not bound anything. So the presence of
 * the key is the test, not its value — falling back on a null would replace a
 * considered refusal with a guess.
 *
 * Setups from the scanner carry no such key, and every shape it builds is a
 * credit structure whose best case is keeping the credit.
 */
export function maxProfitOf(setup) {
  if (!setup) return null;
  if (Object.prototype.hasOwnProperty.call(setup, "maxProfit")) {
    return num(setup.maxProfit);
  }
  const credit = num(setup.credit);
  const strike = num(setup.legs?.[0]?.strike);
  switch (setup.strategy) {
    // A bought call gains with the stock and the stock has no ceiling.
    case "long_call": return null;
    // A bought put is worth most with the stock at zero. `credit` is negative
    // on a debit, so adding it subtracts what was paid.
    case "long_put": return strike !== null && credit !== null ? (strike + credit) * 100 : null;
    case "covered_call": return num(setup.ifCalled);
    default: return credit !== null ? credit * 100 : null;
  }
}

// The strikes, named, for the chart's vertical marks.
export function ticketMarks(setup) {
  const marks = (setup?.legs || []).map((l) => ({
    label: `${l.side === "sell" ? "S" : "L"} ${num(l.strike)}${kindOfLeg(l) === "call" ? "C" : "P"}`,
    value: num(l.strike)
  })).filter((m) => m.value > 0);
  if (setup?.strategy === "covered_call" && num(setup.basis) > 0) {
    marks.push({ label: "Basis", value: num(setup.basis) });
  }
  const seen = new Set();
  return marks.filter((m) => (seen.has(m.value) ? false : seen.add(m.value)));
}

// A book of open rows plus the pending ones, in the shape `tickerBook` returns
// so `payoffCurve` and `curveRange` read it unchanged.
//
// `spot` is taken from the OPEN rows first: they were marked by the same sync
// that priced the dashboard, and a ticket's own spot can be a scan minutes old.
export function withPending(book, rows, spot = null) {
  const open = book?.rows || [];
  const all = [...open, ...rows];
  if (!all.length) return null;
  const px = num(book?.spot) || num(spot) || num(rows[0]?.stockPrice) || 0;
  return { ticker: book?.ticker || rows[0]?.ticker || null, rows: all, spot: px };
}
