import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";
import useIsAdmin from "@/lib/useIsAdmin";

// The operator switches, for the two screens that care: the admin panel that
// sets them and the Accounts page that obeys one of them.
//
// Only fetched for an administrator. app_settings denies every client role, so
// the values come back through adminData — and a customer has no reason to
// know a switch exists, since none of them turn on anything customer-facing.
// A non-admin therefore gets the closed defaults without a request being made.
//
// Presentation only, as ever: saveAccount re-reads the switch server-side and
// refuses credentials regardless of what the browser chose to render.
export default function useAdminSettings() {
  const { isAdmin, loading: checkingRole } = useIsAdmin();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["admin-settings"],
    enabled: isAdmin,
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await invokeFunction("adminData", { action: "getSettings" });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data.settings;
    }
  });

  const setSetting = async (key, value) => {
    const res = await invokeFunction("adminData", { action: "setSetting", key, value });
    if (res.data?.error) throw new Error(res.data.error);
    // The response carries the settings as they now are, so the cache is
    // updated from the server's answer rather than from what was requested.
    queryClient.setQueryData(["admin-settings"], res.data.settings);
  };

  return {
    isAdmin,
    // A disabled query stays "pending" forever in react-query, so waiting on it
    // for a non-admin would leave the page loading indefinitely.
    loading: checkingRole || (isAdmin && isPending),
    settings: data || { manualApiKeys: false },
    setSetting
  };
}
