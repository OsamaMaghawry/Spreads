// Exactly what the paired wire would send: closeSpread's non-legs branch, in
// the shape spreadLegs speaks. Written out rather than described, because the
// whole point below is to compare the two.
function pairedWireLegs(spread) {
  const putRatio = spread.putRatio || 1;
  const callRatio = spread.callRatio || 1;
  const out = [
    { symbol: spread.shortSymbol, ratio: putRatio, action: "buy_to_close" },
    { symbol: spread.longSymbol, ratio: putRatio, action: "sell_to_close" }
  ];
  if (spread.callShortSymbol && spread.callLongSymbol) {
    out.push(
      { symbol: spread.callShortSymbol, ratio: callRatio, action: "buy_to_close" },
      { symbol: spread.callLongSymbol, ratio: callRatio, action: "sell_to_close" }
    );
  }
  return out;
}

// Whether this structure has to go to the broker as explicit legs.
//
// DERIVED, not listed. The first version of this was
// `spread.single || spread.type === "call_ratio_spread"` — correct for the two
// structures that existed the day it was written, and silently wrong for the
// next one. The paired wire carries ONE ratio for each side, so it cannot
// describe a put ratio, a 1x3, a ladder, or anything else whose two legs are
// not one for one; a hand-maintained list means whoever adds that structure
// has to remember this file, and the failure if they don't is an order for a
// position the account does not hold, reported as filled.
//
// So the question is asked of the structure rather than of its name: build
// what the paired wire WOULD send, build what the legs actually are, and if
// they differ in a single symbol, ratio or action, take the explicit path.
// A structure spreadLegs describes correctly is therefore routed correctly
// without anyone deciding it should be.
export function needsExplicitLegs(spread) {
  // One leg, and the paired form would send a null second one.
  if (spread.single) return true;
  const key = (l) => `${l.symbol}|${l.ratio}|${l.action}`;
  const actual = spreadLegs(spread).map(key).sort().join(",");
  const paired = pairedWireLegs(spread).map(key).sort().join(",");
  return actual !== paired;
}

// Breaks a paired spread/condor back into its individual option legs so a user
// can close any single leg or subset instead of the whole structure.
export function spreadLegs(spread) {
  const putRatio = spread.putRatio || 1;
  const callRatio = spread.callRatio || 1;
  const legs = [];

  // A single position -- a cash-secured put, a covered call, a naked call, a
  // leftover long -- has one leg and one symbol. Running it through the pairing
  // below would emit a second leg with a null symbol, which the broker rejects
  // and the leg picker renders as an empty row.
  if (spread.single) {
    // Held shares are a position like any other and must be closable. Returning
    // [] here is what sent closeSpread a request carrying neither legs nor
    // symbols, which it refuses with "Missing required parameters" -- so an
    // assigned lot could be seen on the dashboard and never sold from it.
    //
    // The leg is equity, not an option: one symbol, quantity in shares rather
    // than contracts, and `assetClass` so the quote and the order both know not
    // to treat it as a contract. Long shares are sold to close; a short lot is
    // bought back.
    if (spread.shares) {
      const signed = Number(spread.shareQty ?? spread.qty ?? 0);
      const qty = Math.abs(signed);
      if (!spread.longSymbol || !qty) return [];
      const isShort = signed < 0;
      return [{
        symbol: spread.longSymbol,
        ratio: 1,
        action: isShort ? "buy_to_close" : "sell_to_close",
        side: isShort ? "short" : "long",
        kind: "shares",
        assetClass: "equity",
        qty,
        strike: null
      }];
    }
    const l = spread.legs?.[0];
    if (!l) return [];
    const short = l.side === "short";
    return [{
      symbol: l.symbol,
      ratio: l.ratio || 1,
      action: short ? "buy_to_close" : "sell_to_close",
      side: l.side,
      kind: l.kind,
      strike: l.strike
    }];
  }

  // One rule for every two-leg structure, and an explicit list of what those
  // are.
  //
  // This used to be `call_ratio_spread` / `call_spread` / else, where the else
  // described ANY unrecognised type as a one-for-one PUT spread. A put ratio,
  // a ladder, a butterfly — anything added later — would have been silently
  // handed to the broker as a structure it is not, and the leg picker would
  // have shown two legs that do not exist. A guess is worse than a refusal
  // here: a refusal is visible in a second, a wrong fill is not.
  //
  // So the side comes from the type's own name, the two ratios come from the
  // structure when it states them, and an unknown type gets nothing at all.
  const KNOWN = ["put_spread", "call_spread", "call_ratio_spread", "put_ratio_spread", "iron_condor"];
  if (!KNOWN.includes(spread.type)) return [];

  const isCallSide = /^call_/.test(spread.type);
  const kind = isCallSide ? "call" : "put";
  legs.push(
    {
      symbol: spread.shortSymbol,
      ratio: spread.shortRatio || putRatio,
      action: "buy_to_close", side: "short", kind, strike: spread.shortStrike
    },
    {
      symbol: spread.longSymbol,
      ratio: spread.longRatio || putRatio,
      action: "sell_to_close", side: "long", kind, strike: spread.longStrike
    }
  );
  // An iron condor's second pair. Its own ratio, which is what makes an
  // unbalanced condor closable as the thing it is.
  if (spread.callShortSymbol && spread.callLongSymbol) {
    legs.push(
      { symbol: spread.callShortSymbol, ratio: callRatio, action: "buy_to_close", side: "short", kind: "call", strike: spread.callShortStrike },
      { symbol: spread.callLongSymbol, ratio: callRatio, action: "sell_to_close", side: "long", kind: "call", strike: spread.callLongStrike }
    );
  }

  return legs;
}

export const legLabel = (leg) =>
  // Shares have no strike and are not a contract, so the option phrasing would
  // read "Long $null shares".
  leg.assetClass === "equity"
    ? `${leg.qty} ${Math.abs(leg.qty) === 1 ? "share" : "shares"}`
    : `${leg.side === "short" ? "Short" : "Long"} $${leg.strike} ${leg.kind}`;