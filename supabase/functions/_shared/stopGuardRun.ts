// Stops and take profits outside regular hours: watching and firing (the rules are
// stopGuard.ts). Two watchers share this: the open terminal's relay
// (marketStream), from each live trade, and the minute job (functions/
// terminal "guardStops") while no terminal is open. terminal_stop_fires,
// keyed by the broker's order id, lets only one of them fire a stop.
import { alpacaFetch, tradingBase, loadAccount } from "./alpaca.ts";
import { recordAttempt } from "./orderAttempts.ts";
import { usSession } from "./positionTools.ts";
import { guardedStops, guardHours, hit, exitOrder, restoreOrder, handBack, type Guard, type Kind } from "./stopGuard.ts";

const OPEN = new Set(["new", "accepted", "pending_new", "accepted_for_bidding", "held", "partially_filled"]);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

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
    const built = exitOrder(g, await holding(), `TERM_XS_${Date.now()}`, kind);
    if (!built.ok) return finish("gone", built.reason);
    const body = built.body;
    const attempt = {
      userId, accountId: account.id, intent: "close", ticker: g.symbol, legs: [{ symbol: g.symbol, side: g.side, ratio: 1 }],
      qty: Number(body.qty), orderType: "limit", limitPrice: body.limit_price, quote: { kind, stop: g.stop, target: g.target, trigger, via, outsideHours: true }
    };
    const other = kind === "target" ? (g.stop ? "; its stop cancelled" : "") : (g.target ? "; its take profit cancelled" : "");
    try {
      const sent = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(body) });
      await recordAttempt(admin, { ...attempt, brokerOrderId: sent.id, status: sent.status });
      return finish("sent", `${kind === "target" ? "Take profit reached: " : ""}${g.side === "sell" ? "Sell" : "Buy back"} ${body.qty} ${g.symbol} limit ${body.limit_price}, pre-market and after hours, for the day${other}.`, sent.id);
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
      const exit = await alpacaFetch(`${base}/orders/${row.exit_order_id}`, account).catch(() => null);
      if (!exit) continue;
      const step = handBack(String(exit.status), regular);
      if (step === "wait") continue;
      if (step === "done") { await set("done", `${row.note || ""} Filled at ${exit.filled_avg_price}.`.trim()); continue; }
      if (step === "cancelled") { await set("cancelled", "The limit was cancelled by hand; the stop was not put back."); continue; }
      if (OPEN.has(exit.status)) {
        await alpacaFetch(`${base}/orders/${row.exit_order_id}`, account, { method: "DELETE" }).catch(() => null);
        let state = "";
        for (let i = 0; i < 16; i++) {
          state = (await alpacaFetch(`${base}/orders/${row.exit_order_id}`, account).catch(() => null))?.status || "";
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
 * The open terminal's watcher, inside its relay: the account's stops read
 * every 20 seconds, each live trade checked against them, and the account
 * marked as watched so the minute job leaves it be. `source`: where its
 * trades come from ("eodhd" or "iex"); null (the delayed tape) watches
 * nothing, fifteen minutes being too late for a stop.
 */
export function guardWatcher(admin: any, account: any, userId: string, source: "eodhd" | "iex" | null) {
  let guards: Guard[] = [];
  const firing = new Set<string>();
  let timer: number | null = null;
  let changed: () => void = () => {};
  const refresh = async () => {
    if (!source) return;
    try {
      guards = (await extStopsOn(admin, userId)) ? await stopsToWatch(account) : [];
    } catch { /* kept as they were until the next read */ }
    if (guardHours(Date.now(), source)) {
      await admin.from("terminal_guard_seen").upsert({ account_id: account.id, user_id: userId, seen_at: now() }).then(() => null, () => null);
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
    symbols: () => [...new Set(guards.map((g) => g.symbol))],
    async trade(symbol: string, price: number, size: number, at: number, tell: (m: any) => void) {
      if (!source || !guardHours(Date.now(), source)) return;
      for (const g of guards) {
        if (g.symbol !== symbol || firing.has(g.orderId) || !(at >= g.since)) continue;
        const kind = hit(g, price, size);
        if (!kind) continue;
        firing.add(g.orderId);
        const said = { type: "guard", id: g.orderId, symbol, kind, stop: g.stop, target: g.target, trigger: price };
        tell({ ...said, status: "firing" });
        const r = await fireGuard(admin, account, userId, g, price, "relay", kind);
        if (r.status !== "skipped") tell({ ...said, status: r.status, note: r.note, orderId: r.exitOrderId });
        refresh();
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
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`wss://ws.eodhistoricaldata.com/ws/us?api_token=${encodeURIComponent(key)}`);
    const end = setTimeout(() => { try { ws.close(); } catch { /* gone */ } resolve(); }, ms);
    ws.onmessage = async (event) => {
      let m: any;
      try { m = JSON.parse(String(event.data)); } catch { return; }
      if (m.status_code !== undefined) {
        if (Number(m.status_code) === 200) ws.send(JSON.stringify({ action: "subscribe", symbols: symbols.join(",") }));
        else { clearTimeout(end); resolve(); }
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
  return results;
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
