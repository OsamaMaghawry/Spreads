// The watch rules that need more than one leg to decide.
//
// Most of positionWatch's rules look at a single option leg and a price. A
// naked short call is different: whether it is naked depends on the shares
// the same account holds, and shares arrive from the broker as positions of
// their own. These two helpers are pure so the rule can be tested without a
// broker, a database or a schedule -- the previous version of this rule was a
// call to a function that did not exist, and nothing caught it before it
// reached production.
import { parseOCCSymbol } from "./occ.ts";
import { classifyLeg, KINDS } from "./positionKinds.ts";

const SHARES_PER_CONTRACT = 100;

// Net long shares per ticker from the raw broker positions. A share position
// is one whose symbol is not an OCC contract. A short share position covers
// no call, so it contributes nothing.
export function sharesByTicker(positions: any[]) {
  const out: Record<string, number> = {};
  for (const p of positions || []) {
    if (parseOCCSymbol(p.symbol)) continue;
    const qty = parseFloat(p.qty);
    if (!(qty > 0)) continue;
    const sym = String(p.symbol || "").toUpperCase();
    out[sym] = (out[sym] || 0) + qty;
  }
  return out;
}

// Short calls the account's shares do not cover. `legs` are the watch's parsed
// option legs ({ symbol, occ: { ticker, strike, type }, qty }); `shares` is
// sharesByTicker's result. Shares are claimed by covered calls in the order
// the legs arrive, the same rule spreadPairing applies, and a partially
// covered short call is reported as naked -- classifyLeg's call, since the
// uncovered contracts are the whole story.
export function nakedShortCalls(legs: any[], shares: Record<string, number>, cash: number | null = null) {
  const left: Record<string, number> = { ...(shares || {}) };
  const out: any[] = [];
  for (const leg of legs || []) {
    if (!leg?.occ || leg.occ.type !== "C" || !(leg.qty < 0)) continue;
    const ticker = leg.occ.ticker;
    const have = left[ticker] || 0;
    const contracts = Math.abs(leg.qty);
    const kind = classifyLeg({ qty: leg.qty, optionType: "C" }, { shares: have, cash });
    if (kind === KINDS.NAKED_CALL) {
      out.push({ symbol: leg.symbol, occ: leg.occ, contracts, shares: have });
    } else {
      left[ticker] = have - contracts * SHARES_PER_CONTRACT;
    }
  }
  return out;
}
