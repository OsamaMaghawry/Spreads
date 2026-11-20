import { test } from "node:test";
import assert from "node:assert/strict";
import { nyseHolidays, isTradingDay, overnightAt } from "../../supabase/functions/_shared/usHolidays.js";

// The exchange's published calendars (nyse.com, holidays and trading hours).
test("the NYSE full-day closures, by rule, match the published calendars", () => {
  assert.deepEqual([...nyseHolidays(2026)], ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
  assert.deepEqual([...nyseHolidays(2027)], ["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
  assert.deepEqual([...nyseHolidays(2025)], ["2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25"]);
  // New Year's Day on a Saturday is not kept on the Friday before.
  assert.equal(nyseHolidays(2028).has("2027-12-31"), false);
  assert.equal(nyseHolidays(2028).has("2028-01-01"), false);
  assert.equal(isTradingDay("2027-12-31"), true);
});

test("a trading day is a weekday that is not a full holiday", () => {
  assert.equal(isTradingDay("2026-11-26"), false); // Thanksgiving
  assert.equal(isTradingDay("2026-11-27"), true); // the Friday after (an early close, still a session)
  assert.equal(isTradingDay("2026-11-28"), false); // Saturday
  assert.equal(isTradingDay("2026-11-30"), true);
});

test("overnight is 20:00 to 4:00 the night before a trading day", () => {
  assert.equal(overnightAt("2026-11-24", 20 * 60), true); // Tue 20:00
  assert.equal(overnightAt("2026-11-24", 20 * 60 - 1), false); // 19:59, after hours
  assert.equal(overnightAt("2026-11-25", 4 * 60 - 1), true); // Wed 3:59
  assert.equal(overnightAt("2026-11-25", 4 * 60), false); // Wed 4:00, the pre-market
  assert.equal(overnightAt("2026-11-25", 21 * 60), false); // Thanksgiving eve
  assert.equal(overnightAt("2026-11-27", 21 * 60), false); // Friday night
  assert.equal(overnightAt("2026-11-29", 21 * 60), true); // Sunday night
  assert.equal(overnightAt("2026-12-31", 21 * 60), false); // into New Year's Day (month and year roll over)
});
