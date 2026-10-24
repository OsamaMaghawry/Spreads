import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The share ticket. Two steps, review then send, like a desk ticket's
// transmit: nothing goes to the broker on the first click. The server checks
// every rule again (stockOrder.ts) and refuses live accounts during the test.

const TYPES = [
  ["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["stop_limit", "Stop limit"]
];
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none";
const label = "mb-1 block text-[11px] uppercase tracking-wider text-slate-500";

export default function OrderTicket({ account, symbol, quote, held = 0, buyingPower = null, onPlaced }) {
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("1");
  const [type, setType] = useState("limit");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  const [tif, setTif] = useState("day");
  const [extended, setExtended] = useState(false);
  const [bracket, setBracket] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // A new symbol starts a new ticket, priced at the side it would trade.
  useEffect(() => {
    setLimit(""); setStop(""); setTp(""); setSl(""); setReview(false); setResult(null);
  }, [symbol]);
  // Filled once per symbol and side, when the first quote arrives; after that
  // the field is the trader's, even if they clear it to type.
  const filledFor = useRef(null);
  useEffect(() => {
    const k = `${symbol}|${side}`;
    if (filledFor.current === k || !quote) return;
    const p = side === "buy" ? quote.ask ?? quote.last : quote.bid ?? quote.last;
    if (p) { setLimit(px(p)); filledFor.current = k; }
  }, [quote, side, symbol]);

  const paper = account?.type === "Paper";
  const n = Math.floor(Number(qty)) || 0;
  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const ref = side === "buy" ? quote?.ask ?? quote?.last : quote?.bid ?? quote?.last;
  const at = needsLimit ? Number(limit) : type === "stop" ? Number(stop) : ref;
  const value = at && n ? at * n : null;
  const short = side === "sell" && n > Math.max(0, held);
  const overBp = side === "buy" && value !== null && buyingPower !== null && value > buyingPower;
  const ready = paper && symbol && n > 0 && (!needsLimit || Number(limit) > 0) && (!needsStop || Number(stop) > 0) && (!bracket || (Number(tp) > 0 && Number(sl) > 0));

  const send = async () => {
    setBusy(true);
    setResult(null);
    const r = await invokeFunction("terminal", {
      action: "order", accountId: account.id,
      order: {
        symbol, side, qty: n, type, timeInForce: tif, extendedHours: extended,
        limitPrice: needsLimit ? limit : null, stopPrice: needsStop ? stop : null,
        takeProfit: bracket ? tp : null, stopLoss: bracket ? sl : null, reference: ref ?? null
      }
    });
    setBusy(false);
    setReview(false);
    if (r?.data?.error) setResult({ ok: false, text: r.data.error });
    else {
      setResult({ ok: true, text: `Sent: ${side} ${n} ${symbol}. Status: ${r?.data?.status || "new"}.` });
      onPlaced?.();
    }
  };

  const words = `${side === "buy" ? "Buy" : "Sell"} ${n || "?"} ${symbol || ""} ` +
    (type === "market" ? "at market" : type === "limit" ? `limit ${px(limit)}` : type === "stop" ? `stop ${px(stop)}` : `stop ${px(stop)}, limit ${px(limit)}`) +
    `, ${tif === "gtc" ? "good till cancelled" : "for the day"}${extended ? ", including pre-market and after hours" : ""}` +
    (bracket ? `, then take profit at ${px(tp)} or stop out at ${px(sl)}` : "");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {["buy", "sell"].map((s) => (
          <button key={s} type="button" onClick={() => { setSide(s); setLimit(""); setReview(false); }}
            className={`rounded-md py-1.5 text-sm font-semibold ${side === s ? (s === "buy" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-slate-600"}`}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="t-qty">Shares</label>
          <input id="t-qty" className={input} inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value.replace(/[^\d]/g, "")); setReview(false); }} />
        </div>
        <div>
          <label className={label} htmlFor="t-type">Type</label>
          <select id="t-type" className={input} value={type} onChange={(e) => { setType(e.target.value); setReview(false); if (e.target.value !== "limit") setExtended(false); }}>
            {TYPES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        {needsStop && (
          <div>
            <label className={label} htmlFor="t-stop">Stop price</label>
            <input id="t-stop" className={input} inputMode="decimal" value={stop} onChange={(e) => { setStop(e.target.value); setReview(false); }} />
          </div>
        )}
        {needsLimit && (
          <div>
            <label className={label} htmlFor="t-limit">Limit price</label>
            <input id="t-limit" className={input} inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setReview(false); }} />
          </div>
        )}
        <div>
          <label className={label} htmlFor="t-tif">Time in force</label>
          <select id="t-tif" className={input} value={tif} onChange={(e) => { setTif(e.target.value); setReview(false); if (e.target.value !== "day") setExtended(false); }}>
            <option value="day">Day</option>
            <option value="gtc">Good till cancelled</option>
          </select>
        </div>
      </div>

      {quote && (
        <div className="flex gap-2 text-[11px]">
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.bid))}>Bid {px(quote.bid)}</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.bid != null && quote.ask != null ? (quote.bid + quote.ask) / 2 : quote.last))}>Mid</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.ask))}>Ask {px(quote.ask)}</button>
        </div>
      )}

      <label className={`flex items-center gap-2 text-xs ${type === "limit" && tif === "day" ? "text-slate-700" : "text-slate-400"}`}>
        <input type="checkbox" checked={extended} disabled={!(type === "limit" && tif === "day") || bracket} onChange={(e) => { setExtended(e.target.checked); setReview(false); }} />
        Pre-market and after hours (day limit orders only)
      </label>

      <div className="rounded-lg border border-slate-200 p-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={bracket} disabled={!(type === "market" || type === "limit") || extended} onChange={(e) => { setBracket(e.target.checked); setReview(false); }} />
          Attach take-profit and stop-loss
        </label>
        {bracket && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="t-tp">Take profit</label>
              <input id="t-tp" className={input} inputMode="decimal" value={tp} onChange={(e) => { setTp(e.target.value); setReview(false); }} />
            </div>
            <div>
              <label className={label} htmlFor="t-sl">Stop loss</label>
              <input id="t-sl" className={input} inputMode="decimal" value={sl} onChange={(e) => { setSl(e.target.value); setReview(false); }} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs text-slate-600">
        <div className="flex justify-between"><span>Estimated {side === "buy" ? "cost" : "proceeds"}</span><span className="tabular-nums">{value ? fmtMoney(value) : "—"}</span></div>
        <div className="flex justify-between"><span>Buying power</span><span className="tabular-nums">{buyingPower !== null ? fmtMoney(buyingPower) : "—"}</span></div>
        <div className="flex justify-between"><span>You hold</span><span className="tabular-nums">{held} shares</span></div>
      </div>

      {!paper && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Orders go to paper accounts only during this test. Choose a paper account to trade.</p>}
      {short && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {Math.max(0, held)} shares, so this sells {n - Math.max(0, held)} you do not own: a short sale.</p>}
      {overBp && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">This is more than the account's buying power; the broker will likely refuse it.</p>}

      {review ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2">
          <p className="text-sm text-slate-800">{words}.</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy}
              className={`flex-1 rounded-md py-2 text-sm font-semibold text-white disabled:opacity-50 ${side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
              {busy ? "Sending…" : "Send order"}
            </button>
            <button type="button" onClick={() => setReview(false)} className="rounded-md border border-slate-300 px-3 text-sm text-slate-600">Edit</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => setReview(true)}
          className={`w-full rounded-md py-2 text-sm font-semibold text-white disabled:opacity-40 ${side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
          Review {side === "buy" ? "buy" : "sell"}
        </button>
      )}
      {result && <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.text}</p>}
    </div>
  );
}
