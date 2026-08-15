import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, parseOCCSymbol, loadAccount } from '../../shared/alpaca.ts';

// Reconstruct closed option trades per strategy. Strategy comes from the Alpaca
// client order id prefix configured on the account (spreads vs wheel), so wheel
// cash-secured puts are never mis-paired into spreads.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, sync = false } = await req.json();
    if (!accountId) return Response.json({ error: 'accountId is required' }, { status: 400 });
    const account = await loadAccount(base44, accountId);
    const base = tradingBase(account);

    const accountInfo = {
      id: account.id, name: account.name, is_paper: account.is_paper,
      spreads_client_prefix: (account.spreads_client_prefix || '').trim(),
      wheel_client_prefix: (account.wheel_client_prefix || '').trim()
    };

    // Read-only mode: serve stored trades without touching Alpaca.
    if (!sync) {
      const stored = await base44.asServiceRole.entities.TradeRecord.filter({ account_id: accountId }, '-close_date');
      return Response.json({ account: accountInfo, trades: stored, fromCache: true });
    }

    const spreadsPrefix = (account.spreads_client_prefix || '').trim();
    const wheelPrefix = (account.wheel_client_prefix || '').trim();
    const strategyOf = (clientOrderId) => {
      const c = clientOrderId || '';
      if (spreadsPrefix && c.startsWith(spreadsPrefix)) return 'spreads';
      if (wheelPrefix && c.startsWith(wheelPrefix)) return 'wheel';
      return 'unknown';
    };

    // 1. Closed orders (newest first) -> strategy per order id, including mleg legs.
    const orderStrategy = {};
    let until = null;
    for (let i = 0; i < 12; i++) {
      const url = `${base}/orders?status=closed&limit=500&direction=desc&nested=true` +
        (until ? `&until=${encodeURIComponent(until)}` : '');
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      page.forEach((o) => {
        const strat = strategyOf(o.client_order_id);
        orderStrategy[o.id] = strat;
        (o.legs || []).forEach((l) => { orderStrategy[l.id] = strat; });
      });
      until = page[page.length - 1].submitted_at;
      if (page.length < 500) break;
    }

    // 2. Fill + expiration activities (newest first).
    let activities = [];
    let pageToken = null;
    for (let i = 0; i < 20; i++) {
      const url = `${base}/account/activities?activity_types=FILL,OPEXP&direction=desc&page_size=100` +
        (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '');
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      activities = activities.concat(page);
      if (page.length < 100) break;
      pageToken = page[page.length - 1].id;
    }

    // 3. Group put-option events per symbol.
    const bySymbol = {};
    activities.forEach((a) => {
      const parsed = a.symbol ? parseOCCSymbol(a.symbol) : null;
      if (!parsed || parsed.type !== 'P') return;
      (bySymbol[a.symbol] = bySymbol[a.symbol] || []).push(a);
    });

    // 4. Reconstruct closed lots per symbol (FIFO), carrying the opening strategy.
    const closedLots = [];
    Object.keys(bySymbol).forEach((symbol) => {
      const parsed = parseOCCSymbol(symbol);
      const events = bySymbol[symbol].slice().sort((x, y) => {
        const tx = x.transaction_time || (x.date ? x.date + 'T23:59:59Z' : '');
        const ty = y.transaction_time || (y.date ? y.date + 'T23:59:59Z' : '');
        return tx.localeCompare(ty);
      });
      let position = 0;
      let openLots = [];
      const push = (lot, closePrice, closeDate, expired) => closedLots.push({
        symbol, parsed, qty: lot.qty, openPrice: lot.price, closePrice,
        openDate: lot.date, closeDate, short: lot.short, expired, strategy: lot.strategy
      });
      events.forEach((a) => {
        if (a.activity_type === 'OPEXP') {
          openLots.forEach((lot) => push(lot, 0, a.date, true));
          openLots = [];
          position = 0;
          return;
        }
        const qty = Math.abs(parseFloat(a.qty));
        const price = parseFloat(a.price);
        const date = (a.transaction_time || '').substring(0, 10);
        const delta = a.side === 'buy' ? qty : -qty;
        const strategy = orderStrategy[a.order_id] || 'unknown';
        if (position === 0 || (delta > 0) === (position > 0)) {
          openLots.push({ qty, price, date, short: delta < 0, strategy });
          position += delta;
        } else {
          let remaining = qty;
          while (remaining > 0 && openLots.length > 0) {
            const lot = openLots[0];
            const q = Math.min(lot.qty, remaining);
            push({ ...lot, qty: q }, price, date, false);
            lot.qty -= q;
            remaining -= q;
            position += lot.short ? q : -q;
            if (lot.qty === 0) openLots.shift();
          }
          if (remaining > 0) {
            openLots.push({ qty: remaining, price, date, short: delta < 0, strategy });
            position += delta > 0 ? remaining : -remaining;
          }
        }
      });
    });

    // 5. Build trades: pair spreads within the same strategy; wheel/unpaired stay single-leg.
    // Orders placed without a configured prefix ('unknown') are resolved by shape:
    // legs that pair into a vertical are spreads, leftover single legs are wheel puts.
    const trades = [];
    const single = (l) => trades.push({
      account_id: accountId,
      strategy: l.strategy === 'unknown' ? 'wheel' : l.strategy,
      ticker: l.parsed.ticker,
      expiry: l.parsed.expiryFormatted,
      short_symbol: l.symbol,
      long_symbol: '',
      short_strike: l.parsed.strike,
      long_strike: 0,
      qty: l.qty,
      open_date: l.openDate,
      close_date: l.closeDate,
      short_entry: l.openPrice,
      long_entry: 0,
      short_exit: l.closePrice,
      long_exit: 0,
      close_reason: l.expired ? 'expired' : 'closed'
    });

    ['spreads', 'wheel', 'unknown'].forEach((strategy) => {
      const lots = closedLots.filter((l) => l.strategy === strategy);
      const shorts = lots.filter((l) => l.short).map((l) => ({ ...l, left: l.qty }));
      const longs = lots.filter((l) => !l.short).map((l) => ({ ...l, left: l.qty }));
      const pairSpreads = strategy !== 'wheel';
      shorts.forEach((s) => {
        if (pairSpreads) {
          longs.forEach((l) => {
            if (s.left <= 0 || l.left <= 0) return;
            if (l.parsed.ticker !== s.parsed.ticker || l.parsed.expiry !== s.parsed.expiry) return;
            if (l.parsed.strike >= s.parsed.strike || l.closeDate !== s.closeDate) return;
            const q = Math.min(s.left, l.left);
            trades.push({
              account_id: accountId,
              strategy: strategy === 'unknown' ? 'spreads' : strategy,
              ticker: s.parsed.ticker,
              expiry: s.parsed.expiryFormatted,
              short_symbol: s.symbol,
              long_symbol: l.symbol,
              short_strike: s.parsed.strike,
              long_strike: l.parsed.strike,
              qty: q,
              open_date: s.openDate < l.openDate ? s.openDate : l.openDate,
              close_date: s.closeDate,
              short_entry: s.openPrice,
              long_entry: l.openPrice,
              short_exit: s.closePrice,
              long_exit: l.closePrice,
              close_reason: s.expired && l.expired ? 'expired' : 'closed'
            });
            s.left -= q;
            l.left -= q;
          });
        }
        if (s.left > 0) single({ ...s, qty: s.left });
      });
    });

    // 6. Merge identical spread/leg closes on the same day (weighted averages).
    const merged = {};
    trades.forEach((t) => {
      const key = `${t.strategy}|${t.short_symbol}|${t.long_symbol}|${t.close_date}`;
      const m = merged[key];
      if (!m) {
        merged[key] = { ...t, trade_key: key };
      } else {
        const tot = m.qty + t.qty;
        ['short_entry', 'long_entry', 'short_exit', 'long_exit'].forEach((f) => {
          m[f] = (m[f] * m.qty + t[f] * t.qty) / tot;
        });
        m.qty = tot;
        m.open_date = m.open_date < t.open_date ? m.open_date : t.open_date;
        if (t.close_reason === 'closed') m.close_reason = 'closed';
      }
    });
    const records = Object.values(merged).map((t) => {
      const netCredit = t.short_entry - t.long_entry;
      const closeDebit = t.short_exit - t.long_exit;
      return { ...t, net_credit: netCredit, close_debit: closeDebit,
        realized_pl: (netCredit - closeDebit) * t.qty * 100 };
    });

    // 7. Reconcile stored records with what Alpaca reports.
    const existing = await base44.asServiceRole.entities.TradeRecord.filter({ account_id: accountId });
    const existingByKey = {};
    existing.forEach((r) => { existingByKey[r.trade_key] = r; });
    const freshKeys = new Set(records.map((r) => r.trade_key));
    const oldestClose = records.reduce((m, r) => (r.close_date && r.close_date < m ? r.close_date : m), '9999-99-99');

    const toCreate = records.filter((r) => !existingByKey[r.trade_key]);
    const toUpdate = records
      .filter((r) => {
        const e = existingByKey[r.trade_key];
        return e && (e.qty !== r.qty || e.strategy !== r.strategy || e.realized_pl !== r.realized_pl);
      })
      .map((r) => ({ id: existingByKey[r.trade_key].id, ...r }));
    // Drop stale rows inside the window we just recomputed (e.g. previously mis-paired trades).
    const stale = existing.filter((r) => !freshKeys.has(r.trade_key) && (r.close_date || '') >= oldestClose);

    for (const r of stale) await base44.asServiceRole.entities.TradeRecord.delete(r.id);
    if (toCreate.length > 0) await base44.asServiceRole.entities.TradeRecord.bulkCreate(toCreate);
    if (toUpdate.length > 0) await base44.asServiceRole.entities.TradeRecord.bulkUpdate(toUpdate);

    const all = await base44.asServiceRole.entities.TradeRecord.filter({ account_id: accountId }, '-close_date');
    return Response.json({
      account: accountInfo,
      trades: all,
      stats: { created: toCreate.length, updated: toUpdate.length, removed: stale.length },
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}