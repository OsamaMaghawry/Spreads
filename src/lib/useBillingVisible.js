import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";

// Whether the payment surface exists yet.
//
// Separate from useAdminSettings, which is admin-only by design: this switch
// is the one operator setting a customer's browser has to know about, because
// it decides whether the Billing entry and the billing screen exist at all.
// publicConfig returns this key and nothing else.
//
// Presentation only. createCheckoutSession and billingPortal re-read the same
// switch and refuse with 403 while it is off, so hiding the button is a
// courtesy and the server is the control.
export default function useBillingVisible() {
  const { data, isPending } = useQuery({
    queryKey: ["billing-visible"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await invokeFunction("publicConfig", {});
      if (res.data?.error) throw new Error(res.data.error);
      return res.data?.billingVisible === true;
    }
  });

  // Closed while loading and closed on failure: a payment page that flickers
  // into view before the answer arrives is worse than one that appears a
  // moment late.
  return { billingVisible: data === true, loading: isPending };
}
