import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";

// Live per-leg bid/ask quotes, keyed by option symbol.
export default function useLegQuotes(accountId, legs) {
  const [quotes, setQuotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const key = legs.map((l) => l.symbol).join(",");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      legs.map((l) =>
        invokeFunction("spreadQuote", {
          accountId,
          legs: [{ symbol: l.symbol, ratio: 1, action: "buy_to_close" }]
        })
          .then((res) => [l.symbol, res.data?.error ? null : res.data])
          .catch(() => [l.symbol, null])
      )
    ).then((pairs) => {
      if (!alive) return;
      setQuotes(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, key]);

  return { quotes, loading };
}