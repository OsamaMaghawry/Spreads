import { supabase } from '@/lib/supabaseClient';

// Normalizes supabase.functions.invoke's {data, error} into the { data } shape
// call sites use throughout the app (data.error set on any failure), so edge
// function invocations read the same at every call site regardless of whether
// the function threw, returned a non-2xx status, or returned {error} at 200.
export async function invokeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
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
