import { api } from "./client";
import { queryClient } from "@/services/queryClient";
import { router } from "@/routes";
import { useAuthStore } from "@/store/auth/authStore";

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || "");
    if (status === 401 && !url.includes("/me") && !url.includes("/login")) {
      if (window.location.pathname !== "/login") {
        const next = `${window.location.pathname}${window.location.search}`;
        const dest =
          next && next !== "/"
            ? `/login?next=${encodeURIComponent(next)}`
            : "/login";
        useAuthStore.getState().clearSession();
        queryClient.clear();
        void router.navigate(dest, { replace: true });
      }
    }
    return Promise.reject(error);
  }
);
