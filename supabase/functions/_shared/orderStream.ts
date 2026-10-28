// The account's own orders as they move, from Alpaca's trading stream
// (trade_updates), passed to the open terminal the moment each happens.
//
// The owner, 28 Oct: "Is there anyway to enhance the execution speed". Alpaca
// filled a market order in 5 ms, but the terminal asked after each order once
// a second, so a fill reached the screen up to a second and a half after it
// happened. The browser still asks as well, more slowly, for whatever this
// misses while the relay reconnects (useTerminalStream, runHotkey trackOrder).

const STREAM = { paper: "wss://paper-api.alpaca.markets/stream", live: "wss://api.alpaca.markets/stream" };

/** How the trading stream is signed in to: the account's OAuth token, else its key pair. */
export function streamAuth(cred: { token?: string | null; key?: string | null; secret?: string | null }) {
  if (cred.token) return { action: "authenticate", data: { oauth_token: cred.token } };
  if (cred.key && cred.secret) return { action: "authenticate", data: { key_id: cred.key, secret_key: cred.secret } };
  return null;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * One trade update as the terminal reads it, or null for anything else. The
 * order's figures carry the same names as the terminal's orderStatus answer
 * (filled, avgPrice), so the screen treats either the same way.
 */
export function orderUpdate(m: any) {
  if (m?.stream !== "trade_updates" || !m.data?.order?.id) return null;
  const o = m.data.order;
  return {
    type: "order", event: String(m.data.event || ""), id: String(o.id), symbol: o.symbol, side: o.side,
    status: o.status, qty: num(o.qty), filled: num(o.filled_qty), avgPrice: num(o.filled_avg_price),
    limit: num(o.limit_price), at: m.data.timestamp || o.updated_at || null
  };
}

const text = async (data: unknown) => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data instanceof Blob) return await data.text();
  return String(data);
};

/**
 * Listens to one account's trade updates and hands each to `tell`, until
 * `close()`. `said` collects what the stream answered, for the relay's log.
 */
export function orderStream(paper: boolean, cred: { token?: string | null; key?: string | null; secret?: string | null }, tell: (m: any) => void, said: string[]) {
  const hello = streamAuth(cred);
  let ws: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let timer: number | null = null;
  const open = () => {
    if (!hello || closed) return;
    const sock = new WebSocket(paper ? STREAM.paper : STREAM.live);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.onopen = () => sock.send(JSON.stringify(hello));
    sock.onmessage = async (event) => {
      let m: any;
      try { m = JSON.parse(await text(event.data)); } catch { return; }
      if (m?.stream === "authorization") {
        const ok = m.data?.status === "authorized";
        said.push(`orders: ${ok ? "authorized" : `refused (${m.data?.status || "?"})`}`);
        if (ok) { attempts = 0; sock.send(JSON.stringify({ action: "listen", data: { streams: ["trade_updates"] } })); }
        return;
      }
      if (m?.stream === "listening") { said.push("orders: listening"); return; }
      const u = orderUpdate(m);
      if (u) tell(u);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (closed || attempts >= 5) return;
      attempts += 1;
      timer = setTimeout(open, Math.min(10000, 500 * 2 ** attempts));
    };
    sock.onerror = () => { said.push("orders: stream error"); };
  };
  return {
    start: open,
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      try { ws?.close(); } catch { /* already gone */ }
    }
  };
}
