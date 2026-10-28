// The accounts an order also goes to, beside the one on screen (27 Oct:
// "select more than one and the orders go for all of them proportionately").
// The shares are worked out on the server (functions/_shared/proRata.ts);
// this is which accounts may be picked, and how their answers are told.

// Each account's own size for what is bought or opened (27 Oct: "I need to
// set the quantities by account"); the server applies it (proRata.ts).
export const SIZE_MODES = [["prorata", "Pro rata"], ["times", "× pro rata"], ["percent", "% of its portfolio"], ["shares", "Shares"], ["dollars", "Dollars"]];
export const sizeLabel = (mode) => ({ prorata: "in proportion to its portfolio value", times: "times its pro-rata share", percent: "% of its own portfolio", shares: "shares", dollars: "dollars" }[mode] || "");

/**
 * Sizes as kept with the person's account (terminal setting "groupsizes"):
 * { accountId: { mode, value } }, known modes only, at most 50 accounts.
 */
export function cleanSizes(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const modes = new Set(SIZE_MODES.map(([id]) => id));
  const out = {};
  for (const [id, s] of Object.entries(raw).slice(0, 50)) {
    if (!/^[\w-]{1,64}$/.test(id) || !s || typeof s !== "object" || !modes.has(s.mode)) continue;
    const value = s.value === undefined || s.value === null ? "" : String(s.value).replace(/[^\d.]/g, "").slice(0, 16);
    out[id] = s.mode === "prorata" ? { mode: "prorata" } : { mode: s.mode, value };
  }
  return out;
}

/** What goes to the server: each picked account with its size, if it has its own. */
export function groupPayload(ids, sizes) {
  return (Array.isArray(ids) ? ids : []).map((id) => {
    const s = sizes?.[id];
    if (!s || !s.mode || s.mode === "prorata") return { id, mode: "prorata" };
    return { id, mode: s.mode, value: Number(s.value) || null };
  });
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
