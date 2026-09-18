import Loader from "@/components/common/Loader";
import { useCurrentUser } from "@/services/queries/auth/auth.hooks";
import { useAuthStore } from "@/store/auth/authStore";
import { cacheMeForClassic } from "@/utils/classicHash";

export default function AuthInitializer({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { data, isLoading, isError, isFetched, isSuccess } = useCurrentUser();

  // Sync the store during render so ProtectedRoute never sees a stale
  // "loading" frame after /api/me has already arrived.
  if (isSuccess && data) {
    cacheMeForClassic(data);
    if (status !== "authenticated") setSession(data);
  } else if (isFetched && (isError || !data) && status === "loading") {
    clearSession();
  }

  if (!isFetched && (status === "loading" || isLoading)) {
    return <Loader variant="screen" />;
  }

  return children;
}
