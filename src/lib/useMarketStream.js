import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Live prices for the tickers on screen, over one socket.
//
// One connection per account, shared by everything that needs a price. Alpaca
// caps concurrent data connections per account, so a socket per card would trip
// that cap on a busy dashboard and take the whole feed down rather than degrade.
//
// Nothing here decides what a price means. It reports what arrived and when, and
// leaves judgement to the caller — the same rule the server-side trust ladder
// follows, for the same reason: a number that cannot be trusted must never be
// presented as one that can.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// Long enough not to hammer a stream that is refusing us, short enough that a
// dropped socket during market hours recovers without a page reload.
const RETRY_MS = [1000, 2000, 5000, 10000, 30000];

export default function useMarketStream(accountId, symbols) {
  const [prices, setPrices] = useState({});
  const [status, setStatus] = useState("idle"); // idle | connecting | live | fallback
  const socketRef = useRef(null);
  const attemptRef = useRef(0);
  const timerRef = useRef(null);
  // Sorted and joined so a re-render with the same tickers in a different order
  // does not tear down a working socket.
  const key = [...new Set(symbols || [])].filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!accountId || !key) {
      setStatus("idle");
      return;
    }
    let disposed = false;

    const connect = async () => {
      if (disposed) return;
      setStatus("connecting");

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setStatus("fallback");
        return;
      }

      const url =
        `${FUNCTIONS_BASE}/marketStream?token=${encodeURIComponent(token)}` +
        `&accountId=${encodeURIComponent(accountId)}&symbols=${encodeURIComponent(key)}`;
      const ws = new WebSocket(url.replace(/^http/, "ws"));
      socketRef.current = ws;

      ws.onmessage = (event) => {
        let m;
        try {
          m = JSON.parse(event.data);
        } catch {
          return;
        }
        if (m.type === "ready") {
          attemptRef.current = 0;
          setStatus("live");
          return;
        }
        if (m.type === "error") {
          // A refusal will not fix itself by reconnecting — an unentitled feed
          // or a connection cap needs the fallback, not another attempt.
          setStatus("fallback");
          try { ws.close(); } catch { /* already closing */ }
          return;
        }
        if (m.type === "trade" && m.symbol) {
          setPrices((p) => ({ ...p, [m.symbol]: { ...p[m.symbol], price: m.price, at: m.at } }));
          return;
        }
        if (m.type === "quote" && m.symbol) {
          setPrices((p) => ({ ...p, [m.symbol]: { ...p[m.symbol], bid: m.bid, ask: m.ask, at: m.at } }));
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("fallback");
        // Edge functions have a wall-clock limit, so a healthy stream will still
        // close periodically. Reconnecting is the normal path, not the error one.
        const wait = RETRY_MS[Math.min(attemptRef.current, RETRY_MS.length - 1)];
        attemptRef.current += 1;
        timerRef.current = setTimeout(connect, wait);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* onclose will retry */ }
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(timerRef.current);
      try { socketRef.current?.close(); } catch { /* already gone */ }
      socketRef.current = null;
    };
  }, [accountId, key]);

  return { prices, status };
}
