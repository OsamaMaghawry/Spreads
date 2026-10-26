import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// The terminal's one live connection: marketStream in detail mode.
//
// One socket per account, because Alpaca allows one data connection per
// account; when the symbols change, the new set is sent down the open socket
// rather than reconnecting (a reconnect races the old one and is refused).
// Quotes are batched and handed to React a few times a second: a busy tape is
// hundreds of messages a second across a watchlist, and a render per message
// would freeze the page. Trades, bars and order-book updates go to listeners
// directly, without a render.
//
// Shares and coins share the socket: the function holds the stock and the
// crypto feed behind it and reports each one's state separately (feeds), so a
// refused crypto feed does not take the stock prices down with it. `book` is
// the one coin whose order book to stream.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FLUSH_MS = 100;
// Refusals that will not change by trying again: no key pair, the account's
// one connection already in use elsewhere, no entitlement.
const TERMINAL = /409|401|402|403|406|connection limit|not authorized|no API key/i;

// `stockFeed`: the tape for shares (lib/terminal.js shareFeed): "iex",
// "delayed_sip" or "eodhd"; a change reconnects.
export default function useTerminalStream(accountId, symbols, book = "", stockFeed = "iex") {
  const [quotes, setQuotes] = useState({});
  const [status, setStatus] = useState({ state: "idle", message: null });
  const [feeds, setFeeds] = useState({});
  // Counts feed (re)connections, so panels that keep history (the tape) can
  // read what printed while the connection was down.
  const [epoch, setEpoch] = useState(0);
  const socketRef = useRef(null);
  const pending = useRef({});
  const listeners = useRef(new Set());
  const symbolsRef = useRef(symbols);
  const bookRef = useRef(book);
  const key = [...new Set(symbols)].sort().join(",");
  symbolsRef.current = symbols;
  bookRef.current = book;

  // Open (and reopen) the socket for the account.
  useEffect(() => {
    if (!accountId) return undefined;
    let alive = true;
    let retry = null;
    let attempt = 0;
    let flush = null;

    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!alive || !token) return;
      const list = [...new Set(symbolsRef.current)].slice(0, 30);
      if (!list.length) return;
      setStatus({ state: "connecting", message: null });
      setFeeds({});
      const url = `${FUNCTIONS_BASE}/marketStream?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}` +
        `&symbols=${encodeURIComponent(list.join(","))}&book=${encodeURIComponent(bookRef.current || "")}&detail=1&stocks=${encodeURIComponent(stockFeed)}`;
      const ws = new WebSocket(url.replace(/^http/, "ws"));
      socketRef.current = ws;
      let wasLive = false;
      let refused = null;

      ws.onmessage = (event) => {
        let m;
        try { m = JSON.parse(event.data); } catch { return; }
        if (m.type === "ready") {
          wasLive = true;
          attempt = 0;
          setStatus({ state: "live", message: null });
          if (m.feed) {
            setFeeds((f) => ({ ...f, [m.feed]: { state: "live", message: null } }));
            setEpoch((e) => e + 1);
          }
          // Symbols or the book that changed while the socket was opening: send them now.
          const want = [...new Set(symbolsRef.current)].slice(0, 30).sort().join(",");
          const got = [...(m.symbols || [])].sort().join(",");
          if (want && (want !== got || (bookRef.current || "") !== (m.book || ""))) {
            ws.send(JSON.stringify({ action: "set", symbols: want.split(","), book: bookRef.current || "" }));
          }
        } else if (m.type === "error" && m.feed) {
          // One feed's trouble: the other carries on, and so does the socket.
          setFeeds((f) => ({ ...f, [m.feed]: { state: "error", message: m.message || "The feed reported an error." } }));
        } else if (m.type === "feed") {
          setFeeds((f) => ({ ...f, [m.feed]: { state: m.message ? "error" : "reconnecting", message: m.message || null } }));
        } else if (m.type === "error") {
          if (TERMINAL.test(`${m.code ?? ""} ${m.message ?? ""}`)) refused = m.message || `Refused (${m.code})`;
          setStatus({ state: "error", message: m.message || "The price stream reported an error." });
        } else if (m.type === "book") {
          listeners.current.forEach((fn) => fn(m));
        } else if (m.type === "quote") {
          const cur = pending.current[m.symbol] || {};
          pending.current[m.symbol] = { ...cur, bid: m.bid, ask: m.ask, bidSize: m.bidSize, askSize: m.askSize, quoteAt: m.at };
        } else if (m.type === "trade") {
          const cur = pending.current[m.symbol] || {};
          pending.current[m.symbol] = { ...cur, last: m.price, lastSize: m.size, at: m.at };
          listeners.current.forEach((fn) => fn(m));
        } else if (m.type === "bar" || m.type === "guard") {
          // guard: a stop the server fired outside regular hours (stopGuardRun.ts).
          listeners.current.forEach((fn) => fn(m));
        }
      };
      ws.onclose = () => {
        if (!alive) return;
        socketRef.current = null;
        // A refusal is final; a live socket that dropped (the function's time
        // limit, a network blip) comes back, a little later each time.
        if (refused) { setStatus({ state: "error", message: refused }); return; }
        setStatus({ state: "reconnecting", message: wasLive ? null : "Could not reach the price stream." });
        attempt += 1;
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)));
      };
    };

    flush = setInterval(() => {
      const batch = pending.current;
      if (!Object.keys(batch).length) return;
      pending.current = {};
      setQuotes((prev) => {
        const next = { ...prev };
        for (const [s, q] of Object.entries(batch)) next[s] = { ...prev[s], ...q };
        return next;
      });
    }, FLUSH_MS);

    connect();
    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(flush);
      try { socketRef.current?.close(); } catch { /* closed */ }
      socketRef.current = null;
    };
    // The account and the share tape open the socket; symbol changes travel down it (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, stockFeed]);

  // Symbol and book changes on the open socket.
  useEffect(() => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && key) ws.send(JSON.stringify({ action: "set", symbols: key.split(","), book: book || "" }));
  }, [key, book]);

  const listen = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { quotes, status, feeds, epoch, listen };
}
