import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { houseDataAccount } from "../_shared/marketData.ts";
import { alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import { getSpots, getClosingSpots } from "../_shared/marketPrice.ts";
import { chainLadder } from "../_shared/optionChain.ts";
import { earningsThrough } from "../_shared/earnings.ts";
import { pickExpiries, expiryRow, WINDOW_DAYS } from "../_shared/expectedMove.ts";
import { TICKER_PAGES } from "../_shared/tickerList.ts";
import { inBackground } from "../_shared/background.ts";

// Keeps the public /expected-move pages current, every five minutes.
//
// Each run takes the BATCH stalest stocks: with the market open, a stock is
// re-read about every twenty minutes; after the close, each one gets a single
// final reading at closing prices, then nothing until the next open. Reads go
// through the house data account, and only market data is read with it (see
// marketData.ts). Per stock: one contracts request to learn the expiries in
// the next WINDOW_DAYS near the money, and one snapshot request for each of
// the two expiries a page reports, narrowed to strikes near the price.

const PURPOSE = "ticker_pages";
const BATCH = 25;
const NEAR = 0.06; // strikes within 6% of the price: enough to bracket it on any listed increment
const CONCURRENCY = 5;

const nyDate = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t));
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function expiriesNear(account: any, ticker: string, spot: number, today: string) {
  const url =
    `${tradingBase(account)}/options/contracts?underlying_symbols=${encodeURIComponent(ticker)}&status=active&type=call` +
    `&expiration_date_gte=${plusDays(today, 1)}&expiration_date_lte=${plusDays(today, WINDOW_DAYS)}` +
    `&strike_price_gte=${(spot * (1 - NEAR)).toFixed(2)}&strike_price_lte=${(spot * (1 + NEAR)).toFixed(2)}&limit=10000`;
  const page = await alpacaFetch(url, account);
  return [...new Set((page?.option_contracts || []).map((c: any) => c.expiration_date).filter(Boolean))] as string[];
}

async function snapshotsNear(account: any, ticker: string, spot: number, expiry: string) {
  const out: Record<string, any> = {};
  let token: string | null = null;
  let pages = 0;
  do {
    const url =
      `https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(ticker)}?expiration_date=${expiry}` +
      `&strike_price_gte=${(spot * (1 - NEAR)).toFixed(2)}&strike_price_lte=${(spot * (1 + NEAR)).toFixed(2)}&limit=1000` +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    Object.assign(out, page?.snapshots || {});
    token = page?.next_page_token || null;
    pages += 1;
  } while (token && pages < 5);
  return out;
}

async function priceOne(account: any, ticker: string, spot: number, today: string) {
  const { week, month } = pickExpiries(await expiriesNear(account, ticker, spot, today), today);
  const row = async (expiry: string | null) =>
    expiry ? expiryRow(chainLadder(await snapshotsNear(account, ticker, spot, expiry), spot), spot, expiry, today) : null;
  const [w, m] = await Promise.all([row(week), row(month)]);
  return { week: w, month: m };
}

async function refresh(admin: any) {
  const account = await houseDataAccount(admin);
  if (!account) throw new Error("no house data account is set (app_settings.house_data_account)");
  const clock = await alpacaFetch(`${tradingBase(account)}/clock`, account);
  const open = !!clock?.is_open;

  const { data: rows, error } = await admin.from("ticker_pages").select("ticker, refreshed_at, live");
  if (error) throw new Error(error.message);
  const seen = new Map((rows || []).map((r: any) => [r.ticker, r]));
  const due = TICKER_PAGES
    .map(([ticker, name]) => ({ ticker, name, row: seen.get(ticker) as any }))
    // Open: everything, stalest first (never-read first of all). Closed: only
    // what was last read while the market was open, for its closing reading.
    // Never a first reading while closed: before the open the option quotes
    // are still yesterday's, priced with a day more to run -- and on 22 Oct,
    // before TSLA's and META's overnight reports had come out of them -- so
    // the move came out half again too large.
    .filter((t) => (open ? true : !!t.row?.live))
    .sort((a, b) => (a.row ? Date.parse(a.row.refreshed_at) : 0) - (b.row ? Date.parse(b.row.refreshed_at) : 0))
    .slice(0, BATCH);
  if (!due.length) return { open, refreshed: 0 };

  const today = nyDate();
  const tickers = due.map((t) => t.ticker);
  const [spots, reports] = await Promise.all([
    open ? getSpots(account, tickers) : getClosingSpots(account, tickers),
    earningsThrough(admin, tickers, plusDays(today, 60)).catch(() => ({} as Record<string, any>))
  ]);

  const out: any[] = [];
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(due.slice(i, i + CONCURRENCY).map(async ({ ticker, name }) => {
      const s = spots[ticker];
      const report = reports[ticker] || null;
      const base = {
        ticker, name, live: open, refreshed_at: new Date().toISOString(),
        earnings_date: report?.reportDate || null, earnings_session: report?.session || null
      };
      if (!s?.price) return { ...base, error: s?.reason || "No price for this stock right now." };
      try {
        const { week, month } = await priceOne(account, ticker, s.price, today);
        // getSpots reports asOf in epoch milliseconds; the column is a timestamp.
        const asOf = s.asOf ? new Date(s.asOf).toISOString() : null;
        return { ...base, spot: s.price, spot_as_of: asOf, week, month, error: week || month ? null : "No listed options near today's price in the next six weeks." };
      } catch (e) {
        // Keep the last good numbers on the page: write only what changed.
        return { ...base, error: `Could not read the option chain: ${(e as Error)?.message || e}`.slice(0, 300) };
      }
    }))));
  }
  // Two writes, not one: a bulk upsert fills every column any row names, so
  // a failed row in the same batch would null out its last good numbers.
  const priced = out.filter((r) => "spot" in r);
  const failed = out.filter((r) => !("spot" in r));
  for (const group of [priced, failed]) {
    if (!group.length) continue;
    const { error: upsertError } = await admin.from("ticker_pages").upsert(group, { onConflict: "ticker" });
    if (upsertError) throw new Error(upsertError.message);
  }
  return { open, refreshed: out.length, failed: out.filter((r) => r.error).map((r) => `${r.ticker}: ${r.error}`) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  if (!(await redeemCronTicket(admin, body.ticket, PURPOSE))) return jsonResponse({ error: "not authorised" }, 401);
  // The scheduler only needs the hand-off; the run takes longer than its timeout.
  inBackground(refresh(admin)
    .then((r) => console.log(JSON.stringify({ tickerPages: r })))
    .catch((e) => console.error(`tickerPages: ${(e as Error)?.message || e}`)));
  return jsonResponse({ accepted: true }, 202);
});
