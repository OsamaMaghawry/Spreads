import { invokeFunction } from "@/lib/functions";
import { hotkeyOrder, describe } from "@/lib/hotkeys";
import { orderNews, orderState, sessionOf, isCrypto, px, sizeText } from "@/lib/terminal";
import { groupNews } from "@/lib/accountGroup";

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
export function trackOrder({ accountId, id, key, base, notify, onChange, onFilled, onUnfilled }) {
  let polls = 0;
  let last = `${base.status}|0`;
  const tick = async () => {
    const r = await invokeFunction("terminal", { action: "orderStatus", accountId, orderId: id }).catch(() => null);
    const o = r?.data?.order;
    if (o) {
      const now = `${o.status}|${o.filled}`;
      if (now !== last) { last = now; notify({ key, ...orderNews({ ...base, ...o }) }); onChange?.(); }
      if (o.status === "filled") onFilled?.(o);
      else if (orderState(o.status).final) onUnfilled?.(o);
      if (orderState(o.status).final) return;
    }
    polls += 1;
    if (polls < 40) setTimeout(tick, polls < 15 ? 1000 : 3000);
  };
  setTimeout(tick, 600);
}

// After an exit: a partial exit took the stop and target off to free the
// shares, and once it has filled the same ones go back on what remains (the
// target second, so the two pair up again); an exit refused, cancelled or
// expired before it filled puts them back on whatever is still held. `who`
// names the account, for one of a group.
function afterExit(d, { accountId, symbol, key, notify, refresh, who = "" }) {
  const on = who ? `${who}: ` : "";
  let restored = false;
  const restop = d.restopPrice || d.retargetPrice ? async () => {
    if (restored) return;
    restored = true;
    const put = async (kind, value) => {
      const r = await invokeFunction("terminal", { action: "protect", accountId, symbol, kind, mode: "price", value }).catch((e) => ({ data: { error: String(e?.message || e) } }));
      const name = kind === "stop" ? "Stop" : "Target";
      if (r?.data?.error) notify({ key: `${key}${kind}`, tone: "bad", title: `${on}${name} not put back`, detail: `${r.data.error} Set it again.` });
      else notify({ key: `${key}${kind}`, tone: "ok", title: `${on}${name} put back at ${px(value)}`, detail: `For the ${sizeText(r.data.qty)} left` });
    };
    if (d.restopPrice) await put("stop", d.restopPrice);
    if (d.retargetPrice) await put("target", d.retargetPrice);
    refresh?.();
  } : null;
  const putBack = d.heldStop || d.heldTarget ? async (o) => {
    if (restored) return;
    restored = true;
    const part = Number(o?.filled) > 0;
    const both = d.heldStop && d.heldTarget;
    const r = await invokeFunction("terminal", {
      action: "protect", accountId, symbol, kind: both ? "both" : d.heldStop ? "stop" : "target", mode: "price",
      value: d.heldStop || d.heldTarget, stopPrice: d.heldStop, targetPrice: d.heldTarget
    }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    const names = [d.heldStop && `stop ${px(d.heldStop)}`, d.heldTarget && `target ${px(d.heldTarget)}`].filter(Boolean).join(" and ");
    const title = `${on}${part ? "Exit partly filled" : "Exit not filled"}`;
    if (r?.data?.error) notify({ key: `${key}back`, tone: "bad", title: `${title}: exits not put back`, detail: `${r.data.error} Set your ${names} again now.` });
    else notify({ key: `${key}back`, tone: "ok", title: `${title}: exits put back`, detail: `Your ${names} ${both ? "are" : "is"} back on the ${symbol} still held.` });
    refresh?.();
  } : null;
  return { restop, putBack };
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
  // The other accounts picked beside the one on screen: each gets its share
  // (functions/_shared/proRata.ts), and one pop-up says how each went.
  const group = Array.isArray(ctx.group) ? ctx.group : [];
  const unit = crypto ? symbol.split("/")[0] : "shares";
  const tellGroup = (rows, verb) => { const g = groupNews(rows, verb, unit); if (g) notify({ key: `${key}g`, ...g }); };
  const label = `${h.keys} · ${describe(h)}`;
  if (!account?.id) return;
  // Paper accounts, and the owner's own live accounts (the server checks again,
  // and refuses a live order over $5,000 that opens or adds to a position).
  if (account.type !== "Paper" && !(account.type === "Live" && ctx.liveOk)) {
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
    // The price it was sized at goes with it: an account with its own size in
    // dollars or percent turns that into shares at the same price.
    const order = { ...built.order, basis: h.size === "bp" ? "buyingPower" : "equity", reference: built.value && built.order.qty ? built.value / built.order.qty : null };
    const r = await invokeFunction("terminal", { action: "order", accountId: account.id, order, group }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    tellGroup(r?.data?.group, "sent");
    if (r?.data?.error) { notify({ key, ...orderNews({ error: r.data.error }) }); return; }
    const placed = { ...base, id: r.data.orderId, status: r.data.status || "new" };
    notify({ key, ...orderNews(placed) });
    refresh?.();
    trackOrder({ accountId: account.id, id: placed.id, key, base: placed, notify, onChange: refresh });
    return;
  }

  if (h.action === "exit") {
    notify({ key, tone: "wait", title: h.percent >= 100 ? `Exiting ${symbol}…` : `Exiting ${h.percent}% of the ${symbol} trade…`, detail: label });
    // The screen's own bid and ask go with it: outside regular hours the
    // server prices the limit from the best quote it can trust.
    const r = await invokeFunction("terminal", { action: "exit", accountId: account.id, symbol, percent: h.percent, bid: ctx.quote?.bid ?? null, ask: ctx.quote?.ask ?? null, group }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    tellGroup(r?.data?.group, "exit sent");
    // The group's exits are followed as the lead's is, quietly but for what
    // matters: their stop and target back on what each still holds. Armed
    // first, so they are followed even when the lead's own exit was refused.
    for (const [i, g] of (r?.data?.group || []).entries()) {
      if (!g.orderId) continue;
      const tag = `${key}g${i}`;
      const them = afterExit(g, { accountId: g.accountId, symbol, key: tag, notify, refresh, who: g.name });
      trackOrder({ accountId: g.accountId, id: g.orderId, key: tag, base: { words: "", symbol, side: g.side, unitName: unit, status: g.status }, notify: () => {}, onFilled: them.restop, onUnfilled: them.putBack });
    }
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
    const lead = afterExit(d, { accountId: account.id, symbol, key, notify, refresh });
    if (d.orderId) trackOrder({ accountId: account.id, id: d.orderId, key, base: { ...base, status: d.status }, notify, onChange: refresh, onFilled: lead.restop, onUnfilled: lead.putBack });
    return;
  }

  if (h.action === "stop" || h.action === "target") {
    const stop = h.action === "stop";
    notify({ key, tone: "wait", title: `Placing a ${stop ? "stop" : "take-profit"} on ${symbol}…`, detail: label });
    const r = await invokeFunction("terminal", { action: "protect", accountId: account.id, symbol, kind: h.action, mode: h.stopMode, value: h.stopValue, from: h.from, group }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    tellGroup(r?.data?.group, stop ? "stop placed" : "take-profit placed");
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
    const r = await invokeFunction("terminal", { action: "cancelOrders", accountId: account.id, symbol: h.action === "cancelSymbol" ? symbol : "", group }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    tellGroup(r?.data?.group, "cancelled");
    if (r?.data?.error) { notify({ key, tone: "bad", title: "Not cancelled", detail: r.data.error }); return; }
    const n = r.data.cancelled || 0;
    notify({ key, tone: n ? "ok" : "muted", title: n ? `Cancelled ${n} order${n === 1 ? "" : "s"}` : "No working orders", detail: h.action === "cancelSymbol" ? symbol : "Every symbol" });
    refresh?.();
  }
}
