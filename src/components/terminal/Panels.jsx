import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, clockMs, pctText, isCrypto, orderState } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { orderBlocks, resplit, stopOf } from "@/lib/accountGroup";
import useAccountSetting from "@/components/terminal/useAccountSetting";

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

const TAPE_ORDER_KEY = "dm.terminal.tapeOrder";

// The rows come newest first, by when each trade printed (lib/terminal.js
// mergeTape). Click the time to read them oldest first, as a tape runs
// (26 Oct: "the ability to sort it by time"); this browser remembers which.
// Oldest first, the newest are at the bottom, followed while you are there.
export function TimeAndSales({ rows, symbol, live = false, delay = null, source = "iex" }) {
  const crypto = isCrypto(symbol);
  // The clock in the header ticks, so a quiet tape reads as quiet, not stuck.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Which way the tape runs, kept with the account (useAccountSetting.js).
  const [oldestFirst, setOldestFirst] = useAccountSetting("tapeorder", {
    localKey: TAPE_ORDER_KEY, initial: () => false, clean: (v) => v === true || v === "oldest",
    fromLocal: (raw) => raw === "oldest", toLocal: (v) => (v ? "oldest" : "newest")
  });
  const flip = () => setOldestFirst((v) => !v);
  const box = useRef(null);
  const atEnd = useRef(true);
  const shown = oldestFirst ? [...rows].reverse() : rows;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (oldestFirst ? atEnd.current : el.scrollTop < 40) el.scrollTop = oldestFirst ? el.scrollHeight : 0;
  }, [rows, oldestFirst]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  const last = rows[0]?.at;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="drag-handle flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-1 text-xs">
        <span className="truncate font-semibold text-slate-700">Time & sales</span>
        <span className={`shrink-0 text-[10px] tabular-nums ${live ? "text-emerald-700" : "text-slate-500"}`}>
          {live ? "● Live" : "Not streaming"}
          {delay !== null ? ` · ${(delay / 1000).toFixed(1)}s behind` : ""}
          {last ? ` · last ${ago(last, now)} ago` : ""}
        </span>
      </div>
      <div ref={box} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th className={th} aria-sort={oldestFirst ? "ascending" : "descending"}>
                <button type="button" onClick={flip} title={oldestFirst ? "Oldest first: click for newest first" : "Newest first: click for oldest first"}
                  className="uppercase tracking-wider hover:text-slate-900">Time (ET) {oldestFirst ? "↑" : "↓"}</button>
              </th>
              <th className={th}>Price</th><th className={th}>Size{crypto ? ` (${symbol.split("/")[0]})` : ""}</th><th className={th}>{crypto ? "Taker" : "Venue"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.side === "buy" ? "text-emerald-700" : r.side === "sell" ? "text-rose-700" : "text-slate-700"}>
                <td className={`${td} whitespace-nowrap`}>{clockMs(r.at)}</td><td className={td}>{px(r.price)}</td><td className={td}>{sizeText(r.size)}</td>
                <td className={td}>{crypto ? (r.side === "buy" ? "Buyer" : r.side === "sell" ? "Seller" : "") : r.exchange}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="px-2 py-3 text-xs text-slate-500">
            {crypto
              ? `Waiting for ${symbol} trades. Alpaca's crypto venue is thinner than the big exchanges, so trades can be a minute or more apart while the book keeps moving.`
              : source === "eodhd" ? `Waiting for ${symbol} trades from EODHD's real-time stream, every session from 4:00 to 20:00 New York.`
                : source === "delayed_sip" ? `Waiting for ${symbol} trades from every exchange, fifteen minutes late. Pre-market starts at 4:00 New York; a thin share can go minutes between trades.`
                  : `Waiting for ${symbol} trades. The free IEX feed shows trades executed on IEX only, a small share of all trading, so the tape can be quiet; IEX trades 8:00 to 17:00 New York.`}
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

// The account's holdings. Close loads the ticket with the opposite side and
// exactly the quantity held, at market, for review (24 Oct: "close the orders
// from the quantities I have", without typing the symbol and size again).
// A working order in a few words: "sell 83 at 3.05, waiting".
export const waitingText = (o) => {
  const at = o.limit ? ` at ${px(o.limit)}` : o.stop ? ` stop ${px(o.stop)}` : " at market";
  const part = Number(o.filled) > 0 ? `, ${sizeText(o.filled)} filled` : ", waiting";
  return `${o.side} ${sizeText(o.qty)}${at}${part}`;
};

// One symbol on every account picked (28 Oct, the owner: "I keep buying and
// selling thinking that it's executing for all ... I find I keep stacking"):
// what each holds and what is still waiting there, on screen at all times.
// Amber when they are out of step: one holds and another does not, or an
// order is still waiting somewhere.
export function GroupHoldings({ symbol, rows }) {
  const held = rows.map((r) => Math.sign(Number(r.qty) || 0));
  const apart = new Set(held).size > 1;
  const waiting = rows.some((r) => r.waiting?.length);
  return (
    <div className={`flex w-full basis-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-2 py-0.5 text-xs ${apart || waiting ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
      <span className="font-semibold">{symbol} on each account{apart ? ": out of step" : ""}</span>
      {rows.map((r) => (
        <span key={r.id} className="whitespace-nowrap">
          {r.name}{r.live ? " (live)" : ""}: <b className="tabular-nums">{r.error ? "?" : `${sizeText(Math.abs(Number(r.qty) || 0))}${Number(r.qty) < 0 ? " short" : ""}`}</b>
          {r.error ? <span className="text-rose-700"> could not be read</span> : null}
          {(r.waiting || []).map((o) => <span key={o.id} className="text-amber-800"> · {waitingText(o)}</span>)}
        </span>
      ))}
    </div>
  );
}

export function Positions({ positions, others = [], onPick, onClose, onStop }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Symbol</th><th className={th}>Quantity</th><th className={th}>Avg</th><th className={th}>Last</th><th className={th}>Value</th><th className={th}>Today</th><th className={th}>Unrealized</th><th className={th} /></tr></thead>
        <tbody>
          {others.length > 0 && <tr><td colSpan={8} className="bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">This account (on screen)</td></tr>}
          {positions.map((p) => (
            <tr key={p.symbol} className="cursor-pointer whitespace-nowrap hover:bg-slate-50" onClick={() => onPick(p.symbol)}>
              <td className={`${td} font-semibold`}>{p.symbol}</td>
              <td className={td} title={p.qtyText || undefined}>{p.assetClass === "crypto" && p.qtyText ? String(Number(p.qtyText)) : sizeText(p.qty)}{p.side === "short" ? " short" : ""}</td>
              <td className={td}>{px(p.avgPrice)}</td>
              <td className={td}>{px(p.last)}</td>
              <td className={td}>{fmtMoney(p.marketValue)}</td>
              <td className={`${td} ${p.today >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.today)}</td>
              <td className={`${td} ${p.unrealized >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.unrealized)} <span className="text-slate-400">{pctText(p.unrealizedPct)}</span></td>
              <td className={`${td} space-x-1 text-right`}>
                {onStop && (
                  <button type="button" title="Put a stop loss on this position" onClick={(e) => { e.stopPropagation(); onStop(p); }}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-amber-500 hover:text-amber-700">
                    Stop
                  </button>
                )}
                {onClose && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onClose(p); }}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-rose-400 hover:text-rose-700">
                    Close
                  </button>
                )}
              </td>
            </tr>
          ))}
          {others.map((g) => (
            <OtherAccount key={g.accountId} g={g} onPick={onPick} />
          ))}
        </tbody>
      </table>
      {!positions.length && !others.length && <p className="px-2 py-3 text-xs text-slate-500">No shares or coins held in this account.</p>}
    </div>
  );
}

// An account picked beside the one on screen: what it holds, and what is
// still working there.
function OtherAccount({ g, onPick }) {
  const positions = g.positions || [];
  const working = g.orders || [];
  return (
    <>
      <tr><td colSpan={8} className="bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {g.name}{g.live ? " (live)" : ""}{g.error ? ` · could not be read: ${g.error}` : ""}{!g.error && !positions.length ? " · holds nothing" : ""}
      </td></tr>
      {positions.map((p) => {
        const mine = working.filter((o) => o.symbol === p.symbol);
        return (
          <tr key={`${g.accountId}${p.symbol}`} className="cursor-pointer whitespace-nowrap hover:bg-slate-50" onClick={() => onPick(p.symbol)}>
            <td className={`${td} font-semibold`}>{p.symbol}</td>
            <td className={td}>{p.assetClass === "crypto" && p.qtyText ? String(Number(p.qtyText)) : sizeText(p.qty)}{p.side === "short" ? " short" : ""}</td>
            <td className={td}>{px(p.avgPrice)}</td>
            <td className={td}>{px(p.last)}</td>
            <td className={td}>{fmtMoney(p.marketValue)}</td>
            <td className={`${td} ${p.today >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.today)}</td>
            <td className={`${td} ${p.unrealized >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(p.unrealized)} <span className="text-slate-400">{pctText(p.unrealizedPct)}</span></td>
            <td className={`${td} text-right text-[11px] text-amber-800`}>{mine.map(waitingText).join(" · ")}</td>
          </tr>
        );
      })}
    </>
  );
}

// Every ticked account's orders (18 Nov, the owner: "I can't see the other
// account's orders. I need to switch the accounts to see"): the same order on
// each account kept together as one block, its total above a row per account.
// A block's Change and Cancel go to every account in it (28 Oct: "any price
// changes for all accounts at once"); a row's Cancel to that account only.
// Change takes the quantity as well as the price ("there is no quantity
// change only price"): a new total, shared in the proportions the orders
// already have. A pop-up only when something was not done.
export function Orders({ accountId, name = "This account", live = false, orders, recent = [], onChanged, onPick, others = [], group = [], onNotify = () => {} }) {
  // Working orders and today's finished ones, together, by default; the
  // whole week on request ("today's order is not showing", 24 Oct).
  const [show, setShow] = useState("today");
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState({});
  const [note, setNote] = useState(null);
  const many = others.length > 0;
  const accounts = [{ accountId, name, live, orders }, ...others.map((g) => ({ accountId: g.accountId, name: g.name, live: !!g.live, orders: g.orders || [] }))];
  const blocks = orderBlocks(accounts);
  const working = accounts.reduce((sum, a) => sum + a.orders.length, 0);
  const todayNy = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const when = (o) => o.filledAt || o.updatedAt || "";
  const finishedAll = [
    ...recent.map((o) => ({ ...o, account: name, accountLive: live })),
    ...others.flatMap((g) => (g.recent || []).map((o) => ({ ...o, account: g.name, accountLive: !!g.live })))
  ].sort((x, y) => String(when(y)).localeCompare(String(when(x))));
  const today = finishedAll.filter((o) => (when(o) ? new Date(when(o)).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === todayNy : false));

  // A stop, or a stop and take profit pair, protecting what is held.
  const protective = (o) => ["stop", "stop_limit"].includes(o.type) || o.orderClass === "oco";
  const editable = (o) => (o.type === "limit" && o.orderClass !== "bracket") || (protective(o) && o.orderClass !== "bracket");
  const failed = (title, rows) => {
    const bad = rows.filter((r) => r.error);
    if (!bad.length) return;
    onNotify({
      key: `orders${Date.now()}`, tone: "bad",
      title: `${title}: not done on ${bad.length} of ${rows.length} account${rows.length === 1 ? "" : "s"}`,
      detail: bad.map((r) => `${r.name}: ${r.error}`).join(" · ")
    });
    setNote(bad.map((r) => `${r.name}: ${r.error}`).join(" · "));
  };
  const manage = (row, action, extra = {}) => invokeFunction("manageOrder", { accountId: row.accountId, orderId: row.order.id, action, ...extra })
    .then((r) => ({ name: row.name, error: r?.data?.error || null }))
    .catch((e) => ({ name: row.name, error: String(e?.message || e) }));

  const cancel = async (b, row = null) => {
    setBusy(row ? row.order.id : b.key);
    setNote(null);
    const rows = await Promise.all((row ? [row] : b.rows).map((x) => manage(x, "cancel")));
    setBusy(null);
    failed("Cancel", rows);
    onChanged?.();
  };

  // The new quantity, where it can change: not on a stop that covers what is
  // held, and not once part of it has filled (how the broker counts the filled
  // part on a change is not yet checked on paper: cancel and send the rest).
  const qtyOk = (b) => !protective(b.first) && b.rows.every((r) => r.order.qty != null && !(Number(r.order.filled) > 0));
  const plan = (b) => {
    const e = edit[b.key] || {};
    const total = e.qty !== undefined && e.qty !== "" ? Number(e.qty) : null;
    if (total === null || !qtyOk(b) || Math.abs(total - (b.qty || 0)) < 1e-12) return null;
    return resplit(b.rows, total, { crypto: isCrypto(b.symbol) });
  };

  const change = async (b) => {
    const e = edit[b.key] || {};
    const limit = e.limit !== undefined && e.limit !== "" ? Number(e.limit) : null;
    const stop = e.stop !== undefined && e.stop !== "" ? Number(e.stop) : null;
    setNote(null);
    if (protective(b.first)) {
      // A stop or a stop and target pair: set again at the new prices on
      // every account holding the symbol, each for all it holds (functions/
      // terminal "protect"), the other half of a pair kept.
      const newStop = stop !== null && stop !== b.stop ? stop : null;
      const newTarget = b.orderClass === "oco" && limit !== null && limit !== b.limit ? limit : null;
      if (newStop || newTarget) {
        setBusy(b.key);
        const kind = newStop && newTarget ? "both" : newStop ? "stop" : "target";
        const r = await invokeFunction("terminal", {
          action: "protect", accountId, symbol: b.symbol, kind, mode: "price", value: newStop ?? newTarget,
          stopPrice: newStop ?? b.stop, targetPrice: newTarget ?? b.limit, group
        }).catch((x) => ({ data: { error: String(x?.message || x) } }));
        const d = r?.data || {};
        const rows = [{ name, error: d.error || null }, ...(d.group || []).map((g) => ({ name: g.name, error: g.ok === false && !g.skip ? g.error || "refused" : null }))];
        setBusy(null);
        failed("Exits", rows);
      }
    } else {
      const newLimit = limit !== null && limit !== b.limit ? limit : null;
      const split = plan(b);
      if (split?.error) { setNote(split.error); return; }
      if (newLimit === null && !split) { setEdit((x) => ({ ...x, [b.key]: undefined })); return; }
      setBusy(b.key);
      const rows = await Promise.all(b.rows.map((row) => {
        const q = split?.rows.find((x) => x.orderId === row.order.id)?.qty;
        return manage(row, "replace", { ...(newLimit !== null ? { limitPrice: newLimit } : {}), ...(q ? { qty: q } : {}) });
      }));
      setBusy(null);
      failed("Change", rows);
    }
    setEdit((x) => ({ ...x, [b.key]: undefined }));
    onChanged?.();
  };

  const switcher = (
    <div className="flex gap-1 px-2 pt-1 text-[11px]">
      {[["today", `Working (${working}) and today (${today.length})`], ["done", `Finished, last 7 days (${finishedAll.length})`]].map(([id, label]) => (
        <button key={id} type="button" onClick={() => setShow(id)} className={`rounded px-1.5 py-0.5 ${show === id ? "bg-slate-200 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-100"}`}>{label}</button>
      ))}
      {many && <span className="ml-auto self-center text-[10px] text-slate-400">{accounts.length} accounts</span>}
    </div>
  );

  // Finished orders: what filled, at what average price, when, and where. Newest first.
  const finished = (list, title) => (
    <>
      {title && <div className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">{title}</div>}
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Time (ET)</th>{many && <th className={th}>Account</th>}<th className={th}>Symbol</th><th className={th}>Side</th><th className={th}>Filled</th><th className={th}>Avg price</th><th className={th}>Value</th><th className={th}>Status</th></tr></thead>
        <tbody>
          {list.map((o) => {
            const st = orderState(o.status);
            return (
              <tr key={o.id} className="cursor-pointer whitespace-nowrap border-t border-slate-100 hover:bg-slate-50" onClick={() => onPick?.(o.symbol)}>
                <td className={td}>{when(o) ? new Date(when(o)).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—"}</td>
                {many && <td className={`${td} max-w-[9rem] truncate text-slate-600`}>{o.account}{o.accountLive ? " (live)" : ""}</td>}
                <td className={`${td} font-semibold`}>{o.symbol}</td>
                <td className={`${td} ${o.side === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{o.side}</td>
                <td className={td}>{sizeText(o.filled)}{o.qty ? ` / ${sizeText(o.qty)}` : o.notional ? ` (${fmtMoney(o.notional)})` : ""}</td>
                <td className={td}>{o.avgPrice ? px(o.avgPrice) : "—"}</td>
                <td className={td}>{o.avgPrice && o.filled ? fmtMoney(o.avgPrice * o.filled) : "—"}</td>
                <td className={`${td} ${st.tone === "good" ? "text-emerald-700" : st.tone === "bad" ? "text-rose-700" : "text-slate-500"}`}>{st.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );

  if (show === "done") {
    return (
      <div className="h-full overflow-auto">
        {switcher}
        {finished(finishedAll, null)}
        {!finishedAll.length && <p className="px-2 py-3 text-xs text-slate-500">No finished orders in the last 7 days.</p>}
      </div>
    );
  }
  const qtyText = (o) => (o.qty === null && o.notional ? fmtMoney(o.notional) : `${o.filled ? `${sizeText(o.filled)}/` : ""}${sizeText(o.qty)}`);
  const priceText = (b) => `${b.limit ? px(b.limit) : ""}${b.stop ? ` stop ${px(b.stop)}` : ""}${!b.limit && !b.stop ? "market" : ""}`;
  const input = "w-16 rounded border px-1 py-0.5 text-right tabular-nums focus:outline-none";
  return (
    <div className="h-full overflow-auto">
      {switcher}
      {note && <p className="px-2 py-1 text-xs text-rose-700">{note}</p>}
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr><th className={th}>Symbol</th><th className={th}>Side</th><th className={th}>Qty</th><th className={th}>Type</th><th className={th}>Price</th><th className={th}>Status</th><th className={th} /></tr></thead>
        <tbody>
          {blocks.map((b) => {
            const split = b.rows.length > 1 || many;
            const statuses = [...new Set(b.rows.map((r) => r.order.status))];
            const e = edit[b.key];
            const p = e ? plan(b) : null;
            return (
              <FragmentRows key={b.key}>
                <tr className="border-t border-slate-200">
                  <td className={`${td} font-semibold`}>
                    <button type="button" className="hover:underline" onClick={() => onPick?.(b.symbol)}>{b.symbol}</button>
                    {b.orderClass === "bracket" ? <span className="ml-1 text-[10px] font-normal text-slate-400">bracket</span> : null}
                  </td>
                  <td className={`${td} ${b.side === "buy" ? "text-emerald-700" : "text-rose-700"}`}>{b.side}</td>
                  <td className={td}>{b.qty === null && b.notional ? fmtMoney(b.notional) : `${b.filled ? `${sizeText(b.filled)}/` : ""}${sizeText(b.qty)}`}</td>
                  <td className={td}>{String(b.type).replace("_", " ")} · {b.tif}</td>
                  <td className={td}>{priceText(b)}</td>
                  <td className={td}>{statuses.length === 1 ? statuses[0].replace("_", " ") : ""}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {editable(b.first) && !e && (
                      <button type="button" className="mr-2 text-slate-600 hover:underline"
                        onClick={() => setEdit((x) => ({ ...x, [b.key]: { limit: b.limit != null ? String(b.limit) : "", stop: b.stop != null ? String(b.stop) : "", qty: b.qty != null ? String(b.qty) : "" } }))}>Change</button>
                    )}
                    <button type="button" disabled={busy === b.key} className="text-rose-700 hover:underline" onClick={() => cancel(b)}>
                      {busy === b.key ? "…" : b.rows.length > 1 ? `Cancel on all ${b.rows.length}` : "Cancel"}
                    </button>
                  </td>
                </tr>
                {e && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-2 py-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {(b.type === "limit" || b.limit != null) && (
                          <label className="flex items-center gap-1">{protective(b.first) ? "Target" : "Price"}
                            <input aria-label="Limit price" className={`${input} border-slate-300`} inputMode="decimal" value={e.limit ?? ""}
                              onChange={(ev) => setEdit((x) => ({ ...x, [b.key]: { ...x[b.key], limit: ev.target.value.replace(/[^\d.]/g, "") } }))} />
                          </label>
                        )}
                        {protective(b.first) && (
                          <label className="flex items-center gap-1">Stop
                            <input aria-label="Stop price" className={`${input} border-amber-300`} inputMode="decimal" value={e.stop ?? ""}
                              onChange={(ev) => setEdit((x) => ({ ...x, [b.key]: { ...x[b.key], stop: ev.target.value.replace(/[^\d.]/g, "") } }))} />
                          </label>
                        )}
                        {qtyOk(b) ? (
                          <label className="flex items-center gap-1">{b.rows.length > 1 ? "Shares in all" : "Shares"}
                            <input aria-label="Quantity" className={`${input} border-slate-300`} inputMode="decimal" value={e.qty ?? ""}
                              onChange={(ev) => setEdit((x) => ({ ...x, [b.key]: { ...x[b.key], qty: ev.target.value.replace(/[^\d.]/g, "") } }))} />
                          </label>
                        ) : (
                          <span className="text-slate-500">{protective(b.first) ? "A stop covers what is held: price only." : "Part filled: price only. To change the size, cancel and send the rest again."}</span>
                        )}
                        {p?.rows && b.rows.length > 1 && <span className="text-slate-600">→ {p.rows.map((x) => `${x.name} ${sizeText(x.qty)}`).join(" · ")}</span>}
                        {p?.error && <span className="text-rose-700">{p.error}</span>}
                        <span className="ml-auto flex gap-2">
                          <button type="button" disabled={busy === b.key || !!p?.error} className="font-medium text-emerald-700 hover:underline disabled:opacity-50" onClick={() => change(b)}>
                            {busy === b.key ? "Sending…" : b.rows.length > 1 ? `Send to all ${b.rows.length}` : "Send"}
                          </button>
                          <button type="button" className="text-slate-500 hover:underline" onClick={() => setEdit((x) => ({ ...x, [b.key]: undefined }))}>Back</button>
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {split && b.rows.map((r) => (
                  <tr key={r.order.id} className="text-slate-600">
                    <td className={`${td} max-w-[10rem] truncate pl-5`} colSpan={2}>{r.name}{r.live ? " (live)" : ""}{r.accountId === accountId && many ? <span className="text-slate-400"> on screen</span> : null}</td>
                    <td className={td}>{qtyText(r.order)}</td>
                    <td className={td} />
                    <td className={td}>{r.order.limit !== b.limit || stopOf(r.order) !== b.stop ? priceText({ limit: r.order.limit, stop: stopOf(r.order) }) : ""}</td>
                    <td className={td}>{String(r.order.status).replace("_", " ")}</td>
                    <td className={`${td} text-right`}>
                      {b.rows.length > 1 && (
                        <button type="button" disabled={busy === r.order.id} className="text-rose-700/80 hover:underline" onClick={() => cancel(b, r)}>{busy === r.order.id ? "…" : "Cancel"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
      {!working && <p className="px-2 py-3 text-xs text-slate-500">No working orders{many ? " on the ticked accounts" : ""}.</p>}
      {today.length > 0 && finished(today, "Today")}
    </div>
  );
}

// Several table rows under one key.
function FragmentRows({ children }) {
  return <>{children}</>;
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
