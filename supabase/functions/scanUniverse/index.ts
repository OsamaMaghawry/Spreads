// Which tickers are worth scanning, out of the whole market.
//
// The Scanner's expensive pass -- one option chain per ticker -- is unchanged.
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
// How many snapshot batches are in flight at once.
//
// THE CAP WAS NEVER THE REAL CONSTRAINT -- SEQUENCING WAS. The batches were
// fetched one after another, so 127 requests at a few hundred milliseconds
// each is most of a minute and the ceiling existed to stop that timing out.
// They are independent reads of different symbols; nothing orders them. Run
// them in waves and the whole listed market costs about as long as a sixth of
// it did.
//
// Eight rather than "all of them": a hundred and twenty-seven simultaneous
// requests is how a data provider decides you are abusive, and the point is to
// finish reliably rather than fastest.
const CONCURRENCY = 8;
// A ceiling that now sits above the whole US equity list (12,647 names on
// 22 Sep 2026) rather than a third of the way through it, so it is a guard
// against something pathological instead of a routine truncation.
//
// At 4,000 it cut the market alphabetically. The owner's run: "3,990 names
// priced · 6 passed the filters ... Only 4000 of 12647 listed names could be
// priced". Sorting by symbol and taking the first N is the worst available
// choice -- it is not a sample of the market, it is the letters A to F, and it
// excluded NVDA, TSLA, SPY and every other name a scanner exists to find.
const MAX_SNAPSHOT_SYMBOLS = 20000;

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
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += BATCH) chunks.push(symbols.slice(i, i + BATCH));

    const snapshots: Record<string, any> = {};
    let failedBatches = 0;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const wave = chunks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        wave.map((chunk) =>
          alpacaFetch(
            `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${chunk.join(",")}`,
            account
          ).catch((e) => {
            // A failed batch drops those names rather than the whole scan --
            // and is counted, so a partial answer is never presented as a
            // complete one. Promise.all would reject the whole wave on one
            // failure, so the catch is per request and inside it.
            failedBatches++;
            console.error("universe snapshot batch failed", chunk[0], e?.message || e);
            return null;
          })
        )
      );
      for (const data of results) if (data) Object.assign(snapshots, data);
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
      // THE OLD TEXT TOLD THE USER TO DO SOMETHING THAT CANNOT WORK.
      //
      // It read "Narrow the filters to cover more of the market", but the
      // truncation happens HERE, before `screenUniverse` runs -- the cap is on
      // how many names get priced, not on how many survive. No filter change
      // reaches the names that were cut, so following that advice changes
      // nothing and the user concludes the scanner is broken.
      //
      // And the cut is ALPHABETICAL, because `tradableEquities` sorts by
      // symbol and this takes the first N of that. So a truncated sweep covers
      // the start of the alphabet and silently omits the end of it -- the
      // opposite of what "scan the entire market" promises, and invisible
      // unless the message says so.
      note: truncated
        ? `Only ${MAX_SNAPSHOT_SYMBOLS} of ${listed} listed names could be priced in one pass, taken in alphabetical order — names later in the alphabet were not looked at. Filters do not change this; they are applied to the names that were priced.`
        : failedBatches > 0
          ? `${failedBatches} price batches failed, so some names could not be judged and were left out.`
          : null
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
