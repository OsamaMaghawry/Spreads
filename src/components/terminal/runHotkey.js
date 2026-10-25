import { invokeFunction } from "@/lib/functions";
import { hotkeyOrder, describe } from "@/lib/hotkeys";
import { orderNews, orderState, sessionOf, isCrypto, px, sizeText } from "@/lib/terminal";

// What a pressed hotkey does: works out the order (lib/hotkeys.js) or asks the
// server for the position action (functions/terminal "exit", "protect",
// "cancelOrders"), and reports each step in the pop-ups at the top of the
// screen, as the ticket does, following an order until it fills or ends.

const steps = new Map();
async function stepFor(accountId, symbol) {
  if (!isCrypto(symbol)) return null;
  if (!steps.has(symbol)) {
    const r = await invokeFunction("terminal", { action: "asset", accountId, symbol }).catch(() => null);
    steps.set(symbol, r?.data?.asset?.minTradeIncrement ?? null);
  }
  return steps.get(symbol);
}

/** A coin's quantity step, read ahead of the first key press so it never waits on it. */
export const prefetchStep = (accountId, symbol) => { if (accountId && symbol) stepFor(accountId, symbol).catch(() => {}); };

/** Follow an order, telling the pop-up each time its state changes. */
export function trackOrder({ accountId, id, key, base, notify, onChange, onFilled }) {
  let polls = 0;
  let last = `${base.status}|0`;
  const tick = async () => {
    const r = await invokeFunction("terminal", { action: "orderStatus", accountId, orderId: id }).catch(() => null);
    const o = r?.data?.order;
    if (o) {
      const now = `${o.status}|${o.filled}`;
      if (now !== last) { last = now; notify({ key, ...orderNews({ ...base, ...o }) }); onChange?.(); }
      if (o.status === "filled") onFilled?.(o);
      if (orderState(o.status).final) return;
    }
    polls += 1;
    if (polls < 40) setTimeout(tick, polls < 15 ? 1000 : 3000);
  };
  setTimeout(tick, 600);
}

const session = () => {
  const s = sessionOf(Date.now() / 1000);
  return s === "pre" || s === "post" ? "extended" : s;
};

/**
 * Run one hotkey. `ctx`: account, symbol, quote, view (the account's
 * figures and positions), notify (the pop-ups), refresh (reload the account).
 */
export async function runHotkey(h, ctx) {
  const { account, symbol, notify, refresh } = ctx;
  const key = `hk${Date.now()}`;
  const crypto = isCrypto(symbol);
  const label = `${h.keys} · ${describe(h)}`;
  if (!account?.id) return;
  if (account.type !== "Paper") {
    notify({ key, tone: "bad", title: "Hotkeys trade paper accounts only", detail: "Choose a paper account to use them during this test." });
    return;
  }

  if (h.action === "buy" || h.action === "sell") {
    const built = hotkeyOrder(h, {
      symbol, crypto, quote: ctx.quote, equity: ctx.view?.equity, buyingPower: ctx.view?.buyingPower,
      step: await stepFor(account.id, symbol), session: session()
    });
    if (built.reason) { notify({ key, tone: "bad", title: "Order not placed", detail: `${built.reason} (${h.keys})` }); return; }
    const base = { words: `${built.words} (${h.keys})`, symbol, side: built.order.side, unitName: crypto ? symbol.split("/")[0] : "shares" };
    notify({ key, ...orderNews({ sending: true, words: base.words }) });
    const r = await invokeFunction("terminal", { action: "order", accountId: account.id, order: built.order }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    if (r?.data?.error) { notify({ key, ...orderNews({ error: r.data.error }) }); return; }
    const placed = { ...base, id: r.data.orderId, status: r.data.status || "new" };
    notify({ key, ...orderNews(placed) });
    refresh?.();
    trackOrder({ accountId: account.id, id: placed.id, key, base: placed, notify, onChange: refresh });
    return;
  }

  if (h.action === "exit") {
    notify({ key, tone: "wait", title: h.percent >= 100 ? `Exiting ${symbol}…` : `Exiting ${h.percent}% of the ${symbol} trade…`, detail: label });
    const r = await invokeFunction("terminal", { action: "exit", accountId: account.id, symbol, percent: h.percent }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    if (r?.data?.error) { notify({ key, tone: "bad", title: "Exit not sent", detail: r.data.error }); return; }
    const d = r.data;
    const parts = [
      d.how === "limit" ? `Limit ${px(d.limitPrice)} for ${sizeText(d.qty)} (extended hours)` : `At market${d.qty ? `, ${sizeText(d.qty)}` : ""}`,
      h.percent < 100 ? (d.all ? "the rest of the trade" : `${h.percent}% of the ${sizeText(d.tradeSize)} trade`) : null,
      d.cancelled ? `${d.cancelled} working order${d.cancelled === 1 ? "" : "s"} cancelled first` : null,
      d.note
    ].filter(Boolean);
    const base = { words: parts.join(" · "), symbol, side: d.side || (ctx.position?.side === "short" ? "buy" : "sell"), unitName: crypto ? symbol.split("/")[0] : "shares" };
    notify({ key, tone: "ok", title: "Exit sent", detail: base.words });
    refresh?.();
    // A partial exit took the stop and target off to free the shares: once the
    // exit has filled, the same ones go back on what remains (the target
    // second, so the two pair up again).
    let restored = false;
    const restop = d.restopPrice || d.retargetPrice ? async () => {
      if (restored) return;
      restored = true;
      const put = async (kind, value) => {
        const r = await invokeFunction("terminal", { action: "protect", accountId: account.id, symbol, kind, mode: "price", value }).catch((e) => ({ data: { error: String(e?.message || e) } }));
        const name = kind === "stop" ? "Stop" : "Target";
        if (r?.data?.error) notify({ key: `${key}${kind}`, tone: "bad", title: `${name} not put back`, detail: `${r.data.error} Set it again.` });
        else notify({ key: `${key}${kind}`, tone: "ok", title: `${name} put back at ${px(value)}`, detail: `For the ${sizeText(r.data.qty)} left` });
      };
      if (d.restopPrice) await put("stop", d.restopPrice);
      if (d.retargetPrice) await put("target", d.retargetPrice);
      refresh?.();
    } : null;
    if (d.orderId) trackOrder({ accountId: account.id, id: d.orderId, key, base: { ...base, status: d.status }, notify, onChange: refresh, onFilled: restop });
    return;
  }

  if (h.action === "stop" || h.action === "target") {
    const stop = h.action === "stop";
    notify({ key, tone: "wait", title: `Placing a ${stop ? "stop" : "take-profit"} on ${symbol}…`, detail: label });
    const r = await invokeFunction("terminal", { action: "protect", accountId: account.id, symbol, kind: h.action, mode: h.stopMode, value: h.stopValue, from: h.from }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    if (r?.data?.error) { notify({ key, tone: "bad", title: `${stop ? "Stop" : "Take-profit"} not placed`, detail: r.data.error }); return; }
    const d = r.data;
    const out = d.side === "sell" ? "Sell" : "Buy back";
    notify({
      key, tone: "ok", title: stop ? "Stop placed" : "Take-profit placed",
      detail: [
        d.paired ? `${out} ${sizeText(d.qty)} ${symbol} at ${px(d.targetPrice)}, or if it trades at ${px(d.stopPrice)}: one cancels the other`
          : stop ? `${out} ${sizeText(d.qty)} ${symbol} if it trades at ${px(d.stopPrice)}${d.limitPrice ? ` (limit ${px(d.limitPrice)})` : ""}`
            : `${out} ${sizeText(d.qty)} ${symbol} at ${px(d.targetPrice)}`,
        d.replaced ? `replaced ${d.replaced} earlier exit order${d.replaced === 1 ? "" : "s"}` : null, d.note
      ].filter(Boolean).join(" · ")
    });
    refresh?.();
    return;
  }

  if (h.action === "cancelSymbol" || h.action === "cancelAll") {
    const r = await invokeFunction("terminal", { action: "cancelOrders", accountId: account.id, symbol: h.action === "cancelSymbol" ? symbol : "" }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    if (r?.data?.error) { notify({ key, tone: "bad", title: "Not cancelled", detail: r.data.error }); return; }
    const n = r.data.cancelled || 0;
    notify({ key, tone: n ? "ok" : "muted", title: n ? `Cancelled ${n} order${n === 1 ? "" : "s"}` : "No working orders", detail: h.action === "cancelSymbol" ? symbol : "Every symbol" });
    refresh?.();
  }
}
