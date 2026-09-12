import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAllAccounts } from "../_shared/accounts.ts";
import { isServiceRole } from "../_shared/serviceRole.ts";
import { paperOnlyMode } from "../_shared/settings.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { selectAllWhere } from "../_shared/paging.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import {
  sessionDay,
  equityDays,
  closesByDay,
  priceProblems,
  dailyPortfolio,
  legsFromRecords,
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

// The day the CURRENT position in each still-open contract was established.
//
// Not the first fill ever, which is what the first version took and which
// back-dates a cost basis that does not belong to that date. One contract
// bought in June at $4.35 and two more in August gives a broker-reported qty of
// 3 and a basis of $1,635; dating that to June makes the walk compute
// `3 x 100 x close - 1635` for every day from June onward, wrong by
// `addedQty x 100 x close - addedCost` on each of them, unbounded and in either
// direction. Re-opening the same strike is worse: open in June, close in July,
// sell it again in August, and dating to June has `premium_cum` carrying July's
// realized result while the walk simultaneously marks the position as open
// across July. The same dollars, twice, with opposite signs.
//
// So fills are walked NEWEST FIRST, accumulating signed quantity until the
// running total reaches the quantity the broker says is held now. The fill that
// completes it is the one that established the current position, and its date
// is the only one the current cost basis belongs to.
//
// A leg whose fills do not reach the current quantity returns NO date rather
// than the oldest one available. That is the honest answer and the walk names
// it; guessing would put a position on days it did not exist.
async function fetchOpenDates(account, legs: any[], after: string) {
  const out: Record<string, string> = {};
  const symbols = legs.map((l) => l.symbol).filter(Boolean);
  if (!symbols.length) return out;

  // Fills per symbol, newest first.
  const fills: Record<string, { day: string; qty: number }[]> = {};

  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    // PAGED. tradeHistory walks this same endpoint twelve times on a real
    // account precisely because one page of 500 is not enough, and an
    // unpaginated read here would silently drop the older half of the fills --
    // which is exactly the half this function is looking for.
    let pageAfter = `${after}T00:00:00Z`;
    for (let page = 0; page < 20; page++) {
      const url =
        `${tradingBase(account)}/orders?status=closed&direction=asc&limit=500` +
        `&after=${encodeURIComponent(pageAfter)}&symbols=${chunk.join(",")}&nested=true`;
      const orders = await alpacaFetch(url, account).catch((e) => {
        console.error("open-date fetch failed", chunk.join(","), e?.message || e);
        return null;
      });
      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        // `nested=true` so a multi-leg order's legs are visible. A spread is
        // submitted as `order_class: "mleg"` and the parent's `symbol` is NULL
        // -- manageOrder says so in its own comment -- so the leg rows are the
        // only place a spread's contract symbol appears.
        for (const r of [o, ...(o?.legs || [])]) {
          const symbol = r?.symbol;
          if (!symbol || !chunk.includes(symbol)) continue;
          const at = String(r?.filled_at || o?.filled_at || "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) continue;
          const qty = Number(r?.filled_qty ?? r?.qty);
          if (!Number.isFinite(qty) || qty === 0) continue;
          const side = String(r?.side || "");
          // Signed by side, so a buy and a sell on the same contract cancel the
          // way the position does.
          const signed = side.startsWith("sell") ? -qty : qty;
          (fills[symbol] = fills[symbol] || []).push({ day: at, qty: signed });
        }
      }

      const last = orders[orders.length - 1];
      const next = last?.submitted_at || last?.created_at;
      if (!next || orders.length < 500) break;
      pageAfter = next;
    }
  }

  for (const leg of legs) {
    const held = Number(leg.qty);
    const rows = (fills[leg.symbol] || []).slice().sort((a, b) => b.day.localeCompare(a.day));
    if (!rows.length || !Number.isFinite(held) || held === 0) continue;
    let running = 0;
    for (const f of rows) {
      running += f.qty;
      // Reached the quantity held now, from the newest side. `>=` for a long
      // and `<=` for a short, because the running total approaches the target
      // from zero in the direction of the position's own sign.
      const reached = held > 0 ? running >= held : running <= held;
      if (reached) { out[leg.symbol] = f.day; break; }
    }
  }
  return out;
}

async function storedSeries(admin, accountId: string) {
  // Paged for the same reason: past a thousand stored days an unbounded read
  // serves the OLDEST thousand, so the chart would end years short of today and
  // say nothing about it.
  return await selectAllWhere(
    admin,
    "account_equity_daily",
    "day, equity, profit_loss, base_value, premium_cum, shares_booked, shares_open, shares_cost, shares_value, options_open, performance, unpriced",
    "day",
    (q) => q.eq("account_id", accountId)
  );
}

async function rebuild(admin, account, userId: string) {
  // PAGED, because PostgREST caps an unbounded select at a thousand rows and
  // reports no error. This function shipped without it: `premium_cum` was
  // silently truncated to whatever thousand trade rows came back, in no defined
  // order -- so two rebuilds could take different thousands and write different
  // values for the same historical day with nothing about the account having
  // changed. One book on staging already holds 1,123 stock lots.
  const [tradeRows, lotRows] = await Promise.all([
    // NO FILTER. `premium_cum` is an account-level sum of option legs closed on
    // or before a day; it carries no attribution, so a withheld row's premium
    // belongs in it. Filtering here made the performance line disagree with the
    // broker's own equity column on the same row, by exactly the money the
    // account really did make or lose. See _shared/integrity.ts.
    //
    // THE LEG COLUMNS ARE READ TOO, and that is the September 12th repair. A
    // closed record is the only record anyone has of a leg that was on the
    // book last month: its two symbols, what each side was opened at, and both
    // dates. Without them the walk's option mark could only ever be built from
    // what is open RIGHT NOW, which is a statement about today applied to
    // years of stored days. See `BookOptionLeg` in _shared/dailyPortfolio.ts.
    //
    // ORDERED BY `id`, NOT `close_date`. A paged read needs a TOTAL order or
    // its page boundaries are undefined: dozens of rows share one close_date,
    // Postgres may break that tie differently on each request, and a row can
    // then be served twice or not at all. This module's own documentation says
    // so; the call site did not follow it.
    selectAllWhere(admin, "trade_records",
      "close_date, open_date, qty, premium_pl, early_close_pl, short_symbol, long_symbol, short_entry, long_entry",
      "id",
      (q) => q.eq("account_id", account.id).not("close_date", "is", null)),
    // Also unfiltered, and for the same reason. Two earlier versions got this
    // wrong in two different directions: filtering the row out dropped the
    // HOLDING PERIOD with it, so every day between acquisition and disposal
    // understated the shares, the cost and the value the account carried; and
    // keeping the row while booking nothing blanked the performance line from
    // the disposal day to the end of the account's life, blaming a price that
    // was never missing. A lot's result is a broker fact; only which trade owns
    // it is ours to doubt, and that doubt lives on the trade row.
    selectAllWhere(admin, "stock_lots",
      "ticker, qty, acquired_date, acquired_price, disposed_date, disposed_price, realized_pl", "id",
      (q) => q.eq("account_id", account.id))
  ]);

  // The first thing that ever happened on this account, and one day of runway
  // before it so the line starts at zero rather than at its first jump.
  const starts = [
    ...tradeRows.map((t) => t.close_date),
    ...lotRows.map((l) => l.acquired_date)
  ].filter(Boolean).sort() as string[];
  if (!starts.length) return { rows: [], skippedWeekend: 0 };
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
    // NOT caught to null. A failed positions read disables three refusals at
    // once -- the ledger/broker quantity check, the ticker-collision check, and
    // the entire open option book, which would then be written as `options_open
    // = 0` over stored history. That is the shape of the very defect the
    // never-null rule was written to close, relocated to the columns where that
    // rule deliberately does not apply. A positions read is not optional for
    // this walk: if it fails, the rebuild fails and the stored series is left
    // exactly as it was.
    alpacaFetch(`${tradingBase(account)}/positions`, account)
  ]);

  const closes = closesByDay(bars);
  const { collided, splitFrom } = priceProblems(bars);
  // `skippedWeekend` is a tripwire on the stamping this reads, not a routine
  // filter — see equityDays. With the session mapping correct it is always 0,
  // so anything else is worth a line in the function log before the run that
  // shortened the series is forgotten.
  const { days: brokerDays, skippedWeekend } = equityDays(history);
  if (skippedWeekend) {
    console.warn(
      `equityHistory: ${skippedWeekend} broker entries mapped onto a weekend for account ${account.id} and were dropped — the 1D stamping may have changed.`
    );
  }
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
  if (!Array.isArray(positions)) {
    throw new Error("Could not read open positions from the broker, so the day-by-day series was left unchanged.");
  }
  const mismatched: string[] = [];
  {
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

  // THE OPTION BOOK, BOTH HALVES.
  //
  // The live half comes from the broker's positions endpoint; the closed half
  // is reconstructed from `trade_records`, which carry each leg's symbol, its
  // entry price and both of its dates.
  //
  // ONLY THE LIVE HALF USED TO BE HERE, and that was the defect. The walk
  // reaches back to the account's first trade, so marking every one of those
  // days with the positions open at the moment of the rebuild meant a leg
  // closed since simply never existed: no cost on the day it was carried, no
  // entry in `unpriced`, and a stored `options_open` of exactly $0.00 on days
  // the account was carrying real option risk. The owner found it after a
  // 4 September expiry he went into short two in-the-money TSLA puts --
  // *"this rebound should be at least two thousand"* -- where the broker's own
  // equity column on the very same row carried their cost and this one did not.
  //
  // The closed legs are bounded by nothing here on purpose: a leg that closed
  // before the calendar starts is skipped by the walk's own `to <= d` test, and
  // filtering by date here as well would be a second rule to keep in step with
  // the first.
  const openLegs = positions.filter((p) => p?.asset_class === "us_option" && Number(p?.qty) !== 0);
  const closedLegs = legsFromRecords(tradeRows);
  const legSymbols = [
    ...new Set([...openLegs.map((p) => p.symbol), ...closedLegs.map((l) => l.symbol)])
  ].filter(Boolean) as string[];
  const [optionCloses, openDates] = await Promise.all([
    fetchOptionBars(account, legSymbols, barStart),
    fetchOpenDates(account, openLegs.map((p) => ({ symbol: p.symbol, qty: Number(p.qty) })), barStart)
  ]);
  const liveLegs = openLegs.map((p) => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    costBasis: Number(p.cost_basis),
    from: openDates[p.symbol] || null,
    // Still open, so there is no day it left the book.
    to: null,
    // Always 100, and an adjusted contract is no exception. occ.ts:25-28
    // settles it against the symbology: a corporate action changes what the
    // contract DELIVERS while the premium multiplier stays 100, which is why
    // the premium on these is exact and is kept.
    //
    // The first version tried to detect adjusted contracts with /^[A-Z]+\d/ and
    // refuse them. Two bugs cancelling: that pattern matches EVERY well-formed
    // OCC symbol -- `[A-Z]+` takes the root and `\d` takes the first digit of
    // the expiry -- so the multiplier was always null, and the walk read null as
    // usable. A guard that never ran, protecting against something that is not
    // a defect.
    multiplier: 100
  }));

  // The broker's own session list is the calendar when we have it: it is the
  // account's real trading calendar, so the chart never draws a flat weekend or
  // a point on a holiday. Without it, fall back to the days the price feed
  // carries.
  const calendar = (brokerDays.length
    ? brokerDays.map((r) => r.day)
    : fallbackCalendar(closes, tradeRows, lotRows)
  ).filter((d) => d >= firstActivity);
  if (!calendar.length) return { rows: [], skippedWeekend };

  const walk = dailyPortfolio(calendar, tradeRows, lotRows, closes, {
    unusable,
    unusableFrom: splitFrom,
    optionLegs: [...liveLegs, ...closedLegs],
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

  return { rows, skippedWeekend };
}

// THE SCHEDULED REBUILD -- every connected account, nobody having to look.
//
// The owner, twice: *"Everything should be synced automatically whether the
// user opened the account or not. It's a trading account. It should be always
// updated as long as it is connected."* And again, on finding five of eight
// accounts with no stored series at all: *"I said multiple times, everything
// should be updated from our side always. If something is not, it's our
// issue."*
//
// He is right, and the first correction was only half applied. Migration 0033
// put TRADE records on a cron for exactly this reason and quotes him saying
// it; this series was left on pull-when-you-look, so an account nobody opened
// had no history -- and the weekly email then had nothing to report for a user
// who had traded 128 times. That is our gap, not the user's, and labelling it
// politely in the email was the wrong fix. This is the fix.
//
// Sequential and stale-aware, the same shape as `syncTrades`: one account's
// rebuild is a year of daily bars per ticker, and running every account at
// once is how an API key gets rate-limited.
async function rebuildAll(admin: any, maxAgeMinutes: number) {
  // Paper only: no daily series is built or stored for a live account. See
  // PAPER_ONLY in _shared/settings.ts.
  const paperOnly = await paperOnlyMode(admin);
  const accounts = await loadAllAccounts(admin, { paperOnly });
  const cutoff = maxAgeMinutes > 0 ? Date.now() - maxAgeMinutes * 60000 : null;
  const due = accounts.filter((a: any) => {
    if (cutoff === null) return true;
    const at = a.equity_synced_at ? Date.parse(a.equity_synced_at) : 0;
    return !at || at < cutoff;
  });

  const results: any[] = [];
  for (const account of due) {
    try {
      // Stamped before the work, as in the single-account path above: the
      // stamp is the in-flight guard, and an empty table forces a retry
      // whatever the stamp says.
      await admin
        .from("trading_accounts")
        .update({ equity_synced_at: new Date().toISOString() })
        .eq("id", account.id);
      const { skippedWeekend } = await rebuild(admin, account, account.user_id);
      const { count } = await admin
        .from("account_equity_daily")
        .select("day", { count: "exact", head: true })
        .eq("account_id", account.id);
      // Reported, not just logged. A tripwire in a function log is a tripwire
      // nobody is standing next to; this one travels back with the run so the
      // caller that started the rebuild sees it.
      results.push({ accountId: account.id, ok: true, days: count ?? null, skippedWeekend });
    } catch (e) {
      // One account's broker refusing must not cost every other account its
      // series. Recorded, and the run continues.
      console.error(`equityHistory: rebuild ${account.id}: ${e?.message || e}`);
      results.push({ accountId: account.id, ok: false, error: String(e?.message || e) });
    }
  }
  return {
    accounts: accounts.length,
    attempted: due.length,
    skippedFresh: accounts.length - due.length,
    failed: results.filter((r) => !r.ok).length,
    results
  };
}

// WHAT THE BROKER'S STAMP ACTUALLY SAYS, read rather than inferred.
//
// `sessionDay` decides which session every stored row belongs to from the hour
// of the stamp in New York, and for as long as this table has existed that
// decision was made on an assumption nobody checked -- which is how every row
// came to be filed one session late. The correction rests on the same kind of
// claim, so it does not get to rest on the same kind of evidence.
//
// The stored `day` column cannot settle it: it IS `sessionDay`'s own output,
// so reading it back only re-reports the assumption. This returns the raw
// integers, beside what they decode to, so the rule can be checked against the
// feed instead of against itself. Writes nothing, and gated exactly like the
// scheduled rebuild.
async function probeStamping(admin: any, accountId: string | null) {
  const paperOnly = await paperOnlyMode(admin);
  const accounts = await loadAllAccounts(admin, { paperOnly });
  const chosen = accountId ? accounts.filter((a: any) => a.id === accountId) : accounts.slice(0, 1);
  if (!chosen.length) return { error: "no account to probe" };

  const out: any[] = [];
  for (const account of chosen) {
    const history = await fetchPortfolioHistory(account);
    const stamps = Array.isArray(history?.timestamp) ? history.timestamp : [];
    // The tail is what matters: the last eight sessions are the ones a reader
    // is looking at, and the newest entry answers a second question -- whether
    // Alpaca appends an intraday point for the session in progress, which
    // would not be offset and must not be shifted like the others.
    const tail = stamps.slice(-8);
    out.push({
      accountId: account.id,
      name: account.name,
      entries: stamps.length,
      stamps: tail.map((t: number) => ({
        t,
        utc: new Date(t * 1000).toISOString(),
        eastern: new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          dateStyle: "short",
          timeStyle: "short"
        }).format(new Date(t * 1000)),
        sessionDay: sessionDay(t)
      }))
    });
  }
  return { probed: out.length, accounts: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json().catch(() => ({}));

    // Read-only, writes nothing, same gate as the scheduled rebuild: it names
    // accounts and reaches a broker, which is not something any signed-in user
    // may do on somebody else's behalf.
    if (payload?.probe === true) {
      const admin = adminClient();
      const allowed =
        isServiceRole(req) || (await redeemCronTicket(admin, payload.ticket, "equity_history"));
      if (!allowed) return jsonResponse({ error: "Forbidden" }, 403);
      return jsonResponse(await probeStamping(admin, payload.accountId ? String(payload.accountId) : null));
    }

    // The scheduled path, and it is gated on the SERVICE ROLE rather than on
    // being signed in. `verify_jwt` only asks whether the caller is somebody,
    // and any signed-in user is somebody -- which would let one user start a
    // rebuild of every account in the product and read back a list of account
    // ids. This asks the question that matters.
    if (payload?.scheduled === true) {
      const admin = adminClient();
      // EITHER credential is sufficient, and neither is the anon key.
      //
      // The service-role bearer is the right answer and is what the Vault row
      // is supposed to hold; on staging that row turned out to contain the
      // ANON key, so the cron could not authorise itself at all. The ticket is
      // minted inside the database by the scheduler and redeemed here through
      // our own service-role connection, which needs no secret to travel
      // between the two. See _shared/cronTicket.ts.
      const allowed =
        isServiceRole(req) || (await redeemCronTicket(admin, payload.ticket, "equity_history"));
      if (!allowed) return jsonResponse({ error: "Forbidden" }, 403);
      return jsonResponse(await rebuildAll(admin, Number(payload.maxAgeMinutes) || 0));
    }

    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId } = payload;
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
