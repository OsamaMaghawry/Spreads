import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, parseOCCSymbol, loadAccount } from '../../shared/alpaca.ts';

// Fetch fill + expiration activities for put options, reconstruct closed round
// trips per leg, pair them into closed put credit spreads, persist new ones.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId } = await req.json();
    if (!accountId) return Response.json({ error: 'accountId is required' }, { status: 400 });
    const account = await loadAccount(base44, accountId);
    const base = tradingBase(account);

    // 1. Pull activities (oldest first), paginated.
    let activities = [];
    let pageToken = null;
    for (let i = 0; i < 10; i++) {
      const url = `${base}/account/activities?activity_types=FILL,OPEXP&direction=asc&page_size=100` +
        (pageToken ? `&page_token=${pageToken}` : '');
      const page = await alpacaFetch(url, account);
      if (!Array.isArray(page) || page.length === 0) break;
      activities = activities.concat(page);
      if (page.length < 100) break;
      pageToken = page[page.length - 1].id;
    }

    // 2. Group put-option events per symbol.
    const bySymbol = {};
    activities.forEach((a) => {
      const parsed = a.symbol ? parseOCCSymbol(a.symbol) : null;
      if (!parsed || parsed.type !== 'P') return;
      if (!bySymbol[a.symbol]) bySymbol[a.symbol] = [];
      bySymbol[a.symbol].push(a);
    });

    // 3. Reconstruct closed lots per symbol (FIFO).
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
      events.forEach((a) => {
        if (a.activity_type === 'OPEXP') {
          openLots.forEach((lot) => {
            closedLots.push({ symbol, parsed, qty: lot.qty, openPrice: lot.price, closePrice: 0,
              openDate: lot.date, closeDate: a.date, short: lot.short, expired: true });
          });
          openLots = [];
          position = 0;
          return;
        }
        const qty = Math.abs(parseFloat(a.qty));
        const price = parseFloat(a.price);
        const date = (a.transaction_time || '').substring(0, 10);
        const delta = a.side === 'buy' ? qty : -qty;
        if (position === 0 || (delta > 0) === (position > 0)) {
          openLots.push({ qty, price, date, short: delta < 0 });
          position += delta;
        } else {
          let remaining = qty;
          while (remaining > 0 && openLots.length > 0) {
            const lot = openLots[0];
            const q = Math.min(lot.qty, remaining);
            closedLots.push({ symbol, parsed, qty: q, openPrice: lot.price, closePrice: price,
              openDate: lot.date, closeDate: date, short: lot.short, expired: false });
            lot.qty -= q;
            remaining -= q;
            position += lot.short ? q : -q;
            if (lot.qty === 0) openLots.shift();
          }
          if (remaining > 0) {
            openLots.push({ qty: remaining, price, date, short: delta < 0 });
            position += delta > 0 ? remaining : -remaining;
          }
        }
      });
    });

    // 4. Pair closed short lots with closed long lots (same ticker+expiry+close date, lower strike).
    const shorts = closedLots.filter((l) => l.short);
    const longs = closedLots.filter((l) => !l.short).map((l) => ({ ...l, left: l.qty }));
    const trades = [];
    shorts.forEach((s) => {
      let remaining = s.qty;
      longs.forEach((l) => {
        if (remaining <= 0 || l.left <= 0) return;
        if (l.parsed.ticker !== s.parsed.ticker || l.parsed.expiry !== s.parsed.expiry) return;
        if (l.parsed.strike >= s.parsed.strike || l.closeDate !== s.closeDate) return;
        const q = Math.min(remaining, l.left);
        trades.push({
          account_id: accountId,
          ticker: s.parsed.ticker,
          expiry: s.parsed.expiryFormatted,
          short_symbol: s.symbol,
          long_symbol: l.symbol,
          short_strike: s.parsed.strike,
          long_strike: l.parsed.strike,
          qty: q,
          open_date: s.openDate,
          close_date: s.closeDate,
          short_entry: s.openPrice,
          long_entry: l.openPrice,
          short_exit: s.closePrice,
          long_exit: l.closePrice,
          close_reason: s.expired && l.expired ? 'expired' : 'closed'
        });
        remaining -= q;
        l.left -= q;
      });
    });

    // 5. Merge same-spread same-day closes into one record (weighted averages).
    const merged = {};
    trades.forEach((t) => {
      const key = `${t.short_symbol}|${t.long_symbol}|${t.close_date}`;
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

    // 6. Upsert into TradeRecord.
    const existing = await base44.asServiceRole.entities.TradeRecord.filter({ account_id: accountId });
    const existingByKey = {};
    existing.forEach((r) => { existingByKey[r.trade_key] = r; });
    const toCreate = records.filter((r) => !existingByKey[r.trade_key]);
    const toUpdate = records
      .filter((r) => existingByKey[r.trade_key] && existingByKey[r.trade_key].qty !== r.qty)
      .map((r) => ({ id: existingByKey[r.trade_key].id, ...r }));
    if (toCreate.length > 0) await base44.asServiceRole.entities.TradeRecord.bulkCreate(toCreate);
    if (toUpdate.length > 0) await base44.asServiceRole.entities.TradeRecord.bulkUpdate(toUpdate);

    const all = await base44.asServiceRole.entities.TradeRecord.filter({ account_id: accountId }, '-close_date');
    return Response.json({
      account: { id: account.id, name: account.name, is_paper: account.is_paper },
      trades: all,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}