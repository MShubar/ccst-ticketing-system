import { Navigate, useLocation } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/auth/authStore";
import Loader from "@/components/common/Loader";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "loading") {
    return <Loader variant="screen" />;
  }

  if (status !== "authenticated") {
    // LoginPage reads `?next=` (same contract as the 401 interceptor).
    const next = `${location.pathname}${location.search}`;
    const to =
      next && next !== "/" && !next.startsWith("/login")
        ? `${ROUTES.LOGIN}?next=${encodeURIComponent(next)}`
        : ROUTES.LOGIN;
    return <Navigate to={to} replace />;
  }

  return children;
}
