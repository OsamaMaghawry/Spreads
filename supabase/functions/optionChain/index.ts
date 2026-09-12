import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabaseClients.ts";
import { loadAccount, alpacaFetch, tradingBase } from "../_shared/alpaca.ts";
import { getSpot } from "../_shared/marketPrice.ts";
import { chainLadder, atTheMoneyIndex } from "../_shared/optionChain.ts";
import { heldShares } from "../_shared/heldShares.ts";

// The option chain for one underlying, as a ladder.
//
// All the I/O; the shaping is in _shared/optionChain.ts where it is tested.
//
// ONE SNAPSHOT REQUEST, not the contracts-then-quotes pair the scanner walks.
// `/v1beta1/options/snapshots/{underlying}` returns quote, greeks, implied
// volatility and the day's bar for every contract in one call. The contracts
// endpoint is still read, but only for the expiry list and for OPEN INTEREST,
// which is the one column the snapshot does not carry and half the reason a
// chain gets read.
//
// The shares held and their adjusted basis travel with the response because a
// covered call is only covered against a real holding — the ticket needs to
// know before it can say what the position risks, and the alternative is a
// second round trip from the browser at the moment somebody clicks a strike.

const PAGE_LIMIT = 1000;

// Alpaca pages the snapshot endpoint. A chain with a hundred strikes and two
// sides is comfortably past one page on a liquid name.
async function fetchSnapshots(account, ticker: string, expiry: string) {
  const out: Record<string, any> = {};
  let token: string | null = null;
  do {
    const url =
      `https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(ticker)}` +
      `?expiration_date=${expiry}&limit=${PAGE_LIMIT}` +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    Object.assign(out, page?.snapshots || {});
    token = page?.next_page_token || null;
  } while (token);
  return out;
}

// Contracts for the expiry, for open interest. Paged for the same reason.
async function fetchContracts(account, ticker: string, expiry: string) {
  const oi: Record<string, number> = {};
  let token: string | null = null;
  do {
    const url =
      `${tradingBase(account)}/options/contracts?underlying_symbols=${encodeURIComponent(ticker)}` +
      `&expiration_date=${expiry}&status=active&limit=${PAGE_LIMIT}` +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account).catch((e) => {
      // Open interest is a column, not the chain. Losing it must not lose the
      // ladder — the rows simply render "—" for OI.
      console.error("contracts fetch failed", ticker, expiry, e?.message || e);
      return null;
    });
    if (!page) break;
    for (const c of page.option_contracts || []) {
      const n = Number(c?.open_interest);
      if (c?.symbol && Number.isFinite(n)) oi[c.symbol] = n;
    }
    token = page.next_page_token || null;
  } while (token);
  return oi;
}

// Every expiry with a listed contract, soonest first. Unbounded on purpose:
// a chain screen offers what the broker lists, and clamping it to a DTE window
// is the scanner's job, not this one's.
async function fetchExpiries(account, ticker: string) {
  const seen = new Set<string>();
  let token: string | null = null;
  do {
    const url =
      `${tradingBase(account)}/options/contracts?underlying_symbols=${encodeURIComponent(ticker)}` +
      `&status=active&limit=${PAGE_LIMIT}` +
      (token ? `&page_token=${encodeURIComponent(token)}` : "");
    const page = await alpacaFetch(url, account);
    for (const c of page?.option_contracts || []) {
      if (c?.expiration_date) seen.add(c.expiration_date);
    }
    token = page?.next_page_token || null;
  } while (token);
  return [...seen].sort();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { accountId, ticker, expiry } = await req.json();
    if (!accountId || !ticker) {
      return jsonResponse({ error: "accountId and ticker are required" }, 400);
    }

    const symbol = String(ticker).toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9.]{0,5}$/.test(symbol)) {
      return jsonResponse({ error: `${ticker} is not a symbol.` }, 400);
    }

    const admin = adminClient();
    const account = await loadAccount(admin, accountId, user.id);

    const expiries = await fetchExpiries(account, symbol);
    if (!expiries.length) {
      return jsonResponse({ error: `No listed options for ${symbol}.` }, 404);
    }
    // Default to the nearest expiry that has not passed.
    const today = new Date().toISOString().slice(0, 10);
    const chosen = expiry && expiries.includes(expiry)
      ? expiry
      : expiries.find((d) => d >= today) || expiries[0];

    const [spot, snapshots, oi] = await Promise.all([
      getSpot(account, symbol),
      fetchSnapshots(account, symbol, chosen),
      fetchContracts(account, symbol, chosen)
    ]);

    const ladder = chainLadder(snapshots, spot?.price ?? null, oi);

    // What the account holds of the underlying, and what those shares cost.
    // Only so the ticket can tell a covered call from a naked one before the
    // user commits to it; `openPosition`'s preflight checks it again at the
    // order, which is the check that actually binds.
    let shares = 0;
    let basis: number | null = null;
    let basisSource: string | null = null;
    try {
      // `heldShares` is the ONE allocator the scanner and the entry finder
      // already share, and it resolves the wheel's adjusted basis itself,
      // falling back to the broker's average entry price and labelling which.
      // Recomputing that here would be a second answer to a question this
      // product has already settled once.
      const held = await heldShares(admin, account);
      shares = Number(held?.shares?.[symbol] ?? 0) || 0;
      const b = held?.basis?.[symbol];
      if (b && Number(b.basis) > 0) {
        basis = Number(b.basis);
        basisSource = b.source === "broker" ? "broker" : "adjusted";
      }
    } catch (e) {
      // A missing basis makes a covered call unpriceable and the ticket says
      // so. It must not take the whole chain down.
      console.error("held shares/basis failed", symbol, e?.message || e);
    }

    return jsonResponse({
      ticker: symbol,
      expiry: chosen,
      expiries,
      spot: spot?.price ?? null,
      spotSource: spot?.source ?? null,
      spotAsOf: spot?.asOf ?? null,
      spotTrusted: !!spot?.trusted,
      spotReason: spot?.reason ?? null,
      ladder,
      atTheMoney: atTheMoneyIndex(ladder, spot?.price ?? null),
      shares,
      basis,
      basisSource
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
