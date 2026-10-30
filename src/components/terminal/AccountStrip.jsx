import { Check } from "lucide-react";
import { px, sizeText } from "@/lib/terminal";
import { exitsOf } from "@/lib/accountGroup";

// Which accounts the ticket, the hotkeys, stops and cancels go to, on screen
// at all times above the windows (30 Oct, the owner: "The accounts selections
// and knowing which account is buying or selling now is so confusing. I lost
// lots of money because of that"). Every account the terminal can trade is a
// chip: ticked ones are sent to, red when live, and each says what it holds
// in the symbol on the chart and whether a stop and a take profit sit at
// Alpaca for it. The account on screen is always sent to; the toolbar's
// account list changes which one that is.
export default function AccountStrip({ lead, choices, picked, onPick, rows, symbol }) {
  if (!lead) return null;
  const on = new Set(picked);
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  const sending = [lead, ...choices.filter((a) => on.has(a.id))];
  const live = sending.filter((a) => a.type === "Live").length;
  const toggle = (id) => onPick(on.has(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <div className="flex w-full basis-full flex-wrap items-stretch gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" role="group" aria-label="Accounts orders go to">
      <div className="flex flex-col justify-center pr-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Orders go to</span>
        <span className={`font-semibold ${live ? "text-rose-700" : "text-slate-800"}`}>
          {sending.length} account{sending.length === 1 ? "" : "s"}{live ? ` · ${live} live` : ""}
        </span>
      </div>
      <Chip account={lead} row={byId.get(lead.id)} symbol={symbol} sending lead />
      {choices.map((a) => (
        <Chip key={a.id} account={a} row={byId.get(a.id)} symbol={symbol} sending={on.has(a.id)} onToggle={() => toggle(a.id)} />
      ))}
    </div>
  );
}

function Chip({ account, row, symbol, sending, lead = false, onToggle }) {
  const live = account.type === "Live";
  const tone = !sending ? "border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600"
    : live ? "border-rose-500 bg-rose-50 text-rose-900" : "border-sky-500 bg-sky-50 text-sky-900";
  const x = row && !row.error ? exitsOf(row.qty, row.waiting) : null;
  const body = (
    <>
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${sending ? "border-current bg-current" : "border-slate-300 bg-white"}`}>
          {sending && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </span>
        <span className="max-w-[12rem] truncate font-semibold">{account.name}</span>
        <span className={`rounded px-1 text-[9px] font-bold uppercase ${live ? "bg-rose-600 text-white" : "bg-sky-600 text-white"}`}>{live ? "Live" : "Paper"}</span>
        {lead && <span className="rounded bg-slate-800 px-1 text-[9px] font-semibold uppercase text-white">On screen</span>}
      </span>
      {sending && (
        <span className="mt-0.5 block text-[11px] leading-tight">
          {row?.error ? <span className="text-rose-700">could not be read</span>
            : !x ? <span className="text-slate-500">reading…</span>
              : !x.held ? <span className="text-slate-500">no {symbol}</span>
                : (
                  <>
                    <b className="tabular-nums">{sizeText(Math.abs(x.held))} {symbol}{x.held < 0 ? " short" : ""}</b>
                    {" · "}
                    {x.stop !== null ? <span>stop {px(x.stop)}</span> : <span className="font-bold text-rose-700">NO STOP</span>}
                    {x.target !== null && <span> · target {px(x.target)}</span>}
                  </>
                )}
          {x?.other > 0 && <span className="text-amber-800"> · {x.other} order{x.other === 1 ? "" : "s"} waiting</span>}
        </span>
      )}
      {!sending && <span className="mt-0.5 block text-[11px] leading-tight">not sent to · click to add</span>}
    </>
  );
  const cls = `flex min-w-[9rem] flex-col justify-center rounded-md border px-2 py-0.5 text-left ${tone}`;
  if (lead) return <div className={cls} title="The account on screen: every order goes to it. Change it in the account list above.">{body}</div>;
  return (
    <button type="button" onClick={onToggle} aria-pressed={sending} className={cls}
      title={sending ? `Orders, hotkeys, stops and cancels also go to ${account.name}. Click to stop sending to it.` : `Click to send orders to ${account.name} too.`}>
      {body}
    </button>
  );
}
