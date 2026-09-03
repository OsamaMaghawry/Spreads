// The first fixture is the incident: a JPM scan built on $363.54 while the
// stock had never traded above $355 that day, which sold a short put that was
// already in the money.
//
//   node --experimental-strip-types --test supabase/functions/_shared/marketPrice.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { spotFromSnapshot, closingSpotFromSnapshot, MAX_PRICE_AGE_MS } from "./marketPrice.ts";

const NOW = Date.parse("2026-08-27T14:30:00Z");
const at = (offsetMinutes = 0) => new Date(NOW - offsetMinutes * 60000).toISOString();

const snap = ({ trade, quote, bar }: any = {}) => ({
  latestTrade: trade === null ? undefined : { p: 354.33, t: at(1), ...trade },
  latestQuote: quote === null ? undefined : { bp: 354.31, ap: 354.35, t: at(0), ...quote },
  dailyBar: bar === null ? undefined : { c: 351.2, t: at(60), ...bar }
});

test("the incident: a wide quote must never outvote a real trade", () => {
  // The mid of this quote is $363.54 — the number the trade dialog showed.
  // Nobody traded there. The old getSpot preferred it because both sides were
  // simply greater than zero.
  const r = spotFromSnapshot(snap({ quote: { bp: 345.0, ap: 382.08 } }), NOW);
  assert.equal(r.price, 354.33);
  assert.equal(r.source, "trade");
  assert.equal(r.trusted, true);
});

test("a quote mid that disagrees with the last trade is not trusted", () => {
  // Tight enough to look respectable, but 2.6% away from the print — the same
  // divergence as the incident. Two sources this far apart means the price is
  // not known, and picking strikes on a guess is what caused this.
  const r = spotFromSnapshot(snap({ quote: { bp: 363.52, ap: 363.56 } }), NOW);
  assert.equal(r.price, 354.33, "the trade is a fact; the mid is a calculation");
  assert.equal(r.trusted, false);
  assert.match(r.reason, /disagree by 2\.6%/);
});

test("a normal snapshot is trusted and reads from the trade", () => {
  const r = spotFromSnapshot(snap(), NOW);
  assert.equal(r.price, 354.33);
  assert.equal(r.source, "trade");
  assert.equal(r.trusted, true);
  assert.equal(r.reason, null);
});

test("a crossed quote is ignored rather than averaged", () => {
  const r = spotFromSnapshot(snap({ trade: null, quote: { bp: 360, ap: 350 } }), NOW);
  assert.notEqual(r.source, "quote");
  assert.equal(r.source, "dailyBar");
  assert.equal(r.trusted, false);
});

test("with no trade, a tight quote is used", () => {
  const r = spotFromSnapshot(snap({ trade: null }), NOW);
  assert.equal(r.source, "quote");
  assert.equal(r.price, 354.33);
  assert.equal(r.trusted, true);
});

test("with no trade, a wide quote falls through to the daily bar, untrusted", () => {
  const r = spotFromSnapshot(snap({ trade: null, quote: { bp: 345.0, ap: 382.08 } }), NOW);
  assert.equal(r.source, "dailyBar");
  assert.equal(r.price, 351.2);
  assert.equal(r.trusted, false);
});

test("a stale price is still returned, but never as fact", () => {
  const old = at(MAX_PRICE_AGE_MS / 60000 + 5);
  const r = spotFromSnapshot(snap({ trade: { t: old }, quote: null }), NOW);
  assert.equal(r.price, 354.33, "the dashboard still needs something to render");
  assert.equal(r.trusted, false, "the scanner must not pick strikes on it");
});

test("no data at all is zero and untrusted, never a silent fallback", () => {
  const r = spotFromSnapshot(snap({ trade: null, quote: null, bar: null }), NOW);
  assert.equal(r.price, 0);
  assert.equal(r.trusted, false);
  assert.equal(spotFromSnapshot(null, NOW).price, 0);
});

test("a zero or negative print is not a price", () => {
  const r = spotFromSnapshot(snap({ trade: { p: 0 }, quote: null }), NOW);
  assert.equal(r.source, "dailyBar");
});

// --- After the close -------------------------------------------------------
//
// The daily position report ran 75 minutes past a 20:00 close, so every price
// failed the 30-minute freshness rule and every short leg came back "price not
// trusted". Thirteen rows of it, every weekday, and structurally incapable of
// saying anything else — the through-strike and near-strike rules sit behind
// the trusted branch and were never reached.

// 21:15 UTC — when the daily cron fires, 75 minutes past a 20:00 close.
const AFTER_CLOSE = Date.parse("2026-09-01T21:15:00Z");
// A snapshot as it looks at 21:15 UTC: the last trade is the 20:00 close print.
const afterClose = ({ trade, quote, bar }: any = {}) => ({
  latestTrade: trade === null ? undefined : { p: 462.1, t: "2026-09-01T19:59:58Z", ...trade },
  latestQuote: quote === null ? undefined : { bp: 462.05, ap: 462.15, t: "2026-09-01T19:59:59Z", ...quote },
  dailyBar: bar === null ? undefined : { c: 462.1, t: "2026-09-01T20:00:00Z", ...bar }
});

test("the same after-close snapshot: untrusted live, trusted as a close", () => {
  const d = afterClose();
  const live = spotFromSnapshot(d, AFTER_CLOSE);
  assert.equal(live.trusted, false, "the live ladder must keep its 30-minute rule");
  assert.match(live.reason!, /more than 30 minutes old/);

  const closed = closingSpotFromSnapshot(d, AFTER_CLOSE);
  assert.equal(closed.trusted, true, "after the bell the close IS the price");
  assert.equal(closed.price, 462.1);
  assert.equal(closed.source, "close");
  assert.equal(closed.reason, null);
});

test("the close is preferred over a stale print even when they differ", () => {
  // The last tick and the official close can disagree — late prints, auction.
  // The bar is the settled number and is what moneyness is judged against.
  const r = closingSpotFromSnapshot(afterClose({ trade: { p: 999 }, bar: { c: 462.1 } }), AFTER_CLOSE);
  assert.equal(r.price, 462.1);
  assert.equal(r.source, "close");
});

test("no daily bar falls back to the live ladder rather than inventing a close", () => {
  // Halted, delisted, or a symbol the feed does not carry. Withhold rather than
  // default — the same rule everywhere else in this file.
  const r = closingSpotFromSnapshot(afterClose({ bar: null }), AFTER_CLOSE);
  assert.equal(r.trusted, false);
  assert.equal(r.source, "trade");

  const nothing = closingSpotFromSnapshot(null, AFTER_CLOSE);
  assert.equal(nothing.price, 0);
  assert.equal(nothing.trusted, false);
});

test("a zero or missing close is not a close", () => {
  assert.equal(closingSpotFromSnapshot(afterClose({ bar: { c: 0 } }), AFTER_CLOSE).source, "trade");
});

test("loosening after the close did not loosen the live ladder", () => {
  // The JPM incident guard, restated against the new export: nothing added here
  // may make a stale in-session price acceptable to the scanner.
  const stale = snap({ trade: { t: at(MAX_PRICE_AGE_MS / 60000 + 1) } });
  assert.equal(spotFromSnapshot(stale, NOW).trusted, false);
});

// Yesterday's close travels with every reading so the screens can show today's
// move. It rides along rather than being turned into a percentage here: the
// dashboard overlays a streaming price and recomputes the move against it.
test("the previous close is carried on every verdict, and only when it is real", () => {
  const withPrev = { ...snap(), prevDailyBar: { c: 349.15, t: at(1440) } };
  assert.equal(spotFromSnapshot(withPrev, NOW).prevClose, 349.15);

  // Untrusted readings carry it too -- the price is doubted, not the close.
  const stale = { ...snap({ trade: { t: at(120) }, quote: null }), prevDailyBar: { c: 349.15 } };
  const r: any = spotFromSnapshot(stale, NOW);
  assert.equal(r.trusted, false);
  assert.equal(r.prevClose, 349.15);

  // After the bell, judged as a close, it is still there.
  assert.equal(closingSpotFromSnapshot(withPrev, NOW).prevClose, 349.15);

  // Absent, zero or no snapshot at all reads as null, never as a price.
  assert.equal(spotFromSnapshot(snap(), NOW).prevClose, null);
  assert.equal(spotFromSnapshot({ ...snap(), prevDailyBar: { c: 0 } }, NOW).prevClose, null);
  assert.equal(spotFromSnapshot(null, NOW).prevClose, null);
});
