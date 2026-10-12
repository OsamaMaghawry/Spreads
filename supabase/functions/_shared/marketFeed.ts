// What the market emails read from Alpaca's data feed: the session calendar,
// pre-market prices and news. The news feed is Benzinga's, carried by Alpaca
// on the same market-data key the product already uses for quotes, so there is
// no second vendor and no second key.

import { alpacaFetch, tradingBase } from "./alpaca.ts";
import type { NewsItem } from "./marketWriter.ts";

const DATA = "https://data.alpaca.markets";

/** Whether the US market opens at all on this New York day (weekends, holidays). */
export async function isTradingDay(account: any, day: string): Promise<boolean> {
  const rows = await alpacaFetch(`${tradingBase(account)}/calendar?start=${day}&end=${day}`, account);
  return Array.isArray(rows) && rows.some((r: any) => r?.date === day);
}

/** Whether the market is open right now. */
export async function marketOpen(account: any): Promise<boolean> {
  const c = await alpacaFetch(`${tradingBase(account)}/clock`, account);
  return c?.is_open === true;
}

/** Stock snapshots by symbol, in chunks the endpoint accepts. */
export async function snapshots(account: any, symbols: string[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    try {
      const r = await alpacaFetch(`${DATA}/v2/stocks/snapshots?symbols=${chunk.map(encodeURIComponent).join(",")}`, account);
      Object.assign(out, r || {});
    } catch (e) {
      // A symbol the feed does not carry fails the whole chunk; the email
      // shows "n/a" for those rather than losing every price.
      console.error(`marketFeed snapshots ${chunk.join(",")}: ${(e as Error)?.message || e}`);
    }
  }
  return out;
}

/**
 * News since `start`, newest first. Without symbols it is the market-wide
 * feed. Symbol lists are chunked so one long list cannot fail the request.
 */
export async function news(account: any, opts: { symbols?: string[]; start: string; pages?: number }): Promise<NewsItem[]> {
  const chunks = opts.symbols?.length
    ? Array.from({ length: Math.ceil(opts.symbols.length / 25) }, (_, i) => opts.symbols!.slice(i * 25, i * 25 + 25))
    : [null];
  const seen = new Map<number, NewsItem>();
  for (const chunk of chunks) {
    let token: string | null = null;
    for (let page = 0; page < (opts.pages ?? 2); page++) {
      const q = new URLSearchParams({ start: opts.start, limit: "50", sort: "desc", include_content: "false" });
      if (chunk) q.set("symbols", chunk.join(","));
      if (token) q.set("page_token", token);
      const r = await alpacaFetch(`${DATA}/v1beta1/news?${q}`, account);
      for (const n of r?.news || []) {
        if (!seen.has(n.id)) {
          seen.set(n.id, {
            id: n.id, headline: n.headline, summary: n.summary || "", source: n.source, url: n.url,
            symbols: (n.symbols || []).map((s: string) => s.toUpperCase()), created_at: n.created_at
          });
        }
      }
      token = r?.next_page_token || null;
      if (!token) break;
    }
  }
  return [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
