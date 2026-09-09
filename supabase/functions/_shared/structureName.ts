// What to CALL a set of legs.
//
// A label, and only a label. Nothing in this file may gate anything: not a
// quote, not an order, not a risk figure. That separation is the whole point.
// The app used to decide what a position was WORTH by first deciding what it
// was CALLED, so a shape nobody had named had no price, no risk and no way to
// be closed — and on 8 Sep a live 1x2 was ordered as a 1x1 for exactly that
// reason. legMath.ts answers the money questions from the legs alone. This
// file answers "what does a trader call this", and if it gets the answer
// wrong the position still prices and still closes.
//
// So the fallback is never an error. "4-leg call structure" is a perfectly
// good name for something we have not met before, and it appears beside
// correct numbers.

import type { Leg } from "./legMath.ts";

type Named = { label: string; kind: string; confident: boolean };

const money = (n: number) => (Number.isInteger(n) ? `${n}` : `${n}`);
const strikeList = (ls: Leg[]) => ls.map((l) => money(Number(l.strike))).join("/");

// Everything the rules below ask about, computed once.
function shape(legs: Leg[]) {
  const opts = legs.filter((l) => l.type === "C" || l.type === "P");
  const stock = legs.filter((l) => l.type === "S");
  const calls = opts.filter((l) => l.type === "C").sort((a, b) => Number(a.strike) - Number(b.strike));
  const puts = opts.filter((l) => l.type === "P").sort((a, b) => Number(a.strike) - Number(b.strike));
  const expiries = [...new Set(opts.map((l) => String(l.expiry ?? "")))];
  const shares = stock.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  const long = (l: Leg) => (Number(l.qty) || 0) > 0;
  const q = (l: Leg) => Math.abs(Number(l.qty) || 0);
  return { opts, calls, puts, expiries, shares, long, q, oneExpiry: expiries.length <= 1 };
}

// True when the two legs are one-for-one; a ratio is anything else.
const evenPair = (a: Leg, b: Leg) => Math.abs(Number(a.qty)) === Math.abs(Number(b.qty));

function nameOptions(legs: Leg[]): Named | null {
  const s = shape(legs);
  const { calls, puts, opts, long, q } = s;
  if (!opts.length) return null;

  // --- one leg ------------------------------------------------------------
  if (opts.length === 1) {
    const l = opts[0];
    const side = long(l) ? "Long" : "Short";
    return { label: `${side} ${Number(l.strike)}${l.type}`, kind: long(l) ? "long_option" : "short_option", confident: true };
  }

  // --- two legs, same type ------------------------------------------------
  if (opts.length === 2 && (calls.length === 2 || puts.length === 2)) {
    const [a, b] = calls.length === 2 ? calls : puts;
    const t = calls.length === 2 ? "call" : "put";
    const sameStrike = Number(a.strike) === Number(b.strike);
    const opposed = long(a) !== long(b);

    if (!opposed) {
      return { label: `${q(a) + q(b)} ${t}s, same side`, kind: "same_side_pair", confident: false };
    }
    if (!s.oneExpiry) {
      return sameStrike
        ? { label: `${t[0].toUpperCase()}${t.slice(1)} calendar ${Number(a.strike)}`, kind: "calendar", confident: true }
        : { label: `${t[0].toUpperCase()}${t.slice(1)} diagonal ${strikeList([a, b])}`, kind: "diagonal", confident: true };
    }
    if (!evenPair(a, b)) {
      const longLeg = long(a) ? a : b;
      const shortLeg = long(a) ? b : a;
      return {
        label: `${q(longLeg)}×${q(shortLeg)} ${t} ratio ${Number(longLeg.strike)}/${Number(shortLeg.strike)}`,
        kind: "ratio_spread",
        confident: true
      };
    }
    // A vertical. Which way it leans is the long leg's position, not the
    // premium: a spread's identity does not change with the price it was put
    // on at.
    const lower = Number(a.strike) < Number(b.strike) ? a : b;
    const bullish = t === "call" ? long(lower) : !long(lower);
    return {
      label: `${bullish ? "Bull" : "Bear"} ${t} spread ${strikeList([a, b])}`,
      kind: "vertical",
      confident: true
    };
  }

  // --- two legs, one call and one put -------------------------------------
  if (opts.length === 2 && calls.length === 1 && puts.length === 1) {
    const c = calls[0];
    const p = puts[0];
    const sameStrike = Number(c.strike) === Number(p.strike);
    if (long(c) === long(p)) {
      const side = long(c) ? "Long" : "Short";
      return sameStrike
        ? { label: `${side} straddle ${Number(c.strike)}`, kind: "straddle", confident: true }
        : { label: `${side} strangle ${Number(p.strike)}/${Number(c.strike)}`, kind: "strangle", confident: true };
    }
    if (sameStrike) {
      return {
        label: `Synthetic ${long(c) ? "long" : "short"} stock ${Number(c.strike)}`,
        kind: "synthetic_stock",
        confident: true
      };
    }
    return {
      label: `Risk reversal ${Number(p.strike)}/${Number(c.strike)}`,
      kind: "risk_reversal",
      confident: true
    };
  }

  // --- three legs, all one type -------------------------------------------
  if (opts.length === 3 && (calls.length === 3 || puts.length === 3)) {
    const g = calls.length === 3 ? calls : puts;
    const t = calls.length === 3 ? "call" : "put";
    const [lo, mid, hi] = g;
    const wings = long(lo) && long(hi) && !long(mid);
    if (wings && q(mid) === q(lo) + q(hi)) {
      const lw = Number(mid.strike) - Number(lo.strike);
      const rw = Number(hi.strike) - Number(mid.strike);
      return lw === rw
        ? { label: `${t[0].toUpperCase()}${t.slice(1)} butterfly ${strikeList(g)}`, kind: "butterfly", confident: true }
        : { label: `Broken-wing ${t} butterfly ${strikeList(g)}`, kind: "broken_wing", confident: true };
    }
    const longs = g.filter(long);
    const shorts = g.filter((l) => !long(l));
    if (longs.length === 1 && shorts.length === 2) {
      return { label: `${t[0].toUpperCase()}${t.slice(1)} ladder ${strikeList(g)}`, kind: "ladder", confident: true };
    }
    return { label: `3-leg ${t} structure`, kind: "multi_leg", confident: false };
  }

  // --- four legs ----------------------------------------------------------
  if (opts.length === 4) {
    if (calls.length === 2 && puts.length === 2) {
      const [pl, ph] = puts;
      const [cl, ch] = calls;
      const distinct = [...new Set(opts.map((l) => Number(l.strike)))].sort((a, b) => a - b);
      // A BOX first, because it is the degenerate case the iron tests would
      // otherwise claim: the same two strikes carrying both a call spread and
      // a put spread is a synthetic long at one strike and a synthetic short
      // at the other, not a condor with its wings collapsed. Read as a
      // reverse iron condor at "100/110P / 100/110C" until this ran first.
      if (distinct.length === 2 && long(cl) !== long(ch) && long(pl) !== long(ph) && long(cl) !== long(pl)) {
        return { label: `Box ${distinct.join("/")}`, kind: "box", confident: true };
      }
      // Iron: the inner legs short, the outer long.
      const iron = !long(ph) && long(pl) && !long(cl) && long(ch);
      if (iron) {
        return Number(ph.strike) === Number(cl.strike)
          ? { label: `Iron butterfly ${Number(ph.strike)}`, kind: "iron_butterfly", confident: true }
          : {
              label: `Iron condor ${strikeList([pl, ph])}P / ${strikeList([cl, ch])}C`,
              kind: "iron_condor",
              confident: true
            };
      }
      // Reverse iron: the inner legs long.
      if (long(ph) && !long(pl) && long(cl) && !long(ch)) {
        return { label: `Reverse iron condor ${strikeList([pl, ph])}P / ${strikeList([cl, ch])}C`, kind: "reverse_iron_condor", confident: true };
      }
      return { label: "4-leg call/put structure", kind: "multi_leg", confident: false };
    }
    if (calls.length === 4 || puts.length === 4) {
      const g = calls.length === 4 ? calls : puts;
      const t = calls.length === 4 ? "call" : "put";
      const [a, b, c, d] = g;
      if (long(a) && !long(b) && !long(c) && long(d)) {
        return { label: `${t[0].toUpperCase()}${t.slice(1)} condor ${strikeList(g)}`, kind: "condor", confident: true };
      }
      if (!s.oneExpiry) {
        return { label: `${t[0].toUpperCase()}${t.slice(1)} double calendar`, kind: "double_calendar", confident: false };
      }
      return { label: `4-leg ${t} structure`, kind: "multi_leg", confident: false };
    }
  }

  // --- anything else ------------------------------------------------------
  const kindWord = calls.length && puts.length ? "call/put" : calls.length ? "call" : "put";
  return { label: `${opts.length}-leg ${kindWord} structure`, kind: "multi_leg", confident: false };
}

// The label for a whole position, stock included.
//
// Stock changes what several option shapes are called, so it is applied over
// the option name rather than folded into it: a short call is a short call
// until there are shares behind it, and then it is a covered call.
export function structureName(legs: Leg[]): Named {
  if (!Array.isArray(legs) || !legs.length) return { label: "Position", kind: "unknown", confident: false };
  const s = shape(legs);
  const opts = s.opts;

  if (!opts.length) {
    return s.shares >= 0
      ? { label: "Shares", kind: "shares", confident: true }
      : { label: "Short shares", kind: "short_shares", confident: true };
  }

  const named = nameOptions(legs) as Named;
  if (!s.shares) return named;

  const covers = Math.floor(Math.abs(s.shares) / 100);
  const shortCalls = s.calls.filter((l) => !s.long(l)).reduce((n, l) => n + s.q(l), 0);
  const longPuts = s.puts.filter(s.long).reduce((n, l) => n + s.q(l), 0);

  // The three classic stock-plus-options positions, then the general case.
  if (opts.length === 1 && shortCalls > 0 && covers >= shortCalls) {
    return { label: `Covered call ${Number(s.calls[0].strike)}`, kind: "covered_call", confident: true };
  }
  if (opts.length === 1 && longPuts > 0) {
    return { label: `Protective put ${Number(s.puts[0].strike)}`, kind: "protective_put", confident: true };
  }
  if (opts.length === 2 && shortCalls > 0 && longPuts > 0) {
    return { label: `Collar ${Number(s.puts[0].strike)}/${Number(s.calls[0].strike)}`, kind: "collar", confident: true };
  }
  // Stock plus a call ratio financed by it: the repair. Named for what the
  // trader was doing, not for the leg count.
  if (named.kind === "ratio_spread" && s.calls.length === 2 && shortCalls > covers - 1) {
    return { label: "Stock repair", kind: "stock_repair", confident: true };
  }
  return { label: `${named.label} + ${Math.abs(s.shares)} shares`, kind: named.kind, confident: named.confident };
}
