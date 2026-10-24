import { useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, clock, pctText, isCrypto } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The terminal's lower panels: the tape, the account's shares and coins, and
// its open orders. The order book is OrderBook.jsx.

const th = "px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500";
const td = "px-2 py-1 tabular-nums";

export function TimeAndSales({ rows, symbol }) {
  const crypto = isCrypto(symbol);
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr><th className={th}>Time (ET)</th><th className={th}>Price</th><th className={th}>Size{crypto ? ` (${symbol.split("/")[0]})` : ""}</th><th className={th}>{crypto ? "Taker" : "Venue"}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.side === "buy" ? "text-emerald-700" : r.side === "sell" ? "text-rose-700" : "text-slate-700"}>
              <td className={td}>{clock(r.at)}</td><td className={td}>{px(r.price)}</td><td className={td}>{sizeText(r.size)}</td>
              <td className={td}>{crypto ? (r.side === "buy" ? "Buyer" : r.side === "sell" ? "Seller" : "") : r.exchange}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="px-2 py-3 text-xs text-slate-500">
          {crypto
            ? `Waiting for ${symbol} trades. Every trade on Alpaca's crypto venue appears here as it happens; the venue is thinner than the big exchanges, so trades can be a minute or more apart while the book keeps moving.`
            : `Waiting for ${symbol} trades. The free IEX feed shows trades executed on IEX only, a small share of all trading, so the tape can be quiet.`}
        </p>
      )}
      {rows.length > 0 && (
        <p className="px-2 py-2 text-[10px] text-slate-400">
          {crypto
            ? "Green: a buyer took the offer. Red: a seller hit the bid. Stated by the feed for every trade."
            : "Green: printed at or above the ask. Red: at or below the bid. An estimate from the quote; the stock feed does not say who took the trade."}
        </p>
      )}
    </div>
  );
}

export function Positions({ positions, onPick }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Symbol</th><th className={th}>Quantity</th><th className={th}>Avg</th><th className={th}>Last</th><th className={th}>Value</th><th className={th}>Today</th><th className={th}>Unrealized</th></tr></thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.symbol} className="cursor-pointer hover:bg-slate-50" onClick={() => onPick(p.symbol)}>
              <td className={`${td} font-semibold`}>{p.symbol}</td>
              <td className={td}>{sizeText(p.qty)}</td>
              <td className={td}>{px(p.avgPrice)}</td>
              <td className={td}>{px(p.last)}</td>
              <td className={td}>{fmtMoney(p.marketValue)}</td>
              <td className={`${td} ${p.today >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.today)}</td>
              <td className={`${td} ${p.unrealized >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.unrealized)} <span className="text-slate-400">{pctText(p.unrealizedPct)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!positions.length && <p className="px-2 py-3 text-xs text-slate-500">No shares or coins held in this account.</p>}
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
              <td className={td}>{o.qty === null && o.notional ? fmtMoney(o.notional) : <>{o.filled ? `${sizeText(o.filled)}/` : ""}{sizeText(o.qty)}</>}</td>
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
