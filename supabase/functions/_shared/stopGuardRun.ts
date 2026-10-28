// Stops and take profits outside regular hours: watching and firing (the rules are
// stopGuard.ts). Two watchers share this: the open terminal's relay
// (marketStream), from each live trade, and the minute job (functions/
// terminal "guardStops") while no terminal is open. terminal_stop_fires,
// keyed by the broker's order id, lets only one of them fire a stop.
import { alpacaFetch, tradingBase, loadAccount } from "./alpaca.ts";
import { recordAttempt } from "./orderAttempts.ts";
import { usSession } from "./positionTools.ts";
import { guardedStops, guardHours, hit, exitOrder, restoreOrder, handBack, chasePrice, CHASE_LABEL, type Guard, type Kind } from "./stopGuard.ts";
import { inBackground } from "./background.ts";

const OPEN = new Set(["new", "accepted", "pending_new", "accepted_for_bidding", "held", "partially_filled"]);
// On its way to another state: a price change or a cancel being worked.
const BUSY = new Set(["pending_replace", "pending_cancel", "calculated"]);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const DATA = "https://data.alpaca.markets/v2";
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// The market as the chase reads it: Alpaca's IEX quote when it is fresh (a
// quote a minute old is not the market), and the last price: the trade that
// fired the stop, else the broker's own mark on the position.
async function marketNow(account: any, symbol: string, last: number | null) {
  const sym = encodeURIComponent(symbol);
  const [q, pos] = await Promise.all([
    alpacaFetch(`${DATA}/stocks/${sym}/quotes/latest?feed=iex`, account).catch(() => null),
    last === null ? alpacaFetch(`${tradingBase(account)}/positions/${sym}`, account).catch(() => null) : Promise.resolve(null)
  ]);
  const quote = q?.quote || {};
  const fresh = !!quote.t && Date.now() - Date.parse(quote.t) < 60000;
  return { bid: fresh ? num(quote.bp) : null, ask: fresh ? num(quote.ap) : null, last: last ?? num(pos?.current_price) };
}

/**
 * A fired stop's sale followed until it fills (28 Oct, the owner: "Chase the
 * bid"): every three seconds, if it has not filled, its limit moves to the
 * bid (the ask, buying back), only ever toward the market; in regular hours
 * too, if it is still working at the open. For `seconds`, then the minute job
 * carries on (chaseFired). Each step marks the fire as being followed, so the
 * two never move it at once.
 */
export async function chaseExit(admin: any, account: any, row: { order_id: string; exit_order_id: string; symbol: string; side: "buy" | "sell"; note?: string | null }, seconds = 50) {
  const base = tradingBase(account);
  const first = String(row.note || "").split(/ Following the bid| Resending the rest/)[0];
  let id = row.exit_order_id;
  const touch = (fields: Record<string, unknown> = {}) =>
    admin.from("terminal_stop_fires").update({ ...fields, updated_at: now() }).eq("order_id", row.order_id);
  // Sales this chase cancelled itself, to send the rest again: not "cancelled
  // by hand". Said in the note too, for a chase that takes over from this one.
  const ours = new Set<string>(String(row.note || "").includes(" Resending the rest") ? [row.exit_order_id] : []);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const exit = await alpacaFetch(`${base}/orders/${id}`, account).catch(() => null);
    if (exit?.status === "replaced" && exit.replaced_by) { id = exit.replaced_by; await touch({ exit_order_id: id }); continue; }
    // On its way somewhere (a price change or a cancel being worked): looked at again shortly.
    if (exit && BUSY.has(exit.status)) { await pause(1000); continue; }
    if (exit?.status === "canceled" && ours.has(exit.id)) {
      // Cancelled here to send the rest again, and that send did not go: it goes now.
      const sent = await sendRest(account, exit, chasePrice(row.side, await marketNow(account, row.symbol, null)));
      if (sent === "nothing") { await touch({ status: "done", note: `${first} Nothing left to sell.` }); return "done"; }
      if (sent?.id) { id = sent.id; await touch({ exit_order_id: id }); } else await touch();
      await pause(3000);
      continue;
    }
    if (exit?.status === "filled") {
      await touch({ status: "done", note: `${first} Filled at ${exit.filled_avg_price}.` });
      console.log(`stop guard chase: ${JSON.stringify({ symbol: row.symbol, filled: exit.filled_avg_price })}`);
      return "done";
    }
    if (exit && !OPEN.has(exit.status)) {
      const byHand = exit.status === "canceled";
      await touch({ status: byHand ? "cancelled" : "failed", note: byHand ? "The sale was cancelled by hand; the stop was not put back." : `The sale ended unfilled (${exit.status}); the position has no stop.` });
      return exit.status;
    }
    if (exit) {
      const next = chasePrice(row.side, await marketNow(account, row.symbol, null), num(exit.limit_price));
      let moved: any = null;
      if (next !== null && !(Number(exit.filled_qty) > 0)) {
        // The new order keeps the label, so it is still followed, and never handed back as a stop.
        moved = await alpacaFetch(`${base}/orders/${id}`, account, {
          method: "PATCH", body: JSON.stringify({ limit_price: String(next), client_order_id: `${CHASE_LABEL}${Date.now()}` })
        }).catch(() => null);
      } else if (next !== null) {
        // Part filled: the rest sent again rather than the order replaced, for no
        // more than is still held, so a replace can never sell what has gone.
        const state = await cancelFor(account, exit.id);
        if (state === "filled") continue;
        if (state === "canceled") {
          ours.add(exit.id);
          await touch({ note: `${first} Resending the rest at ${next}.` });
          moved = await sendRest(account, exit, next);
          if (moved === "nothing") { await touch({ status: "done", note: `${first} Nothing left to sell.` }); return "done"; }
        }
      }
      if (moved?.id) {
        id = moved.id;
        await touch({ exit_order_id: id, note: `${first} Following the bid: limit now ${next}.` });
      } else await touch();
    }
    await pause(3000);
  }
  return "following";
}

// Cancels one order and waits for the broker's answer: its final state.
async function cancelFor(account: any, id: string) {
  const base = tradingBase(account);
  await alpacaFetch(`${base}/orders/${id}`, account, { method: "DELETE" }).catch(() => null);
  let state = "";
  for (let i = 0; i < 16; i++) {
    state = (await alpacaFetch(`${base}/orders/${id}`, account).catch(() => null))?.status || "";
    if (state && !OPEN.has(state) && !BUSY.has(state)) break;
    await pause(250);
  }
  return state;
}

// What a cancelled chasing sale still had to sell, sent again at `next`, for
// no more than is still held: "nothing" when nothing is left; null when the
// send did not go (tried again on the next step).
async function sendRest(account: any, exit: any, next: number | null) {
  const base = tradingBase(account);
  const pos = await alpacaFetch(`${base}/positions/${encodeURIComponent(exit.symbol)}`, account).catch(() => null);
  const held = Number(pos?.qty) || 0;
  const left = exit.side === "sell" ? held : -held;
  const rest = Math.min(left, (Number(exit.qty) || 0) - (Number(exit.filled_qty) || 0));
  if (!(rest > 0)) return "nothing";
  const at = next ?? num(exit.limit_price);
  if (!at) return null;
  return await alpacaFetch(`${base}/orders`, account, {
    method: "POST",
    body: JSON.stringify({
      symbol: exit.symbol, side: exit.side, qty: String(Number(rest.toFixed(9))), type: "limit", limit_price: String(at),
      time_in_force: "day", extended_hours: true, client_order_id: `${CHASE_LABEL}${Date.now()}`
    })
  }).catch(() => null);
}

// An order as it stands now: one replaced (its price moved) is followed to
// the order that took its place.
async function latestOf(account: any, id: string) {
  let order = await alpacaFetch(`${tradingBase(account)}/orders/${id}`, account).catch(() => null);
  for (let i = 0; i < 20 && order?.status === "replaced" && order.replaced_by; i++) {
    order = await alpacaFetch(`${tradingBase(account)}/orders/${order.replaced_by}`, account).catch(() => null);
  }
  return order;
}

/** The minute job's part: every fired stop still selling and not followed in the last 15 seconds, followed again. */
export async function chaseFired(admin: any, seconds = 50) {
  const quiet = new Date(Date.now() - 15000).toISOString();
  const { data: rows } = await admin.from("terminal_stop_fires").select("*").eq("status", "sent").eq("kind", "stop")
    .not("exit_order_id", "is", null).lt("updated_at", quiet).limit(20);
  let n = 0;
  for (const row of rows || []) {
    const account = await loadAccount(admin, row.account_id, row.user_id).catch(() => null);
    if (!account) continue;
    // Only a stop's sale sent to follow the bid; one sent before (at the stop price) is left as it was.
    const exit = await latestOf(account, row.exit_order_id);
    if (!exit || !String(exit.client_order_id || "").startsWith(CHASE_LABEL)) continue;
    n += 1;
    inBackground(chaseExit(admin, account, { ...row, exit_order_id: exit.id }, seconds));
  }
  return n;
}

/** The terminal's stops working on the account now. */
export async function stopsToWatch(account: any): Promise<Guard[]> {
  const list = await alpacaFetch(`${tradingBase(account)}/orders?status=open&nested=true&limit=500`, account);
  return guardedStops(Array.isArray(list) ? list : []);
}

/** Whether the person lets the terminal fire their stops outside regular hours (on unless turned off). */
export async function extStopsOn(admin: any, userId: string) {
  const { data } = await admin.from("terminal_prefs").select("value").eq("user_id", userId).eq("key", "extstops").maybeSingle();
  return data?.value !== false;
}

/**
 * Fires one exit (`kind`: the stop, or the take profit): claims it, checks
 * it still works and that the position is still there to close, cancels it
 * (a pair's other half goes with it; a bracket's two exits each), and sends
 * a limit for the day, extended hours included, for what is still held: at
 * the stop price for a stop, at the take-profit price for a take profit. If
 * the broker refuses the limit, the exits are put back for the open. What
 * happened is kept in terminal_stop_fires and returned.
 */
export async function fireGuard(admin: any, account: any, userId: string, g: Guard, trigger: number, via: "relay" | "server", kind: Kind = "stop") {
  const claim = await admin.from("terminal_stop_fires").insert({
    order_id: g.orderId, user_id: userId, account_id: account.id, symbol: g.symbol, side: g.side, qty: g.qty,
    stop_price: g.stop, limit_price: g.limit, target_price: g.target, trigger_price: trigger, via, kind, status: "firing"
  });
  // Already fired, or being fired by the other watcher.
  if (claim.error) return { status: "skipped" as const, note: null, exitOrderId: null };
  const name = kind === "target" ? "take profit" : "stop";
  const finish = async (status: "sent" | "gone" | "failed", note: string | null, exitOrderId: string | null = null) => {
    await admin.from("terminal_stop_fires").update({ status, note, exit_order_id: exitOrderId, updated_at: now() }).eq("order_id", g.orderId);
    console.log(`stop guard ${via}: ${JSON.stringify({ symbol: g.symbol, kind, stop: g.stop, target: g.target, trigger, status, note })}`);
    return { status, note, exitOrderId };
  };
  const base = tradingBase(account);
  const holding = async () => {
    const pos = await alpacaFetch(`${base}/positions/${encodeURIComponent(g.symbol)}`, account).catch(() => null);
    return pos ? Number(pos.qty) : 0;
  };
  try {
    const order = await alpacaFetch(`${base}/orders/${g.cancel[0] || g.orderId}`, account).catch(() => null);
    if (!order || !OPEN.has(order.status)) return finish("gone", `The ${name} was no longer working (${order?.status || "not found"}).`);
    // Nothing is cancelled unless there is a position for the exit to close.
    const before = exitOrder(g, await holding(), "check", kind);
    if (!before.ok) return finish("gone", `${before.reason} The ${name} was left as it was.`);
    const ids = g.cancel.length ? g.cancel : [g.orderId];
    await Promise.all(ids.map((id) => alpacaFetch(`${base}/orders/${id}`, account, { method: "DELETE" }).catch(() => null)));
    const states: string[] = [];
    for (const id of ids) {
      let state = "";
      for (let i = 0; i < 16; i++) {
        state = (await alpacaFetch(`${base}/orders/${id}`, account).catch(() => null))?.status || "";
        if (state && !OPEN.has(state) && state !== "pending_cancel") break;
        await pause(250);
      }
      states.push(state);
    }
    // One filled meanwhile, or still cancelling: nothing more is sent.
    if (states.some((x) => x !== "canceled")) return finish("gone", `The ${name} could not be cancelled first (${states.join(", ") || "no answer"}); nothing sent.`);
    const built = exitOrder(g, await holding(), `${kind === "stop" ? CHASE_LABEL : "TERM_XS_"}${Date.now()}`, kind);
    if (!built.ok) return finish("gone", built.reason);
    const body = built.body;
    // A stop sells at the bid, not at its own price, and then follows the bid
    // until it fills (chaseExit): a limit at the stop price stays unfilled
    // when the price runs through it (28 Oct, live DAVI at 4.02). A take
    // profit keeps its price.
    const chased = kind === "stop" ? chasePrice(g.side, await marketNow(account, g.symbol, trigger)) : null;
    if (chased !== null) body.limit_price = String(chased);
    const attempt = {
      userId, accountId: account.id, intent: "close", ticker: g.symbol, legs: [{ symbol: g.symbol, side: g.side, ratio: 1 }],
      qty: Number(body.qty), orderType: "limit", limitPrice: body.limit_price, quote: { kind, stop: g.stop, target: g.target, trigger, via, outsideHours: true }
    };
    const other = kind === "target" ? (g.stop ? "; its stop cancelled" : "") : (g.target ? "; its take profit cancelled" : "");
    try {
      const sent = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(body) });
      await recordAttempt(admin, { ...attempt, limitPrice: body.limit_price, brokerOrderId: sent.id, status: sent.status });
      const note = kind === "stop"
        ? `${g.side === "sell" ? "Sell" : "Buy back"} ${body.qty} ${g.symbol} at the ${g.side === "sell" ? "bid" : "ask"}, limit ${body.limit_price}, following it until filled${other}.`
        : `Take profit reached: ${g.side === "sell" ? "Sell" : "Buy back"} ${body.qty} ${g.symbol} limit ${body.limit_price}, pre-market and after hours, for the day${other}.`;
      const done = await finish("sent", note, sent.id);
      if (kind === "stop") inBackground(chaseExit(admin, account, { order_id: g.orderId, exit_order_id: sent.id, symbol: g.symbol, side: g.side, note }));
      return done;
    } catch (e) {
      const refused = String((e as Error)?.message || e);
      await recordAttempt(admin, { ...attempt, error: refused });
      // The exits back, so the open still protects the position.
      try {
        const back = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(restoreOrder(g, Number(body.qty), `TERM_R_${Date.now()}`)) });
        return finish("failed", `The limit was refused (${refused}); the exits are back for the open (order ${back.id}).`);
      } catch (e2) {
        return finish("failed", `The limit was refused (${refused}), and the exits could not be put back (${String((e2 as Error)?.message || e2)}). The position has no stop.`);
      }
    }
  } catch (e) {
    return finish("failed", String((e as Error)?.message || e));
  }
}

/**
 * Fired stops whose limit did not fill: once regular hours begin, or once its
 * day ends, the limit is taken back and the stop (a pair's take profit with
 * it) put back as it was, so Alpaca's own stop works from the open, as it
 * would have without the terminal. A limit filled is done; one cancelled by
 * the person is left so. Run every minute by the minute job, at any hour.
 */
export async function handBackFired(admin: any) {
  const { data: rows } = await admin.from("terminal_stop_fires").select("*").eq("status", "sent").not("exit_order_id", "is", null).limit(50);
  const out: any[] = [];
  const regular = usSession(Date.now()) === "regular";
  for (const row of rows || []) {
    const set = async (status: string, note: string) => {
      await admin.from("terminal_stop_fires").update({ status, note, updated_at: now() }).eq("order_id", row.order_id);
      out.push({ symbol: row.symbol, status, note });
    };
    try {
      const account = await loadAccount(admin, row.account_id, row.user_id);
      const base = tradingBase(account);
      const exit = await latestOf(account, row.exit_order_id);
      if (!exit) continue;
      // A stop's sale that follows the bid is never handed back: chaseFired keeps it going.
      if (String(exit.client_order_id || "").startsWith(CHASE_LABEL)) continue;
      const step = handBack(String(exit.status), regular);
      if (step === "wait") continue;
      if (step === "done") { await set("done", `${row.note || ""} Filled at ${exit.filled_avg_price}.`.trim()); continue; }
      if (step === "cancelled") { await set("cancelled", "The limit was cancelled by hand; the stop was not put back."); continue; }
      if (OPEN.has(exit.status)) {
        await alpacaFetch(`${base}/orders/${exit.id}`, account, { method: "DELETE" }).catch(() => null);
        let state = "";
        for (let i = 0; i < 16; i++) {
          state = (await alpacaFetch(`${base}/orders/${exit.id}`, account).catch(() => null))?.status || "";
          if (state && !OPEN.has(state) && state !== "pending_cancel") break;
          await pause(250);
        }
        if (state === "filled") { await set("done", `${row.note || ""} Filled.`.trim()); continue; }
        if (state !== "canceled") continue; // tried again next minute
      }
      const pos = await alpacaFetch(`${base}/positions/${encodeURIComponent(row.symbol)}`, account).catch(() => null);
      const held = Number(pos?.qty) || 0;
      const left = row.side === "sell" ? held : -held;
      if (!(left > 0)) { await set("done", "Nothing left to protect."); continue; }
      const g = {
        symbol: row.symbol, side: row.side, stop: row.stop_price === null ? null : Number(row.stop_price),
        limit: row.limit_price === null ? null : Number(row.limit_price), target: row.target_price === null ? null : Number(row.target_price)
      };
      const why = regular ? "had not filled by the open" : "ended its day unfilled";
      const at = row.kind === "target" ? row.target_price : row.stop_price;
      const what = g.stop && g.target ? "the stop and take profit are" : g.stop ? "the stop is" : "the take profit is";
      try {
        const back = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(restoreOrder(g, Math.min(left, Number(row.qty) || left), `TERM_R_${Date.now()}`)) });
        await set("returned", `The limit at ${at} ${why}; ${what} back as before (order ${back.id}).`);
      } catch (e) {
        await set("failed", `The limit at ${at} ${why}, and the exits could not be put back (${String((e as Error)?.message || e)}). The position has no stop.`);
      }
    } catch (e) {
      console.error(`stop guard hand-back: ${String((e as Error)?.message || e)}`);
    }
  }
  return out;
}

/**
 * The open terminal's watcher, inside its relay: the stops of every account
 * the terminal trades for this person read every 20 seconds, each live trade
 * checked against them, and the accounts marked as watched so the minute job
 * leaves them be. Every account, not only the one on screen (28 Oct: an
 * Alton RS stop at 3.39 fired 13 minutes late, at 3.25, because EODHD allows
 * the owner one connection: the open terminal's held it, and the minute job
 * watching the other accounts was refused each minute). `source`: where its
 * trades come from ("eodhd" or "iex"); null (the delayed tape) watches
 * nothing, fifteen minutes being too late for a stop.
 */
export function guardWatcher(admin: any, accounts: any[], userId: string, source: "eodhd" | "iex" | null) {
  let watched: { account: any; guards: Guard[] }[] = [];
  const firing = new Set<string>();
  let timer: number | null = null;
  let changed: () => void = () => {};
  const refresh = async () => {
    if (!source) return;
    let read: any[] = [];
    try {
      const on = await extStopsOn(admin, userId);
      read = await Promise.all(accounts.map(async (account) => ({ account, guards: on ? await stopsToWatch(account).catch(() => null) : [] })));
      // An account whose stops could not be read keeps what it had, and is
      // not marked as watched, so the minute job still looks after it.
      watched = read.map((x) => (x.guards ? x : watched.find((w) => w.account.id === x.account.id) || { account: x.account, guards: [] }));
    } catch { /* kept as they were until the next read */ }
    const seen = read.filter((x) => x.guards).map((x) => ({ account_id: x.account.id, user_id: userId, seen_at: now() }));
    if (guardHours(Date.now(), source) && seen.length) {
      await admin.from("terminal_guard_seen").upsert(seen).then(() => null, () => null);
    }
    changed();
  };
  return {
    start(onChange: () => void) {
      changed = onChange;
      if (!source) return;
      refresh();
      timer = setInterval(refresh, 20000);
    },
    stop() { if (timer !== null) clearInterval(timer); },
    symbols: () => [...new Set(watched.flatMap((w) => w.guards.map((g) => g.symbol)))],
    async trade(symbol: string, price: number, size: number, at: number, tell: (m: any) => void) {
      if (!source || !guardHours(Date.now(), source)) return;
      for (const w of watched) {
        for (const g of w.guards) {
          if (g.symbol !== symbol || firing.has(g.orderId) || !(at >= g.since)) continue;
          const kind = hit(g, price, size);
          if (!kind) continue;
          firing.add(g.orderId);
          const said = { type: "guard", id: g.orderId, symbol, kind, stop: g.stop, target: g.target, trigger: price, account: w.account.id, name: w.account.name };
          tell({ ...said, status: "firing" });
          const r = await fireGuard(admin, w.account, userId, g, price, "relay", kind);
          if (r.status !== "skipped") tell({ ...said, status: r.status, note: r.note, orderId: r.exitOrderId });
          refresh();
        }
      }
    }
  };
}

/**
 * The minute job's watch over one source's accounts: EODHD's trades stream
 * for up to `ms`, firing a stop the moment a trade reaches it.
 */
export async function watchEodhd(admin: any, key: string, items: { account: any; userId: string; guards: Guard[] }[], ms: number) {
  const symbols = [...new Set(items.flatMap((x) => x.guards.map((g) => g.symbol)))];
  const results: any[] = [];
  if (!symbols.length) return results;
  const done = new Set<string>();
  let refused: string | null = null;
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`wss://ws.eodhistoricaldata.com/ws/us?api_token=${encodeURIComponent(key)}`);
    const end = setTimeout(() => { try { ws.close(); } catch { /* gone */ } resolve(); }, ms);
    ws.onmessage = async (event) => {
      let m: any;
      try { m = JSON.parse(String(event.data)); } catch { return; }
      if (m.status_code !== undefined) {
        if (Number(m.status_code) === 200) ws.send(JSON.stringify({ action: "subscribe", symbols: symbols.join(",") }));
        else {
          // Refused (the owner's one connection held by an open terminal, say): said, so the job can look elsewhere.
          refused = `${m.status_code} ${m.message || ""}`.trim();
          console.log(`stop guard job: EODHD refused (${refused})`);
          clearTimeout(end);
          resolve();
        }
        return;
      }
      if (!m.s || !guardHours(Date.now(), "eodhd")) return;
      for (const x of items) {
        for (const g of x.guards) {
          if (g.symbol !== m.s || done.has(g.orderId) || !(Number(m.t) >= g.since)) continue;
          const kind = hit(g, Number(m.p), Number(m.v));
          if (!kind) continue;
          done.add(g.orderId);
          const r = await fireGuard(admin, x.account, x.userId, g, Number(m.p), "server", kind);
          results.push({ symbol: g.symbol, kind, stop: g.stop, target: g.target, trigger: Number(m.p), ...r });
        }
      }
    };
    ws.onerror = () => { clearTimeout(end); resolve(); };
    ws.onclose = () => { clearTimeout(end); resolve(); };
  });
  return Object.assign(results, { refused });
}

/** The minute job's check from the free IEX feed: the account's own trades of the last 90 seconds, round lots, in time order. */
export async function checkIex(admin: any, item: { account: any; userId: string; guards: Guard[] }) {
  const symbols = [...new Set(item.guards.map((g) => g.symbol))];
  const results: any[] = [];
  if (!symbols.length) return results;
  const start = new Date(Date.now() - 90000).toISOString();
  const r = await alpacaFetch(`https://data.alpaca.markets/v2/stocks/trades?symbols=${symbols.join(",")}&feed=iex&start=${start}&limit=10000&sort=asc`, item.account).catch(() => null);
  const done = new Set<string>();
  for (const [symbol, trades] of Object.entries(r?.trades || {})) {
    for (const t of trades as any[]) {
      const at = Date.parse(t.t);
      for (const g of item.guards) {
        if (g.symbol !== symbol || done.has(g.orderId) || !(at >= g.since)) continue;
        const kind = hit(g, Number(t.p), Number(t.s));
        if (!kind) continue;
        done.add(g.orderId);
        const fired = await fireGuard(admin, item.account, item.userId, g, Number(t.p), "server", kind);
        results.push({ symbol, kind, stop: g.stop, target: g.target, trigger: Number(t.p), ...fired });
      }
    }
  }
  return results;
}
