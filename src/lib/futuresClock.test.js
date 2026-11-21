import { test } from "node:test";
import assert from "node:assert/strict";
import { cmeDay, marketOf, isFutures, bucketStart, sessionDay } from "./terminal.js";
import { dayOf, dayClose, replayMoment, replayDate, replayClock, replayCandles, targetSize } from "./replay.js";

const t = (iso) => Math.floor(Date.parse(iso) / 1000);
const D = (iso) => t(`${iso}T00:00:00Z`);

test("a futures symbol has its own market; shares and coins keep theirs", () => {
  assert.equal(marketOf("/ES"), "cme");
  assert.equal(marketOf("/6E"), "cme");
  assert.equal(marketOf("ES"), false);
  assert.equal(marketOf("BTC/USD"), true);
  assert.equal(isFutures("/ESZ6"), false); // only the front contract, by its root
});

test("the CME trade date rolls at 18:00 New York, winter and summer", () => {
  assert.equal(cmeDay(t("2026-11-23T22:59:00Z")), D("2026-11-23")); // 17:59 New York
  assert.equal(cmeDay(t("2026-11-23T23:00:00Z")), D("2026-11-24")); // 18:00 New York
  assert.equal(cmeDay(t("2026-07-06T22:00:00Z")), D("2026-07-07")); // 18:00 New York in summer
  assert.equal(dayOf(t("2026-11-23T23:30:00Z"), "cme"), D("2026-11-24"));
  assert.equal(sessionDay(t("2026-11-23T23:30:00Z"), "cme"), D("2026-11-24") / 86400);
  assert.equal(bucketStart(t("2026-11-23T23:30:00Z"), "1Day", "cme"), D("2026-11-24"));
  assert.equal(bucketStart(D("2026-11-26"), "1Week", "cme"), D("2026-11-23")); // Monday
});

test("a contract's day closes at 17:00 New York, and the replay opens it at 9:30", () => {
  assert.equal(dayClose(D("2026-11-24"), "cme"), t("2026-11-24T22:00:00Z"));
  assert.equal(replayMoment("2026-11-24", "open", "cme"), t("2026-11-24T14:31:00Z"));
  assert.equal(replayMoment("2026-11-24", "close", "cme"), t("2026-11-24T22:00:00Z"));
  assert.equal(replayMoment("2026-11-24", "19:00", "cme"), t("2026-11-25T00:01:00Z"));
  assert.equal(replayDate(t("2026-11-24T14:31:00Z"), "cme"), "2026-11-24");
  assert.match(replayClock(t("2026-11-24T14:31:00Z"), "cme"), /New York$/);
});

test("a contract's daily candle in progress is built from its session's minutes, from 18:00 the evening before", () => {
  const m = (iso, p) => ({ time: t(iso), open: p, high: p + 1, low: p - 1, close: p, volume: 1 });
  const minutes = [m("2026-11-23T21:00:00Z", 100), m("2026-11-23T23:00:00Z", 110), m("2026-11-24T14:30:00Z", 120)];
  const days = replayCandles({ minutes, days: [] }, "1Day", t("2026-11-24T14:31:00Z"), { crypto: "cme" });
  const today = days.at(-1);
  assert.equal(today.time, D("2026-11-24"));
  assert.equal(today.open, 110); // the 18:00 minute, not the 16:00 one of the day before
  assert.equal(today.close, 120);
});

test("a take-profit's size in contracts comes whole", () => {
  assert.equal(targetSize("1.5", 3, "cme").reason, "Contracts come whole.");
  assert.equal(targetSize("50%", 3, "cme").qty, 1);
  assert.equal(targetSize("0.5", 3, true).qty, 0.5);
});
