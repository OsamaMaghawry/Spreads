import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Search, RefreshCw, AlertTriangle, X } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { fmtMoney } from "@/lib/format";
import TradeDialog from "@/components/screener/TradeDialog";
import { contractSetup, spreadSetup } from "@/lib/optionChain";

// The option chain, as a ladder, with every strike tradeable.
//
// Four things the owner asked for after the first build, and the reasoning
// each one settled:
//
//   THE SPOT GETS ITS OWN ROW. "The current price and the separation between
//   OTM and ITM is not clear. Make the current price in the middle of in and
//   out in a separate row." Shading alone made the reader infer the boundary
//   from a colour change; a labelled line between the last strike below spot
//   and the first above states it. Alpaca's own chain does exactly this.
//
//   BUY AND SELL ARE BUTTONS, NOT PRICES. The first build made the bid and ask
//   clickable, which is compact and ambiguous — clicking a number is not
//   obviously an order. Explicit B and S at each end of the row, coloured, is
//   what Tradier does and it cannot be misread.
//
//   TWO LEGS MAKE A SPREAD. "I can't open spreads from it. Only one put or
//   call. Not multi select." Selecting a second leg of the same type builds a
//   vertical rather than replacing the first.
//
//   COLOUR CARRIES MEANING, NOT DECORATION. In the money is tinted; the strike
//   rail is its own colour; buy is emerald and sell is rose everywhere. Nothing
//   is coloured to look lively — brand.md reserves green and red for direction
//   and this screen keeps that.

const num = (v) => (v === null || v === undefined || !isFinite(v) ? null : Number(v));
const n2 = (v) => (num(v) === null ? "—" : Number(v).toFixed(2));
const n0 = (v) => (num(v) === null ? "—" : Math.round(v).toLocaleString());
const pct = (v) => (num(v) === null ? "—" : `${(v * 100).toFixed(1)}%`);

const cell = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
const head = "px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap";

const dte = (d) => {
  const days = Math.round((new Date(`${d}T00:00:00Z`) - Date.now()) / 86400000);
  return days < 0 ? "expired" : days === 0 ? "today" : `${days}d`;
};

export default function OptionChain() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [ticker, setTicker] = useState("");
  const [query, setQuery] = useState("");
  const [expiry, setExpiry] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState("all");
  // Legs picked so far: [{ row, action }]. One is a single option, two of the
  // same type is a vertical.
  const [picked, setPicked] = useState([]);
  const [ticketOpen, setTicketOpen] = useState(false);
  const spotRowRef = useRef(null);

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
    setPicked([]);
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

  // Open on the money. A hundred-strike ladder that starts at the top is a
  // ladder nobody can read.
  useEffect(() => {
    if (spotRowRef.current) spotRowRef.current.scrollIntoView({ block: "center" });
  }, [data]);

  const account = accounts.find((a) => a.id === accountId);
  const ladder = data?.ladder || [];
  const spot = num(data?.spot);

  // Where the spot sits in the ladder: the number of strikes at or below it.
  // The separator is drawn there, so it falls between the last in-the-money
  // call and the first out-of-the-money one.
  const spotAt = useMemo(() => {
    if (spot === null) return -1;
    let i = 0;
    while (i < ladder.length && Number(ladder[i].strike) <= spot) i += 1;
    return i;
  }, [ladder, spot]);

  const isPicked = (symbol, action) =>
    picked.some((p) => p.row.symbol === symbol && p.action === action);

  // Clicking the same button again removes it; a third leg replaces the
  // selection rather than silently building something that is not a vertical.
  const toggle = (row, action) => {
    if (!row || row.mid === null) return;
    setPicked((cur) => {
      const at = cur.findIndex((p) => p.row.symbol === row.symbol && p.action === action);
      if (at >= 0) return cur.filter((_, i) => i !== at);
      // Same contract, other side: swap rather than hold both.
      const other = cur.filter((p) => p.row.symbol !== row.symbol);
      if (other.length >= 2) return [other[other.length - 1], { row, action }];
      return [...other, { row, action }];
    });
  };

  const ctx = useMemo(() => data && ({
    ticker: data.ticker,
    expiry: data.expiry,
    spot: data.spot,
    spotSource: data.spotSource,
    spotAsOf: data.spotAsOf,
    shares: data.shares,
    basis: data.basis,
    basisSource: data.basisSource
  }), [data]);

  // One tested builder per shape; never inline arithmetic on this page.
  const ticket = useMemo(() => {
    if (!ctx || picked.length === 0) return null;
    return picked.length === 1
      ? contractSetup(picked[0].row, picked[0].action, ctx)
      : spreadSetup(picked, ctx);
  }, [picked, ctx]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Option chain</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Every listed strike, every listed expiry. Pick one leg for a single option, two of the same
          type for a vertical spread.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[170px]">
          <label className="block text-[11px] text-slate-500 mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.is_paper ? " · paper" : ""}</option>
            ))}
          </select>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); load(query.trim().toUpperCase(), ""); }}>
          <label className="block text-[11px] text-slate-500 mb-1">Underlying</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TSLA"
              className="w-28 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase font-medium"
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
          <div className="min-w-[200px]">
            <label className="block text-[11px] text-slate-500 mb-1">
              Expiry · {data.expiries.length} listed
              {data.expiriesTruncated && <span className="text-amber-700"> (partial)</span>}
            </label>
            <select
              value={expiry}
              onChange={(e) => { setExpiry(e.target.value); load(ticker, e.target.value); }}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {data.expiries.map((d) => (
                <option key={d} value={d}>{d} · {dte(d)}</option>
              ))}
            </select>
          </div>
        )}

        {data && (
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
            {["calls", "all", "puts"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setShow(k)}
                className={`px-3 py-2 capitalize transition-colors ${
                  show === k ? "bg-slate-900 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        )}

        {data && (
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              {data.ticker}
            </div>
            <div className="text-xl font-semibold tabular-nums text-slate-900">
              {spot === null ? "—" : fmtMoney(spot)}
            </div>
            {spot !== null && !data.spotTrusted && (
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

      {/* The selection, always visible once anything is picked, so a leg
          chosen fifty rows up is never forgotten off-screen. */}
      {picked.length > 0 && (
        <div className="sticky top-14 z-20 bg-slate-900 text-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            Ticket
          </span>
          {picked.map((p) => (
            <span
              key={`${p.row.symbol}-${p.action}`}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                p.action === "buy" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {p.action === "buy" ? "Buy" : "Sell"} {p.row.strike}
              {p.row.type === "C" ? "C" : "P"}
              <button type="button" onClick={() => toggle(p.row, p.action)} aria-label="Remove leg">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {ticket?.ok ? (
            <span className="text-xs text-slate-300">
              {picked.length === 2 ? "Vertical · " : ""}
              {ticket.setup.credit >= 0
                ? `credit ${n2(ticket.setup.credit)}`
                : `debit ${n2(Math.abs(ticket.setup.credit))}`}
              {ticket.setup.maxRisk !== null && ticket.setup.maxRisk !== undefined
                ? ` · risk ${fmtMoney(ticket.setup.maxRisk)}`
                : " · risk unlimited"}
            </span>
          ) : (
            <span className="text-xs text-amber-300">{ticket?.reason}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!ticket?.ok}
              onClick={() => setTicketOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-white text-slate-900 text-sm font-medium disabled:opacity-40"
            >
              Open ticket
            </button>
          </div>
        </div>
      )}

      {data && ladder.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs text-slate-700">
              <thead className="sticky top-0 z-10">
                <tr>
                  {show !== "puts" && (
                    <th className={`${head} text-left bg-sky-50 text-sky-900 border-b border-sky-200`} colSpan={8}>
                      Calls
                    </th>
                  )}
                  <th className={`${head} text-center bg-amber-100 text-amber-900 border-b border-amber-300`}>
                    Strike
                  </th>
                  {show !== "calls" && (
                    <th className={`${head} text-left bg-violet-50 text-violet-900 border-b border-violet-200`} colSpan={8}>
                      Puts
                    </th>
                  )}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  {show !== "puts" && <>
                    <th className={head}></th>
                    <th className={head}>OI</th><th className={head}>Vol</th><th className={head}>IV</th>
                    <th className={head}>Δ</th><th className={head}>Last</th>
                    <th className={head}>Bid</th><th className={head}>Ask</th>
                  </>}
                  <th className={`${head} text-center bg-amber-50`}></th>
                  {show !== "calls" && <>
                    <th className={head}>Bid</th><th className={head}>Ask</th>
                    <th className={head}>Last</th><th className={head}>Δ</th>
                    <th className={head}>IV</th><th className={head}>Vol</th><th className={head}>OI</th>
                    <th className={head}></th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {ladder.map((s, i) => (
                  <Fragment key={s.strike}>
                    {i === spotAt && spot !== null && (
                      <SpotRow spot={spot} show={show} innerRef={spotRowRef} />
                    )}
                    <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                      {show !== "puts" && (
                        <Side row={s.call} onToggle={toggle} isPicked={isPicked} />
                      )}
                      <td className="px-2 py-1 text-center font-semibold tabular-nums bg-amber-50 text-amber-900 border-x border-amber-200">
                        {s.strike}
                      </td>
                      {show !== "calls" && (
                        <Side row={s.put} onToggle={toggle} isPicked={isPicked} mirrored />
                      )}
                    </tr>
                  </Fragment>
                ))}
                {/* Spot above every listed strike: the line still belongs on
                    the chain, at the bottom. */}
                {spotAt === ladder.length && spot !== null && (
                  <SpotRow spot={spot} show={show} innerRef={spotRowRef} />
                )}
              </tbody>
            </table>
          </div>

          <p className="border-t border-slate-200 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="inline-block w-3 h-3 align-middle rounded-sm bg-sky-100 border border-sky-200 mr-1" />
            in the money ·{" "}
            <strong className="text-emerald-700">B</strong> buys,{" "}
            <strong className="text-rose-700">S</strong> sells, both at the midpoint — you set the
            limit on the ticket. Pick two legs of the same type for a vertical. Every listed strike
            is shown, including those with no market; those price no ticket and read
            &ldquo;—&rdquo;. Nothing on this screen is a recommendation.
          </p>
        </div>
      )}

      {data && ladder.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          No contracts quoted for {data.ticker} on {data.expiry}.
        </div>
      )}

      {ticketOpen && ticket?.ok && account && (
        <TradeDialog
          setup={ticket.setup}
          accounts={[account]}
          onClose={() => { setTicketOpen(false); setPicked([]); }}
        />
      )}
    </div>
  );
}

// The spot, on its own line, between the last strike below it and the first
// above. The boundary between in and out of the money is stated rather than
// inferred from a colour change.
function SpotRow({ spot, show, innerRef }) {
  const span = show === "all" ? 17 : 9;
  return (
    <tr ref={innerRef} className="bg-slate-900 text-white">
      <td colSpan={span} className="px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide">
        {/* Named, not just drawn: "underlying" is what the line divides on. */}
        Underlying &nbsp;{fmtMoney(spot)}&nbsp;
        <span className="font-normal text-slate-400">
          · strikes above are out of the money for calls, in the money for puts
        </span>
      </td>
    </tr>
  );
}

// One side of a strike. `mirrored` reverses the columns so both sides read
// outward from the strike rail in the middle — the way every chain a trader
// has already used is laid out.
function Side({ row, onToggle, isPicked, mirrored = false }) {
  if (!row) {
    return <>{Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className={`${cell} text-slate-300`}>—</td>
    ))}</>;
  }

  // In the money gets a tint, and it is the SAME tint on both sides so the
  // eye reads one band crossing the strike rail rather than two decorations.
  const tone = row.itm ? "bg-sky-50" : "";
  const dead = row.mid === null;

  const bs = (
    <td key="bs" className={`px-1.5 py-1 ${tone}`}>
      <div className="flex gap-0.5 justify-center">
        {["buy", "sell"].map((action) => {
          const on = isPicked(row.symbol, action);
          const buy = action === "buy";
          return (
            <button
              key={action}
              type="button"
              disabled={dead}
              onClick={() => onToggle(row, action)}
              title={`${buy ? "Buy" : "Sell"} ${row.symbol} at the mid`}
              className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                dead
                  ? "bg-slate-100 text-slate-300 cursor-default"
                  : on
                    ? buy ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                    : buy
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
              }`}
            >
              {buy ? "B" : "S"}
            </button>
          );
        })}
      </div>
    </td>
  );

  const oi = <td key="oi" className={`${cell} ${tone} text-slate-500`}>{n0(row.openInterest)}</td>;
  const vol = <td key="vol" className={`${cell} ${tone} text-slate-500`}>{n0(row.volume)}</td>;
  const iv = <td key="iv" className={`${cell} ${tone} text-slate-500`}>{pct(row.iv)}</td>;
  // Unsigned — the trader's register, "the 16-delta put". The column it sits
  // in already says which side.
  const delta = <td key="d" className={`${cell} ${tone} text-slate-600`}>
    {num(row.delta) === null ? "—" : Math.abs(row.delta).toFixed(2)}
  </td>;
  const last = <td key="l" className={`${cell} ${tone} text-slate-500`}>{n2(row.last)}</td>;
  const bid = <td key="b" className={`${cell} ${tone} text-rose-700 font-medium`}>{n2(row.bid)}</td>;
  const ask = <td key="a" className={`${cell} ${tone} text-emerald-700 font-medium`}>{n2(row.ask)}</td>;

  const cols = mirrored
    ? [bid, ask, last, delta, iv, vol, oi, bs]
    : [bs, oi, vol, iv, delta, last, bid, ask];
  return <>{cols}</>;
}
