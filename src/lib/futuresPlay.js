// The futures practice book played forward minute by minute (21 Nov, the
// owner: futures training for prop-firm challenges). For every minute any
// held contract traded, oldest first:
//   1. a contract roll (the continuous series moved to the next contract):
//      a held position closes at the old contract's last price
//      (lib/replay practiceRoll), so the jump between contracts is never
//      counted as profit or loss;
//   2. the practice stop, take-profits and working orders against the minute
//      (lib/replay triggerExits, triggerOrders): futures trade nearly round
//      the clock, so no regular-hours filter;
//   3. the challenge, when one is running (lib/propRules challengeStep),
//      checked at the minute's worst price for what is held; a breach
//      flattens every contract at that price, the flat-by time at the
//      minute's close, and the working orders and exits go with them.
// Shares and coins in the same book are left to the replay's own rules.
//
// Pure and tested (futuresPlay.test.js); components/terminal/useReplay.js drives it.

import { practiceRoll, practiceFill, triggerExits, triggerOrders, contractOf } from "./replay.js";
import { challengeStep, heldContracts, noteTraded, newChallenge } from "./propRules.js";
import { cmeTradeDate } from "../../supabase/functions/_shared/futuresSpecs.js";
import { nyClock } from "./terminal.js";

const working = (a) => (a.qty && (a.stop || a.targets.length)) || a.orders?.length;
const closeOut = (a, price, time, why) => {
  let out = { ...a, orders: [], stop: null, targets: [] };
  if (a.qty) out = { ...practiceFill(out, { side: a.qty > 0 ? "sell" : "buy", qty: Math.abs(a.qty), price, time, why }), orders: [], stop: null, targets: [] };
  return out;
};

/** A fill made by hand at `time`: its CME trade date counts as traded (lib/propRules noteTraded). */
export function noteFill(challenge, time) {
  if (!challenge) return challenge;
  const { day, minutes } = nyClock(time);
  const date = cmeTradeDate(day, minutes);
  return date ? { ...challenge, state: noteTraded(challenge.state, date) } : challenge;
}

/** The challenge's figures for the futures in a book: closed balance, equity at `priceOf`, and the contracts held. */
export function futuresFigures(book, start, priceOf) {
  let realized = 0;
  let open = 0;
  const positions = [];
  for (const [symbol, a] of Object.entries(book)) {
    if (!contractOf(symbol)) continue;
    realized += a.realized;
    const p = a.qty ? priceOf(symbol, a) : null;
    if (a.qty && p) open += (p - a.avg) * a.qty * (a.mult || 1);
    if (a.qty) positions.push({ root: a.root || contractOf(symbol).root, qty: a.qty });
  }
  return { balance: start + realized, equity: start + realized + open, positions };
}

/**
 * The futures in `book` through the minutes revealed: `minutes` { symbol:
 * the minutes after the last step, oldest first }, `prev` { symbol: the
 * minute before them }, `challenge` { rules, state } or null. Returns the
 * book, the challenge and what happened (`events`: { kind, symbol, time,
 * detail }) for the replay's notices.
 */
export function playFutures({ book, minutes, prev = {}, challenge = null }) {
  const symbols = Object.keys(minutes).filter((s) => contractOf(s) && book[s]);
  const times = [...new Set(symbols.flatMap((s) => minutes[s].map((m) => m.time)))].sort((a, b) => a - b);
  const at = Object.fromEntries(symbols.map((s) => [s, 0]));
  const before = { ...prev };
  const last = Object.fromEntries(symbols.map((s) => [s, prev[s]?.close ?? null]));
  let out = { ...book };
  let ch = challenge;
  const events = [];
  // Fills that make a trading day: a roll is not a trade the trader made.
  const fills = () => symbols.reduce((n, s) => n + out[s].trades.filter((x) => x.why !== "roll").length, 0);
  for (const time of times) {
    const was = fills();
    const now = {};
    const clock = nyClock(time);
    // A minute without a CME trade date (a closure the data still has) is checked under the last one.
    const date = cmeTradeDate(clock.day, clock.minutes) || ch?.state.day || null;
    for (const s of symbols) {
      const m = minutes[s][at[s]];
      if (!m || m.time !== time) continue;
      at[s] += 1;
      now[s] = m;
      let a = out[s];
      const b = before[s];
      const lastFill = a.trades.length ? a.trades[a.trades.length - 1].time : -Infinity;
      if (b?.id && m.id && b.id !== m.id && (a.qty || a.orders?.length) && lastFill < m.time) {
        a = practiceRoll(a, { time: m.time, price: b.close });
        events.push({ kind: "roll", symbol: s, time: m.time, detail: `Rolled to the next contract: the position closed at ${b.close}, the old contract's last price; its exits and orders went with it.` });
      }
      // Locked: until the next trade date, whose first minute already trades.
      const blocked = ch && (ch.state.status === "failed" || ch.state.status === "passed" || (ch.state.status === "locked" && ch.state.lockedDay === date));
      if (!blocked && working(a)) {
        a = triggerExits(a, [m]);
        if (a.orders?.length) {
          const filled = triggerOrders(a, m);
          // A working order that would take the book past the contract limit is
          // refused when it is reached, as a firm refuses it, and cancelled.
          const limit = ch?.rules.maxContracts;
          const others = Object.entries(out).filter(([x, y]) => x !== s && contractOf(x) && y.qty).map(([x, y]) => ({ root: contractOf(x).root, qty: y.qty }));
          if (limit > 0 && heldContracts([...others, { root: contractOf(s).root, qty: filled.qty }], ch.rules) > limit + 1e-9 && Math.abs(filled.qty) > Math.abs(a.qty)) {
            events.push({ kind: "refused", symbol: s, time: m.time, detail: `A working order reached its price but would hold more than ${limit} contracts: cancelled.` });
            a = { ...a, orders: [] };
          } else a = filled;
        }
      }
      out[s] = a;
      before[s] = m;
      last[s] = m.close;
    }
    if (!ch || !date) continue;
    const mins = clock.minutes;
    const start = ch.rules.accountSize;
    const close = futuresFigures(out, start, (s) => last[s]);
    // The worst price this minute for what is held: a long's low, a short's high.
    const worst = futuresFigures(out, start, (s, a) => (now[s] ? (a.qty > 0 ? now[s].low : now[s].high) : last[s]));
    // And the best, which an intraday floor trails.
    const best = futuresFigures(out, start, (s, a) => (now[s] ? (a.qty > 0 ? now[s].high : now[s].low) : last[s]));
    const res = challengeStep(ch.state, ch.rules, {
      day: date, minutes: mins, balance: close.balance, equity: close.equity, worstEquity: worst.equity, bestEquity: best.equity,
      contracts: heldContracts(close.positions, ch.rules), traded: fills() > was
    });
    if (res.state.status !== ch.state.status) events.push({ kind: res.state.status, symbol: null, time, detail: res.state.why || res.note || "" });
    ch = { ...ch, state: res.state };
    if (res.flatten) {
      const breach = res.state.status === "failed" || res.state.status === "locked";
      // The equity the breach was at: the floor, or the day's limit below its opening.
      const line = !breach ? null : res.state.breach === "floor" ? res.state.floor
        : ch.rules.dailyCountsOpen ? res.state.dayOpen - ch.rules.dailyLoss : null;
      const held = symbols.filter((s) => out[s].qty);
      for (const s of symbols) {
        const a = out[s];
        if (!a.qty && !a.orders?.length) continue;
        let price = last[s];
        if (breach && now[s]) {
          price = a.qty > 0 ? now[s].low : now[s].high;
          // One contract held: closed where its equity crossed the line (on its tick,
          // the losing side), or at the open when the minute opened through it.
          if (line !== null && held.length === 1 && a.qty) {
            const others = close.equity - (last[s] - a.avg) * a.qty * (a.mult || 1);
            const at = a.avg + (line - others) / (a.qty * (a.mult || 1));
            const tick = a.tick || 0;
            const onGrid = tick ? (a.qty > 0 ? Math.floor(at / tick + 1e-9) * tick : Math.ceil(at / tick - 1e-9) * tick) : at;
            const gap = a.qty > 0 ? now[s].open <= onGrid : now[s].open >= onGrid;
            price = gap ? now[s].open : Math.max(now[s].low, Math.min(now[s].high, Number(onGrid.toFixed(a.decimals ?? 8))));
          }
        } else if (now[s]) price = now[s].open; // the flat-by minute's own open
        out[s] = closeOut(a, price, time, breach ? "breach" : "flatby");
        if (a.qty) events.push({ kind: breach ? "breach" : "flatby", symbol: s, time, detail: breach ? `Flattened at ${price}: ${res.state.why}` : `Flattened at ${price}: ${res.note || "past the flat-by time"}` });
      }
      // The flatten itself moves the balance: the challenge sees it at once.
      const after = futuresFigures(out, start, (s) => last[s]);
      const again = challengeStep(ch.state, ch.rules, { day: date, minutes: mins, balance: after.balance, equity: after.equity, worstEquity: after.equity, bestEquity: after.equity, contracts: 0, traded: true });
      if (again.state.status !== ch.state.status) events.push({ kind: again.state.status, symbol: null, time, detail: again.state.why || "" });
      ch = { ...ch, state: again.state };
    }
  }
  return { book: out, challenge: ch, events };
}

/**
 * The challenge worked out again from the fills (21 Nov, the owner: fills are
 * repriced and cancelled while practising, "if I missed a candle in the buy
 * or sell, all challenge is not accurate"): from its start, every futures
 * fill up to `upTo` in time order, the challenge stepped after each on its
 * CME trade date with the closed balance and the contracts then held. Closed
 * results only: a dip in open profit before the edit is not replayed; play
 * goes on with open profit from the next minute.
 */
export function rebuildChallenge(rules, book, upTo = Infinity) {
  const events = [];
  for (const [symbol, acct] of Object.entries(book)) {
    if (!contractOf(symbol)) continue;
    let a = { ...newPracticeLike(acct) };
    for (const t of acct.trades) {
      if (!(t.time <= upTo)) break;
      const before = a.realized;
      a = practiceFill(a, t);
      events.push({ time: t.time, symbol, root: contractOf(symbol).root, change: a.realized - before, qty: a.qty, traded: t.why !== "roll" });
    }
  }
  events.sort((x, y) => x.time - y.time);
  let state = newChallenge(rules);
  let balance = rules.accountSize;
  const held = {};
  for (const e of events) {
    balance += e.change;
    held[e.root] = e.qty;
    const { day, minutes } = nyClock(e.time);
    const date = cmeTradeDate(day, minutes) || state.day;
    if (!date) continue;
    if (e.traded) state = noteTraded(state, date);
    const contracts = heldContracts(Object.entries(held).filter(([, q]) => q).map(([root, qty]) => ({ root, qty })), rules);
    state = challengeStep(state, rules, { day: date, minutes, balance, equity: balance, worstEquity: balance, bestEquity: balance, contracts, traded: e.traded }).state;
  }
  return { rules, state: { ...state, rebuilt: true } };
}

// A fresh account with the same contract terms (size, tick, commission).
const newPracticeLike = (acct) => ({ cash: 0, qty: 0, avg: 0, realized: 0, trades: [], stop: null, targets: [], orders: [], seq: 0, mult: acct.mult, tick: acct.tick, decimals: acct.decimals, fee: acct.fee, root: acct.root });
