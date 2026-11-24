import { px, sizeText, pctText } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { positionExits, roundPrice } from "@/lib/phoneOrder";
import { runHotkey } from "../runHotkey";
import { protectiveOrder, editableOrder, qtyChangeable, cancelRows, changeBlock } from "../orderActions";
import { setExits } from "./phoneSend";
import { Btn, PriceField, QtyField, PendingBar } from "./phoneParts";

// The phone's Positions, Orders and Watchlist tabs, as cards (the approved
// design). Every close and cancel asks first (the confirm sheet); every change
// to a price or size waits on screen, "Not sent yet", until Confirm change.
// Closes and stops go through the hotkeys' own paths (runHotkey.js "exit",
// functions/terminal "protect"), so they reach every ticked account as a
// hotkey does; order changes through orderActions.js, as the desktop does.

const signed = (v) => (v >= 0 ? `+${fmtMoney(v)}` : fmtMoney(v));
const tone = (v) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-slate-600");

function Summary({ view, accountName }) {
  const s = view?.summary || {};
  const day = s.dayChange ?? (Number(s.equity) && Number(s.lastEquity) ? Number(s.equity) - Number(s.lastEquity) : null);
  const cell = (label, value, cls = "") => (
    <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div><div className={`truncate text-[17px] font-semibold tabular-nums ${cls}`}>{value}</div></div>
  );
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="mb-2 text-xs text-slate-500">{accountName}</div>
      <div className="grid grid-cols-3 gap-2">
        {cell("Equity", fmtMoney(view?.equity))}
        {cell("Day P/L", day === null ? "—" : signed(day), day === null ? "" : tone(day))}
        {cell("Buying power", fmtMoney(view?.buyingPower))}
      </div>
    </div>
  );
}

/**
 * Send a position's stop and target as they now stand (the change waiting on
 * screen over what is working): functions/terminal "protect", on every ticked
 * account, as a hotkey's stop goes.
 */
export async function sendExits({ symbol, cur, d, getCtx, notify, refresh }) {
  // Only what changed: each ticked account keeps its own other half.
  const stop = d.stop !== undefined ? d.stop : null;
  const target = d.target !== undefined ? d.target : null;
  if (!stop && !target) return;
  const c = getCtx();
  const r = await setExits({ accountId: c.account?.id, symbol, stop, target, group: c.group || [], leadOff: !!c.leadOff });
  const said = [stop && `stop ${px(stop)}`, target && `target ${px(target)}`].filter(Boolean).join(" · ");
  if (r.error) notify({ key: `px${Date.now()}`, tone: "bad", title: `${symbol} exits not changed`, detail: r.error });
  else notify({ key: `px${Date.now()}`, tone: "ok", title: `${symbol} exits set`, detail: said + (r.group?.some((g) => g.ok === false) ? " · not on every account: see Orders" : "") });
  refresh?.();
}

/** Send a working order block's change (orderActions.js changeBlock, as the desktop). */
export async function sendOrderChange({ b, d, getCtx, notify, refresh }) {
  const c = getCtx();
  const r = await changeBlock(b, { limit: d.limit ?? null, stop: d.stop ?? null, qty: d.qty ?? null }, { accountId: c.account?.id, name: c.account?.name || "This account", group: c.group || [] });
  const bad = (r.rows || []).filter((x) => x.error);
  if (r.error) notify({ key: `ocx${Date.now()}`, tone: "bad", title: "Not changed", detail: r.error });
  else if (bad.length) notify({ key: `ocx${Date.now()}`, tone: "bad", title: `Not changed on ${bad.length} account${bad.length === 1 ? "" : "s"}`, detail: bad.map((x) => `${x.name}: ${x.error}`).join(" · ") });
  else if (!r.nothing && (r.rows || []).length) notify({ key: `ocx${Date.now()}`, tone: "ok", title: "Order changed", detail: `${b.symbol} ${b.side}` });
  refresh?.();
}

/** What waits on screen for a position, in words ("Stop 11.80 → 11.90"). */
export const exitsText = (cur, d) => ["stop", "target"].filter((k) => d[k] !== undefined).map((k) => `${k === "stop" ? "Stop" : "Target"} ${cur[k] ? px(cur[k]) : "none"} → ${d[k] ? px(d[k]) : "none"}`).join(" · ");
/** What waits on screen for an order block, in words. */
export const orderText = (b, d) => [
  d.limit !== undefined && `${protectiveOrder(b.first) ? "Target" : "Limit"} ${px(b.limit)} → ${px(d.limit)}`,
  d.stop !== undefined && `Stop ${px(b.stop)} → ${px(d.stop)}`,
  d.qty !== undefined && `Qty ${sizeText(b.qty)} → ${sizeText(d.qty)}`
].filter(Boolean).join(" · ");

export function PositionCards({ view, quoteOf, getCtx, askConfirm, notify, refresh, onPick, to, accountName, pend, setPend, chartSymbol }) {
  const positions = view?.positions || [];
  const setP = (sym, k, v) => setPend((x) => ({ ...x, [sym]: { ...(x[sym] || {}), [k]: v } }));
  const undo = (sym) => setPend((x) => { const n = { ...x }; delete n[sym]; return n; });
  // The streamed bid and ask go with a close only for the chart's symbol; any
  // other is priced by the server alone (the screen's other quotes can be old).
  const ctxFor = (p) => ({ ...getCtx(), symbol: p.symbol, quote: p.symbol === chartSymbol ? quoteOf(p.symbol) : { last: quoteOf(p.symbol).last ?? null }, position: p });
  const close = (p, percent) => {
    const short = p.side === "short";
    const q = quoteOf(p.symbol);
    const at = short ? q.ask ?? q.last : q.bid ?? q.last;
    const n = Math.abs(Number(p.qty));
    askConfirm({
      title: percent >= 100 ? `Close ${p.symbol}` : `Close half of ${p.symbol}`,
      lines: [
        percent >= 100 ? `${short ? "Buy back" : "Sell"} all ${sizeText(n)} shares, about ${px(at)}`
          : `${short ? "Buy back" : "Sell"} half of the trade, as your half-exit key does: 50% of the size first entered, or all that is left when less remains (${sizeText(n)} held now)`,
        percent >= 100 && at && p.avgPrice ? `P/L about ${signed((at - p.avgPrice) * (short ? -1 : 1) * n)}` : null,
        "At market in regular hours; outside them, a limit at the best price the server trusts, extended hours.",
        "On every ticked account holding it, each for its own shares."
      ],
      to, label: percent >= 100 ? "Close position" : "Close half", tone: "sell",
      run: () => runHotkey({ action: "exit", percent, keys: "Phone" }, ctxFor(p))
    });
  };
  const closeAll = () => askConfirm({
    title: `Close all ${positions.length} positions`,
    lines: [...positions.map((p) => `${p.side === "short" ? "Buy back" : "Sell"} ${sizeText(Math.abs(p.qty))} ${p.symbol}`),
      `The positions in ${accountName}; each ticked account closes its own holding of these symbols.`],
    to, label: "Close all", tone: "sell",
    run: async () => { for (const p of positions) await runHotkey({ action: "exit", percent: 100, keys: "Phone" }, ctxFor(p)); }
  });
  const confirmExits = async (p, cur) => {
    const d = pend[p.symbol] || {};
    undo(p.symbol);
    await sendExits({ symbol: p.symbol, cur, d, getCtx, notify, refresh });
  };

  return (
    <div className="space-y-3 p-3">
      <Summary view={view} accountName={accountName} />
      {positions.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Open positions ({positions.length})</h2>
          {positions.length > 1 && <Btn tone="danger" onClick={closeAll}>Close all</Btn>}
        </div>
      )}
      {!positions.length && <p className="py-8 text-center text-sm text-slate-500">No open positions in {accountName}.</p>}
      {positions.map((p) => {
        const short = p.side === "short";
        const cur = positionExits(view?.orders, p.symbol, short);
        const d = pend[p.symbol] || {};
        const stop = d.stop !== undefined ? d.stop : cur.stop;
        const target = d.target !== undefined ? d.target : cur.target;
        const qty = Math.abs(Number(p.qty)) || 0;
        const dir = short ? -1 : 1;
        const last = quoteOf(p.symbol).last ?? p.last;
        const pl = last && p.avgPrice ? (last - p.avgPrice) * dir * qty : p.unrealized;
        const r = stop && p.avgPrice && last ? ((last - p.avgPrice) * dir) / Math.abs(p.avgPrice - stop) : null;
        const changed = Object.keys(d).length > 0;
        return (
          <div key={p.symbol} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => onPick(p.symbol)} className="min-h-[44px] min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 text-[17px] font-semibold">{p.symbol}
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${short ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{short ? "Short" : "Long"} {sizeText(qty)}</span></div>
                <div className="text-[13px] text-slate-500">Avg {px(p.avgPrice)} · last {px(last)}</div>
              </button>
              <div className="text-right">
                <div className={`text-xl font-semibold tabular-nums ${tone(pl)}`}>{signed(pl || 0)}</div>
                <div className="text-[13px] text-slate-500">{r !== null ? `${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : pctText(p.unrealizedPct)}</div>
              </div>
            </div>
            {stop ? <PriceField label="Stop" tone="text-rose-700" value={stop} onChange={(v) => setP(p.symbol, "stop", v)} sub={p.avgPrice ? `risk ${signed((stop - p.avgPrice) * dir * qty)}` : null} />
              : <button type="button" onClick={() => setP(p.symbol, "stop", roundPrice(p.avgPrice * (short ? 1.02 : 0.98)))} className="min-h-[44px] w-full rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600">+ Stop</button>}
            {target ? <PriceField label="Target" tone="text-emerald-700" value={target} onChange={(v) => setP(p.symbol, "target", v)} sub={p.avgPrice ? `at target ${signed((target - p.avgPrice) * dir * qty)}` : null} />
              : <button type="button" onClick={() => setP(p.symbol, "target", roundPrice(stop ? p.avgPrice + 2 * (p.avgPrice - stop) : p.avgPrice * (short ? 0.96 : 1.04)))} className="min-h-[44px] w-full rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600">+ Target</button>}
            {changed && (
              <PendingBar text={`${p.symbol} ${exitsText(cur, d)}${to.length > 1 ? ` · on ${to.length} accounts` : ""}`}
                onUndo={() => undo(p.symbol)} onConfirm={() => confirmExits(p, cur)} />
            )}
            <div className="grid grid-cols-3 gap-2">
              <Btn onClick={() => setP(p.symbol, "stop", roundPrice(p.avgPrice))} disabled={stop === roundPrice(p.avgPrice)}>Stop → BE</Btn>
              <Btn tone="danger" onClick={() => close(p, 50)} disabled={qty < 2}>Close ½</Btn>
              <Btn tone={short ? "buy" : "sell"} onClick={() => close(p, 100)}>Close</Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OrderCards({ blocks, recent, quoteOf, getCtx, askConfirm, notify, refresh, onPick, pend, setPend }) {
  const setP = (key, k, v) => setPend((x) => ({ ...x, [key]: { ...(x[key] || {}), [k]: v } }));
  const undo = (key) => setPend((x) => { const n = { ...x }; delete n[key]; return n; });
  const names = (b) => b.rows.map((r) => `${r.name}${r.live ? " (live)" : ""}`);
  const kindOf = (b) => (b.orderClass === "oco" ? "Stop + target" : b.type === "limit" ? "Limit" : b.type === "stop" ? "Stop" : b.type === "stop_limit" ? "Stop limit" : b.type === "market" ? "Market" : b.type);
  const cancel = (b) => askConfirm({
    title: "Cancel order",
    lines: [`${b.side === "buy" ? "Buy" : "Sell"} ${b.qty != null ? sizeText(b.qty) : fmtMoney(b.notional)} ${b.symbol} · ${kindOf(b)}${b.limit ? ` ${px(b.limit)}` : ""}${b.stop ? ` stop ${px(b.stop)}` : ""}`,
      protectiveOrder(b.first) ? { text: "This is a stop protecting a position: cancelling it leaves the position without it.", warn: true } : null],
    to: names(b), label: "Cancel order", tone: "sell",
    run: async () => {
      const rows = await cancelRows(b.rows);
      const bad = rows.filter((r) => r.error);
      notify({ key: `oc${Date.now()}`, tone: bad.length ? "bad" : "ok", title: bad.length ? `Not cancelled on ${bad.length} account${bad.length === 1 ? "" : "s"}` : "Cancelled", detail: bad.length ? bad.map((r) => `${r.name}: ${r.error}`).join(" · ") : `${b.symbol} ${b.side}` });
      refresh?.();
    }
  });
  const cancelAll = () => askConfirm({
    title: `Cancel all ${blocks.length} orders`,
    lines: [...blocks.map((b) => `${b.symbol} ${b.side} ${b.qty != null ? sizeText(b.qty) : ""} · ${kindOf(b)}`),
      blocks.some((b) => protectiveOrder(b.first)) ? { text: "Stops protecting positions are cancelled too.", warn: true } : null],
    to: [...new Set(blocks.flatMap(names))], label: "Cancel all", tone: "sell",
    run: async () => {
      const rows = (await Promise.all(blocks.map((b) => cancelRows(b.rows)))).flat();
      const bad = rows.filter((r) => r.error);
      notify({ key: `oc${Date.now()}`, tone: bad.length ? "bad" : "ok", title: bad.length ? `${bad.length} not cancelled` : `Cancelled ${rows.length}`, detail: bad.map((r) => `${r.name}: ${r.error}`).join(" · ") || "Every working order" });
      refresh?.();
    }
  });
  const confirmChange = async (b) => {
    const d = pend[b.key] || {};
    undo(b.key);
    await sendOrderChange({ b, d, getCtx, notify, refresh });
  };
  const todayNy = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const when = (o) => o.filledAt || o.updatedAt || "";
  const today = (recent || []).filter((o) => when(o) && new Date(when(o)).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === todayNy);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Working ({blocks.length})</h2>
        {blocks.length > 1 && <Btn tone="danger" onClick={cancelAll}>Cancel all</Btn>}
      </div>
      {!blocks.length && <p className="py-6 text-center text-sm text-slate-500">No working orders.</p>}
      {blocks.map((b) => {
        const d = pend[b.key] || {};
        const protective = protectiveOrder(b.first);
        const canEdit = editableOrder(b.first);
        const limitV = d.limit !== undefined ? d.limit : b.limit;
        const stopV = d.stop !== undefined ? d.stop : b.stop;
        const qtyV = d.qty !== undefined ? d.qty : b.qty;
        const q = quoteOf(b.symbol);
        const ref = limitV ?? stopV;
        const away = ref && q.last ? `${Math.abs(ref - q.last).toFixed(ref >= 1 ? 2 : 4)} ${ref >= q.last ? "above" : "below"} last` : "";
        const changes = Object.keys(d).length ? [orderText(b, d)] : [];
        return (
          <div key={b.key} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => onPick(b.symbol)} className="min-h-[44px] min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 text-[17px] font-semibold">{b.symbol}
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${b.side === "buy" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{b.side === "buy" ? "Buy" : "Sell"} {b.qty != null ? sizeText(b.qty) : fmtMoney(b.notional)}</span></div>
                <div className="text-[13px] text-slate-500">{kindOf(b)}{away ? ` · ${away}` : ""}</div>
              </button>
              <div className="text-right text-xs text-slate-500">
                <div className="font-semibold text-dm-accent">Working</div>
                {b.first?.extendedHours !== undefined && <div>{b.first.extendedHours ? "Extended hours" : "Regular hours"}</div>}
                {b.rows.length > 1 && <div>{b.rows.length} accounts</div>}
              </div>
            </div>
            {canEdit && !protective && b.limit != null && <PriceField label="Limit" value={limitV} onChange={(v) => setP(b.key, "limit", v)} />}
            {canEdit && protective && b.stop != null && <PriceField label="Stop" tone="text-rose-700" value={stopV} onChange={(v) => setP(b.key, "stop", v)} />}
            {canEdit && protective && b.orderClass === "oco" && b.limit != null && <PriceField label="Target" tone="text-emerald-700" value={limitV} onChange={(v) => setP(b.key, "limit", v)} />}
            {canEdit && qtyChangeable(b) && b.qty != null && <QtyField value={qtyV} onChange={(v) => setP(b.key, "qty", v)} sub="shares" />}
            {!canEdit && <p className="text-[13px] text-slate-500">This kind of order can only be cancelled here.</p>}
            {changes.length > 0 && <PendingBar text={`${b.symbol} ${changes.join(" · ")}`} onUndo={() => undo(b.key)} onConfirm={() => confirmChange(b)} />}
            <div className="flex gap-2">
              {canEdit && !protective && b.limit != null && <>
                <Btn className="flex-1" onClick={() => setP(b.key, "limit", roundPrice(q.bid ?? q.last))}>To bid</Btn>
                <Btn className="flex-1" onClick={() => setP(b.key, "limit", roundPrice(q.ask ?? q.last))}>To ask</Btn>
              </>}
              <Btn tone="danger" className="flex-1" onClick={() => cancel(b)}>Cancel</Btn>
            </div>
          </div>
        );
      })}
      <h2 className="pt-2 text-[15px] font-semibold">Today</h2>
      {!today.length && <p className="text-sm text-slate-500">Fills and cancels show here.</p>}
      <div className="divide-y divide-slate-100">
        {today.map((o) => (
          <div key={o.id} className="flex gap-3 py-2.5 text-[13px]">
            <span className="w-12 shrink-0 tabular-nums text-slate-500">{new Date(when(o)).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            <span className="min-w-0 flex-1">{o.side === "buy" ? "Bought" : "Sold"} {Number(o.filled) > 0 ? sizeText(o.filled) : sizeText(o.qty)} {o.symbol}{Number(o.filled) > 0 && o.avgPrice ? ` @ ${px(o.avgPrice)}` : ""} · <span className="text-slate-500">{o.status}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchRows({ symbols, quoteOf, current, onPick }) {
  return (
    <div>
      {symbols.map((s) => {
        const q = quoteOf(s);
        return (
          <button key={s} type="button" onClick={() => onPick(s)} aria-current={s === current}
            className={`flex min-h-[60px] w-full items-center gap-3 border-b border-slate-100 px-4 text-left ${s === current ? "bg-indigo-50" : "bg-white"}`}>
            <span className="min-w-0 flex-1 text-base font-semibold">{s}</span>
            <span className="text-right">
              <span className="block font-mono text-[15px] font-semibold tabular-nums">{px(q.last)}</span>
              <span className={`text-xs font-semibold ${tone(q.changePct)}`}>{pctText(q.changePct)}</span>
            </span>
          </button>
        );
      })}
      {!symbols.length && <p className="p-6 text-center text-sm text-slate-500">Your watchlist is empty. Search a symbol at the top.</p>}
    </div>
  );
}
