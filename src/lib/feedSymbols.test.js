import { test } from "node:test";
import assert from "node:assert/strict";
import { unionSymbols } from "./feedSymbols.js";

// 28 Oct: two terminal windows share one connection; each one's chart symbol
// comes before anyone's watchlist.
test("every tab's symbols on the one socket, the first of each before the second of any", () => {
  assert.deepEqual(unionSymbols([["ELPW", "SPY", "QQQ"], ["AIOK", "SPY", "NUWE"]]), ["ELPW", "AIOK", "SPY", "QQQ", "NUWE"]);
  assert.deepEqual(unionSymbols([["A", "B", "C"], ["D", "E"]], 3), ["A", "D", "B"]);
  assert.deepEqual(unionSymbols([[]]), []);
});
