// A prop-firm style evaluation, checked as a futures practice replay plays.
// The trader types his own firm's numbers; nothing here is any firm's rule
// book, and the templates below are generic shapes, not firm names.
//
// The checks, each as firms commonly word them:
// - profit target: closed balance at or above start + target, flat, with the
//   minimum number of trading days, and the consistency rule met;
// - maximum loss: equity (open profit and loss included) at or below the
//   floor fails the evaluation. The floor is
//     static:   start - maxLoss, never moves;
//     eod:      trails the highest end-of-day closed balance by maxLoss;
//     intraday: trails the highest equity seen, open profit included;
//   and, trailing, stops rising once it reaches `lockAt` (by default the
//   starting balance);
// - daily loss limit: equity down `dailyLoss` from the day's opening balance.
//   "fail" ends the evaluation; "lock" flattens and blocks orders until the
//   next trade date;
// - maximum contracts: an order that would hold more is refused;
// - flat by: a time of day (New York) after which no position may be held;
// - consistency: no single day's profit above `consistencyPct` of the total.
//
// Days are CME trade dates (lib futuresSpecs cmeTradeDate): from 18:00 New
// York the next date's session has begun.
//
// Pure and tested (propRules.test.js).

const cents = (x) => Math.round(x * 100) / 100 || 0;

/** Generic starting shapes; every number is meant to be changed to the trader's firm's. */
export const PROP_TEMPLATES = Object.freeze({
  "50K": { accountSize: 50000, profitTarget: 3000, maxLoss: 2000, drawdown: "eod", dailyLoss: 1000, dailyLossMode: "lock", maxContracts: 5, flatBy: 16 * 60 + 59, minDays: 2, consistencyPct: null },
  "100K": { accountSize: 100000, profitTarget: 6000, maxLoss: 3000, drawdown: "eod", dailyLoss: 2000, dailyLossMode: "lock", maxContracts: 10, flatBy: 16 * 60 + 59, minDays: 2, consistencyPct: null },
  "150K": { accountSize: 150000, profitTarget: 9000, maxLoss: 4500, drawdown: "eod", dailyLoss: 3000, dailyLossMode: "lock", maxContracts: 15, flatBy: 16 * 60 + 59, minDays: 2, consistencyPct: null }
});

/** Rules with every field present and sane; `reason` when one cannot be used. */
export function cleanRules(input) {
  const r = { ...PROP_TEMPLATES["50K"], ...(input || {}) };
  const num = (v) => (v === null || v === "" || v === undefined ? null : Number(v));
  const out = {
    accountSize: num(r.accountSize), profitTarget: num(r.profitTarget), maxLoss: num(r.maxLoss),
    drawdown: ["static", "eod", "intraday"].includes(r.drawdown) ? r.drawdown : "eod",
    lockAt: num(r.lockAt), dailyLoss: num(r.dailyLoss), dailyLossMode: r.dailyLossMode === "fail" ? "fail" : "lock",
    maxContracts: num(r.maxContracts), flatBy: num(r.flatBy), minDays: num(r.minDays) || 0,
    consistencyPct: num(r.consistencyPct)
  };
  if (!(out.accountSize > 0)) return { rules: out, reason: "Enter the account size." };
  if (!(out.maxLoss > 0)) return { rules: out, reason: "Enter the maximum loss." };
  if (out.lockAt === null) out.lockAt = out.accountSize;
  return { rules: out };
}

/** The evaluation before its first trade. */
export function newChallenge(rules) {
  return {
    status: "active", // active | locked (for the day) | passed | failed
    why: null,
    balance: rules.accountSize, equity: rules.accountSize,
    high: rules.accountSize, // the highest balance (eod) or equity (intraday) the floor trails
    floor: cents(rules.accountSize - rules.maxLoss),
    day: null, dayOpen: rules.accountSize, lockedDay: null,
    days: {} // trade date -> { pl, traded }
  };
}

function trailFloor(s, rules, high) {
  if (rules.drawdown === "static") return s.floor;
  return cents(Math.max(s.floor, Math.min(high - rules.maxLoss, rules.lockAt)));
}

/**
 * One moment of the replay. `day`: its CME trade date; `minutes`: New York
 * minute of the day; `balance`: closed balance (start + realized, net of
 * commission); `equity`: balance plus open profit; `contracts`: open
 * contracts in all; `traded`: whether a fill happened since the last step.
 * Returns the new state and `flatten: true` when the position must be closed now.
 */
export function challengeStep(s, rules, { day, minutes, balance, equity, contracts, traded = false }) {
  if (s.status === "passed" || s.status === "failed") return { state: s, flatten: contracts !== 0 };
  let st = { ...s, days: { ...s.days } };
  if (day && day !== st.day) {
    // The previous day closed: an end-of-day floor trails its closing balance.
    if (st.day && rules.drawdown === "eod") { st.high = Math.max(st.high, st.balance); st.floor = trailFloor(st, rules, st.high); }
    st.day = day;
    st.dayOpen = st.balance;
    if (st.status === "locked" && st.lockedDay !== day) { st.status = "active"; st.why = null; st.lockedDay = null; }
  }
  st.balance = cents(balance);
  st.equity = cents(equity);
  if (day) {
    const d = st.days[day] || { pl: 0, traded: false };
    st.days[day] = { pl: cents(st.balance - st.dayOpen), traded: d.traded || traded };
  }
  if (rules.drawdown === "intraday") { st.high = Math.max(st.high, st.equity); st.floor = trailFloor(st, rules, st.high); }

  if (st.equity <= st.floor) {
    return { state: { ...st, status: "failed", why: `Equity ${money(st.equity)} reached the maximum-loss floor ${money(st.floor)}.` }, flatten: contracts !== 0 };
  }
  if (rules.dailyLoss > 0 && st.equity - st.dayOpen <= -rules.dailyLoss) {
    const why = `Down ${money(st.dayOpen - st.equity)} today, the daily loss limit is ${money(rules.dailyLoss)}.`;
    if (rules.dailyLossMode === "fail") return { state: { ...st, status: "failed", why }, flatten: contracts !== 0 };
    return { state: { ...st, status: "locked", why, lockedDay: st.day }, flatten: contracts !== 0 };
  }
  if (st.status === "locked") return { state: st, flatten: contracts !== 0 };
  const late = rules.flatBy !== null && minutes !== undefined && minutes >= rules.flatBy && minutes < 18 * 60;
  if (contracts === 0) {
    const goal = goalMet(st, rules);
    if (goal.met) return { state: { ...st, status: "passed", why: goal.why }, flatten: false };
  }
  return { state: st, flatten: late && contracts !== 0, ...(late && contracts !== 0 ? { note: `Past the flat-by time, ${clock(rules.flatBy)} New York.` } : {}) };
}

/** Whether the profit target, the minimum days and the consistency rule are all met. */
export function goalMet(st, rules) {
  const profit = cents(st.balance - rules.accountSize);
  const traded = Object.values(st.days).filter((d) => d.traded).length;
  if (!(rules.profitTarget > 0) || profit < rules.profitTarget) return { met: false, why: `${money(Math.max(0, rules.profitTarget - profit))} to the target.` };
  if (traded < rules.minDays) return { met: false, why: `Target reached; ${rules.minDays - traded} more trading day(s) needed.` };
  if (rules.consistencyPct > 0) {
    const best = Math.max(...Object.values(st.days).map((d) => d.pl));
    if (best > (profit * rules.consistencyPct) / 100 + 1e-9) {
      return { met: false, why: `Best day ${money(best)} is over ${rules.consistencyPct}% of the ${money(profit)} profit.` };
    }
  }
  return { met: true, why: `Target ${money(rules.profitTarget)} reached in ${traded} trading day(s).` };
}

/**
 * Whether an order may go in: refused while locked, failed or passed, and
 * when it would hold more contracts than allowed. `held`: contracts held
 * across the book now; `after`: contracts held if it fills.
 */
export function canOrder(s, rules, { after }) {
  if (s.status === "failed") return { ok: false, reason: `The evaluation failed: ${s.why}` };
  if (s.status === "passed") return { ok: false, reason: "The evaluation is passed. Start a new one to keep trading." };
  if (s.status === "locked") return { ok: false, reason: `Locked until the next session: ${s.why}` };
  if (rules.maxContracts > 0 && Math.abs(after) > rules.maxContracts) return { ok: false, reason: `That would hold ${Math.abs(after)} contracts; the limit is ${rules.maxContracts}.` };
  return { ok: true };
}

const money = (x) => `$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
