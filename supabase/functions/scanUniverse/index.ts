// Which tickers are worth scanning, out of the whole market.
//
// The screener's expensive pass -- one option chain per ticker -- is unchanged.
// This is the cheap pass in front of it: the list of names, one snapshot
// request per hundred, and a sieve on price, volume, quote width and capital
// per contract. It returns TICKERS, not candidates, so the existing client
// batching and its progress bar run over the survivors exactly as they run over
// the S&P 500 today. Nothing about how a setup is priced or judged moves.
//
// Splitting it this way is what makes "scan everything" possible at all:
// eleven thousand chains is minutes of requests and mostly unusable answers,
// while eleven thousand snapshots is a couple of hundred requests and cuts the
// list to something a chain scan can finish.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { tradingBase, alpacaFetch, loadAccount } from "../_shared/alpaca.ts";
import { screenUniverse, tradableEquities } from "../_shared/universe.ts";

// Snapshots take a symbol list in the query string, so the batch is bounded by
// URL length rather than by a documented limit. A hundred is comfortably inside
// it and is what getSpots already uses.
const BATCH = 100;
// A ceiling on what one call will fetch snapshots for. Without it a bad filter
// combination asks for a hundred and forty requests and times out the function;
// with it the answer is complete or it says it was truncated.
const MAX_SNAPSHOT_SYMBOLS = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, filters = {} } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ error: "accountId is required" }, 400);

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);
    const base = tradingBase(account);

    // The whole listed equity universe, once. Alpaca returns it in a single
    // response; there is no pagination on this endpoint.
    const assets = await alpacaFetch(`${base}/assets?status=active&asset_class=us_equity`, account);
    let symbols = tradableEquities(Array.isArray(assets) ? assets : []);
    const listed = symbols.length;

    // Capital-per-contract is measured against the account, so the account's
    // own equity is read here rather than trusted from the request body.
    let equity = Number(filters.equity) || null;
    if (filters.maxCapitalPct != null && !equity) {
      const info = await alpacaFetch(`${base}/account`, account).catch(() => null);
      equity = info ? Number(info.equity) || null : null;
    }

    const truncated = symbols.length > MAX_SNAPSHOT_SYMBOLS;
    if (truncated) symbols = symbols.slice(0, MAX_SNAPSHOT_SYMBOLS);

    // Snapshots for everything, in batches. A failed batch drops those names
    // rather than the whole scan -- and they are counted, so a partial answer
    // is never presented as a complete one.
    const snapshots: Record<string, any> = {};
    let failedBatches = 0;
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i + BATCH);
      try {
        const data = await alpacaFetch(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${chunk.join(",")}`,
          account
        );
        Object.assign(snapshots, data || {});
      } catch (e) {
        failedBatches++;
        console.error("universe snapshot batch failed", chunk[0], e?.message || e);
      }
    }

    const { kept, dropped, considered } = screenUniverse(snapshots, { ...filters, equity });

    return jsonResponse({
      tickers: kept.map((k) => k.symbol),
      // Everything needed for the screen to say where the universe went, which
      // is what makes a filter trustworthy rather than mysterious.
      listed,
      considered,
      kept: kept.length,
      dropped,
      equity,
      truncated,
      incomplete: failedBatches > 0 || truncated,
      note: truncated
        ? `Only the first ${MAX_SNAPSHOT_SYMBOLS} of ${listed} listed names were priced. Narrow the filters to cover more of the market.`
        : failedBatches > 0
          ? `${failedBatches} price batches failed, so some names could not be judged and were left out.`
          : null
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
