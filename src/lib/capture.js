// Credit capture: what share of the premium sold was kept, and how the trades
// behind it add up to the account's booked result.
//
// The owner, 9 Oct, on the loss row reading -$8,067: "not accurate or at
// least not supported and doesn't match the overall performance and the
// profit too". Every dollar of it matched the broker's fills. What was wrong
// was where those dollars were filed and that nothing on the page showed them:
//
//   - $5,500 of it was spreads bought back in the last half hour of the day
//     they expired, deep in the money (WMT after earnings, ARKK's rally, both
//     21 Aug). That is how an in-the-money position ends, not an early exit,
//     and it sat under "early exits" while "held to expiry" read 100%.
//   - Most of the rest was TSLA calls bought back on a rally whose gains were
//     booked elsewhere: a call bought the same day and shares sold into it.
//
// So: a buyback on expiry day counts as held to expiry; every bucket carries
// its trades so the figure can be checked line by line; and `reconcile` adds
// the table to the booked total the Returns card shows.

// The option result alone: premium less what closing it cost. Shares
// delivered on assignment are left out — fold them in and a put assigned into
// stock that recovered captures well over 100%, a ratio past its own maximum.
// They are added back, visibly, in `reconcile`.
export const optionPL = (t) => (Number(t.premium_pl) || 0) + (Number(t.early_close_pl) || 0);

export const creditOf = (t) => (Number(t.net_credit) || 0) * (Number(t.qty) || 0) * 100;

const day = (v) => String(v || "").slice(0, 10);

// Bought back before the session it expired in. Expired, assigned and
// exercised positions were carried to the end, and so was one bought back on
// expiry day: closing in the final hour to avoid assignment is the expiry
// outcome, settled in cash.
export const exitedEarly = (t) =>
  t.close_reason === "closed" && Boolean(t.expiry) && day(t.close_date) < day(t.expiry);

export const BUCKETS = [
  { label: "Loss (< 0%)", min: -Infinity, max: 0 },
  { label: "0 – 50%", min: 0, max: 0.5 },
  { label: "50 – 70%", min: 0.5, max: 0.7 },
  { label: "70 – 80%", min: 0.7, max: 0.8 },
  { label: "80 – 90%", min: 0.8, max: 0.9 },
  { label: "90 – 100%", min: 0.9, max: Infinity }
];

export function aggregate(rows) {
  const credit = rows.reduce((a, r) => a + r.credit, 0);
  const pl = rows.reduce((a, r) => a + r.pl, 0);
  return {
    trades: rows.length,
    credit,
    pl,
    weighted: credit > 0 ? pl / credit : null,
    avg: rows.length ? rows.reduce((a, r) => a + r.capture, 0) / rows.length : null
  };
}

export function captureBreakdown(trades) {
  const sold = trades.filter((t) => creditOf(t) > 0);
  const row = (t) => {
    const credit = creditOf(t);
    const pl = optionPL(t);
    return { trade: t, credit, pl, capture: pl / credit };
  };
  const early = sold.filter(exitedEarly).map(row);
  const held = sold.filter((t) => !exitedEarly(t)).map(row);

  const buckets = BUCKETS.map((b) => {
    const rows = early
      .filter((r) => r.capture >= b.min && r.capture < b.max)
      .sort((a, b2) => a.pl - b2.pl);
    return { ...b, rows, ...aggregate(rows) };
  });

  const e = aggregate(early);
  const x = aggregate(held);
  const soldSet = new Set(sold);
  const reconcile = {
    early: e.pl,
    held: x.pl,
    // Options bought outright, or structures opened for a net debit: no credit
    // to capture, so they are outside the ratio but inside the money.
    bought: trades.filter((t) => !soldSet.has(t)).reduce((a, t) => a + optionPL(t), 0),
    shares: trades.reduce((a, t) => a + (Number(t.stock_pl) || 0), 0),
    total: trades.reduce((a, t) => a + (Number(t.realized_pl) || 0), 0)
  };
  // A row whose stored total is not its own parts would make the line add up
  // to something other than what it prints. Then it is not shown at all.
  reconcile.adds =
    Math.abs(reconcile.early + reconcile.held + reconcile.bought + reconcile.shares - reconcile.total) < 0.01;

  return { early: e, held: x, all: aggregate([...early, ...held]), buckets, reconcile };
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
