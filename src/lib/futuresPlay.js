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
import { challengeStep, heldContracts, noteTraded } from "./propRules.js";
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
  const fills = () => symbols.reduce((n, s) => n + out[s].trades.length, 0);
  for (const time of times) {
    const was = fills();
    const now = {};
    for (const s of symbols) {
      const m = minutes[s][at[s]];
      if (!m || m.time !== time) continue;
      at[s] += 1;
      now[s] = m;
      let a = out[s];
      const b = before[s];
      if (b?.id && m.id && b.id !== m.id && (a.qty || a.orders?.length)) {
        a = practiceRoll(a, { time: m.time, price: b.close });
        events.push({ kind: "roll", symbol: s, time: m.time, detail: `Rolled to the next contract: the position closed at ${b.close}, the old contract's last price; its exits and orders went with it.` });
      }
      const blocked = ch && (ch.state.status === "failed" || ch.state.status === "passed" || ch.state.status === "locked");
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
    if (!ch) continue;
    const { day, minutes: mins } = nyClock(time);
    const date = cmeTradeDate(day, mins);
    if (!date) continue;
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
