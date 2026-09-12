import usePublicConfig from "@/lib/usePublicConfig";

// Kept as its own name because "is there a payment surface" reads better at
// the call site than reaching into a config object. One fetch underneath --
// react-query shares the key.
export default function useBillingVisible() {
  const { billingVisible, loading } = usePublicConfig();
  return { billingVisible, loading };
}
