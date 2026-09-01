import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "./marketStreamRegistry.js";

// The artifact this was built from says "One socket, shared -- React context",
// and the first build did the opposite: a socket per component. Alpaca refused
// the second connection, so the close ticket showed no live price while the
// dashboard claimed to be streaming. These tests are that requirement, written
// down.

function harness() {
  const sockets = [];
  const timers = [];
  const open = (accountId, key) => {
    const s = {
      accountId, key, closed: false,
      onmessage: null, onclose: null, onerror: null,
      close() { this.closed = true; }
    };
    sockets.push(s);
    return Promise.resolve(s);
  };
  const setTimeoutFn = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const clearTimeoutFn = (id) => { if (id) timers[id - 1] = null; };
  const reg = createRegistry({ open, setTimeoutFn, clearTimeoutFn });
  const tick = () => new Promise((r) => setImmediate(r));
  const ready = (s) => s.onmessage({ data: JSON.stringify({ type: "ready", symbols: [] }) });
  return { reg, sockets, timers, tick, ready };
}

test("two consumers of one account share ONE socket", async () => {
  const h = harness();
  const seen = [];
  h.reg.subscribe("acct", ["SPY"], (s) => seen.push(s.status));
  await h.tick();
  h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  assert.equal(h.sockets.filter((s) => !s.closed).length, 1, "a second consumer must not open a second connection");
  assert.equal(h.reg.socketCount(), 1);
});

test("the socket carries the union of what its consumers asked for", async () => {
  const h = harness();
  h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  h.reg.subscribe("acct", ["NVDA", "AMD"], () => {});
  await h.tick();
  assert.equal(h.reg.symbolsFor("acct"), "AMD,NVDA,SPY");
  assert.equal(h.reg.socketCount(), 1);
});

test("a consumer asking for symbols already covered does not churn the socket", async () => {
  const h = harness();
  h.reg.subscribe("acct", ["SPY", "NVDA"], () => {});
  await h.tick();
  const first = h.sockets[0];
  h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  assert.equal(first.closed, false, "a covered subscription must join the live socket");
  assert.equal(h.reg.socketCount(), 1);
});

test("different accounts get their own socket", async () => {
  const h = harness();
  h.reg.subscribe("a", ["SPY"], () => {});
  h.reg.subscribe("b", ["SPY"], () => {});
  await h.tick();
  assert.equal(h.reg.socketCount(), 2);
});

test("the last unsubscribe closes the socket; earlier ones do not", async () => {
  const h = harness();
  const off1 = h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  const off2 = h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  off1();
  assert.equal(h.reg.socketCount(), 1, "one consumer leaving must not cut the other's feed");
  off2();
  assert.equal(h.reg.socketCount(), 0);
  assert.equal(h.sockets.every((s) => s.closed), true);
});

test("prices reach every consumer, trade and quote merged per symbol", async () => {
  const h = harness();
  let a = null; let b = null;
  h.reg.subscribe("acct", ["SPY"], (s) => { a = s; });
  await h.tick();
  h.reg.subscribe("acct", ["SPY"], (s) => { b = s; });
  await h.tick();
  const sock = h.sockets[0];
  h.ready(sock);
  sock.onmessage({ data: JSON.stringify({ type: "trade", symbol: "SPY", price: 763.41, at: "t1" }) });
  sock.onmessage({ data: JSON.stringify({ type: "quote", symbol: "SPY", bid: 763.4, ask: 763.42, at: "t2" }) });
  assert.equal(a.status, "live");
  assert.deepEqual(a.prices.SPY, { price: 763.41, at: "t2", bid: 763.4, ask: 763.42 });
  assert.deepEqual(b.prices.SPY, a.prices.SPY);
});

test("a relayed refusal is terminal — it must not reconnect forever", async () => {
  const h = harness();
  let last = null;
  h.reg.subscribe("acct", ["SPY"], (s) => { last = s; });
  await h.tick();
  h.sockets[0].onmessage({ data: JSON.stringify({ type: "error", code: 406, message: "connection limit exceeded" }) });
  assert.equal(last.status, "fallback");
  assert.equal(h.timers.filter(Boolean).length, 0, "a refusal must not schedule a retry");
  assert.equal(h.reg.socketCount(), 0);
});

test("a socket that never went live is a refusal, not a drop", async () => {
  // An OAuth account has no API key pair; marketStream answers 409 and the
  // handshake simply fails, which arrives as a close and never as a message.
  const h = harness();
  h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  h.sockets[0].onclose();
  assert.equal(h.timers.filter(Boolean).length, 0, "reconnecting an account that cannot stream is a loop");
  assert.equal(h.reg.statusFor("acct"), "fallback");
});

test("a socket that WAS live and then closed does reconnect", async () => {
  // Edge functions have a wall-clock limit, so a healthy stream closes
  // periodically. That is the normal path, not the error one.
  const h = harness();
  h.reg.subscribe("acct", ["SPY"], () => {});
  await h.tick();
  h.ready(h.sockets[0]);
  h.sockets[0].onclose();
  assert.equal(h.timers.filter(Boolean).length, 1);
  assert.equal(h.timers[0].ms, 1000);
});

test("no account id is idle, and unsubscribing is still safe", () => {
  const h = harness();
  let got = null;
  const off = h.reg.subscribe(null, ["SPY"], (s) => { got = s; });
  assert.equal(got.status, "idle");
  assert.doesNotThrow(off);
  assert.equal(h.reg.socketCount(), 0);
});

test("a subscriber that leaves before its socket opens does not leak one", async () => {
  const h = harness();
  const off = h.reg.subscribe("acct", ["SPY"], () => {});
  off(); // unsubscribed while open() is still pending
  await h.tick();
  assert.equal(h.reg.socketCount(), 0);
  assert.equal(h.sockets.every((s) => s.closed), true, "a socket opened for a gone subscriber must be closed");
});
