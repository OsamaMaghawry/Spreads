import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitWithheld, withheldNote } from "./integrity.js";
import { orphanedShares } from "./openBook.js";
import { computeStats } from "./analytics.js";

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

test("the note names the rows and says the money is in the totals", () => {
  const note = withheldNote(splitWithheld([WITHHELD, CLEAN]));
  assert.match(note, /XLY 2026-08-14/);
  assert.match(note, /IN the totals/);
  assert.match(note, /match your broker/);
});

test("a share lot's name falls back to its disposal date", () => {
  // `stock_lots` has no `close_date`. Reading only that printed a lot note
  // with no date at all, and the first version of THIS test missed it by
  // building a trade-shaped fixture.
  const lot = { ticker: "XLY", disposed_date: "2026-08-21", realized_pl: -214, integrity_code: "impossible_loss" };
  assert.match(withheldNote(splitWithheld([lot]), "whole", "share lot"), /XLY 2026-08-21/);
});

test("orphanedShares measures both sides on every row, so withholding invents no orphan", () => {
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

test("the caveat sits on the cards the exclusion actually moves", () => {
  // It used to sit on the Trades card while win rate, profit factor,
  // expectancy, payoff and largest loss — every figure that RISES when a loser
  // is removed — carried only "Settled trades" two panels above.
  const cards = src("../components/analysis/StatCards.jsx");
  const onCard = (label) => {
    const i = cards.indexOf(`label: "${label}"`);
    assert.ok(i > 0, `${label} card missing`);
    const block = cards.slice(i, i + 900);
    assert.ok(block.includes("unattributed"), `${label} must carry the caveat`);
  };
  ["Win rate", "Profit factor", "Expectancy / trade", "Payoff ratio", "Largest loss"].forEach(onCard);
});

test("the streaks are withheld outright, not caveated", () => {
  const cards = src("../components/analysis/StatCards.jsx");
  assert.ok(cards.includes("stats.streaksKnown ?"), "streaks must render a dash when unknown");
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

test("the withheld money stays in the totals and the outcomes leave it out", () => {
  // The load-bearing property of the redesign, asserted rather than described:
  // the account total ties to the broker, and the win rate does not count the
  // row we cannot attribute.
  const stats = computeStats([WITHHELD, CLEAN], 0, "whole");
  assert.equal(stats.bookedPL, -689);        // -189 + -500, nothing dropped
  assert.equal(stats.trades, 2);
  assert.equal(stats.withheldTrades, 1);
  assert.equal(stats.settledTrades, 1);      // outcomes measured on the clean row
  // Streaks are withheld outright: removing a loser merges the runs either
  // side of it into one that never happened.
  assert.equal(stats.bestStreak, null);
  assert.equal(stats.streaksKnown, false);
});

test("the PDF carries the qualification on EVERY page, not only page one", () => {
  // The on-screen note is one block near the top of the flow, so it lands on
  // page 1 and nowhere else. Pages 2+ are the by-month and by-ticker realized
  // P/L schedules — the pages that get forwarded — and they carried a category
  // disclaimer ("not a tax document") and nothing about which figures on them
  // are qualified.
  const pdf = src("../components/analysis/ExportPdfButton.jsx");

  // A reserved band on every page, like the paper banner, so the page image
  // cannot be drawn over the warning.
  assert.ok(pdf.includes("const bannerH = bannerLines.length * 16"),
    "the banner band must grow for the withheld line");
  assert.ok(pdf.includes("if (withheldLine) {"), "drawBanner must draw it");

  // And in the footer identity line, which repeats on every page.
  assert.ok(pdf.includes("const unattributed = n"), "the footer must carry the clause");
  assert.ok(pdf.includes("${unattributed}"), "the clause must be in the identity string");

  // Wrapped, not truncated. `fit` drops from the RIGHT, which is exactly where
  // the clause sits — a long account name would have eaten the sentence this
  // change exists to add.
  assert.ok(pdf.includes("splitTextToSize(identity"), "the identity line must wrap, not truncate");

  // The call site must actually pass it, or every assertion above is inert.
  const page = src("../pages/AccountAnalysis.jsx");
  assert.ok(page.includes("withheld={audit.count ?"), "AccountAnalysis must pass withheld to the export");
});
