import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { RefreshCw, ArrowLeft, BarChart3 } from "lucide-react";
import { STRATEGIES, strategyOf, strategyLabel } from "@/lib/strategies";
import { computeStats } from "@/lib/analytics";
import StatCards from "@/components/analysis/StatCards";
import EquityCurveChart from "@/components/analysis/EquityCurveChart";
import BreakdownTable from "@/components/analysis/BreakdownTable";
import StrategyComparison from "@/components/analysis/StrategyComparison";
import StrategyTabs from "@/components/history/StrategyTabs";
import ExportPdfButton from "@/components/analysis/ExportPdfButton";
import DateRangeFilter from "@/components/analysis/DateRangeFilter";
import TradeEndings from "@/components/analysis/TradeEndings";
import OpenBookPanel from "@/components/analysis/OpenBookPanel";
import OpenOptionsPanel from "@/components/analysis/OpenOptionsPanel";
import ProfitHeadline from "@/components/analysis/ProfitHeadline";
import { openBook, openOptions, openMark, orphanedShares } from "@/lib/openBook";
import { splitWithheld, withheldNote } from "@/lib/integrity";
import { capitalAtWork, flowNote } from "@/lib/capital";
import { dailySeries, bookedCurve } from "@/lib/equityCurve";
import { setups as buildSetups } from "@/lib/campaigns";
import SetupBreakdown from "@/components/analysis/SetupBreakdown";
import AnalysisDisclosure from "@/components/analysis/AnalysisDisclosure";
import { LAB } from "@/lib/lab";
import AnalysisLayoutB from "@/components/analysis/AnalysisLayoutB";

export default function AccountAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [equity, setEquity] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState("all");
  // Whole view is the DEFAULT. See ViewSwitch for why that is a statement
  // about what the wheel is, not a precaution.
  // ONE VIEW. The owner, 9 Oct, after four totals on one screen: "No one would
  // buy this." The premium-only / whole-view switch is gone; every figure on
  // the page is closed trades, shares sold included. See ProfitHeadline.
  const view = "whole";
  const [broker, setBroker] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [syncing, setSyncing] = useState(false);
  // The stored daily series, and which of its two lines the chart is drawing.
  const [equitySeries, setEquitySeries] = useState([]);
  const reportRef = useRef(null);

  // Same as the history page: the function refreshes itself when what it holds
  // is stale, so there is nothing here to press.
  const load = useCallback(async () => {
    setError(null);
    try {
      const [hist, live, equityHistory] = await Promise.all([
        invokeFunction("tradeHistory", { accountId: id }),
        invokeFunction("syncAccounts", {}).catch(() => null),
        // The stored day-by-day series. It syncs itself, like tradeHistory: the
        // call serves what is stored and rebuilds first when that is stale.
        //
        // Caught rather than awaited into the failure path on purpose — a
        // broker that will not serve a year of bars must not take the whole
        // Analysis page down with it. The chart falls back to the booked line
        // and says why.
        invokeFunction("equityHistory", { accountId: id }).catch(() => null)
      ]);
      if (hist.data?.error) throw new Error(hist.data.error);
      setData(hist.data);
      setEquitySeries(equityHistory?.data?.series || []);
      setSyncing(Boolean(hist.data?.syncing));
      const acct = live?.data?.accounts?.find((a) => a.id === id);
      setEquity(acct?.equity || 0);
      // The marks were already arriving and nothing read them. `brokerView`
      // carries the broker's own current price per position, and this page
      // already called syncAccounts on load -- so pricing the held shares
      // needs no new request, no second price source and no cron.
      setBroker(acct?.broker || []);
      return hist.data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let timer = null;
    load().then((res) => {
      if (res?.syncing) timer = setTimeout(() => load(), 12000);
    });
    return () => timer && clearTimeout(timer);
  }, [load]);

  const allTrades = data?.trades || [];
  const bounds = useMemo(() => {
    const dates = allTrades.map((t) => t.close_date).filter(Boolean).sort();
    // `count` is the number of CLOSED trades, which is what the page measures
    // and what its empty state must count. `allTrades.length` includes rows
    // with no close date, so an account holding only open positions would have
    // been told it had closed trades it could not find.
    return { min: dates[0], max: dates[dates.length - 1], count: dates.length };
  }, [allTrades]);
  const trades = useMemo(
    () => allTrades.filter((t) => {
      const d = t.close_date || "";
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    }),
    [allTrades, range]
  );

  // ---------------------------------------------------------------------
  // What the page is showing, in one place.
  //
  // ORDER MATTERS THROUGHOUT. useMemo evaluates its callback AND its dependency
  // array during render, so referencing a `const` declared further down throws
  // on the temporal dead zone — the same trap that took down MultiCloseDialog
  // once already. Each block below depends only on the ones above it.
  // ---------------------------------------------------------------------

  // 1. The rows this page is measuring: the date filter, then the strategy tab,
  //    then the audit layer.
  //
  // THE SPLIT HAPPENS ONCE, HERE, and everything below takes `subset`. The
  // first version filtered withheld rows inside `computeStats` alone, which
  // left the headline, the capture breakdown and the booked equity curve --
  // all of which read the same rows through other functions -- publishing a
  // figure the statistics two panels below had already excluded. One page,
  // contradicting itself. See src/lib/integrity.js.
  const filtered = useMemo(
    () => (strategy === "all" ? trades : trades.filter((t) => strategyOf(t) === strategy)),
    [trades, strategy]
  );
  const audit = useMemo(() => splitWithheld(filtered), [filtered]);
  // `subset` is EVERY closed row, withheld included. `computeStats` keeps their
  // money in the totals and leaves them out of the outcome statistics itself —
  // see the header of src/lib/analytics.js for why removing them here published
  // a total outside the range the account's own arithmetic permits.
  const subset = filtered;

  // What the page is narrowed BY — the two controls, kept apart.
  //
  // Two things read this and they need different halves of it, which is why it
  // is not one string. The empty state wants them joined into a phrase; the
  // headline wants to know WHICH control is narrowing, because a date range and
  // a strategy tab exclude the open book for entirely different reasons.
  const narrowing = useMemo(
    () => ({
      strategy: strategy === "all" ? null : strategyLabel(strategy).toLowerCase(),
      when:
        range.from && range.to ? `between ${range.from} and ${range.to}`
          : range.from ? `on or after ${range.from}`
            : range.to ? `on or before ${range.to}`
              : null
    }),
    [strategy, range]
  );
  // The same two, joined, for the empty state: "Nothing closed in covered calls
  // between 2026-09-05 and 2026-09-12."
  const narrowedLabel =
    `${narrowing.strategy ? ` in ${narrowing.strategy}` : ""}${narrowing.when ? ` ${narrowing.when}` : ""}`;

  // 2. The shares still held, and what they are worth now.
  //
  // The book is NOT filtered by strategy or date: an open position is held
  // today whatever window is being read, and hiding it under a date filter
  // would recreate the defect this was built to fix.
  const book = useMemo(() => openBook(data?.stockLots, broker), [data, broker]);

  // The OPTION legs still open, which no figure on this page contained until
  // now. The owner, on his own TSLA book: "did you add the Put position that is
  // open now?" It was not one position -- five open legs, -$390 net, on an
  // account whose headline called itself "the wheel as one strategy" while
  // counting the 210 shares and dropping the put protecting them and the calls
  // written against them.
  const optionBook = useMemo(() => openOptions(broker), [broker]);

  // Everything still open, shares and option legs together, as one number.
  // Null when either half cannot be valued -- a total that covered the shares
  // and quietly dropped an unpriced leg is the same defect one level up.
  const liveMark = useMemo(() => openMark(book, optionBook), [book, optionBook]);
  const hasOpen = book.lots > 0 || optionBook.count > 0;

  // 3. The open book is never added to a closed-trade figure. It is said once,
  // beside the headline (`stillOpen`), on the all-strategies page only.

  // 4. THE CHART: the profit on closed trades, in the order each one closed.
  //
  // It sums the same rows as the headline, so it ends on the headline by
  // construction. The stored daily line it replaces was marked at each day's
  // close, open positions included, and stopped at the last close it had
  // stored -- so it ended on yesterday's marked figure under today's booked
  // one, and the owner read the two as a contradiction ("$88.00" over "Ends at
  // $1,597.00"). The daily series is still read for one thing, max drawdown,
  // below, because a trough between two closes is real even when no trade
  // closed in it.
  const curve = useMemo(() => bookedCurve(subset, view), [subset, view]);
  // The daily marks that measure drawdown: always the performance series,
  // whatever the chart happens to be drawing. Account value is a balance and
  // its drawdown would include every withdrawal.
  const drawdownPoints = useMemo(
    () => (strategy === "all" ? dailySeries(equitySeries, view, "performance", range).points : []),
    [strategy, equitySeries, view, range]
  );



  // 5. EVERY STATISTIC, UNDER THE SELECTED VIEW.
  //
  // The owner: *"When I say whole view, everything should be whole view."* This
  // is where that happens. `computeStats` takes the view and the mark, so win
  // rate, payoff, expectancy, streaks, best and worst, the month and ticker
  // tables and return on equity are all recomputed rather than relabelled.
  //
  // Return on equity is withheld under a strategy tab, and that is unchanged:
  // equity belongs to the account and was being split between strategies by
  // TRADE COUNT — cash-secured puts with 44 trades and $1.36M of collateral got
  // 44% of equity while spreads with 55 trades and $20k got 56%. There is no
  // honest share to use, so a filtered view withholds it. Return on risk, which
  // divides by collateral the strategy really tied up, still answers it.
  // THE DENOMINATOR EVERY RETURN IS MEASURED AGAINST.
  //
  // This used to be `equity` -- the broker's figure for what the account is
  // worth RIGHT NOW, deposits included. The owner found what that costs on his
  // live account: *"It says the pl 500 while it should be more but because I
  // deposited 700 last week. It got reduced!!"* A $700 deposit into a roughly
  // $500 account more than doubled the denominator, for money that had been
  // there five days and had never been in a position.
  //
  // A return is a result divided by the capital that EARNED it, so each
  // transfer is weighted by the share of the window it was actually present
  // for. And when the flows cannot be read at all, this is null and every
  // percentage renders "—": publishing a confident rate over a denominator
  // nobody had checked is the whole defect, and it must not return through its
  // own fix. See src/lib/capital.js.
  const flows = data?.cashFlows ?? null;
  const windowFrom = range.from || bounds.min || null;
  const windowTo = range.to || bounds.max || null;
  const openingEquity = useMemo(() => {
    if (!windowFrom) return null;
    const before = (equitySeries || []).filter((r) => r.day <= windowFrom);
    const row = before.length ? before[before.length - 1] : null;
    return row ? Number(row.equity) : null;
  }, [equitySeries, windowFrom]);
  const capital = useMemo(
    () => (windowFrom && windowTo
      ? capitalAtWork({ startEquity: openingEquity, flows, from: windowFrom, to: windowTo })
      : null),
    [openingEquity, flows, windowFrom, windowTo]
  );
  const transfersNote = useMemo(
    () => (windowFrom && windowTo ? flowNote(flows, windowFrom, windowTo) : null),
    [flows, windowFrom, windowTo]
  );

  const stats = useMemo(
    () =>
      computeStats(subset, strategy === "all" ? (capital || 0) : 0, view, {
        // Closed trades only. What is still open is said once, beside the
        // headline, and added to nothing.
        unrealized: null,
        // Drawdown measured on booked trades alone can only ever be the sum of
        // the option debits: a position that fell and recovered registers
        // nothing, because no trade closed while it happened. The daily line has
        // a mark for every day, so the trough is the trough.
        //
        // DELIBERATELY NOT TIED TO `chartMode`. It was, and toggling the chart
        // to Account value silently reverted Max drawdown to the booked figure
        // -- thousands smaller -- under a caption reading "daily values not
        // stored yet", which was untrue with the daily line drawn 300px below.
        // A statistic must not move because a chart button moved.
        dailyPoints: drawdownPoints
      }),
    [subset, strategy, capital, view, drawdownPoints]
  );

  // The positions behind the rows, grouped back into what they actually were.
  //
  // Built from `subset` so the audit split and the date window both apply, and
  // from the account's WHOLE lot book rather than a windowed slice of it: a
  // setup is linked through the shares, and shares acquired before the window
  // still own the calls written on them inside it. Filtering the lots would
  // silently unlink exactly the positions this grouping exists to hold
  // together. See src/lib/campaigns.js.
  const positionSetups = useMemo(
    () => buildSetups(subset, data?.stockLots),
    [subset, data]
  );
  const splitCount = useMemo(
    () => positionSetups.filter((s) => s.split.length > 0).length,
    [positionSetups]
  );

  const comparison = useMemo(() => {
    // Only when looking at everything. Filtering to one strategy and then
    // printing a table of all of them contradicts the filter — on screen it is
    // merely odd, but the PDF is the artifact that gets sent to someone, and a
    // report headed "Cash-secured puts" that lists every other strategy
    // underneath is not the report that was asked for.
    if (strategy !== "all") return [];
    return [{ label: "All strategies", trades, whole: true }]
      .concat(
        STRATEGIES.map((s) => ({
          label: s.label,
          trades: trades.filter((t) => strategyOf(t) === s.key),
          whole: false
        })).filter((r) => r.trades.length > 0)
      )
      .map((r) => ({
        label: r.label,
        // No row takes the mark on what is still open, the all-strategies row
        // included, so that row is the sum of the rows under it. The owner,
        // shown five rows summing to +$1,506.91 under an "All strategies" of
        // -$103.59: *"This calculation doesn't add up, does it?"* It did not.
        // The mark is added once, below the table, as its own line -- see
        // `openMark` on StrategyComparison.
        // The all-strategies row is the same population as the cards above, so
        // it takes the same drawdown basis. Without this the card and the row
        // printed two different Max drawdowns under one name on one screen.
        stats: computeStats(r.trades, r.whole ? equity : 0, view, {
          unrealized: null,
          dailyPoints: r.whole ? drawdownPoints : null
        })
      }))
      .filter((r) => r.stats);
  }, [trades, strategy, equity, view, drawdownPoints]);

  const provisionalCount = useMemo(() => subset.filter((t) => t.provisional).length, [subset]);

  // 6. The headline: profit on closed trades (ProfitHeadline).
  // Share results credited to no trade row at all -- unbounded, and the exact
  // gap between the chart's own reading of the lots and the headline's reading
  // of the trade rows. Measured over the WHOLE ledger, like the book, because
  // an unmatched lot has no strategy and no close date to filter it by.
  const orphanFigure = useMemo(
    () => orphanedShares(data?.stockLots, allTrades),
    [data, allTrades]
  );
  // What is still open, said once beside the headline and added to nothing.
  // Only on the all-strategies page: the open book belongs to the account, and
  // a covered-call tab cannot own the put that bought the shares. Null when
  // part of it has no price -- the line then says so rather than a number.
  const stillOpen = strategy === "all" && hasOpen ? liveMark : undefined;
  // WHAT THE HEADLINE IS MISSING, in dollars, beside the headline.
  //
  // The count alone was not enough and the bench said so plainly: on this
  // account one withheld row is $189 against an $814 total, so "1 withheld"
  // reads like a rounding note when it is a fifth of the figure. The note also
  // names the authority the reader can check against -- their broker's total
  // DOES include this money, because the money moved; what we cannot say is
  // which trade it belongs to.
  // ONE disclosure element, handed to whichever layout renders it. Built
  // here rather than inside each layout so the two cannot diverge on a
  // compliance surface — see AnalysisDisclosure.
  const disclosure = (
    <AnalysisDisclosure
      view={view}
      stats={stats}
      book={book}
      optionBook={optionBook}
      orphanFigure={orphanFigure}
      provisionalCount={provisionalCount}
    />
  );

  const withheldLine = withheldNote(audit, view);
  // The count and the dollars, in the view being shown, in one object so the
  // cards and the note cannot quote different numbers.
  const withheldFigure = { count: audit.count };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="text-sm">Crunching performance…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link to={`/account/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to account
          </Link>
          <h1 className="font-heading text-xl font-bold tracking-[-0.02em] text-dm-text mt-1">
            {data?.account ? `${data.account.name} — Analysis` : "Analysis"}
          </h1>
          {stats && (
            <p className="text-xs text-slate-500 mt-0.5">
              {/* "equity NOW": this is the broker's live figure, not the
                  window's. Under a date range the chart below ends on the
                  range's last day and says so; two "account equity" numbers
                  on one screen, one live and one dated, read as a
                  contradiction unless each says which it is. */}
              {stats.firstDate} → {stats.lastDate} · equity now {equity ? `$${equity.toLocaleString()}` : "unavailable"}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {syncing && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Updating from your broker…
            </span>
          )}
          <Link
            to={`/account/${id}/history`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
          >
            View trade history
          </Link>
          {stats && (
            <ExportPdfButton
              targetRef={reportRef}
              title={data?.account ? `${data.account.name} — Performance Analysis` : "Performance Analysis"}
              subtitle={`${stats.firstDate} → ${stats.lastDate}${range.from || range.to ? " (filtered)" : ""} · ${strategy === "all" ? "All strategies" : strategyLabel(strategy)} · Closed trades (options and shares sold) · equity ${equity ? `$${equity.toLocaleString()}` : "n/a"} · generated ${new Date().toLocaleString()}`}
              isPaper={!!data?.account?.is_paper}
              viewLabel="Closed trades (options and shares sold)"
              // The on-screen note is one block near the top of the flow, so
              // it lands on page one and nowhere else. Pages two onward are the
              // by-month and by-ticker schedules — the pages someone forwards
              // to an accountant — and they need the qualification on them,
              // not a pointer to a page that is no longer attached.
              withheld={audit.count ? { count: audit.count, names: audit.names } : null}
            />
          )}
        </div>
      </div>

      <DateRangeFilter from={range.from} to={range.to} bounds={bounds} onChange={setRange} />

      {error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm text-rose-700">{error}</div>
      ) : !stats ? (
        // "No closed trades to analyze yet" was the only thing this branch
        // could say, and on a filtered page it is false: an account with 150
        // closed trades that happens to have closed none this week was being
        // told it had never traded. The 1W preset makes that the common case
        // rather than the rare one -- a week with nothing closed in it is
        // ordinary -- so the empty state has to distinguish "nothing at all"
        // from "nothing in THIS window", and leave the way back visible.
        <>
          {bounds.count > 0 && <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />}
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-center">
            <BarChart3 className="w-8 h-8 text-slate-400" />
            {bounds.count === 0 ? (
              <p className="text-slate-500 text-sm max-w-sm">No closed trades to analyze yet.</p>
            ) : (
              <>
                <p className="text-slate-600 text-sm max-w-sm">
                  Nothing closed{narrowedLabel}. This account has{" "}
                  <strong>{bounds.count}</strong> closed trade{bounds.count === 1 ? "" : "s"} in all,
                  the most recent on {bounds.max}.
                </p>
                {(range.from || range.to) && (
                  <button
                    onClick={() => setRange({ from: "", to: "" })}
                    className="text-xs text-slate-600 underline hover:text-slate-900"
                  >
                    Clear the date range
                  </button>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <StrategyTabs trades={trades} active={strategy} onChange={setStrategy} />
          {/* TWO LAYOUTS, ONE SET OF FIGURES.
              Everything above this line — the loading, the windowing, the audit
              split, every computed statistic — is shared. Only the arrangement
              differs, so the lab layout cannot show a different number from the
              one production shows; if it ever did, that would be a bug in the
              arrangement and not a second opinion about the money.
              LAB is off in the production build and the module is stubbed out
              of that bundle entirely. See src/lib/lab.js. */}
          {LAB ? (
            <div ref={reportRef} className="bg-white">
              <AnalysisLayoutB
                isPaper={Boolean(data?.account?.is_paper)}
                withheldLine={withheldLine}
                transfersNote={transfersNote}
                view={view}
                stillOpen={stillOpen}
                stats={stats}
                withheldFigure={withheldFigure}
                setupCount={positionSetups.length}
                curve={curve}
                book={book}
                optionBook={optionBook}
                positionSetups={positionSetups}
                comparison={comparison}
                splitCount={splitCount}
                subset={subset}
                disclosure={disclosure}
              />
            </div>
          ) : (
          <div ref={reportRef} className="space-y-5 bg-white">
            {/* Inside reportRef so it is captured in the export as well. A
                simulated account must not produce a document that reads like
                a record of real money. */}
            {data?.account?.is_paper && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
                Paper account &mdash; every figure below is simulated, not real money.
              </div>
            )}
            {/* WHAT THIS PAGE LEFT OUT, unconditionally and INSIDE reportRef.
                The first version hung this off the headline's note, which only
                renders when ViewSwitch does — and ViewSwitch is gated on the
                account holding something open. An account holding nothing, the
                steady state of the account this was built for, published the
                reduced total with no explanation anywhere, and the PDF is a
                raster of this DOM so it would have exported the same way. */}
            {withheldLine && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
                {withheldLine}
              </div>
            )}
            {/* MONEY YOU MOVED, said beside the figures it changes the meaning
                of. A deposit is not a gain and a withdrawal is not a loss, and
                a reader who can see a step in the account-value line is owed
                the reason for it on the same screen. Inside reportRef, so the
                export carries it too. */}
            {transfersNote && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
                {transfersNote}
              </div>
            )}
            {/* The one number, inside reportRef so the export carries it. */}
            <div className="rounded-xl border border-dm-line bg-white px-4 py-4">
              <ProfitHeadline figure={stats.totalPL} trades={stats.trades} spanDays={stats.spanDays} stillOpen={stillOpen} />
            </div>
            {book.lots > 0 && <OpenBookPanel book={book} priced={view === "whole"} />}
            <OpenOptionsPanel book={optionBook} priced={view === "whole"} />
            {/* ABOVE the strategy table on purpose. The strategy table is the
                one that splits a wheel in half, and its own caveat points up
                here -- a reader must meet the whole position before the table
                that cannot state it. */}
            <SetupBreakdown setups={positionSetups} />
            {comparison.length > 1 && (
              <StrategyComparison rows={comparison} splitCount={splitCount} />
            )}
            <StatCards stats={stats} withheld={withheldFigure} />
            <EquityCurveChart curve={curve} view={view} />
            <TradeEndings trades={subset} view={view} />
            <div className="grid gap-4 lg:grid-cols-2">
              {/* `computeStats` buckets these under the selected view at the
                  source, so there is no second pass here correcting the first
                  one -- which is what `viewBreakdown` used to be. */}
              <BreakdownTable
                title={view === "premium" ? "By month — option legs" : "By month"}
                keyLabel="Month" keyField="month"
                rows={stats.byMonth}
              />
              <BreakdownTable
                title={view === "premium" ? "By ticker — option legs" : "By ticker"}
                keyLabel="Ticker" keyField="ticker"
                rows={stats.byTicker}
              />
            </div>

            {/* Inside reportRef on purpose. The site-wide disclaimer sits in
                Layout, outside the captured element, so the exported PDF left
                here carrying an account name, a date range and a table of
                monthly realized P/L — a document shaped exactly like a tax
                schedule, saying nothing about what it is. This is the page a
                user forwards to their accountant in March. */}
            {disclosure}
          </div>
          )}
        </>
      )}
    </div>
  );
}