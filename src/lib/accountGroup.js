// The accounts an order also goes to, beside the one on screen (27 Oct:
// "select more than one and the orders go for all of them proportionately").
// The shares are worked out on the server (functions/_shared/proRata.ts);
// this is which accounts may be picked, and how their answers are told.

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

/**
 * One pop-up for what the group's accounts said: `rows` from the server,
 * `verb` what each did when it worked ("sent", "exit sent", "stop placed").
 */
export function groupNews(rows, verb, unit = "") {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const failed = list.filter((r) => !r.skip && r.ok === false);
  const done = list.filter((r) => !r.skip && r.ok !== false);
  const lines = list.map((r) => {
    const name = `${r.name}${r.live ? " (live)" : ""}`;
    if (r.skip) return `${name}: skipped, ${r.skip}`;
    if (r.ok === false) return `${name}: refused, ${r.error || "no reason given"}`;
    const what = amount(r, unit);
    const extra = r.cancelled != null && verb === "cancelled" ? `${r.cancelled} cancelled` : `${what ? `${what} ` : ""}${verb}`;
    return `${name}: ${extra}`;
  });
  return {
    tone: failed.length ? "bad" : done.length ? "ok" : "muted",
    title: `Also on ${list.length} account${list.length === 1 ? "" : "s"}: ${done.length} done${failed.length ? `, ${failed.length} refused` : ""}${list.length - done.length - failed.length ? `, ${list.length - done.length - failed.length} skipped` : ""}`,
    detail: lines.join(" · ")
  };
}
