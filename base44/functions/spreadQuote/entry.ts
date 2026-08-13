import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getSpreadQuote, loadAccount } from '../../shared/alpaca.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, shortSymbol, longSymbol } = await req.json();
    if (!accountId || !shortSymbol || !longSymbol) {
      return Response.json({ error: 'accountId, shortSymbol and longSymbol are required' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);
    const quote = await getSpreadQuote(account, shortSymbol, longSymbol);
    if (!quote) return Response.json({ error: 'No quote available for these contracts' }, { status: 404 });
    return Response.json(quote);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}