import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resumableLimit } from "../_shared/resumeLimit.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { getSpreadQuote, getLegsQuote, loadAccount, tradingBase, alpacaFetch } from "../_shared/alpaca.ts";
import { dataAccountFor } from "../_shared/marketData.ts";

// Prices a position for closing: what the legs are worth right now, plus the
// highest limit already tried on them so a retry resumes rather than restarts.
// Which limit price a retry may resume from. The rule itself is in
// _shared/resumeLimit.ts, pure and tested: it lives there because "the highest
// limit on any order that touched any of these symbols" is not the same
// sentence as "the last price tried on this structure", and the difference
// resumed a single-leg $9.89 onto a two-leg net quoted at -7.01 / -6.43.
async function lastAttemptDebit(account, symbols) {
  const orders = await alpacaFetch(
    `${tradingBase(account)}/orders?status=all&nested=true&limit=100&direction=desc`,
    account
  ).catch(() => []);
  return resumableLimit(orders as any[], symbols);
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
    const account = await loadAccount(admin, accountId, user.id, { readOnly: true });
    // Quotes through the data account (marketData.ts): the account itself,
    // or for a read-only one, the user's own Alpaca account or the house one.
    let data;
    try {
      data = await dataAccountFor(admin, account);
    } catch (e) {
      return jsonResponse({ error: (e as Error).message, unavailable: true }, 404);
    }
    const symbols = customLegs
      ? customLegs.map((l) => l.symbol)
      : [shortSymbol, longSymbol, callShortSymbol, callLongSymbol].filter(Boolean);
    const [quote, lastDebit] = await Promise.all([
      customLegs
        ? getLegsQuote(data, customLegs)
        : getSpreadQuote(data, shortSymbol, longSymbol, callShortSymbol, callLongSymbol, putRatio || 1, callRatio || 1),
      // The user's own order history, never the data account's: a read-only
      // account has none here.
      account.provider === "snaptrade" ? Promise.resolve(null) : lastAttemptDebit(account, symbols)
    ]);
    if (!quote) return jsonResponse({ error: "No quote available for these contracts" }, 404);
    // A leg with no offer is not a quote, and must not reach the ticket as one:
    // downstream, `quote?.midDebit ?? 0` would turn its absent mid into $0.00
    // and seed the limit price with it. The reason names the contract, so the
    // ticket can say why instead of going blank.
    if ((quote as any).unpriceable) {
      return jsonResponse({ error: (quote as any).unpriceable, unpriceable: true, legs: (quote as any).legs ?? null }, 404);
    }
    return jsonResponse({ ...quote, lastAttemptDebit: lastDebit });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
