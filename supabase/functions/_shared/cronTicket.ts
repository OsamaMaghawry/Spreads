// Proving a request came from our own scheduler.
//
// WHAT WENT WRONG, found on staging while verifying the equity rebuild. The
// Vault row every pg_cron job reads as `service_role_key` does not hold the
// service-role key. Its JWT payload reads `"role":"anon"` -- it is the ANON
// key, which is public by design and ships in the browser bundle. So every
// scheduled job in this product has been authenticating to its own edge
// function with a credential anybody can read off the front end.
//
// It worked, which is why nobody noticed: `verify_jwt = true` asks whether the
// bearer is a valid JWT, and the anon key is one. The functions then do their
// work through `adminClient()`, which reads the real service key from the
// function's own environment. The bearer was never actually authorising
// anything.
//
// The exposure is not theoretical: `syncTrades` and `positionWatch` take an
// all-accounts job from any caller that clears verify_jwt, and the key that
// clears it is published.
//
// WHY A TICKET RATHER THAN A SHARED SECRET. The obvious repair is to put the
// real service-role key in that Vault row. That is the owner's to do -- the
// key is a password and does not belong in a session transcript -- and until
// it happens the jobs stay broken. A ticket needs no secret to be exchanged
// with anyone:
//
//   1. `mint_cron_ticket()` runs INSIDE the database, where only the scheduler
//      and the service role can reach it, and writes a single-use row.
//   2. The job passes that token in its request body.
//   3. The function redeems it through its own service-role connection.
//
// A caller holding the anon key cannot mint one: the table and the function
// are revoked from anon and authenticated. A caller replaying an intercepted
// token finds it already used, or expired five minutes after it was made.
//
// This is narrower than a shared secret, not a substitute for one. The Vault
// row should still be corrected; see docs/ops/queue.md.

type Admin = { from: (t: string) => any };

export async function redeemCronTicket(
  admin: Admin,
  token: unknown,
  purpose: string
): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  // Single statement, and the `used_at is null` predicate is the atomicity:
  // two concurrent redemptions of one token cannot both match, so the second
  // updates nothing and comes back empty rather than both being let through.
  const { data, error } = await admin
    .from("cron_tickets")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .eq("purpose", purpose)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("token");
  if (error) {
    console.error(`cronTicket: redeem failed: ${error.message}`);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}
