import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getSpreadQuote, getLegsQuote, loadAccount, tradingBase, alpacaFetch } from '../../shared/alpaca.ts';

// Highest limit price we already tried on this spread (from Alpaca order history),
// so a retry can resume from where the last attempt left off.
async function lastAttemptDebit(account, symbols) {
  const orders = await alpacaFetch(
    `${tradingBase(account)}/orders?status=all&nested=true&limit=100&direction=desc`,
    account
  ).catch(() => []);
  if (!Array.isArray(orders)) return null;
  let best = null;
  for (const o of orders) {
    const syms = Array.isArray(o.legs) && o.legs.length ? o.legs.map((l) => l.symbol) : [o.symbol];
    if (!syms.some((sym) => symbols.includes(sym))) continue;
    const price = parseFloat(o.limit_price);
    if (!isFinite(price)) continue;
    if (o.status === 'filled') break; // position was already closed/reopened after this
    if (best === null || price > best) best = price;
  }
  return best;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio, callRatio, legs } = await req.json();
    const customLegs = Array.isArray(legs) && legs.length > 0 ? legs : null;
    if (!accountId || (!customLegs && (!shortSymbol || !longSymbol))) {
      return Response.json({ error: 'accountId, shortSymbol and longSymbol are required' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);
    const symbols = customLegs
      ? customLegs.map((l) => l.symbol)
      : [shortSymbol, longSymbol, callShortSymbol, callLongSymbol].filter(Boolean);
    const [quote, lastDebit] = await Promise.all([
      customLegs
        ? getLegsQuote(account, customLegs)
        : getSpreadQuote(account, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio || 1, callRatio || 1),
      lastAttemptDebit(account, symbols)
    ]);
    if (!quote) return Response.json({ error: 'No quote available for these contracts' }, { status: 404 });
    return Response.json({ ...quote, lastAttemptDebit: lastDebit });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}