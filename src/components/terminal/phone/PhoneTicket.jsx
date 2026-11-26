import { useEffect, useMemo, useState } from "react";
import { px } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { buildPhoneOrder, riskReward, roundPrice, phoneSession } from "@/lib/phoneOrder";
import { Btn, Chip, Sheet, SheetHead, PriceField, QtyField } from "./phoneParts";
import { allocateParts, sendTicket } from "./phoneSend";

// The phone's order ticket, a sheet from the bottom (the approved design):
// side, size (typed, arrows or a chip; by risk once a stop is set), type,
// price with Bid / Mid / Ask, the stop and target sent with it, and the hours
// (extended by default). Review opens the confirm step; nothing is sent
// before it.

const SIZES = [1, 10, 50, 100, 500, 1000];

export default function PhoneTicket({ open, onClose, start, account, symbol, quote, equity, held = 0, ctx, extDefault, notify, refresh, askConfirm, accountName }) {
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState(100);
  const [type, setType] = useState("market");
  const [price, setPrice] = useState(null);
  const [sl, setSl] = useState(null);
  const [tp, setTp] = useState(null);
  const [ext, setExt] = useState(extDefault);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const touch = (s) => (s === "buy" ? quote?.ask ?? quote?.last : quote?.bid ?? quote?.last);

  // Each opening starts from what opened it: Buy or Sell, a price on the chart.
  useEffect(() => {
    if (!open) return;
    const s = start?.side || "buy";
    setSide(s);
    setType(start?.type || "market");
    setPrice(roundPrice(start?.price ?? touch(s)));
    setSl(null); setTp(null); setProblem(""); setExt(extDefault);
    // Only when it opens; the quote moves on underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start?.at]);

  const session = phoneSession(Date.now() / 1000);
  const draft = { symbol, side, qty, type, limit: price, stop: price, ext, sl, tp };
  const built = useMemo(() => buildPhoneOrder(draft, { session, quote, play: ctx?.play || null, held }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, side, qty, type, price, ext, sl, tp, session, quote?.bid, quote?.ask, quote?.last, ctx?.play, held]);
  const rr = riskReward({ side, qty, entry: built.entry, sl, tp });
  const pickSide = (s) => {
    setSide(s);
    setPrice(roundPrice(touch(s)));
    setSl(null); setTp(null);
  };
  const defStop = () => roundPrice((built.entry || touch(side) || 0) * (side === "buy" ? 0.98 : 1.02));
  const defTarget = () => {
    const e = built.entry || touch(side) || 0;
    return roundPrice(sl ? e + 2 * (e - sl) : e * (side === "buy" ? 1.04 : 0.96));
  };
  const byRisk = (pct) => {
    const per = Math.abs((built.entry || 0) - (sl || 0));
    if (!(per > 0) || !(Number(equity) > 0)) return;
    setQty(Math.max(1, Math.floor((Number(equity) * pct / 100) / per)));
  };

  const review = async () => {
    if (built.error) { setProblem(built.error); return; }
    if (ctx?.none) { setProblem("No account is ticked for orders. Tick one under the account badge."); return; }
    setProblem("");
    setBusy(true);
    const alloc = await allocateParts({ account, order: built.order, group: ctx?.group || [], leadOff: !!ctx?.leadOff });
    setBusy(false);
    if (alloc.error) { setProblem(alloc.error); return; }
    // Closing on a ticked account: its stop and target would open the other way there (W48-F1).
    if (alloc.closing && (built.order?.stopLoss || built.later)) { setProblem("Its take-profit and stop-loss would open a new position the other way on an account that holds this. Set them on the position instead."); return; }
    const parts = alloc.rows.filter((g) => Number(g.part) > 0);
    if (!parts.length) { setProblem("Nothing to send: every account's part comes to zero."); return; }
    askConfirm({
      title: `${side === "buy" ? "Buy" : "Sell"} ${symbol}`,
      lines: [
        built.words,
        // Shared over several accounts, the risk is the total's, not a share of the screen account (W48-F7).
        rr.risk !== null ? `Risk ${fmtMoney(rr.risk)}${alloc.rows.length > 1 ? ` in total over ${alloc.rows.length} accounts` : Number(equity) > 0 ? ` (${(rr.risk / Number(equity) * 100).toFixed(2)}% of ${accountName || "the account"})` : ""}${rr.r !== null ? ` · reward ${rr.r.toFixed(1)}R` : ""}` : "No stop set",
        ...built.notes.map((t) => ({ text: t, warn: /waits|only/.test(t) })),
        ...(alloc.rows.length > 1 ? [`Shared by portfolio size: ${alloc.rows.map((g) => `${g.name} ${g.part}`).join(" · ")}`] : [])
      ],
      to: parts.map((g) => `${g.name}${g.live ? " (live)" : ""}`),
      label: `Send ${side === "buy" ? "buy" : "sell"}`,
      tone: side === "buy" ? "buy" : "sell",
      run: async () => {
        // The session moved on while the review was open (19:59 to 20:00, or
        // the open): built again from the start rather than sent as it was.
        if (phoneSession(Date.now() / 1000) !== session) { setProblem("The trading session changed while you were reviewing. Review again."); return; }
        const ok = await sendTicket({ account, built, alloc, leadOff: !!ctx?.leadOff, notify, refresh });
        if (ok) onClose();
      }
    });
  };

  const priceSub = type === "market" ? null : quote?.last ? `last ${px(quote.last)}` : null;
  return (
    <Sheet open={open} onClose={onClose} label={`Order ticket ${symbol}`}>
      <SheetHead title={symbol} sub={`Bid ${px(quote?.bid)} · Ask ${px(quote?.ask)}`} onClose={onClose} />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {[["buy", "Buy"], ["sell", "Sell"]].map(([s, l]) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => pickSide(s)}
              className={`min-h-[44px] rounded-lg text-[15px] font-semibold ${side === s ? (s === "buy" ? "bg-emerald-700 text-white" : "bg-rose-700 text-white") : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        <div className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Shares</span>
          <QtyField label="" value={qty} onChange={setQty} steps={[-10, 10]} big />
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((n) => <Chip key={n} on={qty === n} onClick={() => setQty(n)}>{n}</Chip>)}
            {sl ? <><Chip onClick={() => byRisk(0.5)}>0.5% risk</Chip><Chip onClick={() => byRisk(1)}>1% risk</Chip></> : <span className="self-center text-xs text-slate-500">Add a stop to size by risk</span>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {[["market", "Market"], ["limit", "Limit"], ["stop", "Stop"]].map(([t, l]) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); if (!price) setPrice(roundPrice(touch(side))); }}
              className={`min-h-[40px] rounded-lg text-sm font-semibold ${type === t ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {type !== "market" && (
          <>
            <PriceField label={type === "limit" ? "Limit" : "Trigger"} value={price} onChange={setPrice} sub={priceSub} />
            <div className="grid grid-cols-3 gap-2">
              <Btn onClick={() => setPrice(roundPrice(quote?.bid ?? quote?.last))}>Bid</Btn>
              <Btn onClick={() => setPrice(roundPrice(quote?.bid && quote?.ask ? (quote.bid + quote.ask) / 2 : quote?.last))}>Mid</Btn>
              <Btn onClick={() => setPrice(roundPrice(quote?.ask ?? quote?.last))}>Ask</Btn>
            </div>
          </>
        )}
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Exits</span>
        {sl ? <PriceField label="Stop" tone="text-rose-700" value={sl} onChange={setSl} onRemove={() => setSl(null)} sub={rr.risk !== null ? `risk ${fmtMoney(rr.risk)}` : null} />
          : <button type="button" onClick={() => setSl(defStop())} className="min-h-[44px] w-full rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600">+ Stop</button>}
        {tp ? <PriceField label="Target" tone="text-emerald-700" value={tp} onChange={setTp} onRemove={() => setTp(null)} sub={rr.reward !== null ? `at target ${fmtMoney(rr.reward)}` : null} />
          : <button type="button" onClick={() => setTp(defTarget())} className="min-h-[44px] w-full rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600">+ Target{sl ? " at 2R" : ""}</button>}
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hours</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(/** @type {[boolean, string][]} */ ([[true, "Extended 4:00–20:00"], [false, "Regular 9:30–16:00"]])).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={ext === v} onClick={() => setExt(v)}
              className={`min-h-[40px] rounded-lg text-[13px] font-semibold ${ext === v ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {!built.error && built.notes.length > 0 && (
          <div className="space-y-1 text-[13px] leading-snug">
            {built.notes.map((t) => <p key={t} className={/waits|only/.test(t) ? "font-medium text-rose-700" : "text-slate-600"}>{t}</p>)}
          </div>
        )}
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-snug">
          <p className="font-semibold text-slate-900">{built.error ? "—" : built.words}</p>
          <p className="text-slate-500">{rr.risk !== null ? `Risk ${fmtMoney(rr.risk)}${Number(equity) > 0 ? ` · ${(rr.risk / Number(equity) * 100).toFixed(2)}% of the account` : ""}${rr.r !== null ? ` · reward ${rr.r.toFixed(1)}R` : ""}` : "No stop set"}</p>
        </div>
        {problem && <p className="text-sm font-medium text-rose-700">{problem}</p>}
        <Btn tone={side === "buy" ? "buy" : "sell"} className="min-h-[56px] w-full text-base" onClick={review} disabled={busy}>
          {busy ? "Working out each account's part…" : `Review ${side === "buy" ? "buy" : "sell"} of ${qty} ${symbol}`}
        </Btn>
      </div>
    </Sheet>
  );
}
