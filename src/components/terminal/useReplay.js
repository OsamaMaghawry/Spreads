import { useEffect, useMemo, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { isCrypto, px, sizeText } from "@/lib/terminal";
import { hotkeyOrder } from "@/lib/hotkeys";
import {
  nextCursor, prevCursor, stepSeconds, isCalendar, countBefore, practiceFill, triggerExits, practiceExit, addTarget, removeTarget, targetSize,
  rollMinutes, replayClock, acctIn, bookValue
} from "@/lib/replay";

// The bar replay for the whole page: one clock, one practice book across
// symbols, and the candles of every symbol it touches. The charts follow its
// clock (components/terminal/PriceChart.jsx), the replay bar and the hotkeys
// trade its book, and the account window shows its results.
//
// 25 Oct: "Make sure that I can open muliple ticker at the same time during
// the reply or simulation." So the replay is not a chart's any more: any
// symbol on screen, in any chart, is replayed at the same moment, and a
// symbol with a practice position keeps being followed (its stop and
// take-profits keep working) when it is no longer on screen.
//
// Each symbol's candles (lib/replay.js has the rules): ten years of days, a
// month of minutes before the moment it was opened and five days after, a
// year of half hours before those (half a year for a coin); more minutes a
// week at a time as the clock runs on.

const DAY = 86400;
// Alpaca's history starts on 4 Jan 2016: no replay moment before its open.
const EARLIEST = Date.parse("2016-01-04T14:30:00Z") / 1000;

export default function useReplay({ accountId, notify }) {
  const [session, setSession] = useState(null);
  const [version, setVersion] = useState(0);
  // The last replay's book when it ended, so its results stay to read.
  const [last, setLast] = useState(null);
  const ref = useRef(null);
  ref.current = session;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const api = useMemo(() => {
    const data = new Map();
    const watching = new Map();
    const active = { symbol: null, interval: "1Min", regular: true };
    let stepping = false;
    // Bumped when the candles read so far are let go (a new replay, or going
    // back), so a read still on its way is not kept.
    let gen = 0;
    const bump = () => setVersion((v) => v + 1);
    const say = (t) => notifyRef.current?.(t);
    const patch = (p) => {
      const next = { ...ref.current, ...p };
      ref.current = next;
      setSession(next);
      return next;
    };

    const fetchCandles = async (symbol, tf, from, to) => {
      const r = await invokeFunction("terminal", { action: "replay", accountId: accountRef.current, symbol, tf, from: new Date(from * 1000).toISOString(), to: new Date(to * 1000).toISOString() });
      if (r?.data?.error) throw new Error(r.data.error);
      return r?.data?.bars || [];
    };

    // A symbol's candles around the replay's moment, read once.
    const load = (symbol) => {
      const r = ref.current;
      if (!r || !symbol) return Promise.resolve(null);
      const have = data.get(symbol);
      if (have?.promise) return have.promise;
      if (have?.ready) return Promise.resolve(have);
      const coin = isCrypto(symbol);
      const g = gen;
      const minuteFrom = Math.floor((r.cursor - 30 * DAY) / 1800) * 1800;
      const to = Math.min(r.cursor + 5 * DAY, r.end);
      const promise = Promise.all([
        fetchCandles(symbol, "1Day", r.start - 3650 * DAY, r.end),
        fetchCandles(symbol, "1Min", minuteFrom, to),
        fetchCandles(symbol, "30Min", minuteFrom - (coin ? 180 : 365) * DAY, minuteFrom).catch(() => [])
      ]).then(([days, minutes, context]) => ({
        symbol, ready: true, days, minutes, context: context.filter((b) => b.time + 1800 <= minuteFrom), loadedTo: to
      })).catch((e) => ({ symbol, ready: false, error: e.message })).then((d) => {
        if (ref.current?.id === r.id && g === gen) { data.set(symbol, d); bump(); }
        return d;
      });
      data.set(symbol, { symbol, ready: false, promise });
      bump();
      return promise;
    };

    // A symbol's one-minute candles loaded through `through`, a week at a time.
    const ensure = async (symbol, through) => {
      let d = data.get(symbol);
      if (!d?.ready) d = await load(symbol);
      if (!d?.ready) return d;
      const end = ref.current?.end ?? 0;
      while (d.loadedTo < Math.min(through, end)) {
        const from = d.loadedTo;
        const to = Math.min(from + 7 * DAY, end);
        const more = await fetchCandles(symbol, "1Min", from, to);
        const cur = data.get(symbol);
        if (!cur?.ready) return cur;
        const lastT = cur.minutes.at(-1)?.time ?? 0;
        // Minutes older than the short intraday charts look back are let go,
        // kept as half-hour candles for the longer ones.
        const kept = rollMinutes(cur, (ref.current?.cursor ?? from) - 35 * DAY);
        d = { ...kept, minutes: [...kept.minutes, ...more.filter((m) => m.time > lastT)], loadedTo: to };
        data.set(symbol, d);
      }
      return d;
    };

    const lastPrice = (symbol, cursor = ref.current?.cursor) => {
      const m = data.get(symbol)?.minutes;
      if (!m) return null;
      const i = countBefore(m, cursor) - 1;
      return i >= 0 ? m[i].close : null;
    };
    const priceOf = (symbol) => lastPrice(symbol);

    // Every symbol the clock must carry: those on screen, and those with a
    // practice position (their stop and take-profits keep working).
    const tracked = () => {
      const book = ref.current?.book || {};
      return [...new Set([...watching.keys(), ...Object.keys(book).filter((s) => book[s].qty)])];
    };

    // The stop and take-profits of one symbol against the minutes passed (a
    // share's in regular hours only, as the broker's orders), with a pop-up
    // for each fill.
    const runExits = (symbol, acct, passed) => {
      if (!acct.qty || (!acct.stop && !acct.targets.length) || !passed.length) return acct;
      const crypto = isCrypto(symbol);
      const out = triggerExits(acct, passed, { regularOnly: !crypto });
      out.trades.slice(acct.trades.length).forEach((t, i) => {
        const target = t.why === "target";
        say({
          key: `rp${symbol}${t.time}-${i}`, tone: target ? "ok" : "muted", title: `${symbol}: practice ${target ? "take-profit" : "stop"} filled${target && !out.qty ? ", flat" : ""}`,
          detail: `${t.side === "sell" ? "Sold" : "Bought back"} ${sizeText(t.qty)} at ${px(t.price)} · ${replayClock(t.time, crypto)} (replay)`
        });
      });
      return out;
    };

    // The clock to `t`: every tracked symbol's minutes through it, and their
    // exits checked on the way.
    const advance = async (from, t) => {
      await Promise.all(tracked().map((s) => ensure(s, t).catch(() => null)));
      if (!ref.current) return;
      let book = ref.current.book;
      for (const [s, acct] of Object.entries(book)) {
        const m = data.get(s)?.minutes;
        if (!m) continue;
        const out = runExits(s, acct, m.slice(countBefore(m, from), countBefore(m, t)));
        if (out !== acct) book = { ...book, [s]: out };
      }
      patch({ cursor: t, book, loading: false, note: null });
    };

    // Going back: a symbol whose minutes do not reach five days before the
    // new moment is read again from there (the half-hour candles carry the
    // longer charts further back), so a step or two back needs no new read.
    const rewind = (t) => {
      gen += 1;
      for (const [s, d] of data) {
        const first = d.minutes?.[0]?.time;
        if (!d.ready || first === undefined || first > t - 5 * DAY) data.delete(s);
      }
      for (const [s, d] of data) {
        // Kept, but nothing after the new moment's minutes may be missing.
        if (d.loadedTo < t) data.delete(s);
      }
      patch({ cursor: t, loading: false });
      tracked().forEach((s) => load(s));
      bump();
    };

    // A date's moment: on a day, week or month chart its close, so the day
    // picked is the last candle on screen (30 Oct, the owner: "I set it to
    // replay Jul 30 2026, it gives me 28 and can't go to the day"); on a
    // shorter chart the time given (the open, unless another is picked).
    const startOf = ({ from, time }, coin) => {
      const [hh, mm] = (isCalendar(active.interval) ? (coin ? "23:59" : "16:00") : time).split(":").map(Number);
      // New York time for shares (four hours behind UTC in summer, five in
      // winter), UTC for coins.
      let start = Date.parse(`${from}T00:00:00Z`) / 1000 + hh * 3600 + mm * 60;
      if (!coin) {
        const probe = new Date((start + 4 * 3600) * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" });
        start += (Number(probe) === hh ? 4 : 5) * 3600;
      }
      return start;
    };

    const say$ = {
      noPrice: (symbol) => say({ key: "rpx", tone: "bad", title: `No replay price for ${symbol} yet`, detail: data.get(symbol)?.error || "Its candles are loading, or it had not traded by this moment. Step forward once." })
    };

    const setAcct = (symbol, acct) => patch({ book: { ...ref.current.book, [symbol]: acct } });

    const self = {
      data, priceOf, lastPrice,
      dataFor: (symbol) => data.get(symbol),

      start(form, coin) {
        const start = Math.max(EARLIEST, startOf(form, coin) + (isCalendar(active.interval) && coin ? 60 : 0));
        const end = Math.min(Date.parse(`${form.to}T23:59:59Z`) / 1000, Math.floor(Date.now() / 1000) - 16 * 60);
        data.clear();
        gen += 1;
        setLast(null);
        patch({ id: Date.now(), start, end, cursor: start, playing: false, unit: "candle", speed: 1, loading: false, note: null, book: {} });
        tracked().forEach((s) => load(s));
        bump();
      },
      exit() {
        const r = ref.current;
        if (!r) return;
        const prices = Object.fromEntries(Object.keys(r.book).map((s) => [s, lastPrice(s)]));
        if (Object.keys(r.book).length) setLast({ book: r.book, prices, start: r.start, end: r.cursor });
        ref.current = null;
        setSession(null);
        data.clear();
        gen += 1;
        bump();
      },
      restart() {
        if (!ref.current) return;
        patch({ playing: false, book: {}, note: null });
        rewind(ref.current.start);
      },
      toggle() { if (ref.current) patch({ playing: !ref.current.playing, note: null }); },
      setUnit(unit) { patch({ unit }); },
      setSpeed(speed) { patch({ speed }); },
      // The chart a "1 candle" step follows: the one last clicked.
      setActive(a) { Object.assign(active, a); },
      // A chart showing `symbol` during the replay; the returned function lets go.
      watch(symbol) {
        watching.set(symbol, (watching.get(symbol) || 0) + 1);
        if (ref.current) load(symbol);
        return () => {
          const n = (watching.get(symbol) || 1) - 1;
          if (n) watching.set(symbol, n); else watching.delete(symbol);
        };
      },

      // One step: to the end of the next candle of the step unit, on the
      // active chart's symbol.
      async step() {
        const r = ref.current;
        if (!r || stepping) return false;
        stepping = true;
        try {
          const symbol = active.symbol || tracked()[0];
          if (!symbol) throw new Error("Open a chart to step through.");
          const coin = isCrypto(symbol);
          const unit = r.unit === "candle" ? active.interval : r.unit;
          const opts = { crypto: coin, regular: !coin && active.regular };
          let d = await ensure(symbol, r.cursor);
          if (!d?.ready) throw new Error(d?.error || `No candles for ${symbol}.`);
          let next = nextCursor(d, unit, r.cursor, opts);
          if ((next === null || next > d.loadedTo) && d.loadedTo < r.end) {
            patch({ loading: true });
            d = await ensure(symbol, next ?? d.loadedTo + 7 * DAY);
            next = nextCursor(d, unit, r.cursor, opts);
          }
          if (next !== null && next > d.loadedTo) d = await ensure(symbol, next);
          if (next === null || next > r.end + 60) {
            patch({ playing: false, loading: false, note: "The end of the replay range." });
            return false;
          }
          await advance(r.cursor, next);
          return true;
        } catch (e) {
          patch({ playing: false, loading: false, note: e.message });
          return false;
        } finally {
          stepping = false;
        }
      },
      // To a date: on a day, week or month chart its close, so it is the
      // last candle; on a shorter chart its open (shares) or midnight UTC
      // (coins). Before the replay's start too, back to 2016; not past its end.
      async jump(date) {
        const r = ref.current;
        if (!r) return;
        const coin = isCrypto(active.symbol || "");
        let t = startOf({ from: date, time: coin ? "00:00" : "09:30" }, coin) + (isCalendar(active.interval) && coin ? 60 : 0);
        t = Math.max(EARLIEST, Math.min(t, r.end));
        patch({ playing: false, loading: t > r.cursor });
        try {
          if (t > r.cursor) await advance(r.cursor, t);
          else { rewind(t); patch({ note: t < r.cursor ? "Went back: the practice account keeps its trades." : null }); }
        } catch (e) { patch({ loading: false, note: e.message }); }
      },

      // One step back: the last candle of the step unit on the active chart
      // taken off, so the one before it is the last on screen.
      async stepBack() {
        const r = ref.current;
        if (!r || stepping) return false;
        stepping = true;
        try {
          const symbol = active.symbol || tracked()[0];
          if (!symbol) throw new Error("Open a chart to step through.");
          const coin = isCrypto(symbol);
          const unit = r.unit === "candle" ? active.interval : r.unit;
          const d = data.get(symbol)?.ready ? data.get(symbol) : await load(symbol);
          if (!d?.ready) throw new Error(d?.error || `No candles for ${symbol}.`);
          // Nothing loaded before it: one candle's length back, read from there.
          const t = Math.max(EARLIEST, prevCursor(d, unit, r.cursor, { crypto: coin, regular: !coin && active.regular }) ?? r.cursor - stepSeconds(unit));
          if (!(t < r.cursor)) return false;
          patch({ playing: false });
          rewind(t);
          patch({ note: Object.keys(r.book).length ? "One candle back: the practice account keeps its trades." : null });
          return true;
        } catch (e) {
          patch({ playing: false, loading: false, note: e.message });
          return false;
        } finally {
          stepping = false;
        }
      },

      // ---------- the practice book ----------
      value() { return ref.current ? bookValue(ref.current.book, priceOf) : null; },
      trade(symbol, side, qty, why = "") {
        const r = ref.current;
        const price = lastPrice(symbol);
        if (!r) return;
        if (!price) { say$.noPrice(symbol); return; }
        if (!(qty > 0)) return;
        setAcct(symbol, practiceFill(acctIn(r.book, symbol), { side, qty, price, time: r.cursor - 1, why }));
        say({ key: `rp${Date.now()}`, tone: "ok", title: `Practice: ${side === "buy" ? "bought" : "sold"} ${sizeText(qty)} ${symbol} at ${px(price)}`, detail: "Replay only; nothing sent to the broker." });
      },
      flatten(symbol, pct = 100, why = "") {
        const q = acctIn(ref.current?.book || {}, symbol).qty;
        if (!q) return;
        let n = Math.abs(q) * pct / 100;
        if (!isCrypto(symbol) && pct < 100) n = Math.floor(n);
        self.trade(symbol, q > 0 ? "sell" : "buy", n, why);
      },
      // The stop (kind "stop") or one take-profit for the whole position in
      // place of any others ("target", the hotkey's); null removes it.
      setExit(symbol, kind, price) {
        const r = ref.current;
        if (!r) return;
        const name = kind === "stop" ? "stop" : "take-profit";
        const out = practiceExit(acctIn(r.book, symbol), kind, price, lastPrice(symbol));
        if (out.reason) { say({ key: `rp${kind}`, tone: "bad", title: `Practice ${name} not set`, detail: out.reason }); return; }
        setAcct(symbol, out.acct);
        say(price === null
          ? { key: `rp${kind}`, tone: "muted", title: `${symbol}: practice ${name} removed`, detail: "Replay only." }
          : { key: `rp${kind}`, tone: "ok", title: `${symbol}: practice ${name} at ${px(price)}`, detail: "For the whole position; it fills by itself when the replay gets there. Replay only." });
      },
      // A take-profit for part of the position: its price, and its size as
      // typed (blank for all that is left, "50%", or a number).
      addTarget(symbol, price, sizeText_) {
        const r = ref.current;
        if (!r) return false;
        const acct = acctIn(r.book, symbol);
        const size = targetSize(sizeText_, acct.qty, isCrypto(symbol));
        const out = size.reason ? size : addTarget(acct, { price, qty: size.qty }, lastPrice(symbol));
        if (out.reason) { say({ key: "rptarget", tone: "bad", title: "Practice take-profit not set", detail: out.reason }); return false; }
        setAcct(symbol, out.acct);
        say({ key: "rptarget", tone: "ok", title: `${symbol}: practice take-profit at ${px(price)}`, detail: `${size.qty === null ? "For all that is left" : `For ${sizeText(size.qty)}`} when it fills; it fills by itself when the replay gets there. Replay only.` });
        return true;
      },
      removeTarget(symbol, id) { if (ref.current) setAcct(symbol, removeTarget(acctIn(ref.current.book, symbol), id)); },
      clearExits(symbol) {
        if (!ref.current) return;
        setAcct(symbol, { ...acctIn(ref.current.book, symbol), stop: null, targets: [] });
        say({ key: "rpc", tone: "muted", title: `${symbol}: practice stop and take-profits removed`, detail: "Replay only." });
      },
      // A hotkey during the replay, on the symbol in the active chart.
      hotkey(h, symbol) {
        const r = ref.current;
        const price = lastPrice(symbol);
        if (!r) return;
        if (!price) { say$.noPrice(symbol); return; }
        const acct = acctIn(r.book, symbol);
        const coin = isCrypto(symbol);
        if (h.action === "buy" || h.action === "sell") {
          const equity = bookValue(r.book, priceOf).equity;
          const built = hotkeyOrder(h, { symbol, crypto: coin, quote: { bid: price, ask: price, last: price }, equity, buyingPower: equity, step: coin ? 1e-9 : null, session: "regular" });
          if (built.reason) { say({ key: "rph", tone: "bad", title: "Practice order not placed", detail: built.reason }); return; }
          self.trade(symbol, built.order.side, built.order.qty, h.keys);
        } else if (h.action === "exit") self.flatten(symbol, h.percent, h.keys);
        else if (h.action === "stop" || h.action === "target") {
          const from = h.from === "entry" && acct.avg ? acct.avg : price;
          const d = h.stopMode === "pct" ? from * h.stopValue / 100 : h.stopValue;
          // A long's stop below, its target above; a short's the other way round.
          const below = (h.action === "stop") === (acct.qty > 0);
          const tick = from >= 1 ? 100 : 1e6;
          self.setExit(symbol, h.action, Math.round((below ? from - d : from + d) * tick) / tick);
        } else self.clearExits(symbol);
      }
    };
    return self;
  }, []);

  // Playing: a step every 1/speed seconds, each after the last has landed.
  useEffect(() => {
    if (!session?.playing) return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      if (!alive) return;
      const ok = await api.step();
      if (alive && ok && ref.current?.playing) timer = setTimeout(tick, 1000 / (ref.current.speed || 1));
    };
    timer = setTimeout(tick, 1000 / (session.speed || 1));
    return () => { alive = false; clearTimeout(timer); };
  }, [session?.playing, session?.speed, api]);

  return { session, version, last, replay: api };
}
