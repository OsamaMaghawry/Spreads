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
    if (spread.shares) return [];
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

  if (spread.type === "call_spread") {
    legs.push(
      { symbol: spread.shortSymbol, ratio: 1, action: "buy_to_close", side: "short", kind: "call", strike: spread.shortStrike },
      { symbol: spread.longSymbol, ratio: 1, action: "sell_to_close", side: "long", kind: "call", strike: spread.longStrike }
    );
  } else {
    legs.push(
      { symbol: spread.shortSymbol, ratio: putRatio, action: "buy_to_close", side: "short", kind: "put", strike: spread.shortStrike },
      { symbol: spread.longSymbol, ratio: putRatio, action: "sell_to_close", side: "long", kind: "put", strike: spread.longStrike }
    );
    if (spread.callShortSymbol && spread.callLongSymbol) {
      legs.push(
        { symbol: spread.callShortSymbol, ratio: callRatio, action: "buy_to_close", side: "short", kind: "call", strike: spread.callShortStrike },
        { symbol: spread.callLongSymbol, ratio: callRatio, action: "sell_to_close", side: "long", kind: "call", strike: spread.callLongStrike }
      );
    }
  }

  return legs;
}

export const legLabel = (leg) =>
  `${leg.side === "short" ? "Short" : "Long"} $${leg.strike} ${leg.kind}`;