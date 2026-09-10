import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import {
  equityDays,
  closesByDay,
  dailyPortfolio,
  fallbackCalendar,
  baseTicker
} from "../_shared/dailyPortfolio.ts";

// Every day's portfolio value, recalculated from the beginning and stored.
//
// All the I/O for the Analysis chart: pull the two broker feeds, hand them to
// the pure walk in _shared/dailyPortfolio.ts, write the rows, serve them back.
// The arithmetic that decides what a day was worth is not in this file.
//
// It syncs itself, like tradeHistory: a call serves what is stored and
// refreshes first when that is stale. The reader decides nothing and there is
// no button.

// Long enough that opening Analysis twice in an afternoon does not re-pull a
// year of bars; short enough that today's point moves while the market does.
// The last stored day is always recomputed anyway (see below), so this governs
// how often the WHOLE series is rebuilt, not how fresh today's mark is.
const STALE_AFTER_MS = 30 * 60 * 1000;

// A year of daily bars per ticker in one page; the loop below follows
// next_page_token regardless, so this is a request-count optimisation and not
// a limit on what is returned.
const BAR_PAGE_LIMIT = 10000;

async function fetchPortfolioHistory(account) {
  // period=1A is the longest daily window Alpaca serves in one call. Rows
  // already stored from earlier pulls are never deleted, so an account older
  // than a year keeps accumulating history rather than losing the front of it.
  const url =
    `${tradingBase(account)}/account/portfolio/history` +
    `?period=1A&timeframe=1D&intraday_reporting=market_hours&pnl_reset=no_reset`;
  return await alpacaFetch(url, account).catch((e) => {
    // A missing account-value line must not lose the reconstruction, which is
    // the half the owner actually asked for. The chart's performance line is
    // built from trades and bars and does not need this call at all.
    console.error("portfolio history failed", e?.message || e);
    return null;
  });
}

async function fetchDailyBars(account, tickers: string[], start: string) {
  const out: Record<string, any[]> = {};
  const list = [...new Set(tickers.filter(Boolean))];
  if (!list.length) return { bars: out };

  // `adjustment=raw` on purpose. Our lot basis is the price as it was actually
  // traded — what the broker charged on assignment — so the marks have to be
  // on the same footing. Split-adjusted closes would be measured against an
  // unadjusted cost and report the split itself as a gain or a loss. The
  // opposite exposure, a split occurring mid-hold, is real and is filed for
  // the bench rather than papered over here.
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    let token: string | null = null;
    do {
      const url =
        `https://data.alpaca.markets/v2/stocks/bars?symbols=${chunk.join(",")}` +
        `&timeframe=1Day&start=${start}&adjustment=raw&limit=${BAR_PAGE_LIMIT}` +
        (token ? `&page_token=${encodeURIComponent(token)}` : "");
      const page = await alpacaFetch(url, account).catch((e) => {
        console.error("bars fetch failed", chunk.join(","), e?.message || e);
        return null;
      });
      if (!page) break;
      for (const symbol of Object.keys(page.bars || {})) {
        out[symbol] = (out[symbol] || []).concat(page.bars[symbol] || []);
      }
      token = page.next_page_token || null;
    } while (token);
  }
  return { bars: out };
}

async function storedSeries(admin, accountId: string) {
  const { data, error } = await admin
    .from("account_equity_daily")
    .select("day, equity, profit_loss, base_value, premium_cum, shares_booked, shares_open, shares_cost, shares_value, performance, unpriced")
    .eq("account_id", accountId)
    .order("day", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function rebuild(admin, account, userId: string) {
  const [{ data: trades }, { data: lots }] = await Promise.all([
    admin
      .from("trade_records")
      .select("close_date, premium_pl, early_close_pl")
      .eq("account_id", account.id)
      .not("close_date", "is", null),
    admin
      .from("stock_lots")
      .select("ticker, qty, acquired_date, acquired_price, disposed_date, disposed_price, realized_pl")
      .eq("account_id", account.id)
  ]);

  const tradeRows = trades || [];
  const lotRows = lots || [];

  // The first thing that ever happened on this account, and one day of runway
  // before it so the line starts at zero rather than at its first jump.
  const starts = [
    ...tradeRows.map((t) => t.close_date),
    ...lotRows.map((l) => l.acquired_date)
  ].filter(Boolean).sort() as string[];
  if (!starts.length) return [];
  const firstActivity = starts[0];
  // Bars from a week earlier, so a lot acquired on day one has a price on day
  // one even if that day is a holiday and the close has to be carried forward.
  const barStart = new Date(new Date(firstActivity).getTime() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  const tickers = [...new Set(lotRows.map((l) => baseTicker(l.ticker)).filter(Boolean))];

  const [history, bars] = await Promise.all([
    fetchPortfolioHistory(account),
    fetchDailyBars(account, tickers, barStart)
  ]);

  const closes = closesByDay(bars);
  const brokerDays = equityDays(history);
  const equityByDay = new Map(brokerDays.map((r) => [r.day, r]));

  // The broker's own session list is the calendar when we have it: it is the
  // account's real trading calendar, so the chart never draws a flat weekend or
  // a point on a holiday. Without it, fall back to the days the price feed
  // carries.
  const calendar = (brokerDays.length
    ? brokerDays.map((r) => r.day)
    : fallbackCalendar(closes, tradeRows, lotRows)
  ).filter((d) => d >= firstActivity);
  if (!calendar.length) return [];

  const walk = dailyPortfolio(calendar, tradeRows, lotRows, closes);

  const rows = walk.map((r) => {
    const broker = equityByDay.get(r.day);
    return {
      account_id: account.id,
      user_id: userId,
      day: r.day,
      equity: broker ? broker.equity : null,
      profit_loss: broker ? broker.profit_loss : null,
      base_value: broker ? broker.base_value : null,
      premium_cum: r.premium_cum,
      shares_booked: r.shares_booked,
      shares_open: r.shares_open,
      shares_cost: r.shares_cost,
      shares_value: r.shares_value,
      performance: r.performance,
      unpriced: r.unpriced,
      source: "broker",
      captured_at: new Date().toISOString()
    };
  });

  // Upsert in batches on the (account_id, day) key. Every day is rewritten on
  // every rebuild rather than only the new ones: a lot's disposal price or a
  // trade's reconstruction can change AFTER the fact, and a stored series that
  // kept the superseded arithmetic for old days would disagree with the
  // account for the rest of its life.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("account_equity_daily")
      .upsert(rows.slice(i, i + 500), { onConflict: "account_id,day" });
    if (error) throw new Error(error.message);
  }

  await admin
    .from("trading_accounts")
    .update({ equity_synced_at: new Date().toISOString() })
    .eq("id", account.id);

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId } = await req.json();
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);

    const syncedAt = account.equity_synced_at ? Date.parse(account.equity_synced_at) : 0;
    const stale = !syncedAt || Date.now() - syncedAt > STALE_AFTER_MS;

    let series = stale ? null : await storedSeries(admin, accountId);
    if (!series || !series.length) {
      await rebuild(admin, account, user.id);
      series = await storedSeries(admin, accountId);
    }

    return jsonResponse({
      series,
      // What the caller is looking at, so the screen can say so rather than
      // implying the line is live.
      syncedAt: new Date().toISOString(),
      days: series.length
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
