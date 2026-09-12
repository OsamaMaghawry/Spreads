import { sessionPhase } from "./watchRules.ts";
import { MAX_PRICE_AGE_MS } from "./marketPrice.ts";

// What is worth telling somebody before their order goes to the broker — and
// nothing more than telling them.
//
// This file replaces a set of REFUSALS. `openPosition`'s preflight used to
// return the first problem it found as an error string and the handler turned
// that into a 409 with nothing sent. The owner, on being refused an order at
// 1:16 AM because "Last trade is more than 30 minutes old":
//
//   *"the app shouldn't decide for the user whether to put the order or not.
//   It should just warn and the user can continue or not. Also, adding 30 mins
//   across the board is not correct. Now the session is closed. If session is
//   closed, it says closed not 30 mins, same as any delay in the prices in any
//   time during the session. It can't be treated the same. In all cases just
//   warning. Alpaca doesn't prevent anyone putting orders on weekends so do I."*
//
// Both halves of that are right, and they are separate corrections:
//
//   WHO DECIDES. Every finding here is a WARNING carrying a code. The handler
//   returns them once, the ticket shows them, and the user either acknowledges
//   them or goes back. A warning the user has already seen and accepted is not
//   raised again; a warning that appears for the first time mid-walk still
//   stops to be seen, because it is news.
//
//   WHAT IT SAYS. A thirty-minute-old print at 1 AM is not a stale feed, it is
//   a closed market, and calling it staleness told the owner his data was
//   broken when nothing was wrong. Staleness is only a finding while the
//   session is actually trading. Outside it the message is that the market is
//   shut and what the price is a closing price — which is a fact about the
//   clock, not a fault.

export type OrderWarning = {
  code: string;
  title: string;
  detail: string;
  // "caution" is a fact worth knowing; "serious" is one that changes what the
  // numbers on the ticket mean. Both are acknowledgeable — the difference is
  // how loudly the ticket prints them.
  severity: "caution" | "serious";
};

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const clock = (at: number | null) =>
  at === null || at === undefined
    ? null
    : new Date(at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      }) + " ET";

// Monday..Friday, so "the market opens again" names the right day.
const nextOpenDay = (now: Date) => {
  const day = now.getUTCDay();
  if (day === 6) return "Monday";
  if (day === 0) return "Monday";
  // A weekday after the close, or a weekday before the open.
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (mins < 13 * 60 + 30) return "later today";
  return day === 5 ? "Monday" : "tomorrow";
};

/**
 * The market being shut, said as such.
 *
 * Returned whenever the session is not open — including weekends, which is the
 * case the owner hit. It is never a refusal: Alpaca accepts orders outside the
 * session and queues them for the next one, and this product does not stand
 * between a user and their broker's own rules.
 */
export function sessionWarning(now: Date = new Date()): OrderWarning | null {
  const phase = sessionPhase(now);
  if (phase === "open") return null;

  const weekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;
  const when =
    weekend ? "It is the weekend."
      : phase === "pre" ? "The session has not opened yet (9:30 AM ET)."
        : "The session closed at 4:00 PM ET.";

  return {
    code: "market_closed",
    severity: "caution",
    title: "The market is closed.",
    detail:
      `${when} Quotes and the underlying price on this ticket are the last ones the market made, ` +
      `not live ones, and options do not trade outside the session. The order can still be sent — ` +
      `the broker will hold it for the open (${nextOpenDay(now)}) or reject it under its own rules — ` +
      `but nothing will fill until then, and the market may open somewhere else entirely.`
  };
}

/**
 * A price that cannot be relied on WHILE THE MARKET IS TRADING.
 *
 * Silent outside the session, because outside the session `sessionWarning`
 * has already said the only true thing there is to say. Age is a defect at
 * 2 PM and the expected state at 1 AM, and one message cannot serve both.
 */
export function priceWarning(
  ticker: string,
  spot: { price?: number; trusted?: boolean; reason?: string | null; asOf?: number | null; source?: string | null } | null,
  now: Date = new Date()
): OrderWarning | null {
  if (!spot || !(Number(spot.price) > 0)) {
    return {
      code: "price_missing",
      severity: "serious",
      title: `No price for ${ticker}.`,
      detail:
        `The feed returned nothing usable for ${ticker}, so the strikes, the credit and the maximum ` +
        `loss on this ticket cannot be checked against the market at all.`
    };
  }
  if (spot.trusted) return null;
  if (sessionPhase(now) !== "open") return null;

  const at = clock(spot.asOf ?? null);
  const ageMin = spot.asOf ? Math.round((now.getTime() - spot.asOf) / 60000) : null;

  // Staleness during the session is the one case worth timing precisely: it
  // says how far behind the number is, rather than that it crossed a
  // threshold somebody chose.
  if (ageMin !== null && ageMin * 60000 > MAX_PRICE_AGE_MS) {
    return {
      code: "price_stale",
      severity: "serious",
      title: `${ticker} has not printed for ${ageMin} minutes.`,
      detail:
        `The market is open, so a gap this long means the feed is behind or the name is barely ` +
        `trading. This ticket is priced off ${money(Number(spot.price))}${at ? ` from ${at}` : ""}, and the ` +
        `stock may be somewhere else now.`
    };
  }

  return {
    code: "price_untrusted",
    severity: "serious",
    title: `${ticker}'s price can't be relied on.`,
    detail: `${spot.reason || "The sources for this price do not agree."} The ticket is built on ` +
      `${money(Number(spot.price))}${at ? ` from ${at}` : ""}.`
  };
}

/** The stock has left the setup behind since it was built. */
export function driftWarning(
  ticker: string,
  spot: number,
  expectedSpot: number,
  maxDriftPct: number
): OrderWarning | null {
  if (!(expectedSpot > 0) || !(spot > 0)) return null;
  const drift = Math.abs(spot - expectedSpot) / expectedSpot;
  if (drift <= maxDriftPct) return null;
  return {
    code: "spot_drift",
    severity: "serious",
    title: `${ticker} has moved ${(drift * 100).toFixed(1)}% since this was built.`,
    detail:
      `It was ${money(expectedSpot)} then and is ${money(spot)} now. The strikes, the credit and the ` +
      `distance to the short leg on this ticket were all chosen against the older number.`
  };
}

/** A short leg the stock has already gone through. */
export function itmShortWarning(
  ticker: string,
  legs: Array<{ side?: string; occ?: { type?: string; strike?: number } }>,
  spot: number
): OrderWarning | null {
  const through = legs.find(
    (l) => l.side === "sell" && l.occ &&
      (l.occ.type === "C" ? Number(l.occ.strike) <= spot : Number(l.occ.strike) >= spot)
  );
  if (!through) return null;
  const kind = through.occ!.type === "C" ? "call" : "put";
  return {
    code: "itm_short",
    severity: "serious",
    title: `The short ${kind} at ${money(Number(through.occ!.strike))} is already in the money.`,
    detail:
      `${ticker} is at ${money(spot)}, so this is not an out-of-the-money credit position — it is one ` +
      `that starts assignable, and the odds and the maximum loss are not what an out-of-the-money ` +
      `structure's are.`
  };
}

/** A contract a corporate action changed. */
export function adjustedWarning(
  symbol: string,
  underlying: string
): OrderWarning {
  return {
    code: "adjusted_contract",
    severity: "serious",
    title: `${symbol} is an adjusted contract.`,
    detail:
      `A corporate action changed what it delivers, so it is no longer 100 shares of ${underlying} at ` +
      `the strike. Every figure on this ticket — the width, the credit, the maximum loss — is ` +
      `computed as if it were, and none of them is right for this contract.`
  };
}

/** A short call with fewer shares behind it than contracts sold. */
export function coverWarning(
  accountName: string,
  ticker: string,
  held: number,
  contracts: number
): OrderWarning | null {
  const need = contracts * 100;
  if (held >= need) return null;
  return {
    code: "short_call_uncovered",
    severity: "serious",
    title:
      held === 0
        ? `This call is not covered.`
        : `Only ${Math.floor(held / 100)} of ${contracts} calls are covered.`,
    detail:
      `${accountName} holds ${held} shares of ${ticker}; ${contracts} contract${contracts > 1 ? "s" : ""} ` +
      `need${contracts > 1 ? "" : "s"} ${need}. The uncovered part has no ceiling on its loss, and the ` +
      `broker may reject it depending on what this account is approved for.`
  };
}

// Which of a list the user has not already seen and accepted.
export const unacknowledged = (warnings: OrderWarning[], accepted: string[] | boolean | undefined) => {
  if (accepted === true) return [];
  const set = new Set(Array.isArray(accepted) ? accepted : []);
  return warnings.filter((w) => !set.has(w.code));
};
