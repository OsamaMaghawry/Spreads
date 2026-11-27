import { useCallback, useMemo, useState } from "react";
import { sizeText } from "@/lib/terminal";
import { positionExits } from "@/lib/phoneOrder";
import { protectiveOrder, editableOrder } from "./orderActions";
import { PendingBar } from "./phone/phoneParts";
import { sendExits, sendOrderChange, exitsText, orderText } from "./phone/PhoneLists";

/**
 * The chart's position, stop, target and working limit orders with handles to
 * drag them (TradeLines.jsx), on the phone and the desktop alike (27 Nov, the
 * owner: "You haven't put the TP & SL on the desktop as the phone?!"). A drag
 * changes nothing at the broker: it waits on screen, "Not sent yet", until
 * Confirm change (functions/terminal "protect" for exits, orderActions.js for
 * an order), the same paths as the position and order cards.
 *
 * `blocks`: the working order blocks (lib/accountGroup.js orderBlocks);
 * `to`: the names of the accounts orders go to. Returns the lines and the
 * drag handler for PriceChart, the waiting changes (shared with the cards),
 * and `pending`, the Confirm change bars to show under the chart.
 */
export default function useTradeLines({ symbol, view, blocks, getCtx, notify, refresh, to = [], off = false }) {
  const [posPend, setPosPend] = useState({});
  const [ordPend, setOrdPend] = useState({});
  const position = (view?.positions || []).find((p) => p.symbol === symbol);
  const exits = useMemo(() => (position ? positionExits(view?.orders, symbol, position.side === "short") : { stop: null, target: null }), [position, view?.orders, symbol]);
  const myBlocks = useMemo(() => blocks.filter((b) => b.symbol === symbol && editableOrder(b.first) && !protectiveOrder(b.first) && b.limit != null), [blocks, symbol]);
  const pd = posPend[symbol];
  const pdKey = JSON.stringify(pd || {});
  const odKey = JSON.stringify(myBlocks.map((b) => [b.key, b.limit, b.qty, ordPend[b.key]?.limit]));
  const tradeLines = useMemo(() => {
    const out = [];
    const d = pd || {};
    if (position) {
      const stop = d.stop !== undefined ? d.stop : exits.stop;
      const target = d.target !== undefined ? d.target : exits.target;
      out.push({ id: "avg", price: position.avgPrice, color: "#64748b", title: `${position.side === "short" ? "Short" : "Long"} ${sizeText(Math.abs(position.qty))}` });
      out.push(stop ? { id: "stop", price: stop, color: "#be123c", title: `Stop${d.stop !== undefined ? " · not sent" : ""}`, draggable: true, label: "SL", slot: 0, pending: d.stop !== undefined }
        : { id: "stop", price: position.avgPrice, color: "#be123c", draggable: true, handleOnly: true, label: "SL", slot: 0 });
      out.push(target ? { id: "target", price: target, color: "#047857", title: `Target${d.target !== undefined ? " · not sent" : ""}`, draggable: true, label: "TP", slot: 1, pending: d.target !== undefined }
        : { id: "target", price: position.avgPrice, color: "#047857", draggable: true, handleOnly: true, label: "TP", slot: 1 });
    }
    for (const b of myBlocks) {
      const lp = ordPend[b.key]?.limit;
      out.push({ id: `o:${b.key}`, price: lp ?? b.limit, color: "#534AB7", title: `${b.side === "buy" ? "Buy" : "Sell"} ${b.qty != null ? sizeText(b.qty) : ""}${lp !== undefined ? " · not sent" : ""}`, draggable: true, label: "⇕", slot: 0, pending: lp !== undefined });
    }
    return out;
    // Built again only when what it shows changes, not on every quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.avgPrice, position?.qty, position?.side, exits.stop, exits.target, pdKey, odKey]);
  const onLineMove = useCallback((line, price) => {
    if (line.id === "stop" || line.id === "target") setPosPend((x) => ({ ...x, [symbol]: { ...(x[symbol] || {}), [line.id]: price } }));
    else if (line.id.startsWith("o:")) { const key = line.id.slice(2); setOrdPend((x) => ({ ...x, [key]: { ...(x[key] || {}), limit: price } })); }
  }, [symbol]);
  const dropPos = (s) => setPosPend((x) => { const n = { ...x }; delete n[s]; return n; });
  const dropOrd = (k) => setOrdPend((x) => { const n = { ...x }; delete n[k]; return n; });
  const waiting = !off && ((pd && position) || myBlocks.some((b) => ordPend[b.key]));
  const pending = waiting ? (
    <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-3 py-2">
      {pd && position && <PendingBar text={`${symbol} ${exitsText(exits, pd)}${to.length > 1 ? ` · on ${to.length} accounts` : ""}`} onUndo={() => dropPos(symbol)}
        onConfirm={() => { const d = pd; dropPos(symbol); return sendExits({ symbol, cur: exits, d, getCtx, notify, refresh }); }} />}
      {myBlocks.filter((b) => ordPend[b.key]).map((b) => (
        <PendingBar key={b.key} text={`${symbol} ${orderText(b, ordPend[b.key])}`} onUndo={() => dropOrd(b.key)}
          onConfirm={() => { const d = ordPend[b.key]; dropOrd(b.key); return sendOrderChange({ b, d, getCtx, notify, refresh }); }} />
      ))}
    </div>
  ) : null;
  return { tradeLines: off ? null : tradeLines, onLineMove, pending, posPend, setPosPend, ordPend, setOrdPend };
}
