// Where a read-only account's market data comes from.
//
// An account read through SnapTrade has positions and history but no quotes:
// SnapTrade retired option quotes on 1 Oct 2026 and has no option chain, and
// Robinhood has no API of its own. So the Scanner, the Option chain and the
// leg quotes for such an account read prices through an Alpaca account:
//
//   1. the same user's own directly connected Alpaca account, when they have
//      one -- their data, their entitlement;
//   2. otherwise the house account named in app_settings (HOUSE_DATA_ACCOUNT),
//      the owner's, for the staging friends test only.
//
// THE RULE THAT MAKES (2) SAFE: the account returned here is handed only to
// market-data calls -- quotes, snapshots, option contracts, bars. Nothing that
// reads an account's own state (positions, balances, orders, history) may be
// given it. The covered-call search reads the user's OWN shares, from their own
// account (heldShares), and is passed the data account only for prices.
//
// Absent the setting, a user with no Alpaca account of their own gets a plain
// "not available" -- which is production's state, where the setting does not
// exist and no account is a SnapTrade one.

import { decryptSecret } from "./crypto.ts";
import { readSettings } from "./settings.ts";

const decrypted = async (a: any) => ({
  ...a,
  api_key: await decryptSecret(a.api_key),
  api_secret: await decryptSecret(a.api_secret),
  oauth_access_token: await decryptSecret(a.oauth_access_token)
});

// The house account, credentials decrypted, or null when none is configured.
export async function houseDataAccount(admin: any) {
  const id = (await readSettings(admin)).houseDataAccountId;
  if (!id) return null;
  const { data, error } = await admin.from("trading_accounts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !(data.oauth_access_token || data.api_key)) return null;
  return decrypted(data);
}

// The account to read MARKET DATA through for `account`. An Alpaca account is
// its own source; a SnapTrade one borrows, per the order above.
export async function dataAccountFor(admin: any, account: any) {
  if (account?.provider !== "snaptrade") return account;
  const { data, error } = await admin
    .from("trading_accounts")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("provider", "alpaca")
    .or("oauth_access_token.not.is.null,api_key.not.is.null")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  if (data?.[0]) return decrypted(data[0]);
  const house = await houseDataAccount(admin);
  if (house) return house;
  throw new Error("Live prices are not available for a read-only account yet.");
}
