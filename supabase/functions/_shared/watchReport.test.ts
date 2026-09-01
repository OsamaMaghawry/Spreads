import test from "node:test";
import assert from "node:assert/strict";
import { accountFacts, accountLine, buildDailyReport, LIVENESS_RULES } from "./watchReport.ts";

// The report this replaces was thirteen rows of "NVDA price not trusted — 210P
// unjudged" and four rows of "Nothing flagged", every weekday, for every
// account. The owner's words: "What's the point of this email? I don't
// understand anything." These tests are that sentence, made checkable.

const occ = (ticker: string, strike: number, type: string, expiry = "2026-09-18") =>
  ({ ticker, strike, type, expiryFormatted: expiry });
const short = (t: string, k: number, ty: string, mv = 100, expiry?: string) =>
  ({ symbol: `${t}${k}${ty}`, occ: occ(t, k, ty, expiry), qty: -1, marketValue: mv });
const long = (t: string, k: number, ty: string, mv = 60, expiry?: string) =>
  ({ symbol: `${t}${k}${ty}L`, occ: occ(t, k, ty, expiry), qty: 1, marketValue: mv });

const priced = (p: number) => ({ price: p, trusted: true, source: "close", asOf: 0, reason: null });
const stale = (p: number) => ({ price: p, trusted: false, source: "trade", asOf: 0, reason: "old" });

const TODAY = new Date("2026-09-01T21:15:00Z");

test("the nearest short leg is found across tickers of different prices", () => {
  const legs = [short("TSLA", 357.5, "P"), short("MSFT", 512.5, "C"), short("NVDA", 215, "P")];
  const spots = { TSLA: priced(365), MSFT: priced(505), NVDA: priced(222) };
  const f = accountFacts(legs, spots, 7, TODAY);
  // TSLA 2.10%, MSFT 1.46%, NVDA 3.26% — comparing dollars would have said TSLA.
  assert.equal(f.closest.label, "MSFT 512.5C");
  assert.equal(f.shortLegs, 3);
});

test("an unpriceable leg is named once, not turned into a row", () => {
  const legs = [short("NFLX", 82, "C"), short("NVDA", 215, "P")];
  const spots = { NFLX: stale(80), NVDA: priced(222) };
  const f = accountFacts(legs, spots, 7, TODAY);
  assert.deepEqual(f.unpriced, ["NFLX 82C"]);
  assert.equal(f.closest.label, "NVDA 215P", "one bad price must not blind the rest");
});

test("at-risk sums every leg, long and short, on absolute value", () => {
  const f = accountFacts([short("AMD", 465, "P", 220), long("AMD", 460, "P", -80)], { AMD: priced(470) }, 7, TODAY);
  assert.equal(f.atRisk, 300);
  assert.equal(f.positions, 2);
});

test("expiring-soon counts against the horizon, not the whole book", () => {
  const legs = [short("SPY", 700, "P", 100, "2026-09-04"), short("SPY", 600, "P", 100, "2026-12-18")];
  assert.equal(accountFacts(legs, { SPY: priced(720) }, 7, TODAY).expiringSoon, 1);
});

test("an account line says WHY it is clear, never only that it is", () => {
  const f = accountFacts([short("TSLA", 357.5, "P")], { TSLA: priced(365) }, 7, TODAY);
  const line = accountLine(f);
  assert.match(line, /closest short TSLA 357\.5P, 2\.1% away/);
  assert.notEqual(line, "no positions");
});

test("an empty account and a clean one do not read the same", () => {
  const empty = accountFacts([], {}, 7, TODAY);
  assert.equal(accountLine(empty), "no positions");
  assert.notEqual(accountLine(accountFacts([short("TSLA", 357.5, "P")], { TSLA: priced(365) }, 7, TODAY)), "no positions");
});

test("a long-only account says so rather than inventing a nearest short", () => {
  const f = accountFacts([long("SPY", 700, "C")], { SPY: priced(720) }, 7, TODAY);
  assert.equal(f.closest, null);
  assert.match(accountLine(f), /no short legs/);
});

// --- The email itself ------------------------------------------------------

// The exact shape from the screenshot: one account with thirteen short legs,
// every one of them unpriceable, and four accounts holding nothing.
const weesLegs = [
  ["TSLA", 365, "C"], ["TSLA", 357.5, "P"], ["AMD", 467.5, "C"], ["AMD", 465, "P"],
  ["NVDA", 222.5, "C"], ["NVDA", 215, "P"], ["NVDA", 230, "C"], ["NVDA", 212.5, "P"],
  ["NFLX", 82, "C"], ["MSFT", 512.5, "C"], ["MSFT", 495, "P"], ["NFLX", 80, "P"],
  ["TSLA", 347.5, "P"]
].map(([t, k, ty]: any) => short(t, k, ty));

test("thirteen liveness warnings render as ZERO rows, not thirteen", () => {
  const alerts = weesLegs.map((l) => ({
    rule: "price_untrusted",
    severity: "warning",
    title: `${l.occ.ticker} price not trusted — ${l.occ.strike}${l.occ.type} unjudged`
  }));
  const r = buildDailyReport(
    [{ name: "Wees", facts: accountFacts(weesLegs, {}, 7, TODAY), alerts }],
    "2026-09-01"
  );
  assert.equal(r.actionable, 0);
  assert.equal((r.text.match(/price not trusted/g) || []).length, 0, "the old email was thirteen of these");
  assert.match(r.text, /Nothing needs a look/);
  assert.match(r.text, /couldn't price 13/);
});

test("a real condition leads the email, with its numbers in the sentence", () => {
  const r = buildDailyReport([
    {
      name: "Wees",
      facts: accountFacts(weesLegs, { AMD: priced(462.1) }, 7, TODAY),
      alerts: [
        { rule: "price_untrusted", severity: "warning", title: "NFLX price not trusted — 82C unjudged" },
        { rule: "short_through_strike", severity: "critical", title: "AMD 465P closed in the money — AMD $462.10, strike $465" },
        { rule: "earnings_before_expiry", severity: "warning", title: "NVDA reports 2026-09-02, before the 215P expiry" }
      ]
    }
  ], "2026-09-01");

  assert.equal(r.actionable, 2, "the liveness row is not one of them");
  const critical = r.text.indexOf("AMD 465P closed in the money");
  const warning = r.text.indexOf("NVDA reports");
  assert.ok(critical > -1 && warning > -1);
  assert.ok(critical < warning, "critical must come first");
  assert.match(r.text, /\$462\.10/, "the number belongs in the sentence, not in a detail blob");
});

test("the headline answers 'is my money all right' before any list", () => {
  const r = buildDailyReport([
    { name: "A", facts: accountFacts([short("SPY", 700, "P", 1200)], { SPY: priced(760) }, 7, TODAY), alerts: [] },
    { name: "B", facts: accountFacts([], {}, 7, TODAY), alerts: [] }
  ], "2026-09-01");
  const head = r.text.split("\n")[1];
  assert.equal(head, "2 accounts · 1 open position · $1,200 at risk");
});

test("every account appears, including the empty ones", () => {
  const names = ["Alpaca Live (354730791)", "Alpaca Paper (PA3V7ZNHT66T)", "Wees"];
  const r = buildDailyReport(
    names.map((name) => ({ name, facts: accountFacts([], {}, 7, TODAY), alerts: [] })),
    "2026-09-01"
  );
  for (const n of names) assert.ok(r.text.includes(n), `${n} missing from the report`);
});

test("price_untrusted is the liveness rule, and it is the only one suppressed", () => {
  assert.ok(LIVENESS_RULES.has("price_untrusted"));
  for (const r of ["short_through_strike", "short_near_strike", "earnings_before_expiry", "position_oversized"]) {
    assert.equal(LIVENESS_RULES.has(r), false, `${r} must still reach the email`);
  }
});
