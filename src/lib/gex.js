// The gamma exposure math lives with the server's shared code
// (supabase/functions/_shared/gex.js) so the Gamma page and the Claude
// connector work out the same numbers from the same lines.
export * from "../../supabase/functions/_shared/gex.js";
