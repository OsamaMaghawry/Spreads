import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, loadAccount } from '../../shared/alpaca.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, qty, orderType, limitPrice } = await req.json();
    if (!accountId || !shortSymbol || !longSymbol || !qty || !orderType) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    if (orderType === 'limit' && (limitPrice === undefined || limitPrice === null)) {
      return Response.json({ error: 'limitPrice is required for limit orders' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);

    const body = {
      order_class: 'mleg',
      qty: String(qty),
      type: orderType,
      time_in_force: 'day',
      client_order_id: `APP_CLOSE_${orderType.toUpperCase()}_${Date.now()}`,
      legs: [
        { symbol: shortSymbol, ratio_qty: '1', side: 'buy', position_intent: 'buy_to_close' },
        { symbol: longSymbol, ratio_qty: '1', side: 'sell', position_intent: 'sell_to_close' }
      ]
    };
    // Iron condor: close the call side in the same multi-leg order.
    if (callShortSymbol && callLongSymbol) {
      body.legs.push(
        { symbol: callShortSymbol, ratio_qty: '1', side: 'buy', position_intent: 'buy_to_close' },
        { symbol: callLongSymbol, ratio_qty: '1', side: 'sell', position_intent: 'sell_to_close' }
      );
    }
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