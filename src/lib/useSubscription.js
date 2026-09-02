import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

// The caller's own subscriptions row, read straight from the table under RLS
// ("select own subscription"). Presentation only: whether a live order is
// allowed is decided in openPosition, never from what this hook says.
export default function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end, grandfathered_until, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    }
  });
  const sub = data || null;
  const now = Date.now();
  const grandfathered = sub?.grandfathered_until && Date.parse(sub.grandfathered_until) > now;
  const entitled =
    !!sub && (["active", "trialing"].includes(sub.status) ||
      (sub.status === "past_due" && sub.current_period_end && Date.parse(sub.current_period_end) > now) ||
      grandfathered);
  return {
    subscription: sub,
    loading: isPending && !!user?.id,
    // "live" when the plan is in force, "none" otherwise. The server decides
    // whether that matters (billing may not be enforced yet).
    plan: entitled ? "live" : "none",
    grandfathered: !!grandfathered,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["subscription", user?.id] }) || refetch()
  };
}
