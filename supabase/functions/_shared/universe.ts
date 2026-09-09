// Which of the market's thousands of names are worth pulling a chain for.
//
// The screener used to scan a hard-coded list: fifty mega caps, or the S&P 500.
// Scanning "everything" is a different problem, not a bigger one. Alpaca lists
// around eleven thousand equities; fetching an option chain for each is minutes
// of requests and most of the answers are unusable. So the universe scan is two
// passes, and this module is the first one:
//
//   1. CHEAP. One snapshot request per hundred symbols gives spot, the day's
//      volume and the current quote for all of them. Filter here.
//   2. EXPENSIVE. Pull chains only for what survived.
//
// The price filter the owner asked for is what makes pass 2 tractable at all,
// which is why the two arrived as one request.
//
// WHY THERE IS A LIQUIDITY FLOOR, when nobody asked for one.
//
// The stated goal is that a small account can find positions that risk less of
// it. Price alone does not deliver that, and taken alone it inverts it: the
// cheap end of the market is where the illiquid names are. A $30 stock whose
// options are quoted 0.40/2.40 costs a third of its own premium to enter and
// may not be closable at all on the day it matters -- which is strictly more
// dangerous for a small account than a $200 name quoted a penny wide, because
// a small account cannot absorb the slippage and cannot wait.
//
// The floor costs nothing: volume and the quote arrive in the same snapshot as
// the price. It is a filter, not a judgement -- it is set by the user, shown on
// screen, and the reason a name was dropped is reported back.

export type Snapshot = any;

export type UniverseFilters = {
  // Highest underlying price to consider. The direct form of the owner's ask.
  maxSpot?: number | null;
  // Lowest underlying price -- sub-dollar names have option chains that exist
  // and should not be traded by anyone reading a screener.
  minSpot?: number | null;
  // Shares traded today. The liquidity floor.
  minVolume?: number | null;
  // Widest acceptable underlying quote, as a fraction of spot. A stock quoted
  // 2% wide has options quoted far wider.
  maxSpreadPct?: number | null;
  // Capital a single contract would commit, as a fraction of account equity.
  // A cash-secured put ties up strike x 100 -- $20,000 on a $200 stock -- so
  // for a small account this is the filter that decides what is reachable, and
  // price alone is a poor proxy for it.
  maxCapitalPct?: number | null;
  // Account equity, needed only when maxCapitalPct is set.
  equity?: number | null;
};

export type Judged = { symbol: string; spot: number | null; volume: number | null; keep: boolean; reason: string | null };

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Spot, volume and quote width from one snapshot, or nulls. Deliberately
// permissive about WHICH price -- this is a coarse sieve, and the authoritative
// price for anything that survives comes from marketPrice.ts with its own trust
// ladder. A name is never traded on a number from here.
export function readSnapshot(s: Snapshot) {
  const trade = num(s?.latestTrade?.p);
  const bid = num(s?.latestQuote?.bp);
  const ask = num(s?.latestQuote?.ap);
  const close = num(s?.dailyBar?.c) ?? num(s?.prevDailyBar?.c);
  const mid = bid !== null && ask !== null && ask > 0 && bid >= 0 && ask >= bid ? (bid + ask) / 2 : null;
  return {
    spot: trade ?? mid ?? close,
    volume: num(s?.dailyBar?.v) ?? num(s?.prevDailyBar?.v),
    // Null rather than 0 when there is no two-sided quote: "unknown width" and
    // "zero width" must not be the same value, or a dead name passes the
    // tightest filter on the screen.
    spreadPct: mid !== null && mid > 0 && ask !== null && bid !== null ? (ask - bid) / mid : null
  };
}

// Judge one name. Returns why it was dropped, so the screener can say
// "1,847 names, 31 passed" and account for the rest instead of showing a short
// list with no explanation.
export function judge(symbol: string, snap: Snapshot, f: UniverseFilters): Judged {
  const { spot, volume, spreadPct } = readSnapshot(snap);
  const out = (keep: boolean, reason: string | null) => ({ symbol, spot, volume, keep, reason });

  if (spot === null || !(spot > 0)) return out(false, "no price");
  if (f.minSpot != null && spot < f.minSpot) return out(false, `under $${f.minSpot}`);
  if (f.maxSpot != null && spot > f.maxSpot) return out(false, `over $${f.maxSpot}`);

  if (f.minVolume != null) {
    // Unknown volume fails a volume floor. Treating it as passing would let
    // every name with no data through the one filter meant to exclude them.
    if (volume === null) return out(false, "no volume data");
    if (volume < f.minVolume) return out(false, "thin volume");
  }
  if (f.maxSpreadPct != null) {
    if (spreadPct === null) return out(false, "no quote");
    if (spreadPct > f.maxSpreadPct) return out(false, "quoted too wide");
  }
  // Capital per contract. Approximated at spot x 100, because the strike is not
  // known until the chain is pulled and a cash-secured put's strike sits near
  // spot by construction. Approximate on purpose and named as such: this is a
  // sieve, and the exact collateral is computed per candidate later.
  if (f.maxCapitalPct != null && f.equity != null && f.equity > 0) {
    if (spot * 100 > f.equity * f.maxCapitalPct) return out(false, "too much capital per contract");
  }
  return out(true, null);
}

export function screenUniverse(snapshots: Record<string, Snapshot>, f: UniverseFilters) {
  const judged = Object.keys(snapshots || {}).sort().map((sym) => judge(sym, snapshots[sym], f));
  const kept = judged.filter((j) => j.keep);
  // Counted by reason so the screener can show where the universe went. A
  // filter nobody can see the effect of is a filter nobody trusts.
  const dropped: Record<string, number> = {};
  for (const j of judged) if (!j.keep && j.reason) dropped[j.reason] = (dropped[j.reason] || 0) + 1;
  return { kept, dropped, considered: judged.length };
}

// Names that are plausibly optionable, from Alpaca's asset list.
//
// Alpaca's /v2/assets does not carry a documented "has options" flag we can
// rely on across account types, so this filters on what IS reliable -- active,
// tradable, US equity on a primary exchange -- and lets the chain fetch be the
// authority. A name with no chain simply yields no candidates, which is the
// correct outcome and costs one request; guessing optionability from a field
// that may not be populated would silently hide names that do trade options.
//
// OTC is excluded outright: those names have no listed options at all, and
// including them would spend the whole request budget on certain misses.
const PRIMARY = new Set(["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS"]);

export function tradableEquities(assets: any[]): string[] {
  return (assets || [])
    .filter(
      (a) =>
        a &&
        a.status === "active" &&
        a.tradable === true &&
        a.class === "us_equity" &&
        PRIMARY.has(String(a.exchange).toUpperCase()) &&
        // Warrants, units and rights share the equity class and never have
        // listed options. They are identifiable by symbol suffix rather than by
        // any field Alpaca sets.
        !/[.\-/]/.test(String(a.symbol))
    )
    .map((a) => String(a.symbol))
    .sort();
}
