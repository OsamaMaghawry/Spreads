import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { invokeFunction } from "@/lib/functions";
import { fmtMoney } from "@/lib/format";
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
import CaptureBreakdown from "@/components/analysis/CaptureBreakdown";
import OpenBookPanel from "@/components/analysis/OpenBookPanel";
import OpenOptionsPanel from "@/components/analysis/OpenOptionsPanel";
import ViewSwitch from "@/components/analysis/ViewSwitch";
import { openBook, openOptions, openMark, premiumOnly, realizedShares, orphanedShares } from "@/lib/openBook";
import { analysisHeadline } from "@/lib/headline";
import { splitWithheld, withheldNote } from "@/lib/integrity";
import { capitalAtWork, flowNote } from "@/lib/capital";
import { dailySeries, bookedCurve } from "@/lib/equityCurve";

export default function AccountAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [equity, setEquity] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState("all");
  // Whole view is the DEFAULT. See ViewSwitch for why that is a statement
  // about what the wheel is, not a precaution.
  const [view, setView] = useState("whole");
  const [broker, setBroker] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [syncing, setSyncing] = useState(false);
  // The stored daily series, and which of its two lines the chart is drawing.
  const [equitySeries, setEquitySeries] = useState([]);
  const [chartMode, setChartMode] = useState("performance");
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

  // 3. When a whole-account figure may be added to a filtered one: never.
  //
  // `stats` is filtered by the strategy tab and the date range; the book
  // deliberately is not. Adding an all-time figure to a windowed one produces a
  // number that answers nothing — on the covered-call tab it reported -$2,221
  // of covered-call realized plus the mark on the entire equity book. The open
  // book panel stays visible and unfiltered; it is the ADDITION that is
  // withheld, the same discipline return on equity already applies.
  const scoped = strategy === "all" && !range.from && !range.to;
  const scopedUnrealized = scoped ? liveMark : null;

  // 4. THE CHART, from the stored daily series.
  //
  // `equityHistory` recalculates the portfolio for every session day since the
  // account's first trade and stores it, so there is a real mark for every day
  // rather than one step bolted onto today. A date range slices and rebases
  // that series cleanly.
  //
  // The one case it cannot answer is a STRATEGY TAB: a share lot is held by the
  // account, not by a strategy, and attributing a day's move on 300 WMT shares
  // to covered calls rather than to the puts that bought them would be an
  // invention. There the chart falls back to the money that strategy booked, in
  // the order it booked it, and says so on screen.
  const dailyChart = useMemo(
    () => dailySeries(equitySeries, view, chartMode, range),
    [equitySeries, view, chartMode, range]
  );
  const useDaily = strategy === "all" && dailyChart.points.length > 0;
  const curve = useMemo(
    () => (useDaily ? dailyChart : bookedCurve(subset, view)),
    [useDaily, dailyChart, subset, view]
  );
  const hasValueSeries = useMemo(
    () => equitySeries.some((r) => r?.equity !== null && r?.equity !== undefined),
    [equitySeries]
  );
  // The daily marks that measure drawdown: always the performance series,
  // whatever the chart happens to be drawing. Account value is a balance and
  // its drawdown would include every withdrawal.
  const drawdownPoints = useMemo(
    () => (strategy === "all" ? dailySeries(equitySeries, view, "performance", range).points : []),
    [strategy, equitySeries, view, range]
  );

  const chartFallbackReason = useDaily
    ? null
    : equitySeries.length === 0
      ? "Day-by-day values are not stored for this account yet. This line is the money booked, trade by trade; it will be redrawn from daily values after the next sync."
      : `Day-by-day marks cover the whole account, not one strategy — shares are held by the account, not by the ${strategyLabel(strategy)} tab. This line is the money that strategy booked, in the order it booked it.`;

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
        unrealized: scopedUnrealized,
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
    [subset, strategy, capital, view, scopedUnrealized, drawdownPoints]
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
        // The comparison follows the view too. A per-strategy row takes no mark:
        // the book is not attributable to a strategy, and only the
        // all-strategies row covers the same account the mark does.
        // The all-strategies row is the same population as the cards above, so
        // it takes the same drawdown basis. Without this the card and the row
        // printed two different Max drawdowns under one name on one screen.
        stats: computeStats(r.trades, r.whole ? equity : 0, view, {
          unrealized: r.whole ? scopedUnrealized : null,
          dailyPoints: r.whole ? drawdownPoints : null
        })
      }))
      .filter((r) => r.stats);
  }, [trades, strategy, equity, view, scopedUnrealized, drawdownPoints]);

  const provisionalCount = useMemo(() => subset.filter((t) => t.provisional).length, [subset]);

  // 6. The headline figure for the selected view, and why it is ever withheld.
  const premiumFigure = useMemo(() => premiumOnly(subset), [subset]);
  // The bridge between the two realized numbers on this page. Premium only is
  // -$1,686 while Realized P/L reads -$1,244; the $442 difference is the share
  // result of lots already SOLD, and nothing on screen explained it. Invisible
  // on a book that has sold nothing, and it appears the moment one wheel lot is
  // closed.
  const soldSharesFigure = useMemo(() => realizedShares(subset), [subset]);
  // Share results credited to no trade row at all -- unbounded, and the exact
  // gap between the chart's own reading of the lots and the headline's reading
  // of the trade rows. Measured over the WHOLE ledger, like the book, because
  // an unmatched lot has no strategy and no close date to filter it by.
  const orphanFigure = useMemo(
    () => orphanedShares(data?.stockLots, allTrades),
    [data, allTrades]
  );
  // The headline, and what it is allowed to claim. See src/lib/headline.js for
  // why this stopped being a dash: the mark cannot be filtered, but the booked
  // total can, and the honest answer is to show the booked total under a label
  // that says "booked" rather than to withhold the only number there is.
  //
  // The one refinement the shared helper cannot make is WHICH part of the open
  // book has no price, so that sentence is appended here where the book is.
  const headline = analysisHeadline({
    view,
    stats,
    premium: premiumFigure,
    hasOpen,
    liveMark,
    narrowing
  });
  // WHAT THE HEADLINE IS MISSING, in dollars, beside the headline.
  //
  // The count alone was not enough and the bench said so plainly: on this
  // account one withheld row is $189 against an $814 total, so "1 withheld"
  // reads like a rounding note when it is a fifth of the figure. The note also
  // names the authority the reader can check against -- their broker's total
  // DOES include this money, because the money moved; what we cannot say is
  // which trade it belongs to.
  const withheldLine = withheldNote(audit, view);
  // The count and the dollars, in the view being shown, in one object so the
  // cards and the note cannot quote different numbers.
  const withheldFigure = { count: audit.count };
  // THE CHART AND THE HEADLINE, reconciled where they differ.
  //
  // Only one configuration makes them disagree, and it is exactly the one the
  // headline used to blank: all strategies, whole view, a date window, on the
  // stored daily line. There the headline is realized money for the window and
  // the line is marked at each day's close, so it also carries the open book's
  // movement across the window. Under a strategy tab `useDaily` is false and
  // the chart is `bookedCurve` over the same rows the headline sums, so the
  // two tie to the cent and this must stay silent.
  //
  // The sentence names the cause and NOT a number: the gap is the open book's
  // move plus whatever `orphanFigure` contributes, and attributing all of it to
  // one of the two would be a fresh piece of false precision.
  const chartReconcileNote =
    view === "whole" && useDaily && chartMode === "performance" &&
    (range.from || range.to) && stats && !stats.includesUnrealized
      ? "This line is marked at each day's close, so it also moves with the positions still open while the window runs. The figure at the top of the page counts only what closed, which is why the line does not end on it."
      : null;

  const unpricedDetail =
    hasOpen && liveMark === null
      ? book.unrealized === null && book.lots > 0
        ? " Part of the share book has no price."
        : " The broker returned no value for an open option leg."
      : "";
  // The withheld line joins the headline's own note, because it qualifies the
  // headline FIGURE -- the money card -- and not the trade count two panels
  // down where the first version put it.
  // The withheld line is NOT appended here. It has its own banner, which
  // renders whether or not this page shows a view switch — see below.
  const headlineNote = headline.note ? `${headline.note}${unpricedDetail}` : null;

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
              {stats.firstDate} → {stats.lastDate} · account equity {equity ? `$${equity.toLocaleString()}` : "unavailable"}
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
              subtitle={`${stats.firstDate} → ${stats.lastDate}${range.from || range.to ? " (filtered)" : ""} · ${strategy === "all" ? "All strategies" : strategyLabel(strategy)} · ${view === "whole" ? "Whole view (options + shares)" : "Premium only (option legs)"} · equity ${equity ? `$${equity.toLocaleString()}` : "n/a"} · generated ${new Date().toLocaleString()}`}
              isPaper={!!data?.account?.is_paper}
              viewLabel={view === "whole" ? "Whole view (options + shares)" : "Premium only (option legs)"}
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
            {/* The switch, and the book it governs. Both sit INSIDE reportRef:
                an export has to say which view produced it, or two PDFs of the
                same week disagree with nothing on either to explain why.

                Shown whenever there is a book to switch OVER. Below that, there
                is one honest reading of the page and a control offering a
                second one would be theatre. */}
            {hasOpen && (
              <div className="space-y-2">
                <ViewSwitch
                  value={view}
                  onChange={setView}
                  figure={headline.figure}
                  figureLabel={headline.label}
                  note={headlineNote}
                  marked={view === "premium" || Boolean(stats?.includesUnrealized)}
                />
                {/* The one thing the switch does NOT change, said plainly.
                    Everything else on this page now recomputes; credit capture
                    cannot, because it asks what share of the premium sold was
                    kept and folding assigned shares into that produces a ratio
                    above its own maximum. */}
                <p className="text-xs text-slate-500 leading-relaxed">
                  Win rate, payoff, expectancy, streaks and the tables below are measured on{" "}
                  {view === "whole" ? "whole closed positions" : "closed option legs alone"}, so they
                  change with this control. Credit capture does not: it is the share of premium sold
                  that was kept, and shares have no premium to keep.
                  {view === "premium" && Math.abs(soldSharesFigure) >= 0.005 && (
                    <>
                      {" "}Shares already sold {soldSharesFigure >= 0 ? "added" : "took off"}{" "}
                      <strong>{fmtMoney(soldSharesFigure)}</strong>, which is why the whole-view
                      total differs by more than the mark on what is still held.
                    </>
                  )}
                  {/* The clause "and is the view to use against a 1099-B" stood
                      here and is deleted, not softened. Premium only EXCLUDES
                      share sales, which are the largest lines on a wheel
                      trader's 1099-B, and on an assigned put the premium is not
                      option income at all -- it reduces the stock basis. It also
                      contradicted the tax paragraph below, which already tells
                      the reader to reconcile against the broker's own 1099-B.
                      One screen must not carry two instructions about a tax
                      filing. */}
                </p>
              </div>
            )}
            {book.lots > 0 && <OpenBookPanel book={book} priced={view === "whole"} />}
            <OpenOptionsPanel book={optionBook} priced={view === "whole"} />
            {comparison.length > 1 && <StrategyComparison rows={comparison} />}
            <StatCards stats={stats} withheld={withheldFigure} />
            <EquityCurveChart
              curve={curve}
              view={view}
              mode={chartMode}
              onModeChange={setChartMode}
              hasValueSeries={hasValueSeries && useDaily}
              fallbackReason={chartFallbackReason}
              reconcileNote={chartReconcileNote}
            />
            <CaptureBreakdown trades={subset} />
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">DeltaMint — economic performance report. Not a tax document.</span>{" "}
              Figures cover only positions an option opened or closed and exclude the rest of this
              account.{" "}
              {/* VIEW-AWARE, because the block named a card that does not exist
                  under one of them and described figures that are no longer
                  what it says they are. Under Premium only there is no card
                  called Realized P/L; under Whole view three of the things it
                  called "money booked" now carry a mark-to-market. */}
              {view === "premium" ? (
                <>
                  This view shows the option legs alone and excludes every share sale, which are the
                  largest lines on a wheel trader&rsquo;s 1099-B. Nothing here is taxable gain or loss:
                  wash sales, straddle rules, Section 1256 treatment and the premium&rsquo;s effect on
                  stock basis at assignment are not applied.
                </>
              ) : (
                <>
                  P/L here is not taxable gain or loss: wash sales, straddle rules, Section 1256
                  treatment and cost-basis adjustments on assignment are not applied.
                  {/* "on shares still held" named the WRONG HALF. On a book
                      carrying -$287.25 of mark, the share half was +$102.75 and
                      the option half -$390.00 -- it named the half with the
                      opposite sign and omitted the half that dominates. This
                      block sits inside reportRef, so it is what the exported
                      PDF says. */}
                  {stats?.includesUnrealized && (
                    <> The total, return on equity and return on risk also include an{" "}
                    <strong>unrealized</strong> mark on positions still open
                    {book.lots > 0 && optionBook.count > 0
                      ? " — shares held and option legs not yet closed"
                      : optionBook.count > 0
                        ? " — option legs not yet closed"
                        : " — shares still held"}
                    . Nothing is owed on a position that has not been closed, and that figure moves
                    with the market until it is.</>
                  )}
                </>
              )}
              {/* Share results that reached no trade row, so no statistic here
                  counts them. Real money, in the account, invisible to every
                  figure on this page -- and the daily chart reads the lots
                  directly and DOES see it, so unsaid the two disagree in
                  silence. */}
              {Math.abs(orphanFigure) >= 0.005 && (
                <> {fmtMoney(orphanFigure)} of share results could not be matched to an option in this
                account &mdash; shares bought or sold outside DeltaMint, or a position that began before
                the broker&rsquo;s activity feed does. That money is in the account and in none of the
                figures above.</>
              )}
              {provisionalCount > 0 && (
                <> {provisionalCount} position{provisionalCount === 1 ? "" : "s"} closed by assignment
                {provisionalCount === 1 ? " still has" : " still have"} shares held, so
                {provisionalCount === 1 ? " its result is" : " their results are"} not final. Anything
                that calls a trade a win or a loss &mdash; win rate, profit factor, expectancy, payoff,
                average and largest win and loss, per-trade return, the streaks, and the win-rate
                columns in the tables above &mdash; is measured without
                {provisionalCount === 1 ? " it" : " them"}. Anything that measures money booked &mdash;
                the totals, the equity curve, drawdown, and the per-day and per-month figures &mdash;
                counts {provisionalCount === 1 ? "it" : "them"} in full.</>
              )}{" "}
              Reconcile against your broker&rsquo;s Form 1099-B before using any figure for a return.
            </div>
          </div>
        </>
      )}
    </div>
  );
}