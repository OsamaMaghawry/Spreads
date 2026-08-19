import { supabase } from '@/lib/supabaseClient';

// Normalizes supabase.functions.invoke's {data, error} into the { data } shape
// call sites use throughout the app (data.error set on any failure), so edge
// function invocations read the same at every call site regardless of whether
// the function threw, returned a non-2xx status, or returned {error} at 200.
export async function invokeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    let message = error.message;
    if (typeof error.context?.json === 'function') {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // fall back to error.message
      }
    }
    return { data: { error: message } };
  }
  return { data };
}
