import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, clock, pctText, isCrypto } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The terminal's lower panels: the tape, the account's shares and coins, and
// its open orders. The order book is OrderBook.jsx.

const th = "px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500";
const td = "px-2 py-1 tabular-nums";

// How long ago, in words a glance can take: "12s", "3m 05s", "2h 10m".
function ago(iso, now) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export function TimeAndSales({ rows, symbol, live = false }) {
  const crypto = isCrypto(symbol);
  // The clock in the header ticks, so a quiet tape reads as quiet, not stuck.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const last = rows[0]?.at;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1 text-xs">
        <span className="truncate font-semibold text-slate-700">Time & sales</span>
        <span className={`shrink-0 text-[10px] tabular-nums ${live ? "text-emerald-700" : "text-slate-500"}`}>
          {live ? "● Live" : "Not streaming"}{last ? ` · last trade ${ago(last, now)} ago` : ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
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
              ? `Waiting for ${symbol} trades. Alpaca's crypto venue is thinner than the big exchanges, so trades can be a minute or more apart while the book keeps moving.`
              : `Waiting for ${symbol} trades. The free IEX feed shows trades executed on IEX only, a small share of all trading, so the tape can be quiet; outside market hours it stops.`}
          </p>
        )}
        {rows.length > 0 && (
          <p className="px-2 py-2 text-[10px] text-slate-400">
            {crypto
              ? "Green: a buyer took the offer. Red: a seller hit the bid. Stated by the feed for every trade."
              : "Green: printed at or above the ask. Red: at or below the bid. An estimate from the live quote; earlier trades stay uncoloured."}
          </p>
        )}
      </div>
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

// The account summary: the broker's own figures, grouped the way a desk reads
// them. Options buying power is what Alpaca will let this account commit to
// option trades; it differs from the overall figure because options cannot be
// bought on margin.
export function AccountSummary({ summary, paper, name }) {
  if (!summary) return <p className="px-2 py-3 text-xs text-slate-500">Reading the account…</p>;
  const m = (v) => (v === null || v === undefined ? "—" : fmtMoney(v));
  const groups = [
    ["Value", [
      ["Equity", m(summary.equity)],
      ["Today", summary.dayChange === null ? "—" : `${summary.dayChange >= 0 ? "+" : ""}${fmtMoney(summary.dayChange)}${summary.lastEquity ? ` (${pctText(summary.dayChange / summary.lastEquity)})` : ""}`, summary.dayChange],
      ["Cash", m(summary.cash)],
      ["Long market value", m(summary.longMarketValue)],
      ["Short market value", m(summary.shortMarketValue)]
    ]],
    ["Buying power", [
      ["Buying power", m(summary.buyingPower)],
      ["Options buying power", m(summary.optionsBuyingPower)],
      ["Reg T (overnight)", m(summary.regtBuyingPower)],
      ["Day trading", m(summary.daytradingBuyingPower)],
      ["Non-marginable (crypto)", m(summary.nonMarginableBuyingPower)]
    ]],
    ["Margin", [
      ["Initial margin", m(summary.initialMargin)],
      ["Maintenance margin", m(summary.maintenanceMargin)],
      ["Margin multiplier", summary.multiplier ? `${summary.multiplier}x` : "—"],
      ["SMA", m(summary.sma)]
    ]],
    ["Account", [
      ["Options level", summary.optionsTradingLevel ?? summary.optionsApprovedLevel ?? "—"],
      ["Day trades (5 days)", summary.dayTradeCount ?? "—"],
      ["Pattern day trader", summary.patternDayTrader ? "Yes" : "No"],
      ["Short selling", summary.shortingEnabled === null ? "—" : summary.shortingEnabled ? "Enabled" : "Off"],
      ["Crypto", summary.cryptoStatus ? summary.cryptoStatus.toLowerCase() : "—"],
      ["Status", summary.tradingBlocked || summary.accountBlocked ? "Blocked" : (summary.status || "—").toLowerCase()]
    ]]
  ];
  return (
    <div className="h-full overflow-auto p-2">
      <div className="mb-2 flex items-baseline gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{name || "Account"}</span>
        {summary.accountNumber && <span>{summary.accountNumber}</span>}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${paper ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{paper ? "Paper" : "Live"}</span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-4">
        {groups.map(([title, rows]) => (
          <div key={title}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{title}</div>
            {rows.map(([label, value, sign]) => (
              <div key={label} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 text-xs tabular-nums">
                <span className="text-slate-500">{label}</span>
                <span className={sign === undefined || sign === null ? "text-slate-800" : sign >= 0 ? "text-emerald-700" : "text-rose-700"}>{value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
