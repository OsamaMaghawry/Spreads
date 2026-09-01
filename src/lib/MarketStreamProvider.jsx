import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { createRegistry } from "@/lib/marketStreamRegistry";

// The one place a market-data socket is opened.
//
// Alpaca caps concurrent data connections per account, so the dashboard and an
// open close-ticket cannot each have their own -- the second is refused and the
// ticket shows no live price while the account claims to be streaming. The
// registry below holds one connection per account and hands its prices to every
// component that asks. The sharing logic itself lives in marketStreamRegistry.js
// and is tested there; this file only supplies the token and the socket.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const MarketStreamContext = createContext(null);

async function openSocket(accountId, symbolKey) {
  // A browser cannot set an Authorization header on a WebSocket, so the token
  // travels in the query string and marketStream verifies it itself.
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  const url =
    `${FUNCTIONS_BASE}/marketStream?token=${encodeURIComponent(token)}` +
    `&accountId=${encodeURIComponent(accountId)}&symbols=${encodeURIComponent(symbolKey)}`;
  return new WebSocket(url.replace(/^http/, "ws"));
}

export function MarketStreamProvider({ children }) {
  const registry = useMemo(() => createRegistry({ open: openSocket }), []);
  return <MarketStreamContext.Provider value={registry}>{children}</MarketStreamContext.Provider>;
}

// Same signature and same return shape as before, so no call site changes.
// Without a provider above it this returns idle rather than throwing: a missing
// provider must degrade to polling, never blank a trading screen.
export default function useMarketStream(accountId, symbols) {
  const registry = useContext(MarketStreamContext);
  const [state, setState] = useState({ prices: {}, status: "idle" });
  // Sorted and joined so a re-render with the same tickers in a different order
  // does not tear down a working socket.
  const key = [...new Set(symbols || [])].filter(Boolean).sort().join(",");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!registry || !accountId || !key) {
      setState({ prices: {}, status: "idle" });
      return;
    }
    return registry.subscribe(accountId, key.split(","), (next) => {
      if (mounted.current) setState(next);
    });
  }, [registry, accountId, key]);

  return state;
}
