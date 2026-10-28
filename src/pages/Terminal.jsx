import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus, Lock, LockOpen, RotateCcw, Maximize2, Minimize2, GripVertical, Keyboard, Square, Columns2, LayoutGrid, ChevronDown, Check } from "lucide-react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "@/components/terminal/terminal.css";
import { invokeFunction } from "@/lib/functions";
import { readWatchlist, cleanWatchlist, withCoinsOnce, px, pctText, sizeText, isCrypto, WATCHLIST_MAX, shareFeed, SHARE_FEEDS } from "@/lib/terminal";
import { DEFAULT_LAYOUTS, BREAKPOINTS, COLS, MARGIN, cleanLayouts, rowHeightFor, fromFirstVersion } from "@/lib/terminalLayout";
import { fmtMoney } from "@/lib/format";
import { readPrefs, savePref, settle } from "@/lib/terminalPrefs";
import useTerminalStream from "@/components/terminal/useTerminalStream";
import PriceChart from "@/components/terminal/PriceChart";
import OrderTicket from "@/components/terminal/OrderTicket";
import OrderBook from "@/components/terminal/OrderBook";
import TapePanel from "@/components/terminal/TapePanel";
import Toasts from "@/components/terminal/Toasts";
import Screener from "@/components/terminal/Screener";
import HotkeysDialog from "@/components/terminal/Hotkeys";
import { runHotkey, prefetchStep } from "@/components/terminal/runHotkey";
import { noteOrder } from "@/components/terminal/orderFeed";
import { comboOf, cleanHotkeys } from "@/lib/hotkeys";
import { Positions, Orders, AccountSummary, GroupHoldings } from "@/components/terminal/Panels";
import useReplay from "@/components/terminal/useReplay";
import ReplayBar, { ReplayStart } from "@/components/terminal/ReplayBar";
import { PracticePositions, ReplayResults, DemoResults } from "@/components/terminal/ReplayPanels";
import NewsPanel, { useNews } from "@/components/terminal/NewsPanel";
import GroupPicker from "@/components/terminal/GroupPicker";
import SymbolSearch from "@/components/terminal/SymbolSearch";
import useAccountSetting from "@/components/terminal/useAccountSetting";
import { groupChoices, cleanGroup, groupPayload, cleanSizes } from "@/lib/accountGroup";
import { acctIn, replayClock } from "@/lib/replay";

const Grid = WidthProvider(Responsive);

// The trading terminal, a staging test (LAB).
//
// The owner, 24 Oct 2026: "a full stock trading app, using alpaca prices ...
// time and sales and order book ... to be like tws", charted with TradingView's
// free library on the account's own Alpaca price feed. Watchlist, chart,
// quote, ticket, time & sales, positions and orders on one screen. Prices are
// the selected account's own (the free IEX feed for shares, Alpaca's crypto
// venue for coins); orders go to paper accounts only during the test,
// enforced by the server (functions/terminal). Coins came the same day: "I
// don't see Cryptos to select from ... make sure the order book is working".
//
// The windows are a grid the trader arranges ("control the places of the
// windows ... drag them and lock them", lib/terminalLayout.js): drag a window
// by its title bar, resize it from its edges, lock the arrangement, or put it
// back as it was. The chart also goes full screen. The windows fill the
// screen to its bottom edge, and the whole terminal goes full screen too
// (27 Oct: "full screen with no margins ... I can use all the space"); the
// app's menu folds to icons on this page (components/Layout.jsx).
//
// The screener sits beside the trading screen as a page of its own (24 Oct:
// "Stock Screener ... to see the stocks in play"): pick a row and it opens in
// the chart, book, tape and ticket.
//
// The chart window holds one to four charts, each with its own symbol and
// interval; the active one (last clicked) is the one the watchlist, ticket,
// book and tape follow. During a bar replay they all follow its clock, and its
// practice account trades any of them (25 Oct: "Make sure that I can open
// muliple ticker at the same time during the reply or simulation").

const WATCH_KEY = "dm.terminal.watchlist";
const COINS_KEY = "dm.terminal.coinsAdded";
const POLL_MS = 4000;
const LAYOUT_KEY = "dm.terminal.layout.v2";
const LAYOUT_KEY_V1 = "dm.terminal.layout.v1";
const LOCK_KEY = "dm.terminal.layoutLocked";
const PAGE_KEY = "dm.terminal.page";
const HOTKEYS_ON_KEY = "dm.terminal.hotkeysOn";
const PANES_KEY = "dm.terminal.panes.v1";
const SHARE_FEED_KEY = "dm.terminal.shareFeed";
const FIRES_SEEN_KEY = "dm.terminal.firesSeen";
const EODHD_KEY = "dm.terminal.eodhd";
const GROUP_KEY = "dm.terminal.group";
const GROUP_SIZES_KEY = "dm.terminal.groupSizes";
const NO_FILLS = [];
// Where each chart sits for one to four of them.
const PANE_GRID = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-2 grid-rows-2", 4: "grid-cols-2 grid-rows-2" };
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } }
};
// Buttons and fields inside a title bar stay clickable rather than starting a drag.
const NO_DRAG = "button, input, select, textarea, a, .no-drag";

export default function Terminal() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [watch, setWatch] = useState(() => {
    try {
      const list = withCoinsOnce(readWatchlist(localStorage.getItem(WATCH_KEY)), localStorage.getItem(COINS_KEY) === "1");
      localStorage.setItem(COINS_KEY, "1");
      return list;
    } catch { return readWatchlist(null); }
  });
  // The charts: each its symbol and interval, and which one is active.
  // Every setting below is kept with the person's account, not this browser
  // (27 Oct: "I said before account not browser"; useAccountSetting.js).
  const [panes, setPanes] = useAccountSetting("panes", {
    localKey: PANES_KEY,
    initial: () => ({ list: [{ symbol: watch[0], interval: "5Min" }], active: 0 }),
    clean: (p) => {
      const list = (Array.isArray(p?.list) ? p.list : []).filter((x) => x && typeof x.symbol === "string" && x.symbol && typeof x.interval === "string").slice(0, 4);
      return list.length ? { list, active: Math.min(Math.max(0, Number(p.active) || 0), list.length - 1) } : { list: [{ symbol: watch[0], interval: "5Min" }], active: 0 };
    }
  });
  const symbol = panes.list[panes.active]?.symbol || watch[0];
  const setSymbol = useCallback((s) => setPanes((p) => ({ ...p, list: p.list.map((x, i) => (i === p.active ? { ...x, symbol: s } : x)) })), []);
  // One setter per chart, made once, so a chart is not drawn again for a new function.
  const paneInterval = useMemo(() => [0, 1, 2, 3].map((i) => (iv) => setPanes((p) => ({ ...p, list: p.list.map((x, j) => (j === i ? { ...x, interval: iv } : x)) }))), []);
  const paneSymbols = panes.list.map((x) => x.symbol).join(",");
  const [snaps, setSnaps] = useState({});
  const [view, setView] = useState(null);
  const [tab, setTab] = useState("positions");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [pick, setPick] = useState(null);
  const [preset, setPreset] = useState(null);
  const [page, setPage] = useAccountSetting("page", {
    localKey: PAGE_KEY, initial: () => "trade", clean: (v) => (v === "screen" ? "screen" : "trade"), fromLocal: (raw) => raw, toLocal: (v) => v
  });
  const pageRef = useRef(page);
  const [screenSeen, setScreenSeen] = useState(page === "screen");
  useEffect(() => { if (page === "screen") setScreenSeen(true); }, [page]);
  pageRef.current = page;

  // Order pop-ups: one per order (its key), replaced as the order moves.
  // Good news and quiet endings leave by themselves; a problem stays until
  // it is closed, and an order still on its way stays until it lands.
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef({});
  const closeToast = useCallback((key) => {
    clearTimeout(toastTimers.current[key]);
    setToasts((list) => list.filter((t) => t.key !== key));
  }, []);
  const notify = useCallback((t) => {
    setToasts((list) => [...list.filter((x) => x.key !== t.key), t].slice(-3));
    clearTimeout(toastTimers.current[t.key]);
    if (t.tone === "ok" || t.tone === "muted") toastTimers.current[t.key] = setTimeout(() => closeToast(t.key), t.title === "Order placed" ? 9000 : 7000);
  }, [closeToast]);
  const quoteRef = useRef(null);
  const crypto = isCrypto(symbol);

  useEffect(() => {
    invokeFunction("syncAccounts", {}).then((r) => {
      const list = (r?.data?.accounts || []).filter((a) => !a.readOnly);
      setAccounts(list);
      setAccountId((cur) => cur || (list.find((a) => a.type === "Paper") || list[0])?.id || "");
    }).catch(() => setAccounts([]));
  }, []);
  const account = accounts.find((a) => a.id === accountId) || null;

  // The watchlist belongs to the person (lib/terminalPrefs.js): the
  // account's copy replaces this browser's once read; until then nothing is
  // sent, so a slow answer never overwrites it.
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const watchSynced = useRef(false);
  useEffect(() => {
    let alive = true;
    readPrefs(["watchlist"]).then((p) => {
      if (!alive) return;
      const s = settle(Array.isArray(p.watchlist) ? cleanWatchlist(p.watchlist) : null, watchRef.current);
      watchSynced.current = true;
      if (s.upload) savePref("watchlist", s.value);
      else if (s.value) setWatch(s.value);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(watch)); } catch { /* private window */ }
    if (watchSynced.current) savePref("watchlist", watch);
  }, [watch]);

  // Which tape shares come from (lib/terminal.js shareFeed): EODHD's real-time
  // stream where it is set up for this person, else IEX while it trades and
  // every exchange fifteen minutes late when it does not, or as chosen. Looked
  // at again every minute, so Auto moves on at 8:00 and 17:00 by itself.
  const [feedPref, setFeedPref] = useAccountSetting("sharefeed", {
    localKey: SHARE_FEED_KEY, initial: () => "auto", clean: (v) => (typeof v === "string" && v ? v : "auto"), fromLocal: (raw) => raw, toLocal: (v) => v
  });
  // Remembered from the last visit, so the charts open on the right history
  // rather than drawing IEX's and then every exchange's a second later.
  const [eodhdOk, setEodhdOk] = useState(() => store.get(EODHD_KEY) === "1");
  // Whether this person's live accounts trade from here (the owner's only,
  // the server decides and checks again on every order).
  const [liveOk, setLiveOk] = useState(false);
  // The other accounts orders also go to, pro rata (lib/accountGroup.js);
  // only ones still allowed, never the account on screen itself.
  const [groupPick, changeGroup] = useAccountSetting("groupaccounts", {
    localKey: GROUP_KEY, initial: () => [], clean: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [])
  });
  const group = useMemo(() => cleanGroup(groupPick, accounts, accountId, liveOk), [groupPick, accounts, accountId, liveOk]);
  // Each picked account's own size.
  const [groupSizes, changeSizes] = useAccountSetting("groupsizes", { localKey: GROUP_SIZES_KEY, initial: () => ({}), clean: cleanSizes });
  const groupSend = useMemo(() => groupPayload(group, groupSizes), [group, groupSizes]);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    invokeFunction("terminal", { action: "feeds" }).then((r) => {
      if (r?.data?.error) return;
      const on = !!r?.data?.eodhd;
      setEodhdOk(on);
      setLiveOk(!!r?.data?.liveTrading);
      store.set(EODHD_KEY, on ? "1" : "0");
    }).catch(() => {});
  }, []);
  useEffect(() => { const t = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 30000); return () => clearInterval(t); }, []);
  const shares = useMemo(() => shareFeed(feedPref, { eodhd: eodhdOk, now: minute * 60 }), [feedPref, eodhdOk, minute]);
  const chooseFeed = (v) => setFeedPref(v);

  const streamSymbols = useMemo(() => cleanWatchlist([symbol, ...paneSymbols.split(","), ...watch]).slice(0, 30), [symbol, paneSymbols, watch]);
  const { quotes: live, status, feeds, epoch, listen } = useTerminalStream(accountId, streamSymbols, crypto ? symbol : "", shares.live);
  const feedTrouble = Object.entries(feeds).find(([, f]) => f.state === "error");

  // Opening quotes and the previous close, for the change column.
  useEffect(() => {
    if (!accountId) return;
    invokeFunction("terminal", { action: "snapshot", accountId, symbols: streamSymbols, stockFeed: shares.history }).then((r) => {
      if (r?.data?.quotes) setSnaps((s) => ({ ...s, ...r.data.quotes }));
    });
  }, [accountId, streamSymbols, shares.history]);

  const quoteOf = useCallback((s) => {
    const a = snaps[s] || {};
    const b = live[s] || {};
    const last = b.last ?? a.last ?? null;
    const prev = a.prevClose ?? null;
    return { ...a, ...b, last, change: last !== null && prev ? last - prev : null, changePct: last !== null && prev ? (last - prev) / prev : null };
  }, [snaps, live]);
  const quote = quoteOf(symbol);
  quoteRef.current = quote;

  // The account's shares and orders, every few seconds while the tab is open.
  // Not while the screener is up: nothing shows them there, and its first
  // read of the market needs the account's request allowance.
  const loadView = useCallback(() => {
    if (!accountId || document.visibilityState === "hidden" || pageRef.current === "screen") return;
    invokeFunction("terminal", { action: "account", accountId }).then((r) => { if (!r?.data?.error) setView(r.data); });
  }, [accountId]);
  useEffect(() => {
    setView(null);
    loadView();
    const t = setInterval(loadView, POLL_MS);
    return () => clearInterval(t);
  }, [loadView]);

  const tapeLive = feeds[crypto ? "crypto" : "stocks"]?.state === "live";

  // Stops outside regular hours (26 Oct: "The stop loss price was hit but
  // never executed"): before 9:30 and after 16:00 the server fires the
  // terminal's stops itself, a limit at the stop price, unless turned off
  // (stopGuardRun.ts). What it does is said as it happens and, for what it did
  // while the terminal was closed, once when it opens.
  const [extStops, setExtStops] = useState(true);
  useEffect(() => {
    readPrefs(["extstops"]).then((p) => { if (typeof p.extstops === "boolean") setExtStops(p.extstops); }).catch(() => {});
  }, []);
  const changeExtStops = (on) => { setExtStops(on); savePref("extstops", on); };
  const firedSeen = useRef(null);
  const sawFire = (id) => {
    if (!firedSeen.current) { try { firedSeen.current = new Set(JSON.parse(store.get(FIRES_SEEN_KEY) || "[]")); } catch { firedSeen.current = new Set(); } }
    const fresh = !firedSeen.current.has(id);
    firedSeen.current.add(id);
    store.set(FIRES_SEEN_KEY, JSON.stringify([...firedSeen.current].slice(-100)));
    return fresh;
  };
  // A stop, or a take profit, fired by the terminal outside regular hours.
  const fireNews = useCallback((f) => {
    const Name = f.kind === "target" ? "Take profit" : "Stop";
    const at = f.kind === "target" ? f.target : f.stop;
    return {
      tone: f.status === "sent" || f.status === "done" ? "ok" : f.status === "failed" ? "bad" : "muted",
      title: { sent: `${Name} fired on ${f.symbol}`, done: `${Name} filled on ${f.symbol}`, returned: `Exits back on ${f.symbol}`, cancelled: `${Name} limit cancelled on ${f.symbol}`, failed: `${Name} on ${f.symbol}: needs a look` }[f.status] || `${Name} on ${f.symbol} not fired`,
      detail: `Traded ${px(f.trigger)} against the ${Name.toLowerCase()} at ${px(at)}${f.at ? `, ${new Date(f.at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} New York` : ""}. ${f.note || ""}`
    };
  }, []);
  useEffect(() => listen((m) => {
    if (m.type !== "guard") return;
    const key = `guard${m.id}`;
    if (m.status === "firing") {
      const target = m.kind === "target";
      notify({ key, tone: "wait", title: `${target ? "Take profit" : "Stop"} hit on ${m.symbol} at ${px(m.trigger)}`, detail: `Outside regular hours: cancelling the exits and sending a limit at ${px(target ? m.target : m.stop)}…` });
      return;
    }
    sawFire(`${m.id}:${m.status}`);
    notify({ key, ...fireNews({ ...m, at: new Date().toISOString() }) });
    loadView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [listen, notify, loadView, fireNews]);
  // The account's orders as Alpaca moves them (orderFeed.js): the ticket and
  // the hotkeys follow their own; any fill or end, from here or elsewhere,
  // brings the positions and orders up to date at once rather than at the next check.
  useEffect(() => {
    let t = null;
    const stop = listen((m) => {
      if (m.type !== "order") return;
      noteOrder(m);
      if (!/fill|canceled|expired|rejected|replaced/.test(m.event)) return;
      clearTimeout(t);
      t = setTimeout(loadView, 150);
    });
    return () => { stop(); clearTimeout(t); };
  }, [listen, loadView]);
  useEffect(() => {
    if (!accountId) return;
    invokeFunction("terminal", { action: "guardFires", accountId }).then((r) => {
      for (const f of (r?.data?.fires || []).slice(0, 3)) {
        if (f.status === "firing" || !sawFire(`${f.order_id}:${f.status}`)) continue;
        notify({ key: `guard${f.order_id}`, ...fireNews({ symbol: f.symbol, kind: f.kind, trigger: f.trigger_price, stop: f.stop_price, target: f.target_price, status: f.status, note: f.note, at: f.created_at }) });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // The arrangement: kept with the account, lockable, resettable.
  const [layouts, setLayouts] = useAccountSetting("layout", {
    localKey: LAYOUT_KEY, clean: cleanLayouts,
    initial: () => { try { return cleanLayouts(fromFirstVersion(JSON.parse(store.get(LAYOUT_KEY_V1) || "null"))); } catch { return cleanLayouts(null); } }
  });
  const [locked, setLocked] = useAccountSetting("layoutlock", {
    localKey: LOCK_KEY, initial: () => false, clean: (v) => v === true || v === "1", fromLocal: (raw) => raw === "1", toLocal: (v) => (v ? "1" : "0")
  });
  // The windows reach the bottom of the screen: rows sized to the height left
  // under the bar, measured from where the grid actually starts (on the page,
  // or in the full-screen terminal), less one gap at the foot.
  const deskBox = useRef(null);
  const barBox = useRef(null);
  const gridBox = useRef(null);
  const [rowHeight, setRowHeight] = useState(() => rowHeightFor(window.innerHeight - 100));
  // The grid reports its windows on every change, its own settling included:
  // saved once the account's arrangement has been read, never over it.
  const onLayoutChange = useCallback((_, all) => {
    const next = cleanLayouts(all);
    setLayouts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next), { touch: false });
  }, [setLayouts]);
  const toggleLock = () => setLocked((v) => !v);
  const resetLayout = () => setLayouts(cleanLayouts(DEFAULT_LAYOUTS));

  // Full screen (Esc, or the button, to come back): the whole terminal, with
  // no menu, banner or browser bars; or the chart alone, from either.
  const chartBox = useRef(null);
  const [full, setFull] = useState(false);
  const [deskFull, setDeskFull] = useState(false);
  useEffect(() => {
    const onChange = () => {
      setFull(document.fullscreenElement === chartBox.current);
      setDeskFull(document.fullscreenElement === deskBox.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement === chartBox.current) document.exitFullscreen?.();
    else chartBox.current?.requestFullscreen?.().catch(() => {});
  };
  const toggleDeskFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else deskBox.current?.requestFullscreen?.().catch(() => {});
  };

  // Symbol search.
  useEffect(() => {
    if (!q.trim() || !accountId) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      invokeFunction("terminal", { action: "search", accountId, q }).then((r) => setResults(r?.data?.results || []));
    }, 250);
    return () => clearTimeout(t);
  }, [q, accountId]);

  const choose = (s) => { setSymbol(s); setQ(""); setResults([]); };
  const position = (view?.positions || []).find((p) => p.symbol === symbol);

  const held = position?.qty || 0;
  // Close a position: its symbol on screen and the ticket loaded to undo it.
  const closePosition = (p) => {
    setSymbol(p.symbol);
    setPreset({ symbol: p.symbol, side: p.side === "short" || p.qty < 0 ? "buy" : "sell", qtyText: String(p.qtyText || Math.abs(p.qty)).replace(/^-/, ""), at: Date.now() });
  };
  // A stop for a position: the ticket loaded with the opposite side, the
  // whole quantity, and a stop 2% past the last price, to adjust and review.
  const stopPosition = (p) => {
    const short = p.side === "short" || p.qty < 0;
    setSymbol(p.symbol);
    setPreset({
      symbol: p.symbol, side: short ? "buy" : "sell", qtyText: String(p.qtyText || Math.abs(p.qty)).replace(/^-/, ""),
      type: "stop", stopPrice: (p.last || p.avgPrice || 0) * (short ? 1.02 : 0.98), at: Date.now()
    });
  };
  // Each symbol's fills in the last week, marked on its chart where they happened.
  const fillsBySymbol = useMemo(() => {
    const out = {};
    for (const o of view?.recent || []) {
      if (!(Number(o.filled) > 0 && o.avgPrice && o.filledAt)) continue;
      (out[o.symbol] = out[o.symbol] || []).push({ id: o.id, side: o.side, qty: o.filled, price: o.avgPrice, at: o.filledAt });
    }
    return out;
  }, [view?.recent]);

  // Hotkeys (25 Oct: "Can I set hotkeys ... exiting full position has a key.
  // Partial exit has a key ... stop loss ... with keys"): the list is kept with
  // the account; on or off is this browser's, and off until turned on here.
  const [hotkeys, setHotkeys] = useState([]);
  const [hotkeysOn, setHotkeysOn] = useAccountSetting("hotkeyson", {
    localKey: HOTKEYS_ON_KEY, initial: () => false, clean: (v) => v === true || v === "1", fromLocal: (raw) => raw === "1", toLocal: (v) => (v ? "1" : "0")
  });
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  // The bar replay (components/terminal/useReplay.js): while it runs, the
  // hotkeys and the replay bar trade its practice account.
  const { session, version: replayVersion, last: lastReplay, replay } = useReplay({ accountId, notify });
  const replaying = !!session;

  // The other accounts picked beside this one, as they stand: what each holds
  // and what is still working there, read every three seconds while any is
  // picked (28 Oct: their sells were refused or left unfilled while their buys
  // filled, and nothing on screen showed it until they had stacked up).
  const [others, setOthers] = useState([]);
  const groupWire = JSON.stringify(replaying ? [] : groupSend);
  const loadOthers = useCallback(() => {
    const group = JSON.parse(groupWire);
    if (!accountId || !group.length) { setOthers([]); return; }
    if (document.visibilityState === "hidden") return;
    invokeFunction("terminal", { action: "groupView", accountId, group })
      .then((r) => { if (!r?.data?.error) setOthers(r?.data?.group || []); })
      .catch(() => {});
  }, [accountId, groupWire]);
  useEffect(() => {
    loadOthers();
    const t = setInterval(loadOthers, 3000);
    return () => clearInterval(t);
  }, [loadOthers]);
  // After an order here or there, everything at once: this account and the others.
  const refreshAll = useCallback(() => { loadView(); loadOthers(); }, [loadView, loadOthers]);
  const signedQty = (p) => (p ? (p.side === "short" ? -Math.abs(Number(p.qty) || 0) : Math.abs(Number(p.qty) || 0)) : 0);
  const holdings = others.length ? [
    { id: accountId, name: account?.name || "This account", live: account?.type === "Live", qty: signedQty(position), waiting: (view?.orders || []).filter((o) => o.symbol === symbol) },
    ...others.map((g) => ({
      id: g.accountId, name: g.name, live: g.live, error: g.error || (g.ok === false ? "refused" : null),
      qty: signedQty((g.positions || []).find((p) => p.symbol === symbol)),
      waiting: (g.orders || []).filter((o) => o.symbol === symbol)
    }))
  ] : [];
  // Rows refit when the bar wraps, the window or full screen changes, or the
  // replay note comes and goes above the grid.
  useEffect(() => {
    if (page !== "trade") return undefined;
    const fit = () => {
      let top = 0;
      for (let n = gridBox.current; n; n = n.offsetParent) top += n.offsetTop;
      if (gridBox.current) setRowHeight(rowHeightFor(window.innerHeight - top - MARGIN));
    };
    fit();
    const seen = new ResizeObserver(fit);
    if (barBox.current) seen.observe(barBox.current);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      seen.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [page, replaying]);
  const [replayForm, setReplayForm] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const replayButton = useCallback(() => {
    if (sessionRef.current) replay.exit();
    else setReplayForm((f) => (f ? null : {}));
  }, [replay]);
  const startReplay = (form) => { setReplayForm(null); replay.start(form, isCrypto(symbol)); };
  // A share from the historical screen: into the replay running over that
  // day (a chart of its own while there is room), or a new replay from that
  // day's open, ready to start.
  const replayFromScreen = (s, date) => {
    setPage("trade");
    const day = Date.parse(`${date}T00:00:00Z`) / 1000;
    const r = sessionRef.current;
    if (r && day + 86400 > r.start && day <= r.end) {
      setPanes((p) => {
        const at = p.list.findIndex((x) => x.symbol === s);
        if (at !== -1) return { ...p, active: at };
        if (p.list.length < 4) return { list: [...p.list, { symbol: s, interval: p.list[p.active].interval }], active: p.list.length };
        return { ...p, list: p.list.map((x, i) => (i === p.active ? { ...x, symbol: s } : x)) };
      });
      return;
    }
    if (r) replay.exit();
    setSymbol(s);
    const to = new Date((day + 7 * 86400) * 1000).toISOString().slice(0, 10);
    setReplayForm({ from: date, time: "09:30", to });
  };
  // The news tab: the active chart's symbol; in a replay, up to its moment.
  const news = useNews({ accountId, symbol, cursor: session?.cursor ?? null, end: session?.end ?? null });
  // A new replay opens on its practice positions.
  useEffect(() => { if (session?.id) setTab("practice"); }, [session?.id]);
  useEffect(() => { if (!session && !lastReplay) setTab((t) => (t === "practice" || t === "results" ? "positions" : t)); }, [session, lastReplay]);
  // Charts: how many, filled from the watchlist; and a symbol put on one (a
  // free one while there is room, else the active one).
  // Any symbol on a chart from the chart itself (28 Oct: "change the chart and
  // the stock on focus from the chart itself not only to add it first to the
  // watchlist"): its symbol is a search, and typing a letter while the
  // terminal has the focus opens it too. `pane`: the chart it changes.
  const [chartSearch, setChartSearch] = useState(null);
  const activePane = useRef(0);
  activePane.current = panes.active;
  const chartTo = useCallback((pane, s) => setPanes((p) => ({ ...p, active: pane, list: p.list.map((x, i) => (i === pane ? { ...x, symbol: s } : x)) })), [setPanes]);
  const addToWatch = (s) => setWatch((w) => (w.includes(s) || w.length >= WATCHLIST_MAX ? w : cleanWatchlist([...w, s])));
  useEffect(() => {
    if (page !== "trade" || hotkeysOpen) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key)) return;
      const t = e.target;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      setChartSearch((cur) => cur || { pane: activePane.current, initial: e.key.toUpperCase() });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, hotkeysOpen]);
  const setPaneCount = (n) => setPanes((p) => {
    const list = p.list.slice(0, n);
    const used = new Set(list.map((x) => x.symbol));
    const spare = watch.filter((w) => !used.has(w));
    while (list.length < n) list.push({ symbol: spare.shift() || p.list[p.active].symbol, interval: p.list[p.active].interval });
    return { list, active: Math.min(p.active, n - 1) };
  });
  useEffect(() => {
    readPrefs(["hotkeys"]).then((p) => setHotkeys(cleanHotkeys(p.hotkeys))).catch(() => {});
  }, []);
  const saveHotkeys = (list) => { setHotkeys(list); savePref("hotkeys", list); };
  // A coin's quantity step, read ahead so the first key press does not wait for it.
  useEffect(() => { if (hotkeysOn && crypto) prefetchStep(accountId, symbol); }, [hotkeysOn, crypto, accountId, symbol]);
  const armHotkeys = (on) => setHotkeysOn(on);
  // Everything a key press reads, current at the moment it is pressed.
  const live$ = useRef({});
  live$.current = { account, symbol, quote, view, position, hotkeys, notify, refresh: refreshAll, replaying, liveOk, group: replaying ? [] : groupSend, leadSize: replaying ? null : groupSizes[accountId] || null };
  useEffect(() => {
    if (!hotkeysOn || page !== "trade" || hotkeysOpen) return undefined;
    const onKey = (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || "") || t?.isContentEditable) return;
      const combo = comboOf(e);
      const h = combo && live$.current.hotkeys.find((k) => k.keys === combo);
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      if (live$.current.replaying) replay.hotkey(h, live$.current.symbol);
      else runHotkey(h, live$.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hotkeysOn, page, hotkeysOpen, replay]);

  const grip = !locked && <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />;
  const frame = "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white";
  const bar = `drag-handle flex items-center gap-1 border-b border-slate-200 px-2 py-1 text-xs ${locked ? "" : "cursor-move"}`;

  return (
    <div ref={deskBox} className="flex flex-col gap-1 text-slate-800 [&:fullscreen]:overflow-auto [&:fullscreen]:bg-dm-bg [&:fullscreen]:p-1">
      <Toasts toasts={toasts} onClose={closeToast} low={replaying} />
      <HotkeysDialog open={hotkeysOpen} hotkeys={hotkeys} armed={hotkeysOn} onArm={armHotkeys} onSave={saveHotkeys} onClose={() => setHotkeysOpen(false)} />
      <div ref={barBox} className="flex flex-wrap items-center gap-2 px-1">
        <h1 className="mr-2 text-lg font-semibold">Terminal</h1>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Staging test</span>
        <div className="flex rounded-md border border-slate-300 text-sm" role="tablist" aria-label="Page">
          {[["trade", "Trade"], ["screen", "Screener"]].map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={page === id} onClick={() => setPage(id)}
              className={`px-3 py-1 first:rounded-l-md last:rounded-r-md ${page === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
          ))}
        </div>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account"
          className={`rounded-md border px-2 py-1 text-sm ${account?.type === "Live" ? "border-rose-500 bg-rose-50 font-semibold text-rose-800" : "border-slate-300 bg-white"}`}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type}</option>)}
        </select>
        {account?.type === "Live" && (
          <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white" title={liveOk ? "Orders and hotkeys here use real money. Each order that opens or adds to a position is limited to $5,000 during this test." : "A live account: look only. Orders go to paper accounts during this test."}>
            LIVE{liveOk ? " · REAL MONEY" : " · VIEW ONLY"}
          </span>
        )}
        <GroupPicker choices={groupChoices(accounts, accountId, liveOk)} value={group} onChange={changeGroup} sizes={groupSizes} onSizes={changeSizes} lead={account} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && results[0]) choose(results[0].symbol); }}
            placeholder="Symbol, company or coin" className="w-56 rounded-md border border-slate-300 py-1 pl-7 pr-2 text-sm" />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-80 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <div key={r.symbol} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50">
                  <button type="button" className="flex-1 text-left" onClick={() => choose(r.symbol)}>
                    <span className="font-semibold">{r.symbol}</span> <span className="text-xs text-slate-500">{r.name}</span>
                    {r.assetClass === "crypto" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Crypto</span>}
                  </button>
                  {watch.includes(r.symbol) ? <span className="text-[10px] text-slate-400">In watchlist</span> : (
                    <button type="button" title="Add to watchlist" onClick={() => { setWatch((w) => cleanWatchlist([...w, r.symbol])); choose(r.symbol); }}
                      className="flex items-center gap-0.5 rounded border border-emerald-300 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50">
                      <Plus className="h-3 w-3" />Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => armHotkeys(!hotkeysOn)} title={hotkeysOn ? "Hotkeys are on: their keys send orders. Click to turn them off." : "Hotkeys are off. Click to turn them on."}
            className={`flex items-center gap-1 rounded-l-md border px-2 py-1 text-xs ${hotkeysOn ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <Keyboard className="h-3.5 w-3.5" />Hotkeys {hotkeysOn ? "on" : "off"}{hotkeys.length ? ` (${hotkeys.length})` : ""}
          </button>
          <button type="button" onClick={() => setHotkeysOpen(true)} className="-ml-1 rounded-r-md border border-l-0 border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Set keys</button>
        </div>
        <div className={`flex items-center gap-1 ${page === "trade" ? "" : "hidden"}`}>
          <button type="button" onClick={toggleLock} title={locked ? "Unlock the windows to move and resize them" : "Lock the windows where they are"}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${locked ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}{locked ? "Locked" : "Lock layout"}
          </button>
          <button type="button" onClick={resetLayout} title="Put every window back where it started" className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" />Reset
          </button>
        </div>
        <span className={`text-xs ${status.state === "live" && !feedTrouble ? "text-emerald-700" : status.state === "error" || feedTrouble ? "text-rose-700" : "text-slate-500"}`}>
          {status.state === "error" ? status.message
            : feedTrouble ? `${feedTrouble[0] === "crypto" ? "Crypto" : "Stock"} prices: ${feedTrouble[1].message}`
              : status.state === "live" ? `● Live · ${[feeds.stocks?.state === "live" && (shares.live === "eodhd" ? "EODHD" : shares.delayed ? "all exchanges, 15 min late" : "IEX"), feeds.crypto?.state === "live" && "crypto"].filter(Boolean).join(" + ") || "connected"}`
                : status.state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
        </span>
        <label className="flex items-center gap-1 text-xs text-slate-500" title="Where share prices come from. Auto: EODHD where it is set up for you; else IEX in real time from 8:00 to 17:00 New York, and every exchange 15 minutes late outside those hours.">
          Shares
          <select value={feedPref} onChange={(e) => chooseFeed(e.target.value)} aria-label="Share prices from"
            className={`rounded-md border px-1 py-0.5 text-xs ${shares.delayed ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-700"}`}>
            {SHARE_FEEDS.filter(([id]) => id !== "eodhd" || eodhdOk).map(([id, name]) => <option key={id} value={id}>{id === "auto" ? `Auto: ${shares.label}` : name}</option>)}
          </select>
        </label>
        <button type="button" onClick={toggleDeskFull} title={deskFull ? "Leave full screen (Esc)" : "Full screen: the terminal alone, without the menu or the browser's bars"}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${deskFull ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
          {deskFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{deskFull ? "Exit full screen" : "Full screen"}
        </button>
        {page === "trade" && holdings.length > 0 && <GroupHoldings symbol={symbol} rows={holdings} />}
      </div>

      {replaying && page === "trade" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          The charts are replaying the past. Hotkeys and the replay bar trade a practice account, on the active chart&apos;s symbol; the ticket, book and tape are still live, on your paper account.
        </p>
      )}
      {screenSeen && (
        <div className={page === "screen" ? "" : "hidden"}>
          <Screener accountId={accountId} active={page === "screen"} watch={watch}
            onPick={(s) => { setSymbol(s); setPage("trade"); }} onReplay={replayFromScreen}
            onAdd={(s) => setWatch((w) => (w.length >= WATCHLIST_MAX ? w : cleanWatchlist([...w, s])))} />
        </div>
      )}

      {page === "trade" && <div ref={gridBox}><Grid
        className="terminal-grid"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={rowHeight}
        margin={[MARGIN, MARGIN]}
        containerPadding={[0, 0]}
        isDraggable={!locked}
        isResizable={!locked}
        resizeHandles={["se", "e", "s", "w"]}
        draggableHandle=".drag-handle"
        draggableCancel={NO_DRAG}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        <div key="watch" className={frame}>
          <div className={bar}>
            {grip}<span className="font-semibold text-slate-700">Watchlist</span>
            {!watch.includes(symbol) && (
              <button type="button" onClick={() => setWatch((w) => cleanWatchlist([...w, symbol]))} title={`Add ${symbol} to the watchlist`}
                className="ml-auto flex items-center gap-0.5 rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50">
                <Plus className="h-3 w-3" />{symbol}
              </button>
            )}
          </div>
          <WatchAdd accountId={accountId} full={watch.length >= WATCHLIST_MAX} onAdd={(sym) => { setWatch((w) => cleanWatchlist([...w, sym])); setSymbol(sym); }} />
          <div className="min-h-0 flex-1 overflow-auto">
            {watch.map((s) => {
              const w = quoteOf(s);
              return (
                <div key={s} className={`group relative flex cursor-pointer items-center gap-1 border-b border-slate-100 px-2 py-1.5 ${s === symbol ? "bg-emerald-50" : "hover:bg-slate-50"}`} onClick={() => setSymbol(s)}>
                  <span className="w-[4.5rem] shrink-0 truncate text-[13px] font-semibold" title={s}>{s}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-[13px] tabular-nums">{px(w.last)}</span>
                  <span className={`ml-1.5 w-[3.25rem] shrink-0 text-right text-[11px] tabular-nums ${w.changePct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{pctText(w.changePct)}</span>
                  <button type="button" title="Remove" className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded bg-white opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setWatch((l) => l.filter((x) => x !== s)); }}>
                    <X className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div key="chart" className={frame}>
          <div ref={chartBox} className="flex h-full min-h-0 flex-col bg-white">
            <div className={`${bar} relative items-baseline gap-3 py-1.5`}>
              {grip}
              <button type="button" onClick={() => setChartSearch({ pane: panes.active, initial: "" })}
                title="Chart another symbol (or just start typing one)"
                className="no-drag flex shrink-0 items-center gap-0.5 rounded px-1 text-lg font-semibold hover:bg-slate-100">
                {symbol}<ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {watch.includes(symbol) ? (
                <span className="shrink-0 self-center text-[10px] text-emerald-700" title={`${symbol} is in the watchlist`}><Check className="inline h-3 w-3" /> Watchlist</span>
              ) : (
                <button type="button" onClick={() => addToWatch(symbol)} disabled={watch.length >= WATCHLIST_MAX}
                  title={watch.length >= WATCHLIST_MAX ? `The watchlist is full (${WATCHLIST_MAX})` : `Add ${symbol} to the watchlist`}
                  className="no-drag flex shrink-0 items-center gap-0.5 self-center rounded border border-emerald-300 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                  <Plus className="h-3 w-3" />Watchlist
                </button>
              )}
              {chartSearch && (
                <SymbolSearch key={`${chartSearch.pane}:${chartSearch.initial}`} accountId={accountId} initial={chartSearch.initial} watch={watch}
                  className="absolute left-2 top-full mt-1"
                  onPick={(s) => chartTo(chartSearch.pane, s)} onAdd={addToWatch} onClose={() => setChartSearch(null)} />
              )}
              {replaying && <span className="shrink-0 self-center rounded bg-slate-200 px-1 text-[10px] font-semibold uppercase text-slate-600" title="The charts below are replaying the past; these figures are today's">Live</span>}
              <span className={`shrink-0 text-lg tabular-nums ${replaying ? "text-slate-400" : ""}`}>{px(quote.last)}</span>
              <span className={`shrink-0 whitespace-nowrap text-sm tabular-nums ${quote.change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{quote.change !== null ? `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}` : ""} {pctText(quote.changePct)}</span>
              <span className="ml-auto min-w-0 truncate whitespace-nowrap text-xs tabular-nums text-slate-500">
                Bid <b className="text-slate-800">{px(quote.bid)}</b> × {sizeText(quote.bidSize)} · Ask <b className="text-slate-800">{px(quote.ask)}</b> × {sizeText(quote.askSize)}
              </span>
              <div className="flex shrink-0 self-center rounded border border-slate-200" role="group" aria-label="Charts">
                {[[1, Square, "One chart"], [2, Columns2, "Two charts"], [3, LayoutGrid, "Three charts"], [4, LayoutGrid, "Four charts"]].map(([n, Icon, name]) => (
                  <button key={n} type="button" title={name} aria-label={name} onClick={() => setPaneCount(n)}
                    className={`flex items-center gap-0.5 px-1 py-0.5 text-[10px] ${panes.list.length === n ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                    <Icon className="h-3 w-3" />{n > 2 ? n : ""}
                  </button>
                ))}
              </div>
              <button type="button" onClick={toggleFull} title={full ? "Leave full screen (Esc)" : "Chart full screen"} className="ml-1 self-center rounded p-1 text-slate-500 hover:bg-slate-100">
                {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
            {replayForm && !replaying && (
              <div className="relative">
                <ReplayStart key={JSON.stringify(replayForm)} crypto={crypto} busy={false} initial={replayForm} onStart={startReplay} onCancel={() => setReplayForm(null)} />
              </div>
            )}
            {session && (
              <ReplayBar
                clock={replayClock(session.cursor, crypto)} playing={session.playing} loading={session.loading} note={session.note}
                unit={session.unit} speed={session.speed} acct={acctIn(session.book, symbol)} price={replay.lastPrice(symbol)} value={replay.value()}
                trades={Object.values(session.book).reduce((n, a) => n + a.trades.length, 0)} symbol={symbol} crypto={crypto}
                onPlay={replay.toggle} onStep={replay.step} onRestart={replay.restart} onUnit={replay.setUnit} onSpeed={replay.setSpeed} onJump={replay.jump} onExit={replay.exit}
                onTrade={(side, qty) => replay.trade(symbol, side, qty)} onFlatten={() => replay.flatten(symbol, 100)} onStop={(kind, price) => replay.setExit(symbol, kind, price)}
                onAddTarget={(price, size) => replay.addTarget(symbol, price, size)} onRemoveTarget={(id) => replay.removeTarget(symbol, id)}
              />
            )}
            <div className={`grid min-h-0 flex-1 gap-px bg-slate-200 ${PANE_GRID[panes.list.length]}`}>
              {panes.list.map((p, i) => (
                <div key={i} onClickCapture={() => { if (panes.active !== i) setPanes((x) => ({ ...x, active: i })); }}
                  className={`min-h-0 min-w-0 overflow-hidden bg-white ${panes.list.length === 3 && i === 0 ? "col-span-2" : ""} ${panes.list.length > 1 && panes.active === i ? "outline outline-2 -outline-offset-2 outline-emerald-500" : ""}`}>
                  <PriceChart accountId={accountId} symbol={p.symbol} interval={p.interval} onInterval={paneInterval[i]} listen={listen} fills={fillsBySymbol[p.symbol] || NO_FILLS}
                    replay={replay} replayOn={replaying} replayCursor={session?.cursor ?? null} replayVersion={replayVersion} replayAcct={session?.book[p.symbol] || null}
                    onReplayButton={replayButton} active={panes.active === i} label={panes.list.length > 1} stockFeed={shares.history} liveSource={shares.live}
                    onSearch={() => setChartSearch({ pane: i, initial: "" })} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div key="account" className={frame}>
          <div className={bar}>
            {grip}
            {[
              ...(session || lastReplay ? [["practice", "Practice"], ["results", "Replay P/L"]] : []),
              ["positions", `Positions${view?.positions?.length ? ` (${view.positions.length})` : ""}`], ["orders", `Orders${view?.orders?.length ? ` (${view.orders.length})` : ""}`],
              ["demo", account?.type === "Paper" ? "Demo P/L" : "Trades P/L"], ["account", "Account"],
              ["news", `News${news.recent ? ` (${news.recent})` : ""}`]
            ].map(([id, name]) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${tab === id ? (id === "practice" || id === "results" ? "bg-amber-600 text-white" : "bg-slate-900 text-white") : "text-slate-600 hover:bg-slate-100"}`}>{name}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "practice" && (session || lastReplay) && (
              <PracticePositions book={session ? session.book : lastReplay.book} priceOf={session ? replay.priceOf : (s) => lastReplay.prices[s] ?? null}
                ended={!session} onPick={setSymbol} onFlatten={(s) => replay.flatten(s, 100)} />
            )}
            {tab === "results" && (session || lastReplay) && (
              <ReplayResults book={session ? session.book : lastReplay.book} priceOf={session ? replay.priceOf : (s) => lastReplay.prices[s] ?? null} ended={!session} />
            )}
            {tab === "news" && <NewsPanel news={news} symbol={symbol} crypto={crypto} cursor={session?.cursor ?? null} clock={session ? replayClock(session.cursor, crypto) : ""} onPick={setSymbol} />}
            {tab === "positions" && <Positions positions={view?.positions || []} others={others} onPick={setSymbol} onClose={closePosition} onStop={stopPosition} />}
            {tab === "orders" && <Orders accountId={accountId} orders={view?.orders || []} recent={view?.recent || []} onChanged={loadView} onPick={setSymbol} />}
            {tab === "demo" && <DemoResults accountId={accountId} refreshKey={`${view?.recent?.[0]?.id || ""}|${view?.recent?.[0]?.status || ""}|${view?.positions?.length || 0}`} />}
            {tab === "account" && <AccountSummary summary={view?.summary} paper={view?.paper} name={account?.name} />}
          </div>
        </div>

        <div key="book" className={frame}>
          <OrderBook accountId={accountId} symbol={symbol} quote={quote} listen={listen} onPick={(price) => setPick({ price, at: Date.now() })} />
        </div>

        <div key="tape" className={frame}>
          <TapePanel accountId={accountId} symbol={symbol} listen={listen} live={tapeLive} epoch={epoch} quoteRef={quoteRef} stockFeed={shares.history} source={shares.live} />
        </div>

        <div key="ticket" className={frame}>
          <div className={bar}>{grip}<span className="font-semibold text-slate-700">Quote & order ticket</span></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
            <div className="rounded-md border border-slate-100 p-2 text-xs">
              <div className="grid grid-cols-2 gap-y-1 tabular-nums">
                <span className="text-slate-500">Open</span><span className="text-right">{px(quote.open)}</span>
                <span className="text-slate-500">High</span><span className="text-right">{px(quote.high)}</span>
                <span className="text-slate-500">Low</span><span className="text-right">{px(quote.low)}</span>
                <span className="text-slate-500">{crypto ? "Prev day close (UTC)" : "Prev close"}</span><span className="text-right">{px(quote.prevClose)}</span>
                <span className="text-slate-500">{crypto ? "Volume today (UTC)" : shares.history === "delayed" ? "Volume (all exchanges)" : "Volume (IEX)"}</span><span className="text-right">{sizeText(quote.volume)}</span>
              </div>
              {view && (
                <div className="mt-2 grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-2 tabular-nums">
                  <span className="text-slate-500">Equity</span><span className="text-right">{fmtMoney(view.equity)}</span>
                  <span className="text-slate-500">Buying power</span><span className="text-right">{fmtMoney(view.buyingPower)}</span>
                </div>
              )}
            </div>
            {replaying && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
                This ticket sends real orders to your paper account, at today&apos;s prices; the replay does not see them. To practice in the replay, use the replay bar above the chart or your hotkeys.
              </p>
            )}
            {!crypto && shares.delayed && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
                Share prices here are fifteen minutes old (every exchange, delayed): IEX trades from 8:00 New York. Set a limit price with that in mind.
              </p>
            )}
            <OrderTicket account={account} symbol={symbol} quote={quote} held={held} heldText={held > 0 && position?.qtyText ? position.qtyText : ""}
              buyingPower={view?.buyingPower ?? null} onPlaced={refreshAll} pick={pick} preset={preset} onNotify={notify} liveOk={liveOk}
              group={groupSend.map((g) => ({ ...accounts.find((a) => a.id === g.id), size: g })).filter((a) => a.id)}
              extStops={extStops} onExtStops={changeExtStops} guardHours={eodhdOk ? "4:00 to 9:30 and 16:00 to 20:00" : "8:00 to 9:30 and 16:00 to 17:00"} />
            <p className="px-1 text-[10px] leading-relaxed text-slate-400">Prices from your own Alpaca account: shares from the free IEX feed (real time, IEX trades only, 8:00 to 17:00 New York), or every exchange fifteen minutes late outside IEX&apos;s hours{eodhdOk ? "; or EODHD's real-time stream on your own EODHD plan" : ""}; coins from Alpaca&apos;s crypto venue, around the clock, with the full order book. Charts by TradingView Lightweight Charts. Not investment advice.</p>
          </div>
        </div>
      </Grid></div>}
    </div>
  );
}

// Adding to the watchlist from the watchlist itself (24 Oct: "I need to add to
// the watchlist. I couldn't"): type a symbol, company or coin, pick a match or
// press Enter for the first one.
function WatchAdd({ accountId, onAdd, full }) {
  const [text, setText] = useState("");
  const [matches, setMatches] = useState([]);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!text.trim() || !accountId) { setMatches([]); return undefined; }
    const t = setTimeout(() => {
      invokeFunction("terminal", { action: "search", accountId, q: text }).then((r) => setMatches((r?.data?.results || []).slice(0, 8)));
    }, 200);
    return () => clearTimeout(t);
  }, [text, accountId]);
  const add = (sym) => {
    if (full) { setNote(`Full: ${WATCHLIST_MAX} symbols. Remove one first.`); return; }
    onAdd(sym); setText(""); setMatches([]); setNote(`${sym} added`); setTimeout(() => setNote(null), 1500);
  };
  return (
    <div className="relative border-b border-slate-100 p-1.5">
      <input value={text} onChange={(e) => { setText(e.target.value); setNote(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { if (matches[0]) add(matches[0].symbol); else if (text.trim()) setNote("No match"); } if (e.key === "Escape") { setText(""); setMatches([]); } }}
        placeholder="Add symbol or coin" aria-label="Add to watchlist"
        className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs focus:border-emerald-500 focus:outline-none" />
      {note && <span className="absolute right-3 top-2.5 text-[10px] text-emerald-700">{note}</span>}
      {matches.length > 0 && (
        <div className="absolute left-1.5 right-1.5 z-30 mt-1 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.map((r) => (
            <button key={r.symbol} type="button" onClick={() => add(r.symbol)} className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-emerald-50">
              <Plus className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="font-semibold">{r.symbol}</span>
              <span className="truncate text-slate-500">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
