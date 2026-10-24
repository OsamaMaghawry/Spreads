import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, isCrypto, amountToQty, orderState } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";

// The ticket, for shares and coins. Two steps, review then send, like a desk
// ticket's transmit: nothing goes to the broker on the first click. The server
// checks every rule again (stockOrder.ts, cryptoOrder.ts) and refuses live
// accounts during the test.
//
// A coin trades in fractions, around the clock, with market, limit and
// stop-limit orders only, good till cancelled or immediate-or-cancel, never
// short, and with no take-profit/stop-loss bracket; the ticket offers only
// what the broker accepts for the symbol in front of it.
//
// A size in dollars as well as in shares or coins (24 Oct: "I need to add a
// dollar value"). A market order goes to Alpaca as the dollar amount itself
// (for a stock, only if it trades in fractions; Alpaca fills those for the
// day only); a limit or stop order becomes the quantity the amount buys at
// its price. And once sent, the ticket follows the order to the end ("it
// should say something different after the order is placed or executed"):
// working, filled at what price, or cancelled, with a cancel button while it
// works.

const STOCK_TYPES = [
  ["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["stop_limit", "Stop limit"]
];
const CRYPTO_TYPES = [["market", "Market"], ["limit", "Limit"], ["stop_limit", "Stop limit"]];
const TIF_TEXT = { day: "for the day", gtc: "good till cancelled", ioc: "immediate or cancel" };
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none";
const label = "mb-1 block text-[11px] uppercase tracking-wider text-slate-500";

export default function OrderTicket({ account, symbol, quote, held = 0, buyingPower = null, onPlaced, pick = null }) {
  const crypto = isCrypto(symbol);
  const TYPES = crypto ? CRYPTO_TYPES : STOCK_TYPES;
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
  const [asset, setAsset] = useState(null);
  const [unit, setUnit] = useState("qty");
  const [amount, setAmount] = useState("");
  const [tracked, setTracked] = useState(null);

  // A new symbol starts a new ticket, priced at the side it would trade, with
  // only the choices its market has.
  useEffect(() => {
    setLimit(""); setStop(""); setTp(""); setSl(""); setReview(false); setResult(null);
    setAsset(null);
    if (isCrypto(symbol)) {
      setType((t) => (t === "stop" ? "stop_limit" : t));
      setTif((t) => (t === "day" ? "gtc" : t));
      setExtended(false);
      setBracket(false);
      setQty("");
    } else {
      setTif((t) => (t === "ioc" ? "day" : t));
      setQty((q) => (q && Number.isInteger(Number(q)) ? q : "1"));
    }
  }, [symbol]);

  // The symbol's minimum order, steps and whether it trades in fractions,
  // from the broker's asset list.
  useEffect(() => {
    if (!account?.id) return undefined;
    let alive = true;
    invokeFunction("terminal", { action: "asset", accountId: account.id, symbol }).then((r) => {
      if (alive) setAsset(r?.data?.asset || null);
    });
    return () => { alive = false; };
  }, [account?.id, symbol]);

  // The sent order, followed until it is filled, cancelled or refused: every
  // second at first, then every five while a limit order rests.
  useEffect(() => {
    if (!tracked?.id || !account?.id) return undefined;
    let alive = true;
    let polls = 0;
    let timer = null;
    const tick = async () => {
      const r = await invokeFunction("terminal", { action: "orderStatus", accountId: account.id, orderId: tracked.id });
      if (!alive) return;
      const o = r?.data?.order;
      if (o) {
        setTracked((cur) => (cur && cur.id === o.id ? { ...cur, ...o } : cur));
        if (o.status === "filled" || o.status === "partially_filled" || orderState(o.status).final) onPlaced?.();
      }
      polls += 1;
      if (!o || !orderState(o.status).final) timer = setTimeout(tick, polls < 15 ? 1000 : 5000);
    };
    timer = setTimeout(tick, 500);
    return () => { alive = false; clearTimeout(timer); };
    // Once per order; the loop above carries on until it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked?.id, account?.id]);

  // A price clicked in the order book or elsewhere becomes the limit price.
  useEffect(() => {
    if (!pick?.price) return;
    setLimit(px(pick.price));
    setType((t) => (t === "market" ? "limit" : t === "stop" ? "stop_limit" : t));
    setReview(false);
  }, [pick]);
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
  const coin = crypto ? symbol.split("/")[0] : "";
  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const ref = side === "buy" ? quote?.ask ?? quote?.last : quote?.bid ?? quote?.last;
  const at = needsLimit ? Number(limit) : type === "stop" ? Number(stop) : ref;
  // In dollars: a market order sends the amount itself where the broker
  // takes one; anything else becomes a quantity at the order's price.
  const dollars = unit === "usd" ? Number(amount) || 0 : 0;
  const notional = unit === "usd" && type === "market" && (crypto || !!asset?.fractionable);
  const n = unit === "usd"
    ? (notional ? (ref ? dollars / ref : 0) : amountToQty(dollars, at, { crypto, step: asset?.minTradeIncrement }))
    : crypto ? Number(qty) || 0 : Math.floor(Number(qty)) || 0;
  const belowMin = crypto && !notional && n > 0 && asset?.minOrderSize && n < asset.minOrderSize;
  const value = notional ? dollars : at && n ? at * n : null;
  const short = side === "sell" && n > Math.max(0, held) + 1e-12;
  const overBp = side === "buy" && value !== null && buyingPower !== null && value > buyingPower;
  const sized = notional ? dollars >= 1 : n > 0;
  const ready = paper && symbol && sized && !belowMin && !(crypto && short) &&
    (!needsLimit || Number(limit) > 0) && (!needsStop || Number(stop) > 0) && (!bracket || (Number(tp) > 0 && Number(sl) > 0));
  // A stock's dollar-amount order is a market order for the day, in regular hours, without exits.
  useEffect(() => {
    if (notional && !crypto) { setTif("day"); setExtended(false); setBracket(false); }
  }, [notional, crypto]);

  const words = (notional
    ? `${side === "buy" ? "Buy" : "Sell"} ${fmtMoney(dollars)} of ${symbol} `
    : `${side === "buy" ? "Buy" : "Sell"} ${n ? sizeText(n) : "?"} ${crypto ? coin : symbol || ""} `) +
    (type === "market" ? "at market" : type === "limit" ? `limit ${px(limit)}` : type === "stop" ? `stop ${px(stop)}` : `stop ${px(stop)}, limit ${px(limit)}`) +
    `, ${TIF_TEXT[tif] || TIF_TEXT.day}${extended ? ", including pre-market and after hours" : ""}` +
    (bracket ? `, then take profit at ${px(tp)} or stop out at ${px(sl)}` : "");

  const send = async () => {
    setBusy(true);
    setResult(null);
    const r = await invokeFunction("terminal", {
      action: "order", accountId: account.id,
      order: {
        symbol, side, qty: notional ? null : n, notional: notional ? dollars : null, type, timeInForce: tif, extendedHours: extended,
        limitPrice: needsLimit ? limit : null, stopPrice: needsStop ? stop : null,
        takeProfit: bracket ? tp : null, stopLoss: bracket ? sl : null, reference: ref ?? null
      }
    });
    setBusy(false);
    setReview(false);
    if (r?.data?.error) setResult({ ok: false, text: r.data.error });
    else {
      setTracked({ id: r?.data?.orderId, status: r?.data?.status || "new", words, symbol, side, unitName: crypto ? coin : "shares" });
      onPlaced?.();
    }
  };
  const cancelTracked = async () => {
    if (!tracked?.id) return;
    const r = await invokeFunction("manageOrder", { accountId: account.id, orderId: tracked.id, action: "cancel" });
    if (r?.data?.error) setResult({ ok: false, text: r.data.error });
    setTracked((cur) => (cur ? { ...cur, status: "pending_cancel" } : cur));
  };

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
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-[11px] uppercase tracking-wider text-slate-500" htmlFor="t-qty">{unit === "usd" ? "Amount ($)" : crypto ? `Quantity (${coin})` : "Shares"}</label>
            <div className="flex overflow-hidden rounded border border-slate-200 text-[10px]" role="group" aria-label="Size in">
              {[["qty", crypto ? coin : "Shares"], ["usd", "$"]].map(([id, name]) => (
                <button key={id} type="button" onClick={() => { setUnit(id); setReview(false); }} className={`px-1.5 ${unit === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
              ))}
            </div>
          </div>
          {unit === "usd" ? (
            <input id="t-qty" className={input} inputMode="decimal" value={amount} placeholder="e.g. 500"
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")); setReview(false); }} />
          ) : (
            <input id="t-qty" className={input} inputMode={crypto ? "decimal" : "numeric"} value={qty} placeholder={crypto && asset?.minOrderSize ? `min ${asset.minOrderSize}` : ""}
              onChange={(e) => { setQty(crypto ? e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1") : e.target.value.replace(/[^\d]/g, "")); setReview(false); }} />
          )}
          {unit === "usd" && dollars > 0 && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              {notional ? `Sent as ${fmtMoney(dollars)}; about ${sizeText(n)} ${crypto ? coin : "shares"} at ${px(ref)}`
                : n > 0 ? `= ${sizeText(n)} ${crypto ? coin : n === 1 ? "share" : "shares"} at ${px(at)}`
                  : at ? `Less than one ${crypto ? "step" : "share"} at ${px(at)}` : "Enter a price"}
            </p>
          )}
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
            {!crypto && <option value="day">Day</option>}
            <option value="gtc">Good till cancelled</option>
            {crypto && <option value="ioc">Immediate or cancel</option>}
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

      {!crypto && (
      <label className={`flex items-center gap-2 text-xs ${type === "limit" && tif === "day" ? "text-slate-700" : "text-slate-400"}`}>
        <input type="checkbox" checked={extended} disabled={!(type === "limit" && tif === "day") || bracket} onChange={(e) => { setExtended(e.target.checked); setReview(false); }} />
        Pre-market and after hours (day limit orders only)
      </label>
      )}

      {!crypto && (
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
      )}

      <div className="space-y-1 text-xs text-slate-600">
        <div className="flex justify-between"><span>Estimated {side === "buy" ? "cost" : "proceeds"}</span><span className="tabular-nums">{value ? fmtMoney(value) : "—"}</span></div>
        <div className="flex justify-between"><span>Buying power</span><span className="tabular-nums">{buyingPower !== null ? fmtMoney(buyingPower) : "—"}</span></div>
        <div className="flex justify-between"><span>You hold</span><span className="tabular-nums">{sizeText(held)} {crypto ? coin : "shares"}</span></div>
        {crypto && asset?.minOrderSize ? <div className="flex justify-between"><span>Smallest order</span><span className="tabular-nums">{asset.minOrderSize} {coin}</span></div> : null}
      </div>

      {!paper && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Orders go to paper accounts only during this test. Choose a paper account to trade.</p>}
      {short && !crypto && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {Math.max(0, held)} shares, so this sells {n - Math.max(0, held)} you do not own: a short sale.</p>}
      {short && crypto && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {sizeText(Math.max(0, held))} {coin}. Crypto cannot be sold short, so a sale is limited to what you hold.</p>}
      {belowMin && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">The smallest {symbol} order is {asset.minOrderSize} {coin}.</p>}
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
      {tracked && <OrderCard order={tracked} onCancel={cancelTracked} onClose={() => setTracked(null)} />}
    </div>
  );
}

const TONES = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  wait: "border-sky-200 bg-sky-50 text-sky-900",
  bad: "border-rose-300 bg-rose-50 text-rose-900",
  muted: "border-slate-200 bg-slate-50 text-slate-700"
};

// The sent order, as it stands: what was asked, what filled and at what price.
function OrderCard({ order, onCancel, onClose }) {
  const state = orderState(order.status);
  const filled = Number(order.filled) || 0;
  const bought = order.side === "buy" ? "Bought" : "Sold";
  const unitName = order.unitName || "";
  return (
    <div className={`space-y-1 rounded-lg border p-2 text-xs ${TONES[state.tone]}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{state.label}{state.final ? "" : "…"}</span>
        <span className="text-[10px] opacity-70">{order.updatedAt || order.filledAt ? new Date(order.filledAt || order.updatedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " ET" : ""}</span>
      </div>
      <p>{order.words}.</p>
      {filled > 0 && order.avgPrice ? (
        <p className="font-medium tabular-nums">
          {bought} {sizeText(filled)} {unitName} at {px(order.avgPrice)} average · {fmtMoney(filled * order.avgPrice)}
          {order.status === "partially_filled" && order.qty ? ` (${sizeText(filled)} of ${sizeText(order.qty)})` : ""}
        </p>
      ) : !state.final ? <p className="opacity-80">Sent to Alpaca; waiting to fill.</p> : null}
      {order.status === "rejected" && <p>Alpaca refused the order. Check the price and size, or the account's buying power.</p>}
      <div className="flex gap-2 pt-1">
        {!state.final && order.status !== "pending_cancel" && (
          <button type="button" onClick={onCancel} className="rounded border border-current px-2 py-0.5 hover:bg-white/60">Cancel order</button>
        )}
        <button type="button" onClick={onClose} className="ml-auto rounded px-2 py-0.5 underline-offset-2 hover:underline">{state.final ? "Done" : "Hide"}</button>
      </div>
    </div>
  );
}
