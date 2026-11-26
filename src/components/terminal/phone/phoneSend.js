import { invokeFunction } from "@/lib/functions";
import { orderNews, px } from "@/lib/terminal";
import { exitsNotes } from "@/lib/phoneOrder";
import { reportGroup, trackOrder } from "../runHotkey";

// What the phone sends, through the same server actions as the desktop:
// "allocate" and "order" for the ticket (shared over the ticked accounts as
// the desktop ticket shares them), "protect" for a position's stop and target.

const partText = (p) => (p && !p.skip ? String(p.notional ?? p.qtyText ?? p.qty ?? "") : "0");

/**
 * Each ticked account's part of the ticket's total, as the desktop review
 * shows it (functions/terminal "allocate", split by portfolio value).
 * Returns { rows: [{ accountId, name, part, live, onScreen }], lead, closing } or { error }.
 */
export async function allocateParts({ account, order, group, leadOff }) {
  const groupIds = group.map((g) => g.id ?? g);
  if (!groupIds.length) return { rows: [{ accountId: account.id, name: account.name, part: String(order.qty), live: account.type === "Live", onScreen: true }], lead: null };
  const r = await invokeFunction("terminal", { action: "allocate", accountId: account.id, order: { ...order, split: "total", ...(leadOff ? { leadOff: true } : {}) }, group: groupIds })
    .catch((e) => ({ data: { error: String(e?.message || e) } }));
  if (r?.data?.error) return { error: r.data.error };
  const lead = r?.data?.lead || null;
  const rows = [
    ...(!leadOff && lead ? [{ accountId: account.id, name: account.name, part: partText(lead.part), live: account.type === "Live", onScreen: true }] : []),
    ...(r?.data?.group || []).map((g) => ({ accountId: g.accountId, name: g.name, part: partText(g), live: !!g.live }))
  ];
  return { rows, lead, closing: !!r?.data?.closing, at: Date.now() };
}

/** A position's stop and/or target at these prices (functions/terminal "protect"), on one account or the ticked ones. */
export async function setExits({ accountId, symbol, stop = null, target = null, group = [], leadOff = false }) {
  const kind = stop && target ? "both" : stop ? "stop" : "target";
  const r = await invokeFunction("terminal", {
    action: "protect", accountId, symbol, kind, mode: "price", value: stop ?? target, stopPrice: stop, targetPrice: target, group, leadOff
  }).catch((e) => ({ data: { error: String(e?.message || e) } }));
  return r?.data || { error: "No answer" };
}

/**
 * Send the ticket's order: `built` from lib/phoneOrder.js, `alloc` from
 * allocateParts (its parts are what is sent). Exits that go on after the fill
 * (`built.later`) are set on each account as its own order fills.
 */
export async function sendTicket({ account, built, alloc, leadOff, notify, refresh }) {
  const key = `ph${Date.now()}`;
  const { order, later, words } = built;
  notify({ key, ...orderNews({ sending: true, words }) });
  let body = { ...order };
  let groupOut = [];
  const rows = alloc?.rows || [];
  const mine = rows.find((g) => g.onScreen);
  if (alloc?.lead !== undefined && rows.some((g) => !g.onScreen)) {
    groupOut = rows.filter((g) => !g.onScreen && Number(g.part) > 0).map((g) => ({ id: g.accountId, mode: "shares", value: g.part }));
    const myPart = mine ? Number(mine.part) : 0;
    const fresh = alloc.lead && !leadOff && Date.now() - alloc.at < 30000;
    body = {
      ...body, ...(alloc.closing ? { reduceOnly: true } : {}),
      ...(fresh ? { leadBook: { equity: alloc.lead.equity, buyingPower: alloc.lead.buyingPower, held: alloc.lead.held } } : {}),
      ...(myPart > 0 ? { qty: mine.part } : { leadOff: true, qty: null })
    };
  } else if (leadOff) {
    body = { ...body, leadOff: true, qty: null };
  }
  // Exits once the entry fills; also when it ends part-filled (expired or
  // cancelled with shares held), for what was bought.
  const exitsOn = (accountId, who = "") => (later ? async () => {
    const d = await setExits({ accountId, symbol: order.symbol, stop: later.stop, target: later.target });
    const names = [later.stop && `stop ${px(later.stop)}`, later.target && `target ${px(later.target)}`].filter(Boolean).join(" and ");
    if (d.error) notify({ key: `${key}${accountId}x`, tone: "bad", title: `${who ? `${who}: ` : ""}Exits not set`, detail: `${d.error} Set your ${names} now.` });
    else {
      const day = exitsNotes(d);
      notify({ key: `${key}${accountId}x`, tone: "ok", title: `${who ? `${who}: ` : ""}Exits set`, detail: `${order.symbol} ${names}${day ? ` · ${day}` : ""}` });
    }
    refresh?.();
  } : undefined);
  const r = await invokeFunction("terminal", { action: "order", accountId: account.id, order: body, group: groupOut })
    .catch((e) => ({ data: { error: String(e?.message || e) } }));
  const d = r?.data || {};
  reportGroup(d.group, { key: `${key}g`, notify, refresh, expected: groupOut.map((g) => g.id) });
  if (later) {
    for (const [i, g] of (d.group || []).entries()) {
      if (!g.orderId || g.ok === false) continue;
      trackOrder({ accountId: g.accountId, id: g.orderId, key: `${key}t${i}`, base: { status: g.status || "new", symbol: order.symbol, side: order.side, words: "" }, notify: () => {}, onFilled: exitsOn(g.accountId, g.name), onUnfilled: (o) => { if (Number(o?.filled) > 0) exitsOn(g.accountId, g.name)(); } });
    }
  }
  if (d.error) { notify({ key, ...orderNews({ error: d.error }) }); return false; }
  if (d.skipped) { notify({ key, tone: "muted", title: `Not on ${account.name || "this account"}`, detail: d.skipped }); refresh?.(); return true; }
  if (d.leadOff || body.leadOff) { notify({ key, tone: "ok", title: `Sent to ${groupOut.length} account${groupOut.length === 1 ? "" : "s"}`, detail: `${words}. See Orders.` }); refresh?.(); return true; }
  const placed = { key, id: d.orderId, status: d.status || "new", words, symbol: order.symbol, side: order.side, unitName: "shares" };
  notify({ key, ...orderNews(placed) });
  refresh?.();
  if (placed.id) trackOrder({ accountId: account.id, id: placed.id, key, base: placed, notify, onChange: refresh, onFilled: exitsOn(account.id), onUnfilled: (o) => { if (Number(o?.filled) > 0) exitsOn(account.id)(); } });
  return true;
}
