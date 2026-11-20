import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/functions";
import { px, sizeText, isCrypto, amountToQty, percentQty, orderState, orderNews, sessionOf, ticketChoices, exitText, stopWaitText } from "@/lib/terminal";
import { refusalNews, partShareDay, exitsLifetime, dayOnlyNews } from "@/lib/accountGroup";
import { onOrder } from "./orderFeed";
import { reportGroup } from "./runHotkey";
import { fmtMoney } from "@/lib/format";

// The ticket, for shares and coins. Two steps, review then send, like a desk
// ticket's transmit: nothing goes to the broker on the first click. The server
// checks every rule again (stockOrder.ts, cryptoOrder.ts) and refuses live
// accounts during the test.
//
// A coin trades in fractions, around the clock, with market, limit and
// stop-limit orders only, good till cancelled or immediate-or-cancel, never
// short, and with no take-profit/stop-loss bracket; the ticket offers only
// what the broker accepts for the symbol in front of it.
//
// A size in dollars as well as in shares or coins (24 Oct: "I need to add a
// dollar value"). A market order goes to Alpaca as the dollar amount itself
// (for a stock, only if it trades in fractions; Alpaca fills those for the
// day only); a limit or stop order becomes the quantity the amount buys at
// its price. And once sent, the ticket follows the order to the end ("it
// should say something different after the order is placed or executed"):
// working, filled at what price, or cancelled, with a cancel button while it
// works.
//
// An option the order cannot take says why under it, and shares or coins
// held get their own exits: a stop, a take profit, or both as one cancels the
// other (26 Oct, 521 RENT held before the open, a sell stop typed: "the take
// profit or any check boxes don't work and no messages or notifications").

const STOCK_TYPES = [
  ["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["stop_limit", "Stop limit"], ["trailing_stop", "Trailing stop"]
];
const CRYPTO_TYPES = [["market", "Market"], ["limit", "Limit"], ["stop_limit", "Stop limit"]];
const TIF_TEXT = { day: "for the day", gtc: "good till cancelled", ioc: "immediate or cancel" };
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none";
const label = "mb-1 block text-[11px] uppercase tracking-wider text-slate-500";

export default function OrderTicket({ account, symbol, quote, held = 0, heldText = "", buyingPower = null, equity = null, onPlaced, pick = null, preset = null, onNotify = (news) => void news, liveOk = false, group = [], groupHeld = [], leadOff = false, none = false, partsOn: partsGiven, onPartsOn }) {
  const crypto = isCrypto(symbol);
  const TYPES = crypto ? CRYPTO_TYPES : STOCK_TYPES;
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("1");
  const [type, setType] = useState("limit");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  // A trailing stop follows the price by a percentage or by dollars.
  const [trail, setTrail] = useState("2");
  const [trailBy, setTrailBy] = useState("pct");
  const [tif, setTif] = useState("day");
  const [extended, setExtended] = useState(false);
  const [bracket, setBracket] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asset, setAsset] = useState(null);
  // Part shares (28 Oct: "be able to execute as fractional shares"), for a
  // stock Alpaca trades in fractions: on, the quantity takes decimals and an
  // amount in dollars becomes its exact part-share quantity. Kept with the
  // account by the page (pages/Terminal.jsx), one switch with the hotkey buys:
  // one copy only, so a switch flipped early is never written back over.
  const partsOn = !!partsGiven;
  const setPartsOn = onPartsOn || (() => {});
  const parts = !crypto && !!asset?.fractionable && partsOn;
  // A stock Alpaca trades in part shares: a part share typed is taken as typed,
  // and an amount in dollars under one share buys the part share (3 Nov, the
  // owner: "It refuses to buy QQQ below 1 share!"); Part shares on makes every
  // dollar amount its exact part-share quantity.
  const fractional = !crypto && !!asset?.fractionable;
  const [unit, setUnit] = useState("qty");
  // A size as a percent of the account's own equity (19 Nov, the owner: "add
  // in the ticker percentage of the equity account in addition to the number
  // of shares and Dollar, and when writing a percentage, it should go pro
  // rata"): each account ticked takes that percent of its own equity.
  const [pctIn, setPctIn] = useState("");
  // The review's parts for the accounts ticked (functions/terminal "allocate"), as shown and sent.
  const [shares, setShares] = useState(null);
  const [partText, setPartText] = useState({});
  // Close, Stop or Max on a position (18 Nov review): with other accounts
  // ticked, each closes its own whole holding rather than a share of this one,
  // and only while the size is still the one they put in (a later order with
  // a size typed or reset must never take everything held).
  const [closeQty, setCloseQty] = useState(null);
  // Another account on screen: its own holding, not the one Close or Max read.
  useEffect(() => { setCloseQty(null); }, [account?.id]);
  const [amount, setAmount] = useState("");
  const [tracked, setTracked] = useState(null);
  const trackedRef = useRef(null);

  // A new symbol starts a new ticket, priced at the side it would trade, with
  // only the choices its market has.
  useEffect(() => {
    setLimit(""); setStop(""); setTp(""); setSl(""); setReview(false); setCloseQty(null);
    setAsset(null);
    if (isCrypto(symbol)) {
      setType((t) => (t === "stop" || t === "trailing_stop" ? "stop_limit" : t));
      setTif((t) => (t === "day" ? "gtc" : t));
      setExtended(false);
      setBracket(false);
      setQty("");
    } else {
      setTif((t) => (t === "ioc" ? "day" : t));
      setQty((q) => (q && Number.isInteger(Number(q)) ? q : "1"));
    }
  }, [symbol]);

  // The symbol's minimum order, steps and whether it trades in fractions,
  // from the broker's asset list.
  useEffect(() => {
    if (!account?.id) return undefined;
    let alive = true;
    invokeFunction("terminal", { action: "asset", accountId: account.id, symbol }).then((r) => {
      if (alive) setAsset(r?.data?.asset || null);
    });
    return () => { alive = false; };
  }, [account?.id, symbol]);

  // The sent order, followed until it is filled, cancelled or refused: at once
  // from the stream (orderFeed.js), and by asking every second at first, then
  // every five while a limit order rests, for whatever the stream misses.
  useEffect(() => {
    if (!tracked?.id || !account?.id) return undefined;
    let alive = true;
    let polls = 0;
    let timer = null;
    const see = (o) => {
      const cur = trackedRef.current;
      if (!o || !cur || cur.id !== o.id) return false;
      // Its price changed: the new order Alpaca put in its place is followed
      // from here (this effect starts again on the new id).
      if (o.status === "replaced" && o.replacedBy) {
        trackedRef.current = { ...cur, id: o.replacedBy, status: "new" };
        setTracked(trackedRef.current);
        return true;
      }
      const next = { ...cur, ...o };
      // The pop-up follows the order; once it is over, the ticket lets go of it.
      const moved = cur.status !== o.status || Number(cur.filled || 0) !== Number(o.filled || 0);
      if (moved) onNotify({ key: cur.key, ...orderNews(next) });
      trackedRef.current = orderState(o.status).final ? null : next;
      setTracked(trackedRef.current);
      if (moved && (o.status === "filled" || o.status === "partially_filled" || orderState(o.status).final)) onPlaced?.();
      return orderState(o.status).final;
    };
    const off = onOrder(tracked.id, (m) => {
      if (!alive || !see(m)) return;
      // Asked once more at the end, which also writes the result to the order's record.
      invokeFunction("terminal", { action: "orderStatus", accountId: account.id, orderId: m.id }).catch(() => null);
    });
    const tick = async () => {
      const r = await invokeFunction("terminal", { action: "orderStatus", accountId: account.id, orderId: tracked.id });
      if (!alive) return;
      const o = r?.data?.order;
      const over = see(o) || !trackedRef.current;
      polls += 1;
      // Every second for the first half minute, then every five; a resting
      // order is left to the Orders tab after ten minutes.
      if (!over && polls < 135) timer = setTimeout(tick, polls < 30 ? 1000 : 5000);
    };
    timer = setTimeout(tick, 500);
    return () => { alive = false; off(); clearTimeout(timer); };
    // Once per order; the loop above carries on until it ends.
    // (onNotify and onPlaced are steady callbacks from the page.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked?.id, account?.id]);

  // A price clicked in the order book or elsewhere becomes the limit price.
  useEffect(() => {
    if (!pick?.price) return;
    setLimit(px(pick.price));
    setType((t) => (t === "market" ? "limit" : t === "stop" ? "stop_limit" : t));
    setReview(false);
  }, [pick]);
  // Closing a position from the Positions tab: the opposite side, exactly the
  // quantity held, at market, waiting for review. Applied once the ticket has
  // switched to the position's symbol (the symbol change above clears it).
  const appliedPreset = useRef(null);
  useEffect(() => {
    if (!preset || preset.symbol !== symbol || appliedPreset.current === preset.at) return;
    appliedPreset.current = preset.at;
    setCloseQty(String(preset.qtyText));
    setSide(preset.side);
    setUnit("qty");
    setQty(preset.qtyText);
    setExtended(false);
    setBracket(false);
    // A stop for a position (its Stop button): the stop price filled in, to
    // adjust before review; a coin's as a stop-limit, its limit 1% past.
    if (preset.type === "stop") {
      const coin = isCrypto(symbol);
      setType(coin ? "stop_limit" : "stop");
      setStop(px(preset.stopPrice));
      if (coin) setLimit(px(preset.stopPrice * (preset.side === "sell" ? 0.99 : 1.01)));
      setTif(coin || Number.isInteger(Number(preset.qtyText)) ? "gtc" : "day");
      setReview(false);
      return;
    }
    setType("market");
    setTif(isCrypto(symbol) ? "gtc" : "day");
    setReview(true);
  }, [preset, symbol]);
  // Filled once per symbol and side, when the first quote arrives; after that
  // the field is the trader's, even if they clear it to type.
  const filledFor = useRef(null);
  useEffect(() => {
    const k = `${symbol}|${side}`;
    if (filledFor.current === k || !quote) return;
    const p = side === "buy" ? quote.ask ?? quote.last : quote.bid ?? quote.last;
    if (p) { setLimit(px(p)); filledFor.current = k; }
  }, [quote, side, symbol]);

  const paper = account?.type === "Paper";
  // A live account trades only where the server allows it (the owner's own).
  // Orders go to the ticked accounts only (3 Nov): the one on screen when it
  // is ticked (`leadOff` when it is not), none at all when nothing is ticked.
  const live = !leadOff && account?.type === "Live" && liveOk;
  const tradable = !none && (leadOff || paper || live);
  const count = group.length + (leadOff ? 0 : 1);
  const coin = crypto ? symbol.split("/")[0] : "";
  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const needsTrail = type === "trailing_stop";
  const ref = side === "buy" ? quote?.ask ?? quote?.last : quote?.bid ?? quote?.last;
  const at = needsLimit ? Number(limit) : type === "stop" ? Number(stop) : ref;
  // In dollars: a market order sends the amount itself where the broker
  // takes one; anything else becomes a quantity at the order's price.
  const dollars = unit === "usd" ? Number(amount) || 0 : 0;
  // In percent: this account's own percent, as a % hotkey sizes it (lib/terminal.js percentQty).
  const pct = unit === "pct" ? Number(pctIn) || 0 : 0;
  const pctDollars = pct > 0 && Number(equity) > 0 ? Number(equity) * pct / 100 : 0;
  const pctSize = unit === "pct" && !crypto ? percentQty(pctDollars, at, { side, held, buyingPower, fractionable: fractional, parts }) : null;
  const notional = unit === "usd" && type === "market" && (crypto || !!asset?.fractionable);
  const inParts = (d) => (d >= 1 ? amountToQty(d, at, { crypto: true, step: 1e-9 }) : 0);
  const wholeQty = unit === "usd" && !notional && !parts ? amountToQty(dollars, at, { crypto, step: asset?.minTradeIncrement }) : 0;
  const typed = unit === "pct" ? (crypto ? amountToQty(pctDollars, at, { crypto, step: asset?.minTradeIncrement }) : pctSize.qty)
    : unit === "usd"
      ? (notional ? (ref ? dollars / ref : 0) : parts ? inParts(dollars) : wholeQty > 0 || !fractional ? wholeQty : inParts(dollars))
      : crypto || fractional ? Number(qty) || 0 : Number.isInteger(Number(qty)) ? Number(qty) || 0 : 0;
  // Part of a share typed where it cannot go: said, never rounded into whole
  // shares (28 Oct: "0.5" read as 5 once the dot was dropped).
  const wholeOnly = !crypto && !fractional && unit === "qty" && qty !== "" && !Number.isInteger(Number(qty));
  // A sale typed as the holding shown, rounded for display, is the holding:
  // 0.49875 on screen is 0.498749999 at the broker.
  const sellAll = side === "sell" && held > 0 && typed > held && typed - held < 1e-8;
  const n = sellAll ? held : typed;
  // Any live account among those the order goes to, said on the button.
  const groupLive = live || group.some((a) => a.type === "Live");
  const belowMin = crypto && !notional && n > 0 && asset?.minOrderSize && n < asset.minOrderSize;
  // A leftover smaller than the coin's smallest order (about $1 at Alpaca)
  // cannot be sold by itself: say so once, rather than offer a sale that fails.
  const dust = crypto && held > 0 && asset?.minOrderSize && held < asset.minOrderSize;
  const minDollars = asset?.minOrderSize && ref ? asset.minOrderSize * ref : null;
  const value = notional ? dollars : at && n ? at * n : null;
  // On this account alone: with others ticked the number is shared out, and
  // the review shows each account's part (an account never sells more than
  // it holds there).
  const short = !group.length && side === "sell" && n > Math.max(0, held) + 1e-12;
  const overBp = !group.length && side === "buy" && value !== null && buyingPower !== null && value > buyingPower;
  // In percent with other accounts ticked, the review sizes every account,
  // the one on screen too: its own part may come to nothing (19 Nov review).
  const sized = unit === "pct" && group.length > 0 ? pct > 0 && pct <= 100 && Number(equity) > 0
    : (notional ? dollars >= 1 : n > 0) && !(unit === "pct" && pct > 100);
  // Part of a share: Alpaca takes it for the day and without a take-profit and
  // stop-loss attached, and not as a trailing stop. So too with Part shares on
  // and other accounts ticked (19 Nov, the owner: "turn on part shares for the
  // ticket too"): each account's part is then its exact part share.
  // Close, Stop or Max with other accounts ticked: each account's whole holding
  // (see the review below), not a share of a total.
  const wholeHoldings = closeQty !== null && unit === "qty" && qty === closeQty && !notional && ((side === "sell" && held > 0) || (side === "buy" && held < 0) || leadOff);
  // Not for Close, Stop or Max: each account's whole holding goes as it is, a
  // whole-share holding keeping its stop good till cancelled (19 Nov review).
  // Any account's part in part shares, as the review shows it (19 Nov review:
  // with Part shares off, a small account's buy under one share is one), or
  // typed into a row: every account's order then goes for the day, no exits.
  const rowsInParts = !crypto && group.length > 0 && Object.values(partText).some((v) => { const x = Number(v); return x > 0 && !Number.isInteger(x); });
  const partShare = !crypto && (rowsInParts ||
    (n > 0 && (!Number.isInteger(n) || (parts && group.length > 0 && !wholeHoldings && !(unit === "pct" && side === "sell")))));
  const trailingPart = partShare && type === "trailing_stop";
  const ready = tradable && symbol && sized && !belowMin && !(crypto && short) && !trailingPart &&
    (!needsLimit || Number(limit) > 0) && (!needsStop || Number(stop) > 0) && (!needsTrail || Number(trail) > 0) && (!bracket || (Number(tp) > 0 && Number(sl) > 0));
  // A stock's dollar-amount order is a market order for the day, in regular hours, without exits.
  useEffect(() => {
    if (notional && !crypto) { setTif("day"); setExtended(false); setBracket(false); }
  }, [notional, crypto]);
  useEffect(() => {
    // Again whenever either is set afterwards (19 Nov review: the Stop button
    // set good till cancelled after this had run).
    if (partShare) { if (tif !== "day") setTif("day"); if (bracket) setBracket(false); }
  }, [partShare, tif, bracket]);
  // What the order can take now, and why not. Selling shares held (or buying
  // back a short) closes them: a bracket's legs would open the other way.
  const closing = !crypto && ((side === "sell" && held > 0) || (side === "buy" && held < 0));
  const session = sessionOf(Date.now() / 1000);
  const choices = ticketChoices({ type, tif, extended, bracket, closing, dollars: notional && !crypto, session });
  useEffect(() => {
    if (bracket && !choices.bracket.ok) setBracket(false);
    if (extended && !choices.extended.ok) setExtended(false);
  }, [bracket, extended, choices.bracket.ok, choices.extended.ok]);

  // Selling the whole holding sends the broker's exact quantity; say that one.
  const exactSale = !notional && side === "sell" && !!heldText && (unit === "pct" ? !!pctSize?.all : sellAll || Number(qty) === held);
  const words = (notional
    ? `${side === "buy" ? "Buy" : "Sell"} ${fmtMoney(dollars)} of ${symbol} `
    : `${side === "buy" ? "Buy" : "Sell"} ${exactSale ? String(Number(heldText)) : n ? sizeText(n) : unit === "pct" && pct > 0 ? `${pct}%` : "?"} ${crypto ? coin : symbol || ""} `) +
    (type === "market" ? "at market" : type === "limit" ? `limit ${px(limit)}` : type === "stop" ? `stop ${px(stop)}`
      : type === "trailing_stop" ? `trailing stop ${trailBy === "pct" ? `${trail}%` : fmtMoney(Number(trail))} behind the price` : `stop ${px(stop)}, limit ${px(limit)}`) +
    `, ${TIF_TEXT[tif] || TIF_TEXT.day}${extended ? ", including pre-market and after hours" : ""}` +
    (bracket ? `, then take profit at ${px(tp)} or stop out at ${px(sl)}` : "");

  const order = () => ({
    symbol, side, qty: notional ? null : exactSale ? heldText : n,
    // Part shares go for the day only, without exits attached, whatever the
    // screen still shows (19 Nov review).
    notional: notional ? dollars : null, type, timeInForce: partShare ? "day" : tif, extendedHours: extended,
    limitPrice: needsLimit ? limit : null, stopPrice: needsStop ? stop : null,
    trailPercent: needsTrail && trailBy === "pct" ? trail : null, trailPrice: needsTrail && trailBy === "usd" ? trail : null,
    takeProfit: bracket && !partShare ? tp : null, stopLoss: bracket && !partShare ? sl : null, reference: ref ?? null,
    // The other accounts: exact part shares with Part shares on, else whole shares.
    parts: !crypto && parts,
    ...(leadOff ? { leadOff: true } : {})
  });
  // With other accounts ticked, the ticket's number is the total, shared by
  // portfolio value over every account it goes to (18 Nov, the owner: "When I
  // need to sell or buy 50 stocks ... I need them pro rata not 25 per each as
  // the account sizes are different"; "The sizing based on equity";
  // functions/_shared/proRata.ts splitTotal). The review shows each part,
  // each can be changed, and what it shows is what is sent. The hotkeys keep
  // each account's own size from the Accounts list.
  const groupIds = group.map((a) => a.id);
  useEffect(() => {
    if (!review || !groupIds.length || !account?.id) { setShares(null); setPartText({}); return undefined; }
    let gone = false;
    setShares({ loading: true });
    // In percent: each account its own percent of its own equity (split "percent").
    const split = wholeHoldings ? "holdings" : unit === "pct" ? "percent" : "total";
    invokeFunction("terminal", { action: "allocate", accountId: account.id, order: { ...order(), split, ...(split === "percent" ? { pct } : {}) }, group: groupIds })
      .then((r) => {
        if (gone) return;
        if (r?.data?.error) { setShares({ error: r.data.error }); return; }
        const rows = r?.data?.group || [];
        const lead = r?.data?.lead || null;
        setShares({ rows, lead, at: Date.now(), closing: !!r?.data?.closing, split: r?.data?.split });
        const text = (p) => (p && !p.skip ? String(p.notional ?? p.qtyText ?? p.qty ?? "") : "0");
        setPartText({ ...(lead && !leadOff ? { [account.id]: text(lead.part) } : {}), ...Object.fromEntries(rows.map((g) => [g.accountId, text(g)])) });
      })
      .catch((e) => { if (!gone) setShares({ error: String(e?.message || e) }); });
    return () => { gone = true; };
    // Asked again when where it goes or how it is sized changes under an open
    // review (18 Nov review: the screen account's tick; the stock's part-share
    // answer arriving late turns a share count into dollars).
  }, [review, JSON.stringify(groupIds), account?.id, leadOff, notional, wholeHoldings, unit]);
  // Each account's part as it stands in the review (a number, 0 for none).
  const partOf = (id) => { const v = Number(partText[id]); return Number.isFinite(v) && v > 0 ? v : 0; };
  const splitRows = shares?.rows ? [
    ...(!leadOff && shares.lead ? [{ accountId: account.id, name: account?.name, live: account?.type === "Live", onScreen: true, ...(shares.lead.part || {}), equity: shares.lead.equity }] : []),
    ...shares.rows
  ] : [];
  const splitTotal = splitRows.reduce((sum, g) => sum + partOf(g.accountId), 0);
  const splitReady = !groupIds.length || (!!shares?.rows && splitTotal > 0);
  const send = async () => {
    setBusy(true);
    const key = `o${Date.now()}`;
    const unitName = crypto ? coin : "shares";
    onNotify({ key, ...orderNews({ sending: true, words }) });
    // This account's book as the review just read it goes along, so its own
    // order is sent at once, alongside the reading of the others'.
    const fresh = !leadOff && groupIds.length && shares?.lead && Date.now() - shares.at < 30000;
    const leadBook = fresh ? { equity: shares.lead.equity, buyingPower: shares.lead.buyingPower, held: shares.lead.held } : undefined;
    // With others ticked: each account's part from the review, exactly; the
    // whole holding as the broker's exact quantity where the part is all of it.
    let body = { ...order(), leadBook };
    let groupOut = [];
    if (groupIds.length) {
      const exact = (g) => (g.all && g.qtyText && String(partText[g.accountId]) === String(g.qtyText ?? g.qty) ? g.qtyText : partOf(g.accountId));
      const mine = splitRows.find((g) => g.onScreen);
      const myPart = mine ? partOf(mine.accountId) : 0;
      groupOut = (shares?.rows || []).filter((g) => partOf(g.accountId) > 0)
        .map((g) => ({ id: g.accountId, mode: notional ? "dollars" : "shares", value: notional ? partOf(g.accountId) : exact(g) }));
      const anyPart = splitRows.some((g) => !Number.isInteger(partOf(g.accountId)));
      body = {
        // Part shares only where a part is one; reduce-only when the review closed holdings.
        ...body, parts: !crypto && anyPart, ...(shares?.closing ? { reduceOnly: true } : {}),
        // A percent review's parts go as shown, each account's closing read on its own.
        ...(shares?.split === "percent" ? { asShown: true } : {}),
        // Nothing for the account on screen: sent as not ticked, the others still take theirs.
        ...(myPart > 0 ? (notional ? { notional: myPart, qty: null } : { qty: exact(mine), notional: null }) : { leadOff: true, leadBook: undefined })
      };
    }
    const r = await invokeFunction("terminal", { action: "order", accountId: account.id, order: body, group: groupOut });
    // The other accounts' orders are in the Orders tab; a pop-up only for what was not done there.
    const sentTo = groupOut.map((g) => g.id);
    reportGroup(r?.data?.group, { key: body.leadOff ? key : `${key}g`, notify: onNotify, refresh: onPlaced, expected: sentTo });
    setBusy(false);
    setReview(false);
    if (r?.data?.error) onNotify({ key, ...orderNews({ error: r.data.error }) });
    else if (r?.data?.skipped) {
      // The server sent nothing here (no longer holds what the review closed): said, not tracked.
      onNotify({ key, tone: "muted", title: `Not on ${account.name || "this account"}`, detail: r.data.skipped });
      setQty(crypto ? "" : "1"); setAmount(""); setCloseQty(null); onPlaced?.();
    } else if (r?.data?.leadOff) {
      if (!r?.data?.group?.some((g) => g.ok === false || (g.skip && (!/^holds no/.test(g.skip) || sentTo.includes(g.accountId))))) onNotify({ key, tone: "ok", title: `Sent to ${groupOut.length} account${groupOut.length === 1 ? "" : "s"}`, detail: `${words}. See the Orders tab.` });
      setQty(crypto ? "" : "1"); setAmount(""); setCloseQty(null); onPlaced?.();
    } else {
      // With others ticked, this account's own part, not the total.
      const own = !groupIds.length ? words
        : notional ? words.replace(/^(Buy|Sell) \S+/, `$1 ${fmtMoney(Number(body.notional))}`) : words.replace(/^(Buy|Sell) \S+/, `$1 ${String(Number(body.qty))}`);
      const placed = { key, id: r?.data?.orderId, status: r?.data?.status || "new", words: own, symbol, side, unitName };
      trackedRef.current = placed;
      setTracked(placed);
      onNotify({ key, ...orderNews(placed) });
      // A fresh ticket: the size just sent would otherwise sit there, checked
      // against a holding that has since changed.
      setQty(crypto ? "" : "1");
      setAmount("");
      setCloseQty(null);
      onPlaced?.();
    }
  };
  const cancelTracked = async () => {
    if (!tracked?.id) return;
    const r = await invokeFunction("manageOrder", { accountId: account.id, orderId: tracked.id, action: "cancel" });
    if (r?.data?.error) onNotify({ key: tracked.key, tone: "bad", title: "Could not cancel", detail: r.data.error });
    else if (trackedRef.current) {
      trackedRef.current = { ...trackedRef.current, status: "pending_cancel" };
      setTracked(trackedRef.current);
    }
  };

  return (
    <div className="space-y-3">
      {/* While an order works: one line, and the way to cancel it. Its news
          comes as a pop-up at the top of the screen. */}
      {tracked && (
        <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
          <span className="min-w-0 flex-1 truncate">{orderState(tracked.status).label}: {tracked.words}</span>
          {tracked.status !== "pending_cancel" && (
            <button type="button" onClick={cancelTracked} className="shrink-0 rounded border border-sky-300 px-1.5 py-0.5 font-medium hover:bg-white">Cancel</button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {["buy", "sell"].map((s) => (
          <button key={s} type="button" onClick={() => { setSide(s); setLimit(""); setReview(false); setCloseQty(null); }}
            className={`rounded-md py-1.5 text-sm font-semibold ${side === s ? (s === "buy" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-slate-600"}`}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      {/* What Alpaca allows on this stock (28 Oct: "if the stock fractional or
          not ... And shortable or not too"), from its asset record. */}
      {!crypto && asset && (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className={`rounded px-1.5 py-0.5 font-medium ${asset.fractionable ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
            title={asset.fractionable ? "Alpaca trades part shares of it: market, limit, stop and stop limit, for the day; before 9:30 and after 16:00 as a limit." : "Alpaca trades it in whole shares only."}>
            {asset.fractionable ? "Fractional" : "Whole shares only"}
          </span>
          <span className={`rounded px-1.5 py-0.5 font-medium ${asset.shortable ? (asset.easyToBorrow ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800") : "bg-rose-50 text-rose-800"}`}
            title={asset.shortable ? (asset.easyToBorrow ? "Alpaca can lend it for a short sale." : "Shortable, but hard to borrow: a short may be refused or cost more to hold.") : "Alpaca does not lend it: it cannot be sold short."}>
            {asset.shortable ? (asset.easyToBorrow ? "Shortable · easy to borrow" : "Shortable · hard to borrow") : "Not shortable"}
          </span>
          {asset.fractionable && (
            <label className="ml-auto flex items-center gap-1 text-slate-600" title="Every amount in dollars, and every hotkey buy sized in dollars or a percent, bought as its exact part-share quantity on each ticked account, not whole shares. For the day; no take-profit and stop-loss attached; a stop on a position with part of a share lasts for today only. (A part share typed, or a buy under one share, is bought either way.)">
              <input type="checkbox" checked={partsOn} onChange={(e) => { setPartsOn(e.target.checked); setReview(false); }} />
              Part shares
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-[11px] uppercase tracking-wider text-slate-500" htmlFor="t-qty">{unit === "pct" ? "% of equity" : unit === "usd" ? "Amount ($)" : crypto ? `Quantity (${coin})` : "Shares"}</label>
            <div className="flex overflow-hidden rounded border border-slate-200 text-[10px]" role="group" aria-label="Size in">
              {[["qty", crypto ? coin : "Shares"], ["usd", "$"], ["pct", "%"]].map(([id, name]) => (
                <button key={id} type="button" onClick={() => { setUnit(id); setReview(false); setCloseQty(null); }} className={`px-1.5 ${unit === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
              ))}
            </div>
          </div>
          {unit === "pct" ? (
            <input id="t-qty" className={input} inputMode="decimal" value={pctIn} placeholder="e.g. 5"
              onChange={(e) => { setPctIn(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")); setReview(false); }} />
          ) : unit === "usd" ? (
            <input id="t-qty" className={input} inputMode="decimal" value={amount} placeholder="e.g. 500"
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")); setReview(false); }} />
          ) : (
            <input id="t-qty" className={input} inputMode={crypto || fractional ? "decimal" : "numeric"} value={qty} placeholder={crypto && asset?.minOrderSize ? `min ${asset.minOrderSize}` : fractional ? "e.g. 2.5" : ""}
              onChange={(e) => { setQty(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")); setReview(false); setCloseQty(null); }} />
          )}
          {wholeOnly && (
            <p className="mt-0.5 text-[10px] text-amber-700">
              {`${symbol} trades in whole shares only at Alpaca.`}
            </p>
          )}
          {unit === "pct" && pct > 0 && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              {pct > 100 ? "At most 100% of equity."
                : !(Number(equity) > 0) ? "Reading this account's equity…"
                  : `= ${pct}% of ${fmtMoney(Number(equity))} = ${fmtMoney(pctDollars)}${pctSize?.under1 ? `: under Alpaca's $1 smallest part share`
                    : n > 0 ? ` → ${sizeText(n)} ${crypto ? coin : n === 1 ? "share" : "shares"} at ${px(at)}${pctSize?.all ? " (all held)" : ""}`
                      : at ? `: less than one ${crypto ? "step" : "share"} at ${px(at)}` : ": enter a price"}`}
              {group.length > 0 && Number(equity) > 0 && pct <= 100 ? ". Each account ticked: the same percent of its own equity." : ""}
            </p>
          )}
          {unit === "usd" && dollars > 0 && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              {notional ? `Sent as ${fmtMoney(dollars)}; about ${sizeText(n)} ${crypto ? coin : "shares"} at ${px(ref)}`
                : n > 0 ? `= ${sizeText(n)} ${crypto ? coin : n === 1 ? "share" : "shares"} at ${px(at)}`
                  : at ? `Less than one ${crypto ? "step" : "share"} at ${px(at)}` : "Enter a price"}
            </p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="t-type">Type</label>
          <select id="t-type" className={input} value={type} onChange={(e) => { setType(e.target.value); setReview(false); if (e.target.value !== "limit") setExtended(false); }}>
            {TYPES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        {needsStop && (
          <div>
            <label className={label} htmlFor="t-stop">Stop price</label>
            <input id="t-stop" className={input} inputMode="decimal" value={stop} onChange={(e) => { setStop(e.target.value); setReview(false); }} />
          </div>
        )}
        {needsTrail && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500" htmlFor="t-trail">Trail by</label>
              <div className="flex overflow-hidden rounded border border-slate-200 text-[10px]" role="group" aria-label="Trail by">
                {[["pct", "%"], ["usd", "$"]].map(([id, name]) => (
                  <button key={id} type="button" onClick={() => { setTrailBy(id); setReview(false); }} className={`px-1.5 ${trailBy === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{name}</button>
                ))}
              </div>
            </div>
            <input id="t-trail" className={input} inputMode="decimal" value={trail} onChange={(e) => { setTrail(e.target.value.replace(/[^\d.]/g, "")); setReview(false); }} />
          </div>
        )}
        {needsLimit && (
          <div>
            <label className={label} htmlFor="t-limit">Limit price</label>
            <input id="t-limit" className={input} inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setReview(false); }} />
          </div>
        )}
        <div>
          <label className={label} htmlFor="t-tif">Time in force</label>
          <select id="t-tif" className={input} value={tif} onChange={(e) => { setTif(e.target.value); setReview(false); if (e.target.value !== "day") setExtended(false); }}>
            {!crypto && <option value="day">Day</option>}
            <option value="gtc" disabled={partShare}>Good till cancelled{partShare ? " (not for part shares)" : ""}</option>
            {crypto && <option value="ioc">Immediate or cancel</option>}
          </select>
        </div>
      </div>

      {quote && (
        <div className="flex gap-2 text-[11px]">
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.bid))}>Bid {px(quote.bid)}</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.bid != null && quote.ask != null ? (quote.bid + quote.ask) / 2 : quote.last))}>Mid</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => setLimit(px(quote.ask))}>Ask {px(quote.ask)}</button>
        </div>
      )}

      {!crypto && (
      <div>
        <label className={`flex items-center gap-2 text-xs ${choices.extended.ok ? "text-slate-700" : "text-slate-400"}`}>
          <input type="checkbox" checked={extended} disabled={!choices.extended.ok} onChange={(e) => { setExtended(e.target.checked); setReview(false); }} />
          Pre-market and after hours (day limit orders only)
        </label>
        {!choices.extended.ok && <p className="ml-5 text-[10px] leading-snug text-slate-500">{choices.extended.why}</p>}
      </div>
      )}

      {!crypto && (
      <div className="rounded-lg border border-slate-200 p-2">
        <label className={`flex items-center gap-2 text-xs font-medium ${choices.bracket.ok ? "text-slate-700" : "text-slate-400"}`}>
          <input type="checkbox" checked={bracket} disabled={!choices.bracket.ok || partShare} onChange={(e) => { setBracket(e.target.checked); setReview(false); }} />
          Attach take-profit and stop-loss
        </label>
        {!choices.bracket.ok && <p className="ml-5 text-[10px] leading-snug text-slate-500">{choices.bracket.why}</p>}
        {bracket && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="t-tp">Take profit</label>
              <input id="t-tp" className={input} inputMode="decimal" value={tp} onChange={(e) => { setTp(e.target.value); setReview(false); }} />
            </div>
            <div>
              <label className={label} htmlFor="t-sl">Stop loss</label>
              <input id="t-sl" className={input} inputMode="decimal" value={sl} onChange={(e) => { setSl(e.target.value); setReview(false); }} />
            </div>
          </div>
        )}
      </div>
      )}

      <div className="space-y-1 text-xs text-slate-600">
        <div className="flex justify-between"><span>Estimated {side === "buy" ? "cost" : "proceeds"}</span><span className="tabular-nums">{value ? fmtMoney(value) : "—"}</span></div>
        <div className="flex justify-between"><span>Buying power</span><span className="tabular-nums">{buyingPower !== null ? fmtMoney(buyingPower) : "—"}</span></div>
        <div className="flex items-center justify-between gap-2">
          <span>You hold</span>
          <span className="flex items-center gap-1.5 tabular-nums">
            {crypto && heldText ? String(Number(heldText)) : sizeText(held)} {crypto ? coin : "shares"}
            {side === "sell" && held > 0 && !dust && (
              <button type="button" title="Sell exactly what you hold" onClick={() => { setUnit("qty"); setQty(heldText || String(held)); setReview(false); setCloseQty(heldText || String(held)); }}
                className="rounded border border-slate-300 px-1 text-[10px] text-slate-700 hover:bg-slate-50">Max</button>
            )}
          </span>
        </div>
        {crypto && asset?.minOrderSize ? (
          <div className="flex justify-between"><span>Smallest order</span><span className="tabular-nums">{asset.minOrderSize} {coin}{minDollars ? ` (≈ ${fmtMoney(minDollars)})` : ""}</span></div>
        ) : null}
      </div>

      {none ? <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">No account ticked: nothing will be sent. Tick one under Accounts.</p>
        : !tradable && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Orders go to paper accounts only during this test. Choose a paper account to trade.</p>}
      {live && <p className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-800">Live account: real money.</p>}
      {short && !crypto && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {Math.max(0, held)} shares, so this sells {n - Math.max(0, held)} you do not own: a short sale.</p>}
      {short && crypto && !dust && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">You hold {sizeText(Math.max(0, held))} {coin}. Crypto cannot be sold short, so a sale is limited to what you hold.</p>}
      {dust && side === "sell" ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Your {String(Number(heldText || held))} {coin} is less than Alpaca&apos;s smallest {coin} order ({asset.minOrderSize} {coin}, about {fmtMoney(minDollars || 1)}), so it cannot be sold on its own. Buy more and sell the two together, or leave it.
        </p>
      ) : belowMin ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Too small: Alpaca&apos;s smallest {coin} order is {asset.minOrderSize} {coin} (about {fmtMoney(minDollars || 1)}).</p>
      ) : null}
      {overBp && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">This is more than the account's buying power; the broker will likely refuse it.</p>}
      {partShare && group.length > 0 && parts && (
        <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
          Part shares on: each account gets its exact share by portfolio value, for the day, with no take-profit and stop-loss attached; a stop on a position with part of a share lasts for today only.
        </p>
      )}
      {trailingPart && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Alpaca takes no trailing stop on part of a share. Choose another type, or turn Part shares off.</p>}
      {!crypto && choices.stopWaits && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {stopWaitText(session)} This order goes to Alpaca now and waits there until then. To trade before then, use a limit order with &ldquo;Pre-market and after hours&rdquo; ticked.
        </p>
      )}


      {review ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2">
          <p className="text-sm text-slate-800">{words}.</p>
          {group.length > 0 && (
            <div className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] leading-snug text-slate-700">
              <div className="flex justify-between gap-2 font-semibold text-slate-900">
                <span>On {count} account{count === 1 ? "" : "s"}, {shares?.split === "holdings" ? "each its whole holding" : "by portfolio value"}</span>
                {shares?.rows && <span className="tabular-nums">{notional ? fmtMoney(splitTotal) : `${sizeText(splitTotal)} ${crypto ? coin : "shares"}`} in all</span>}
              </div>
              {shares?.loading && <div className="text-slate-500">Working out each account&apos;s part…</div>}
              {shares?.error && <div className="text-rose-700">{shares.error}</div>}
              {splitRows.map((g) => (
                <div key={g.accountId} className="py-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {g.name}{g.live ? " (LIVE)" : ""}{g.onScreen ? <span className="text-slate-400"> on screen</span> : null}
                      {g.equity ? <span className="text-slate-400"> · {fmtMoney(g.equity)}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {notional && <span className="text-slate-400">$</span>}
                      <input aria-label={`${g.name} ${notional ? "amount" : crypto ? coin : "shares"}`} inputMode="decimal" value={partText[g.accountId] ?? ""}
                        disabled={!!g.skip && !/less than/.test(g.skip)} title={g.skip && !/less than/.test(g.skip) ? `Nothing can go to it: ${g.skip}` : undefined}
                        onChange={(e) => setPartText((t) => ({ ...t, [g.accountId]: e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1") }))}
                        className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums focus:border-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400" />
                      {!notional && <span className="w-8 text-slate-400">{crypto ? coin : "sh"}</span>}
                    </span>
                  </div>
                  {g.skip && <div className="text-slate-400">nothing sent: {g.skip}</div>}
                  {!g.skip && g.all && <div className="text-slate-400">all it holds</div>}
                  {/* Sent for the day, without exits, on part of a share (audit W47-F1). */}
                  {!g.skip && partShareDay({ qty: partOf(g.accountId), tif, bracket, crypto, notional }) && (
                    <div className="font-medium text-amber-800">{partShareDay({ qty: partOf(g.accountId), tif, bracket, crypto, notional })}</div>
                  )}
                  {/* What the part does there (18 Nov review): a sale past what it holds is a short; a buy past its buying power is likely refused. */}
                  {!notional && side === "sell" && partOf(g.accountId) > Math.max(0, Number(g.held) || 0) + 1e-12 && (
                    <div className="font-medium text-amber-800">sells {sizeText(partOf(g.accountId) - Math.max(0, Number(g.held) || 0))} it does not hold: a short sale{Number(g.held) > 0 ? ` (holds ${sizeText(Number(g.held))})` : ""}</div>
                  )}
                  {side === "buy" && g.buyingPower != null && (notional ? partOf(g.accountId) : partOf(g.accountId) * (at || 0)) > g.buyingPower && (
                    <div className="font-medium text-amber-800">more than its buying power ({fmtMoney(g.buyingPower)}): likely refused</div>
                  )}
                </div>
              ))}
              {shares?.rows && shares.split === "total" && Math.abs(splitTotal - (notional ? dollars : n)) > 1e-9 && (
                <div className="text-amber-800">
                  {notional ? fmtMoney(splitTotal) : sizeText(splitTotal)} of {notional ? fmtMoney(dollars) : sizeText(n)} will be sent{splitRows.some((g) => g.all) ? ": an account cannot sell more than it holds" : ""}.
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy || !splitReady}
              className={`flex-1 rounded-md py-2 text-sm font-semibold text-white disabled:opacity-50 ${side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
              {busy ? "Sending…" : count > 1 || leadOff ? `Send to ${count} account${count === 1 ? "" : "s"}` : "Send order"}
            </button>
            <button type="button" onClick={() => setReview(false)} className="rounded-md border border-slate-300 px-3 text-sm text-slate-600">Edit</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => setReview(true)}
          className={`w-full rounded-md py-2 text-sm font-semibold text-white disabled:opacity-40 ${side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
          Review {side === "buy" ? "buy" : "sell"}{count > 1 || leadOff ? ` · ${count} account${count === 1 ? "" : "s"}${groupLive ? " (live)" : ""}` : ""}
        </button>
      )}

      {/* Shown when this account or any picked beside it holds the symbol (28 Oct:
          "put the SL and TP ... for all accounts at once"). */}
      {((!leadOff && held !== 0) || groupHeld.some((g) => g.qty)) && account?.id && (
        <PositionExits account={account} symbol={symbol} held={leadOff ? 0 : held} crypto={crypto} tradable={tradable} session={session} onNotify={onNotify} onPlaced={onPlaced}
          group={group} groupHeld={groupHeld} leadOff={leadOff} />
      )}
    </div>
  );
}

// The holding's own exits (functions/terminal "protect"): a stop, a take
// profit, or both, for all of it, good till cancelled. A new stop replaces the
// stop working on it, a new take profit the take profit, and a stop and a take
// profit go together as one cancels the other. Reviewed, then sent, like any
// order from the ticket.
function PositionExits({ account, symbol, held, crypto, tradable, session, onNotify, onPlaced, group = [], groupHeld = [], leadOff = false }) {
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStop(""); setTarget(""); setReview(false); }, [symbol]);
  // The side from this account's holding, else the first account picked that holds it.
  const long = held ? held > 0 : (groupHeld.find((g) => g.qty)?.qty || 0) > 0;
  const qty = Math.abs(held);
  const name = crypto ? symbol.split("/")[0] : symbol;
  // Who holds it: this account and each picked beside it.
  const holders = [
    held ? `${sizeText(qty)} here` : null,
    ...groupHeld.filter((g) => g.qty).map((g) => `${sizeText(Math.abs(g.qty))} on ${g.name}`)
  ].filter(Boolean);
  const many = holders.length > 1 || !held;
  const s = Number(stop) > 0 ? Number(stop) : null;
  const t = Number(target) > 0 ? Number(target) : null;
  // Alpaca pairs exits only on whole shares.
  const pairOk = !(s && t) || (!crypto && Number.isInteger(qty));
  // The stop's limit, as the server sets it (positionTools stopLimitPrice):
  // 2% past the stop, so the review says the worst price before it is sent.
  const floor = s && !crypto ? Math.round((long ? s * 0.98 : s * 1.02) * (s >= 1 ? 100 : 10000)) / (s >= 1 ? 100 : 10000) : null;
  const words = exitText({ side: long ? "sell" : "buy", qty, stopPrice: s, limitPrice: floor, targetPrice: t }, name, session)
    .replace(/^(Sell|Buy back) [^:]+:/, (m, out) => (many ? `${out} all ${name} held (${holders.join(", ")}):` : m)) +
    `. ${exitsLifetime([{ name: "here", qty: held }, ...groupHeld], crypto)}; replaces the ${s && t ? "stop and take profit" : s ? "stop" : "take profit"} working on ${symbol}${many ? " on each account" : ""}, if any`;
  const send = async () => {
    setBusy(true);
    const key = `x${Date.now()}`;
    onNotify({ key, tone: "wait", title: `Setting exits on ${symbol}…`, detail: words });
    const r = await invokeFunction("terminal", { action: "protect", accountId: account.id, symbol, kind: s && t ? "both" : s ? "stop" : "target", mode: "price", value: s ?? t, stopPrice: s, targetPrice: t, group: group.map((a) => a.id), leadOff })
      .catch((e) => ({ data: { error: String(e?.message || e) } }));
    const g = refusalNews(r?.data?.group);
    if (g) onNotify({ key: leadOff ? key : `${key}g`, ...g });
    const day = dayOnlyNews(r?.data?.group);
    if (day) onNotify({ key: `${key}d`, ...day });
    setBusy(false);
    setReview(false);
    if (r?.data?.error) { onNotify({ key, tone: "bad", title: "Exits not set", detail: r.data.error }); return; }
    if (r?.data?.leadOff) { setStop(""); setTarget(""); onPlaced?.(); return; }
    if (r?.data?.skipped) {
      onNotify({ key, tone: "muted", title: `Not on ${account.name || "this account"}`, detail: r.data.skipped });
      setStop(""); setTarget(""); onPlaced?.();
      return;
    }
    const d = r.data;
    const did = exitText({ side: d.side, qty: d.qty, stopPrice: d.kind === "target" && !d.paired ? null : d.stopPrice, limitPrice: d.limitPrice, targetPrice: d.kind === "stop" && !d.paired ? null : d.targetPrice }, name, session);
    onNotify({ key, tone: "ok", title: "Exits set at Alpaca", detail: [did, d.replaced ? `replaced ${d.replaced} earlier exit order${d.replaced === 1 ? "" : "s"}` : null, d.note].filter(Boolean).join(" · ") });
    setStop("");
    setTarget("");
    onPlaced?.();
  };
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-xs font-medium text-slate-700">
        {many ? <>Exits for {name} on every account that holds it: {holders.join(" · ")}</> : <>Exits for the {sizeText(qty)} {crypto ? name : `${symbol} shares`} you {long ? "hold" : "are short"}</>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="x-stop">Stop loss</label>
          <input id="x-stop" className={input} inputMode="decimal" value={stop} placeholder={long ? "below the price" : "above the price"} onChange={(e) => { setStop(e.target.value.replace(/[^\d.]/g, "")); setReview(false); }} />
        </div>
        <div>
          <label className={label} htmlFor="x-target">Take profit</label>
          <input id="x-target" className={input} inputMode="decimal" value={target} placeholder={long ? "above the price" : "below the price"} onChange={(e) => { setTarget(e.target.value.replace(/[^\d.]/g, "")); setReview(false); }} />
        </div>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        One or both, sent to Alpaca at once as real orders{crypto ? "" : "; together, when one fills the other is cancelled"}. The stop is a stop-limit: {long ? "it sells no lower than" : "it buys back no higher than"} {crypto ? "1%" : "2%"} {long ? "under" : "over"} the stop.{" "}
        {crypto ? "Coins trade around the clock, and so do their stops." : "Alpaca triggers stops from 9:30 to 16:00 New York only; a take profit set on its own also works before and after."}
      </p>
      {s && session !== "regular" && !crypto && <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{stopWaitText(session)}</p>}
      {!pairOk && <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{crypto ? "A coin takes one exit at a time at Alpaca: a stop or a take profit, not both." : "With part of a share, Alpaca takes one exit at a time: a stop or a take profit, not both."}</p>}
      {review ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2">
          <p className="text-sm text-slate-800">{words}.</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy} className="flex-1 rounded-md bg-slate-900 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{busy ? "Sending…" : "Set exits"}</button>
            <button type="button" onClick={() => setReview(false)} className="rounded-md border border-slate-300 px-3 text-sm text-slate-600">Edit</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!tradable || !(s || t) || !pairOk} onClick={() => setReview(true)}
          className="mt-2 w-full rounded-md bg-slate-900 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          Review exits
        </button>
      )}
    </div>
  );
}
