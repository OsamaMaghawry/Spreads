// How each closed trade ended, and what each ending made or lost.
//
// Replaces the credit-capture table. The owner, 9 Oct: "I have no idea what
// it is. I have no idea what this table should benefit me." It measured one
// slice of the account (positions bought back early), so it never matched the
// account's total, and its -$8,067 loss row read as a figure nobody could
// place. Every trade lands in exactly one row here, so the rows add up to the
// booked total the Returns card shows.

const day = (v) => String(v || "").slice(0, 10);

// Bought outright, or opened for a net debit: there was no premium to keep,
// however it ended.
const bought = (t) => (Number(t.net_credit) || 0) * (Number(t.qty) || 0) <= 0;

export const ENDINGS = [
  { key: "expired", label: "Expired worthless" },
  { key: "assigned", label: "Assigned" },
  // Closed in the session it expired in. In the money at the bell, this is
  // how the expiry loss is taken without the assignment; a separate row
  // because folding it into "earlier" filed WMT's and ARKK's max losses on
  // 21 Aug as early exits.
  { key: "expiryDay", label: "Bought back on expiry day" },
  { key: "early", label: "Bought back earlier" },
  { key: "bought", label: "Options you bought" },
  { key: "other", label: "Other" }
];

export function endingOf(t) {
  if (bought(t)) return "bought";
  if (t.close_reason === "expired") return "expired";
  if (t.close_reason === "assigned" || t.close_reason === "exercised") return "assigned";
  if (t.close_reason === "closed") {
    return t.expiry && day(t.close_date) >= day(t.expiry) ? "expiryDay" : "early";
  }
  return "other";
}

// view "premium" counts the option legs alone, like every other figure on the
// page under that switch; "whole" counts what the trade booked, shares
// included.
export const resultOf = (view) =>
  view === "premium"
    ? (t) => (Number(t.premium_pl) || 0) + (Number(t.early_close_pl) || 0)
    : (t) => Number(t.realized_pl) || 0;

export function tradeEndings(trades, view = "whole") {
  const pl = resultOf(view);
  const rows = ENDINGS.map((e) => {
    const list = trades
      .filter((t) => endingOf(t) === e.key)
      .map((t) => ({ trade: t, pl: pl(t) }))
      .sort((a, b) => a.pl - b.pl);
    return {
      ...e,
      trades: list,
      count: list.length,
      pl: list.reduce((a, r) => a + r.pl, 0),
      losers: list.filter((r) => r.pl < 0).length
    };
  }).filter((r) => r.count > 0);
  return {
    rows,
    count: trades.length,
    total: rows.reduce((a, r) => a + r.pl, 0)
  };
}

// "ARKK 82/85 C" — enough to find the trade in the history.
export function tradeLabel(t) {
  const right = /\d{6}([CP])\d{8}$/.exec(t.short_symbol || t.long_symbol || "")?.[1] || "";
  const strikes = [t.short_symbol ? t.short_strike : null, t.long_symbol ? t.long_strike : null]
    .filter((s) => s !== null && s !== undefined && s !== "")
    .map((s) => Number(s))
    .join("/");
  return [t.ticker, strikes, right].filter(Boolean).join(" ");
}
