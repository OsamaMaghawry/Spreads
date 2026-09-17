import { fmtMoney } from "@/lib/format";

// Where the windowed whole-view figure came from. See src/lib/windowParts.js
// for the arithmetic and the owner's question this answers.
//
// Two of the four lines are money and two are marks, and the panel says so on
// each line rather than in a footnote: a bold signed total under four signed
// rows reads as money earned unless something on the same row says otherwise.
// The two mark lines show BOTH ENDS, because the change alone is the number
// that alarmed the reader -- "+$1,876 in the option book" on a week the open
// panel shows +$131 -- and only the starting mark explains it.

const signed = (v) => `${v >= 0 ? "+" : ""}${fmtMoney(v)}`;
const tone = (v) => (v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-slate-600");

function Row({ label, hint, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm text-slate-900">{label}</div>
        {hint && <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{hint}</div>}
      </div>
      <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${tone(value)}`}>{signed(value)}</div>
    </div>
  );
}

export default function WindowParts({ parts }) {
  if (!parts) return null;
  const { from, to, premium, sharesBooked, sharesMark, optionsMark, total } = parts;
  const markHint = (m) =>
    `A mark, not money. ${fmtMoney(m.start)} at the ${from} close, ${fmtMoney(m.end)} at the ${to} close.`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium text-slate-900">Where {signed(total)} came from</h3>
        <span className="text-[11px] text-slate-500">From the {from} close to the {to} close</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
        The four parts of the figure above. Two are money; two are marks that keep moving until
        the positions close. When a position that was open at the start closes inside the window,
        its whole result lands on a money line and the mark it had been carrying comes off a mark
        line — so read the four together.
      </p>
      <Row
        label="Option legs closed"
        hint="Money. Every option leg the window booked, credits and debits."
        value={premium}
      />
      <Row label="Shares sold" hint="Money." value={sharesBooked} />
      <Row label="Shares held" hint={markHint(sharesMark)} value={sharesMark.change} />
      <Row label="Option legs still open" hint={markHint(optionsMark)} value={optionsMark.change} />
      <div className="flex items-baseline justify-between gap-4 pt-3 mt-1 border-t border-slate-200">
        <div>
          <div className="text-sm font-semibold text-slate-900">Whole view total</div>
          <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
            Our reconstruction — your broker&rsquo;s statement is the total that counts.
          </div>
        </div>
        <div className={`text-lg font-semibold tabular-nums whitespace-nowrap ${tone(total)}`}>{signed(total)}</div>
      </div>
    </div>
  );
}
