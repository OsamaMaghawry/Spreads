import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CandlestickChart, List, Briefcase, ClipboardList, MoreHorizontal, Search, ChevronRight } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { px, pctText, sizeText } from "@/lib/terminal";
import { fmtMoney } from "@/lib/format";
import { orderBlocks } from "@/lib/accountGroup";
import { describe } from "@/lib/hotkeys";
import { phoneSession, SESSION_LABEL, positionExits } from "@/lib/phoneOrder";
import { protectiveOrder, editableOrder } from "../orderActions";
import { runHotkey } from "../runHotkey";
import { Btn, Chip, Sheet, SheetHead, ConfirmSheet, ModeBadge, PendingBar } from "./phoneParts";
import PhoneTicket from "./PhoneTicket";
import { PositionCards, OrderCards, WatchRows, sendExits, sendOrderChange, exitsText, orderText } from "./PhoneLists";

// The Terminal on a phone (24 Nov, the owner: "Trading over the phone is so
// poor. I need way better experience"; the design he approved the same day).
// One screen per job, the actions within reach of a thumb: a top bar with the
// symbol, the session and the account (PAPER, LIVE or REPLAY); tabs at the
// foot; Buy and Sell above them; the position on the chart's symbol with its
// own Close. Everything that sends asks first. The same data and the same
// server actions as the desktop: nothing here sends an order any other way.

/** @type {[string, string, any][]} */
const TABS = [
  ["chart", "Chart", CandlestickChart], ["watch", "Watchlist", List], ["positions", "Positions", Briefcase], ["orders", "Orders", ClipboardList], ["more", "More", MoreHorizontal]
];

export default function PhoneTerminal(props) {
  const {
    account, accounts, ticks, onTicks, onShowAccount, liveOk, plan, symbol, onSymbol, quote, quoteOf, view, others, refresh, notify,
    watch, getCtx, hotkeys, extDefault, onExtDefault, renderChart, replaying, onPage, renderPanel, fullTicket, crypto, futuresOn, toasts
  } = props;
  const [tab, setTab] = useState("chart");
  const [ticket, setTicket] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const session = phoneSession(now / 1000);
  const mode = replaying ? "replay" : account?.type === "Live" ? "live" : "paper";

  // Where orders go: the ticked accounts, as the desktop sends them (lib/accountGroup.js sendPlan).
  const to = useMemo(() => {
    const byId = (id) => accounts.find((a) => a.id === id);
    const list = [...(plan.leadOff || !account ? [] : [account]), ...plan.group.map((g) => byId(g.id)).filter(Boolean)];
    return list.map((a) => `${a.name}${a.type === "Live" ? " (live)" : ""}`);
  }, [accounts, plan, account]);
  const blocks = useMemo(() => orderBlocks([
    { accountId: account?.id, name: account?.name || "This account", live: account?.type === "Live", orders: view?.orders || [] },
    ...others.filter((g) => g.accountId !== account?.id).map((g) => ({ accountId: g.accountId, name: g.name, live: !!g.live, orders: g.orders || [] }))
  ]), [account, view?.orders, others]);
  const position = (view?.positions || []).find((p) => p.symbol === symbol);
  const pick = (s) => { onSymbol(s); setTab("chart"); };
  // Changes made on screen and not sent yet: a position's stop and target (by
  // symbol), an order block's price and size (by block). The chart's handles
  // and the cards share them; Confirm change sends, Undo drops.
  const [posPend, setPosPend] = useState({});
  const [ordPend, setOrdPend] = useState({});
  const exits = useMemo(() => (position ? positionExits(view?.orders, symbol, position.side === "short") : { stop: null, target: null }), [position, view?.orders, symbol]);
  const myBlocks = useMemo(() => blocks.filter((b) => b.symbol === symbol && editableOrder(b.first) && !protectiveOrder(b.first) && b.limit != null), [blocks, symbol]);
  const pd = posPend[symbol];
  const pdKey = JSON.stringify(pd || {});
  const odKey = JSON.stringify(myBlocks.map((b) => [b.key, ordPend[b.key]?.limit]));
  const tradeLines = useMemo(() => {
    const out = [];
    const d = pd || {};
    if (position) {
      const stop = d.stop !== undefined ? d.stop : exits.stop;
      const target = d.target !== undefined ? d.target : exits.target;
      out.push({ id: "avg", price: position.avgPrice, color: "#64748b", title: `${position.side === "short" ? "Short" : "Long"} ${sizeText(Math.abs(position.qty))}` });
      out.push(stop ? { id: "stop", price: stop, color: "#be123c", title: `Stop${d.stop !== undefined ? " · not sent" : ""}`, draggable: true, label: "SL", slot: 0, pending: d.stop !== undefined }
        : { id: "stop", price: position.avgPrice, color: "#be123c", draggable: true, handleOnly: true, label: "SL", slot: 0 });
      out.push(target ? { id: "target", price: target, color: "#047857", title: `Target${d.target !== undefined ? " · not sent" : ""}`, draggable: true, label: "TP", slot: 1, pending: d.target !== undefined }
        : { id: "target", price: position.avgPrice, color: "#047857", draggable: true, handleOnly: true, label: "TP", slot: 1 });
    }
    for (const b of myBlocks) {
      const lp = ordPend[b.key]?.limit;
      out.push({ id: `o:${b.key}`, price: lp ?? b.limit, color: "#534AB7", title: `${b.side === "buy" ? "Buy" : "Sell"} ${b.qty != null ? sizeText(b.qty) : ""}${lp !== undefined ? " · not sent" : ""}`, draggable: true, label: "⇕", slot: 0, pending: lp !== undefined });
    }
    return out;
    // Built again only when what it shows changes, not on every quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.avgPrice, position?.qty, position?.side, exits.stop, exits.target, pdKey, odKey]);
  const onLineMove = useCallback((line, price) => {
    if (line.id === "stop" || line.id === "target") setPosPend((x) => ({ ...x, [symbol]: { ...(x[symbol] || {}), [line.id]: price } }));
    else if (line.id.startsWith("o:")) { const key = line.id.slice(2); setOrdPend((x) => ({ ...x, [key]: { ...(x[key] || {}), limit: price } })); }
  }, [symbol]);
  const dropPos = (s) => setPosPend((x) => { const n = { ...x }; delete n[s]; return n; });
  const dropOrd = (k) => setOrdPend((x) => { const n = { ...x }; delete n[k]; return n; });

  const quick = (h) => setConfirm({
    title: describe(h) || h.keys,
    lines: [`${symbol}, as your ${h.keys} key does`],
    to, label: "Send", tone: h.action === "buy" ? "buy" : h.action === "sell" || h.action === "exit" ? "sell" : "primary",
    run: () => runHotkey(h, getCtx())
  });
  const builtIn = [
    { id: "flat", action: "exit", percent: 100, keys: "Flatten", label: `Flatten ${symbol}` },
    { id: "cxl", action: "cancelSymbol", keys: "Cancel", label: `Cancel ${symbol} orders` }
  ];
  const closeStrip = (percent) => {
    if (!position) return;
    const short = position.side === "short";
    setConfirm({
      title: percent >= 100 ? `Close ${symbol}` : `Close half of ${symbol}`,
      lines: [percent >= 100 ? `${short ? "Buy back" : "Sell"} all ${sizeText(Math.abs(position.qty))} shares, about ${px(short ? quote.ask : quote.bid)}`
        : `${short ? "Buy back" : "Sell"} half of the trade, as your half-exit key does: 50% of the size first entered, or all that is left when less remains (${sizeText(Math.abs(position.qty))} held now)`,
        "At market in regular hours; outside them, a limit at the best price the server trusts, extended hours."],
      to, label: percent >= 100 ? "Close position" : "Close half", tone: "sell",
      run: () => runHotkey({ action: "exit", percent, keys: "Phone" }, { ...getCtx(), symbol, quote, position })
    });
  };

  const showTrade = tab === "chart" || tab === "watch";
  const dir = position?.side === "short" ? -1 : 1;
  const pl = position && quote.last ? (quote.last - position.avgPrice) * dir * Math.abs(position.qty) : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 text-slate-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {toasts}
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={() => setSearchOpen(true)} className="flex min-h-[44px] min-w-0 flex-1 flex-col items-start rounded-lg px-1 text-left">
          <span className="flex items-center gap-1 text-lg font-semibold leading-tight">{symbol}<Search className="h-4 w-4 text-slate-400" /></span>
          <span className="flex gap-2 text-[13px] tabular-nums text-slate-500">{px(quote.last)}<span className={quote.changePct >= 0 ? "text-emerald-700" : "text-rose-700"}>{pctText(quote.changePct)}</span></span>
        </button>
        {!crypto && !futuresOn && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${session === "regular" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{SESSION_LABEL[session]}</span>}
        <ModeBadge mode={mode} name={account?.name || ""} onClick={() => setAcctOpen(true)} />
      </header>

      <main className={`min-h-0 flex-1 ${tab === "chart" ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-contain"}`}>
        {tab === "chart" && (
          <>
            <div className="min-h-0 flex-1">{renderChart(replaying ? null : tradeLines, onLineMove, setConfirm)}</div>
            {!replaying && (pd || myBlocks.some((b) => ordPend[b.key])) && (
              <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-3 py-2">
                {pd && position && <PendingBar text={`${symbol} ${exitsText(exits, pd)}${to.length > 1 ? ` · on ${to.length} accounts` : ""}`} onUndo={() => dropPos(symbol)}
                  onConfirm={() => { const d = pd; dropPos(symbol); sendExits({ symbol, cur: exits, d, getCtx, notify, refresh }); }} />}
                {myBlocks.filter((b) => ordPend[b.key]).map((b) => (
                  <PendingBar key={b.key} text={`${symbol} ${orderText(b, ordPend[b.key])}`} onUndo={() => dropOrd(b.key)}
                    onConfirm={() => { const d = ordPend[b.key]; dropOrd(b.key); sendOrderChange({ b, d, getCtx, notify, refresh }); }} />
                ))}
              </div>
            )}
            {!replaying && (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2">
                {[...builtIn, ...hotkeys].map((h) => <Chip key={h.id || h.keys} onClick={() => quick(h)} className="min-h-[44px] font-semibold">{h.label || describe(h) || h.keys}</Chip>)}
              </div>
            )}
          </>
        )}
        {tab === "watch" && <WatchRows symbols={watch} quoteOf={quoteOf} current={symbol} onPick={pick} />}
        {tab === "positions" && (replaying ? renderPanel("practice") :
          <PositionCards view={view} quoteOf={quoteOf} getCtx={getCtx} askConfirm={setConfirm} notify={notify} refresh={refresh} onPick={pick} to={to} accountName={account?.name || ""} pend={posPend} setPend={setPosPend} chartSymbol={symbol} />)}
        {tab === "orders" && <OrderCards blocks={blocks} recent={view?.recent || []} quoteOf={quoteOf} getCtx={getCtx} askConfirm={setConfirm} notify={notify} refresh={refresh} onPick={pick} pend={ordPend} setPend={setOrdPend} />}
        {tab === "more" && (
          <div className="space-y-3 p-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {(/** @type {[string, () => void][]} */ ([
                ["Scanner", () => onPage("screen")], ["Gamma", () => onPage("gamma")], ["Playbook", () => onPage("playbook")],
                ["News", () => setPanel("news")], ["Futures challenge", () => setPanel("futures")], ["Replay results", () => setPanel("results")],
                ["Account", () => setPanel("account")], ["Demo results", () => setPanel("demo")]
              ])).map(([name, go]) => (
                <button key={name} type="button" onClick={go} className="flex min-h-[56px] w-full items-center gap-3 border-b border-slate-100 px-4 text-left text-[15px] last:border-0">
                  <span className="flex-1">{name}</span><ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[15px] font-semibold">Orders default to</div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(/** @type {[boolean, string][]} */ ([[true, "Extended hours"], [false, "Regular hours"]])).map(([v, l]) => (
                  <button key={l} type="button" aria-pressed={extDefault === v} onClick={() => onExtDefault(v)}
                    className={`min-h-[40px] rounded-lg text-sm font-semibold ${extDefault === v ? "bg-white shadow" : "text-slate-500"}`}>{l}</button>
                ))}
              </div>
              <p className="text-xs text-slate-500">Saved with your account. Each ticket can still switch.</p>
            </div>
            <p className="px-1 text-xs text-slate-500">Quick buttons are your hotkeys; set them on the desktop Terminal. Every close, cancel and change asks you to confirm.</p>
            <Link to="/" className="flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white text-[15px] font-semibold">Leave the Terminal</Link>
          </div>
        )}
      </main>

      {showTrade && position && !replaying && (
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <b className="text-sm">{position.side === "short" ? "Short" : "Long"} {sizeText(Math.abs(position.qty))}</b> @ <span className="tabular-nums">{px(position.avgPrice)}</span><br />
            <span className={`tabular-nums ${pl > 0 ? "text-emerald-700" : pl < 0 ? "text-rose-700" : ""}`}>{pl === null ? "—" : `${pl >= 0 ? "+" : ""}${fmtMoney(pl)}`}</span>
          </div>
          <Btn tone="danger" onClick={() => closeStrip(50)} disabled={Math.abs(position.qty) < 2}>½</Btn>
          <Btn tone={position.side === "short" ? "buy" : "sell"} onClick={() => closeStrip(100)}>Close</Btn>
        </div>
      )}
      {showTrade && !replaying && !futuresOn && (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-3 py-2">
          <Btn tone="sell" className="min-h-[56px] flex-col gap-0 text-base" onClick={() => setTicket({ side: "sell", at: Date.now() })}>Sell<small className="font-mono text-[13px] font-medium opacity-90">{px(quote.bid)}</small></Btn>
          <Btn tone="buy" className="min-h-[56px] flex-col gap-0 text-base" onClick={() => setTicket({ side: "buy", at: Date.now() })}>Buy<small className="font-mono text-[13px] font-medium opacity-90">{px(quote.ask)}</small></Btn>
        </div>
      )}
      <nav className="grid shrink-0 grid-cols-5 border-t border-slate-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map(([id, name, Icon]) => {
          const n = id === "positions" ? (view?.positions?.length || 0) : id === "orders" ? blocks.length : 0;
          return (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === id ? "text-dm-accent" : "text-slate-500"}`}>
              <Icon className="h-[22px] w-[22px]" />{name}
              {n > 0 && <span className="absolute left-[calc(50%+6px)] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-dm-accent px-1 text-[11px] font-bold text-white">{n}</span>}
            </button>
          );
        })}
      </nav>

      {crypto ? (
        <Sheet open={!!ticket} onClose={() => setTicket(null)} label="Order ticket">
          <SheetHead title={`${symbol}: full ticket`} sub="Coins use the full ticket" onClose={() => setTicket(null)} />
          {fullTicket}
        </Sheet>
      ) : (
        <PhoneTicket open={!!ticket} onClose={() => setTicket(null)} start={ticket} account={account} symbol={symbol} quote={quote} equity={view?.equity}
          held={position ? (position.side === "short" ? -1 : 1) * Math.abs(Number(position.qty) || 0) : 0}
          ctx={getCtx()} extDefault={extDefault} notify={notify} refresh={refresh} askConfirm={setConfirm} accountName={account?.name} />
      )}
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} mode={mode} />

      <Sheet open={acctOpen} onClose={() => setAcctOpen(false)} label="Accounts">
        <SheetHead title="Accounts" sub="Tap one to show it. Tick the ones orders go to." onClose={() => setAcctOpen(false)} />
        <div className="space-y-2">
          {accounts.map((a) => {
            const ticked = ticks.includes(a.id);
            const live = a.type === "Live";
            return (
              <div key={a.id} className={`flex items-center gap-2 rounded-xl border p-2 ${a.id === account?.id ? "border-dm-accent bg-indigo-50" : "border-slate-200"}`}>
                <button type="button" onClick={() => { onShowAccount(a.id); setAcctOpen(false); }} className="min-h-[48px] min-w-0 flex-1 px-1 text-left">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className={`text-xs ${live ? "text-rose-700" : "text-slate-500"}`}>{live ? (liveOk ? "Live" : "Live · not tradable here") : "Paper"}</div>
                </button>
                <label className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={ticked} disabled={live && !liveOk}
                    onChange={() => onTicks(ticked ? ticks.filter((x) => x !== a.id) : [...ticks, a.id])} />Orders
                </label>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">Orders go to: {to.length ? to.join(", ") : "no account ticked"}. Sizes for each account are set on the desktop Accounts list.</p>
        </div>
      </Sheet>

      <SymbolSheet open={searchOpen} onClose={() => setSearchOpen(false)} accountId={account?.id} watch={watch} onPick={(s) => { pick(s); setSearchOpen(false); }} />

      <Sheet open={!!panel} onClose={() => setPanel(null)} label={panel || ""}>
        <SheetHead title={{ news: "News", futures: "Futures challenge", results: "Replay results", account: "Account", demo: "Demo results" }[panel] || ""} onClose={() => setPanel(null)} />
        <div className="max-h-[75vh] overflow-auto">{panel && renderPanel(panel)}</div>
      </Sheet>
    </div>
  );
}

function SymbolSheet({ open, onClose, accountId, watch, onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => { if (!open) { setQ(""); setResults([]); } }, [open]);
  useEffect(() => {
    if (!q.trim() || !accountId) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      invokeFunction("terminal", { action: "search", accountId, q }).then((r) => setResults(r?.data?.results || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, accountId]);
  const typed = q.trim().toUpperCase();
  return (
    <Sheet open={open} onClose={onClose} label="Find a symbol">
      <SheetHead title="Find a symbol" onClose={onClose} />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol or company" aria-label="Symbol or company"
        className="mb-3 h-12 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-dm-accent focus:outline-none" />
      <div className="max-h-[55vh] overflow-auto">
        {typed && !results.some((r) => r.symbol === typed) && /^[A-Z.]{1,6}$/.test(typed) && (
          <button type="button" onClick={() => onPick(typed)} className="flex min-h-[52px] w-full items-center border-b border-slate-100 px-2 text-left font-semibold">{typed}</button>
        )}
        {(q ? results : watch.map((s) => ({ symbol: s }))).map((r) => (
          <button key={r.symbol} type="button" onClick={() => onPick(r.symbol)} className="flex min-h-[52px] w-full items-center gap-3 border-b border-slate-100 px-2 text-left">
            <span className="font-semibold">{r.symbol}</span><span className="truncate text-sm text-slate-500">{r.name || ""}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
