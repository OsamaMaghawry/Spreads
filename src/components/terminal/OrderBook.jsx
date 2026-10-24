import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { isCrypto, applyBook, bookLevels, px, bookSize } from "@/lib/terminal";

// Level 2: the order book. For a coin, every resting price on Alpaca's crypto
// venue with its size, live from the stream (the function sends the whole book
// first, then only the levels that change), with the first picture read over
// REST so the panel is never empty while the stream starts, and REST again
// every few seconds if the stream goes quiet. Redrawn ten times a second, in
// step with the tape and the quotes. A click on a price puts it in the
// ticket, as on a desk ladder.
//
// Shares have no book on Alpaca's feeds: its stock data carries only the best
// bid and ask (checked against the feed itself, functions/terminal selftest).
// For a share this shows that one level, live, and says so.

const DEPTH = 12;
const PAINT_MS = 100;
const QUIET_MS = 10000;
const POLL_MS = 3000;

export default function OrderBook({ accountId, symbol, quote, listen, onPick }) {
  const crypto = isCrypto(symbol);
  const bookRef = useRef(null);
  const lastStream = useRef(0);
  const dirty = useRef(false);
  const [view, setView] = useState(null);
  const [mode, setMode] = useState("loading");
  const [error, setError] = useState(null);

  // A new symbol starts with an empty book.
  useEffect(() => {
    bookRef.current = null;
    lastStream.current = 0;
    setView(null);
    setError(null);
    setMode("loading");
  }, [symbol, accountId]);

  // The stream's updates, applied as they come and painted a few times a second.
  useEffect(() => {
    if (!crypto || !listen) return undefined;
    return listen((m) => {
      if (m.type !== "book" || m.symbol !== symbol) return;
      // Updates before the first whole picture cannot be placed; wait for it.
      if (!bookRef.current && !m.reset) return;
      bookRef.current = applyBook(bookRef.current, m);
      lastStream.current = Date.now();
      dirty.current = true;
    });
  }, [crypto, listen, symbol]);

  useEffect(() => {
    if (!crypto) return undefined;
    const t = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setView(bookLevels(bookRef.current, DEPTH));
      setMode(Date.now() - lastStream.current < QUIET_MS ? "live" : "polling");
    }, PAINT_MS);
    return () => clearInterval(t);
  }, [crypto]);

  // The first picture, and the fallback while the stream is quiet.
  useEffect(() => {
    if (!crypto || !accountId) return undefined;
    let alive = true;
    const read = async () => {
      if (Date.now() - lastStream.current < QUIET_MS) return;
      const r = await invokeFunction("terminal", { action: "book", accountId, symbol });
      if (!alive) return;
      if (r?.data?.error) { setError(r.data.error); return; }
      // The stream got there first: its book is newer than this one.
      if (Date.now() - lastStream.current < QUIET_MS) return;
      bookRef.current = applyBook(null, { reset: true, bids: r?.data?.bids, asks: r?.data?.asks, at: r?.data?.at });
      setError(null);
      setView(bookLevels(bookRef.current, DEPTH));
      setMode("polling");
    };
    read();
    const t = setInterval(read, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [crypto, accountId, symbol]);

  if (!crypto) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="drag-handle flex items-center justify-between border-b border-slate-200 px-2 py-1 text-xs">
          <span className="font-semibold text-slate-700">Level 2 · {symbol}</span>
          <span className="text-[10px] text-slate-500">Best bid and ask</span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2 text-xs text-slate-700">
          <Ladder view={{
            asks: quote?.ask ? [{ price: quote.ask, size: quote.askSize ?? 0, total: quote.askSize ?? 0 }] : [],
            bids: quote?.bid ? [{ price: quote.bid, size: quote.bidSize ?? 0, total: quote.bidSize ?? 0 }] : [],
            spread: quote?.ask && quote?.bid ? quote.ask - quote.bid : null,
            mid: quote?.ask && quote?.bid ? (quote.ask + quote.bid) / 2 : null,
            maxTotal: Math.max(quote?.askSize || 0, quote?.bidSize || 0)
          }} onPick={onPick} unit="shares" />
          <p className="text-slate-500">
            Alpaca&apos;s stock feed carries only the best bid and ask, not the deeper book; the full book is
            available for crypto pairs, such as BTC/USD.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="drag-handle flex items-center justify-between border-b border-slate-200 px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700">Level 2 · {symbol}</span>
        <span className={`text-[10px] ${mode === "live" ? "text-emerald-700" : "text-slate-500"}`}>
          {mode === "live" ? "● Live" : mode === "polling" ? "Updating every 3s" : "Loading…"}
        </span>
      </div>
      {error && <p className="px-2 py-1 text-xs text-rose-700">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <Ladder view={view} onPick={onPick} unit={symbol.split("/")[0]} center={symbol} />
      </div>
    </div>
  );
}

// Opens centred on the spread, where the best prices are, as a desk ladder
// does; once per symbol, so the ladder stays where the trader scrolls it.
function Ladder({ view, onPick, unit, center = null }) {
  const spreadRef = useRef(null);
  const centeredFor = useRef(null);
  useEffect(() => {
    if (!center || !view || centeredFor.current === center || !spreadRef.current) return;
    centeredFor.current = center;
    // Scrolls the ladder's own box only, never the page around it.
    const box = spreadRef.current.closest(".overflow-auto");
    if (!box) return;
    const row = spreadRef.current.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    box.scrollTop += row.top - frame.top - box.clientHeight / 2 + row.height / 2;
  }, [center, view]);
  if (!view) return <p className="px-2 py-3 text-xs text-slate-500">Reading the book…</p>;
  const row = (l, side) => (
    <button
      key={`${side}${l.price}`}
      type="button"
      title={`Use ${px(l.price)} as the limit price`}
      onClick={() => onPick?.(l.price)}
      className="relative grid w-full grid-cols-3 px-2 py-[3px] text-right text-xs tabular-nums hover:bg-slate-50"
    >
      <span
        className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-rose-500/10" : "bg-emerald-500/10"}`}
        style={{ width: `${view.maxTotal ? (l.total / view.maxTotal) * 100 : 0}%` }}
      />
      <span className={`relative text-left font-medium ${side === "ask" ? "text-rose-700" : "text-emerald-700"}`}>{px(l.price)}</span>
      <span className="relative">{bookSize(l.size)}</span>
      <span className="relative text-slate-500">{bookSize(l.total)}</span>
    </button>
  );
  return (
    <div>
      <div className="sticky top-0 z-10 grid grid-cols-3 bg-white px-2 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500">
        <span className="text-left">Price</span><span>Size ({unit})</span><span>Total</span>
      </div>
      {/* Asks above, best (lowest) nearest the middle; bids below, best (highest) first. */}
      {[...view.asks].reverse().map((l) => row(l, "ask"))}
      <div ref={spreadRef} className="flex justify-between border-y border-slate-200 bg-slate-50 px-2 py-1 text-[11px] tabular-nums text-slate-600">
        <span>Spread {view.spread !== null ? px(view.spread) : "—"}{view.spread !== null && view.mid ? ` (${((view.spread / view.mid) * 100).toFixed(3)}%)` : ""}</span>
        <span>Mid {px(view.mid)}</span>
      </div>
      {view.bids.map((l) => row(l, "bid"))}
      {!view.asks.length && !view.bids.length && <p className="px-2 py-3 text-xs text-slate-500">The book is empty right now.</p>}
    </div>
  );
}
