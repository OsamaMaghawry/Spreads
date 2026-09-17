// Where a windowed whole-view figure came from, in the four parts the stored
// series is built from.
//
// The owner, on Alton's week of 7-11 September, looking at "+$2,455.91":
//
//   *"The 2.4k+ is not justifiable in anywhere! Nothing to show where it came
//   from."*
//
// He was right. The headline said "$785.91 booked by trades that closed, and
// $1,670.00 of change in what was still open" and stopped there. Where did
// $1,670 of change in the open book come from, on an account whose open panel
// shows -$468 of shares and +$131 of option legs? Nothing on the page could
// say, because nothing on the page read the two mark columns at the window's
// two ends.
//
// `account_equity_daily` stores, per session day, exactly four columns whose
// sum is `performance`:
//
//   premium_cum     option legs closed, cumulative              (money)
//   shares_booked   shares sold, cumulative                     (money)
//   shares_open     the mark on shares held at that day's close (a mark)
//   options_open    the mark on option legs open at that close  (a mark)
//
// Difference each between the last close BEFORE the window and the last close
// INSIDE it and the four differences add to the headline to the cent. On the
// owner's week:
//
//   option legs closed         -757.00 -> -1230.00     -473.00
//   shares sold                -817.00 ->   441.91   +1258.91
//   shares held (mark)            0.00 ->  -206.00    -206.00
//   option legs open (mark)   -1831.00 ->    45.00   +1876.00
//                                                    --------
//                                                    2455.91
//
// And the line that answers his question is the last one: at the Friday close
// before the week his open option legs were marked $1,831 under water; by the
// next Friday those legs had closed (their result landing on the first line)
// and the mark they had been carrying came off. That is what "change in what
// was still open" meant, and it is not visible from any panel of what is open
// TODAY.
//
// Same four parts, same rule, as the weekly digest's "How the week adds up"
// (`weeklyDigestEmail.weekParts`): rounded to the cent first, and shown only
// when they reconcile to the headline exactly. Two surfaces, one arithmetic.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const day = (v) => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const round2 = (v) => Math.round(v * 100) / 100;

const COLUMNS = ["premium_cum", "shares_booked", "shares_open", "options_open", "performance"];

// A row every part of which can be read. A row with any of the five missing
// cannot anchor either end of the window: a difference against a null is not
// a number, and substituting zero would print a part that is not there.
const complete = (r) => COLUMNS.every((c) => num(r?.[c]) !== null);

/**
 * @param rows   stored rows from equityHistory, any order
 * @param range  { from, to } -- `from` is required; without a window there is
 *               no "before" to measure from and the page shows today's mark
 * @returns null when the parts cannot be stated, else
 *   {
 *     from, to,                        the two closes differenced
 *     premium, sharesBooked,           money: change in the booked columns
 *     sharesMark: { start, end, change },   a mark, with both ends
 *     optionsMark: { start, end, change },  a mark, with both ends
 *     total                            the headline, reached a second way
 *   }
 */
export function windowParts(rows, range = {}) {
  const from = day(range?.from);
  if (!from) return null;
  const to = day(range?.to);

  const all = (rows || [])
    .map((r) => ({ ...r, date: day(r?.day) }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // The last complete close strictly before the window, and the last
  // complete close inside it.
  let open = null;
  let close = null;
  for (const r of all) {
    if (r.date < from) {
      if (complete(r)) open = r;
    } else if (!to || r.date <= to) {
      if (complete(r)) close = r;
    }
  }
  // No close before the window means the window is the account's beginning --
  // or the earlier days could not be valued. Either way there are no two ends
  // to difference, and the chart's own `baselineKnown` already governs whether
  // a headline is printed at all. Nothing is invented here.
  if (!open || !close) return null;

  const d = (c) => round2(num(close[c]) - num(open[c]));
  const premium = d("premium_cum");
  const sharesBooked = d("shares_booked");
  const sharesMark = { start: round2(num(open.shares_open)), end: round2(num(close.shares_open)), change: d("shares_open") };
  const optionsMark = { start: round2(num(open.options_open)), end: round2(num(close.options_open)), change: d("options_open") };
  const total = d("performance");

  // Exact at the cent, like the email. Each stored column is rounded on its
  // own and `performance` from the unrounded sum, so a cent can go astray per
  // row; four numbers that visibly do not add to the total above them, in the
  // one panel whose whole promise is that they do, is worse than no panel.
  const sum = round2(premium + sharesBooked + sharesMark.change + optionsMark.change);
  if (sum !== total) return null;

  return { from: open.date, to: close.date, premium, sharesBooked, sharesMark, optionsMark, total };
}
