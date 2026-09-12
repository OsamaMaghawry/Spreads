import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, RefreshCw, AlertTriangle } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { fmtMoney } from "@/lib/format";
import TradeDialog from "@/components/screener/TradeDialog";
import { contractSetup } from "@/lib/optionChain";

// The option chain, as a ladder, with every strike tradeable.
//
// The owner asked for the chain to "show up complete on the app" and for
// orders to be placeable from it. Two rules shape this screen:
//
//   EVERY LISTED STRIKE APPEARS, quoted or not. The scanner drops a contract
//   with no two-sided market because it is choosing something tradeable; on a
//   chain a missing row reads as "that strike does not exist", which is a
//   different and false statement. An unquoted strike shows dashes.
//
//   NOTHING HERE RECOMMENDS. There is no ranking, no highlight on a "best"
//   strike, no suggested delta. A chain is market data; the trader picks.
//   The only thing the screen emphasises is where the money is — the strike
//   nearest spot — which is a fact about the price, not an opinion.

const cell = "px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap";
const head = "px-2.5 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";

const n2 = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(2));
const n0 = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : Math.round(v).toLocaleString());
const pct = (v) => (v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);

export default function OptionChain() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [ticker, setTicker] = useState("");
  const [query, setQuery] = useState("");
  const [expiry, setExpiry] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null);
  const atmRef = useRef(null);

  useEffect(() => {
    invokeFunction("syncAccounts", {})
      .then((r) => {
        const list = r?.data?.accounts || [];
        setAccounts(list);
        setAccountId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => setAccounts([]));
  }, []);

  const load = useCallback(async (sym, exp) => {
    if (!accountId || !sym) return;
    setLoading(true);
    setError(null);
    try {
      const r = await invokeFunction("optionChain", { accountId, ticker: sym, expiry: exp || undefined });
      if (r.data?.error) throw new Error(r.data.error);
      setData(r.data);
      setTicker(r.data.ticker);
      setExpiry(r.data.expiry);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Scroll the money into view when a chain arrives. A hundred-strike ladder
  // that opens at the top is a ladder nobody can read.
  useEffect(() => {
    if (atmRef.current) atmRef.current.scrollIntoView({ block: "center" });
  }, [data]);

  const account = accounts.find((a) => a.id === accountId);
  const ladder = data?.ladder || [];

  // The ticket wants the same shape the scanner produces. Built here rather
  // than server-side so a click costs nothing: every number it needs is
  // already on this page.
  const openTicket = (row, action) => {
    if (!row || row.mid === null) return;
    setPick({ row, action });
  };

  // Built by the one tested implementation, never inline. The first draft of
  // this page carried its own copy of the risk arithmetic and got the bought
  // put's break-even wrong.
  const ticket = useMemo(() => {
    if (!pick || !data) return null;
    return contractSetup(pick.row, pick.action, {
      ticker: data.ticker,
      expiry: data.expiry,
      spot: data.spot,
      spotSource: data.spotSource,
      spotAsOf: data.spotAsOf,
      shares: data.shares,
      basis: data.basis,
      basisSource: data.basisSource
    });
  }, [pick, data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Option chain</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Every listed strike for one expiry. Click a bid to sell it or an ask to buy it.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="block text-[11px] text-slate-500 mb-1.5">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.is_paper ? " · paper" : ""}
              </option>
            ))}
          </select>
        </div>

        <form
          className="min-w-[160px]"
          onSubmit={(e) => { e.preventDefault(); load(query.trim().toUpperCase(), ""); }}
        >
          <label className="block text-[11px] text-slate-500 mb-1.5">Underlying</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TSLA"
              className="w-32 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase"
            />
            <button
              type="submit"
              disabled={!accountId || !query.trim() || loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Load
            </button>
          </div>
        </form>

        {data?.expiries?.length > 0 && (
          <div className="min-w-[170px]">
            <label className="block text-[11px] text-slate-500 mb-1.5">
              Expiry · {data.expiries.length} listed
            </label>
            <select
              value={expiry}
              onChange={(e) => { setExpiry(e.target.value); load(ticker, e.target.value); }}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {data.expiries.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {data && (
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              {data.ticker} spot
            </div>
            <div className="text-lg font-semibold tabular-nums text-slate-900">
              {data.spot === null ? "—" : fmtMoney(data.spot)}
            </div>
            {/* A price the app does not trust is never shown as though it were
                live. Same rule the dashboard and the scanner apply. */}
            {data.spot !== null && !data.spotTrusted && (
              <div className="text-[10px] text-amber-700 max-w-[220px] leading-snug">
                {data.spotReason || "Price not trusted."}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && ladder.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-medium text-slate-900">
              {data.ticker} · {data.expiry}
            </h3>
            <span className="text-[11px] text-slate-500">{ladder.length} strikes</span>
            {data.shares > 0 && (
              <span className="text-[11px] text-slate-500">
                holding {data.shares.toLocaleString()} shares
                {data.basis ? ` at ${fmtMoney(data.basis)} (${data.basisSource})` : ""}
              </span>
            )}
          </div>

          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs text-slate-700">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-200">
                  <th className={`${head} text-left`} colSpan={6}>Calls</th>
                  <th className={`${head} text-center bg-slate-100`}>Strike</th>
                  <th className={`${head} text-left`} colSpan={6}>Puts</th>
                </tr>
                <tr className="border-b border-slate-200">
                  <th className={head}>OI</th><th className={head}>Vol</th><th className={head}>IV</th>
                  <th className={head}>Δ</th><th className={head}>Bid</th><th className={head}>Ask</th>
                  <th className={`${head} text-center bg-slate-100`}>—</th>
                  <th className={head}>Bid</th><th className={head}>Ask</th><th className={head}>Δ</th>
                  <th className={head}>IV</th><th className={head}>Vol</th><th className={head}>OI</th>
                </tr>
              </thead>
              <tbody>
                {ladder.map((s, i) => {
                  const atm = i === data.atTheMoney;
                  return (
                    <tr
                      key={s.strike}
                      ref={atm ? atmRef : null}
                      className={`border-b border-slate-100 last:border-0 ${atm ? "bg-amber-50" : ""}`}
                    >
                      <Side row={s.call} onPick={openTicket} />
                      <td className={`${cell} text-center font-semibold bg-slate-50 text-slate-900`}>
                        {s.strike}
                      </td>
                      <Side row={s.put} onPick={openTicket} mirrored />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            Shaded row is the strike nearest spot. Every listed strike is shown, including those with
            no market — those price no ticket and their cells read &ldquo;—&rdquo;. Clicking a{" "}
            <strong>bid</strong> opens a ticket to sell, an <strong>ask</strong> to buy; both are
            priced at the midpoint, and you set the limit on the ticket. Nothing on this screen is a
            recommendation.
          </p>
        </div>
      )}

      {data && ladder.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          No contracts quoted for {data.ticker} on {data.expiry}.
        </div>
      )}

      {/* A refusal is shown, not swallowed. A click that produces no ticket
          with no explanation reads as a broken button. */}
      {ticket && !ticket.ok && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{ticket.reason}</span>
          <button type="button" onClick={() => setPick(null)} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}
      {ticket?.ok && account && (
        <TradeDialog setup={ticket.setup} accounts={[account]} onClose={() => setPick(null)} />
      )}
    </div>
  );
}

// One side of a strike. `mirrored` reverses the column order so the two sides
// read outward from the strike in the middle, which is how a chain is read on
// every platform a trader has already used.
function Side({ row, onPick, mirrored = false }) {
  if (!row) {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => (
          <td key={i} className={`${cell} text-slate-300`}>—</td>
        ))}
      </>
    );
  }

  const tone = row.itm ? "bg-slate-50/80" : "";
  const priceBtn = (value, action, title) => (
    <td className={`${cell} ${tone} p-0`}>
      <button
        type="button"
        disabled={row.mid === null}
        onClick={() => onPick(row, action)}
        title={title}
        className={`w-full h-full px-2.5 py-1.5 text-right tabular-nums transition-colors ${
          row.mid === null
            ? "text-slate-300 cursor-default"
            : action === "sell"
              ? "text-rose-700 hover:bg-rose-50 cursor-pointer"
              : "text-emerald-700 hover:bg-emerald-50 cursor-pointer"
        }`}
      >
        {n2(value)}
      </button>
    </td>
  );

  const oi = <td key="oi" className={`${cell} ${tone} text-slate-500`}>{n0(row.openInterest)}</td>;
  const vol = <td key="vol" className={`${cell} ${tone} text-slate-500`}>{n0(row.volume)}</td>;
  const iv = <td key="iv" className={`${cell} ${tone} text-slate-500`}>{pct(row.iv)}</td>;
  // Unsigned, the trader's register: "the 16-delta put". The row already says
  // which side it is on.
  const delta = (
    <td key="d" className={`${cell} ${tone} text-slate-600`}>
      {row.delta === null ? "—" : Math.abs(row.delta).toFixed(2)}
    </td>
  );
  const bid = <Cell key="b">{priceBtn(row.bid, "sell", `Sell ${row.symbol} at the mid`)}</Cell>;
  const ask = <Cell key="a">{priceBtn(row.ask, "buy", `Buy ${row.symbol} at the mid`)}</Cell>;

  const cols = mirrored ? [bid, ask, delta, iv, vol, oi] : [oi, vol, iv, delta, bid, ask];
  return <>{cols}</>;
}

// The price buttons are already <td>s; this keeps the fragment keys tidy
// without wrapping a cell in another cell.
const Cell = ({ children }) => children;
