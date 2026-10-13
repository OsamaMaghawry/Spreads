import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TradeDialog from "@/components/scanner/TradeDialog";
import NumberField from "@/components/common/NumberField";
import EarningsWarning from "@/components/common/EarningsWarning";
import { invokeFunction } from "@/lib/functions";
import { chainContext, collarSetup, repairSetup, protectedRepairSetup, withEarnings } from "@/lib/optionChain";
import { collarCandidates, repairCandidates, repairPLAt, expiryNear, floorPut } from "@/lib/holdingStrategies";
import { fmtMoney } from "@/lib/format";

// Protect and Repair, from a share holding on the dashboard.
//
// The owner: "I want to build the Collar strategy ... apply it on my holding"
// and "how we can build stock repair strategy". Both read the chain once for
// the shares' ticker, offer strikes (holdingStrategies.js), and hand the pick
// to the ordinary ticket, built by the same tested builders the option chain
// uses (collarSetup, repairSetup, protectedRepairSetup). Nothing here sends an
// order: the ticket does, with its usual preview, pricing and broker checks.
//
// Repair has an "Add protection" switch: "Repair and Protect" together, a put bought
// under the repair. There is no standard name for it; the product calls it a
// protected repair.

const label = "text-xs text-slate-500 block mb-1.5";
const input = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500";
const LEVELS = [0.05, 0.1, 0.15, 0.2];

const PROTECT_INTRO = [
  "Buy a put: it sets a floor under your shares.",
  "Sell a call: it pays for the put.",
  "Your upside stops at the call's strike.",
  "If the stock ends above it, your shares are sold at that price."
];
const REPAIR_INTRO = [
  "For each 100 shares: buy 1 call near today's price, sell 2 higher up.",
  "If the stock recovers, you break even sooner.",
  "You give up gains above the calls you sold.",
  "It does not protect you if the stock keeps falling."
];
const PROTECTED_INTRO = [
  "For each 100 shares: buy 1 call near today's price, sell 2 higher up.",
  "Plus a put: a floor if the stock keeps falling.",
  "The put costs money, so this usually costs a little.",
  "You give up gains above the calls you sold."
];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (v) => `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
const todayNY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const dte = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayNY()}T00:00:00Z`)) / 86400000);
const signed = (v) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtMoney(Math.abs(v))}`);
const netText = (n) => (n > 0 ? `${fmtMoney(n)} credit` : n < 0 ? `${fmtMoney(-n)} debit` : "Even");
const tone = (v) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-slate-700");

export default function HoldingStrategyDialog({ kind, position, account, onClose }) {
  const repair = kind === "repair";
  const ticker = position.ticker;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [protect, setProtect] = useState(0.1);
  // Repair only: also buy a put as a floor (a protected repair).
  const [floored, setFloored] = useState(false);
  const [strike, setStrike] = useState(null);
  const [units, setUnits] = useState("1");
  // The legs on the open ticket. Null while the finder is showing.
  const [legs, setLegs] = useState(null);

  const read = useCallback(async (expiry) => {
    const r = await invokeFunction("optionChain", { accountId: account.id, ticker, expiry });
    if (r.data?.error) throw new Error(r.data.error);
    return r.data;
  }, [account.id, ticker]);

  // The function opens on the nearest expiry; the finder wants about six
  // weeks out, so the first read is for the list and the second for the date.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let d = await read(undefined);
        const near = expiryNear(d.expiries, todayNY());
        if (near && near !== d.expiry) d = await read(near);
        if (live) setData(d);
      } catch (e) {
        if (live) setError(e.message || "Could not read the chain.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [read]);

  const changeExpiry = async (expiry) => {
    setLoading(true);
    setError(null);
    try {
      setData(await read(expiry));
      setStrike(null);
      setLegs(null);
    } catch (e) {
      setError(e.message || "Could not read the chain.");
    } finally {
      setLoading(false);
    }
  };

  const ctx = useMemo(() => chainContext(data, account.id, account.name), [data, account.id, account.name]);
  const spot = num(data?.spot);
  const basis = num(data?.basis) ?? num(position.shareBasis);
  const basisSource = num(data?.basis) !== null ? data.basisSource : position.basisSource;
  const free = Number(ctx?.shares) || 0;
  const maxUnits = Math.floor(free / 100);

  const found = useMemo(() => {
    if (!data) return null;
    if (!repair) return collarCandidates(data.ladder, spot, protect);
    if (!floored) return repairCandidates(data.ladder, spot, basis);
    const put = floorPut(data.ladder, spot, protect);
    if (!put) return { long: null, shorts: [], reason: `No put with a market ${pct(protect)} or more below today on this expiry.` };
    return repairCandidates(data.ladder, spot, basis, put);
  }, [data, repair, floored, spot, basis, protect]);

  const rows = repair ? found?.shorts || [] : found?.calls || [];
  const preset = repair ? found?.suggestedStrike : found?.zeroCostStrike ?? rows[0]?.strike ?? null;
  const chosen = rows.find((c) => c.strike === strike) || rows.find((c) => c.strike === preset) || null;
  const n = Math.max(1, Math.min(maxUnits || 1, Math.floor(Number(units)) || 1));

  // A new strike or floor is a new trade: a ticket that could not be built for
  // the last one has nothing to say about it.
  const pick = (k) => { setStrike(k); setLegs(null); };

  const openTicket = () => {
    if (!chosen) return;
    const expiry = data.expiry;
    setLegs(repair
      ? [
          ...(floored ? [{ row: found.put, action: "buy", expiry, qty: n }] : []),
          { row: found.long, action: "buy", expiry, qty: n },
          { row: chosen.row, action: "sell", expiry, qty: 2 * n }
        ]
      : [
          { row: found.put, action: "buy", expiry },
          { row: chosen.row, action: "sell", expiry }
        ]);
  };

  const ticket = useMemo(() => {
    if (!legs || !ctx) return null;
    // Earnings before expiry is flagged on the ticket, as on every other.
    if (!repair) return withEarnings(collarSetup(legs, ctx), ctx, todayNY());
    return withEarnings(legs.length === 3 ? protectedRepairSetup(legs, ctx) : repairSetup(legs, ctx), ctx, todayNY());
  }, [legs, ctx, repair]);

  const setLegQty = useCallback((symbol, action, q) => {
    const v = Math.max(1, Math.min(99, Math.floor(Number(q)) || 1));
    setLegs((cur) => cur && cur.map((l) => (l.row.symbol === symbol && l.action === action ? { ...l, qty: v } : l)));
  }, []);

  if (legs && ticket?.ok) {
    return (
      <TradeDialog
        setup={ticket.setup}
        // Per-leg quantities on the two-leg repair. The protected one is a
        // fixed 1:1:2, so its one quantity is the number of repairs.
        onLegQty={repair && legs.length === 2 ? setLegQty : null}
        accounts={[account]}
        defaultAccountId={account.id}
        positions={account.spreads ?? null}
        onClose={({ phase } = {}) => {
          // An order at the broker is the end of it; anything else is a step
          // back to the strikes, as closing a ticket is on the chain.
          if (phase === "filled" || phase === "detached") onClose({ sent: true });
          else setLegs(null);
        }}
      />
    );
  }

  const down = spot !== null && basis !== null && basis > 0 ? (basis - spot) / basis : null;
  // The same earnings rule the ticket applies, shown while the expiry is
  // being chosen: a report before it is the thing most worth knowing here.
  const onExpiry = data && ctx ? withEarnings({ ok: true, setup: { ticker, expiry: data.expiry } }, ctx, todayNY()).setup : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose({})}>
      {/* min-w-0 on every child: the dialog is a grid, and a grid item will not
          shrink below its content, so the strike table would widen the whole
          dialog past a phone's edge instead of scrolling inside its own box. */}
      <DialogContent className="bg-white border-slate-200 text-slate-700 sm:max-w-2xl max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-slate-900">{repair ? (floored ? "Protected repair" : "Repair") : "Protect"} {ticker}</DialogTitle>
          {/* Bullets, short and plain. The owner: "make it bullet points and in
              plain english, easy for beginners but not much writing." */}
          <DialogDescription asChild>
            <div>
              <Bullets items={repair ? (floored ? PROTECTED_INTRO : REPAIR_INTRO) : PROTECT_INTRO} />
            </div>
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Fact term="Price" value={fmtMoney(spot)} note={data?.spotAsOf ? `as of ${new Date(data.spotAsOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : null} />
          <Fact term="Your cost" value={fmtMoney(basis)} note={basis === null ? null : basisSource === "adjusted" ? "after premiums" : "per broker"} />
          {repair ? (
            <Fact term="Below cost" value={down === null ? "—" : pct(down)} tone="text-rose-700" />
          ) : (
            <Fact term="Held" value={`${position.qty} shares`} />
          )}
          <Fact term="Free to write against" value={`${free} shares`} note={free < position.qty ? "rest back calls already sold" : null} />
        </dl>

        {loading && !data && <p className="text-sm text-slate-500">Reading the {ticker} chain…</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}

        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="hs-expiry">Expiry</label>
                <select id="hs-expiry" value={data.expiry} disabled={loading} onChange={(e) => changeExpiry(e.target.value)} className={input}>
                  {(data.expiries || []).map((d) => (
                    <option key={d} value={d}>{d} · {dte(d)} days</option>
                  ))}
                </select>
              </div>
              {repair ? (
                <div>
                  <label className={label}>Repairs (100 shares each)</label>
                  <NumberField
                    value={units}
                    onChange={setUnits}
                    step={1}
                    min={1}
                    max={Math.max(1, maxUnits)}
                    ariaLabel="Number of repairs"
                  />
                </div>
              ) : (
                <div>
                  <span className={label}>Floor below today&rsquo;s price</span>
                  <FloorLevels value={protect} onChange={(p) => { setProtect(p); pick(null); }} />
                </div>
              )}
            </div>

            {repair && (
              <div className="rounded-lg border border-slate-200 px-3 py-2.5 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={floored}
                    onChange={(e) => { setFloored(e.target.checked); pick(null); }}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Add protection (buy a put)
                </label>
                {floored && (
                  <div>
                    <span className={label}>Floor below today&rsquo;s price</span>
                    <FloorLevels value={protect} onChange={(p) => { setProtect(p); pick(null); }} />
                  </div>
                )}
              </div>
            )}

            {repair ? (
              found?.long && (
                <p className="text-sm text-slate-700">
                  Buy <strong>{n} × {found.long.strike} call</strong> at {fmtMoney(num(found.long.mid))}
                  {floored && found.put && (
                    <>
                      {" "}and <strong>{n} × {found.put.strike} put</strong> at {fmtMoney(num(found.put.mid))}
                      {spot ? <span className="text-slate-500"> · {pct((spot - found.put.strike) / spot)} below today</span> : null}
                    </>
                  )}
                  , then sell twice as many of one of these calls:
                </p>
              )
            ) : (
              found?.put && (
                <p className="text-sm text-slate-700">
                  Buy the <strong>{found.put.strike} put</strong> at {fmtMoney(num(found.put.mid))}
                  {spot ? <span className="text-slate-500"> · {pct((spot - found.put.strike) / spot)} below today</span> : null}
                  , and sell one of these calls against each 100 shares:
                </p>
              )
            )}

            {onExpiry && (
              <EarningsWarning earnings={onExpiry.earnings} ticker={ticker} unknown={onExpiry.earningsUnknown} why={onExpiry.earningsUnknownWhy} />
            )}

            {found?.reason && <p className="text-xs text-amber-700 leading-relaxed">{found.reason}</p>}
            {repair && maxUnits === 0 && (
              <Bullets
                className="text-xs text-amber-700"
                items={[
                  "Each repair needs 100 free shares to cover the extra call sold.",
                  `All your ${ticker} shares already back calls you have sold.`
                ]}
              />
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    {repair ? (
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Sell 2×</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Net / share</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Break-even</th>
                        {floored && <th className="px-3 py-2 text-right font-medium" title="If the stock ends at or below the put">Worst</th>}
                        <th className="px-3 py-2 text-right font-medium" title="Only if the stock ends at or above the calls you sold">Best case</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Sell call</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Net / share</th>
                        <th className="px-3 py-2 text-right font-medium">Worst</th>
                        <th className="px-3 py-2 text-right font-medium">Best</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const on = chosen?.strike === c.strike;
                      const ref = basis !== null && basis > 0 ? basis : spot;
                      const worst = !repair && ref ? (found.put.strike - ref + c.net) * 100 : null;
                      const best = !repair && ref ? (c.strike - ref + c.net) * 100 : null;
                      return (
                        <tr
                          key={c.strike}
                          onClick={() => pick(c.strike)}
                          className={`cursor-pointer border-t border-slate-100 ${on ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-3 py-2 text-left">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="hs-strike" checked={on} onChange={() => pick(c.strike)} className="accent-emerald-600" />
                              <span className="font-semibold text-slate-900">{c.strike}</span>
                              {!repair && spot ? <span className="text-slate-400">+{pct(c.capPct)}</span> : null}
                              {!repair && c.strike === found.zeroCostStrike && (
                                <span className="whitespace-nowrap rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">Zero cost</span>
                              )}
                              {repair && c.strike === found.suggestedStrike && c.net >= 0 && (
                                <span title="The lowest break-even among those that take in a credit or cost nothing" className="whitespace-nowrap rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">Lowest at no cost</span>
                              )}
                            </label>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right ${tone(c.net)}`}>{netText(c.net)}</td>
                          {repair ? (
                            <>
                              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-900">
                                {c.breakEven === null ? <span className="text-slate-400" title="Even the best case stays below your cost.">Not reached</span> : fmtMoney(c.breakEven)}
                              </td>
                              {floored && (
                                <td className={`whitespace-nowrap px-3 py-2 text-right ${tone(c.worstPerShare)}`}>{signed(c.worstPerShare * 100 * n)}</td>
                              )}
                              <td className={`whitespace-nowrap px-3 py-2 text-right ${tone(c.capPerShare)}`}>{signed(c.capPerShare * 100 * n)}</td>
                            </>
                          ) : (
                            <>
                              <td className={`whitespace-nowrap px-3 py-2 text-right ${tone(worst)}`}>{signed(worst)}</td>
                              <td className={`whitespace-nowrap px-3 py-2 text-right ${tone(best)}`}>{signed(best)}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {repair && chosen && found?.long && basis !== null && spot !== null && (
              <RepairOutcomes
                ticker={ticker}
                spot={spot}
                shares={n * 100}
                repair={{ basis, longStrike: Number(found.long.strike), shortStrike: chosen.strike, net: chosen.net, floor: floored && found.put ? Number(found.put.strike) : null }}
                breakEven={chosen.breakEven}
              />
            )}

            {rows.length > 0 && (
              <Bullets
                className="text-[11px]"
                items={repair && floored
                  ? [
                      `At expiry, for ${n * 100} shares, against your cost of ${fmtMoney(basis)}.`,
                      `Worst: the stock ends at or below ${found.put?.strike}. The put stops the loss there.`,
                      "Best case: the stock ends at or above the calls you sold.",
                      "Net includes the put's cost. Prices are midpoints; you set yours on the ticket."
                    ]
                  : repair
                  ? [
                      `At expiry, for ${n * 100} shares, against your cost of ${fmtMoney(basis)}.`,
                      "Best case: the stock ends at or above the calls you sold. Gains above that go to the extra call.",
                      `Below ${found.long.strike}: the calls expire worthless. You keep the credit, and the shares' loss stays.`,
                      "Prices are midpoints. You set your price on the ticket."
                    ]
                  : [
                      `Per 100 shares at expiry, against ${basis !== null && basis > 0 ? `your cost of ${fmtMoney(basis)}` : "today's price (your cost is not known)"}.`,
                      "Worst: the stock ends at or below the put.",
                      "Best: the stock ends at or above the call.",
                      "Prices are midpoints. You set your price on the ticket."
                    ]}
              />
            )}

            {legs && ticket && !ticket.ok && <p className="text-xs text-rose-700">{ticket.reason}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose({})}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openTicket}
                disabled={!chosen || loading || (repair && maxUnits === 0)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open ticket
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FloorLevels({ value, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="radiogroup" aria-label="Floor below today's price">
      {LEVELS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium tabular-nums transition-colors ${
            value === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {pct(p)}
        </button>
      ))}
    </div>
  );
}

function Bullets({ items, className = "text-xs" }) {
  return (
    <ul className={`list-disc space-y-0.5 pl-4 text-left leading-relaxed text-slate-500 ${className}`}>
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

// What the selected repair does at a few prices at expiry, beside the shares
// alone -- the falls included. The owner: "what about expiry came at 95, 90
// or even 85; what happens then? Repair doesn't protect."
function RepairOutcomes({ ticker, spot, shares, repair, breakEven }) {
  const points = [
    { label: "Down 15%", price: Math.round(spot * 0.85) },
    { label: "Down 10%", price: Math.round(spot * 0.9) },
    { label: "Down 5%", price: Math.round(spot * 0.95) },
    { label: "Today", price: spot },
    ...(repair.floor !== null && repair.floor !== undefined ? [{ label: "Floor (put)", price: repair.floor }] : []),
    ...(breakEven !== null && breakEven > spot ? [{ label: "Break-even", price: breakEven }] : []),
    { label: "Best case", price: repair.shortStrike, above: true }
  ].sort((a, b) => a.price - b.price);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs tabular-nums">
        <caption className="caption-top bg-slate-50 px-3 py-2 text-left text-[11px] font-medium text-slate-600">
          If {ticker} ends at… (sell 2× {repair.shortStrike}{repair.floor ? `, put ${repair.floor}` : ""}, {shares} shares)
        </caption>
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{ticker} at</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">With repair</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Shares only</th>
          </tr>
        </thead>
        <tbody>
          {points.map((pt) => {
            const r = repairPLAt(repair, pt.price);
            // A floor point can land on a rounded "down" point; one row each.
            if (!r) return null;
            // The break-even is shown rounded to the cent, and the P/L at the
            // rounded price can be a cent or two off zero. Zero is what it is.
            const withRepair = pt.label === "Break-even" ? 0 : r.withRepair;
            return (
              <tr key={`${pt.label}_${pt.price}`} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 text-left">
                  <span className="block font-semibold text-slate-900">{fmtMoney(pt.price)}{pt.above ? " or more" : ""}</span>
                  <span className="block text-[10px] text-slate-400">{pt.label}</span>
                </td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold ${tone(withRepair)}`}>{signed(withRepair * shares)}</td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right ${tone(r.sharesAlone)}`}>{signed(r.sharesAlone * shares)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Fact({ term, value, note, tone: cls = "text-slate-900" }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{term}</dt>
      <dd className={`text-sm font-medium tabular-nums ${cls}`}>{value}</dd>
      {note && <dd className="text-[10px] text-slate-400">{note}</dd>}
    </div>
  );
}
