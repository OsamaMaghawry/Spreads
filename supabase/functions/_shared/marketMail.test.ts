import test from "node:test";
import assert from "node:assert/strict";
import {
  etClock, inBriefWindow, holdingsOf, moveFromSnapshot, pct, noLongDashes, keepKnownUrls,
  renderBrief, renderAlert
} from "./marketMail.ts";

test("the brief window is New York time through both daylight-saving states", () => {
  // 12:45 UTC in October (EDT) is 8:45 in New York; in January (EST) it is 7:45.
  assert.equal(inBriefWindow(etClock(new Date("2026-10-12T12:45:00Z"))), true);
  assert.equal(inBriefWindow(etClock(new Date("2027-01-12T12:45:00Z"))), false);
  assert.equal(inBriefWindow(etClock(new Date("2027-01-12T13:45:00Z"))), true);
  // After the open, nothing goes out.
  assert.equal(inBriefWindow(etClock(new Date("2026-10-12T13:31:00Z"))), false);
  assert.equal(etClock(new Date("2026-10-12T12:45:00Z")).day, "2026-10-12");
  assert.equal(etClock(new Date("2026-10-13T03:00:00Z")).day, "2026-10-12");
});

test("holdings read as words, by underlying, options in expiry order", () => {
  const h = holdingsOf([
    { symbol: "AAPL", qty: "100", side: "long", asset_class: "us_equity" },
    { symbol: "AAPL261120C00250000", qty: "-1", side: "short", asset_class: "us_option" },
    { symbol: "AAPL261017P00180000", qty: "-2", side: "short", asset_class: "us_option" },
    { symbol: "SPY261017P00560000", qty: "1", side: "long", asset_class: "us_option" },
    { symbol: "BTCUSD", qty: "0.1", side: "long", asset_class: "crypto" },
    { symbol: "TSLA", qty: "-5", asset_class: "us_equity" }
  ]);
  assert.deepEqual(h.map((x) => x.symbol), ["AAPL", "SPY", "TSLA"]);
  assert.deepEqual(h[0].lines, ["100 shares", "Short 2 puts 180, Oct 17", "Short 1 call 250, Nov 20"]);
  assert.deepEqual(h[1].lines, ["Long 1 put 560, Oct 17"]);
  assert.deepEqual(h[2].lines, ["Short 5 shares"]);
});

test("a long list of legs is cut to four and counted", () => {
  const legs = [17, 24, 31].flatMap((d) => [
    { symbol: `QQQ2610${d < 30 ? d : 31}P00500000`, qty: "-1", side: "short" },
    { symbol: `QQQ2610${d < 30 ? d : 31}P00495000`, qty: "1", side: "long" }
  ]);
  const [q] = holdingsOf(legs);
  assert.equal(q.lines.length, 5);
  assert.equal(q.lines[4], "and 2 more option legs");
});

test("a move is against the previous close, from the latest trade", () => {
  const m = moveFromSnapshot("SPY", { latestTrade: { p: 101, t: "2026-10-12T12:44:00Z" }, prevDailyBar: { c: 100 } }, "S&P 500");
  assert.ok(Math.abs((m.change ?? 0) - 0.01) < 1e-12);
  assert.equal(pct(m.change), "+1.0%");
  assert.equal(pct(-0.0234), "-2.3%");
  assert.equal(moveFromSnapshot("X", {}).change, null);
});

test("no long dash survives into an email", () => {
  assert.equal(noLongDashes("Stocks rose — led by tech"), "Stocks rose, led by tech");
  assert.equal(noLongDashes("8:30–9:00"), "8:30 to 9:00");
  assert.doesNotMatch(noLongDashes("a–b — c"), /[–—]/);
});

test("only links that were in the material survive", () => {
  const known = new Set(["https://a.com/x", "https://b.com/y"]);
  assert.deepEqual(keepKnownUrls(["https://a.com/x", "https://made.up/z", null, " https://b.com/y "], known), ["https://a.com/x", "https://b.com/y"]);
});

test("the brief renders every section, the holdings and the footer, with no long dash", () => {
  const notes = new Map([["AAPL", { symbol: "AAPL", text: "Apple said — its event is Tuesday.", urls: ["https://a.com/x"] }]]);
  const { subject, html, text } = renderBrief({
    date: new Date("2026-10-12T12:45:00Z"),
    market: {
      subject: "Futures flat — CPI at 8:30",
      headline: "Futures are flat ahead of CPI",
      summary: "Stocks are little changed.",
      overnight: [{ region: "Asia", text: "Nikkei +0.5%", source_url: "https://a.com/x" }],
      movers: [{ text: "Oil fell", source_url: null }],
      calendar: [{ time_et: "8:30", event: "CPI" }]
    },
    tape: [moveFromSnapshot("SPY", { latestTrade: { p: 101 }, prevDailyBar: { c: 100 } }, "S&P 500")],
    tapeAsOf: "2026-10-12T12:44:00Z",
    accounts: [
      { name: "Alpaca Paper", isPaper: true, holdings: [{ symbol: "AAPL", lines: ["100 shares"] }] },
      { name: "Robinhood", isPaper: false, holdings: [], error: "timeout" }
    ],
    notes,
    moves: new Map(),
    earnings: { AAPL: "2026-10-29" },
    preview: true
  });
  assert.equal(subject, "[Preview] Futures flat, CPI at 8:30");
  for (const s of ["Before the bell", "Pre-market", "Overnight", "What is moving", "Today, ET", "Your holdings", "EARNINGS Oct 29", "Could not read this account", "not a broker"]) {
    assert.ok(html.includes(s), `html is missing ${s}`);
  }
  assert.ok(text.includes("AAPL: 100 shares"));
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ""), /[–—]/);
  assert.doesNotMatch(text, /[–—]/);
});

test("an alert names the symbol, the move and where it is held", () => {
  const { subject, html, text } = renderAlert({
    symbol: "TSLA", title: "Tesla recalls 200,000 vehicles", what: "The recall covers a steering fault.",
    urls: ["https://a.com/x"], publishedAt: "2026-10-12T15:02:00Z",
    move: moveFromSnapshot("TSLA", { latestTrade: { p: 240, t: "2026-10-12T15:05:00Z" }, prevDailyBar: { c: 250 } }),
    held: [{ account: "Robinhood", lines: ["Short 1 put 220, Oct 17"] }], kind: "news"
  });
  assert.equal(subject, "TSLA: Tesla recalls 200,000 vehicles");
  assert.ok(html.includes("-4.0%") && html.includes("Robinhood") && html.includes("11:02 AM ET"));
  assert.ok(text.includes("Robinhood: Short 1 put 220, Oct 17"));
});

test("quiet shares go on one line; news, earnings, big moves and options get a row", async () => {
  const { splitQuiet } = await import("./marketMail.ts");
  const holdings = [
    { symbol: "A", lines: ["10 shares"] },
    { symbol: "B", lines: ["10 shares"] },
    { symbol: "C", lines: ["10 shares"] },
    { symbol: "D", lines: ["10 shares"] },
    { symbol: "E", lines: ["Short 1 put 30, Oct 16"] },
    { symbol: "F", lines: ["10 shares"] }
  ];
  const { shown, quiet } = splitQuiet(holdings, {
    notes: new Map([["A", { symbol: "A", text: "A raised guidance.", urls: [] }], ["F", { symbol: "F", text: null, urls: [] }]]),
    moves: new Map([["B", moveFromSnapshot("B", { latestTrade: { p: 104 }, prevDailyBar: { c: 100 } })],
                    ["C", moveFromSnapshot("C", { latestTrade: { p: 101 }, prevDailyBar: { c: 100 } })]]),
    earnings: { D: "2026-10-20" }
  });
  assert.deepEqual(shown.map((h) => h.symbol), ["A", "B", "D", "E"]);
  assert.deepEqual(quiet.map((h) => h.symbol), ["C", "F"]);
});
