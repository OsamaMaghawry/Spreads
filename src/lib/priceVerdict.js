// Will my price cross, or will it rest?
//
// The only question that matters once the walk is switched off, and the one
// place a trader is most likely to get it backwards: on a close you are paying a
// debit, so a HIGHER number is more aggressive; on an open you are asking for a
// credit, so a LOWER number is more aggressive. Both tickets use the same
// control, so the comparison lives here as a pure function with the side named
// explicitly rather than inferred from context.
//
// Withhold rather than default, as everywhere else: with no quote, or no price
// yet chosen, this returns null and the caller says it cannot judge. It never
// guesses that an unjudgeable price is a safe one.

export const round2 = (n) => Math.round(n * 100) / 100;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The net bid and ask of a whole structure, from its legs.
//
// `setup.credit` from the scanner is short.bid - long.ask: the credit you get by
// hitting every bid, which is the marketable side. The other side — short.ask -
// long.bid — is the best you could ask for and expect to rest. Both are needed
// to say which of the two a chosen price is nearer.
export function netQuote(legs) {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  let bid = 0;
  let ask = 0;
  for (const leg of legs) {
    const lb = num(leg?.bid);
    const la = num(leg?.ask);
    if (lb === null || la === null) return null;
    const ratio = num(leg?.ratio) ?? 1;
    if (String(leg?.side).startsWith("sell")) {
      bid += lb * ratio;
      ask += la * ratio;
    } else {
      bid -= la * ratio;
      ask -= lb * ratio;
    }
  }
  if (ask < bid) return null;
  return { bid: round2(bid), ask: round2(ask), mid: round2((bid + ask) / 2) };
}

// side: "debit"  — you are paying to close. Higher crosses.
// side: "credit" — you are asking to open. Lower crosses.
export function verdictFor({ price, bid, ask, side = "debit" }) {
  const p = num(price);
  const b = num(bid);
  const a = num(ask);
  if (p === null || b === null || a === null || a < b) return null;

  const crosses = side === "credit" ? p <= b : p >= a;
  const away = side === "credit" ? p >= a : p <= b;

  if (crosses) {
    return {
      state: "marketable",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
      text:
        side === "credit"
          ? "At or below the bid — marketable, so this should fill straight away."
          : "At or above the ask — marketable, so this should fill straight away."
    };
  }
  if (away) {
    return {
      state: "unlikely",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text:
        side === "credit"
          ? "At or above the ask — unlikely to fill unless the market comes to you."
          : "At or below the bid — unlikely to fill unless the market comes to you."
    };
  }
  return {
    state: "resting",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
    text: "Between the quotes — it may rest unfilled until the market moves."
  };
}

// Where the mark sits on the bid-ask track, 0 at the bid and 1 at the ask,
// clamped so a price outside the spread renders at an edge rather than off the
// end of the bar. Returns null when there is nothing to plot against.
export function markPosition({ price, bid, ask }) {
  const p = num(price);
  const b = num(bid);
  const a = num(ask);
  if (p === null || b === null || a === null || a < b) return null;
  const span = Math.max(a - b, 0.01);
  return Math.min(1, Math.max(0, (p - b) / span));
}
