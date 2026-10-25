import { supabase } from '@/lib/supabaseClient';

// Normalizes supabase.functions.invoke's {data, error} into the { data } shape
// call sites use throughout the app (data.error set on any failure), so edge
// function invocations read the same at every call site regardless of whether
// the function threw, returned a non-2xx status, or returned {error} at 200.
// Where a function should run, when not near the caller. The staging
// terminal's work is mostly calls to the broker, whose servers are on the US
// east coast: measured 25 Oct, 5 to 9 ms a call from us-east-1 against 60 to
// 70 ms from us-west-1, the default for this project, and a hotkey's exit
// makes several in a row. Its settings, which only touch the database (in
// us-west-1), stay where they are. Asked for with the query parameter rather
// than the client's region option, which adds an x-region header the
// functions' CORS answer does not list.
const REGIONS = { terminal: (payload) => (payload?.action === 'prefs' ? null : 'us-east-1') };

export async function invokeFunction(name, payload) {
  const region = REGIONS[name]?.(payload);
  const target = region ? `${name}?forceFunctionRegion=${region}` : name;
  const { data, error } = await supabase.functions.invoke(target, { body: payload });
  if (error) {
    let message = error.message;
    let body = null;
    if (typeof error.context?.json === 'function') {
      try {
        body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // fall back to error.message
      }
    }
    // THE WHOLE BODY, not just its message.
    //
    // This used to return `{ error: message }` and drop everything else the
    // function had said. A non-2xx is exactly where the interesting fields
    // live: `warnings` and `needsAcknowledgement` on a 409 that wants the user
    // to decide, `upgradeRequired` on a 402, `staleSetup` on a moved market.
    // All of them were being thrown away at the one gate every call site goes
    // through, so a held order arrived looking like a flat failure -- "Error:
    // The market is closed." with no way past it, when the server had sent a
    // warning and expected the ticket to offer "Send it anyway".
    return { data: { ...(body && typeof body === 'object' ? body : {}), error: message } };
  }
  return { data };
}
