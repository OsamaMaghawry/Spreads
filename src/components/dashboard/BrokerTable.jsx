import { useState, useMemo } from "react";
import { fmtMoney } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { closePlan, coverLeftBehind } from "@/lib/closePlan";

// What the broker says you hold, line for line, with a close on every row.
//
// The escape hatch. Everything else on this dashboard groups, pairs, names and
// derives, and every one of those steps is a place to be wrong — on 8 Sep two
// legs of a live position were missing from the Positions tab because the
// pairing could not name their shape. This tab cannot have that failure,
// because it does not pair anything: one row per line Alpaca reports, its
// numbers not ours, and a Close that sends a single symbol and a single
// quantity. If the grouping is ever wrong again, the position is still here
// and still closable.
//
// The numbers are deliberately the BROKER's. Where its unrealised P/L
// disagrees with the card on the other tab, this is the one the statement will
// match — and seeing the disagreement is the point of having the tab.

const th = "px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium whitespace-nowrap";
const td = "px-2.5 py-3 whitespace-nowrap tabular-nums";

// A single broker line, in the shape the close ticket already understands —
// the same shape the pairing gives a lone leg or a share lot. Nothing new is
// invented for it, so the close goes down the path that is already tested.
export function closeTicketFor(row) {
  if (row.assetClass === "equity") {
    return {
      single: true,
      shares: true,
      type: "shares",
      ticker: row.ticker,
      qty: Math.abs(row.qty),
      shareQty: row.qty,
      qtyAvailable: Math.abs(row.qtyAvailable ?? row.qty),
      longSymbol: row.symbol,
      shortSymbol: null,
      longEntryPrice: row.avgEntryPrice ?? 0,
      shareBasis: row.avgEntryPrice ?? 0,
      longCurrentPrice: row.currentPrice ?? 0,
      shortCurrentPrice: 0,
      legs: [],
      openOrders: [],
      fromBroker: true
    };
  }
  const short = row.qty < 0;
  const leg = {
    symbol: row.symbol,
    side: short ? "short" : "long",
    kind: row.optionType === "C" ? "call" : "put",
    strike: row.strike,
    ratio: 1,
    entryPrice: Math.abs(row.avgEntryPrice ?? 0),
    currentPrice: Math.abs(row.currentPrice ?? 0)
  };
  return {
    single: true,
    // Named for what one contract is, with no claim about cover or structure —
    // this tab does not know and does not need to.
    type: short ? "short_option" : "long_option",
    ticker: row.ticker,
    expiry: row.expiry,
    expiryFormatted: row.expiry,
    qty: Math.abs(row.qty),
    qtyAvailable: Math.abs(row.qtyAvailable ?? row.qty),
    legs: [leg],
    shortSymbol: short ? row.symbol : null,
    longSymbol: short ? null : row.symbol,
    shortStrike: short ? row.strike : null,
    longStrike: short ? null : row.strike,
    shortEntryPrice: short ? leg.entryPrice : 0,
    longEntryPrice: short ? 0 : leg.entryPrice,
    shortCurrentPrice: short ? leg.currentPrice : 0,
    longCurrentPrice: short ? 0 : leg.currentPrice,
    adjusted: !!row.adjusted,
    openOrders: [],
    fromBroker: true
  };
}

const label = (r) =>
  r.assetClass === "equity"
    ? `${r.ticker} shares`
    : `${r.ticker} ${fmtMoney(r.strike)}${r.optionType} ${r.expiry ?? ""}`.trim();

// One broker line as a leg the close planner understands.
//
// Quantity is what the BROKER says is free, not the whole line. Contracts held
// behind a working order cannot be closed again -- Alpaca refuses with "qty
// available for order (requested: 3, available: 1)" -- and planning for the
// full holding turns that into a mid-sequence rejection that strands a
// half-executed plan. The single ticket has always capped at this number and
// the table renders it two columns away; only the planner was ignoring it.
//
// `adjusted` travels because a corporate action changed what the contract
// delivers, so it can never be netted into a per-unit price beside ordinary
// legs. closePlan gives it an order of its own.
const asLeg = (r) => ({
  symbol: r.symbol,
  assetClass: r.assetClass,
  side: r.qty < 0 ? "short" : "long",
  qty: Math.min(Math.abs(r.qty), Math.abs(r.qtyAvailable ?? r.qty)),
  ticker: r.ticker,
  strike: r.strike,
  optionType: r.optionType,
  expiry: r.expiry,
  adjusted: !!r.adjusted
});

// Rows the broker reports but which have nothing free to close.
const nothingFree = (r) => !(Math.abs(r.qtyAvailable ?? r.qty) > 0);

export default function BrokerTable({ rows, coverage, onClose, onCloseMany }) {
  const [picked, setPicked] = useState([]);

  const selected = useMemo(
    () => (rows || []).filter((r) => picked.includes(r.symbol) && !nothingFree(r)).map(asLeg),
    [rows, picked]
  );
  // Lines the broker will not let this close in full, NAMED.
  //
  // The old notice said "some of what you ticked is held by a working order"
  // and stopped there. On the live TSLA book that sentence was the only thing
  // on screen about a 200-share line that then did not close -- true, and
  // useless, because it named neither the line nor how much of it was free.
  // A row with nothing free is dropped from `selected` entirely, so without
  // this it disappears from the plan with no trace at all.
  const held = useMemo(
    () =>
      (rows || [])
        .filter((r) => picked.includes(r.symbol) && Math.abs(r.qtyAvailable ?? r.qty) < Math.abs(r.qty))
        .map((r) => ({
          symbol: r.symbol,
          name: r.assetClass === "equity" ? `${r.ticker || r.symbol} shares` : r.symbol,
          unit: r.assetClass === "equity" ? "share" : "contract",
          free: Math.abs(r.qtyAvailable ?? r.qty),
          total: Math.abs(r.qty)
        })),
    [rows, picked]
  );
  // What the SELECTION leaves behind, judged against the whole account rather
  // than against the picked legs — closePlan cannot see a short that was never
  // selected, and that is exactly the one a sale would strip the cover from.
  const stranded = useMemo(() => coverLeftBehind(selected, rows || []), [selected, rows]);
  // Planned as the user picks, so the order count and the split are visible
  // before the ticket opens rather than as a surprise inside it.
  const plan = useMemo(() => closePlan(selected), [selected]);
  const toggle = (sym) => setPicked((p) => (p.includes(sym) ? p.filter((s) => s !== sym) : [...p, sym]));

  if (!rows?.length) {
    return <div className="px-5 py-6 text-sm text-slate-500">The broker reports no open positions in this account.</div>;
  }

  return (
    <div>
      {/* The reconciliation. Silence here is the claim that every contract the
          broker holds is accounted for on the Positions tab; a row here is the
          8 Sep failure catching itself. */}
      {coverage?.length > 0 ? (
        <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {coverage.length} {coverage.length === 1 ? "contract is" : "contracts are"} not fully accounted for on the
            Positions tab
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs tabular-nums">
            {coverage.map((g) => (
              <li key={g.symbol}>
                <span className="font-medium">{g.symbol}</span> — broker {g.broker}, shown {g.dashboard}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">Close them from here; the rows below go straight to the broker.</p>
        </div>
      ) : (
        <div className="mx-4 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          Every contract the broker reports is accounted for on the Positions tab.
        </div>
      )}

      {/* The selection bar. Present only once something is picked, so the tab
          reads the same as before until the user starts a multi-close.

          It states the ORDER COUNT up front. A selection of six option legs
          plus a share lot cannot be one order — the broker caps a multi-leg
          order at four legs and never mixes shares with contracts — and finding
          that out inside the ticket, after committing, is the wrong moment. */}
      {picked.length > 0 && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-900">
            {picked.length} selected
          </span>
          {held.length > 0 && (
            <div className="basis-full text-xs text-amber-700">
              <div className="flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  The broker is holding part of {held.length === 1 ? "this line" : "these lines"} — as collateral for a
                  short, or against an order already working — so this close cannot reach all of it:
                </span>
              </div>
              <ul className="mt-1 ml-5 space-y-0.5 tabular-nums">
                {held.map((h) => (
                  <li key={h.symbol}>
                    <span className="font-medium">{h.name}</span> —{" "}
                    {h.free === 0
                      ? `none of the ${h.total} is free, so this line will not be closed at all`
                      : `${h.free} of ${h.total} ${h.unit}${h.total > 1 ? "s" : ""} free; the other ${h.total - h.free} stays open`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <span className="text-xs text-slate-500">
            {plan.atomic
              ? "One order — all legs fill together."
              : `${plan.orders.length} orders, sent one at a time. Buy-backs first, sales last.`}
          </span>
          {stranded.length > 0 && (
            <ul className="basis-full space-y-1 text-xs text-amber-700">
              {stranded.map((w) => (
                <li key={w.selling} className="flex gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPicked([])}
              className="text-xs font-medium rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => onCloseMany?.(selected, held)}
              className="text-xs font-medium rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700 hover:bg-rose-100 transition-colors"
            >
              Close selected at a limit
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className={`${th} w-8`}>
                <span className="sr-only">Select</span>
              </th>
              <th className={th}>Position</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Free</th>
              <th className={`${th} text-right`}>Avg entry</th>
              <th className={`${th} text-right`}>Current</th>
              <th className={`${th} text-right`}>Market value</th>
              <th className={`${th} text-right`} title="The broker's own unrealized P/L for this line — not computed here.">
                Unrlzd P/L
              </th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                className={`border-b border-slate-100 transition-colors ${
                  picked.includes(r.symbol) ? "bg-emerald-50/60" : "hover:bg-slate-50"
                }`}
              >
                <td className={td}>
                  <input
                    type="checkbox"
                    checked={picked.includes(r.symbol)}
                    onChange={() => toggle(r.symbol)}
                    disabled={nothingFree(r)}
                    title={nothingFree(r) ? "Every contract on this line is held by a working order." : undefined}
                    aria-label={`Select ${label(r)} for closing`}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </td>
                <td className={`${td} font-medium text-slate-900`}>
                  {label(r)}
                  <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                    r.side === "short"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }`}>
                    {r.side}
                  </span>
                  {r.adjusted && (
                    <span
                      className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-100 text-amber-800"
                      title="A corporate action changed what this contract delivers. It can still be closed from here."
                    >
                      adjusted
                    </span>
                  )}
                  <span className="block text-[11px] text-slate-400">{r.symbol}</span>
                </td>
                <td className={`${td} text-right`}>{r.qty}</td>
                <td className={`${td} text-right text-slate-500`}>{r.qtyAvailable}</td>
                <td className={`${td} text-right`}>{r.avgEntryPrice != null ? fmtMoney(r.avgEntryPrice) : "—"}</td>
                <td className={`${td} text-right`}>{r.currentPrice != null ? fmtMoney(r.currentPrice) : "—"}</td>
                <td className={`${td} text-right`}>{r.marketValue != null ? fmtMoney(r.marketValue) : "—"}</td>
                <td
                  className={`${td} text-right font-semibold ${
                    r.unrealizedPL > 0 ? "text-emerald-600" : r.unrealizedPL < 0 ? "text-rose-600" : ""
                  }`}
                >
                  {r.unrealizedPL != null ? fmtMoney(r.unrealizedPL) : "—"}
                </td>
                <td className={`${td} text-right`}>
                  <button
                    onClick={() => onClose(closeTicketFor(r))}
                    className="text-xs font-medium rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    Close
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
