// The first fixture is the incident: a JPM scan built on $363.54 while the
// stock had never traded above $355 that day, which sold a short put that was
// already in the money.
//
//   node --experimental-strip-types --test supabase/functions/_shared/marketPrice.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { spotFromSnapshot, MAX_PRICE_AGE_MS } from "./marketPrice.ts";

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
