import test from "node:test";
import assert from "node:assert/strict";
import {
  creditSpread, ironCondor, coveredCall, cashSecuredPut, expectedMove, expectedMoveFromStraddle,
  annualizedReturn, roll, earlyAssignment, chartRange, STRADDLE_FACTOR
} from "../public/tools/calc.js";

// Every expected figure below was worked by hand from the strikes and premiums,
// not read back from the function under test.
const near = (actual, expected, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const fails = (r, re) => {
  assert.ok(r.error, "expected an error");
  assert.match(r.error, re);
};

test("credit spread: put 95/90 for 1.20", () => {
  const r = creditSpread({ kind: "put", short: 95, long: 90, credit: 1.2, qty: 1 });
  near(r.width, 5);
  near(r.maxProfit, 120);
  near(r.maxLoss, 380);
  near(r.breakEven, 93.8);
  near(r.ror, 120 / 380);
  near(r.collateral, 500);
  near(r.pl(100), 120);
  near(r.pl(95), 120);
  near(r.pl(93.8), 0);
  near(r.pl(92), -180);
  near(r.pl(85), -380);
});

test("credit spread: call 105/110 for 1.50, two contracts", () => {
  const r = creditSpread({ kind: "call", short: 105, long: 110, credit: 1.5, qty: 2 });
  near(r.maxProfit, 300);
  near(r.maxLoss, 700);
  near(r.breakEven, 106.5);
  near(r.collateral, 1000);
  near(r.pl(100), 300);
  near(r.pl(106.5), 0);
  near(r.pl(120), -700);
});

test("credit spread: refuses impossible inputs", () => {
  fails(creditSpread({ kind: "put", short: 90, long: 95, credit: 1, qty: 1 }), /higher one/);
  fails(creditSpread({ kind: "call", short: 110, long: 105, credit: 1, qty: 1 }), /lower one/);
  fails(creditSpread({ kind: "put", short: 95, long: 90, credit: 5, qty: 1 }), /width/);
  fails(creditSpread({ kind: "put", short: 95, long: 90, credit: 0, qty: 1 }), /credit/);
  fails(creditSpread({ kind: "put", short: NaN, long: 90, credit: 1, qty: 1 }), /both strikes/);
});

test("credit spread: contracts round, and default to one", () => {
  near(creditSpread({ kind: "put", short: 95, long: 90, credit: 1, qty: 2.6 }).qty, 3);
  near(creditSpread({ kind: "put", short: 95, long: 90, credit: 1, qty: NaN }).qty, 1);
  near(creditSpread({ kind: "put", short: 95, long: 90, credit: 1, qty: -4 }).qty, 1);
});

test("iron condor: balanced 90/95/105/110 for 2.00", () => {
  const r = ironCondor({ longPut: 90, shortPut: 95, shortCall: 105, longCall: 110, credit: 2, qty: 1 });
  near(r.maxProfit, 200);
  near(r.maxLoss, 300);
  near(r.lowerBreakEven, 93);
  near(r.upperBreakEven, 107);
  near(r.profitZone, 14);
  near(r.ror, 2 / 3);
  near(r.collateral, 500);
  near(r.pl(100), 200);
  near(r.pl(93), 0);
  near(r.pl(107), 0);
  near(r.pl(85), -300);
  near(r.pl(120), -300);
});

test("iron condor: unequal wings lose the wider wing", () => {
  const r = ironCondor({ longPut: 85, shortPut: 95, shortCall: 105, longCall: 110, credit: 2, qty: 1 });
  near(r.maxLoss, 800);
  near(r.putSideLoss, 800);
  near(r.callSideLoss, 300);
  near(r.collateral, 1000);
  near(r.pl(80), -800);
  near(r.pl(115), -300);
});

test("iron condor: a wing narrower than the credit has no break-even", () => {
  const r = ironCondor({ longPut: 80, shortPut: 95, shortCall: 105, longCall: 107, credit: 2.5, qty: 1 });
  assert.equal(r.upperBreakEven, null);
  assert.equal(r.profitZone, null);
  near(r.lowerBreakEven, 92.5);
  near(r.pl(200), 50);
});

test("iron condor: an iron butterfly (shared short strike) is allowed", () => {
  const r = ironCondor({ longPut: 90, shortPut: 100, shortCall: 100, longCall: 110, credit: 6, qty: 1 });
  near(r.maxProfit, 600);
  near(r.maxLoss, 400);
  near(r.lowerBreakEven, 94);
  near(r.upperBreakEven, 106);
});

test("iron condor: refuses strikes out of order and oversized credit", () => {
  fails(ironCondor({ longPut: 95, shortPut: 90, shortCall: 105, longCall: 110, credit: 2 }), /long put/);
  fails(ironCondor({ longPut: 90, shortPut: 106, shortCall: 105, longCall: 110, credit: 2 }), /short put/);
  fails(ironCondor({ longPut: 90, shortPut: 95, shortCall: 110, longCall: 105, credit: 2 }), /long call/);
  fails(ironCondor({ longPut: 90, shortPut: 95, shortCall: 105, longCall: 110, credit: 5 }), /wider wing/);
  fails(ironCondor({ longPut: 90, shortPut: 95, shortCall: 105, longCall: 110, credit: 0 }), /credit/);
  fails(ironCondor({ longPut: 90, shortPut: 95, shortCall: 105, credit: 1 }), /four strikes/);
});

test("covered call: 50 stock, 52.50 call for 1.10, 30 days", () => {
  const r = coveredCall({ price: 50, strike: 52.5, premium: 1.1, days: 30, qty: 1 });
  near(r.premiumIncome, 110);
  near(r.capital, 5000);
  near(r.maxProfit, 360);
  near(r.ifCalled, 3.6 / 50);
  near(r.ifCalledYear, (3.6 / 50) * 365 / 30);
  near(r.ifFlat, 1.1 / 50);
  near(r.ifFlatYear, (1.1 / 50) * 365 / 30);
  near(r.breakEven, 48.9);
  near(r.protection, 0.022);
  near(r.pl(60), 360);
  near(r.pl(48.9), 0);
  near(r.pl(40), -890);
});

test("covered call: in the money, flat and called are the same outcome", () => {
  const r = coveredCall({ price: 50, strike: 45, premium: 6, days: 30, qty: 1 });
  near(r.ifCalled, 0.02);
  near(r.ifFlat, 0.02);
  fails(coveredCall({ price: 50, strike: 45, premium: 4, days: 30 }), /less than the amount it is in the money/);
  fails(coveredCall({ price: 50, strike: 55, premium: 1, days: 0 }), /days/);
  fails(coveredCall({ price: 50, strike: 55, premium: 50, days: 30 }), /premium/);
});

test("cash-secured put: 50 strike for 1.00, 30 days, stock at 53", () => {
  const r = cashSecuredPut({ strike: 50, premium: 1, days: 30, qty: 1, price: 53 });
  near(r.collateral, 5000);
  near(r.premiumIncome, 100);
  near(r.onCash, 0.02);
  near(r.onCashYear, 0.02 * 365 / 30);
  near(r.onNetCash, 1 / 49);
  near(r.costBasis, 49);
  near(r.breakEven, 49);
  near(r.maxLoss, 4900);
  near(r.discount, 4 / 53);
  near(r.cushion, 3 / 53);
  near(r.pl(55), 100);
  near(r.pl(49), 0);
  near(r.pl(40), -900);
});

test("cash-secured put: stock price is optional; bad inputs refused", () => {
  const r = cashSecuredPut({ strike: 50, premium: 1, days: 30, qty: 2, price: NaN });
  assert.equal(r.discount, null);
  near(r.collateral, 10000);
  fails(cashSecuredPut({ strike: 50, premium: 50, days: 30 }), /premium/);
  fails(cashSecuredPut({ strike: 50, premium: 1, days: NaN }), /days/);
});

test("expected move from implied volatility: 190 stock, 30% IV, 30 days", () => {
  const r = expectedMove({ price: 190, iv: 30, days: 30 });
  // 190 x 0.30 x sqrt(30/365) = 16.341...
  near(r.move, 190 * 0.3 * Math.sqrt(30 / 365));
  near(r.move, 16.3414, 1e-4);
  near(r.low, 190 - r.move);
  near(r.high, 190 + r.move);
  near(r.low2, 190 - 2 * r.move);
  near(r.movePct, r.move / 190);
});

test("expected move from a straddle round-trips through its implied volatility", () => {
  const r = expectedMoveFromStraddle({ price: 100, straddle: 4, days: 30 });
  near(r.move, 4 / STRADDLE_FACTOR);
  near(r.move, 5.0133, 1e-4);
  const back = expectedMove({ price: 100, iv: r.iv, days: 30 });
  near(back.move, r.move, 1e-9);
  near(back.straddleEstimate, 4, 1e-9);
});

test("expected move: refuses a decimal IV typed as a percent above 500, and zero days", () => {
  fails(expectedMove({ price: 100, iv: 600, days: 30 }), /percent/);
  fails(expectedMove({ price: 100, iv: 0, days: 30 }), /implied volatility/);
  fails(expectedMove({ price: 100, iv: 30, days: 0 }), /days/);
  fails(expectedMoveFromStraddle({ price: 10, straddle: 12, days: 30 }), /straddle/);
  // The two-sd floor is zero, never a negative price.
  assert.equal(expectedMove({ price: 10, iv: 400, days: 365 }).low2, 0);
});

test("annualized return: $150 on $5,000 for 30 days", () => {
  const r = annualizedReturn({ premium: 150, capital: 5000, days: 30 });
  near(r.period, 0.03);
  near(r.simple, 0.365);
  near(r.compound, Math.pow(1.03, 365 / 30) - 1);
  near(r.compound, 0.4329, 1e-3);
  near(r.perDay, 5);
  assert.ok(r.compound > r.simple);
});

test("annualized return: the same premium over twice the days is half the simple rate", () => {
  near(annualizedReturn({ premium: 100, capital: 5000, days: 30 }).simple, 0.02 * 365 / 30);
  near(annualizedReturn({ premium: 100, capital: 5000, days: 60 }).simple, 0.02 * 365 / 60);
  fails(annualizedReturn({ premium: 100, capital: 0, days: 30 }), /capital/);
});

test("roll a short put down and out for a net credit", () => {
  const r = roll({ kind: "put", oldStrike: 50, oldPremium: 1.5, closeCost: 2.5, newStrike: 48, newPremium: 3, qty: 1 });
  near(r.net, 0.5);
  near(r.netDollars, 50);
  near(r.realized, -1);
  near(r.realizedDollars, -100);
  near(r.total, 2);
  near(r.totalDollars, 200);
  near(r.oldBreakEven, 48.5);
  near(r.newBreakEven, 46);
  near(r.breakEvenShift, -2.5);
  near(r.strikeShift, -2);
});

test("roll a short call up and out for a net debit", () => {
  const r = roll({ kind: "call", oldStrike: 105, oldPremium: 1, closeCost: 3, newStrike: 110, newPremium: 2.5, qty: 2 });
  near(r.net, -0.5);
  near(r.netDollars, -100);
  near(r.total, 0.5);
  near(r.oldBreakEven, 106);
  near(r.newBreakEven, 110.5);
  near(r.breakEvenShift, 4.5);
});

test("roll: buying back a worthless option for 0 is allowed; a missing cost is not", () => {
  near(roll({ kind: "put", oldStrike: 50, oldPremium: 1, closeCost: 0, newStrike: 50, newPremium: 1, qty: 1 }).total, 2);
  fails(roll({ kind: "put", oldStrike: 50, oldPremium: 1, closeCost: NaN, newStrike: 50, newPremium: 1 }), /buy the option back/);
  fails(roll({ kind: "put", oldStrike: 50, oldPremium: 1, closeCost: -1, newStrike: 50, newPremium: 1 }), /buy the option back/);
});

test("early assignment: dividend above the time value left is high risk", () => {
  const r = earlyAssignment({ price: 52, strike: 45, callPrice: 7.3, dividend: 0.72, qty: 1 });
  near(r.intrinsic, 7);
  near(r.extrinsic, 0.3);
  assert.equal(r.level, "high");
  near(r.gap, -0.42);
  near(r.atStake, 72);
});

test("early assignment: more time value than dividend is lower; out of the money is low", () => {
  const lower = earlyAssignment({ price: 52, strike: 45, callPrice: 8, dividend: 0.72, qty: 1 });
  assert.equal(lower.level, "lower");
  near(lower.gap, 0.28);
  assert.equal(earlyAssignment({ price: 44, strike: 45, callPrice: 0.8, dividend: 0.72, qty: 1 }).level, "low");
});

test("early assignment: a put price, when given, is the test instead of the call's time value", () => {
  // Call time value 0.30 is under the 0.72 dividend, but the put at the same
  // strike is 0.90: exercising would cost the holder more than the dividend.
  const r = earlyAssignment({ price: 52, strike: 45, callPrice: 7.3, dividend: 0.72, qty: 1, putPrice: 0.9 });
  assert.equal(r.test, "put");
  assert.equal(r.level, "lower");
  near(r.gap, 0.18);
  // A put worth nothing is a real price, not a blank.
  const zero = earlyAssignment({ price: 52, strike: 45, callPrice: 7.3, dividend: 0.72, qty: 1, putPrice: 0 });
  assert.equal(zero.level, "high");
  fails(earlyAssignment({ price: 52, strike: 45, callPrice: 7.3, dividend: 0.72, putPrice: -1 }), /negative/);
  assert.equal(earlyAssignment({ price: 52, strike: 45, callPrice: 7.3, dividend: 0.72, putPrice: NaN }).test, "time value");
});

test("expected move: one day is the yearly volatility over the square root of 365", () => {
  near(expectedMove({ price: 100, iv: 36.5, days: 30 }).dayMove, 100 * 0.365 / Math.sqrt(365));
});

test("early assignment: a quote below intrinsic counts as no time value", () => {
  const r = earlyAssignment({ price: 52, strike: 45, callPrice: 6.9, dividend: 0.1, qty: 3 });
  assert.equal(r.belowIntrinsic, true);
  near(r.extrinsic, 0);
  assert.equal(r.level, "high");
  near(r.atStake, 30);
});

test("chart range covers every strike and today's price, never below zero", () => {
  const [x0, x1] = chartRange([90, 95], 100);
  assert.ok(x0 < 90 && x1 > 100);
  const [lo] = chartRange([1, 2], NaN);
  assert.ok(lo >= 0);
});

// ---------- the pages themselves ----------

import { readFileSync, existsSync } from "node:fs";
import { TOOLS, TOOL_FOR_POST } from "./render.js";

const PUBLIC = new URL("../public/", import.meta.url);
const read = (p) => readFileSync(new URL(p, PUBLIC), "utf8");
const toolFiles = TOOLS.map(([slug]) => `tools/${slug}/index.html`);
const MENU_PAGES = ["index.html", "about/index.html", "contact/index.html", "tools/index.html", ...toolFiles];

test("every calculator in the menu has a page", () => {
  for (const f of toolFiles) assert.ok(existsSync(new URL(f, PUBLIC)), `${f} is in TOOLS but has no page`);
});

test("every page with the menu lists every calculator, in the same order", () => {
  for (const f of MENU_PAGES) {
    const html = read(f);
    const menu = /<details class="tools"[^>]*>([\s\S]*?)<\/details>/.exec(html);
    assert.ok(menu, `${f} has no Tools menu`);
    const listed = [...menu[1].matchAll(/href="\/tools\/([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(listed, TOOLS.map(([s]) => s), `${f} lists different calculators`);
    assert.match(html, /<a href="\/tools">Tools<\/a>/, `${f} has no Tools link in the footer`);
  }
});

test("each tool page: canonical is its own address, title short with no dash, data parses", () => {
  for (const f of ["tools/index.html", ...toolFiles]) {
    const html = read(f);
    const path = "/" + f.replace(/\/index\.html$/, "");
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)[1];
    assert.equal(canonical, `https://deltamint.app${path}`, `${f} canonical`);
    assert.match(html, new RegExp(`<meta property="og:url" content="https://deltamint.app${path}" />`));
    const title = /<title>([^<]+)<\/title>/.exec(html)[1];
    assert.ok(title.length <= 60, `${f} title is ${title.length} characters`);
    assert.doesNotMatch(title, /[-–—]/, `${f} title has a dash`);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(desc.length >= 120 && desc.length <= 230, `${f} description is ${desc.length} characters`);
    assert.equal((html.match(/<h1>/g) || []).length, 1, `${f} needs exactly one h1`);
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1];
    assert.doesNotThrow(() => JSON.parse(ld), `${f} structured data`);
    const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(visible, /[–—]/, `${f} has a long dash`);
  }
});

test("a tool page's FAQ answers are the questions on the page", () => {
  for (const f of toolFiles) {
    const html = read(f);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 4, `${f} needs an FAQ`);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), `${f}: "${q.name}" is not on the page`);
  }
});

test("every post mapped to a calculator maps to one that exists", () => {
  const slugs = new Set(TOOLS.map(([s]) => s));
  for (const [post, tool] of Object.entries(TOOL_FOR_POST)) {
    assert.ok(slugs.has(tool), `${post} -> ${tool}`);
    assert.ok(existsSync(new URL(`../../content/blog/${post}.md`, import.meta.url)), `${post} is not a post`);
  }
});

test("every page with the menu loads its stylesheet", () => {
  for (const f of MENU_PAGES) assert.match(read(f), /<link href="\/assets\/menu\.css" rel="stylesheet">/, `${f} has the menu but not menu.css`);
});

test("blog pages carry the menu, its stylesheet and the Tools footer link", async () => {
  const { page, toolBox } = await import("./render.js");
  const html = page({ title: "t", description: "d", canonical: "https://deltamint.app/blog", body: "<p>x</p>" });
  const listed = [.../<details class="tools">([\s\S]*?)<\/details>/.exec(html)[1].matchAll(/href="\/tools\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed, TOOLS.map(([s]) => s));
  assert.match(html, /menu\.css/);
  assert.match(html, /<a href="\/tools">Tools<\/a>/);
  assert.match(toolBox("iron-condor-explained"), /href="\/tools\/iron-condor-calculator"/);
  assert.equal(toolBox("not-a-post"), "");
});

test("each tool page explains what it is and how it works before the arithmetic", () => {
  for (const f of toolFiles) {
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(read(f))[1]);
    const first = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity[0].name;
    assert.match(first, /^What (is|does|are) /, `${f} FAQ starts with "${first}"`);
    const second = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity[1].name;
    assert.match(second, /^How does .+ work\?$/, `${f} FAQ's second question is "${second}"`);
    assert.match(read(f), /<h2>How [^<]+ works<\/h2>\s*<p>[^<]+<\/p>\s*<ol>/, `${f} has no "How it works" steps`);
  }
});
