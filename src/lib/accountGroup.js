// The accounts an order also goes to, beside the one on screen (27 Oct:
// "select more than one and the orders go for all of them proportionately").
// The shares are worked out on the server (functions/_shared/proRata.ts);
// this is which accounts may be picked, and how their answers are told.

// Each account's size for what is bought or sold, one rule for every
// account, the one on screen or not (3 Nov, the owner: "I see different areas
// to set different numbers ... Nothing called something on a screen is
// different from the hotkeys"): the key's own size, or a size of its own. Set
// in one place, the Accounts list beside the account on screen; the server
// applies it (proRata.ts).
export const SIZE_MODES = [["key", "Same as the key"], ["dollars", "$ amount"], ["shares", "Shares"], ["percent", "% of its portfolio"]];

/**
 * One account's size for one order, as the server takes it: its own, or the
 * key's (or the ticket's) as its own: dollars as dollars, shares as shares; a
 * percent key is the same percent of each account's own portfolio (or buying
 * power), which the server works out from the order's percent.
 * `key`: { size: "usd" | "shares" | "equity" | "bp", amount }.
 */
export function resolveSize(g, key) {
  if (g && g.mode && g.mode !== "key" && g.mode !== "prorata" && Number(g.value) > 0) return g;
  const v = Number(key?.amount);
  if (!(v > 0)) return { id: g.id, mode: "prorata" };
  if (key.size === "usd") return { id: g.id, mode: "dollars", value: v };
  if (key.size === "shares") return { id: g.id, mode: "shares", value: v };
  return { id: g.id, mode: "prorata" };
}

/**
 * Sizes as kept with the person's account (terminal setting "groupsizes"):
 * { accountId: { mode, value } }, known modes only, at most 50 accounts.
 */
export function cleanSizes(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const modes = new Set(SIZE_MODES.map(([id]) => id));
  const out = {};
  for (const [id, s] of Object.entries(raw).slice(0, 50)) {
    if (!/^[\w-]{1,64}$/.test(id) || !s || typeof s !== "object") continue;
    // Pro rata and its multiples, from before: the key's own size now.
    if (s.mode === "prorata" || s.mode === "times") { out[id] = { mode: "key" }; continue; }
    if (!modes.has(s.mode)) continue;
    const value = s.value === undefined || s.value === null ? "" : String(s.value).replace(/[^\d.]/g, "").slice(0, 16);
    out[id] = s.mode === "key" ? { mode: "key" } : { mode: s.mode, value };
  }
  return out;
}

/** Each picked account with its size: its own, or "key" (resolveSize turns that into the order's). */
export function groupPayload(ids, sizes) {
  return (Array.isArray(ids) ? ids : []).map((id) => {
    const s = sizes?.[id];
    if (!s || !s.mode || s.mode === "key" || s.mode === "prorata" || s.mode === "times") return { id, mode: "key" };
    return { id, mode: s.mode, value: Number(s.value) || null };
  });
}

/** Whether orders can go to an account from here: paper, or live where the server allows it. */
export const canSend = (a, liveOk) => !!a && !a.readOnly && (a.type === "Paper" || (a.type === "Live" && !!liveOk));

/** The ticked accounts as kept with the person's account ("sendto"): ids, or null where never set. */
export function cleanTicks(raw) {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((x) => typeof x === "string" && /^[\w-]{1,64}$/.test(x)))].slice(0, 20);
}

/**
 * Where an order goes (3 Nov, the owner's approved design: one list, a tick
 * for each account orders go to, the account on screen chosen apart from the
 * ticks): every ticked account that can trade, each at its own size or the
 * key's. The account on screen sends first when it is ticked (its own order
 * goes at once, with the screen's figures); when it is not, `leadOff` and
 * every ticked account goes as one of the group.
 * `ticks`: ticked ids; `shownId`: the account on screen; `sizes`: "groupsizes".
 */
export function sendPlan({ ticks, shownId, accounts, liveOk, sizes }) {
  const on = new Set(Array.isArray(ticks) ? ticks : []);
  const sending = (Array.isArray(accounts) ? accounts : []).filter((a) => on.has(a.id) && canSend(a, liveOk));
  const leadOn = sending.some((a) => a.id === shownId);
  const others = sending.filter((a) => a.id !== shownId).map((a) => a.id);
  return {
    sending,
    none: sending.length === 0,
    leadOff: !leadOn && sending.length > 0,
    group: groupPayload(others, sizes),
    leadSize: leadOn ? sizes?.[shownId] || null : null
  };
}

/** Accounts that can join: every account the terminal trades except the one on screen. */
export function groupChoices(accounts, leadId, liveOk) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((a) => a && a.id !== leadId && !a.readOnly && (a.type === "Paper" || (a.type === "Live" && liveOk)));
}

/** The picked ids still allowed, in the accounts' own order. */
export function cleanGroup(ids, accounts, leadId, liveOk) {
  const picked = new Set(Array.isArray(ids) ? ids : []);
  return groupChoices(accounts, leadId, liveOk).filter((a) => picked.has(a.id)).map((a) => a.id);
}

const amount = (r, unit) => (r.notional ? `$${Number(r.notional).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : r.qty != null ? `${Number(r.qty).toLocaleString("en-US", { maximumFractionDigits: 9 })}${unit ? ` ${unit}` : ""}` : "");

const FINAL_UNFILLED = new Set(["canceled", "expired", "rejected", "done_for_day", "stopped", "suspended"]);
const price = (v) => (Number(v) >= 1 ? Number(v).toFixed(2) : Number(v).toFixed(4));

/**
 * One pop-up for what the group's accounts said: `rows` from the server,
 * `verb` what each did when it worked ("sent", "exit sent", "stop placed").
 * A row being followed (`track`, runHotkey followGroup) says how its order
 * stands: filled, part filled, still waiting, or ended unfilled (28 Oct: the
 * other accounts' sells sat unfilled or refused, unseen, while their buys
 * filled, and the positions stacked up).
 */
export function groupNews(rows, verb, unit = "") {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const count = { done: 0, waiting: 0, refused: 0, missed: 0, skipped: 0 };
  const lines = list.map((r) => {
    const name = `${r.name}${r.live ? " (live)" : ""}`;
    if (r.skip) { count.skipped += 1; return `${name}: skipped, ${r.skip}`; }
    if (r.ok === false) { count.refused += 1; return `${name}: refused, ${r.error || "no reason given"}`; }
    const what = amount(r, unit);
    if (r.track && r.status) {
      const filled = Number(r.filled) || 0;
      if (r.status === "filled") { count.done += 1; return `${name}: ${amount({ qty: filled || r.qty }, unit)} filled${r.avgPrice ? ` at ${price(r.avgPrice)}` : ""}`; }
      if (FINAL_UNFILLED.has(r.status)) {
        count.missed += 1;
        return `${name}: not filled (${r.status.replace(/_/g, " ")})${filled ? `, ${amount({ qty: filled }, unit)} filled before` : ""}`;
      }
      count.waiting += 1;
      return filled ? `${name}: ${amount({ qty: filled }, unit)} of ${what} filled, the rest waiting` : `${name}: ${what ? `${what} ` : ""}${verb}, waiting to fill`;
    }
    count.done += 1;
    const extra = r.cancelled != null && verb === "cancelled" ? `${r.cancelled} cancelled` : `${what ? `${what} ` : ""}${verb}${r.replaced ? ", replacing the earlier sell" : ""}`;
    return `${name}: ${extra}`;
  });
  const parts = [
    `${count.done} ${list.some((r) => r.track) ? "filled" : "done"}`,
    count.waiting ? `${count.waiting} waiting` : null,
    count.missed ? `${count.missed} not filled` : null,
    count.refused ? `${count.refused} refused` : null,
    count.skipped ? `${count.skipped} skipped` : null
  ].filter(Boolean);
  return {
    tone: count.refused || count.missed ? "bad" : count.waiting ? "wait" : count.done ? "ok" : "muted",
    title: `Also on ${list.length} account${list.length === 1 ? "" : "s"}: ${parts.join(", ")}`,
    detail: lines.join(" · ")
  };
}

// What kind of working order it is, for finding the same one on another account.
const orderKind = (o) => (o.orderClass === "oco" ? "oco" : o.orderClass === "bracket" ? `bracket ${o.type}` : ["stop", "stop_limit"].includes(o.type) ? "stop" : o.type);

/**
 * The same working order on another account picked beside this one (28 Oct:
 * "any price changes for all accounts at once"): same symbol and side, and the
 * same kind (a limit, a stop, a stop and target pair, a bracket's entry).
 */
export function sameOrders(order, list) {
  return (Array.isArray(list) ? list : []).filter((o) => o.symbol === order.symbol && o.side === order.side && orderKind(o) === orderKind(order));
}

/**
 * A holding's exits as its working orders stand at Alpaca: the stop and the
 * take profit on the side that closes it (a one-cancels-other pair carries
 * both), and how many other orders wait on the symbol. For the account strip
 * (30 Oct, the owner: "knowing which account is buying or selling now is so
 * confusing"): an account that holds without a stop says so.
 * `qty`: signed, negative for a short; `orders`: the symbol's working orders.
 */
export function exitsOf(qty, orders) {
  const held = Number(qty) || 0;
  const closing = held > 0 ? "sell" : held < 0 ? "buy" : null;
  let stop = null;
  let target = null;
  let other = 0;
  for (const o of Array.isArray(orders) ? orders : []) {
    if (closing && o.side === closing && o.orderClass === "oco") {
      target = o.limit ?? target;
      stop = (o.legs || []).find((l) => l.type === "stop" || l.type === "stop_limit")?.stop ?? stop;
    } else if (closing && o.side === closing && !(o.legs || []).length && ["stop", "stop_limit", "trailing_stop"].includes(o.type)) {
      stop = o.stop ?? stop;
    } else if (closing && o.side === closing && !(o.legs || []).length && o.type === "limit" && o.tif === "gtc") {
      target = o.limit ?? target;
    } else other += 1;
  }
  return { held, stop, target, other, bare: held !== 0 && stop === null };
}
