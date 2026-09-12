// The chart's points, from the stored daily series.
//
// `account_equity_daily` holds one row per session day per account, written by
// the equityHistory function: the broker's own end-of-day account value, and
// the strategy's cumulative result recalculated from the trades and the lots
// with a real closing price behind every held share on every day.
//
// This module does no arithmetic on money beyond rebasing a window. It picks
// which stored column the selected view reads, and it decides where the line
// legitimately starts. Everything else was settled server-side.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const day = (v) => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Which stored column a view and mode read.
 *
 *   performance + whole    -> `performance`  option legs closed + shares sold +
 *                            the mark on the shares and the option legs on the
 *                            book that day
 *   performance + premium  -> `premium_cum`  the option legs alone
 *   value                  -> `equity`       the broker's account value
 *
 * Named rather than inlined because getting it wrong puts one view's number
 * under the other view's label, which is the defect this whole switch exists
 * to fix.
 */
export function seriesColumn(view, mode) {
  if (mode === "value") return "equity";
  return view === "premium" ? "premium_cum" : "performance";
}

/**
 * Points for the chart, oldest first.
 *
 * @param rows  stored rows from equityHistory, any order
 * @param view  "whole" | "premium"
 * @param mode  "performance" (cumulative result) | "value" (account value)
 * @param range { from, to } — the page's date filter, either side optional
 *
 * Returns `{ points, start, end, change, rebased, mode, column, missing }`.
 *
 * `change` is `end - start` across the rendered window. On the performance line
 * that is NOT the same as `end`, because `start` is the first day's value after
 * rebasing rather than zero — a window whose first day already moved carries
 * that move in `end` and not in `change`. It is rendered only in value mode
 * today; documented here so the next caller does not read it as "what this
 * window made".
 *
 * REBASING. A date range asks "what did this do between these dates", so the
 * window is measured from the value on the last day BEFORE it — not from zero,
 * which would credit the window with everything that came before it, and not
 * from the window's own first day, which would silently discard that day's
 * move. Only the performance line rebases; an account value of $151,000 is
 * $151,000 whatever window is being read, and subtracting a baseline from it
 * would produce a dollar figure that is not an account balance.
 *
 * A day the series could not value is a GAP, not a zero: `value` is null and
 * the line breaks there rather than diving to the axis. `missing` counts them
 * so the screen can say how many and why.
 */
export function dailySeries(rows, view, mode = "performance", range = {}) {
  const column = seriesColumn(view, mode);
  const all = (rows || [])
    .map((r) => ({ date: day(r?.day), raw: num(r?.[column]), unpriced: r?.unpriced || [] }))
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!all.length) {
    return { points: [], start: null, end: null, change: null, rebased: false, mode, column, missing: 0 };
  }

  const from = day(range?.from);
  const to = day(range?.to);

  // The last valued day strictly before the window. Only used for rebasing, so
  // a window whose baseline cannot be established simply does not rebase —
  // it never guesses one.
  let baseline = null;
  if (from && mode !== "value") {
    for (const p of all) {
      if (p.date >= from) break;
      if (p.raw !== null) baseline = p.raw;
    }
  }

  const windowed = all.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  if (!windowed.length) {
    return { points: [], start: null, end: null, change: null, rebased: false, mode, column, missing: 0 };
  }

  const base = baseline === null ? 0 : baseline;
  const points = windowed.map((p) => ({
    date: p.date,
    value: p.raw === null ? null : mode === "value" ? p.raw : p.raw - base,
    unpriced: p.unpriced
  }));

  const valued = points.filter((p) => p.value !== null);
  const start = valued.length ? valued[0].value : null;
  const end = valued.length ? valued[valued.length - 1].value : null;

  return {
    points,
    start,
    end,
    // What the window moved by. For the account-value line that is a dollar
    // change in the balance; for the performance line the line already starts
    // at its baseline, so `end` and `change` coincide unless the first stored
    // day itself carried a value.
    change: start === null || end === null ? null : end - start,
    rebased: baseline !== null,
    mode,
    column,
    missing: points.length - valued.length,
    // Every ticker that cost the series a day, named once.
    unpricedTickers: [
      ...new Set(points.filter((p) => p.value === null).flatMap((p) => p.unpriced || []))
    ].sort()
  };
}

/**
 * The fallback line, for the one case the stored series cannot answer.
 *
 * A strategy tab asks "how are my covered calls doing", and the daily marks
 * cannot be split that way: a share lot is held by the account, not by a
 * strategy, and attributing today's move on 300 WMT shares to covered calls
 * rather than to the puts that bought them would be an invention. So under a
 * strategy filter the chart falls back to what CAN be proven for that
 * strategy — the money it booked, in the order it booked it.
 *
 * This is the old whole-page curve, with the dashed step to today's mark
 * REMOVED rather than kept for the filtered case. That step is what the owner
 * called a pole, and a shape that is wrong on the main chart is not made right
 * by moving it to a smaller one.
 */
export function bookedCurve(trades, view) {
  const rows = (trades || [])
    .filter((t) => t && t.close_date)
    .slice()
    .sort((a, b) => String(a.close_date).localeCompare(String(b.close_date)));

  const valueOf = (t) =>
    view === "premium"
      ? (num(t.premium_pl) || 0) + (num(t.early_close_pl) || 0)
      : num(t.realized_pl) || 0;

  let cum = 0;
  const byDay = new Map();
  for (const t of rows) {
    cum += valueOf(t);
    // One point per day, not one per trade. Three closes on a Tuesday are one
    // Tuesday, and drawing them as three points on the same x makes a vertical
    // segment out of an ordinary day.
    byDay.set(t.close_date, cum);
  }

  const points = [...byDay.entries()].map(([date, value]) => ({ date, value, unpriced: [] }));
  return {
    points,
    start: points.length ? points[0].value : null,
    end: points.length ? points[points.length - 1].value : null,
    change: points.length ? points[points.length - 1].value : null,
    rebased: false,
    mode: "booked",
    column: null,
    missing: 0,
    unpricedTickers: []
  };
}
