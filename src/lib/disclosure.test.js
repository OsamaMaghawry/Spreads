import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitWithheld, withheldNote } from "./integrity.js";
import { orphanedShares } from "./openBook.js";

// DISCLOSURE TESTS, and why they exist as a category of their own.
//
// Three times in this session a correctness fix has silently taken a
// disclosure off the screen: the withheld count moved into a total that had
// already been split (so it was structurally always 0), the withheld note hung
// off a control that only renders on an account holding something open, and
// `orphanedShares` was left trusting a caller that does not filter. Every one
// of those passed a full test suite, because the suite asserted that the
// TOTALS were right and never that the SENTENCE arrives.
//
// A figure withheld without a disclosure is worse than no withholding at all:
// a blank page is obviously broken, and a confidently short total is not. So
// these tests assert reachability — that the thing which produces the sentence
// is fed by something that can be non-zero, and that no screen quietly drops
// it. They are deliberately closer to the source than a unit test normally
// sits, because the failures they catch are wiring, not arithmetic.

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const WITHHELD = {
  ticker: "XLY",
  close_date: "2026-08-14",
  realized_pl: -189,
  premium_pl: 25,
  stock_pl: -214,
  integrity_code: "impossible_loss"
};
const CLEAN = { ticker: "MSFT", close_date: "2026-09-01", realized_pl: -500, premium_pl: -500, stock_pl: 0 };

test("the note names the rows, the dollars and the authority", () => {
  const note = withheldNote(splitWithheld([WITHHELD, CLEAN]));
  assert.match(note, /XLY 2026-08-14/);
  assert.match(note, /\$189\.00/);
  assert.match(note, /broker/);
});

test("orphanedShares splits BOTH sides itself, so a withheld row invents no orphan", () => {
  // The defect: the lot side was filtered and the trade side was not, so the
  // difference became the withholding and printed in the PDF as "$189.00 of
  // share results could not be matched to an option".
  const lots = [
    { disposed_date: "2026-08-14", realized_pl: -214, integrity_code: "impossible_loss" },
    { disposed_date: "2026-09-01", realized_pl: 0 }
  ];
  assert.equal(orphanedShares(lots, [WITHHELD, CLEAN]), 0);

  // And a REAL orphan still reports, or the fix would have silenced the thing
  // it was protecting.
  const withOrphan = [...lots, { disposed_date: "2026-09-02", realized_pl: -40 }];
  assert.equal(orphanedShares(withOrphan, [WITHHELD, CLEAN]), -40);
});

test("the Analysis banner is not gated on the account holding something open", () => {
  // It used to reach the screen only through ViewSwitch's `note`, and
  // ViewSwitch renders only when `hasOpen`. An account holding nothing — the
  // steady state of the account this was built for — published the reduced
  // total with no explanation anywhere on the page or in the PDF.
  const page = src("../pages/AccountAnalysis.jsx");
  const banner = page.slice(page.indexOf("{withheldLine &&"));
  assert.ok(banner.startsWith("{withheldLine &&"), "the withheld banner must render on its own condition");
  assert.ok(
    !page.includes("note={headlineNote}\n") || !page.includes("withheldLine\n  ].filter"),
    "the withheld line must not depend on headlineNote, which ViewSwitch gates"
  );
});

test("StatCards reads the withheld count from the page, not from stats", () => {
  // `computeStats` is handed an already-split set, so `stats.withheldTrades`
  // is structurally always 0 and any disclosure keyed off it is dead code.
  const cards = src("../components/analysis/StatCards.jsx");
  assert.ok(cards.includes("withheld && withheld.count"), "the count must come from the page's own split");
  assert.ok(!cards.includes("stats.withheldTrades"), "stats.withheldTrades is always 0 here");
});

test("the Trade History header carries its own note, independent of the tab", () => {
  // The table's note is driven off the strategy-filtered rows, so clicking a
  // tab the withheld row is not in made it disappear while the header above
  // stayed short.
  const page = src("../pages/AccountHistory.jsx");
  assert.ok(page.includes("const auditNote = withheldNote(audit)"), "header note must exist");
  assert.ok(page.includes("{auditNote && ("), "header note must render");
});

test("the share lots table says 'share lot', not 'trade'", () => {
  // The same money is disclosed on both tables; without a distinct noun a
  // reader sums the two sentences and doubles the exclusion.
  const note = withheldNote(splitWithheld([{ ...WITHHELD, realized_pl: -214 }]), "whole", "share lot");
  assert.match(note, /1 share lot/);
});

test("under Premium the note says which figure it is short of", () => {
  const note = withheldNote(splitWithheld([WITHHELD]), "premium");
  assert.match(note, /\$25\.00/);
  assert.match(note, /option-leg figure/);
});
