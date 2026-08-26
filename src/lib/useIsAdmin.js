import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Whether to show the admin UI to this user.
//
// Presentation only. Every admin endpoint re-checks the role server-side in
// supabase/functions/_shared/admin.ts, because this value lives in the browser
// and anyone can set it to true in a console. Hiding a link is not access
// control; the edge function refusing the request is.
export default function useIsAdmin() {
  const [state, setState] = useState({ loading: true, isAdmin: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ loading: false, isAdmin: false });
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!cancelled) setState({ loading: false, isAdmin: data?.role === "admin" });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
