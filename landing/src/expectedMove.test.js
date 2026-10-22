import test from "node:test";
import assert from "node:assert/strict";
import { emEnabled, freshness, titleFor, renderTickerPage, renderMovesIndex, sitemapLines } from "./expectedMove.js";

const now = Date.parse("2026-10-22T18:40:00Z");
const row = (ticker, movePct, extra = {}) => ({
  ticker, name: `${ticker} Inc`, spot: 100, live: true, refreshed_at: "2026-10-22T18:35:00Z", error: null,
  earnings_date: null, earnings_session: null,
  week: { expiry: "2026-10-23", days: 1, straddle: 4.79, move: 6, movePct, low: 94, high: 106, iv: 0.5, strikes: [100], wide: false },
  month: { expiry: "2026-11-20", days: 29, straddle: 9.58, move: 12, movePct: 0.12, low: 88, high: 112, iv: 0.4, strikes: [100], wide: false },
  ...extra
});

test("off unless the deployment turns it on", () => {
  assert.equal(emEnabled({}), false);
  assert.equal(emEnabled({ EXPECTED_MOVE_PAGES: "on" }), true);
});

test("the title carries the number people searched for, and no dash", () => {
  const t = titleFor(row("TSLA", 0.06));
  assert.equal(t, "TSLA expected move this week: ±$6.00 (6.0%)");
  assert.doesNotMatch(t, /[-–—]/);
  assert.doesNotMatch(titleFor({ ...row("TSLA", 0.06), week: { expiry: "2026-10-23", days: 1, error: "No quotes" } }), /\$/);
});

test("every page says how fresh it is, and says plainly when it is not", () => {
  assert.match(freshness(row("TSLA", 0.06), now).text, /^Updated Oct 22, 2:35 PM ET, from live option prices\.$/);
  assert.match(freshness({ ...row("TSLA", 0.06), live: false }, now).text, /at the close/);
  const old = freshness({ ...row("TSLA", 0.06), refreshed_at: "2026-10-15T20:05:00Z" }, now);
  assert.equal(old.stale, true);
  assert.match(old.text, /have not refreshed since/);
});

test("a stock page: the move, the range, the working, and an earnings warning before expiry", () => {
  const r = row("NVDA", 0.06, { earnings_date: "2026-10-23", earnings_session: "amc" });
  const html = renderTickerPage(r, [r, row("AMD", 0.08)], "https://deltamint.app", false);
  assert.match(html, /<title>NVDA expected move this week: ±\$6\.00 \(6\.0%\) \| DeltaMint<\/title>/);
  assert.match(html, /\$94\.00 to \$106\.00/);
  assert.match(html, /\$4\.79 ÷ 0\.798/);
  assert.match(html, /reports earnings on Friday, October 23 after the close, before this expiry/);
  assert.match(html, /href="\/expected-move\/amd"/);
  assert.match(html, /not investment advice/);
  assert.match(html, /rel="canonical" href="https:\/\/deltamint\.app\/expected-move\/nvda"/);
  assert.doesNotMatch(html, /noindex/);
});

test("a page with no usable quotes says why instead of printing a zero", () => {
  const r = { ...row("XYZ", 0.06), week: { expiry: "2026-10-23", days: 1, error: "No two-sided quotes near today's price for this expiry." } };
  const html = renderTickerPage(r, [r], "https://deltamint.app", true);
  assert.match(html, /No two-sided quotes near today/);
  assert.doesNotMatch(html, /\$0\.00/);
  assert.match(html, /noindex/);
});

test("the index lists the biggest expected moves first", () => {
  const html = renderMovesIndex([row("KO", 0.02), row("TSLA", 0.09), row("SPY", 0.01)], "https://deltamint.app", false);
  const order = [...html.matchAll(/href="\/expected-move\/(\w+)"><strong>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["tsla", "ko", "spy"]);
  assert.match(html, /3 popular stocks and funds/);
});

test("sitemap: the index and every stock, each with the day it last changed", () => {
  const lines = sitemapLines([row("TSLA", 0.06), { ...row("KO", 0.02), refreshed_at: "2026-10-21T20:05:00Z" }], "https://deltamint.app");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /<loc>https:\/\/deltamint\.app\/expected-move<\/loc><lastmod>2026-10-22<\/lastmod>/);
  assert.match(lines[2], /expected-move\/ko<\/loc><lastmod>2026-10-21</);
});
