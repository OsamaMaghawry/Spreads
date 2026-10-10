// The SnapTrade identity behind a DeltaMint user: registered once, its secret
// stored encrypted. Shared by the admin evaluation (snaptrade) and the
// user-facing read-only connection (brokerLink), so there is one way to
// register and one place the secret is decrypted.
//
// Their userSecret is issued once at registration and never shown again: lose
// it and every connection that user made is unreachable. So it is written
// encrypted, in the same envelope as every other broker credential, before the
// function returns anything at all.

import { snapFetch } from "./snaptrade.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";

export interface SnapUser {
  snapTradeUserId: string;
  userSecret: string;
  created: boolean;
}

export async function loadSnapUser(admin: any, userId: string): Promise<SnapUser | null> {
  const { data, error } = await admin
    .from("snaptrade_users")
    .select("snaptrade_user_id, user_secret")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const secret = await decryptSecret(data.user_secret);
  // A stored secret that will not decrypt is the same situation as no user at
  // all -- nothing can be signed for them -- and saying so names the fix
  // (resetUser) rather than failing later as an unexplained 401 from SnapTrade.
  if (!secret) {
    throw new Error(
      "The stored SnapTrade user secret could not be decrypted, so nothing can be signed for this user. " +
      "Run the resetUser action to delete and re-register."
    );
  }
  return { snapTradeUserId: data.snaptrade_user_id, userSecret: secret, created: false };
}

export async function ensureSnapUser(
  admin: any,
  userId: string
): Promise<{ user: SnapUser | null; error: string | null }> {
  const existing = await loadSnapUser(admin, userId);
  if (existing) return { user: existing, error: null };

  // Their user id must be unique and immutable, so it is our uuid and nothing
  // else -- an email would change, and a changed id orphans every connection.
  const res = await snapFetch<{ userId?: string; userSecret?: string }>({
    path: "/snapTrade/registerUser",
    method: "POST",
    body: { userId }
  });
  if (!res.ok) {
    return {
      user: null,
      error:
        `SnapTrade would not register this user (${res.status}): ${res.error}. ` +
        `If it says the user already exists, a previous attempt registered them and the secret was not stored; ` +
        `run the "resetUser" action to delete and re-register.`
    };
  }
  const secret = res.data?.userSecret;
  if (!secret) {
    return { user: null, error: "SnapTrade registered the user but returned no userSecret, so nothing could be stored." };
  }

  const { error } = await admin.from("snaptrade_users").insert({
    user_id: userId,
    snaptrade_user_id: String(res.data?.userId || userId),
    user_secret: await encryptSecret(secret)
  });
  if (error) throw new Error(error.message);

  return { user: { snapTradeUserId: String(res.data?.userId || userId), userSecret: secret, created: true }, error: null };
}

