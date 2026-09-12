import { test } from "node:test";
import assert from "node:assert/strict";
import { accountGauges, barHtml } from "./accountGauges.ts";

const by = (g: ReturnType<typeof accountGauges>, key: string) => g.find((x) => x.key === key)!;

test("the two bars read against the account's own equity", () => {
  const g = accountGauges({ equity: 10000, collateral: 5500, optionsBP: 4200 });
  assert.equal(g.length, 2, "the risk bar was removed; nothing may bring it back quietly");
  assert.equal(by(g, "collateral").share, 0.55);
  assert.equal(by(g, "optionsBP").share, 0.42);
});

test("the bands describe, and the buying-power band is inverted", () => {
  // Committed: more is hotter. Buying power: more is calmer. A single rule
  // would have coloured a full account green.
  assert.equal(by(accountGauges({ equity: 100, collateral: 20 }), "collateral").band, "ok");
  assert.equal(by(accountGauges({ equity: 100, collateral: 70 }), "collateral").band, "warn");
  assert.equal(by(accountGauges({ equity: 100, collateral: 95 }), "collateral").band, "hot");
  assert.equal(by(accountGauges({ equity: 100, optionsBP: 80 }), "optionsBP").band, "ok");
  assert.equal(by(accountGauges({ equity: 100, optionsBP: 20 }), "optionsBP").band, "warn");
  assert.equal(by(accountGauges({ equity: 100, optionsBP: 2 }), "optionsBP").band, "hot");
});

test("no equity, no percentage — and never a division by zero", () => {
  for (const equity of [0, null, undefined, -5]) {
    const g = accountGauges({ equity, collateral: 500, optionsBP: 50 });
    assert.equal(by(g, "collateral").share, null);
    assert.equal(by(g, "collateral").width, 0);
    // The dollars are still known and still shown; only the ratio is not.
    assert.equal(by(g, "collateral").value, 500);
  }
});

test("a figure the broker did not report is a dash, never a zero", () => {
  const g = accountGauges({ equity: 10000 });
  for (const k of ["collateral", "optionsBP"]) {
    assert.equal(by(g, k).value, null);
    assert.equal(by(g, k).band, "unknown");
  }
  assert.match(by(g, "optionsBP").note, /did not report this/);
});

test("a bar wider than the account is drawn at the edge, not past it", () => {
  // Margin makes this ordinary rather than exotic, and a 340%-wide table cell
  // breaks the layout in every client.
  const g = accountGauges({ equity: 1000, collateral: 3400 });
  assert.equal(by(g, "collateral").width, 100);
  assert.equal(by(g, "collateral").share, 3.4);   // the truth is kept
});

test("the bar is a table an email client will render — no image, no SVG", () => {
  const html = barHtml(by(accountGauges({ equity: 100, collateral: 50 }), "collateral"), "Arial", "#666", "#111");
  assert.ok(html.includes("<table"));
  assert.ok(!/<svg|<img|background-image/i.test(html), "no image or SVG may reach an email");
  assert.ok(html.includes('width="50%"'));
  assert.ok(html.includes("$50.00"));
});

test("an unknown figure still draws a track, so the row does not collapse", () => {
  const html = barHtml(by(accountGauges({ equity: 100 }), "collateral"), "Arial", "#666", "#111");
  assert.ok(html.includes("—"));
  assert.ok(html.includes('width="0%"'));
});

test("a buying-power DEFICIT reads as owed, never as available", () => {
  // Alpaca reports options buying power negative when the account is in
  // deficit. `Math.abs` printed -$1,200 as "$1,200.00  -5%" under "Available
  // to open with on Monday" -- positive dollars, negative percent, telling a
  // reader who owes their broker that they have money to spend.
  const g = accountGauges({ equity: 24000, optionsBP: -1200 });
  const bp = g.find((x) => x.key === "optionsBP")!;
  assert.equal(bp.value, -1200);
  assert.equal(bp.band, "hot");
  const html = barHtml(bp, "Arial", "#666", "#111");
  assert.ok(html.includes("-$1,200.00"), "the sign is the fact");
  assert.ok(!html.includes(">$1,200.00"), "it must never render as positive");
  // And no bar growing rightward out of a negative number.
  assert.ok(html.includes('width="0%"'));
});

test("collateral reported negative is shown as reported, not flipped", () => {
  const g = accountGauges({ equity: 1000, collateral: -250 });
  const col = g.find((x) => x.key === "collateral")!;
  assert.ok(barHtml(col, "Arial", "#666", "#111").includes("-$250.00"));
});
