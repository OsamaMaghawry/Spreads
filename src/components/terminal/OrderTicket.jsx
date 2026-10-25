import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, isCrypto, amountToQty, orderState, orderNews } from "@/lib/terminal";
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
  ["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["stop_limit", "Stop limit"], ["trailing_stop", "Trailing stop"]
];
const CRYPTO_TYPES = [["market", "Market"], ["limit", "Limit"], ["stop_limit", "Stop limit"]];
const TIF_TEXT = { day: "for the day", gtc: "good till cancelled", ioc: "immediate or cancel" };
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none";
const label = "mb-1 block text-[11px] uppercase tracking-wider text-slate-500";

export default function OrderTicket({ account, symbol, quote, held = 0, heldText = "", buyingPower = null, onPlaced, pick = null, preset = null, onNotify = () => {} }) {
  const crypto = isCrypto(symbol);
  const TYPES = crypto ? CRYPTO_TYPES : STOCK_TYPES;
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("1");
  const [type, setType] = useState("limit");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  // A trailing stop follows the price by a percentage or by dollars.
  const [trail, setTrail] = useState("2");
  const [trailBy, setTrailBy] = useState("pct");
  const [tif, setTif] = useState("day");
  const [extended, setExtended] = useState(false);
  const [bracket, setBracket] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asset, setAsset] = useState(null);
  const [unit, setUnit] = useState("qty");
  const [amount, setAmount] = useState("");
  const [tracked, setTracked] = useState(null);
  const trackedRef = useRef(null);

  // A new symbol starts a new ticket, priced at the side it would trade, with
  // only the choices its market has.
  useEffect(() => {
    setLimit(""); setStop(""); setTp(""); setSl(""); setReview(false);
    setAsset(null);
    if (isCrypto(symbol)) {
      setType((t) => (t === "stop" || t === "trailing_stop" ? "stop_limit" : t));
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
      const cur = trackedRef.current;
      if (o && cur && cur.id === o.id) {
        const next = { ...cur, ...o };
        // The pop-up follows the order; once it is over, the ticket lets go of it.
        if (cur.status !== o.status || cur.filled !== o.filled) onNotify({ key: cur.key, ...orderNews(next) });
        trackedRef.current = orderState(o.status).final ? null : next;
        setTracked(trackedRef.current);
        if (o.status === "filled" || o.status === "partially_filled" || orderState(o.status).final) onPlaced?.();
      }
      polls += 1;
      // Every second for the first half minute, then every five; a resting
      // order is left to the Orders tab after ten minutes.
      if ((!o || !orderState(o.status).final) && polls < 135) timer = setTimeout(tick, polls < 30 ? 1000 : 5000);
    };
    timer = setTimeout(tick, 500);
    return () => { alive = false; clearTimeout(timer); };
    // Once per order; the loop above carries on until it ends.
    // (onNotify and onPlaced are steady callbacks from the page.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked?.id, account?.id]);

  // A price clicked in the order book or elsewhere becomes the limit price.
  useEffect(() => {
    if (!pick?.price) return;
    setLimit(px(pick.price));
    setType((t) => (t === "market" ? "limit" : t === "stop" ? "stop_limit" : t));
    setReview(false);
  }, [pick]);
  // Closing a position from the Positions tab: the opposite side, exactly the
  // quantity held, at market, waiting for review. Applied once the ticket has
  // switched to the position's symbol (the symbol change above clears it).
  const appliedPreset = useRef(null);
  useEffect(() => {
    if (!preset || preset.symbol !== symbol || appliedPreset.current === preset.at) return;
    appliedPreset.current = preset.at;
    setSide(preset.side);
    setUnit("qty");
    setQty(preset.qtyText);
    setExtended(false);
    setBracket(false);
    // A stop for a position (its Stop button): the stop price filled in, to
    // adjust before review; a coin's as a stop-limit, its limit 1% past.
    if (preset.type === "stop") {
      const coin = isCrypto(symbol);
      setType(coin ? "stop_limit" : "stop");
      setStop(px(preset.stopPrice));
      if (coin) setLimit(px(preset.stopPrice * (preset.side === "sell" ? 0.99 : 1.01)));
      setTif(coin || Number.isInteger(Number(preset.qtyText)) ? "gtc" : "day");
      setReview(false);
      return;
    }
    setType("market");
    setTif(isCrypto(symbol) ? "gtc" : "day");
    setReview(true);
  }, [preset, symbol]);
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
  const needsTrail = type === "trailing_stop";
  const ref = side === "buy" ? quote?.ask ?? quote?.last : quote?.bid ?? quote?.last;
  const at = needsLimit ? Number(limit) : type === "stop" ? Number(stop) : ref;
  // In dollars: a market order sends the amount itself where the broker
  // takes one; anything else becomes a quantity at the order's price.
  const dollars = unit === "usd" ? Number(amount) || 0 : 0;
  const notional = unit === "usd" && type === "market" && (crypto || !!asset?.fractionable);
  const typed = unit === "usd"
    ? (notional ? (ref ? dollars / ref : 0) : amountToQty(dollars, at, { crypto, step: asset?.minTradeIncrement }))
    : crypto ? Number(qty) || 0 : Math.floor(Number(qty)) || 0;
  // A sale typed as the holding shown, rounded for display, is the holding:
  // 0.49875 on screen is 0.498749999 at the broker.
  const sellAll = side === "sell" && held > 0 && typed > held && typed - held < 1e-8;
  const n = sellAll ? held : typed;
  const belowMin = crypto && !notional && n > 0 && asset?.minOrderSize && n < asset.minOrderSize;
  // A leftover smaller than the coin's smallest order (about $1 at Alpaca)
  // cannot be sold by itself: say so once, rather than offer a sale that fails.
  const dust = crypto && held > 0 && asset?.minOrderSize && held < asset.minOrderSize;
  const minDollars = asset?.minOrderSize && ref ? asset.minOrderSize * ref : null;
  const value = notional ? dollars : at && n ? at * n : null;
  const short = side === "sell" && n > Math.max(0, held) + 1e-12;
  const overBp = side === "buy" && value !== null && buyingPower !== null && value > buyingPower;
  const sized = notional ? dollars >= 1 : n > 0;
  const ready = paper && symbol && sized && !belowMin && !(crypto && short) &&
    (!needsLimit || Number(limit) > 0) && (!needsStop || Number(stop) > 0) && (!needsTrail || Number(trail) > 0) && (!bracket || (Number(tp) > 0 && Number(sl) > 0));
  // A stock's dollar-amount order is a market order for the day, in regular hours, without exits.
  useEffect(() => {
    if (notional && !crypto) { setTif("day"); setExtended(false); setBracket(false); }
  }, [notional, crypto]);

  // Selling the whole holding sends the broker's exact quantity; say that one.
  const exactSale = !notional && side === "sell" && !!heldText && (sellAll || Number(qty) === held);
  const words = (notional
    ? `${side === "buy" ? "Buy" : "Sell"} ${fmtMoney(dollars)} of ${symbol} `
    : `${side === "buy" ? "Buy" : "Sell"} ${exactSale ? String(Number(heldText)) : n ? sizeText(n) : "?"} ${crypto ? coin : symbol || ""} `) +
    (type === "market" ? "at market" : type === "limit" ? `limit ${px(limit)}` : type === "stop" ? `stop ${px(stop)}`
      : type === "trailing_stop" ? `trailing stop ${trailBy === "pct" ? `${trail}%` : fmtMoney(Number(trail))} behind the price` : `stop ${px(stop)}, limit ${px(limit)}`) +
    `, ${TIF_TEXT[tif] || TIF_TEXT.day}${extended ? ", including pre-market and after hours" : ""}` +
    (bracket ? `, then take profit at ${px(tp)} or stop out at ${px(sl)}` : "");

  const send = async () => {
    setBusy(true);
    const key = `o${Date.now()}`;
    const unitName = crypto ? coin : "shares";
    onNotify({ key, ...orderNews({ sending: true, words }) });
    const r = await invokeFunction("terminal", {
      action: "order", accountId: account.id,
      order: {
        symbol, side, qty: notional ? null : exactSale ? heldText : n,
        notional: notional ? dollars : null, type, timeInForce: tif, extendedHours: extended,
        limitPrice: needsLimit ? limit : null, stopPrice: needsStop ? stop : null,
        trailPercent: needsTrail && trailBy === "pct" ? trail : null, trailPrice: needsTrail && trailBy === "usd" ? trail : null,
        takeProfit: bracket ? tp : null, stopLoss: bracket ? sl : null, reference: ref ?? null
      }
    });
    setBusy(false);
    setReview(false);
    if (r?.data?.error) onNotify({ key, ...orderNews({ error: r.data.error }) });
    else {
      const placed = { key, id: r?.data?.orderId, status: r?.data?.status || "new", words, symbol, side, unitName };
      trackedRef.current = placed;
      setTracked(placed);
      onNotify({ key, ...orderNews(placed) });
      // A fresh ticket: the size just sent would otherwise sit there, checked
      // against a holding that has since changed.
      setQty(crypto ? "" : "1");
      setAmount("");
      onPlaced?.();
    }
  };
  const cancelTracked = async () => {
    if (!tracked?.id) return;
    const r = await invokeFunction("manageOrder", { accountId: account.id, orderId: tracked.id, action: "cancel" });
    if (r?.data?.error) onNotify({ key: tracked.key, tone: "bad", title: "Could not cancel", detail: r.data.error });
    else if (trackedRef.current) {
      trackedRef.current = { ...trackedRef.current, status: "pending_cancel" };
      setTracked(trackedRef.current);
    }
  };

  return (
    <div className="space-y-3">
      {/* While an order works: one line, and the way to cancel it. Its news
          comes as a pop-up at the top of the screen. */}
      {tracked && (
        <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
          <span className="min-w-0 flex-1 truncate">{orderState(tracked.status).label}: {tracked.words}</span>
          {tracked.status !== "pending_cancel" && (
            <button type="button" onClick={cancelTracked} className="shrink-0 rounded border border-sky-300 px-1.5 py-0.5 font-medium hover:bg-white">Cancel</button>
          )}
        </div>
      )}
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
        {needsTrail && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500" htmlFor="t-trail">Trail by</label>
              <div className="flex overflow-hidden rounded border border-slate-200 text-[10px]" role="group" aria-label="Trail by">
                {[["pct", "%"], ["usd", "$"]].map(([id, name]) => (
                  <button key={id} type="button" onClick={() => { setTrailBy(id); setReview(false); }} className={`px-1.5 ${trailBy === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
                ))}
              </div>
            </div>
            <input id="t-trail" className={input} inputMode="decimal" value={trail} onChange={(e) => { setTrail(e.target.value.replace(/[^\d.]/g, "")); setReview(false); }} />
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
        <div className="flex items-center justify-between gap-2">
          <span>You hold</span>
          <span className="flex items-center gap-1.5 tabular-nums">
            {crypto && heldText ? String(Number(heldText)) : sizeText(held)} {crypto ? coin : "shares"}
            {side === "sell" && held > 0 && !dust && (
              <button type="button" title="Sell exactly what you hold" onClick={() => { setUnit("qty"); setQty(heldText || String(held)); setReview(false); }}
                className="rounded border border-slate-300 px-1 text-[10px] text-slate-700 hover:bg-slate-50">Max</button>
            )}
          </span>
        </div>
        {crypto && asset?.minOrderSize ? (
          <div className="flex justify-between"><span>Smallest order</span><span className="tabular-nums">{asset.minOrderSize} {coin}{minDollars ? ` (≈ ${fmtMoney(minDollars)})` : ""}</span></div>
        ) : null}
      </div>

      {!paper && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Orders go to paper accounts only during this test. Choose a paper account to trade.</p>}
      {short && !crypto && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {Math.max(0, held)} shares, so this sells {n - Math.max(0, held)} you do not own: a short sale.</p>}
      {short && crypto && !dust && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {sizeText(Math.max(0, held))} {coin}. Crypto cannot be sold short, so a sale is limited to what you hold.</p>}
      {dust && side === "sell" ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Your {String(Number(heldText || held))} {coin} is less than Alpaca&apos;s smallest {coin} order ({asset.minOrderSize} {coin}, about {fmtMoney(minDollars || 1)}), so it cannot be sold on its own. Buy more and sell the two together, or leave it.
        </p>
      ) : belowMin ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Too small: Alpaca&apos;s smallest {coin} order is {asset.minOrderSize} {coin} (about {fmtMoney(minDollars || 1)}).</p>
      ) : null}
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
    </div>
  );
}
