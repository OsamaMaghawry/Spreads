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
