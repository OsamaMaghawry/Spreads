import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";

// Returns one account's equity and options buying power, for sizing a new order.
//
// Deliberately small: the order dialog needs a denominator to express risk as a
// share of the account, and syncAccounts — which also reports equity — walks
// positions and fill history, which is far too heavy to run behind a dialog.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId } = await req.json();
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const info = await alpacaFetch(`${tradingBase(account)}/account`, account);

    return jsonResponse({
      equity: parseFloat(info.equity) || 0,
      optionsBuyingPower: parseFloat(info.options_buying_power || info.buying_power) || 0
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
