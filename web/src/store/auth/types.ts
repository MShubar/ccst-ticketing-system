import type { AuthUser, ClassInfo, MeResponse } from "@/types/auth";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  classInfo: ClassInfo | null;
  announcement: ClassInfo["announcement"];
  meta: Record<string, unknown> | null;
  storage: string | null;

  setSession: (me: MeResponse) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
};
