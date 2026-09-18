import type { AuthState } from "./types";

export const initialState: Pick<
  AuthState,
  "status" | "user" | "classInfo" | "announcement" | "meta" | "storage"
> = {
  status: "loading",
  user: null,
  classInfo: null,
  announcement: null,
  meta: null,
  storage: null,
};
