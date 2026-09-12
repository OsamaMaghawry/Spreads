import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";

// The operator switches a customer's browser legitimately needs.
//
// One fetch for both, because both decide what the nav and the Accounts page
// render and both are wanted on the first paint. `publicConfig` deliberately
// returns these two keys and no more -- manual_api_keys and billing_enforced
// are operator concerns and stay invisible.
//
// Presentation only, in both directions. `createCheckoutSession` and
// `billingPortal` re-read billing_visible and refuse while it is off;
// `openPosition` re-reads demo_mode and refuses a live order while it is on.
// Hiding a button is a courtesy; the server is the control.
export default function usePublicConfig() {
  const { data, isPending } = useQuery({
    queryKey: ["public-config"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await invokeFunction("publicConfig", {});
      if (res.data?.error) throw new Error(res.data.error);
      return {
        billingVisible: res.data?.billingVisible === true,
        // Demo unless the server says otherwise -- the same inverted default
        // the server uses, so a failed read leaves the app looking like what
        // it is rather than opening a live surface for a moment.
        demoMode: res.data?.demoMode !== false
      };
    }
  });

  return {
    billingVisible: data?.billingVisible === true,
    demoMode: data ? data.demoMode : true,
    loading: isPending
  };
}
