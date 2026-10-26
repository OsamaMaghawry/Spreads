// Stops outside regular hours: watching and firing (the rules are
// stopGuard.ts). Two watchers share this: the open terminal's relay
// (marketStream), from each live trade, and the minute job (functions/
// terminal "guardStops") while no terminal is open. terminal_stop_fires,
// keyed by the broker's order id, lets only one of them fire a stop.
import { alpacaFetch, tradingBase } from "./alpaca.ts";
import { recordAttempt } from "./orderAttempts.ts";
import { guardedStops, guardHours, reaches, exitOrder, restoreOrder, type Guard } from "./stopGuard.ts";

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
 * Fires one stop: claims it, checks it still works, cancels it (a pair's take
 * profit goes with it), and sends a limit at the stop price for the day,
 * extended hours included, for what is still held. If the broker refuses the
 * limit, the stop is put back for the open. What happened is kept in
 * terminal_stop_fires and returned.
 */
export async function fireGuard(admin: any, account: any, userId: string, g: Guard, trigger: number, via: "relay" | "server") {
  const claim = await admin.from("terminal_stop_fires").insert({
    order_id: g.orderId, user_id: userId, account_id: account.id, symbol: g.symbol, side: g.side, qty: g.qty,
    stop_price: g.stop, trigger_price: trigger, via, status: "firing"
  });
  // Already fired, or being fired by the other watcher.
  if (claim.error) return { status: "skipped" as const, note: null, exitOrderId: null };
  const finish = async (status: "sent" | "gone" | "failed", note: string | null, exitOrderId: string | null = null) => {
    await admin.from("terminal_stop_fires").update({ status, note, exit_order_id: exitOrderId, updated_at: now() }).eq("order_id", g.orderId);
    console.log(`stop guard ${via}: ${JSON.stringify({ symbol: g.symbol, stop: g.stop, trigger, status, note })}`);
    return { status, note, exitOrderId };
  };
  const base = tradingBase(account);
  try {
    const order = await alpacaFetch(`${base}/orders/${g.orderId}`, account).catch(() => null);
    if (!order || !OPEN.has(order.status)) return finish("gone", `The stop was no longer working (${order?.status || "not found"}).`);
    await alpacaFetch(`${base}/orders/${g.orderId}`, account, { method: "DELETE" }).catch(() => null);
    let state = "";
    for (let i = 0; i < 16; i++) {
      state = (await alpacaFetch(`${base}/orders/${g.orderId}`, account).catch(() => null))?.status || "";
      if (state && !OPEN.has(state) && state !== "pending_cancel") break;
      await pause(250);
    }
    // Filled meanwhile (the take profit, say), or still cancelling: nothing more is sent.
    if (state !== "canceled") return finish("gone", `The stop could not be cancelled first (${state || "no answer"}); nothing sent.`);
    const pos = await alpacaFetch(`${base}/positions/${encodeURIComponent(g.symbol)}`, account).catch(() => null);
    const held = pos ? Number(pos.qty) : 0;
    const built = exitOrder(g, held, `TERM_XS_${Date.now()}`);
    if (!built.ok) return finish("gone", built.reason);
    const body = built.body;
    const attempt = {
      userId, accountId: account.id, intent: "close", ticker: g.symbol, legs: [{ symbol: g.symbol, side: g.side, ratio: 1 }],
      qty: Number(body.qty), orderType: "limit", limitPrice: body.limit_price, quote: { stop: g.stop, trigger, via, outsideHours: true }
    };
    try {
      const sent = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(body) });
      await recordAttempt(admin, { ...attempt, brokerOrderId: sent.id, status: sent.status });
      return finish("sent", `${g.side === "sell" ? "Sell" : "Buy back"} ${body.qty} ${g.symbol} limit ${body.limit_price}, pre-market and after hours, for the day${g.pair ? "; its take profit cancelled" : ""}.`, sent.id);
    } catch (e) {
      const refused = String((e as Error)?.message || e);
      await recordAttempt(admin, { ...attempt, error: refused });
      // The stop back, so the open still protects the position.
      try {
        const back = await alpacaFetch(`${base}/orders`, account, { method: "POST", body: JSON.stringify(restoreOrder(g, Number(body.qty), `TERM_R_${Date.now()}`)) });
        return finish("failed", `The limit was refused (${refused}); the stop at ${g.stop} is back for the open (order ${back.id}).`);
      } catch (e2) {
        return finish("failed", `The limit was refused (${refused}), and the stop could not be put back (${String((e2 as Error)?.message || e2)}). The position has no stop.`);
      }
    }
  } catch (e) {
    return finish("failed", String((e as Error)?.message || e));
  }
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
        if (g.symbol !== symbol || firing.has(g.orderId) || !(at >= g.since) || !reaches(g, price, size)) continue;
        firing.add(g.orderId);
        tell({ type: "guard", id: g.orderId, symbol, stop: g.stop, trigger: price, status: "firing" });
        const r = await fireGuard(admin, account, userId, g, price, "relay");
        if (r.status !== "skipped") tell({ type: "guard", id: g.orderId, symbol, stop: g.stop, trigger: price, status: r.status, note: r.note, orderId: r.exitOrderId });
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
          if (g.symbol !== m.s || done.has(g.orderId) || !(Number(m.t) >= g.since) || !reaches(g, Number(m.p), Number(m.v))) continue;
          done.add(g.orderId);
          const r = await fireGuard(admin, x.account, x.userId, g, Number(m.p), "server");
          results.push({ symbol: g.symbol, stop: g.stop, trigger: Number(m.p), ...r });
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
        if (g.symbol !== symbol || done.has(g.orderId) || !(at >= g.since) || !reaches(g, Number(t.p), Number(t.s))) continue;
        done.add(g.orderId);
        const fired = await fireGuard(admin, item.account, item.userId, g, Number(t.p), "server");
        results.push({ symbol, stop: g.stop, trigger: Number(t.p), ...fired });
      }
    }
  }
  return results;
}
