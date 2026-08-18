import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, loadAccount } from '../../shared/alpaca.ts';

// Submits the opening multi-leg credit order (sell to open the shorts, buy the wings).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, legs, qty, orderType = 'limit', limitPrice } = await req.json();
    if (!accountId || !Array.isArray(legs) || legs.length < 2 || !qty) {
      return Response.json({ error: 'accountId, legs and qty are required' }, { status: 400 });
    }
    if (orderType === 'limit' && (limitPrice === undefined || limitPrice === null)) {
      return Response.json({ error: 'limitPrice is required for limit orders' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);
    const prefix = (account.spreads_client_prefix || 'APP_OPEN').trim();

    const body = {
      order_class: 'mleg',
      qty: String(qty),
      type: orderType,
      time_in_force: 'day',
      client_order_id: `${prefix}_OPEN_${Date.now()}`,
      legs: legs.map((l) => ({
        symbol: l.symbol,
        ratio_qty: String(l.ratio || 1),
        side: l.side,
        position_intent: l.side === 'sell' ? 'sell_to_open' : 'buy_to_open'
      }))
    };
    if (orderType === 'limit') {
      body.limit_price = String(Math.round(limitPrice * 100) / 100);
    }

    const order = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    return Response.json({ orderId: order.id, status: order.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}