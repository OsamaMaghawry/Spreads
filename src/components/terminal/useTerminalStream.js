import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { unionSymbols } from "@/lib/feedSymbols";

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
//
// One socket for every terminal tab of the account in this browser (28 Oct:
// "Why time and sales just stopped"). A second terminal window opened at 4:44
// made a second connection; EODHD refused its symbols ("Symbols limit
// reached") and Alpaca its coins ("connection limit exceeded"), and each time
// the two reconnected together whichever came second went quiet. Now one tab
// holds the socket (a browser lock) and passes everything it hears to the
// others (a broadcast channel); it streams their symbols as well as its own,
// and when it closes the next tab takes the socket over.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FLUSH_MS = 100;
// Refusals that will not change by trying again: no key pair, the account's
// one connection already in use elsewhere, no entitlement.
const TERMINAL = /409|401|402|403|406|connection limit|not authorized|no API key/i;
// A feed refused because another connection holds it.
const ELSEWHERE = /limit reached|connection limit/i;
const elsewhere = (message) => ELSEWHERE.test(message || "")
  ? "In use by another terminal (another window, device or account). Close it and this one comes back."
  : message;

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
  // Tells the socket (or the tab holding it) this tab's symbols and book.
  const announce = useRef(() => {});
  const key = [...new Set(symbols)].sort().join(",");
  symbolsRef.current = symbols;
  bookRef.current = book;

  // Open (and reopen) the socket for the account, or follow the tab that has it.
  useEffect(() => {
    if (!accountId) return undefined;
    let alive = true;
    let retry = null;
    let attempt = 0;
    let leading = false;
    let release = null;
    let sent = "";
    const tab = Math.random().toString(36).slice(2);
    const name = `terminal-feed:${accountId}:${stockFeed}`;
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
    const others = new Map();
    const stop = typeof AbortController === "function" ? new AbortController() : null;
    // The state as it stands, for a tab that opens after it was said.
    let snap = { status: { state: "connecting", message: null }, feeds: {} };

    const wantedSymbols = () => unionSymbols([
      [...new Set(symbolsRef.current)],
      ...[...others.values()].filter((w) => Date.now() - w.at < 90000).map((w) => w.symbols || [])
    ]);
    const wantedBook = () => bookRef.current || [...others.values()].map((w) => w.book).find(Boolean) || "";

    // Everything heard, here or from the tab holding the socket.
    const handle = (m) => {
      if (m.type === "_status") {
        snap = { status: m.status, feeds: m.reset ? {} : snap.feeds };
        setStatus(m.status);
        if (m.reset) setFeeds({});
      } else if (m.type === "_snap") {
        snap = { status: m.status, feeds: m.feeds };
        setStatus(m.status);
        setFeeds(m.feeds);
        setEpoch((e) => e + 1);
      } else if (m.type === "ready") {
        attempt = 0;
        snap = { ...snap, status: { state: "live", message: null } };
        setStatus(snap.status);
        if (m.feed) {
          snap = { ...snap, feeds: { ...snap.feeds, [m.feed]: { state: "live", message: null } } };
          setFeeds(snap.feeds);
          setEpoch((e) => e + 1);
        }
      } else if (m.type === "error" && m.feed) {
        // One feed's trouble: the other carries on, and so does the socket.
        snap = { ...snap, feeds: { ...snap.feeds, [m.feed]: { state: "error", message: elsewhere(m.message) || "The feed reported an error." } } };
        setFeeds(snap.feeds);
      } else if (m.type === "feed") {
        snap = { ...snap, feeds: { ...snap.feeds, [m.feed]: { state: m.message ? "error" : "reconnecting", message: elsewhere(m.message) || null } } };
        setFeeds(snap.feeds);
      } else if (m.type === "error") {
        snap = { ...snap, status: { state: "error", message: elsewhere(m.message) || "The price stream reported an error." } };
        setStatus(snap.status);
      } else if (m.type === "book") {
        listeners.current.forEach((fn) => fn(m));
      } else if (m.type === "quote") {
        const cur = pending.current[m.symbol] || {};
        pending.current[m.symbol] = { ...cur, bid: m.bid, ask: m.ask, bidSize: m.bidSize, askSize: m.askSize, quoteAt: m.at };
      } else if (m.type === "trade") {
        const cur = pending.current[m.symbol] || {};
        pending.current[m.symbol] = { ...cur, last: m.price, lastSize: m.size, at: m.at };
        listeners.current.forEach((fn) => fn(m));
      } else if (m.type === "bar" || m.type === "guard" || m.type === "order") {
        // guard: a stop the server fired outside regular hours (stopGuardRun.ts).
        // order: the account's own order as Alpaca moved it (orderStream.ts).
        listeners.current.forEach((fn) => fn(m));
      }
    };
    // Heard by the tab holding the socket: here, and in every other tab.
    const tell = (m) => {
      handle(m);
      try { channel?.postMessage({ kind: "msg", m }); } catch { /* channel closed */ }
    };
    // The symbols and book the socket streams, sent when they change.
    const push = () => {
      const ws = socketRef.current;
      const list = wantedSymbols();
      const now = `${list.join(",")}|${wantedBook()}`;
      if (!ws || ws.readyState !== WebSocket.OPEN || !list.length || now === sent) return;
      sent = now;
      ws.send(JSON.stringify({ action: "set", symbols: list, book: wantedBook() }));
    };
    announce.current = () => {
      if (leading) { push(); return; }
      try { channel?.postMessage({ kind: "want", tab, symbols: [...new Set(symbolsRef.current)], book: bookRef.current || "" }); } catch { /* channel closed */ }
    };

    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!alive || !leading || !token) return;
      const list = wantedSymbols();
      if (!list.length) return;
      tell({ type: "_status", status: { state: "connecting", message: null }, reset: true });
      sent = `${list.join(",")}|${wantedBook()}`;
      const url = `${FUNCTIONS_BASE}/marketStream?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}` +
        `&symbols=${encodeURIComponent(list.join(","))}&book=${encodeURIComponent(wantedBook())}&detail=1&stocks=${encodeURIComponent(stockFeed)}`;
      const ws = new WebSocket(url.replace(/^http/, "ws"));
      socketRef.current = ws;
      let wasLive = false;
      let refused = null;

      ws.onmessage = (event) => {
        let m;
        try { m = JSON.parse(event.data); } catch { return; }
        if (m.type === "error" && !m.feed && TERMINAL.test(`${m.code ?? ""} ${m.message ?? ""}`)) refused = elsewhere(m.message) || `Refused (${m.code})`;
        tell(m);
        if (m.type === "ready") {
          wasLive = true;
          // Symbols or the book that changed while the socket was opening: send them now.
          sent = `${[...(m.symbols || [])].join(",")}|${m.book || ""}`;
          const want = wantedSymbols();
          const got = [...(m.symbols || [])].sort().join(",");
          if (want.length && ([...want].sort().join(",") !== got || wantedBook() !== (m.book || ""))) { sent = ""; push(); }
        }
      };
      ws.onclose = () => {
        if (!alive || socketRef.current !== ws) return;
        socketRef.current = null;
        // A refusal is final; a live socket that dropped (the function's time
        // limit, a network blip) comes back, a little later each time.
        if (refused) { tell({ type: "_status", status: { state: "error", message: refused } }); return; }
        tell({ type: "_status", status: { state: "reconnecting", message: wasLive ? null : "Could not reach the price stream." } });
        attempt += 1;
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)));
      };
    };

    if (channel) {
      channel.onmessage = (event) => {
        const d = event.data || {};
        if (d.kind === "msg") { if (!leading && (!d.to || d.to === tab)) handle(d.m); return; }
        if (d.kind === "lead") { if (!leading) announce.current(); return; }
        if (!leading) return;
        if (d.kind === "want") { others.set(d.tab, { symbols: d.symbols || [], book: d.book || "", at: Date.now() }); push(); }
        else if (d.kind === "bye") { others.delete(d.tab); push(); }
        if (d.kind === "want" && d.hello) channel.postMessage({ kind: "msg", to: d.tab, m: { type: "_snap", status: snap.status, feeds: snap.feeds } });
      };
    }

    // The socket is this tab's once no other tab holds it; until then, it follows.
    const lead = () => new Promise((resolve) => {
      release = resolve;
      if (!alive) { resolve(); return; }
      leading = true;
      try { channel?.postMessage({ kind: "lead" }); } catch { /* channel closed */ }
      connect();
    });
    if (channel && navigator.locks?.request) {
      setStatus({ state: "connecting", message: null });
      navigator.locks.request(name, stop ? { signal: stop.signal } : {}, lead).catch(() => {});
      try { channel.postMessage({ kind: "want", hello: true, tab, symbols: [...new Set(symbolsRef.current)], book: bookRef.current || "" }); } catch { /* channel closed */ }
    } else {
      leading = true;
      connect();
    }
    // Still here: the tab holding the socket forgets a tab it has not heard
    // from in a minute and a half (a hidden tab's timers may run once a minute).
    const beat = setInterval(() => { if (!leading) announce.current(); }, 10000);

    const flush = setInterval(() => {
      const batch = pending.current;
      if (!Object.keys(batch).length) return;
      pending.current = {};
      setQuotes((prev) => {
        const next = { ...prev };
        for (const [s, q] of Object.entries(batch)) next[s] = { ...prev[s], ...q };
        return next;
      });
    }, FLUSH_MS);

    return () => {
      alive = false;
      leading = false;
      clearTimeout(retry);
      clearInterval(flush);
      clearInterval(beat);
      const ws = socketRef.current;
      socketRef.current = null;
      try { ws?.close(); } catch { /* closed */ }
      // The socket closed first, then handed on.
      stop?.abort();
      release?.();
      try { channel?.postMessage({ kind: "bye", tab }); channel?.close(); } catch { /* closed */ }
      announce.current = () => {};
    };
    // The account and the share tape open the socket; symbol changes travel down it (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, stockFeed]);

  // Symbol and book changes: down the open socket, or to the tab that holds it.
  useEffect(() => { announce.current(); }, [key, book]);

  const listen = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { quotes, status, feeds, epoch, listen };
}
