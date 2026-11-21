import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newPractice, practiceFill, practiceValue, acctIn, bookValue, bookTrips, roundTrips, cancelFill, repriceFill, contractOf, PRACTICE_CASH
} from "./replay.js";

const fill = (a, side, qty, price, time = 1) => practiceFill(a, { side, qty, price, time });

test("a futures symbol is written with a slash; a share with the same letters stays a share", () => {
  assert.equal(contractOf("/ES")?.root, "ES");
  assert.equal(contractOf("ES"), null);
  assert.equal(acctIn({}, "/MES").mult, 5);
  assert.equal(acctIn({}, "ES").mult, undefined);
});

test("1 ES long from 5000 to 5001.25 makes $62.50 less two sides of commission", () => {
  let a = { ...acctIn({}, "/ES"), fee: 2 };
  a = fill(a, "buy", 1, 5000);
  a = fill(a, "sell", 1, 5001.25, 2);
  assert.equal(a.realized, 62.5 - 4);
  assert.equal(a.qty, 0);
  assert.equal(a.cash, 58.5); // the account's own cash moves by the profit, not by $250,000 of notional
  const [trip] = roundTrips(a.trades, a.mult);
  assert.equal(trip.realized, 58.5);
  assert.equal(trip.avgEntry, 5000);
});

test("a short MNQ, open profit and equity in dollars", () => {
  let a = { ...acctIn({}, "/MNQ"), fee: 0 };
  a = fill(a, "sell", 2, 18000);
  const v = practiceValue(a, 17990);
  assert.equal(v.unrealized, 40); // 10 points x $2 x 2
  assert.equal(v.equity, 40);
  const book = { "/MNQ": a };
  assert.equal(bookValue(book, () => 17990).equity, PRACTICE_CASH + 40);
  assert.equal(bookValue(book, () => 17990).unrealized, 40);
});

test("a price off the tick grid is filled on it", () => {
  let a = { ...acctIn({}, "/ES"), fee: 0 };
  a = fill(a, "buy", 1, 5000.13);
  assert.equal(a.trades[0].price, 5000.25);
  assert.equal(a.avg, 5000.25);
});

test("commission is charged on every fill, and a scale-in averages", () => {
  let a = acctIn({}, "/CL"); // default $2 a side
  a = fill(a, "buy", 1, 70.0);
  a = fill(a, "buy", 1, 70.2);
  a = fill(a, "sell", 2, 70.3, 3);
  // avg 70.10, +0.20 x $1000 x 2 = $400, less 4 sides x $2
  assert.equal(a.realized, 392);
  const trips = bookTrips({ "/CL": a });
  assert.equal(trips.length, 1);
  assert.equal(trips[0].realized, 392);
  assert.equal(trips[0].symbol, "/CL");
});

test("taking a fill back or repricing it rebuilds the contract's account", () => {
  let a = { ...acctIn({}, "/ES"), fee: 2 };
  a = fill(a, "buy", 1, 5000);
  a = fill(a, "sell", 1, 5002, 2);
  const back = cancelFill(a, 1);
  assert.equal(back.qty, 1);
  assert.equal(back.mult, 50);
  assert.equal(back.realized, -2);
  assert.equal(back.cash, -250000 - 2);
  const { acct } = repriceFill(a, 1, 5004);
  assert.equal(acct.realized, 200 - 4);
});

test("a share account is untouched: no multiplier, no commission", () => {
  let a = newPractice(0);
  a = fill(a, "buy", 10, 100);
  a = fill(a, "sell", 10, 101, 2);
  assert.equal(a.realized, 10);
  assert.equal(a.cash, 10);
  assert.equal(a.trades[0].fee, undefined);
});
