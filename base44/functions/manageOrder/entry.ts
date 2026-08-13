import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { tradingBase, alpacaFetch, loadAccount } from '../../shared/alpaca.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, orderId, action } = await req.json();
    if (!accountId || !orderId || !action) {
      return Response.json({ error: 'accountId, orderId and action are required' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);
    const base = tradingBase(account);

    if (action === 'cancel') {
      await alpacaFetch(`${base}/orders/${orderId}`, account, { method: 'DELETE' });
      return Response.json({ canceled: true });
    }

    const order = await alpacaFetch(`${base}/orders/${orderId}`, account);
    return Response.json({
      status: order.status,
      filledQty: order.filled_qty,
      filledAvgPrice: order.filled_avg_price
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}