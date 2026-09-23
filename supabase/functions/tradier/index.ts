// Tradier, probed against their sandbox before a line of it reaches a user.
//
// WHY THIS SHAPE. The SnapTrade evaluation taught the lesson the hard way:
// their documented routes answered 410, their partner endpoint contradicted
// it, and every hour spent guessing shapes from prose was an hour wasted. So
// this asks the broker what it actually returns, records it, and only then
// gets mapped into this product's own vocabulary.
//
// WHY TRADIER AT ALL. `docs/product/broker-apis.md`: they are the only broker
// besides the one we already speak to where PAPER AND LIVE ARE THE SAME API.
// Everything here is verified on paper first, and that is not negotiable for a
// second broker.
//
// NOTHING IS PLACED. The order probe uses their `preview=true`, which runs
// their full validation -- buying power, margin, cost -- and returns what the
// order WOULD do. The sandbox could not hurt anyone anyway; previewing rather
// than placing keeps that true if this is ever pointed at live by mistake.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { adminClient } from "../_shared/supabaseClients.ts";
import { isServiceRole } from "../_shared/serviceRole.ts";
import { redeemCronTicket } from "../_shared/cronTicket.ts";
import { redact } from "../_shared/snaptradeShape.ts";
import { tradierFetch, unwrap, tradierOrderForm, type TradierCall } from "../_shared/tradier.ts";

// The sandbox token and the live one are separate secrets on purpose: there is
// no flag that can be set wrongly to make a sandbox run reach a live account.
const sandboxToken = () => (Deno.env.get("TRADIER_SANDBOX_TOKEN") || "").trim();
const liveToken = () => (Deno.env.get("TRADIER_ACCESS_TOKEN") || "").trim();

interface Probe {
  name: string;
  need: string;
  method: string;
  path: string;
  ok: boolean;
  status: number;
  ms: number;
  error: string | null;
  count: number | null;
  sample: unknown;
}

async function probe(
  name: string,
  need: string,
  call: TradierCall,
  collection?: [string, string]
): Promise<Probe> {
  const res = await tradierFetch(call);
  const rows = collection && res.ok ? unwrap(res.data, collection[0], collection[1]) : null;
  return {
    name,
    need,
    method: call.method || "GET",
    path: call.path,
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    error: res.error,
    count: rows ? rows.length : null,
    // One row shows the shape; the whole list shows nothing extra and fills
    // the record. Redacted with the same rules as the other evaluation.
    sample: rows ? redact(rows[0] ?? null) : redact(res.data)
  };
}

async function runProbe(token: string) {
  const probes: Probe[] = [];
  const notes: string[] = [];
  const isPaper = true;
  const base = { token, isPaper };

  // --- who the token is -----------------------------------------------------
  const profile = await probe(
    "user profile",
    "Does the token authenticate, and which accounts does it reach?",
    { ...base, path: "/user/profile" }
  );
  probes.push(profile);

  if (!profile.ok) {
    notes.push(
      "The token did not authenticate, so nothing account-shaped could be asked. " +
      "A sandbox token is issued per Tradier account and is not the same as a live one."
    );
    return { probes, notes, accountId: null };
  }

  const profileRes = await tradierFetch({ ...base, path: "/user/profile" });
  const accounts = unwrap<Record<string, unknown>>(profileRes.data, "profile", "account");
  const accountId = accounts.length ? String(accounts[0].account_number ?? "") : null;
  if (!accountId) {
    notes.push("The token authenticated but reaches no account, so the account probes were skipped.");
    return { probes, notes, accountId: null };
  }
  notes.push(`Account-scoped probes ran against sandbox account ${accountId}.`);

  // --- the account ----------------------------------------------------------
  probes.push(await probe("balances", "Cash, buying power and margin, the way the dashboard needs them.",
    { ...base, path: `/accounts/${accountId}/balances` }));
  probes.push(await probe("positions", "Do option positions arrive, and with what identifying them?",
    { ...base, path: `/accounts/${accountId}/positions` }, ["positions", "position"]));
  probes.push(await probe("orders", "Do multi-leg orders keep their legs when read back?",
    { ...base, path: `/accounts/${accountId}/orders`, query: { includeTags: "true" } }, ["orders", "order"]));
  probes.push(await probe("account history", "Assignments, expiries and dividends as their own events.",
    { ...base, path: `/accounts/${accountId}/history`, query: { limit: 50 } }, ["history", "event"]));
  // THE ONE THIS PRODUCT CARES ABOUT MOST. Our whole trade reconstruction
  // exists because the other broker gives no closed-position record. If
  // Tradier does, a large piece of this codebase does not need to run for
  // their accounts.
  probes.push(await probe("closed positions (gain/loss)", "Is there a broker-side record of what closed and for how much?",
    { ...base, path: `/accounts/${accountId}/gainloss`, query: { limit: 50 } }, ["gainloss", "closed_position"]));

  // --- market data ----------------------------------------------------------
  probes.push(await probe("quotes", "A usable price for an underlying.",
    { ...base, path: "/markets/quotes", query: { symbols: "SPY" } }, ["quotes", "quote"]));

  const expiriesProbe = await probe("option expirations", "The expiries the scanner would walk.",
    { ...base, path: "/markets/options/expirations", query: { symbol: "SPY" } }, ["expirations", "date"]);
  probes.push(expiriesProbe);

  // --- the chain, with greeks ----------------------------------------------
  // The scanner needs a full chain with deltas. If this returns them, Tradier
  // can feed the scanner directly rather than only holding positions.
  const expiriesRes = await tradierFetch({ ...base, path: "/markets/options/expirations", query: { symbol: "SPY" } });
  const expiries = unwrap<string>(expiriesRes.data, "expirations", "date");
  const expiry = expiries.length ? String(expiries[0]) : null;

  let chainRows: Record<string, unknown>[] = [];
  if (expiry) {
    const chain = await probe("option chain with greeks", "Strikes, bids, asks and DELTA — what the scanner runs on.",
      { ...base, path: "/markets/options/chains", query: { symbol: "SPY", expiration: expiry, greeks: "true" } },
      ["options", "option"]);
    probes.push(chain);
    const chainRes = await tradierFetch({
      ...base, path: "/markets/options/chains", query: { symbol: "SPY", expiration: expiry, greeks: "true" }
    });
    chainRows = unwrap<Record<string, unknown>>(chainRes.data, "options", "option");
    const withGreeks = chainRows.filter((o) => o.greeks && typeof o.greeks === "object").length;
    notes.push(
      withGreeks
        ? `${withGreeks} of ${chainRows.length} contracts on the ${expiry} chain carry greeks, so delta comes from the broker rather than being computed here.`
        : `The ${expiry} chain returned ${chainRows.length} contracts and none carried greeks; delta would still have to be computed.`
    );
  } else {
    notes.push("No expirations came back, so the chain and the order preview were skipped.");
  }

  // --- an order, previewed and never placed --------------------------------
  // Built from two REAL contracts off the chain above rather than invented
  // symbols, so a rejection means something about the order rather than about
  // a symbol that does not exist.
  const puts = chainRows
    .filter((o) => o.option_type === "put" && Number.isFinite(Number(o.strike)))
    .sort((a, b) => Number(b.strike) - Number(a.strike));
  if (puts.length >= 2) {
    const short = puts[0];
    const long = puts[1];
    const form = tradierOrderForm({
      ticker: "SPY",
      qty: 1,
      // A credit, in OUR sign convention. The helper turns it into their
      // positive price plus `type=credit`; that translation is the single
      // most dangerous line in this integration and it has its own tests.
      limitPrice: -0.05,
      intent: "open",
      preview: true,
      legs: [
        { symbol: String(short.symbol), side: "sell", ratio: 1 },
        { symbol: String(long.symbol), side: "buy", ratio: 1 }
      ]
    });
    probes.push(await probe(
      "multi-leg order PREVIEW (nothing placed)",
      "Does a vertical spread survive their validation, and what does it say it would cost?",
      { ...base, path: `/accounts/${accountId}/orders`, method: "POST", form }
    ));
    notes.push(
      `The preview used real contracts ${short.symbol} and ${long.symbol} from the ${expiry} chain. ` +
      "`preview=true` runs their validation and places nothing."
    );
  } else if (expiry) {
    notes.push("The chain returned fewer than two puts, so no spread could be previewed.");
  }

  return { probes, notes, accountId };
}


// UNFINISHED WORK REFUSES ON ITS OWN, rather than trusting the client.
//
// The browser hides this behind VITE_LAB (src/lib/lab.js), but a flag in a
// bundle is a claim the browser makes -- anyone can call this function
// directly. So the refusal lives here too, and it keys off the credentials the
// work actually needs: staging has them set, production does not, so this
// fails closed in production with no flag to set and nothing to forget. When
// the integration is finished and production is given credentials on purpose,
// this guard stops applying by itself.
const tradierEnabled = () =>
  ["TRADIER_SANDBOX_TOKEN", "TRADIER_ACCESS_TOKEN"].some((k) => (Deno.env.get(k) || "").trim() !== "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!tradierEnabled()) return jsonResponse({ error: "Tradier is not enabled in this environment." }, 404);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "status");

  // Same two doors as the SnapTrade evaluation, and the same reason: the
  // platform can prove a deploy works without a browser, an administrator
  // does everything else. See _shared/cronTicket.ts for why the ticket exists.
  const platform =
    isServiceRole(req) || (await redeemCronTicket(adminClient(), body?.ticket, "tradier"));
  if (!platform) {
    const gate = await requireAdmin(req);
    if (gate.response) return gate.response;
  }

  try {
    const token = sandboxToken();

    if (action === "status") {
      return jsonResponse({
        sandboxConfigured: Boolean(token),
        liveConfigured: Boolean(liveToken()),
        message: token
          ? "Sandbox token is set. Run the probe."
          : "TRADIER_SANDBOX_TOKEN is not set on this project. Create a Tradier account, " +
            "take the SANDBOX access token from their developer dashboard, and add it under " +
            "Edge Functions → Secrets."
      });
    }

    if (action === "probe") {
      if (!token) {
        return jsonResponse({
          error:
            "TRADIER_SANDBOX_TOKEN is not set on this project. Add it under Edge Functions → Secrets; " +
            "it is never sent anywhere else."
        }, 400);
      }
      const report = { ranAt: new Date().toISOString(), environment: "sandbox", ...(await runProbe(token)) };
      const { error } = await adminClient().from("broker_probes").insert({ broker: "tradier", report });
      if (error) console.error(`tradier: probe not recorded: ${error.message}`);
      return jsonResponse(report);
    }

    return jsonResponse({ error: `Unknown action "${action}".` }, 400);
  } catch (error) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
});
