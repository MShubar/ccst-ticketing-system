import { create } from "zustand";
import { cacheMeForClassic, clearMeCache } from "@/utils/classicHash";
import { initialState } from "./initialState";
import type { AuthState } from "./types";

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setSession: (me) => {
    cacheMeForClassic(me);
    set({
      status: "authenticated",
      user: me.user,
      classInfo: me.class,
      announcement: me.announcement || me.class?.announcement || null,
      meta: me.meta,
      storage: me.storage,
    });
  },

  clearSession: () => {
    clearMeCache();
    set({
      status: "anonymous",
      user: null,
      classInfo: null,
      announcement: null,
      meta: null,
      storage: null,
    });
  },

  setStatus: (status) => set({ status }),
}));
