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
//   performance(D)   the three added together — the whole-view line
//
// BUILT FROM LOT DATES, NOT FROM `realized_pl`, and that is the load-bearing
// decision. `realized_pl` on a trade record is premium_pl + early_close_pl +
// stock_pl, and the share half is written back onto the row of the option that
// ACQUIRED the lot — whose close_date is the assignment, weeks before the
// shares were sold. Accumulating realized_pl by close_date would therefore
// book a share result on the day the lot was bought, while the same lot was
// still being marked as held: the same dollars counted twice, every day in
// between. Reading the lots directly cannot make that mistake, because a lot
// is either open or disposed on any given day and never both.
//
// The identity that keeps this honest at the right-hand edge:
//
//   premium_cum(today) + shares_booked(today) === stats.totalPL
//   performance(today) === the Whole view headline
//
// which is asserted in the tests rather than hoped for.

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
// Alpaca stamps a 1D entry either at the US close (20:00/21:00 UTC) or at
// midnight Eastern (04:00/05:00 UTC). Both fall on the same UTC calendar day as
// the session, so the UTC date is the session date under either stamping and no
// timezone table is needed. Seconds, not milliseconds — multiplying is the
// whole conversion, and getting it backwards puts every point in 1970, which is
// why this is a named function with a test rather than an inline expression.
export function sessionDay(unixSeconds: number): string | null {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

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
 */
export function equityDays(history: PortfolioHistory | null) {
  const stamps = Array.isArray(history?.timestamp) ? history!.timestamp! : [];
  const equity = Array.isArray(history?.equity) ? history!.equity! : [];
  const pl = Array.isArray(history?.profit_loss) ? history!.profit_loss! : [];
  const base = num(history?.base_value);

  const byDay = new Map<string, { day: string; equity: number; profit_loss: number | null; base_value: number | null }>();
  let funded = false;

  for (let i = 0; i < stamps.length; i++) {
    const d = sessionDay(Number(stamps[i]));
    if (!d) continue;
    const value = num(equity[i]);
    if (value === null) continue;
    if (!funded) {
      if (value === 0) continue;
      funded = true;
    }
    byDay.set(d, { day: d, equity: value, profit_loss: num(pl[i]), base_value: base });
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
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
  /** premium_cum + shares_booked + shares_open, or null when shares_open is. */
  performance: number | null;
  /** premium_cum + shares_booked, or null when a sold lot has no result. */
  realized_cum: number | null;
  /** Tickers whose contribution to that day could not be established. */
  unpriced: string[];
}

interface Trade {
  close_date?: string | null;
  premium_pl?: number | string | null;
  early_close_pl?: number | string | null;
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
 */
export function dailyPortfolio(
  days: string[],
  trades: Trade[],
  lots: Lot[],
  closes: Record<string, Record<string, number>>
): DailyRow[] {
  const calendar = [...new Set((days || []).map(day).filter(Boolean) as string[])].sort();
  if (!calendar.length) return [];

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
        booked:
          num(l?.realized_pl) !== null
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
  const lastCloseCache: Record<string, { day: string; price: number } | null> = {};
  const closeOn = (ticker: string, d: string): number | null => {
    const series = closes?.[ticker];
    if (!series) return null;
    const exact = series[d];
    if (exact !== undefined) {
      lastCloseCache[ticker] = { day: d, price: exact };
      return exact;
    }
    const cached = lastCloseCache[ticker];
    if (cached && cached.day <= d) return cached.price;
    // Cold, or the walk went backwards: find it the slow way, once.
    let best: { day: string; price: number } | null = null;
    for (const k of Object.keys(series)) {
      if (k <= d && (!best || k > best.day)) best = { day: k, price: series[k] };
    }
    if (best) lastCloseCache[ticker] = best;
    return best ? best.price : null;
  };

  let premiumCum = 0;
  const out: DailyRow[] = [];

  for (const d of calendar) {
    premiumCum += premiumByDay[d] || 0;

    let sharesBooked = 0;
    let sharesCost = 0;
    let sharesValue = 0;
    // Two kinds of not-knowing, tracked apart because they spoil different
    // figures. A sold lot with no result makes the day's BOOKED money unknown;
    // a held lot with no price makes the day's MARK unknown. Folding them into
    // one set reported `shares_open` as a clean zero on a day whose booked half
    // was missing — caught by the test for exactly that case.
    const unbooked = new Set<string>();
    const unmarked = new Set<string>();

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

      if (lot.cost === null) { unmarked.add(lot.ticker); continue; }
      const close = closeOn(lot.ticker, d);
      if (close === null) { unmarked.add(lot.ticker); continue; }
      sharesCost += lot.cost;
      sharesValue += lot.qty * close;
    }

    // Null, never zero, when part of the book could not be valued. Zero is a
    // statement about a portfolio and "not priced" is not that statement — the
    // same rule the headline and the open-book panel already apply.
    const marked = unmarked.size === 0;
    const booked = unbooked.size === 0;
    const sharesOpen = marked ? sharesValue - sharesCost : null;
    const realizedCum = booked ? premiumCum + sharesBooked : null;

    out.push({
      day: d,
      premium_cum: premiumCum,
      shares_booked: sharesBooked,
      shares_open: sharesOpen,
      shares_cost: sharesCost,
      shares_value: marked ? sharesValue : null,
      realized_cum: realizedCum,
      performance:
        sharesOpen === null || realizedCum === null ? null : realizedCum + sharesOpen,
      unpriced: [...new Set([...unbooked, ...unmarked])].sort()
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
