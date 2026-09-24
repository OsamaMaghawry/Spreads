// Everything that changes what the figures mean, in one place.
//
// These are the three notices that used to open the page, above the numbers
// they qualify. They are not deleted and not weakened -- the exact same
// sentences, moved to where they can be read deliberately rather than skipped
// on the way to the result.
//
// They appear TWICE by design: attached to the individual figure they move
// (see StatTiles) and gathered here. That is not duplication for its own sake.
// A reader looking at the win rate needs the unattributed trade on the win
// rate; a reader checking whether the whole report can be trusted needs all
// three together, and should not have to open four tiles to collect them.
//
// The count on the tab is generated from this list, so a notice can never be
// added without the tab admitting there is one more to read.

export function methodNotes({ withheldLine, transfersNote, viewNote }) {
  return [
    withheldLine && { key: "withheld", tone: "amber", text: withheldLine },
    transfersNote && { key: "transfers", tone: "sky", text: transfersNote },
    viewNote && { key: "view", tone: "plain", text: viewNote }
  ].filter(Boolean);
}

const TONE = {
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  plain: "border-dm-line bg-white text-dm-sub"
};

export default function MethodNotes({ notes, children }) {
  if (!notes.length && !children) return null;
  return (
    <div className="space-y-2.5">
      {notes.map((n) => (
        <div key={n.key} className={`rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed ${TONE[n.tone]}`}>
          {n.text}
        </div>
      ))}
      {children}
    </div>
  );
}
