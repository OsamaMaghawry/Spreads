import { supabase } from "@/lib/supabaseClient";

// Saved scan parameters — named presets plus the last-used set per scanner.
// Both tables are RLS-scoped to auth.uid(), so every query here is implicitly
// the signed-in user's own rows; no user_id filter is needed or wanted.

// Which scanner a preset belongs to. The screener sweeps a universe, the
// open-position dialog takes an explicit ticker list — different config shapes,
// so presets never cross between them.
export const SCOPE = { SCREENER: "screener", OPEN: "open" };

export async function listPresets(scope) {
  const { data, error } = await supabase
    .from("scan_presets")
    .select("id, name, strategy, config, updated_at")
    .eq("scope", scope)
    .order("name");
  if (error) throw new Error(error.message);
  return data || [];
}

// Upsert on (user_id, scope, name): saving under a name that already exists
// replaces it, which is what "save" means to someone re-tuning a preset.
export async function savePreset(scope, name, strategy, config) {
  const { data, error } = await supabase
    .from("scan_presets")
    .upsert(
      { scope, name: name.trim(), strategy, config, updated_at: new Date().toISOString() },
      { onConflict: "user_id,scope,name" }
    )
    .select("id, name, strategy, config, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePreset(id) {
  const { error } = await supabase.from("scan_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadLastUsed(scope) {
  const { data, error } = await supabase
    .from("scan_last_used")
    .select("strategy, config, updated_at")
    .eq("scope", scope)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Called on every scan. Deliberately fire-and-forget at the call site: failing
// to record what was scanned must never stop the scan itself.
export async function saveLastUsed(scope, strategy, config) {
  const { error } = await supabase
    .from("scan_last_used")
    .upsert({ scope, strategy, config, updated_at: new Date().toISOString() }, { onConflict: "user_id,scope" });
  if (error) throw new Error(error.message);
}
