// Recalculating the portfolio, day by day, from the beginning.
//
// THE DEFECT THIS EXISTS FOR. The Analysis chart accumulated closed trades in
// the order they closed and then bolted ONE step onto the end for the shares
// still held. The owner, 10 Sep: *"it became like a pole… from one thousand
// something to twelve thousand. We already missed this. We should fix it. Not
// just put the latest number and ignore the rest of what happened in the
// portfolio — we should recalculate that portfolio since the beginning."*
//
// He is right about the cause as well as the shape. The old code's own comment
// said a mark-to-market path "would need a historical price per lot per day,
// which is a data source this does not have". That was wrong: Alpaca serves
// daily bars for any symbol over any range. The price history was always one
// request away, and because nobody fetched it, eleven thousand dollars of
// share appreciation appeared as a single vertical line dated today.
//
// WHAT THIS COMPUTES. For every session day, from the first thing that ever
// happened on the account to today:
//
//   premium_cum(D)   option legs closed on or before D — credits taken and
//                    debits paid, signed
//   shares_booked(D) the result of every share lot already SOLD by D
//   shares_open(D)   the mark on every lot still HELD on D, at that day's
//                    closing price
//   options_open(D)  the mark on every option leg still OPEN on D, likewise
//   performance(D)   the FOUR added together — the whole-view line
//
// This list said "the three added together" after `options_open` was added,
// and that stale line was quoted on screen: EquityCurveChart's subtitle
// described the line as option legs, shares sold and the mark on shares held,
// omitting the open option legs. A reader comparing this line against the
// page's headline needs both texts to be complete, because the difference
// between the two IS the open book.
//
// BUILT FROM LOT DATES, NOT FROM `realized_pl`, and that is the load-bearing
// decision. `realized_pl` on a trade record is premium_pl + early_close_pl +
// stock_pl, and the share half is written back onto SOME option's row —
// normally the one that DISPOSED of the lot, and for a defined-risk spread
// exercising its own long, the one that ACQUIRED it (`ownersOf`,
// tradeReconstruction.ts:996). Either way that row's close_date is not the day
// the shares moved, so accumulating realized_pl by close_date books a share
// result on a day the lot was still being marked as held: the same dollars
// counted twice, every day in between. The owner can sit at either end, so the
// error runs in both directions. Reading the lots directly cannot make that
// mistake, because a lot is either open or disposed on any given day and never
// both.
//
// The identity that keeps this honest at the right-hand edge:
//
//   premium_cum(today) + shares_booked(today) === stats.totalPL + orphanedStockPL
//
// `orphanedStockPL` is not a rounding term. tradeReconstruction.ts:1030 adds a
// lot whose owning option cannot be resolved to `orphaned` and to NO trade row,
// so it reaches `stock_pl` nowhere while this walk counts it. Analysis has to
// show that difference rather than let two numbers disagree in silence.
//
// The identity is asserted in dailyPortfolio.test.ts against `computeStats` and
// `openBook` THEMSELVES. The first version of that test restated this file's
// own formula and checked this file computed it, which proved nothing at all.

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A corporate action can leave the ledger holding "TSLA1" while the price feed
// carries "TSLA". Same rule, same fallback, as openBook.js and occ.ts — a
// numeric ticker must not strip to the empty string and collide with every
// other numeric ticker.
export const baseTicker = (t: unknown): string => {
  const root = String(t || "").toUpperCase();
  return root.replace(/\d+$/, "") || root;
};

// Dollars, to the cent.
//
// Every figure this file emits is a product of a price and a quantity summed
// over a book, and binary floating point does not represent $4.35 exactly:
// `1 * 100 * 4.35` is 434.99999999999994, so a leg sitting exactly at
// break-even emitted -5.68e-14 and the owner's five-leg book totalled
// -389.9999999999998. Both would reach the screen -- the first as "-$0.00",
// which is a statement about a position, and the second as a figure that
// disagrees with the broker's own by a hair for no reason a reader could ever
// discover. Rounded at emit rather than at every intermediate, so the
// arithmetic itself keeps full precision.
// `0`, never `-0`. Rounding a tiny negative residue gives negative zero, which
// formats as "-$0.00" -- a statement that a position lost money. The
// reconstruction has carried a `noNegZero` for the same reason since the P/L
// work; this is that rule, here.
const cents = (v: number | null): number | null => {
  if (v === null) return null;
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};

const day = (v: unknown): string | null => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// ---------------------------------------------------------------------------
// Reading the broker's two feeds
// ---------------------------------------------------------------------------

export interface PortfolioHistory {
  timestamp?: number[];
  equity?: (number | null)[];
  profit_loss?: (number | null)[];
  base_value?: number | null;
}

// The session date a daily entry belongs to.
//
// THE DEFECT THIS EXISTS FOR, and it ran in production for as long as the table
// has existed. This function used to take the UTC calendar date of the stamp,
// under a comment asserting that both of Alpaca's stampings "fall on the same
// UTC calendar day as the session". Neither of them is what the feed sends.
//
// READ FROM THE FEED, not assumed — see the `probe` path in equityHistory,
// which exists because the first version of this fix was argued from the
// stored dates, and the stored dates are this function's own output. What
// comes back for a paper account, 252 entries, every one of the same shape:
//
//   t=1789171200   2026-09-12T00:00:00Z   New York: 9/11/26, 8:00 PM
//
// MIDNIGHT UTC OF THE DAY AFTER the session, which is 20:00 Eastern ON the
// session day. So the UTC date is always one day past the session, and every
// row this table has ever written was labelled one session late.
//
// It is visible in the stored data without reference to any broker. On staging,
// 204 rows carried days running Tuesday to Saturday and never a Monday: Friday's
// session stamped Saturday, Monday's stamped Tuesday, all the way along. The
// week of 7 September proves the shift end to end — Labor Day is a holiday, so
// there is no session to stamp on Tuesday the 8th, and the table has no row that
// day while it has one on Saturday the 12th.
//
// What it cost the reader: a Monday-to-Friday window measured the previous
// Friday through Thursday, so the weekly email and the Analysis chart both drew
// a week shifted one session at BOTH ends. The owner found it from the figures
// alone — *"the performance is contradicting. How the account lost 500+ in an
// area and overall 600+"* — which is exactly the shape of an interval whose two
// endpoints come from different weeks.
//
// THE RULE. New York, not UTC, decides the date, and an entry stamped before the
// opening bell belongs to the session that has already ENDED rather than to the
// one that has not begun. That reads all three stampings without having to know
// which is in force: 20:00 Eastern, which is what the feed actually sends (hour
// 20, kept); 16:00 Eastern at the close (hour 16, kept); and midnight Eastern
// after the session (hour 0, pushed back to the session that closed). It also
// survives the daylight-saving change untouched — midnight UTC is 20:00 Eastern
// in summer and 19:00 in winter, both a long way clear of the bell.
//
// Seconds, not milliseconds — multiplying is the whole conversion, and getting
// it backwards puts every point in 1970, which is why this is a named function
// with a test rather than an inline expression.
// Built on first use, not at import. A runtime without time-zone data throws
// from the constructor, and at module scope that takes down the whole function
// bundle rather than one date -- a much larger failure than the thing it is
// trying to compute. Every runtime this ships to (Deno Deploy, and Node 22 for
// the tests) carries full ICU, so this is insurance about the blast radius, not
// a doubt about the platform.
let eastern: Intl.DateTimeFormat | null = null;

// The wall clock in New York, which is the only clock the US session runs on.
// `formatToParts` rather than parsing a formatted string: the layout of a
// formatted date is a locale's business and can change, the part names cannot.
function easternWallClock(d: Date) {
  eastern ||= new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const parts: Record<string, string> = {};
  for (const p of eastern.formatToParts(d)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // `h23` still emits "24" for midnight in some implementations.
    hour: Number(parts.hour) % 24
  };
}

export function sessionDay(unixSeconds: number): string | null {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const { year, month, day, hour } = easternWallClock(d);
  // The bell is 09:30. Anything before nine in the morning in New York is an
  // end-of-session stamp that has rolled past midnight, not the start of a
  // session that has yet to open.
  const at = Date.UTC(year, month - 1, day) - (hour < 9 ? 86400000 : 0);
  return new Date(at).toISOString().slice(0, 10);
}

// A weekday, by the calendar. Not a trading calendar — it knows nothing about
// holidays — and it is not used to decide what a session is. It is a tripwire:
// see `equityDays`.
const isWeekend = (isoDay: string): boolean => {
  const dow = new Date(isoDay + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
};

/**
 * The broker's own end-of-day account value, per day, oldest first.
 *
 * Three things are dropped, each for its own reason:
 *
 *   - An entry with no usable equity. A gap in the broker's series is a gap in
 *     ours; writing a zero would draw the account falling to nothing and
 *     recovering, which is a statement about the account rather than about the
 *     data.
 *   - Every entry BEFORE the account first held value. An account exists for
 *     some days before it is funded, and those zeros would start the chart at
 *     the bottom and render the first deposit as an infinite gain.
 *   - Duplicate days, last wins: a re-read of a session that has since settled
 *     is more correct than the first read of it.
 *   - Any entry that maps onto a Saturday or a Sunday. The US market does not
 *     open on those days, so such an entry is proof that the stamping this
 *     reads has changed under us rather than evidence about the account, and a
 *     session day is the one thing in this file that everything else is keyed
 *     by. This is insurance and nothing more: with `sessionDay` correct it
 *     never fires, and it is here because the same class of error — a stamp
 *     read as a date it is not — silently mislabelled every row in the table
 *     for as long as the table existed. `skippedWeekend` counts them, so a
 *     rebuild that starts dropping days says so instead of quietly shrinking.
 *
 *     The one legitimate weekend entry this refuses is a crypto position,
 *     which does trade at weekends and which Alpaca reports in the same
 *     portfolio history. Nothing in this product touches crypto — the
 *     scanner, the reconstruction and the risk model are options and US
 *     equities throughout — so the trade is worth making, but this is the
 *     first thing to revisit if that ever changes.
 */
export function equityDays(history: PortfolioHistory | null) {
  const stamps = Array.isArray(history?.timestamp) ? history!.timestamp! : [];
  const equity = Array.isArray(history?.equity) ? history!.equity! : [];
  const pl = Array.isArray(history?.profit_loss) ? history!.profit_loss! : [];
  const base = num(history?.base_value);

  const byDay = new Map<string, { day: string; equity: number; profit_loss: number | null; base_value: number | null }>();
  let funded = false;
  let skippedWeekend = 0;

  for (let i = 0; i < stamps.length; i++) {
    const d = sessionDay(Number(stamps[i]));
    if (!d) continue;
    const value = num(equity[i]);
    if (value === null) continue;
    // Counted only for an entry that CARRIED something, so the tripwire reports
    // data landing on a closed day rather than an empty slot landing there.
    if (isWeekend(d)) { skippedWeekend++; continue; }
    if (!funded) {
      if (value === 0) continue;
      funded = true;
    }
    byDay.set(d, { day: d, equity: value, profit_loss: num(pl[i]), base_value: base });
  }

  return {
    days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    skippedWeekend
  };
}

/**
 * Closing prices per ticker per day, from Alpaca's multi-symbol bars response.
 *
 * Keyed by BASE ticker, so a lot recorded as "TSLA1" finds the "TSLA" series
 * the feed actually returns.
 */
export function closesByDay(bars: any): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const map = bars?.bars || {};
  for (const symbol of Object.keys(map)) {
    const key = baseTicker(symbol);
    const series = (out[key] = out[key] || {});
    for (const bar of map[symbol] || []) {
      const d = day(bar?.t);
      const close = num(bar?.c);
      if (!d || close === null || close <= 0) continue;
      series[d] = close;
    }
  }
  return out;
}

// Split factors a raw price series can step by, and the tolerance for spotting
// one. Raw prices are NOT split-adjusted — deliberately, because the recorded
// `acquired_price` is not either — so a 2-for-1 split appears as the price
// halving overnight, and marking a 100-share lot at $320 basis against a $160
// close would print a $16,000 loss that never happened.
//
// Detected by RATIO NEAR A SPLIT FACTOR rather than by "a big move", and that
// precision is the point: a stock genuinely falling 40% on earnings is a real
// loss the chart must show, while a ratio sitting inside 2% of exactly one half
// is a corporate action to a near certainty. Common forward and reverse
// factors, both directions.
// 5:4 and 5:3 are deliberately ABSENT. Their reciprocals are 0.80 and 0.667 —
// an ordinary 20% or 40% down day — and a guard that withholds the chart every
// time a stock has a bad earnings print is worse than the defect it prevents.
// The factors kept are the ones whose reciprocal is not a plausible single-day
// move for a listed equity.
const SPLIT_FACTORS = [2, 3, 4, 5, 6, 7, 8, 10, 20, 3 / 2, 5 / 2];
// One percent, not two. The band around 3:2 is then a drop of 32.7% to 34.0%,
// which no ordinary session produces by accident.
const SPLIT_TOLERANCE = 0.01;

const looksLikeSplit = (prev: number, next: number): boolean => {
  if (!(prev > 0) || !(next > 0)) return false;
  const ratio = next / prev;
  return SPLIT_FACTORS.some(
    (f) =>
      Math.abs(ratio - f) / f <= SPLIT_TOLERANCE ||
      Math.abs(ratio - 1 / f) * f <= SPLIT_TOLERANCE
  );
};

/**
 * Tickers whose price series cannot be trusted against a recorded cost basis,
 * and the day each becomes untrustworthy.
 *
 * Two independent problems, both of which the first version priced straight
 * through:
 *
 *   COLLISION — two broker symbols stripping to one base ticker, "TSLA" and
 *   "TSLA1" in the same payload. `closesByDay` merges them and the last write
 *   wins. `openBook.js` already refuses this case outright — a $375 mark
 *   silently replaced by a $10 adjusted-contract mark once published -$31,000
 *   as a COMPLETE total — and its comment is the rule: a collision is not a
 *   mark, it is a question. The chart must refuse for the reasons the headline
 *   refuses, or the same page shows "—" in the panel and a confident line above
 *   it.
 *
 *   SPLIT — see above. Untrustworthy from the split date FORWARD only: every
 *   day before it is priced on the same footing as the basis and is fine.
 */
export function priceProblems(bars: any): {
  collided: string[];
  splitFrom: Record<string, string>;
} {
  const map = bars?.bars || {};
  const symbolsPerTicker: Record<string, number> = {};
  for (const symbol of Object.keys(map)) {
    const key = baseTicker(symbol);
    symbolsPerTicker[key] = (symbolsPerTicker[key] || 0) + 1;
  }
  const collided = Object.keys(symbolsPerTicker).filter((k) => symbolsPerTicker[k] > 1).sort();

  const splitFrom: Record<string, string> = {};
  const closes = closesByDay(bars);
  for (const ticker of Object.keys(closes)) {
    const days = Object.keys(closes[ticker]).sort();
    for (let i = 1; i < days.length; i++) {
      const prev = closes[ticker][days[i - 1]];
      const next = closes[ticker][days[i]];
      if (looksLikeSplit(prev, next)) {
        // The earliest one wins: after the first unaccounted corporate action
        // nothing downstream can be reconciled with the recorded basis anyway.
        if (!splitFrom[ticker]) splitFrom[ticker] = days[i];
      }
    }
  }
  return { collided, splitFrom };
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

export interface DailyRow {
  day: string;
  premium_cum: number;
  shares_booked: number;
  /** Mark on lots still held that day, or null when any of them has no price. */
  shares_open: number | null;
  shares_cost: number;
  shares_value: number | null;
  /** premium_cum + shares_booked + shares_open + options_open, or null when any is. */
  performance: number | null;
  /** premium_cum + shares_booked, or null when a sold lot has no result. */
  realized_cum: number | null;
  /** Mark on OPTION legs still open that day. Null when one cannot be valued. */
  options_open: number | null;
  /** Tickers whose contribution to that day could not be established. */
  unpriced: string[];
}

interface Trade {
  close_date?: string | null;
  premium_pl?: number | string | null;
  early_close_pl?: number | string | null;
}

/**
 * An option position still open, for the days it has been open.
 *
 * The owner, 11 Sep: *"make sure the analysis has the open positions too, not
 * only the closed ones."* `trades` above are closed by construction and `lots`
 * are shares, so an option still open appeared in neither, and the line called
 * itself the whole strategy while containing none of them.
 *
 * `costBasis` is SIGNED as the broker reports it: positive for a long (paid),
 * negative for a short (credit taken). So `qty * multiplier * close - costBasis`
 * is the mark for both sides with no special case.
 */
interface OpenOptionLeg {
  symbol?: string | null;
  /** Signed: negative is short. */
  qty?: number | string | null;
  costBasis?: number | string | null;
  /** The day the position was opened. Without one it cannot be placed in time. */
  from?: string | null;
  /** Shares per contract. Anything but 100 means a corporate action. */
  multiplier?: number | string | null;
}

interface Lot {
  ticker?: string | null;
  qty?: number | string | null;
  acquired_date?: string | null;
  acquired_price?: number | string | null;
  disposed_date?: string | null;
  disposed_price?: number | string | null;
  realized_pl?: number | string | null;
}

/**
 * One row per day, oldest first.
 *
 * @param days   the session days to report on, oldest first. The broker's own
 *               portfolio-history dates when we have them, so the calendar is
 *               the account's real trading calendar rather than one we invent
 *               (which would put flat points on holidays and weekends).
 * @param trades closed trade_records — only close_date and the two option-leg
 *               columns are read.
 * @param lots   stock_lots rows, open and disposed alike.
 * @param closes closesByDay() output.
 * @param opts   `unusable`  tickers whose price may never be used at all —
 *                           `priceProblems().collided`, plus any ticker whose
 *                           open lots disagree with the broker's own position.
 *               `unusableFrom` ticker -> the first day its price stops being
 *                           usable, from `priceProblems().splitFrom`.
 *
 *               Both produce a WITHHELD day rather than a wrong one. The
 *               headline already refuses on a collision and on a ledger/broker
 *               quantity disagreement; a chart that priced straight through
 *               them put a confident line above a panel reading "—".
 */
export function dailyPortfolio(
  days: string[],
  trades: Trade[],
  lots: Lot[],
  closes: Record<string, Record<string, number>>,
  opts: {
    unusable?: string[];
    unusableFrom?: Record<string, string>;
    openOptions?: OpenOptionLeg[];
    optionCloses?: Record<string, Record<string, number>>;
  } = {}
): DailyRow[] {
  const unusable = new Set((opts.unusable || []).map(baseTicker));
  const unusableFrom = opts.unusableFrom || {};
  const calendar = [...new Set((days || []).map(day).filter(Boolean) as string[])].sort();
  if (!calendar.length) return [];
  const calendarIndex = new Map(calendar.map((d, i) => [d, i]));

  // Option legs, bucketed by the day they closed, then run as a cumulative sum
  // across the calendar. Bucketing first means the cost is one pass over the
  // trades rather than one pass per day — on four years of history that is the
  // difference between a thousand operations and a million.
  const premiumByDay: Record<string, number> = {};
  for (const t of trades || []) {
    const d = day(t?.close_date);
    if (!d) continue;
    premiumByDay[d] = (premiumByDay[d] || 0) + (num(t?.premium_pl) || 0) + (num(t?.early_close_pl) || 0);
  }
  // DRAINED BY DATE, NOT KEYED ON THE CALENDAR. The first version read
  // `premiumByDay[d]` for each calendar day, so premium booked on a date the
  // calendar does not contain was never added — not that day, not ever. Three
  // ways that fired, and the share lots were never exposed to any of them
  // because they use inequalities:
  //
  //   - The broker serves one year of session dates. An account trading since
  //     2022 lost every dollar of premium booked before the trailing year, from
  //     every row, permanently.
  //   - Rows written a year ago kept the older baseline and were never
  //     rewritten, so the stored series STEPPED DOWN by a year of premium at
  //     the seam. The pole defect, inverted, produced by the fix for it.
  //   - On any account: a close_date stamped on a weekend (an OPEXP), on a
  //     holiday, or on a day equityDays dropped for null equity is not a
  //     calendar key, and that day's premium silently vanished.
  //
  // Sorted once and drained with a moving index, so the walk stays linear.
  const premiumDays = Object.keys(premiumByDay).sort();
  let premiumIdx = 0;

  // Share lots, prepared once.
  const prepared = (lots || [])
    .map((l) => {
      const qty = num(l?.qty) || 0;
      if (qty <= 0) return null;
      const acquiredPrice = num(l?.acquired_price);
      const disposedDate = day(l?.disposed_date);
      const disposedPrice = num(l?.disposed_price);
      // A lot with no acquisition date was acquired before the activity window
      // the broker will show us. It really is held, so it is held from the
      // start of the calendar rather than dropped — dropping it would quietly
      // shrink the book.
      return {
        ticker: baseTicker(l?.ticker),
        qty,
        from: day(l?.acquired_date),
        cost: acquiredPrice === null ? null : qty * acquiredPrice,
        to: disposedDate,
        // The stored result if the reconstruction wrote one, else the lot's own
        // arithmetic. Never a guess: with no disposal price and no stored
        // result the lot books nothing and says so through `unpriced`.
        //
        // A WITHHELD LOT KEEPS ITS HOLDING PERIOD AND BOOKS NOTHING.
        //
        // The first version filtered these rows out of the query entirely, and
        // the bench caught what that costs: `from` and `to` are what put the
        // shares on the book between those dates, so removing the row removed
        // the HOLDING as well as the disputed result. Every day between
        // acquisition and disposal then reported fewer shares, less cost and
        // less value than the account actually carried -- a screen showing less
        // than the position was, which is the opposite of what this migration's
        // own comment promises about held shares being the broker's fact.
        //
        // Null here routes the lot into the `unbooked` path this file already
        // has, so the day it disposed reports `performance: null` rather than a
        // confident number missing a term. "Not priced" is a statement this
        // file already knows how to make; zero is not.
        booked: l?.integrity_code
          ? null
          : num(l?.realized_pl) !== null
            ? (num(l?.realized_pl) as number)
            : disposedPrice !== null && acquiredPrice !== null
              ? qty * (disposedPrice - acquiredPrice)
              : null
      };
    })
    .filter(Boolean) as {
      ticker: string; qty: number; from: string | null; cost: number | null;
      to: string | null; booked: number | null;
    }[];

  // The last close at or before a day, per ticker. A ticker can miss a bar (a
  // halt, a feed gap, a symbol that had not begun trading), and carrying the
  // previous close forward is what a broker statement does — far better than
  // dropping the whole day's mark for want of one price.
  //
  // BOUNDED, and the bound is the whole point. Carried forward without limit, a
  // DELISTED or permanently halted name marks at its last print for the rest of
  // the account's life, and every one of those days renders as a valued day
  // with a confident number on it. That is precisely the case where the absence
  // of a bar is the news: the position may be worth nothing. Five sessions is a
  // week of trading — long enough to ride out a feed gap or a trading halt,
  // short enough that a dead symbol stops being marked and starts being named.
  const MAX_CARRY_SESSIONS = 5;

  const sortedDays = new Map<string, string[]>();
  const daysFor = (key: string, series: Record<string, number>) => {
    let list = sortedDays.get(key);
    if (!list) { list = Object.keys(series).sort(); sortedDays.set(key, list); }
    return list;
  };

  // How many calendar sessions fall in (anchor, d]. Counted by POSITION IN THE
  // CALENDAR, not by looking the anchor up in it.
  //
  // The first version did `calendarIndex.get(d) - (calendarIndex.get(anchor) ??
  // -Infinity)`, which refused the mark outright whenever the anchor bar's day
  // was not itself a calendar day. Every bar in the week of runway we fetch
  // before the first activity is structurally not a calendar day, so the runway
  // could never be used -- and any systematic one-day misalignment between the
  // bar dates and the broker's session list turned into every day refused, for
  // ever, rather than an off-by-one.
  const sessionsSince = (anchor: string, d: string): number => {
    let lo = 0;
    let hi = calendar.length - 1;
    let after = calendar.length; // index of the first calendar day > anchor
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (calendar[mid] > anchor) { after = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    return (calendarIndex.get(d) as number) - after + 1;
  };

  const closeOn = (
    key: string,
    d: string,
    source: Record<string, Record<string, number>> = closes
  ): number | null => {
    const series = source?.[key];
    if (!series) return null;
    if (series[d] !== undefined) return series[d];

    const list = daysFor(key, series);
    let lo = 0;
    let hi = list.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] <= d) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (idx < 0) return null;
    if (sessionsSince(list[idx], d) > MAX_CARRY_SESSIONS) return null;
    return series[list[idx]];
  };

  // Option legs still open, prepared once.
  //
  // AN ADJUSTED CONTRACT IS PRICED, NOT REFUSED, and the first version had this
  // backwards. `occ.ts:25-28` settles it against the symbology: a 3-for-2 split
  // turns one $90 contract into one $60 contract DELIVERING 150 SHARES -- the
  // deliverable changes and the PREMIUM MULTIPLIER STAYS 100. So x100 on the
  // premium is exact for an adjusted contract, and refusing one would withhold
  // a leg we can price correctly. Nothing here derives shares from a strike,
  // which is the calculation a corporate action would actually break.
  //
  // `multiplier` therefore only ever narrows: a caller that knows a contract
  // genuinely delivers on a different premium multiple can say so, and the walk
  // withholds. Nothing supplies one today.
  const legs = (opts.openOptions || [])
    .map((o) => {
      const qty = num(o?.qty);
      const cost = num(o?.costBasis);
      const mult = num(o?.multiplier);
      const symbol = String(o?.symbol || "");
      if (!symbol || qty === null || qty === 0) return null;
      return {
        symbol,
        qty,
        cost,
        from: day(o?.from),
        usable: cost !== null && (mult === null || mult === 100)
      };
    })
    .filter(Boolean) as { symbol: string; qty: number; cost: number | null; from: string | null; usable: boolean }[];

  const optionCloses = opts.optionCloses || {};

  let premiumCum = 0;
  const out: DailyRow[] = [];

  for (const d of calendar) {
    // Everything booked on or before this day, including days the calendar
    // itself does not contain. The FIRST calendar day therefore also picks up
    // everything that happened before it, which is what makes a one-year
    // window a window on the chart rather than an amputation of the total.
    while (premiumIdx < premiumDays.length && premiumDays[premiumIdx] <= d) {
      premiumCum += premiumByDay[premiumDays[premiumIdx]];
      premiumIdx += 1;
    }

    let sharesBooked = 0;
    let sharesCost = 0;
    let sharesValue = 0;
    // Two kinds of not-knowing, tracked apart because they spoil different
    // figures. A sold lot with no result makes the day's BOOKED money unknown;
    // a held lot with no price makes the day's MARK unknown. Folding them into
    // one set reported `shares_open` as a clean zero on a day whose booked half
    // was missing — caught by the test for exactly that case.
    const unbooked = new Set<string>();
    const unmarkedShares = new Set<string>();

    for (const lot of prepared) {
      // Sold on or before this day: its result is booked, and it is no longer
      // marked. `to <= d` rather than `to < d` — a lot sold on D is money on D,
      // not a position still open at that day's close.
      if (lot.to && lot.to <= d) {
        if (lot.booked === null) unbooked.add(lot.ticker);
        else sharesBooked += lot.booked;
        continue;
      }
      // Not yet acquired on this day.
      if (lot.from && lot.from > d) continue;

      if (lot.cost === null) { unmarkedShares.add(lot.ticker); continue; }
      // A price we are not allowed to use is the same as no price. Refusing
      // here rather than at the source keeps the reason in `unpriced`, so the
      // screen can name the ticker instead of showing an unexplained gap.
      if (unusable.has(lot.ticker)) { unmarkedShares.add(lot.ticker); continue; }
      const from = unusableFrom[lot.ticker];
      if (from && d >= from) { unmarkedShares.add(lot.ticker); continue; }
      const close = closeOn(lot.ticker, d);
      if (close === null) { unmarkedShares.add(lot.ticker); continue; }
      sharesCost += lot.cost;
      sharesValue += lot.qty * close;
    }

    // OPTION LEGS STILL OPEN ON THIS DAY.
    //
    // `qty * 100 * close - costBasis` is right for both sides without a special
    // case, because the broker signs both: a short leg has a negative quantity
    // and a negative cost basis (a credit taken). The TSLA 375C sold for $226
    // and now costing $299 to buy back is -1*100*2.99 - (-226) = -$73, a loss,
    // which is what it is. An abs() here is the sign error that printed a loss
    // as a gain once already.
    let optionsOpen = 0;
    let optionsHeld = 0;
    const unmarkedLegs = new Set<string>();
    for (const leg of legs) {
      // TWO CONDITIONS, TWO OUTCOMES. One `continue` used to serve both and
      // that was the worst defect in this file: a leg whose opening date could
      // not be established skipped before `unmarkedLegs.add`, so it contributed
      // nothing, never reached `unpriced`, left `optionsHeld` at zero, and the
      // day was stored as $0.00 with `performance` NON-NULL and the chart
      // reporting itself complete. On a real five-leg book that is $0.00 stored
      // against a true -$390, with nothing on screen to say so. Twelve lines
      // above, this file states the rule it was breaking: zero is a statement
      // about a portfolio and "not priced" is not that statement.
      //
      // `from` goes null for ordinary reasons, not exotic ones: a leg acquired
      // by assignment or exercise has no order behind it at all; a leg opened
      // before the order window is not in it; a caught fetch error nulls every
      // one of them at once.
      if (!leg.from) { optionsHeld += 1; unmarkedLegs.add(leg.symbol); continue; }
      // Not yet opened on this day: genuinely nothing to count.
      if (leg.from > d) continue;
      optionsHeld += 1;
      if (!leg.usable) { unmarkedLegs.add(leg.symbol); continue; }
      // CARRIED FORWARD, by the same bounded rule the share closes use. An
      // exact-day lookup was wrong in the routine case, not the exotic one: a
      // thin strike does not print every session -- an OTM put at $0.41, a call
      // at $2.99 -- and one zero-volume session on ONE leg nulled the whole
      // book's mark for that day. That includes today's bar on a delayed feed.
      const close = closeOn(leg.symbol, d, optionCloses);
      if (close === null) { unmarkedLegs.add(leg.symbol); continue; }
      optionsOpen += leg.qty * 100 * close - (leg.cost as number);
    }
    const optionsMarked = unmarkedLegs.size === 0;
    const optionsValue = optionsMarked ? optionsOpen : null;

    // Null, never zero, when part of the book could not be valued. Zero is a
    // statement about a portfolio and "not priced" is not that statement — the
    // same rule the headline and the open-book panel already apply.
    const booked = unbooked.size === 0;
    // Each half fails on its own. An unvaluable OPTION leg must not blank the
    // share mark, and vice versa -- folding them into one flag made a missing
    // option price report `shares_open` as unknown, which is a statement about
    // the wrong position.
    const sharesOpen = unmarkedShares.size === 0 ? sharesValue - sharesCost : null;
    const realizedCum = booked ? premiumCum + sharesBooked : null;

    const optionsOut = optionsHeld > 0 ? optionsValue : 0;
    out.push({
      day: d,
      premium_cum: cents(premiumCum) as number,
      shares_booked: cents(sharesBooked) as number,
      shares_open: cents(sharesOpen),
      shares_cost: cents(sharesCost) as number,
      shares_value: unmarkedShares.size === 0 ? cents(sharesValue) : null,
      realized_cum: cents(realizedCum),
      options_open: cents(optionsOut),
      performance:
        sharesOpen === null || realizedCum === null || optionsOut === null
          ? null
          : cents(realizedCum + sharesOpen + optionsOut),
      unpriced: [...new Set([...unbooked, ...unmarkedShares, ...unmarkedLegs])].sort()
    });
  }

  return out;
}

/**
 * The calendar to walk, when the broker's portfolio history is unavailable.
 *
 * Every date any price series carries, bounded below by the first thing that
 * happened on the account. Trading days only — they come from bars — so the
 * chart never draws a flat weekend.
 */
export function fallbackCalendar(
  closes: Record<string, Record<string, number>>,
  trades: Trade[],
  lots: Lot[]
): string[] {
  const starts: string[] = [];
  for (const t of trades || []) { const d = day(t?.close_date); if (d) starts.push(d); }
  for (const l of lots || []) { const d = day(l?.acquired_date); if (d) starts.push(d); }
  if (!starts.length) return [];
  const first = starts.sort()[0];

  const set = new Set<string>();
  for (const series of Object.values(closes || {})) {
    for (const d of Object.keys(series)) if (d >= first) set.add(d);
  }
  // A book with no share lots has no bars, so the trade dates are the calendar.
  for (const d of starts) set.add(d);
  return [...set].sort();
}
