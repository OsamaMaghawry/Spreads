import { useEffect, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import useMarketStream from "@/lib/useMarketStream";

// The market as it is now, for a setup the scan built a while ago.
//
// A scan result sits on screen for as long as it takes to read it, and on a
// ticket that is long enough for every number on it to be wrong. This keeps two
// things moving under the setup: the legs' quotes and the net credit through
// the same 1-second spreadQuote loop the close ticket runs, and the underlying
// through the shared stream. The scan's own figures are never overwritten --
// they are what the user is choosing between -- so both are returned and the
// screen shows them side by side, labelled.

export const QUOTE_REFRESH_MS = 1000;
const round2 = (v) => Math.round(v * 100) / 100;

// spreadQuote answers in closing debits; an opening credit is the negation,
// and the sides swap: the debit you would pay to buy the structure back is
// the credit bid for selling it.
export function creditQuote(q) {
  const bidDebit = Number(q?.bidDebit);
  const askDebit = Number(q?.askDebit);
  if (!Number.isFinite(bidDebit) || !Number.isFinite(askDebit)) return null;
  const bid = round2(-askDebit);
  const ask = round2(-bidDebit);
  if (ask < bid) return null;
  return { bid, ask, mid: round2((bid + ask) / 2) };
}

export default function useLiveSetup(accountId, setup, enabled = true) {
  const [quote, setQuote] = useState(null);
  const legSig = (setup?.legs || []).map((l) => l.symbol).join("|");
  const legs = setup?.legs || [];

  useEffect(() => {
    if (!enabled || !accountId || !legSig) {
      setQuote(null);
      return;
    }
    let active = true;
    let timer = null;
    const body = {
      accountId,
      // getLegsQuote branches on the literal "sell_to_close" and treats anything
      // else as a buy -- the same mapping useOpenOrder sends on a walk.
      legs: legs.map((l) => ({
        symbol: l.symbol,
        ratio: l.ratio,
        action: l.side === "sell" ? "sell_to_close" : "buy_to_close",
        // Equity legs are quoted on the stocks endpoint; without this a plain
        // ticker goes to the options one and comes back with no quote at all.
        ...(l.assetClass ? { assetClass: l.assetClass } : {})
      }))
    };
    const fetchQuote = () =>
      invokeFunction("spreadQuote", body)
        .then((res) => {
          if (!active) return;
          const d = res.data;
          // A failed poll keeps the last good quote on screen rather than
          // blanking it; the timestamp says how old it is.
          if (!d || d.error) return;
          const perLeg = {};
          for (const l of d.legs || []) perLeg[l.symbol] = { bid: l.bid, ask: l.ask };
          const bidDebit = Number(d.bidDebit);
          const askDebit = Number(d.askDebit);
          const debit = Number.isFinite(bidDebit) && Number.isFinite(askDebit)
            ? { bid: round2(bidDebit), ask: round2(askDebit), mid: round2((bidDebit + askDebit) / 2) }
            : null;
          setQuote({ net: creditQuote(d), debit, legs: perLeg, at: Date.now() });
        })
        .catch(() => {});
    const loop = () => {
      if (!active) return;
      fetchQuote().finally(() => {
        if (active) timer = setTimeout(loop, QUOTE_REFRESH_MS);
      });
    };
    loop();
    return () => { active = false; clearTimeout(timer); };
    // Keyed on the leg symbols, not the setup object: a re-render with the same
    // legs must not restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, legSig, enabled]);

  const ticker = setup?.ticker || null;
  const { prices, status } = useMarketStream(enabled ? accountId : null, ticker ? [ticker] : []);
  const tick = ticker ? prices[ticker] : null;
  const streaming = status === "live" && Number(tick?.price) > 0;

  return {
    quote: quote?.net || null,
    // The same numbers before the credit convention is applied: a closing
    // order is a debit, and negating it would show a resting $0.01 buy-back
    // as -$0.01.
    debitQuote: quote?.debit || null,
    legQuotes: quote?.legs || null,
    quoteAt: quote?.at || null,
    spot: streaming ? tick.price : null,
    spotAt: streaming ? tick.at || null : null,
    streaming
  };
}
