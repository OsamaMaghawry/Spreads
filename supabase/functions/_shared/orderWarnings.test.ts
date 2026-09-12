import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionWarning, priceWarning, driftWarning, itmShortWarning,
  adjustedWarning, coverWarning, unacknowledged
} from "./orderWarnings.ts";

// UTC. The session is 13:30–20:00 on a weekday.
const at = (iso: string) => new Date(iso);
const WED_MIDSESSION = at("2026-09-16T17:00:00Z");
const WED_PREOPEN = at("2026-09-16T12:00:00Z");
const WED_AFTER = at("2026-09-16T21:00:00Z");
const SATURDAY = at("2026-09-12T05:16:00Z");
const FRIDAY_AFTER = at("2026-09-18T21:00:00Z");

// ---------------------------------------------------------------------------
// The market being shut is a fact about the clock, not a fault
// ---------------------------------------------------------------------------

test("nothing is said about the session while it is open", () => {
  assert.equal(sessionWarning(WED_MIDSESSION), null);
});

test("a weekend says it is the weekend, not that a price is stale", () => {
  // The owner was refused an order at 1:16 AM on a Saturday with "Last trade
  // is more than 30 minutes old", which reads as a broken feed. Nothing was
  // broken; the market was shut.
  const w = sessionWarning(SATURDAY)!;
  assert.equal(w.code, "market_closed");
  assert.ok(w.detail.includes("It is the weekend."));
  assert.ok(!/minutes old/.test(w.detail));
  // And it is a warning, never a refusal: Alpaca accepts weekend orders and
  // queues them. The detail now says what will happen to THIS order rather
  // than the vaguer "can still be sent" it used to.
  assert.equal(w.severity, "caution");
  assert.ok(/queue for the open/.test(w.detail), w.detail);
});

test("before the bell and after it are told apart", () => {
  assert.ok(sessionWarning(WED_PREOPEN)!.detail.includes("has not opened yet"));
  assert.ok(sessionWarning(WED_AFTER)!.detail.includes("closed at 4:00 PM ET"));
});

test("the next open names the right day", () => {
  assert.ok(sessionWarning(WED_AFTER)!.detail.includes("tomorrow"));
  assert.ok(sessionWarning(FRIDAY_AFTER)!.detail.includes("Monday"));
  assert.ok(sessionWarning(SATURDAY)!.detail.includes("Monday"));
  assert.ok(sessionWarning(WED_PREOPEN)!.detail.includes("later today"));
});

// ---------------------------------------------------------------------------
// Price trust — only while the market is actually trading
// ---------------------------------------------------------------------------

const stale = (now: Date, minutes: number) => ({
  price: 396.74,
  trusted: false,
  reason: "Last trade is more than 30 minutes old.",
  asOf: now.getTime() - minutes * 60000,
  source: "trade"
});

test("an untrusted price outside the session says nothing at all", () => {
  // `sessionWarning` has already said the only true thing. Two messages about
  // one closed market is how "your data is broken" gets read into a Saturday.
  assert.equal(priceWarning("TSLA", stale(SATURDAY, 600), SATURDAY), null);
  assert.equal(priceWarning("TSLA", stale(WED_AFTER, 90), WED_AFTER), null);
});

test("a long gap DURING the session is news, and is timed", () => {
  const w = priceWarning("TSLA", stale(WED_MIDSESSION, 47), WED_MIDSESSION)!;
  assert.equal(w.code, "price_stale");
  assert.ok(w.title.includes("47 minutes"));
  assert.ok(w.detail.includes("The market is open"));
});

test("sources disagreeing is its own message, not a staleness one", () => {
  const w = priceWarning("TSLA", {
    price: 396.74,
    trusted: false,
    reason: "Last trade $396.74 and quote mid $402.10 disagree by 1.3%.",
    asOf: WED_MIDSESSION.getTime() - 60000
  }, WED_MIDSESSION)!;
  assert.equal(w.code, "price_untrusted");
  assert.ok(w.detail.includes("disagree by 1.3%"));
});

test("a trusted price says nothing", () => {
  assert.equal(priceWarning("TSLA", { price: 396.74, trusted: true, asOf: Date.now() }, WED_MIDSESSION), null);
});

test("no price at all is raised whatever the clock says", () => {
  // This one is not about the session: without a price nothing on the ticket
  // can be checked against anything.
  for (const now of [WED_MIDSESSION, SATURDAY]) {
    const w = priceWarning("TSLA", { price: 0, trusted: false }, now)!;
    assert.equal(w.code, "price_missing");
    assert.equal(w.severity, "serious");
  }
  assert.equal(priceWarning("TSLA", null, SATURDAY)!.code, "price_missing");
});

// ---------------------------------------------------------------------------
// The rest of the findings
// ---------------------------------------------------------------------------

test("drift is measured against the setup, and silent inside tolerance", () => {
  assert.equal(driftWarning("TSLA", 400, 399, 0.01), null);
  const w = driftWarning("TSLA", 420, 400, 0.01)!;
  assert.equal(w.code, "spot_drift");
  assert.ok(w.title.includes("5.0%"));
  assert.equal(driftWarning("TSLA", 420, 0, 0.01), null);
});

test("a short leg the stock has gone through is named on the right side", () => {
  const put = [{ side: "sell", occ: { type: "P", strike: 400 } }];
  const call = [{ side: "sell", occ: { type: "C", strike: 380 } }];
  assert.equal(itmShortWarning("TSLA", put, 390)!.code, "itm_short");
  assert.equal(itmShortWarning("TSLA", put, 410), null);
  assert.ok(itmShortWarning("TSLA", call, 390)!.title.includes("call"));
  assert.equal(itmShortWarning("TSLA", call, 370), null);
  // A leg being BOUGHT through the strike is not a problem to raise.
  assert.equal(itmShortWarning("TSLA", [{ side: "buy", occ: { type: "P", strike: 400 } }], 390), null);
});

test("an uncovered short call says how many shares are missing", () => {
  assert.equal(coverWarning("Alton Live", "TSLA", 300, 3), null);
  const none = coverWarning("Alton Live", "TSLA", 0, 1)!;
  assert.equal(none.code, "short_call_uncovered");
  assert.ok(none.detail.includes("holds 0 shares"));
  const partial = coverWarning("Alton Live", "TSLA", 250, 3)!;
  assert.ok(partial.title.includes("2 of 3"));
});

test("an adjusted contract says every figure on the ticket is wrong for it", () => {
  const w = adjustedWarning("AAPL1261016P00370000", "AAPL");
  assert.equal(w.code, "adjusted_contract");
  assert.ok(w.detail.includes("100 shares of AAPL"));
});

// ---------------------------------------------------------------------------
// Consent is per condition, not per session
// ---------------------------------------------------------------------------

test("only codes the user has actually seen are treated as accepted", () => {
  const list = [
    { code: "market_closed", title: "", detail: "", severity: "caution" as const },
    { code: "itm_short", title: "", detail: "", severity: "serious" as const }
  ];
  assert.equal(unacknowledged(list, []).length, 2);
  assert.equal(unacknowledged(list, undefined).length, 2);
  assert.deepEqual(unacknowledged(list, ["market_closed"]).map((w) => w.code), ["itm_short"]);
  assert.equal(unacknowledged(list, ["market_closed", "itm_short"]).length, 0);
});

test("a condition that appears MID-WALK still stops to be seen", () => {
  // The user accepted a closed market when they pressed send. Thirty seconds
  // later the stock has moved through the short strike. That is news, and a
  // blanket "they already consented" would carry it past them silently.
  const now = [
    { code: "market_closed", title: "", detail: "", severity: "caution" as const },
    { code: "spot_drift", title: "", detail: "", severity: "serious" as const }
  ];
  assert.deepEqual(unacknowledged(now, ["market_closed"]).map((w) => w.code), ["spot_drift"]);
});

// ---------------------------------------------------------------------------
// What happens to the order outside the session depends on the order
//
// The first version said "the broker will hold it or reject it under its own
// rules" for every order, which is the vague half of a warning. Alpaca's rules
// here are specific: options market orders are session-only, a day order
// queues and then expires at that session's close, and GTC keeps working.
// ---------------------------------------------------------------------------

test("a market order outside the session is named as one Alpaca will reject", () => {
  const w = sessionWarning(SATURDAY, { orderType: "market" })!;
  assert.ok(/will be\s+rejected/.test(w.detail), w.detail);
  assert.ok(/Set a limit price/.test(w.detail));
});

test("a day limit order is told it expires at the next close", () => {
  const w = sessionWarning(SATURDAY, { orderType: "limit", timeInForce: "day" })!;
  assert.ok(/queue for the open \(Monday\)/.test(w.detail), w.detail);
  assert.ok(/expire at the end of that/.test(w.detail));
  // ...and pointed at the control that fixes it.
  assert.ok(/good-til-canceled on the ticket/.test(w.detail));
});

test("a GTC order is told it keeps working", () => {
  const w = sessionWarning(SATURDAY, { orderType: "limit", timeInForce: "gtc" })!;
  assert.ok(/until it fills or you cancel/.test(w.detail), w.detail);
  assert.ok(!/expire at the end/.test(w.detail));
});

test("none of it fires while the session is open", () => {
  assert.equal(sessionWarning(WED_MIDSESSION, { orderType: "market" }), null);
});
