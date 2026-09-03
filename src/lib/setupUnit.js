// What a setup is called, and how its structure reads, per strategy.
//
// Five strategies now share the screens that used to know only "spread" and
// "condor". Everything that names the thing being traded asks here, so a
// cash-secured put is never called a spread and a covered call never a
// condor.

export const SINGLE_STRATEGIES = ["cash_secured_put", "covered_call"];

export const isSingle = (strategy) => SINGLE_STRATEGIES.includes(strategy);

export function unitFor(strategy) {
  if (strategy === "iron_condor") return "condor";
  if (strategy === "cash_secured_put") return "put";
  if (strategy === "covered_call") return "call";
  return "spread";
}

export const STRATEGY_LABEL = {
  put_spread: "Put spread",
  call_spread: "Call spread",
  iron_condor: "Iron condor",
  cash_secured_put: "Cash-secured put",
  covered_call: "Covered call"
};

// The legs being sold -- one for a wheel half, one per side of a spread, two
// on a condor.
export const shortLegs = (c) => (c?.legs || []).filter((l) => l.side === "sell");

// The delta of the short leg, as a trader says it: unsigned, two decimals.
// A put's delta is negative and a call's positive, but the row already says
// which it is, so the sign only makes the same trade look like two numbers.
//
// This is the delta of the contract that was CHOSEN. The candidate also
// carries `targetDelta` -- what the sweep asked for on the pass that produced
// it -- and the two are not the same number: the engine takes the nearest
// strike on the chain, which on a wide or same-day chain can be far away.
// Nothing on screen may show the request in place of the trade.
//
// A condor has two shorts; the larger delta is the one that decides how close
// the position is to trouble, so that is the one reported.
export function shortDelta(c) {
  const deltas = shortLegs(c)
    // Guarded before Number(), which turns null and "" into 0 -- and a missing
    // delta shown as "0.00" would read as a short leg with no exposure at all.
    .filter((l) => l.delta !== null && l.delta !== undefined && l.delta !== "")
    .map((l) => Math.abs(Number(l.delta)))
    .filter((d) => Number.isFinite(d));
  return deltas.length ? Math.max(...deltas).toFixed(2) : null;
}

// "352.5/350P" for a spread side, "352.5P · CSP" for a lone put, "360C on
// 300 sh" for a call over shares. The same words in the results table and
// the dialog's list.
export function structureLabel(c) {
  const legs = c?.legs || [];
  if (legs.length === 1) {
    const l = legs[0];
    const type = l.role?.endsWith("_call") ? "C" : "P";
    if (c.strategy === "covered_call") return `${l.strike}C on ${c.sharesHeld ?? "?"} sh`;
    return `${l.strike}${type} · ${type === "P" ? "CSP" : "short"}`;
  }
  const put = legs.filter((l) => l.role?.endsWith("_put"));
  const call = legs.filter((l) => l.role?.endsWith("_call"));
  const side = (group, suffix) => {
    if (group.length === 0) return null;
    const short = group.find((l) => l.side === "sell");
    const long = group.find((l) => l.side === "buy");
    const ratio = short?.ratio > 1 ? `${short.ratio}× ` : "";
    return `${ratio}${short?.strike}/${long?.strike}${suffix}`;
  };
  return [side(put, "P"), side(call, "C")].filter(Boolean).join(" · ");
}
