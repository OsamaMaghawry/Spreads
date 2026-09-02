import { useState, useMemo } from "react";
import { fmtMoney, fmtPct } from "@/lib/format";
import SpreadTable from "./SpreadTable";
import PositionCards from "./PositionCards";
import OrderGroup from "./OrderGroup";
import useMarketStream from "@/lib/useMarketStream";
import { AlertTriangle, LayoutGrid, Table2 } from "lucide-react";

// A streamed trade older than this is not a live price any more. Thirty seconds
// is far inside the 30-minute staleness bound the server's trust ladder uses —
// the point here is not to re-judge the price but to stop claiming "live" for a
// tick that arrived before the market went quiet.
const LIVE_MAX_AGE_MS = 30_000;

export default function AccountSection({ account, onCloseSpread, onOrdersChanged }) {
  const [view, setView] = useState("simple");
  const [tab, setTab] = useState("positions");
  const orders = account.orders || [];

  const tickers = useMemo(
    () => [...new Set((account.spreads || []).map((s) => s.ticker).filter(Boolean))],
    [account.spreads]
  );
  const { prices, status } = useMarketStream(account.ok ? account.id : null, tickers);

  // Overlay the streamed spot onto each position, so every card, table row and
  // strike ladder reads the same number without any of them knowing a socket
  // exists. Only a fresh trade overrides the synced value — a stale tick is left
  // alone rather than presented as current, which is the same posture the
  // server takes when it refuses to judge an untrusted price.
  const spreads = useMemo(() => {
    if (status !== "live") return account.spreads || [];
    const now = Date.now();
    return (account.spreads || []).map((s) => {
      const live = prices[s.ticker];
      const at = live?.at ? Date.parse(live.at) : NaN;
      const fresh = live?.price > 0 && isFinite(at) && now - at < LIVE_MAX_AGE_MS;
      // prevClose rides along untouched, so today's move is recomputed against
      // the tick rather than frozen at the last sync.
      return fresh ? { ...s, stockPrice: live.price, spotSource: "stream", spotTrusted: true } : s;
    });
  }, [account.spreads, prices, status]);
  // Working and partially-filled orders are the ones that can still cost money,
  // so the tab badge counts those rather than everything from today.
  const workingCount = orders.filter(
    (o) => !["filled", "canceled", "cancelled", "expired", "rejected"].includes(String(o.status).toLowerCase())
  ).length;
  const stats = [
    { label: "Equity", value: fmtMoney(account.equity) },
    {
      label: "Equity at Exp",
      value: account.equityAtExp != null ? fmtMoney(account.equityAtExp) : "—",
      tone:
        account.equityAtExp > account.equity
          ? "text-emerald-600"
          : account.equityAtExp < account.equity
            ? "text-rose-600"
            : ""
    },
    { label: "Cash", value: fmtMoney(account.cash) },
    { label: "Options BP", value: fmtMoney(account.optionsBuyingPower) },
    // The number a wheel trader reads: cash held against short puts plus the
    // shares backing covered calls. Distinct from max loss, and only shown
    // when there is any -- a spreads-only account has nothing to add here.
    ...(account.totals?.collateral > 0
      ? [{
          label: "Capital tied up",
          value: fmtMoney(account.totals.collateral),
          title: "Cash securing short puts plus shares backing covered calls, at current value."
        }]
      : []),
    {
      label: "Risk / Equity",
      // A naked short call has no maximum loss, so this percentage is a floor
      // rather than the figure. Marking it is the difference between an
      // understatement and a lie.
      value: account.riskComplete === false ? `${fmtPct(account.riskPct)}+` : fmtPct(account.riskPct),
      title:
        account.riskComplete === false
          ? `At least this much — ${(account.totals.undefinedRisk || []).join(", ") || "a position"} cannot be fully sized, so the total is a floor.`
          : `Spreads at their defined max loss; stock-like positions at a ${Math.round((account.totals?.stressMove ?? 0.15) * 100)}% adverse move — the shock clearing and margin engines use. Stock-to-zero is shown separately as Notional.`
    },
    // Stock-to-zero across every stock-like position. True for each one, and
    // not risk when summed -- so it gets its own honest name.
    ...(account.totals?.notional > 0
      ? [{
          label: "Notional",
          value: fmtMoney(account.totals.notional),
          title: "What every stock-like position would lose with its stock at zero, added up. Exposure, not a loss estimate."
        }]
      : []),
    {
      label: "P/L / Equity",
      value: fmtPct(account.plPct),
      tone: account.totals.pl > 0 ? "text-emerald-600" : account.totals.pl < 0 ? "text-rose-600" : ""
    }
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-base font-semibold text-slate-900">{account.name}</h2>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              account.type === "Live"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-sky-50 text-sky-700 border-sky-200"
            }`}
          >
            {account.type}
          </span>
          {account.ok && tickers.length > 0 && (
            <span
              title={
                status === "live"
                  ? "Underlying prices are streaming from the broker."
                  : "Not streaming — prices come from the periodic refresh instead."
              }
              className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                status === "live"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === "live" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
              />
              {status === "live" ? "Live" : "Polling"}
            </span>
          )}
          {tab === "positions" && (
            <div className="basis-full sm:basis-auto sm:ml-1 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 w-fit">
              {[
                { id: "simple", label: "Simple", Icon: LayoutGrid },
                { id: "detailed", label: "Detailed", Icon: Table2 }
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    view === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 ml-auto">
          {stats.map((s) => (
            <div key={s.label} title={s.title}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-sm font-medium tabular-nums ${s.tone || "text-slate-800"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      {account.ok && (
        <div className="flex gap-1 px-5 border-b border-slate-200" role="tablist">
          {[
            { id: "positions", label: "Positions", n: account.spreads.length, tone: "bg-slate-100 text-slate-600" },
            { id: "orders", label: "Orders", n: workingCount, tone: "bg-emerald-100 text-emerald-700" }
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-emerald-500 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {t.n > 0 && (
                <span
                  className={`text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? t.tone : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {t.n}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!account.ok ? (
        <div className="px-5 py-6 flex items-center gap-3 text-amber-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {/rate limit/i.test(account.error || "")
            ? "Alpaca is rate-limiting this account right now — data will reappear on the next refresh."
            : `Connection failed — check the API keys for this account. (${account.error})`}
        </div>
      ) : tab === "orders" ? (
        orders.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">
            No working orders, and nothing has been sent to the broker today. Orders from earlier days
            appear in this account&rsquo;s trade history once they settle.
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2.5">
            {orders.map((o) => (
              <OrderGroup key={o.id} accountId={account.id} order={o} onChanged={onOrdersChanged} />
            ))}
          </div>
        )
      ) : account.spreads.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-500">No open put credit spreads in this account.</div>
      ) : view === "simple" ? (
        <PositionCards
          spreads={spreads}
          accountId={account.id}
          onClose={(spread) => onCloseSpread(account, spread)}
        />
      ) : (
        <SpreadTable
          spreads={spreads}
          accountId={account.id}
          onClose={(spread) => onCloseSpread(account, spread)}
        />
      )}
    </section>
  );
}