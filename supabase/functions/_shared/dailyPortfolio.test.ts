import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionDay,
  equityDays,
  closesByDay,
  dailyPortfolio,
  fallbackCalendar,
  priceProblems,
  baseTicker
} from "./dailyPortfolio.ts";

// ---------------------------------------------------------------------------
// sessionDay
// ---------------------------------------------------------------------------

test("sessionDay reads unix SECONDS, not milliseconds", () => {
  // 2026-09-01 20:00:00 UTC — a US close in daylight time.
  assert.equal(sessionDay(1788292800), "2026-09-01");
  // The same number read as milliseconds lands in 1970, which is the bug this
  // test exists to catch.
  assert.equal(new Date(1788292800).toISOString().slice(0, 4), "1970");
});

test("sessionDay agrees for both of Alpaca's stampings of one session", () => {
  // Midnight Eastern (04:00 UTC) and the 20:00 UTC close of the same session.
  assert.equal(sessionDay(1788235200), "2026-09-01");
  assert.equal(sessionDay(1788292800), "2026-09-01");
});

test("sessionDay refuses nonsense rather than returning an epoch date", () => {
  assert.equal(sessionDay(0), null);
  assert.equal(sessionDay(-1), null);
  assert.equal(sessionDay(NaN), null);
});

// ---------------------------------------------------------------------------
// equityDays
// ---------------------------------------------------------------------------

test("equityDays drops the unfunded days before the first deposit", () => {
  const rows = equityDays({
    timestamp: [1788148800, 1788235200, 1788321600],
    equity: [0, 140000, 140120],
    profit_loss: [0, 0, 120],
    base_value: 140000
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].equity, 140000);
  assert.equal(rows[0].base_value, 140000);
});

test("equityDays keeps a genuine zero AFTER the account has been funded", () => {
  // An account drawn to zero is a fact about the account; only the leading
  // zeros are the artefact.
  const rows = equityDays({
    timestamp: [1788148800, 1788235200],
    equity: [140000, 0]
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].equity, 0);
});

test("equityDays skips a gap rather than writing it as zero", () => {
  const rows = equityDays({
    timestamp: [1788148800, 1788235200, 1788321600],
    equity: [140000, null, 141000]
  });
  assert.deepEqual(rows.map((r) => r.equity), [140000, 141000]);
});

test("equityDays takes the last entry for a repeated day", () => {
  const rows = equityDays({
    timestamp: [1788235200, 1788292800],
    equity: [140000, 140500]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].equity, 140500);
});

test("equityDays on an empty or missing payload returns nothing, not a throw", () => {
  assert.deepEqual(equityDays(null), []);
  assert.deepEqual(equityDays({}), []);
});

// ---------------------------------------------------------------------------
// closesByDay
// ---------------------------------------------------------------------------

test("closesByDay keys on the base ticker so TSLA1 finds TSLA", () => {
  const closes = closesByDay({
    bars: {
      TSLA1: [{ t: "2026-09-01T04:00:00Z", c: 320.5 }]
    }
  });
  assert.equal(closes.TSLA["2026-09-01"], 320.5);
});

test("closesByDay ignores a zero or missing close", () => {
  const closes = closesByDay({
    bars: { WMT: [{ t: "2026-09-01T04:00:00Z", c: 0 }, { t: "2026-09-02T04:00:00Z", c: 109.4 }] }
  });
  assert.equal(closes.WMT["2026-09-01"], undefined);
  assert.equal(closes.WMT["2026-09-02"], 109.4);
});

// ---------------------------------------------------------------------------
// dailyPortfolio — the walk
// ---------------------------------------------------------------------------

const DAYS = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];

test("a lot held across the window is marked on EVERY day, not just the last", () => {
  const rows = dailyPortfolio(
    DAYS,
    [{ close_date: "2026-09-01", premium_pl: 500, early_close_pl: 0 }],
    [{ ticker: "TSLA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320 }],
    {
      TSLA: {
        "2026-09-01": 320,
        "2026-09-02": 325,
        "2026-09-03": 318,
        "2026-09-04": 340
      }
    }
  );
  // This is the whole point: four distinct marks, one per day.
  assert.deepEqual(rows.map((r) => r.shares_open), [0, 500, -200, 2000]);
  assert.deepEqual(rows.map((r) => r.performance), [500, 1000, 300, 2500]);
  // And no vertical jump from nothing to everything on the final day.
  assert.equal(rows[3].performance - rows[2].performance, 2200);
});

test("a sold lot books its result and stops being marked, with no double count", () => {
  // The trap: `realized_pl` on the trade record carries the share result back
  // onto the option that ACQUIRED the lot, whose close_date is the assignment.
  // Reading lot dates instead means 09-03 cannot both book and mark the lot.
  const rows = dailyPortfolio(
    DAYS,
    [{ close_date: "2026-09-01", premium_pl: 500, early_close_pl: 0 }],
    [{
      ticker: "TSLA", qty: 100,
      acquired_date: "2026-09-01", acquired_price: 320,
      disposed_date: "2026-09-03", disposed_price: 330, realized_pl: 1000
    }],
    { TSLA: { "2026-09-01": 320, "2026-09-02": 325, "2026-09-03": 330, "2026-09-04": 400 } }
  );
  assert.deepEqual(rows.map((r) => r.shares_open), [0, 500, 0, 0]);
  assert.deepEqual(rows.map((r) => r.shares_booked), [0, 0, 1000, 1000]);
  // 09-04's $400 close must not touch a lot that was sold on 09-03.
  assert.equal(rows[3].performance, 1500);
});

test("premium accumulates on the day each option leg closed and holds flat between", () => {
  const rows = dailyPortfolio(
    DAYS,
    [
      { close_date: "2026-09-01", premium_pl: 300, early_close_pl: 0 },
      { close_date: "2026-09-03", premium_pl: 200, early_close_pl: -50 }
    ],
    [],
    {}
  );
  assert.deepEqual(rows.map((r) => r.premium_cum), [300, 300, 450, 450]);
  assert.deepEqual(rows.map((r) => r.performance), [300, 300, 450, 450]);
});

test("premium_pl is signed, so a net debit pulls the line down", () => {
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02"],
    [{ close_date: "2026-09-02", premium_pl: -1357, early_close_pl: 2539 }],
    [],
    {}
  );
  assert.deepEqual(rows.map((r) => r.premium_cum), [0, 1182]);
});

test("a lot whose cost is unknown withholds the day rather than marking at zero basis", () => {
  // Number(null) is 0, so a missing acquisition price would otherwise report
  // the lot's entire market value as gain.
  const rows = dailyPortfolio(
    ["2026-09-01"],
    [],
    [{ ticker: "JNJ", qty: 100, acquired_date: "2026-09-01", acquired_price: null }],
    { JNJ: { "2026-09-01": 257.5 } }
  );
  assert.equal(rows[0].shares_open, null);
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["JNJ"]);
  // Money booked is still known even when the mark is not.
  assert.equal(rows[0].realized_cum, 0);
});

test("a day with no bar for a held ticker carries the previous close forward", () => {
  const rows = dailyPortfolio(
    DAYS,
    [],
    [{ ticker: "XOP", qty: 100, acquired_date: "2026-09-01", acquired_price: 167 }],
    { XOP: { "2026-09-01": 167, "2026-09-04": 170 } }
  );
  // 09-02 and 09-03 have no bar; the position did not stop existing.
  assert.deepEqual(rows.map((r) => r.shares_open), [0, 0, 0, 300]);
  assert.deepEqual(rows.map((r) => r.unpriced), [[], [], [], []]);
});

test("a ticker with no price series at all is named, and the day withholds", () => {
  const rows = dailyPortfolio(["2026-09-01"], [], [
    { ticker: "AMZN", qty: 100, acquired_date: "2026-09-01", acquired_price: 227.5 }
  ], {});
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["AMZN"]);
});

test("a lot with no acquisition date is held from the start of the calendar", () => {
  // "Acquired before the window the broker will show us" — real, and dropping
  // it would quietly shrink the book.
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02"],
    [],
    [{ ticker: "WMT", qty: 300, acquired_date: null, acquired_price: 108 }],
    { WMT: { "2026-09-01": 109, "2026-09-02": 110 } }
  );
  assert.deepEqual(rows.map((r) => r.shares_open), [300, 600]);
});

test("a lot acquired later in the window contributes nothing before its date", () => {
  const rows = dailyPortfolio(
    DAYS,
    [],
    [{ ticker: "WMT", qty: 100, acquired_date: "2026-09-03", acquired_price: 108 }],
    { WMT: { "2026-09-01": 100, "2026-09-02": 105, "2026-09-03": 108, "2026-09-04": 112 } }
  );
  assert.deepEqual(rows.map((r) => r.shares_open), [0, 0, 0, 400]);
  assert.deepEqual(rows.map((r) => r.shares_cost), [0, 0, 10800, 10800]);
});

test("a lot sold ON a day is money that day, not a position still open at the close", () => {
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02"],
    [],
    [{
      ticker: "TSLA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320,
      disposed_date: "2026-09-02", disposed_price: 330, realized_pl: 1000
    }],
    { TSLA: { "2026-09-01": 320, "2026-09-02": 500 } }
  );
  // The absurd 09-02 close is there to prove the lot is no longer marked: a
  // still-held reading would report $18,000.
  assert.equal(rows[1].shares_booked, 1000);
  assert.equal(rows[1].shares_open, 0);
  assert.equal(rows[1].performance, 1000);
});

test("a disposed lot with neither a stored result nor a disposal price is named", () => {
  const rows = dailyPortfolio(
    ["2026-09-02"],
    [],
    [{ ticker: "MU", qty: 100, acquired_date: "2026-09-01", acquired_price: null,
       disposed_date: "2026-09-02", disposed_price: null, realized_pl: null }],
    { MU: { "2026-09-02": 90 } }
  );
  assert.deepEqual(rows[0].unpriced, ["MU"]);
  assert.equal(rows[0].performance, null);
});

test("the right-hand edge equals the Whole view headline", () => {
  // premium legs + shares already sold + the mark on what is still held —
  // the identity the Analysis page's headline is built from.
  const trades = [
    { close_date: "2026-09-01", premium_pl: 800, early_close_pl: 0 },
    { close_date: "2026-09-02", premium_pl: 937, early_close_pl: 0 }
  ];
  const lots = [
    { ticker: "TSLA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320 },
    { ticker: "WMT", qty: 100, acquired_date: "2026-09-01", acquired_price: 109,
      disposed_date: "2026-09-02", disposed_price: 112, realized_pl: 300 }
  ];
  const closes = {
    TSLA: { "2026-09-01": 320, "2026-09-02": 415 },
    WMT: { "2026-09-01": 109, "2026-09-02": 112 }
  };
  const rows = dailyPortfolio(["2026-09-01", "2026-09-02"], trades, lots, closes);
  const last = rows[rows.length - 1];
  const premiumOnly = 800 + 937;
  const sharesSold = 300;
  const markOnHeld = 100 * (415 - 320);
  assert.equal(last.premium_cum, premiumOnly);
  assert.equal(last.shares_booked, sharesSold);
  assert.equal(last.shares_open, markOnHeld);
  assert.equal(last.performance, premiumOnly + sharesSold + markOnHeld);
  assert.equal(last.realized_cum, premiumOnly + sharesSold);
});

test("an empty calendar returns nothing rather than a single invented point", () => {
  assert.deepEqual(dailyPortfolio([], [{ close_date: "2026-09-01", premium_pl: 10 }], [], {}), []);
});

test("days are de-duplicated and sorted whatever order they arrive in", () => {
  const rows = dailyPortfolio(
    ["2026-09-03", "2026-09-01", "2026-09-03"],
    [{ close_date: "2026-09-01", premium_pl: 100, early_close_pl: 0 }],
    [],
    {}
  );
  assert.deepEqual(rows.map((r) => r.day), ["2026-09-01", "2026-09-03"]);
});

// ---------------------------------------------------------------------------
// fallbackCalendar
// ---------------------------------------------------------------------------

test("fallbackCalendar uses bar dates from the first activity onwards", () => {
  const days = fallbackCalendar(
    { TSLA: { "2026-08-01": 300, "2026-09-01": 320, "2026-09-02": 325 } },
    [{ close_date: "2026-09-01" }],
    [{ acquired_date: "2026-09-01" }]
  );
  assert.deepEqual(days, ["2026-09-01", "2026-09-02"]);
});

test("fallbackCalendar still returns the trade dates when nothing holds shares", () => {
  const days = fallbackCalendar({}, [{ close_date: "2026-09-01" }, { close_date: "2026-09-04" }], []);
  assert.deepEqual(days, ["2026-09-01", "2026-09-04"]);
});

test("fallbackCalendar on an account with no history returns nothing", () => {
  assert.deepEqual(fallbackCalendar({}, [], []), []);
});

test("baseTicker keeps a numeric ticker rather than collapsing it to empty", () => {
  assert.equal(baseTicker("TSLA1"), "TSLA");
  assert.equal(baseTicker("123"), "123");
  assert.equal(baseTicker(null), "");
});

// ---------------------------------------------------------------------------
// Premium is drained by DATE, not keyed on the calendar
//
// The bench's first blocker. Share lots use inequalities and were never exposed
// to this; premium was read as `premiumByDay[d]`, so anything booked on a date
// the calendar did not contain was never added — not that day, not ever.
// ---------------------------------------------------------------------------

test("premium booked BEFORE the calendar window is carried into its first day", () => {
  // The broker serves one year of session dates. An account trading since 2022
  // lost every dollar booked before the trailing year, from every row.
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02"],
    [
      { close_date: "2022-03-14", premium_pl: 5000, early_close_pl: 0 },
      { close_date: "2026-09-02", premium_pl: 100, early_close_pl: 0 }
    ],
    [],
    {}
  );
  assert.deepEqual(rows.map((r) => r.premium_cum), [5000, 5100]);
});

test("premium stamped on a day the calendar does not contain is still counted", () => {
  // A weekend-stamped OPEXP, a holiday, or a day equityDays dropped for null
  // equity. 09-05 is a Saturday and is not a session in this calendar.
  const rows = dailyPortfolio(
    ["2026-09-04", "2026-09-08"],
    [
      { close_date: "2026-09-04", premium_pl: 200, early_close_pl: 0 },
      { close_date: "2026-09-05", premium_pl: 300, early_close_pl: 0 }
    ],
    [],
    {}
  );
  assert.deepEqual(rows.map((r) => r.premium_cum), [200, 500]);
});

test("a one-year window is a window on the chart, not an amputation of the total", () => {
  // The seam defect: rows written a year ago kept the older baseline, so the
  // stored series stepped DOWN by a year of premium — the pole, inverted.
  const long = dailyPortfolio(
    ["2025-01-02", "2026-09-02"],
    [{ close_date: "2024-06-01", premium_pl: 900, early_close_pl: 0 }],
    [], {}
  );
  const short = dailyPortfolio(
    ["2026-09-02"],
    [{ close_date: "2024-06-01", premium_pl: 900, early_close_pl: 0 }],
    [], {}
  );
  assert.equal(long[long.length - 1].premium_cum, 900);
  assert.equal(short[0].premium_cum, 900);
});

// ---------------------------------------------------------------------------
// Prices that must not be used
// ---------------------------------------------------------------------------

test("carrying a close forward is bounded — a dead symbol stops being marked", () => {
  // Unbounded, a delisted or permanently halted name marks at its last print
  // for the rest of the account's life, every day of it rendering as valued.
  const days = [
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-08",
    "2026-09-09", "2026-09-10", "2026-09-11"
  ];
  const rows = dailyPortfolio(
    days,
    [],
    [{ ticker: "ZZZ", qty: 100, acquired_date: "2026-09-01", acquired_price: 10 }],
    { ZZZ: { "2026-09-01": 10 } }
  );
  // Five sessions of carry, then withheld and named.
  assert.deepEqual(rows.map((r) => r.shares_open !== null), [
    true, true, true, true, true, true, false, false
  ]);
  assert.deepEqual(rows[7].unpriced, ["ZZZ"]);
});

test("priceProblems names two symbols collapsing to one ticker", () => {
  const p = priceProblems({
    bars: {
      TSLA: [{ t: "2026-09-01T04:00:00Z", c: 375 }],
      TSLA1: [{ t: "2026-09-01T04:00:00Z", c: 10 }]
    }
  });
  assert.deepEqual(p.collided, ["TSLA"]);
});

test("priceProblems spots a 2-for-1 split in a raw series and dates it", () => {
  const p = priceProblems({
    bars: {
      NVDA: [
        { t: "2026-09-01T04:00:00Z", c: 320 },
        { t: "2026-09-02T04:00:00Z", c: 318 },
        { t: "2026-09-03T04:00:00Z", c: 159.5 },
        { t: "2026-09-04T04:00:00Z", c: 161 }
      ]
    }
  });
  assert.equal(p.splitFrom.NVDA, "2026-09-03");
});

test("priceProblems does NOT fire on a genuine 40% earnings collapse", () => {
  // A real loss the chart must show. Detection is by ratio near a split factor,
  // not by "a big move", precisely so this case survives.
  const p = priceProblems({
    bars: {
      MU: [
        { t: "2026-09-01T04:00:00Z", c: 100 },
        { t: "2026-09-02T04:00:00Z", c: 60 }
      ]
    }
  });
  assert.equal(p.splitFrom.MU, undefined);
  assert.deepEqual(p.collided, []);
});

test("a split withholds from the split date FORWARD and leaves earlier days alone", () => {
  // Priced straight through, a 2:1 split on a 100-share lot at $320 basis
  // prints a $16,000 loss on one day that never happened.
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02", "2026-09-03"],
    [],
    [{ ticker: "NVDA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320 }],
    { NVDA: { "2026-09-01": 320, "2026-09-02": 318, "2026-09-03": 159 } },
    { unusableFrom: { NVDA: "2026-09-03" } }
  );
  assert.deepEqual(rows.map((r) => r.shares_open), [0, -200, null]);
  assert.deepEqual(rows[2].unpriced, ["NVDA"]);
});

test("a ticker the ledger and the broker disagree about is never priced", () => {
  // openBook withholds the whole total when qtyMatchesBroker is false. The
  // chart must refuse for the reasons the headline refuses, or the same page
  // shows a dash in the panel and a confident line above it.
  const rows = dailyPortfolio(
    ["2026-09-01"],
    [],
    [{ ticker: "TSLA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320 }],
    { TSLA: { "2026-09-01": 375 } },
    { unusable: ["TSLA"] }
  );
  assert.equal(rows[0].shares_open, null);
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA"]);
});

// ---------------------------------------------------------------------------
// The identity, asserted against the OTHER MODULES rather than against itself
//
// The first version of this test restated dailyPortfolio's own formula and
// checked dailyPortfolio computed it, which proved nothing. These import
// `computeStats` and `openBook` — the two functions that actually produce the
// headline the chart has to end at — and compare.
// ---------------------------------------------------------------------------

import { computeStats } from "../../../src/lib/analytics.js";
import { openBook } from "../../../src/lib/openBook.js";

// A wheel account shaped like the real one: premium taken, one lot sold, one
// lot still held and marked.
const IDENTITY_TRADES = [
  { close_date: "2026-07-20", premium_pl: 800, early_close_pl: 0, stock_pl: 0,
    realized_pl: 800, qty: 1, net_credit: 8, short_strike: 320, short_symbol: "S",
    ticker: "TSLA", close_reason: "expired" },
  { close_date: "2026-08-05", premium_pl: 637, early_close_pl: 0, stock_pl: 300,
    realized_pl: 937, qty: 1, net_credit: 6.37, short_strike: 109, short_symbol: "S2",
    ticker: "WMT", close_reason: "assigned" }
];
const IDENTITY_LOTS = [
  { ticker: "TSLA", qty: 100, acquired_date: "2026-07-24", acquired_price: 320 },
  { ticker: "WMT", qty: 100, acquired_date: "2026-07-24", acquired_price: 109,
    disposed_date: "2026-08-05", disposed_price: 112, realized_pl: 300 }
];
const TODAY = "2026-09-10";
const MARK = 415;

test("IDENTITY: performance on the last day equals the Whole view headline", () => {
  const book = openBook(IDENTITY_LOTS, [
    { assetClass: "equity", ticker: "TSLA", qty: 100, currentPrice: MARK, unrealizedPL: 9500 }
  ]);
  const stats = computeStats(IDENTITY_TRADES, 0, "whole", { unrealized: book.unrealized });

  const rows = dailyPortfolio(
    ["2026-07-20", "2026-07-24", "2026-08-05", TODAY],
    IDENTITY_TRADES,
    IDENTITY_LOTS,
    { TSLA: { "2026-07-24": 320, [TODAY]: MARK }, WMT: { "2026-07-24": 109, "2026-08-05": 112 } }
  );
  const last = rows[rows.length - 1];

  // The headline the page prints, and the point the chart ends on.
  assert.equal(stats.totalPL, 800 + 937 + 9500);
  assert.equal(last.performance, stats.totalPL);
  // And the booked halves agree too, which is the part the orphan case breaks.
  assert.equal(last.realized_cum, stats.bookedPL);
});

test("IDENTITY: premium_cum on the last day equals the Premium only headline", () => {
  const stats = computeStats(IDENTITY_TRADES, 0, "premium");
  const rows = dailyPortfolio(
    ["2026-07-20", "2026-08-05", TODAY],
    IDENTITY_TRADES,
    IDENTITY_LOTS,
    { TSLA: { "2026-07-24": 320, [TODAY]: MARK }, WMT: { "2026-08-05": 112 } }
  );
  assert.equal(rows[rows.length - 1].premium_cum, stats.totalPL);
  assert.equal(rows[rows.length - 1].premium_cum, 1437);
});

test("IDENTITY: an ORPHANED lot is exactly the gap between the two sides", () => {
  // tradeReconstruction.ts:1030 adds a lot with no resolvable owner to
  // `orphaned` and to no trade row, so its result reaches `stock_pl` nowhere
  // while this walk counts it. Not a rounding term — it is unbounded, and the
  // screen has to show it rather than let two numbers disagree in silence.
  const orphan = { ticker: "XLI", qty: 100, acquired_date: "2026-07-24", acquired_price: 130,
                   disposed_date: "2026-08-01", disposed_price: 122, realized_pl: -800 };
  const stats = computeStats(IDENTITY_TRADES, 0, "whole");
  const rows = dailyPortfolio(
    ["2026-07-20", "2026-08-05", TODAY],
    IDENTITY_TRADES,
    IDENTITY_LOTS.concat([orphan]),
    { TSLA: { "2026-07-24": 320, [TODAY]: MARK }, WMT: { "2026-08-05": 112 }, XLI: { "2026-08-01": 122 } }
  );
  const last = rows[rows.length - 1];
  // The walk sees the orphan; the trade rows do not.
  assert.equal(last.realized_cum - stats.bookedPL, -800);
});
