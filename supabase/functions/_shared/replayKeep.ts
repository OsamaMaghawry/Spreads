// A replay's practice results are never lost by a save (1 Nov 2026, the
// owner: "save the results. So it doesn't go away. So I can revise them
// wherever, whenever I needed to revise them"). The same day a replay with
// 12 practice fills was saved over with an empty one by a start over beside
// Play, and nothing was left to get it back from.
//
// So when the terminal saves replays ("replay:<ID>" settings), each one is
// checked against the copy stored:
// - a save that would leave fewer fills than stored, beyond the fills
//   cancelled on purpose (`cancelled` counts them), first keeps the stored
//   copy as a replay of its own, named for it, to read or continue;
// - a delete of a replay with fills goes through only when it was confirmed
//   (`confirmed`), so an old page or a replay left with no trades cannot
//   take one away.
//
// `rows`: the rows about to be saved ({ key, value, ... }); `stored`: the
// stored value of each replay key among them. Returns the rows to save.

export const fillsOf = (v: any): number => Math.max(0, Number(v?.summary?.fills) || 0);
const cancelledOf = (v: any): number => Math.max(0, Number(v?.cancelled) || 0);

export function keepReplays(rows: any[], stored: Map<string, any>, now = Date.now()): any[] {
  const out: any[] = [];
  let n = 0;
  for (const row of rows) {
    const old = String(row.key).startsWith("replay:") ? stored.get(row.key) : null;
    if (!old || old.deleted || !fillsOf(old)) { out.push(row); continue; }
    if (row.value?.deleted) {
      if (row.value.confirmed) out.push(row);
      continue;
    }
    const lost = fillsOf(old) - fillsOf(row.value) - Math.max(0, cancelledOf(row.value) - cancelledOf(old));
    if (lost > 0) {
      const base = String(old.id || row.key.slice("replay:".length)).split(".")[0].slice(0, 12);
      const id = `${base}.${(now + n).toString(36).toUpperCase()}`;
      n += 1;
      out.push({
        ...row,
        key: `replay:${id}`,
        value: { ...old, id, running: false, keptFrom: old.id || null, name: `${String(old.name || "Replay").slice(0, 60)} (kept, ${fillsOf(old)} fills)` }
      });
    }
    out.push(row);
  }
  return out;
}
