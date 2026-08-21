import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { getSpreadQuote, getLegsQuote, loadAccount, tradingBase, alpacaFetch } from "../_shared/alpaca.ts";

// Highest limit price we already tried on this spread (from Alpaca order history),
// so a retry can resume from where the last attempt left off.
async function lastAttemptDebit(account, symbols) {
  const orders = await alpacaFetch(
    `${tradingBase(account)}/orders?status=all&nested=true&limit=100&direction=desc`,
    account
  ).catch(() => []);
  if (!Array.isArray(orders)) return null;
  let best = null;
  for (const o of orders as any[]) {
    const syms = Array.isArray(o.legs) && o.legs.length ? o.legs.map((l: any) => l.symbol) : [o.symbol];
    if (!syms.some((sym: string) => symbols.includes(sym))) continue;
    const price = parseFloat(o.limit_price);
    if (!isFinite(price)) continue;
    if (o.status === "filled") break; // position was already closed/reopened after this
    if (best === null || price > best) best = price;
  }
  return best;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio, callRatio, legs } = await req.json();
    const customLegs = Array.isArray(legs) && legs.length > 0 ? legs : null;
    if (!accountId || (!customLegs && (!shortSymbol || !longSymbol))) {
      return jsonResponse({ error: "accountId, shortSymbol and longSymbol are required" }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const symbols = customLegs
      ? customLegs.map((l) => l.symbol)
      : [shortSymbol, longSymbol, callShortSymbol, callLongSymbol].filter(Boolean);
    const [quote, lastDebit] = await Promise.all([
      customLegs
        ? getLegsQuote(account, customLegs)
        : getSpreadQuote(account, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio || 1, callRatio || 1),
      lastAttemptDebit(account, symbols)
    ]);
    if (!quote) return jsonResponse({ error: "No quote available for these contracts" }, 404);
    return jsonResponse({ ...quote, lastAttemptDebit: lastDebit });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
