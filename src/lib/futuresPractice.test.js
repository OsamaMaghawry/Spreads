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
  near(a.realized, 392);
  const trips = bookTrips({ "/CL": a });
  assert.equal(trips.length, 1);
  near(trips[0].realized, 392);
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

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} vs ${b}`);

test("one-tick ZN trips add up exactly, with no rounding drift", () => {
  let a = { ...acctIn({}, "/ZN"), fee: 0 };
  for (let i = 0; i < 10; i++) {
    a = fill(a, "buy", 1, 110, 2 * i);
    a = fill(a, "sell", 1, 110.015625, 2 * i + 1);
  }
  near(a.realized, 156.25); // 10 x $15.625
  const trips = roundTrips(a.trades, a.mult);
  near(trips.reduce((s, t) => s + t.realized, 0), 156.25);
});

test("a fill that turns the position round splits its commission between the two trips", () => {
  let a = { ...acctIn({}, "/ES"), fee: 2 };
  a = fill(a, "buy", 1, 5000, 1);
  a = fill(a, "sell", 3, 5001, 2); // closes 1, opens 2 short: $6 commission, $2 to the first trip, $4 to the second
  a = fill(a, "buy", 2, 5001, 3);
  const [first, second] = roundTrips(a.trades, a.mult);
  near(first.realized, 50 - 2 - 2); // +1 point, its open and its share of the flip
  near(second.realized, 0 - 4 - 4);
  near(first.realized + second.realized, a.realized);
});

test("a futures trip shows its move in points, not a return on notional", () => {
  let a = { ...acctIn({}, "/ES"), fee: 2 };
  a = fill(a, "sell", 2, 5010, 1);
  a = fill(a, "buy", 2, 5000, 2);
  const [t] = roundTrips(a.trades, a.mult);
  assert.equal(t.returnPct, null);
  assert.equal(t.points, 10); // a short, the right way round
  near(t.realized, 1000 - 8);
});

test("a challenge's book starts at its account size", () => {
  const a = fill({ ...acctIn({}, "/MES"), fee: 0 }, "buy", 1, 5000);
  assert.equal(bookValue({ "/MES": a }, () => 5010, 40000).equity, 40050);
});

test("a 6J fill keeps its seven decimals", () => {
  let a = acctIn({}, "/6J"); // $2 a side
  a = fill(a, "buy", 1, 0.0066665);
  assert.equal(a.trades[0].price, 0.0066665);
  a = fill(a, "sell", 1, 0.00667, 2);
  near(a.realized, 7 * 6.25 - 4);
});

test("a contract roll closes a held position at the old contract's last price", async () => {
  const { practiceRoll, practiceExit, addOrder } = await import("./replay.js");
  let a = { ...acctIn({}, "/ES"), fee: 0 };
  a = fill(a, "buy", 1, 5000);
  a = practiceExit(a, "stop", 4990, 5005).acct;
  a = addOrder(a, { side: "buy", qty: 1, price: 4980 }, 5005).acct;
  a = practiceRoll(a, { time: 9, price: 5005 });
  assert.equal(a.qty, 0);
  assert.equal(a.realized, 250);
  assert.equal(a.stop, null);
  assert.deepEqual(a.orders, []);
  assert.equal(a.trades.at(-1).why, "roll");
  assert.equal(practiceRoll(newPractice(0), { time: 9, price: 5 }).trades.length, 0); // a share has no roll
});

test("an order or exit typed off the tick goes on the grid on its own side", async () => {
  const { practiceExit, addOrder } = await import("./replay.js");
  const es = { ...acctIn({}, "/ES"), fee: 0 };
  assert.equal(addOrder(es, { side: "buy", qty: 1, price: 4990.13 }, 5000).acct.orders[0].price, 4990); // buy limit down
  assert.equal(addOrder(es, { side: "sell", qty: 1, price: 5010.13 }, 5000).acct.orders[0].price, 5010.25); // sell limit up
  assert.equal(addOrder(es, { side: "buy", qty: 1, price: 5010.13 }, 5000).acct.orders[0].price, 5010.25); // buy stop up
  assert.equal(addOrder(es, { side: "sell", qty: 1, price: 4990.13 }, 5000).acct.orders[0].price, 4990); // sell stop down
  const long = fill(es, "buy", 1, 5000);
  assert.equal(practiceExit(long, "stop", 4990.13, 5000).acct.stop, 4990);
  assert.equal(practiceExit(long, "target", 5010.13, 5000).acct.targets[0].price, 5010.25);
});
