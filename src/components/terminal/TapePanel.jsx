import { memo, useCallback, useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { tapeRow, TAPE_MAX } from "@/lib/terminal";
import { TimeAndSales } from "./Panels";

// Time & sales, holding its own rows. The owner, 24 Oct: "I feel the time &
// sales, order book and chart are not all in sync". Measured on staging the
// same day, trades, quotes and book changes all reach the server about 30 ms
// after Alpaca stamps them, so the feeds agree; the tape lagged in the
// browser. Its rows lived in the page's state, so every trade redrew the
// whole terminal before the row appeared, while the chart draws straight onto
// its canvas. Here a trade touches only this panel, and trades arriving
// together are drawn together, ten times a second at most.

const FLUSH_MS = 100;
const DELAYS_KEPT = 30;

function TapePanel({ accountId, symbol, listen, live, epoch, quoteRef, stockFeed = "iex", source = "iex" }) {
  const [rows, setRows] = useState([]);
  const [delay, setDelay] = useState(null);
  const pending = useRef([]);
  const delays = useRef([]);
  const forSymbol = useRef(symbol);
  forSymbol.current = symbol;

  // The last trades from the server, merged in time order with what is on screen.
  const load = useCallback(() => {
    if (!accountId) return;
    const want = symbol;
    invokeFunction("terminal", { action: "trades", accountId, symbol: want, stockFeed }).then((r) => {
      if (forSymbol.current !== want || !Array.isArray(r?.data?.trades)) return;
      const past = r.data.trades.map((t) => tapeRow(t, null));
      setRows((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...past.filter((x) => !seen.has(x.id))]
          .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
          .slice(0, TAPE_MAX);
      });
    });
  }, [accountId, symbol, stockFeed]);

  useEffect(() => {
    setRows([]);
    setDelay(null);
    pending.current = [];
    delays.current = [];
    load();
    const off = listen((m) => {
      if (m.type !== "trade" || m.symbol !== symbol) return;
      pending.current.push(tapeRow(m, quoteRef.current));
      // How long after the trade it reached this screen: Alpaca's stamp to now.
      const d = Date.now() - Date.parse(m.at);
      if (Number.isFinite(d)) delays.current = [...delays.current.slice(-(DELAYS_KEPT - 1)), d];
    });
    const flush = setInterval(() => {
      if (!pending.current.length) return;
      const batch = pending.current.reverse();
      pending.current = [];
      setRows((cur) => [...batch, ...cur].slice(0, TAPE_MAX));
      const sorted = [...delays.current].sort((a, b) => a - b);
      if (sorted.length) setDelay(sorted[Math.floor(sorted.length / 2)]);
    }, FLUSH_MS);
    return () => { off(); clearInterval(flush); };
  }, [listen, symbol, load, quoteRef]);

  // After a reconnect, what printed while the connection was down.
  useEffect(() => {
    if (epoch > 0) load();
    // Only on a reconnect; a new symbol loads above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  return <TimeAndSales rows={rows} symbol={symbol} live={live} delay={delay} source={source} />;
}

export default memo(TapePanel);
