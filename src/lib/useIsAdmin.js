import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { invokeFunction } from "@/lib/functions";

// Whether to show the admin UI to this user.
//
// This asks the server rather than deciding for itself. An earlier version
// queried `profiles.role === 'admin'` in the browser, which broke the moment
// admin could also be granted by the ADMIN_EMAILS secret: an owner's role
// column still reads 'user', so the client concluded "not an admin" and
// redirected away before the edge function — which would have granted access —
// was ever called.
//
// Restating an authorization rule in a second place is how the two drift. The
// rule lives in supabase/functions/_shared/admin.ts and nowhere else; this hook
// makes the cheapest authorized call there is and reads the answer. However
// admin is granted in future, no change is needed here.
//
// Still presentation only: the answer decides what to render, never what a
// request may do. Every admin endpoint re-authorizes independently.
//
// Cached through react-query because Layout and Admin both mount this hook —
// without shared caching, every page load would fire the same request twice.
export default function useIsAdmin() {
  const { data, isPending } = useQuery({
    queryKey: ["is-admin"],
    staleTime: 5 * 60 * 1000,
    // A 403 is a settled answer, not a transient failure; retrying it would
    // triple the requests for every ordinary user on every page load.
    retry: false,
    queryFn: async () => {
      // No session means no point calling the function; it would only 401.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { isAdmin: false, isOwner: false };

      const res = await invokeFunction("adminData", { action: "whoami" });
      // invokeFunction normalizes every failure — 401, 403, network — into
      // data.error, so anything short of a clean response means "not an admin"
      // as far as the UI is concerned.
      const ok = !res.data?.error && res.data?.isAdmin === true;
      return { isAdmin: ok, isOwner: ok && res.data.isOwner === true };
    }
  });

  return {
    loading: isPending,
    isAdmin: data?.isAdmin ?? false,
    isOwner: data?.isOwner ?? false
  };
}
