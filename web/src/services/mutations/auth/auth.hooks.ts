import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { queryKeys } from "@/api/queryKeys";
import { ROUTES } from "@/constants/routes";
import { getCurrentUserApi } from "@/services/queries/auth/auth.api";
import { useAuthStore } from "@/store/auth/authStore";
import { loginApi, logoutApi, registerInstructorApi } from "./auth.api";

export const useLogin = (nextPath: string = ROUTES.DASHBOARD) => {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginApi,
    onSuccess: async (loginRes) => {
      // Provisional session so ProtectedRoute lets us in while /me hydrates.
      setSession({
        user: loginRes.user,
        class: loginRes.user.classId
          ? { id: loginRes.user.classId, name: loginRes.user.className || "Class" }
          : null,
        announcement: null,
        meta: {},
        requesters: [],
        storage: "unknown"
      });
      toast.success("Signed in");
      navigate(nextPath);
      try {
        const me = await getCurrentUserApi();
        setSession(me);
        queryClient.setQueryData(queryKeys.auth.me, me);
      } catch {
        /* AuthInitializer retries /me */
      }
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Username or password is not correct.";
      toast.error(message);
    },
  });
};

export const useRegisterInstructor = (nextPath: string = ROUTES.DASHBOARD) => {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registerInstructorApi,
    onSuccess: async (loginRes) => {
      setSession({
        user: loginRes.user,
        class: loginRes.user.classId
          ? { id: loginRes.user.classId, name: loginRes.user.className || "Class" }
          : null,
        announcement: null,
        meta: {},
        requesters: [],
        storage: "unknown"
      });
      toast.success("Class created");
      navigate(nextPath);
      try {
        const me = await getCurrentUserApi();
        setSession(me);
        queryClient.setQueryData(queryKeys.auth.me, me);
      } catch {
        /* settle via /me */
      }
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create class.";
      toast.error(message);
    },
  });
};

export const useLogout = () => {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutApi,
    onMutate: async () => {
      // Leave the app immediately — don't wait for the network.
      clearSession();
      queryClient.clear();
      navigate(ROUTES.LOGIN);
    },
    onError: () => {
      toast.error("Signed out locally. Network sign-out failed.");
    },
  });
};
