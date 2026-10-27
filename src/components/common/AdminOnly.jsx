import { Navigate } from "react-router-dom";
import useIsAdmin from "@/lib/useIsAdmin";

// A page for administrators only (the trading terminal, 27 Oct: "admin-only
// features. No one should see it or finds it on the side menu"). Anyone else
// is sent to the dashboard, as if the page did not exist. Presentation only:
// the page's functions refuse a non-admin themselves.
export default function AdminOnly({ children }) {
  const { loading, isAdmin } = useIsAdmin();
  if (loading) return <div className="py-16 text-center text-sm text-dm-sub">Checking access…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}
