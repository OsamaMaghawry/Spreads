// A number that needs no plot. Four active-user counts drawn as four tiny
// charts would be four charts carrying one number each — the tile is the
// correct form when the value is the whole story.
export default function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-dm-line bg-dm-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-dm-sub">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-dm-text">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-dm-sub">{sub}</div>}
    </div>
  );
}
