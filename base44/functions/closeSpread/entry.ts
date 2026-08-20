import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, loadAccount } from '../../shared/alpaca.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio, callRatio, qty, orderType, limitPrice, legs } = await req.json();
    const customLegs = Array.isArray(legs) && legs.length > 0 ? legs : null;
    if (!accountId || !qty || !orderType || (!customLegs && (!shortSymbol || !longSymbol))) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    if (orderType === 'limit' && (limitPrice === undefined || limitPrice === null)) {
      return Response.json({ error: 'limitPrice is required for limit orders' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);

    // Closing a specific subset of legs (or a single leg) rather than the whole structure.
    if (customLegs) {
      const clientId = `APP_CLOSE_${orderType.toUpperCase()}_${Date.now()}`;
      let legBody;
      if (customLegs.length === 1) {
        const l = customLegs[0];
        const isBuy = (l.action || 'buy_to_close') === 'buy_to_close';
        legBody = {
          symbol: l.symbol,
          qty: String(qty * (l.ratio || 1)),
          side: isBuy ? 'buy' : 'sell',
          position_intent: isBuy ? 'buy_to_close' : 'sell_to_close',
          type: orderType,
          time_in_force: 'day',
          client_order_id: clientId
        };
      } else {
        legBody = {
          order_class: 'mleg',
          qty: String(qty),
          type: orderType,
          time_in_force: 'day',
          client_order_id: clientId,
          legs: customLegs.map((l) => {
            const isBuy = (l.action || 'buy_to_close') === 'buy_to_close';
            return {
              symbol: l.symbol,
              ratio_qty: String(l.ratio || 1),
              side: isBuy ? 'buy' : 'sell',
              position_intent: isBuy ? 'buy_to_close' : 'sell_to_close'
            };
          })
        };
      }
      if (orderType === 'limit') {
        legBody.limit_price = String(Math.round(limitPrice * 100) / 100);
      }
      const legOrder = await alpacaFetch(`${tradingBase(account)}/orders`, account, {
        method: 'POST',
        body: JSON.stringify(legBody)
      });
      return Response.json({ orderId: legOrder.id, status: legOrder.status });
    }

    const body = {
      order_class: 'mleg',
      qty: String(qty),
      type: orderType,
      time_in_force: 'day',
      client_order_id: `APP_CLOSE_${orderType.toUpperCase()}_${Date.now()}`,
      legs: [
        { symbol: shortSymbol, ratio_qty: String(putRatio || 1), side: 'buy', position_intent: 'buy_to_close' },
        { symbol: longSymbol, ratio_qty: String(putRatio || 1), side: 'sell', position_intent: 'sell_to_close' }
      ]
    };
    // Iron condor: close the call side in the same multi-leg order.
    // Ratios support unbalanced condors (e.g. 2 put spreads : 1 call spread per unit).
    if (callShortSymbol && callLongSymbol) {
      body.legs.push(
        { symbol: callShortSymbol, ratio_qty: String(callRatio || 1), side: 'buy', position_intent: 'buy_to_close' },
        { symbol: callLongSymbol, ratio_qty: String(callRatio || 1), side: 'sell', position_intent: 'sell_to_close' }
      );
    }
    if (orderType === 'limit') {
      // Alpaca multi-leg: positive = net debit paid, negative = net credit received.
      // Closing normally pays a debit; keep the sign the caller intends.
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