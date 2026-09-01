// One socket per account, shared by everything that wants a price.
//
// Alpaca allows a limited number of concurrent market-data connections per
// account. The first build of this opened a socket inside each component's
// effect, so the dashboard and an open close-ticket raced for the same slot:
// the second connection was refused, the ticket's live price never lit, and the
// account fell back to polling while looking like it was streaming. Sharing the
// connection is not an optimisation here — it is the difference between the
// feature working and not.
//
// Kept free of React and of WebSocket construction so the sharing itself is
// testable: the caller injects how a socket is opened and how time passes.

// Long enough not to hammer a stream that is refusing us, short enough that a
// dropped socket during market hours recovers without a page reload.
export const RETRY_MS = [1000, 2000, 5000, 10000, 30000];

const keyOf = (symbols) => [...new Set(symbols || [])].filter(Boolean).sort().join(",");

export function createRegistry({ open, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  const accounts = new Map();
  let nextId = 1;

  const entryFor = (accountId) => {
    if (!accounts.has(accountId)) {
      accounts.set(accountId, {
        subs: new Map(),
        socket: null,
        key: "",
        status: "idle",
        prices: {},
        attempt: 0,
        timer: null,
        everReady: false,
        // A refusal does not fix itself by reconnecting. An account with no API
        // key pair, or one over the connection cap, would otherwise reconnect
        // every thirty seconds forever.
        terminal: false
      });
    }
    return accounts.get(accountId);
  };

  const emit = (e) => {
    for (const sub of e.subs.values()) sub.cb({ prices: e.prices, status: e.status });
  };

  const setStatus = (e, status) => {
    if (e.status === status) return;
    e.status = status;
    emit(e);
  };

  const union = (e) => keyOf([...e.subs.values()].flatMap((s) => s.symbols));

  const teardown = (e) => {
    clearTimeoutFn(e.timer);
    e.timer = null;
    const sock = e.socket;
    e.socket = null;
    if (sock) {
      // Detached first: a close we asked for must not look like one to recover
      // from, or every symbol change would schedule a reconnect of its own.
      sock.onmessage = null;
      sock.onclose = null;
      sock.onerror = null;
      try { sock.close(); } catch { /* already gone */ }
    }
  };

  const connect = async (accountId) => {
    const e = accounts.get(accountId);
    if (!e || e.terminal || e.socket || e.subs.size === 0) return;
    const key = union(e);
    if (!key) {
      setStatus(e, "idle");
      return;
    }
    e.key = key;
    setStatus(e, "connecting");

    const sock = await open(accountId, key);
    // The symbols, or the last subscriber, may have gone while the token was
    // being fetched. Anything opened for a state that no longer exists is
    // closed rather than left running.
    const still = accounts.get(accountId);
    if (!sock) { if (still) setStatus(still, "fallback"); return; }
    if (!still || still !== e || e.subs.size === 0 || union(e) !== key) {
      try { sock.close(); } catch { /* already gone */ }
      if (still && still.subs.size > 0) connect(accountId);
      return;
    }
    e.socket = sock;

    sock.onmessage = (event) => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === "ready") {
        e.attempt = 0;
        e.everReady = true;
        setStatus(e, "live");
        return;
      }
      if (m.type === "error") {
        e.terminal = true;
        teardown(e);
        setStatus(e, "fallback");
        return;
      }
      if ((m.type === "trade" || m.type === "quote") && m.symbol) {
        const prev = e.prices[m.symbol] || {};
        const next = m.type === "trade"
          ? { ...prev, price: m.price, at: m.at }
          : { ...prev, bid: m.bid, ask: m.ask, at: m.at };
        e.prices = { ...e.prices, [m.symbol]: next };
        emit(e);
      }
    };

    sock.onerror = () => { try { sock.close(); } catch { /* onclose retries */ } };

    sock.onclose = () => {
      if (e.socket !== sock) return; // a close we caused
      e.socket = null;
      setStatus(e, "fallback");
      if (e.subs.size === 0) return;
      // A socket that never reached "ready" was refused, not dropped. Edge
      // functions have a wall-clock limit, so a stream that DID go live closing
      // later is the normal path and is worth reconnecting.
      if (!e.everReady) { e.terminal = true; return; }
      const wait = RETRY_MS[Math.min(e.attempt, RETRY_MS.length - 1)];
      e.attempt += 1;
      e.timer = setTimeoutFn(() => connect(accountId), wait);
    };
  };

  return {
    subscribe(accountId, symbols, cb) {
      if (!accountId) { cb({ prices: {}, status: "idle" }); return () => {}; }
      const e = entryFor(accountId);
      const id = nextId++;
      e.subs.set(id, { symbols: [...new Set(symbols || [])].filter(Boolean), cb });
      cb({ prices: e.prices, status: e.status });

      // Only a socket carrying the wrong symbol set is worth replacing; a new
      // subscriber asking for symbols already covered joins the live one.
      if (e.socket && union(e) !== e.key) { teardown(e); connect(accountId); }
      else if (!e.socket && !e.timer) connect(accountId);

      return () => {
        e.subs.delete(id);
        if (e.subs.size === 0) {
          teardown(e);
          e.status = "idle";
          e.everReady = false;
          e.attempt = 0;
          accounts.delete(accountId);
          return;
        }
        if (e.socket && union(e) !== e.key) { teardown(e); connect(accountId); }
      };
    },
    // Test and debug surface: how many live sockets this registry is holding.
    socketCount() {
      let n = 0;
      for (const e of accounts.values()) if (e.socket) n += 1;
      return n;
    },
    symbolsFor(accountId) {
      return accounts.get(accountId)?.key ?? null;
    },
    statusFor(accountId) {
      return accounts.get(accountId)?.status ?? "idle";
    }
  };
}
