// One spot price for the whole product.
//
// There used to be two. `optionScan.getSpot` preferred the midpoint of the
// latest bid/ask; `syncAccounts` used the latest trade and never a quote mid.
// Same snapshot endpoint, opposite field priority, and so the trade dialog and
// the dashboard could show a $9 difference for the same stock at the same
// moment — which is exactly what happened on a JPM spread, where a scan built
// on $363.54 sold a short put that was actually in the money at $354.33.
//
// A midpoint between a stale bid and a stale ask is an arithmetic artifact, not
// a price: nobody traded there. So a real trade print leads, a quote is used
// only when it corroborates or when there is no print at all, and anything
// weaker is returned but marked untrusted rather than passed off as fact.
//
// The caller decides what to do with `trusted`. The dashboard still shows an
// untrusted price, labelled. The scanner refuses to build a setup on one,
// because that number picks strikes and commits money.

import { alpacaFetch } from "./alpaca.ts";

// A genuine NBBO on anything liquid enough to sell options against is fractions
// of a percent wide. A quote wide enough to move a midpoint materially is not
// describing a market — the JPM quote that produced $363.54 would have had to
// be several dollars wide on a $354 stock.
export const MAX_QUOTE_SPREAD_PCT = 0.01;

// Two independent sources disagreeing by more than this means we do not know
// the price, and guessing is what caused the incident. Refuse instead.
export const MAX_SOURCE_DIVERGENCE_PCT = 0.01;

// Generous, because this only downgrades trust rather than discarding a price.
// Outside market hours everything is older than this, which is correct: the
// dashboard should still render, and the scanner should not be picking strikes.
export const MAX_PRICE_AGE_MS = 30 * 60 * 1000;

const ms = (t) => {
  const parsed = t ? Date.parse(t) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

// Pure so it can be tested against recorded snapshot payloads — see
// marketPrice.test.ts, which includes the shape that caused the incident.
export function spotFromSnapshot(d: any, now = Date.now()) {
  const none = { price: 0, source: "none", asOf: null, trusted: false, reason: "No price data." };
  if (!d) return none;

  const trade = d.latestTrade;
  const tradePrice = trade && trade.p > 0 ? trade.p : null;
  const tradeAt = trade ? ms(trade.t) : null;

  const q = d.latestQuote;
  // Rounded because a midpoint is computed, not observed, and float drift on a
  // three-figure price surfaces as $354.33000000000004 wherever it is shown.
  const quoteMid =
    q && q.bp > 0 && q.ap > 0 && q.ap >= q.bp ? Math.round(((q.bp + q.ap) / 2) * 10000) / 10000 : null;
  // A crossed or absurdly wide quote is rejected outright. `bp > 0 && ap > 0`
  // was the only guard before, and a badly stale quote passes it trivially.
  const quoteUsable = quoteMid !== null && (q.ap - q.bp) / quoteMid <= MAX_QUOTE_SPREAD_PCT;
  const quoteAt = q ? ms(q.t) : null;

  const fresh = (at) => at === null || now - at <= MAX_PRICE_AGE_MS;
  const aged = (price, source, asOf) =>
    fresh(asOf)
      ? { price, source, asOf, trusted: true, reason: null }
      : { price, source, asOf, trusted: false, reason: `Last ${source} is more than ${Math.round(MAX_PRICE_AGE_MS / 60000)} minutes old.` };

  if (tradePrice !== null && quoteUsable) {
    const divergence = Math.abs(quoteMid - tradePrice) / tradePrice;
    if (divergence > MAX_SOURCE_DIVERGENCE_PCT) {
      // The trade is still the better of the two — it is a fact, the mid is a
      // calculation — but when the only two sources disagree this much, the
      // honest answer is that the price is not known.
      return {
        price: tradePrice,
        source: "trade",
        asOf: tradeAt,
        trusted: false,
        reason: `Last trade $${tradePrice.toFixed(2)} and quote mid $${quoteMid.toFixed(2)} disagree by ${(divergence * 100).toFixed(1)}%.`
      };
    }
    return aged(tradePrice, "trade", tradeAt);
  }

  if (tradePrice !== null) return aged(tradePrice, "trade", tradeAt);
  if (quoteUsable) return aged(quoteMid, "quote", quoteAt);

  const close = d.dailyBar && d.dailyBar.c > 0 ? d.dailyBar.c : null;
  if (close !== null) {
    return { price: close, source: "dailyBar", asOf: ms(d.dailyBar.t), trusted: false, reason: "Only a daily bar is available; no live trade or usable quote." };
  }
  return none;
}

// After the close, the close IS the price.
//
// `spotFromSnapshot` above marks anything older than thirty minutes untrusted,
// and that is right for the scanner and the dashboard: those pick strikes and
// commit money against a market that is trading. It is wrong for a report
// written after the bell. The after-close watch used to run at 21:15 UTC, an
// hour and a quarter past a 20:00 close, so EVERY price was stale by
// construction and every short leg came back "price not trusted" -- an email
// that could never say anything else, on any day, about any position.
//
// So this is a second, explicitly named judgement rather than a loosening of
// the first. It prefers the official daily bar, which is the number a trader
// would judge moneyness against once trading has stopped, and only falls back
// to the live ladder when no bar exists. Staleness is not a defect here; it is
// the expected state.
export function closingSpotFromSnapshot(d: any, now = Date.now()) {
  const close = d?.dailyBar && d.dailyBar.c > 0 ? d.dailyBar.c : null;
  if (close !== null) {
    return { price: close, source: "close", asOf: ms(d.dailyBar.t), trusted: true, reason: null };
  }
  // No bar means the name did not trade today at all -- halted, delisted, or a
  // symbol the feed does not carry. Whatever the live ladder makes of it is
  // more honest than inventing a close, and it will say so itself.
  return spotFromSnapshot(d, now);
}

// Snapshots for several tickers in one request, which is what syncAccounts
// already did and what a scan across a watchlist wants.
export async function getSpots(account, tickers: string[], judge = spotFromSnapshot) {
  const out: Record<string, ReturnType<typeof spotFromSnapshot>> = {};
  const list = [...new Set(tickers.filter(Boolean))];
  if (list.length === 0) return out;

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const snap = await alpacaFetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${chunk.join(",")}`,
      account
    ).catch((e) => {
      console.error("snapshots fetch failed", chunk.join(","), e?.message || e);
      return null;
    });
    chunk.forEach((t) => { out[t] = judge(snap ? snap[t] : null); });
  }
  return out;
}

// Same request, judged as an after-close reading. Separate name rather than a
// flag, so a caller cannot reach for it by accident while the market is open.
export async function getClosingSpots(account, tickers: string[]) {
  return getSpots(account, tickers, closingSpotFromSnapshot);
}

export async function getSpot(account, ticker: string) {
  const spots = await getSpots(account, [ticker]);
  return spots[ticker] || spotFromSnapshot(null);
}
