import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { loadAccount } from '../../shared/alpaca.ts';
import { findSetup } from '../../shared/optionScan.ts';

// Scans the live chain and returns the delta-targeted setup for one strategy.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { accountId, ticker, strategy } = body;
    if (!accountId || !ticker || !strategy) {
      return Response.json({ error: 'accountId, ticker and strategy are required' }, { status: 400 });
    }
    if (!['put_spread', 'call_spread', 'iron_condor'].includes(strategy)) {
      return Response.json({ error: 'Unsupported strategy' }, { status: 400 });
    }

    const account = await loadAccount(base44, accountId);
    const result = await findSetup(account, { ...body, ticker: ticker.trim().toUpperCase() });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}