import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import {
  equityDays,
  closesByDay,
  priceProblems,
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
// A rebuild rewrites the WHOLE series, today's point included -- there is no
// cheaper incremental path, so this interval governs how fresh every point is,
// not just the old ones.
const STALE_AFTER_MS = 30 * 60 * 1000;

// A year of daily bars per ticker in one page; the loop below follows
// next_page_token regardless, so this is a request-count optimisation and not
// a limit on what is returned.
const BAR_PAGE_LIMIT = 10000;

async function fetchPortfolioHistory(account) {
  // period=1A is the longest daily window Alpaca serves in one call. Rows
  // already stored from earlier pulls are never deleted, so an account older
  // than a year keeps accumulating history rather than losing the front of it.
  // Two parameters and no more. `intraday_reporting` and `pnl_reset` are
  // intraday concepts and Alpaca rejects some combinations of them outright —
  // a 422 here would cost the account-value line for a setting that does
  // nothing at a daily timeframe.
  const url = `${tradingBase(account)}/account/portfolio/history?period=1A&timeframe=1D`;
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
    // The plan's own data feed decides what the default is, and a plan without
    // the consolidated feed answers 403 rather than falling back. One retry on
    // the free IEX feed rather than losing every mark on the account: an IEX
    // close can differ from the consolidated close by a cent or two on a thin
    // name, which is a far smaller error than no line at all. Tried second, so
    // an account entitled to the better feed always gets it.
    let feed: string | null = null;
    do {
      const url =
        `https://data.alpaca.markets/v2/stocks/bars?symbols=${chunk.join(",")}` +
        `&timeframe=1Day&start=${start}&adjustment=raw&limit=${BAR_PAGE_LIMIT}` +
        (feed ? `&feed=${feed}` : "") +
        (token ? `&page_token=${encodeURIComponent(token)}` : "");
      const page = await alpacaFetch(url, account).catch((e) => {
        console.error("bars fetch failed", chunk.join(","), feed || "default", e?.message || e);
        return null;
      });
      if (!page) {
        // Restart pagination on the other feed. A page_token is issued BY a
        // feed and means nothing to another one, so carrying it across would
        // 4xx and break the loop with a partial series — which the walk would
        // then carry forward silently as though those were real closes.
        if (feed === null) { feed = "iex"; token = null; continue; }
        break;
      }
      for (const symbol of Object.keys(page.bars || {})) {
        out[symbol] = (out[symbol] || []).concat(page.bars[symbol] || []);
      }
      token = page.next_page_token || null;
    } while (token);
  }
  return { bars: out };
}

// Daily closes for OPTION contracts, and the day each position was opened.
//
// The owner, 11 Sep: *"make sure the analysis has the open positions too, not
// only the closed ones."* The walk needs two things per open leg that the
// positions endpoint does not carry: a price history, and an opening date.
//
// Both are one targeted request each. `/v1beta1/options/bars` is the same
// shape as the stock bars endpoint. The opening date comes from the account's
// own closed orders filtered TO THOSE SYMBOLS -- not the whole activity feed,
// which tradeHistory already walks and which would be far too heavy to repeat
// here.
async function fetchOptionBars(account, symbols: string[], start: string) {
  const out: Record<string, Record<string, number>> = {};
  const list = [...new Set(symbols.filter(Boolean))];
  if (!list.length) return out;

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    let token: string | null = null;
    do {
      const url =
        `https://data.alpaca.markets/v1beta1/options/bars?symbols=${chunk.join(",")}` +
        `&timeframe=1Day&start=${start}&limit=${BAR_PAGE_LIMIT}` +
        (token ? `&page_token=${encodeURIComponent(token)}` : "");
      const page = await alpacaFetch(url, account).catch((e) => {
        console.error("option bars fetch failed", chunk.join(","), e?.message || e);
        return null;
      });
      if (!page) break;
      for (const symbol of Object.keys(page.bars || {})) {
        const series = (out[symbol] = out[symbol] || {});
        for (const bar of page.bars[symbol] || []) {
          const d = String(bar?.t || "").slice(0, 10);
          const close = Number(bar?.c);
          // Zero is a real closing price for a worthless option, so only a
          // missing or non-finite value is rejected here. The stock series can
          // drop a zero because a listed equity never closes at nothing; a
          // contract does it every expiry.
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(close) || close < 0) continue;
          series[d] = close;
        }
      }
      token = page.next_page_token || null;
    } while (token);
  }
  return out;
}

// The day each still-open contract was first filled.
//
// Without it a leg cannot be placed in time, and the walk names it rather than
// assuming it existed forever — which would put today's position on days before
// it was opened.
async function fetchOpenDates(account, symbols: string[], after: string) {
  const out: Record<string, string> = {};
  const list = [...new Set(symbols.filter(Boolean))];
  if (!list.length) return out;

  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const url =
      `${tradingBase(account)}/orders?status=closed&direction=asc&limit=500` +
      `&after=${after}T00:00:00Z&symbols=${chunk.join(",")}&nested=true`;
    const orders = await alpacaFetch(url, account).catch((e) => {
      console.error("open-date fetch failed", chunk.join(","), e?.message || e);
      return null;
    });
    if (!Array.isArray(orders)) continue;
    for (const o of orders) {
      // `nested=true` so a multi-leg order's legs are visible: a wheel put
      // opened inside a spread carries its symbol on the leg, not the parent,
      // and every other list endpoint in this repo already passes it.
      const rows = [o, ...(o?.legs || [])];
      for (const r of rows) {
        const symbol = r?.symbol;
        if (!symbol || !list.includes(symbol)) continue;
        const at = String(r?.filled_at || o?.filled_at || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) continue;
        // EARLIEST fill wins. A position added to over several days was opened
        // on the first of them, and the cost basis the broker reports covers
        // all of it.
        if (!out[symbol] || at < out[symbol]) out[symbol] = at;
      }
    }
  }
  return out;
}

async function storedSeries(admin, accountId: string) {
  const { data, error } = await admin
    .from("account_equity_daily")
    .select("day, equity, profit_loss, base_value, premium_cum, shares_booked, shares_open, shares_cost, shares_value, options_open, performance, unpriced")
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

  const [history, bars, positions] = await Promise.all([
    fetchPortfolioHistory(account),
    fetchDailyBars(account, tickers, barStart),
    // The broker's own view of what is held right now. Cheap, and it is the
    // only way the walk can refuse for the same reasons the headline refuses.
    alpacaFetch(`${tradingBase(account)}/positions`, account).catch((e) => {
      console.error("positions fetch failed", e?.message || e);
      return null;
    })
  ]);

  const closes = closesByDay(bars);
  const { collided, splitFrom } = priceProblems(bars);
  const brokerDays = equityDays(history);
  const equityByDay = new Map(brokerDays.map((r) => [r.day, r]));

  // TICKERS THE LEDGER AND THE BROKER DISAGREE ABOUT.
  //
  // `openBook` withholds the whole Whole-view total when the ledger's open lots
  // and the broker's position differ in quantity, and treats two symbols
  // stripping to one base ticker as disqualifying — "a collision is not a mark,
  // it is a question", after a $10 adjusted-contract mark silently replaced a
  // $375 one and published -$31,000 as complete. The chart has to apply the
  // same rule or one page shows a dash in the panel and a confident line above
  // it. A disagreement about the position today is a disagreement about the
  // lot records the whole history is built from, so the ticker is withheld
  // throughout rather than only at the right-hand edge.
  const mismatched: string[] = [];
  if (Array.isArray(positions)) {
    const brokerQty: Record<string, number> = {};
    const brokerCollided = new Set<string>();
    for (const p of positions) {
      if (p?.asset_class !== "us_equity") continue;
      const q = Number(p?.qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      const key = baseTicker(p?.symbol);
      if (brokerQty[key] !== undefined) { brokerCollided.add(key); continue; }
      brokerQty[key] = q;
    }
    const ledgerQty: Record<string, number> = {};
    for (const l of lotRows) {
      if (l.disposed_date) continue;
      const q = Number(l.qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      ledgerQty[baseTicker(l.ticker)] = (ledgerQty[baseTicker(l.ticker)] || 0) + q;
    }
    // Same 0.0001 tolerance as openBook and brokerView: Alpaca supports
    // fractional shares, so exact equality on a float is the wrong test.
    for (const key of Object.keys(ledgerQty)) {
      const theirs = brokerQty[key];
      if (brokerCollided.has(key)) { mismatched.push(key); continue; }
      if (theirs === undefined || Math.abs(theirs - ledgerQty[key]) > 0.0001) mismatched.push(key);
    }
  }

  const unusable = [...new Set([...collided, ...mismatched])];

  // OPTION LEGS STILL OPEN. The half of the book neither `trade_records` (closed
  // by construction) nor `stock_lots` (shares) has ever contained.
  const openLegs = Array.isArray(positions)
    ? positions.filter((p) => p?.asset_class === "us_option" && Number(p?.qty) !== 0)
    : [];
  const legSymbols = openLegs.map((p) => p.symbol).filter(Boolean);
  const [optionCloses, openDates] = await Promise.all([
    fetchOptionBars(account, legSymbols, barStart),
    fetchOpenDates(account, legSymbols, barStart)
  ]);
  const openOptions = openLegs.map((p) => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    costBasis: Number(p.cost_basis),
    from: openDates[p.symbol] || null,
    // Alpaca does not return a multiplier on the position, so it is read from
    // the symbol: an OCC symbol whose root carries a trailing digit is an
    // ADJUSTED contract and no longer delivers 100 shares. The walk refuses
    // those rather than multiplying by a number a corporate action removed --
    // the same refusal the close ticket and the cover allocator already make.
    multiplier: /^[A-Z]+\d/.test(String(p.symbol || "")) ? null : 100
  }));

  // The broker's own session list is the calendar when we have it: it is the
  // account's real trading calendar, so the chart never draws a flat weekend or
  // a point on a holiday. Without it, fall back to the days the price feed
  // carries.
  const calendar = (brokerDays.length
    ? brokerDays.map((r) => r.day)
    : fallbackCalendar(closes, tradeRows, lotRows)
  ).filter((d) => d >= firstActivity);
  if (!calendar.length) return [];

  const walk = dailyPortfolio(calendar, tradeRows, lotRows, closes, {
    unusable,
    unusableFrom: splitFrom,
    openOptions,
    optionCloses
  });

  const capturedAt = new Date().toISOString();

  // ONE WRITER, AND THE NEVER-NULL RULE LIVES IN SQL.
  //
  // The bench's second blocker: a caught broker error — `fetchPortfolioHistory`
  // returns null on any failure — wrote NULL over `equity`, `profit_loss` and
  // `base_value` for every day back to the account's first trade. The next
  // successful pull only reaches back a year. Alpaca will not serve the rest
  // again. An ordinary page load, every thirty minutes, permanently destroying
  // primary broker-reported facts of which this table is the only copy.
  //
  // The first fix was two upserts here, relying on PostgREST generating
  // `ON CONFLICT DO UPDATE SET` for exactly the keys in the payload. That is the
  // documented behaviour and very probably right — but a data-destruction path
  // should not rest on a library's request encoding, so the rule moved into
  // `upsert_account_equity_daily` (migration 0031) where it is written out:
  //
  //   BROKER COLUMNS use coalesce(excluded, existing). A null means "I could
  //   not read it", never "it is nothing", so a stored fact survives every
  //   failed fetch. Nothing rewrites a user's history unasked.
  //
  //   DERIVED COLUMNS are overwritten unconditionally, nulls included — a null
  //   there means "this day could not be valued", which is a real result and
  //   has to be able to replace a previous number.
  //
  // So this side can send every day with whatever it has, and a day the broker
  // did not report simply carries nulls that the function declines to apply.
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
      options_open: r.options_open,
      performance: r.performance,
      unpriced: r.unpriced,
      // What produced THIS row's reconstruction. The column exists so a value we
      // computed can never be mistaken for one the broker reported, and writing
      // "broker" on every row regardless defeated it.
      source: "reconstructed",
      captured_at: capturedAt
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.rpc("upsert_account_equity_daily", {
      p_rows: rows.slice(i, i + 500)
    });
    if (error) throw new Error(error.message);
  }

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

    let builtAt = account.equity_synced_at || null;
    let series = stale ? null : await storedSeries(admin, accountId);
    if (!series || !series.length) {
      // STAMPED BEFORE THE WORK, NOT AFTER, and that ordering is the in-flight
      // guard. Two tabs, or React running an effect twice, otherwise start two
      // concurrent full-year bar pulls for the same account. The writes are
      // idempotent so a race corrupted nothing, but it doubled the broker
      // traffic every time. Stamping first means the second caller sees a fresh
      // account and serves what is stored.
      //
      // A rebuild that then FAILS leaves the stamp on an account with no rows,
      // and that is handled rather than ignored: the `!series.length` test
      // below is what forces the retry, so an empty table always rebuilds
      // whatever the stamp says.
      builtAt = new Date().toISOString();
      await admin
        .from("trading_accounts")
        .update({ equity_synced_at: builtAt })
        .eq("id", account.id);
      await rebuild(admin, account, user.id);
      series = await storedSeries(admin, accountId);
    }

    return jsonResponse({
      series,
      // WHEN THIS SERIES WAS BUILT, not when it was asked for. Reporting "now"
      // for a twenty-nine-minute-old cached series is the exact opposite of
      // what a freshness stamp is for.
      syncedAt: builtAt,
      days: series.length
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
