// A prop-firm style evaluation, checked as a futures practice replay plays.
// The trader types his own firm's numbers. Nothing here is any firm's rule
// book and there is no preset: firms differ in every rule below, so each one
// is a setting, and a rule left blank is off (never quietly filled in).
//
// The checks:
// - profit target: closed balance at or above start + target, flat, with the
//   minimum number of trading days (days with a fill) and the consistency
//   rule met;
// - maximum loss: equity (open profit included) at or below the floor fails
//   the evaluation. The floor is
//     static:   start - maxLoss, never moves;
//     eod:      trails the highest end-of-day equity (marked at the last
//               price before the 17:00 halt, as a firm marks to settlement);
//     intraday: trails the highest equity seen, open profit included;
//   and, trailing, stops rising at `lockAt` (by default the starting balance;
//   some firms lock at start + $100);
// - daily loss limit, measured from the day's opening `dailyBase`:
//     "equity":  equity at the 18:00 roll, so a position carried over the
//                roll counts only its move since then;
//     "balance": the prior closed balance;
//   counting open profit and loss (`dailyCountsOpen`, default) or closed only.
//   "lock" flattens and blocks orders until the next trade date; "fail" ends it;
// - maximum contracts, counted gross across the book, micros either as whole
//   contracts or as their fraction of the full-size one (`microsAsFraction`);
// - flat by: a New York time after which no position may be held;
// - consistency: the best day no more than `consistencyPct` of the total
//   profit, or of the profit target (`consistencyBase`).
//
// Breaches are checked at the worst price of each step (a bar's low for a
// long, its high for a short), passed as `worstEquity`; the caller carries out
// the flatten this returns, at that price, which is no slippage model.
//
// Days are CME trade dates (futuresSpecs cmeTradeDate): from 18:00 New York
// the next date's session has begun.
//
// Pure and tested (propRules.test.js).

import { PARENT } from "../../supabase/functions/_shared/futuresSpecs.js";

const cents = (x) => Math.round(x * 100) / 100 || 0;

/** The settings, each with what it does; the form is built from this. */
export const RULE_FIELDS = Object.freeze([
  "accountSize", "profitTarget", "maxLoss", "drawdown", "lockAt", "dailyLoss", "dailyLossMode", "dailyBase", "dailyCountsOpen",
  "maxContracts", "microsAsFraction", "flatBy", "minDays", "consistencyPct", "consistencyBase"
]);

/**
 * Rules as typed, with every field present; `reason` when one is missing that
 * the evaluation cannot run without (size, target, maximum loss). Optional
 * rules left blank are off.
 */
export function cleanRules(input = {}) {
  const num = (v) => (v === null || v === "" || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const r = input || {};
  const out = {
    accountSize: num(r.accountSize), profitTarget: num(r.profitTarget), maxLoss: num(r.maxLoss),
    drawdown: ["static", "eod", "intraday"].includes(r.drawdown) ? r.drawdown : null,
    lockAt: num(r.lockAt),
    dailyLoss: num(r.dailyLoss), dailyLossMode: r.dailyLossMode === "fail" ? "fail" : "lock",
    dailyBase: r.dailyBase === "balance" ? "balance" : "equity", dailyCountsOpen: r.dailyCountsOpen !== false,
    maxContracts: num(r.maxContracts), microsAsFraction: r.microsAsFraction === true,
    flatBy: num(r.flatBy), minDays: num(r.minDays) || 0,
    consistencyPct: num(r.consistencyPct), consistencyBase: r.consistencyBase === "target" ? "target" : "profit"
  };
  if (!(out.accountSize > 0)) return { rules: out, reason: "Enter the account size." };
  if (!(out.profitTarget > 0)) return { rules: out, reason: "Enter the profit target." };
  if (!(out.maxLoss > 0)) return { rules: out, reason: "Enter the maximum loss." };
  if (!out.drawdown) return { rules: out, reason: "Choose how the maximum loss moves: static, end of day or intraday." };
  if (out.lockAt === null) out.lockAt = out.accountSize;
  return { rules: out };
}

/** The evaluation before its first trade. */
export function newChallenge(rules) {
  return {
    status: "active", // active | locked (for the day) | passed | failed
    why: null,
    balance: rules.accountSize, equity: rules.accountSize,
    high: rules.accountSize, // the highest end-of-day (eod) or any (intraday) equity the floor trails
    floor: cents(rules.accountSize - rules.maxLoss),
    day: null, dayOpen: rules.accountSize, dayOpenBalance: rules.accountSize, lockedDay: null,
    days: {} // trade date -> { pl, traded }
  };
}

const trailFloor = (s, rules, high) => (rules.drawdown === "static" ? s.floor : cents(Math.max(s.floor, Math.min(high - rules.maxLoss, rules.lockAt))));

/**
 * Contracts held across the book, gross (a long and a short both count):
 * `positions` [{ root, qty }]. With `microsAsFraction`, an E-mini or micro
 * counts as its share of the full-size contract (10 MES = 1 ES).
 */
export function heldContracts(positions, rules) {
  let n = 0;
  for (const p of positions) {
    const q = Math.abs(Number(p.qty) || 0);
    const ratio = rules?.microsAsFraction && PARENT[p.root] ? PARENT[p.root][1] : 1;
    n += q / ratio;
  }
  return Math.round(n * 1e6) / 1e6;
}

/**
 * One moment of the replay. `day`: its CME trade date; `minutes`: New York
 * minute of the day; `balance`: closed balance (start + realized, net of
 * commission); `equity`: balance plus open profit at the step's price;
 * `worstEquity`: equity at the step's worst price (defaults to `equity`);
 * `contracts`: held, as heldContracts counts them; `traded`: whether a fill
 * happened since the last step. Returns the new state and `flatten: true`
 * when the position must be closed now.
 */
export function challengeStep(s, rules, { day, minutes, balance, equity, worstEquity, contracts, traded = false }) {
  if (s.status === "passed" || s.status === "failed") return { state: s, flatten: contracts !== 0 };
  const st = { ...s, days: { ...s.days } };
  if (day && day !== st.day) {
    // The day before has closed: an end-of-day floor trails its closing equity,
    // and today's loss is measured from here.
    if (st.day && rules.drawdown === "eod") { st.high = Math.max(st.high, st.equity); st.floor = trailFloor(st, rules, st.high); }
    st.day = day;
    st.dayOpen = rules.dailyBase === "balance" ? st.balance : st.equity;
    st.dayOpenBalance = st.balance;
    if (st.status === "locked" && st.lockedDay !== day) { st.status = "active"; st.why = null; st.lockedDay = null; }
  }
  st.balance = cents(balance);
  st.equity = cents(equity);
  const worst = cents(Math.min(equity, worstEquity ?? equity));
  if (day) {
    const d = st.days[day] || { pl: 0, traded: false };
    // The day's result for the consistency rule: closed balance against its opening.
    st.days[day] = { pl: cents(st.balance - st.dayOpenBalance), traded: d.traded || traded };
  }
  if (rules.drawdown === "intraday") { st.high = Math.max(st.high, st.equity); st.floor = trailFloor(st, rules, st.high); }

  const held = contracts !== 0;
  if (worst <= st.floor) {
    return { state: { ...st, status: "failed", why: `Equity ${money(worst)} reached the maximum-loss floor ${money(st.floor)}.` }, flatten: held };
  }
  const todayLow = rules.dailyCountsOpen ? worst - st.dayOpen : st.balance - st.dayOpenBalance;
  if (rules.dailyLoss > 0 && todayLow <= -rules.dailyLoss) {
    const why = `Down ${money(-todayLow)} today; the daily loss limit is ${money(rules.dailyLoss)}.`;
    if (rules.dailyLossMode === "fail") return { state: { ...st, status: "failed", why }, flatten: held };
    return { state: { ...st, status: "locked", why, lockedDay: st.day }, flatten: held };
  }
  if (st.status === "locked") return { state: st, flatten: held };
  if (!held) {
    const goal = goalMet(st, rules);
    if (goal.met) return { state: { ...st, status: "passed", why: goal.why }, flatten: false };
  }
  const late = rules.flatBy !== null && minutes !== undefined && minutes >= rules.flatBy && minutes < 18 * 60;
  return { state: st, flatten: late && held, ...(late && held ? { note: `Past the flat-by time, ${clock(rules.flatBy)} New York.` } : {}) };
}

/** Whether the profit target, the minimum days and the consistency rule are all met, and what is left if not. */
export function goalMet(st, rules) {
  const profit = cents(st.balance - rules.accountSize);
  const traded = Object.values(st.days).filter((d) => d.traded).length;
  if (profit < rules.profitTarget) return { met: false, why: `${money(rules.profitTarget - profit)} to the target.` };
  if (traded < rules.minDays) return { met: false, why: `Target reached; ${rules.minDays - traded} more trading day(s) needed.` };
  if (rules.consistencyPct > 0) {
    const best = Math.max(0, ...Object.values(st.days).map((d) => d.pl));
    const base = rules.consistencyBase === "target" ? rules.profitTarget : profit;
    if (best > (base * rules.consistencyPct) / 100 + 1e-9) {
      return { met: false, why: `Best day ${money(best)} is over ${rules.consistencyPct}% of the ${rules.consistencyBase === "target" ? "target" : "profit"} (${money(base)}).` };
    }
  }
  return { met: true, why: `Target ${money(rules.profitTarget)} reached in ${traded} trading day(s).` };
}

/**
 * Whether an order may go in: refused while locked, failed or passed, and
 * when the book would then hold more contracts than allowed (`after`, as
 * heldContracts counts them, gross; `held`: before it), and after the flat-by
 * time any order that would add to what is held (`minutes`, New York).
 */
export function canOrder(s, rules, { after, held = 0, minutes }) {
  if (s.status === "failed") return { ok: false, reason: `The evaluation failed: ${s.why}` };
  if (s.status === "passed") return { ok: false, reason: "The evaluation is passed. Start a new one to keep trading." };
  if (s.status === "locked") return { ok: false, reason: `Locked until the next session: ${s.why}` };
  if (rules.flatBy !== null && minutes !== undefined && minutes >= rules.flatBy && minutes < 18 * 60 && after > held + 1e-9) return { ok: false, reason: "Past the flat-by time: no new positions until the 18:00 session." };
  if (rules.maxContracts > 0 && after > rules.maxContracts + 1e-9) return { ok: false, reason: `That would hold ${after} contracts; the limit is ${rules.maxContracts}.` };
  return { ok: true };
}

const money = (x) => `$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
