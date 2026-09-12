import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionDay,
  equityDays,
  closesByDay,
  dailyPortfolio,
  legsFromRecords,
  fallbackCalendar,
  priceProblems,
  baseTicker
} from "./dailyPortfolio.ts";

// ---------------------------------------------------------------------------
// sessionDay
// ---------------------------------------------------------------------------

// Alpaca's two stampings of the SAME session, written out rather than as bare
// integers, because the whole defect these tests exist for was a number whose
// meaning nobody checked.
const at = (iso: string) => Date.parse(iso) / 1000;

test("sessionDay reads unix SECONDS, not milliseconds", () => {
  // 2026-09-01 20:00:00 UTC — a US close in daylight time.
  assert.equal(sessionDay(1788292800), "2026-09-01");
  // The same number read as milliseconds lands in 1970, which is the bug this
  // test exists to catch.
  assert.equal(new Date(1788292800).toISOString().slice(0, 4), "1970");
});

test("sessionDay reads the stamp the feed actually sends", () => {
  // Not a constructed example. This is a real entry from Alpaca's 1D portfolio
  // history for a paper account, captured through equityHistory's `probe` path
  // on 12 Sep 2026, and every one of that account's 252 entries has this shape:
  // midnight UTC of the day AFTER the session, which is 20:00 in New York ON
  // the session day. Reading the UTC date — which is what this used to do —
  // files Friday's session on a Saturday.
  assert.equal(new Date(1789171200 * 1000).toISOString(), "2026-09-12T00:00:00.000Z");
  assert.equal(sessionDay(1789171200), "2026-09-11");
});

test("sessionDay maps midnight-Eastern stamps back to the session that ENDED", () => {
  // THE DEFECT. Alpaca stamps a 1D entry at midnight Eastern FOLLOWING the
  // session, which is 04:00 UTC on the next calendar day. Read as a UTC date —
  // which is what this did — Monday's session is filed on Tuesday, and every
  // row in account_equity_daily was one session late for as long as the table
  // existed.
  assert.equal(sessionDay(at("2026-09-01T04:00:00Z")), "2026-08-31"); // Monday's
  assert.equal(sessionDay(at("2026-09-02T04:00:00Z")), "2026-09-01"); // Tuesday's
  // And the one that made it visible without a broker: Friday's session stamped
  // at midnight Eastern lands on a Saturday UTC date. The market does not open
  // on Saturday, so a Saturday row was always proof of this bug.
  assert.equal(sessionDay(at("2026-09-12T04:00:00Z")), "2026-09-11"); // Friday's
});

test("sessionDay leaves a close-of-session stamp on its own day", () => {
  // 16:00 Eastern is after the bell, so the same rule reads it unchanged —
  // one rule for both stampings rather than a guess about which is in use.
  assert.equal(sessionDay(at("2026-09-01T20:00:00Z")), "2026-09-01");
  // Standard time, when the close is 21:00 UTC and midnight Eastern is 05:00.
  assert.equal(sessionDay(at("2026-12-01T21:00:00Z")), "2026-12-01");
  assert.equal(sessionDay(at("2026-12-02T05:00:00Z")), "2026-12-01");
});

test("sessionDay refuses nonsense rather than returning an epoch date", () => {
  assert.equal(sessionDay(0), null);
  assert.equal(sessionDay(-1), null);
  assert.equal(sessionDay(NaN), null);
});

// ---------------------------------------------------------------------------
// equityDays
// ---------------------------------------------------------------------------

// Three consecutive sessions — Monday, Tuesday, Wednesday — each stamped the
// way Alpaca stamps them, at midnight Eastern after the session closed.
const MON = at("2026-09-01T04:00:00Z"); // → 2026-08-31
const TUE = at("2026-09-02T04:00:00Z"); // → 2026-09-01
const WED = at("2026-09-03T04:00:00Z"); // → 2026-09-02

test("equityDays labels each entry with the session it belongs to", () => {
  const { days } = equityDays({ timestamp: [MON, TUE, WED], equity: [1, 2, 3] });
  assert.deepEqual(days.map((r) => r.day), ["2026-08-31", "2026-09-01", "2026-09-02"]);
});

test("equityDays drops the unfunded days before the first deposit", () => {
  const { days } = equityDays({
    timestamp: [MON, TUE, WED],
    equity: [0, 140000, 140120],
    profit_loss: [0, 0, 120],
    base_value: 140000
  });
  assert.equal(days.length, 2);
  assert.equal(days[0].equity, 140000);
  assert.equal(days[0].base_value, 140000);
});

test("equityDays keeps a genuine zero AFTER the account has been funded", () => {
  // An account drawn to zero is a fact about the account; only the leading
  // zeros are the artefact.
  const { days } = equityDays({ timestamp: [MON, TUE], equity: [140000, 0] });
  assert.equal(days.length, 2);
  assert.equal(days[1].equity, 0);
});

test("equityDays skips a gap rather than writing it as zero", () => {
  const { days } = equityDays({ timestamp: [MON, TUE, WED], equity: [140000, null, 141000] });
  assert.deepEqual(days.map((r) => r.equity), [140000, 141000]);
});

test("equityDays takes the last entry for a repeated day", () => {
  // The same session read twice — once at its close, once at midnight Eastern
  // after it. Both must reduce to one day, which they only do if the mapping
  // is right.
  const { days } = equityDays({
    timestamp: [at("2026-09-01T20:00:00Z"), at("2026-09-02T04:00:00Z")],
    equity: [140000, 140500]
  });
  assert.equal(days.length, 1);
  assert.equal(days[0].day, "2026-09-01");
  assert.equal(days[0].equity, 140500);
});

test("equityDays refuses an entry that lands on a weekend, and counts it", () => {
  // Insurance, not a filter: with the mapping correct nothing reaches this.
  // 16:00 on a Saturday is after the bell on a day with no bell, so it is
  // evidence the stamping changed rather than evidence about the account.
  const { days, skippedWeekend } = equityDays({
    timestamp: [at("2026-09-12T20:00:00Z"), TUE],
    equity: [140000, 140500]
  });
  assert.equal(skippedWeekend, 1);
  assert.deepEqual(days.map((r) => r.day), ["2026-09-01"]);
});

test("equityDays on an empty or missing payload returns nothing, not a throw", () => {
  assert.deepEqual(equityDays(null), { days: [], skippedWeekend: 0 });
  assert.deepEqual(equityDays({}), { days: [], skippedWeekend: 0 });
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

// ---------------------------------------------------------------------------
// Option legs still open — the half the line never had
//
// Fixtures are the owner's real Alton Live book as the broker reported it in
// the 8 Sep 14:56 UTC position dump: 210 TSLA shares, a long put protecting
// them, a long call, short calls written against them, and short NVDA puts.
// A SNAPSHOT -- all five had closed by 9 Sep. Real numbers from a real book,
// which is what makes them worth testing against; not a description of the
// account today.
// ---------------------------------------------------------------------------

const LEG_DAYS = ["2026-09-01", "2026-09-02", "2026-09-03"];

test("an open LONG put is marked on every day since it was opened", () => {
  // Paid $435 for one contract; the day it is worth $4.20 a share it is -$15.
  const rows = dailyPortfolio(LEG_DAYS, [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: "2026-09-02", multiplier: 100 }
    ],
    optionCloses: {
      TSLA260909P00365000: { "2026-09-02": 4.35, "2026-09-03": 4.20 }
    }
  });
  assert.deepEqual(rows.map((r) => r.options_open), [0, 0, -15]);
  assert.deepEqual(rows.map((r) => r.performance), [0, 0, -15]);
});

test("an open SHORT call losing money reads as a loss, not a gain", () => {
  // Sold for $226, now costs $299 to buy back. The broker signs both the
  // quantity and the cost basis, so one formula covers both sides -- an abs()
  // here is the sign error that printed a loss as a gain once already.
  const rows = dailyPortfolio(["2026-09-03"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260911C00375000", qty: -1, costBasis: -226, from: "2026-09-01", multiplier: 100 }
    ],
    optionCloses: { TSLA260911C00375000: { "2026-09-03": 2.99 } }
  });
  assert.equal(rows[0].options_open, -73);
});

test("an open short call winning reads as a gain", () => {
  const rows = dailyPortfolio(["2026-09-03"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260911C00375000", qty: -1, costBasis: -226, from: "2026-09-01", multiplier: 100 }
    ],
    optionCloses: { TSLA260911C00375000: { "2026-09-03": 1.00 } }
  });
  assert.equal(rows[0].options_open, 126);
});

test("the whole Alton book marks to the broker's own -$390", () => {
  const rows = dailyPortfolio(["2026-09-08"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: "2026-08-01", multiplier: 100 },
      { symbol: "TSLA260918C00352500", qty: 1, costBasis: 1357, from: "2026-08-01", multiplier: 100 },
      { symbol: "TSLA260911C00375000", qty: -1, costBasis: -226, from: "2026-08-01", multiplier: 100 },
      { symbol: "TSLA260918C00362500", qty: -2, costBasis: -1738, from: "2026-08-01", multiplier: 100 },
      { symbol: "NVDA260909P00222500", qty: -3, costBasis: -123, from: "2026-08-01", multiplier: 100 }
    ],
    optionCloses: {
      TSLA260909P00365000: { "2026-09-08": 4.20 },
      TSLA260918C00352500: { "2026-09-08": 17.85 },
      TSLA260911C00375000: { "2026-09-08": 2.99 },
      TSLA260918C00362500: { "2026-09-08": 12.10 },
      NVDA260909P00222500: { "2026-09-08": 0.57 }
    }
  });
  assert.equal(rows[0].options_open, -390);
});

test("a leg contributes nothing before the day it was opened", () => {
  const rows = dailyPortfolio(LEG_DAYS, [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: "2026-09-03", multiplier: 100 }
    ],
    optionCloses: { TSLA260909P00365000: { "2026-09-01": 9, "2026-09-02": 8, "2026-09-03": 4.2 } }
  });
  // The contract had a price on 09-01 and 09-02; the account did not hold it.
  assert.deepEqual(rows.map((r) => r.options_open), [0, 0, -15]);
});

test("a leg with no opening date is NAMED, not silently written as zero", () => {
  // The test that blessed the worst defect in this file. It was titled exactly
  // as it is now and then asserted `options_open === 0` and `performance === 0`
  // -- that is, it asserted the leg was NOT named, which is the opposite of its
  // own title, and the suite went green over a chart storing $0.00 for a live
  // option book and reporting itself complete.
  //
  // `from` goes null for ordinary reasons: a leg acquired by assignment or
  // exercise has no order behind it, a leg opened before the order window is
  // not in it, and a caught fetch error nulls every leg at once.
  const rows = dailyPortfolio(["2026-09-03"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: null, multiplier: 100 }
    ],
    optionCloses: { TSLA260909P00365000: { "2026-09-03": 4.2 } }
  });
  assert.equal(rows[0].options_open, null);
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA260909P00365000"]);
});

test("an undatable leg does not quietly cost the account its whole option book", () => {
  // The shape that made this severe: four legs priced fine, one undatable, and
  // the day stored as if the book were complete.
  const rows = dailyPortfolio(["2026-09-08"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: "2026-08-01" },
      { symbol: "TSLA260918C00352500", qty: 1, costBasis: 1357, from: null }
    ],
    optionCloses: {
      TSLA260909P00365000: { "2026-09-08": 4.20 },
      TSLA260918C00352500: { "2026-09-08": 17.85 }
    }
  });
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA260918C00352500"]);
});

test("an ADJUSTED contract is priced — its premium multiplier is still 100", () => {
  // This test asserted a REFUSAL, and the refusal was wrong. occ.ts:25-28
  // settles it against the symbology: a 3-for-2 split turns one $90 contract
  // into one $60 contract delivering 150 shares -- the DELIVERABLE changes and
  // the premium multiplier stays 100. Refusing would withhold a leg that can be
  // priced exactly. Nothing in this walk derives shares from a strike, which is
  // the calculation a corporate action would actually break.
  const rows = dailyPortfolio(["2026-09-03"], [], [], {}, {
    optionLegs: [
      { symbol: "TSLA1260909P00365000", qty: 1, costBasis: 435, from: "2026-09-01" }
    ],
    optionCloses: { TSLA1260909P00365000: { "2026-09-03": 4.2 } }
  });
  assert.equal(rows[0].options_open, -15);
  assert.deepEqual(rows[0].unpriced, []);
});

test("a caller that does know of a different premium multiple can still withhold", () => {
  const rows = dailyPortfolio(["2026-09-03"], [], [], {}, {
    optionLegs: [
      { symbol: "XYZ260909P00365000", qty: 1, costBasis: 435, from: "2026-09-01", multiplier: 10 }
    ],
    optionCloses: { XYZ260909P00365000: { "2026-09-03": 4.2 } }
  });
  assert.equal(rows[0].options_open, null);
  assert.deepEqual(rows[0].unpriced, ["XYZ260909P00365000"]);
});

test("a thin strike that did not print that session carries its last close forward", () => {
  // An OTM put at $0.41 does not trade every day. An exact-day lookup nulled
  // the WHOLE book's mark on any session one leg was quiet -- routine, not
  // exceptional, and it includes today's bar on a delayed feed.
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02", "2026-09-03"], [], [], {}, {
      optionLegs: [
        { symbol: "NVDA260909P00222500", qty: -3, costBasis: -123, from: "2026-09-01" }
      ],
      optionCloses: { NVDA260909P00222500: { "2026-09-01": 0.41, "2026-09-03": 0.57 } }
    }
  );
  assert.deepEqual(rows.map((r) => r.options_open), [0, 0, -48]);
  assert.deepEqual(rows.map((r) => r.unpriced), [[], [], []]);
});

test("a leg with no bar that day withholds the option half only", () => {
  // An unvaluable option leg must not blank the SHARE mark, which is a
  // statement about a different position entirely.
  const rows = dailyPortfolio(["2026-09-03"], [],
    [{ ticker: "TSLA", qty: 100, acquired_date: "2026-09-01", acquired_price: 320 }],
    { TSLA: { "2026-09-03": 340 } },
    {
      optionLegs: [
        { symbol: "TSLA260909P00365000", qty: 1, costBasis: 435, from: "2026-09-01", multiplier: 100 }
      ],
      optionCloses: {}
    }
  );
  assert.equal(rows[0].shares_open, 2000);
  assert.equal(rows[0].options_open, null);
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA260909P00365000"]);
});

test("an account with no open option legs reports zero, not unknown", () => {
  const rows = dailyPortfolio(["2026-09-03"],
    [{ close_date: "2026-09-03", premium_pl: 500, early_close_pl: 0 }], [], {});
  assert.equal(rows[0].options_open, 0);
  assert.equal(rows[0].performance, 500);
});

// ---------------------------------------------------------------------------
// Legs that have SINCE CLOSED — the half the line still did not have
//
// The tests above all hand the walk legs that are open today, which is exactly
// what the caller used to do, and is why every one of them passed while the
// defect was live. A walk that reaches back years cannot be fed a list of
// what is open now.
//
// Fixtures are Alton Live, week of 7-11 September 2026, from the broker's own
// records. Friday 4 September closed with two short TSLA puts in the money;
// both were assigned over the weekend. The broker's equity column on the
// 4 September row read $138,870.97 and the reconstruction's own line read
// -$1,574 with `options_open: 0` and `unpriced: []` -- a day the account was
// carrying about two thousand dollars of option risk, stored as fully priced
// and empty. The owner: *"how I just earned only six hundred ... this rebound
// should be at least two thousand."*
// ---------------------------------------------------------------------------

// The two puts, as `trade_records` stored them: opened 3 Sep for $1.44 and
// $1.60 a share, expired 4 Sep, settled (assigned) on the 7th.
const EXPIRY_WEEK = [
  { open_date: "2026-09-03", close_date: "2026-09-07", qty: 1,
    short_symbol: "TSLA260904P00362500", short_entry: 1.44 },
  { open_date: "2026-09-03", close_date: "2026-09-07", qty: 1,
    short_symbol: "TSLA260904P00367500", short_entry: 1.60 }
];
// What they were worth at each close. TSLA at $355 on the 4th puts the 362.5
// at $7.50 and the 367.5 at $12.50 of intrinsic.
const EXPIRY_CLOSES = {
  TSLA260904P00362500: { "2026-09-03": 1.44, "2026-09-04": 7.50 },
  TSLA260904P00367500: { "2026-09-03": 1.60, "2026-09-04": 12.50 }
};

test("a short put carried into expiry is marked on the day it was carried", () => {
  const rows = dailyPortfolio(
    ["2026-09-03", "2026-09-04", "2026-09-08"], [], [], {},
    { optionLegs: legsFromRecords(EXPIRY_WEEK), optionCloses: EXPIRY_CLOSES }
  );
  // Opened at the money it was sold for, so day one is flat.
  assert.equal(rows[0].options_open, 0);
  // 4 Sep: sold for $144 + $160, now worth $750 + $1,250 to buy back.
  // (144 - 750) + (160 - 1250) = -$1,696. This is the figure that was stored
  // as $0.00, and it is the whole of the owner's missing rebound.
  assert.equal(rows[1].options_open, -1696);
  // Settled on the 7th, so by the 8th they are off the book and their result
  // lives in premium_cum instead.
  assert.equal(rows[2].options_open, 0);
  // And never withheld: every day was priced.
  assert.deepEqual(rows.map((r) => r.unpriced), [[], [], []]);
});

test("a leg closed ON a day is money that day, not a position at its close", () => {
  // The double-count this rule exists to stop: `premium_cum` books the result
  // on close_date, so marking the leg on that same day counts the same dollars
  // twice, with opposite signs on either side of the walk.
  const record = {
    close_date: "2026-09-04", premium_pl: 144, early_close_pl: 0,
    open_date: "2026-09-03", qty: 1, short_symbol: "TSLA260904P00362500", short_entry: 1.44
  };
  const rows = dailyPortfolio(
    ["2026-09-03", "2026-09-04"], [record], [], {},
    { optionLegs: legsFromRecords([record]), optionCloses: EXPIRY_CLOSES }
  );
  assert.equal(rows[0].options_open, 0);
  assert.equal(rows[1].options_open, 0);
  // 144 booked, nothing marked. Not 144 booked AND -606 marked.
  assert.equal(rows[1].premium_cum, 144);
  assert.equal(rows[1].performance, 144);
});

test("a leg that has closed does not blank the rest of the account's life", () => {
  // A record whose opening date is unknown withholds the days it may have been
  // on the book — and stops there. Before this rule an undatable leg was
  // counted as held on EVERY day, so one assignment with no order behind it
  // nulled the chart from the account's first trade to its last.
  const rows = dailyPortfolio(
    ["2026-09-03", "2026-09-04", "2026-09-08"], [], [], {},
    {
      optionLegs: legsFromRecords([
        { open_date: null, close_date: "2026-09-07", qty: 1,
          short_symbol: "TSLA260904P00362500", short_entry: 1.44 }
      ]),
      optionCloses: EXPIRY_CLOSES
    }
  );
  assert.deepEqual(rows.map((r) => r.options_open), [null, null, 0]);
  assert.deepEqual(rows.map((r) => r.unpriced), [
    ["TSLA260904P00362500"], ["TSLA260904P00362500"], []
  ]);
});

test("a closed leg with no bar for that day withholds it rather than dropping it", () => {
  // The failure mode that matters: a contract whose history the feed will not
  // serve must make the day say so, not quietly shrink the book.
  const rows = dailyPortfolio(
    ["2026-09-04"], [], [], {},
    { optionLegs: legsFromRecords(EXPIRY_WEEK), optionCloses: {} }
  );
  assert.equal(rows[0].options_open, null);
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA260904P00362500", "TSLA260904P00367500"]);
});

test("legsFromRecords signs a short and a long the way the broker does", () => {
  const [short, long] = legsFromRecords([{
    open_date: "2026-09-03", close_date: "2026-09-07", qty: 2,
    short_symbol: "SPY260904P00760000", short_entry: 0.15,
    long_symbol: "SPY260904P00755000", long_entry: 0.05
  }]);
  // Sold 2 contracts at $0.15 a share: quantity negative, a $30 credit taken.
  assert.deepEqual(short, {
    symbol: "SPY260904P00760000", qty: -2, costBasis: -30,
    from: "2026-09-03", to: "2026-09-07"
  });
  // Bought 2 at $0.05: quantity positive, a $10 debit paid.
  assert.deepEqual(long, {
    symbol: "SPY260904P00755000", qty: 2, costBasis: 10,
    from: "2026-09-03", to: "2026-09-07"
  });
});

test("legsFromRecords leaves the live book to the broker", () => {
  // An open record would be the same position the positions endpoint reports,
  // and counting it from both lists doubles it on every day they overlap.
  assert.deepEqual(legsFromRecords([
    { open_date: "2026-09-03", close_date: null, qty: 1,
      short_symbol: "TSLA260918P00352500", short_entry: 4.27 }
  ]), []);
  assert.deepEqual(legsFromRecords(null), []);
  assert.deepEqual(legsFromRecords([]), []);
});

test("a record with no entry price yields a leg that cannot be valued", () => {
  // Not no leg. Dropping it reports the day as complete while a position is
  // missing from it, which is the defect this file exists to refuse.
  const legs = legsFromRecords([{
    open_date: "2026-09-03", close_date: "2026-09-07", qty: 1,
    short_symbol: "TSLA260904P00362500", short_entry: null
  }]);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].costBasis, null);
  const rows = dailyPortfolio(["2026-09-04"], [], [], {},
    { optionLegs: legs, optionCloses: EXPIRY_CLOSES });
  assert.equal(rows[0].performance, null);
  assert.deepEqual(rows[0].unpriced, ["TSLA260904P00362500"]);
});

test("the same strike sold twice is marked in each window and neither between", () => {
  // Re-opening a contract is routine on a weekly wheel. Two records, disjoint
  // lives, one symbol: the walk must not carry the first one's cost into the
  // gap, nor the second one's back before it was sold.
  const rows = dailyPortfolio(
    ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"], [], [], {},
    {
      optionLegs: legsFromRecords([
        { open_date: "2026-09-01", close_date: "2026-09-02", qty: 1,
          short_symbol: "NVDA260904P00222500", short_entry: 0.43 },
        { open_date: "2026-09-04", close_date: "2026-09-08", qty: 1,
          short_symbol: "NVDA260904P00222500", short_entry: 0.41 }
      ]),
      optionCloses: {
        NVDA260904P00222500: {
          "2026-09-01": 0.43, "2026-09-02": 0.10, "2026-09-03": 0.20, "2026-09-04": 0.30
        }
      }
    }
  );
  // Day 1 flat, day 2 closed (booked, not marked), day 3 nothing on the book,
  // day 4 sold again at $0.41 and worth $0.30: +$11.
  assert.deepEqual(rows.map((r) => r.options_open), [0, 0, 0, 11]);
});
