import { invokeFunction } from "@/lib/functions";
import { isCrypto } from "@/lib/terminal";
import { resplit } from "@/lib/accountGroup";

// Cancel and change a working order block (lib/accountGroup.js orderBlocks:
// the same order on every ticked account), for the desktop Orders tab and the
// phone's order cards alike, so both send exactly the same requests.

// A stop, or a stop and take profit pair, protecting what is held.
export const protectiveOrder = (o) => ["stop", "stop_limit"].includes(o?.type) || o?.orderClass === "oco";
// What can be changed in place: a plain limit, or a protective order.
export const editableOrder = (o) => (o?.type === "limit" && o?.orderClass !== "bracket") || (protectiveOrder(o) && o?.orderClass !== "bracket");
// The new quantity, where it can change: not on a stop that covers what is
// held, and not once part of it has filled (how the broker counts the filled
// part on a change is not yet checked on paper: cancel and send the rest).
export const qtyChangeable = (b) => !protectiveOrder(b.first) && b.rows.every((r) => r.order.qty != null && !(Number(r.order.filled) > 0));

export const manageRow = (row, action, extra = {}) => invokeFunction("manageOrder", { accountId: row.accountId, orderId: row.order.id, action, ...extra })
  .then((r) => ({ name: row.name, error: r?.data?.error || null }))
  .catch((e) => ({ name: row.name, error: String(e?.message || e) }));

/** Cancel these rows of a block (one account's, or all). Each one's result. */
export const cancelRows = (rows) => Promise.all(rows.map((x) => manageRow(x, "cancel")));

/** The block's new total shared across its accounts, or null when unchanged. */
export function qtySplit(b, total) {
  if (total === null || total === undefined || total === "" || !qtyChangeable(b)) return null;
  const t = Number(total);
  if (Math.abs(t - (b.qty || 0)) < 1e-12) return null;
  return resplit(b.rows, t, { crypto: isCrypto(b.symbol) });
}

/**
 * Change a block: `limit`, `stop` and `qty` as numbers or null for unchanged.
 * A stop or a stop and target pair is set again at the new prices on every
 * account in the block, each for all it holds (functions/terminal "protect"),
 * the other half of a pair kept; anything else is replaced in place, a new
 * quantity shared in the proportions the orders already have.
 * `ctx`: accountId and name (the account on screen), group (the ticked
 * accounts, as the page has them).
 * Returns { rows: [{ name, error }], error, nothing }.
 */
export async function changeBlock(b, { limit = null, stop = null, qty = null }, { accountId, name, group = [] }) {
  if (protectiveOrder(b.first)) {
    const newStop = stop !== null && stop !== b.stop ? stop : null;
    const newTarget = b.orderClass === "oco" && limit !== null && limit !== b.limit ? limit : null;
    if (!newStop && !newTarget) return { rows: [], nothing: true };
    const kind = newStop && newTarget ? "both" : newStop ? "stop" : "target";
    // Only the accounts in this block (18 Nov review: every ticked account's
    // stop was set again, the screen's too, whatever block was changed).
    const inBlock = b.rows.map((r) => r.accountId);
    const r = await invokeFunction("terminal", {
      action: "protect", accountId, symbol: b.symbol, kind, mode: "price", value: newStop ?? newTarget,
      stopPrice: newStop ?? b.stop, targetPrice: newTarget ?? b.limit,
      group: group.filter((g) => inBlock.includes(g?.id ?? g)), leadOff: !inBlock.includes(accountId)
    }).catch((x) => ({ data: { error: String(x?.message || x) } }));
    const d = r?.data || {};
    return {
      rows: [...(inBlock.includes(accountId) ? [{ name, error: d.error || null }] : []), ...(d.group || []).map((g) => ({ name: g.name, error: g.ok === false && !g.skip ? g.error || "refused" : null }))]
    };
  }
  const newLimit = limit !== null && limit !== b.limit ? limit : null;
  const split = qtySplit(b, qty);
  if (split?.error) return { rows: [], error: split.error };
  if (newLimit === null && !split) return { rows: [], nothing: true };
  const rows = await Promise.all(b.rows.map((row) => {
    const q = split?.rows.find((x) => x.orderId === row.order.id)?.qty;
    return manageRow(row, "replace", { ...(newLimit !== null ? { limitPrice: newLimit } : {}), ...(q ? { qty: q } : {}) });
  }));
  return { rows };
}
