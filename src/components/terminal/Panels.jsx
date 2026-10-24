import { useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, clock, pctText } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The terminal's lower panels: the tape, the account's shares, its open
// orders, and the order-book question.

const th = "px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500";
const td = "px-2 py-1 tabular-nums";

export function TimeAndSales({ rows, symbol }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Time (ET)</th><th className={th}>Price</th><th className={th}>Size</th><th className={th}>Venue</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.side === "buy" ? "text-emerald-700" : r.side === "sell" ? "text-rose-700" : "text-slate-700"}>
              <td className={td}>{clock(r.at)}</td><td className={td}>{px(r.price)}</td><td className={td}>{sizeText(r.size)}</td><td className={td}>{r.exchange}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="px-2 py-3 text-xs text-slate-500">Waiting for {symbol} trades. The free IEX feed shows trades executed on IEX only, a small share of all trading, so the tape can be quiet.</p>}
    </div>
  );
}

export function Positions({ positions, onPick }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Symbol</th><th className={th}>Shares</th><th className={th}>Avg</th><th className={th}>Last</th><th className={th}>Value</th><th className={th}>Today</th><th className={th}>Unrealized</th></tr></thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.symbol} className="cursor-pointer hover:bg-slate-50" onClick={() => onPick(p.symbol)}>
              <td className={`${td} font-semibold`}>{p.symbol}</td>
              <td className={td}>{p.qty}</td>
              <td className={td}>{px(p.avgPrice)}</td>
              <td className={td}>{px(p.last)}</td>
              <td className={td}>{fmtMoney(p.marketValue)}</td>
              <td className={`${td} ${p.today >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.today)}</td>
              <td className={`${td} ${p.unrealized >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.unrealized)} <span className="text-slate-400">{pctText(p.unrealizedPct)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!positions.length && <p className="px-2 py-3 text-xs text-slate-500">No shares held in this account.</p>}
    </div>
  );
}

export function Orders({ accountId, orders, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState({});
  const [note, setNote] = useState(null);

  const act = async (o, action, limitPrice) => {
    setBusy(o.id);
    setNote(null);
    const r = await invokeFunction("manageOrder", { accountId, orderId: o.id, action, limitPrice });
    setBusy(null);
    if (r?.data?.error) setNote(r.data.error);
    else setEdit((e) => ({ ...e, [o.id]: undefined }));
    onChanged?.();
  };

  return (
    <div className="h-full overflow-auto">
      {note && <p className="px-2 py-1 text-xs text-rose-700">{note}</p>}
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Symbol</th><th className={th}>Side</th><th className={th}>Qty</th><th className={th}>Type</th><th className={th}>Price</th><th className={th}>Status</th><th className={th} /></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-slate-100">
              <td className={`${td} font-semibold`}>{o.symbol}{o.orderClass === "bracket" ? <span className="ml-1 text-[10px] text-slate-400">bracket</span> : null}</td>
              <td className={`${td} ${o.side === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{o.side}</td>
              <td className={td}>{o.filled ? `${o.filled}/` : ""}{o.qty}</td>
              <td className={td}>{o.type.replace("_", " ")} · {o.tif}</td>
              <td className={td}>
                {o.type === "limit" && edit[o.id] !== undefined ? (
                  <input className="w-20 rounded border border-slate-300 px-1 py-0.5" value={edit[o.id]} onChange={(e) => setEdit((x) => ({ ...x, [o.id]: e.target.value }))} />
                ) : (
                  <>{o.limit ? px(o.limit) : ""}{o.stop ? ` stop ${px(o.stop)}` : ""}{!o.limit && !o.stop ? "market" : ""}</>
                )}
              </td>
              <td className={td}>{o.status.replace("_", " ")}</td>
              <td className={`${td} whitespace-nowrap text-right`}>
                {o.type === "limit" && (edit[o.id] !== undefined ? (
                  <button type="button" disabled={busy === o.id} className="mr-2 text-emerald-700 hover:underline" onClick={() => act(o, "replace", Number(edit[o.id]))}>Send price</button>
                ) : (
                  <button type="button" className="mr-2 text-slate-600 hover:underline" onClick={() => setEdit((x) => ({ ...x, [o.id]: String(o.limit ?? "") }))}>Change price</button>
                ))}
                <button type="button" disabled={busy === o.id} className="text-rose-700 hover:underline" onClick={() => act(o, "cancel")}>{busy === o.id ? "…" : "Cancel"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <p className="px-2 py-3 text-xs text-slate-500">No open orders.</p>}
    </div>
  );
}

export function Depth({ accountId, symbol }) {
  const [state, setState] = useState(null);
  const ask = async () => {
    setState({ busy: true });
    const r = await invokeFunction("terminal", { action: "depth", accountId, symbol });
    setState({ busy: false, ...(r?.data || {}) });
  };
  return (
    <div className="space-y-2 p-2 text-xs text-slate-700">
      <p>Level 2 is the full order book: every price where people are waiting to buy or sell, with sizes. Alpaca documents it for crypto; for shares it appears to offer only the best bid and ask, shown in the quote box. This asks Alpaca's stock feed directly.</p>
      <button type="button" onClick={ask} disabled={!symbol || state?.busy} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50">
        {state?.busy ? "Asking…" : `Ask the feed for ${symbol}'s order book`}
      </button>
      {state && !state.busy && (
        <p className={state.available ? "text-emerald-700" : "text-slate-700"}>
          {state.error ? state.error : state.available ? `Available: the feed accepted an order book subscription for ${state.symbol}.` : `Not available on this feed. Alpaca's reply: ${state.reply}`}
        </p>
      )}
    </div>
  );
}
