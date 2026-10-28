import { invokeFunction } from "@/lib/functions";
import { hotkeyOrder, describe, withOwnSize, hotkeyPercent } from "@/lib/hotkeys";
import { orderNews, orderState, sessionOf, isCrypto, px, sizeText } from "@/lib/terminal";
import { groupNews } from "@/lib/accountGroup";
import { onOrder } from "./orderFeed";

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

/**
 * Follow an order, telling the pop-up each time its state changes: at once
 * from the stream for the account on screen (orderFeed.js), and by asking,
 * for that account's updates the stream missed and for the other accounts.
 */
export function trackOrder({ accountId, id, key, base, notify, onChange, onUpdate, onFilled, onUnfilled }) {
  let polls = 0;
  let last = `${base.status}|0`;
  let done = false;
  let off = null;
  const see = (o) => {
    if (done) return;
    const now = `${o.status}|${o.filled}`;
    if (now !== last) { last = now; notify({ key, ...orderNews({ ...base, ...o }) }); onUpdate?.(o); onChange?.(); }
    if (!orderState(o.status).final) return;
    done = true;
    off?.();
    if (o.status === "filled") onFilled?.(o);
    else onUnfilled?.(o);
  };
  off = onOrder(id, (m) => {
    see(m);
    // Asked once more at the end, which also writes the result to the order's record.
    if (done) invokeFunction("terminal", { action: "orderStatus", accountId, orderId: id }).catch(() => null);
  });
  if (done) off();
  const tick = async () => {
    if (done) return;
    const r = await invokeFunction("terminal", { action: "orderStatus", accountId, orderId: id }).catch(() => null);
    if (r?.data?.order) see(r.data.order);
    polls += 1;
    if (!done && polls < 40) setTimeout(tick, polls < 15 ? 1000 : 3000);
  };
  setTimeout(tick, 600);
}

/**
 * The other accounts' orders followed to the end, in the one group pop-up:
 * filled, part filled, still waiting, or ended unfilled (28 Oct: their sells
 * sat unfilled or refused while the screen showed only this account's fills,
 * and the positions stacked up). Each change also refreshes the screen.
 */
export function followGroup(rows, { key, verb, unit, notify, refresh }) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, track: !!r.orderId && r.ok !== false }));
  const show = () => { const g = groupNews(list, verb, unit); if (g) notify({ key, ...g }); };
  list.forEach((r, i) => {
    if (!r.track) return;
    trackOrder({
      accountId: r.accountId, id: r.orderId, key: `${key}${i}`, base: { status: r.status || "new" }, notify: () => {},
      onUpdate: (o) => { list[i] = { ...list[i], status: o.status, filled: o.filled, avgPrice: o.avgPrice }; show(); },
      onChange: refresh
    });
  });
  show();
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
    // The account on screen sized by its own size where it has one (as each
    // account beside it is); the key's own size, as a percent, goes to the
    // others to take of their own portfolios (functions/_shared/proRata.ts).
    const heldNow = ctx.position ? (ctx.position.side === "short" ? -Math.abs(ctx.position.qty) : Math.abs(ctx.position.qty)) : 0;
    const sized = { symbol, crypto, quote: ctx.quote, equity: ctx.view?.equity, buyingPower: ctx.view?.buyingPower, step: await stepFor(account.id, symbol), session: session(), held: heldNow };
    const built = hotkeyOrder(withOwnSize(h, ctx.leadSize), sized);
    // Too small on this account alone: the others still take theirs.
    const othersOnly = built.tooSmall && group.length > 0;
    if (built.reason && !othersOnly) { notify({ key, tone: "bad", title: "Order not placed", detail: `${built.reason} (${h.keys})` }); return; }
    const words = othersOnly ? `${h.action === "buy" ? "Buy" : "Sell"} ${symbol} on the other accounts (${h.keys})` : `${built.words} (${h.keys})`;
    const base = { words, symbol, side: built.order.side, unitName: crypto ? symbol.split("/")[0] : "shares" };
    notify({ key, ...orderNews({ sending: true, words }) });
    // The price it was sized at goes with it: an account with its own size in
    // dollars or percent turns that into shares at the same price.
    const order = {
      // fromKey: a sell key pressed again replaces the account's earlier one still waiting.
      ...built.order, fromKey: true, basis: h.size === "bp" ? "buyingPower" : "equity", reference: built.price ?? null,
      pct: hotkeyPercent(h, { equity: ctx.view?.equity, buyingPower: ctx.view?.buyingPower, price: built.price }),
      ...(othersOnly ? { qty: null, leadSkip: `${built.reason}` } : {}),
      // This account's book as the screen has it, so with other accounts
      // picked its own order goes at once, alongside the reading of theirs.
      ...(group.length && ctx.view ? { leadBook: { equity: ctx.view.equity ?? null, buyingPower: ctx.view.buyingPower ?? null, held: heldNow } } : {})
    };
    const r = await invokeFunction("terminal", { action: "order", accountId: account.id, order, group }).catch((e) => ({ data: { error: String(e?.message || e) } }));
    followGroup(r?.data?.group, { key: `${key}g`, verb: "sent", unit, notify, refresh });
    if (r?.data?.skipped) { notify({ key, tone: "muted", title: `Not on ${account.name || "this account"}`, detail: `${r.data.skipped} The other accounts took their own sizes.` }); refresh?.(); return; }
    if (r?.data?.error) { notify({ key, ...orderNews({ error: r.data.error }) }); return; }
    const placed = { ...base, id: r.data.orderId, status: r.data.status || "new" };
    notify({ key, ...orderNews(placed), ...(r.data.replaced ? { title: `${orderNews(placed).title} · replaced the earlier sell` } : {}) });
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
