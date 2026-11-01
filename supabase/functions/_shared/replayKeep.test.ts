import { test } from "node:test";
import assert from "node:assert/strict";
import { keepReplays } from "./replayKeep.ts";

const KEY = /^[a-z]+(:[A-Z0-9./]{1,24})?$/;
const replay = (fills: number, extra: any = {}) => ({ id: "RMVY2Z0Q9", name: "QQQ from Sep 1, 2025", cursor: 1, book: { QQQ: { trades: Array(fills).fill({}) } }, summary: { fills }, running: true, ...extra });
const row = (value: any, key = "replay:RMVY2Z0Q9") => ({ user_id: "u", key, value });

test("an empty replay saved over one with fills: the stored one is kept first as its own replay", () => {
  const out = keepReplays([row(replay(0))], new Map([["replay:RMVY2Z0Q9", replay(12)]]), 1_700_000_000_000);
  assert.equal(out.length, 2);
  const [kept, saved] = out;
  assert.match(kept.key, /^replay:RMVY2Z0Q9\.[A-Z0-9]+$/);
  assert.ok(KEY.test(kept.key));
  assert.equal(kept.value.id, kept.key.slice(7));
  assert.equal(kept.value.summary.fills, 12);
  assert.equal(kept.value.running, false);
  assert.equal(kept.value.name, "QQQ from Sep 1, 2025 (kept, 12 fills)");
  assert.equal(saved.value.summary.fills, 0);
});

test("more fills, the same, or fewer only by the fills cancelled: saved as it comes", () => {
  const stored = new Map([["replay:RMVY2Z0Q9", replay(12, { cancelled: 1 })]]);
  assert.equal(keepReplays([row(replay(13, { cancelled: 1 }))], stored).length, 1);
  assert.equal(keepReplays([row(replay(12, { cancelled: 1 }))], stored).length, 1);
  assert.equal(keepReplays([row(replay(10, { cancelled: 3 }))], stored).length, 1);
  // Two gone, one of them cancelled: the stored copy is kept.
  assert.equal(keepReplays([row(replay(10, { cancelled: 2 }))], stored).length, 2);
});

test("deleting a replay with fills needs the confirmed delete; one without fills goes", () => {
  const stored = new Map([["replay:RMVY2Z0Q9", replay(12)], ["replay:RA", replay(0, { id: "RA" })]]);
  assert.deepEqual(keepReplays([row({ deleted: true })], stored), []);
  assert.equal(keepReplays([row({ deleted: true, confirmed: true })], stored).length, 1);
  assert.equal(keepReplays([row({ deleted: true }, "replay:RA")], stored).length, 1);
});

test("other settings, new replays and a kept copy kept again pass with valid keys", () => {
  const other = { user_id: "u", key: "watchlists", value: { lists: [] } };
  assert.deepEqual(keepReplays([other, row(replay(3), "replay:RNEW")], new Map()), [other, row(replay(3), "replay:RNEW")]);
  const copy = replay(5, { id: "RMVY2Z0Q9.MVZ123AB" });
  const out = keepReplays([row(replay(0, { id: copy.id }), `replay:${copy.id}`)], new Map([[`replay:${copy.id}`, copy]]));
  assert.equal(out.length, 2);
  assert.ok(KEY.test(out[0].key), out[0].key);
  assert.ok(out[0].key.startsWith("replay:RMVY2Z0Q9."));
});
