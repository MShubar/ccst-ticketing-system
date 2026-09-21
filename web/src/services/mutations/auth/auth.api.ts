import { api } from "@/api/client";
import type { LoginRequest, LoginResponse, RegisterRequest } from "./auth.types";

export const loginApi = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>("/login", payload);
  return response.data;
};

export const registerInstructorApi = async (
  payload: RegisterRequest
): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>("/register/instructor", payload);
  return response.data;
};

export const logoutApi = async (): Promise<void> => {
  await api.post("/logout");
};

export const updateUserLevelApi = async (
  userId: string,
  level: number
): Promise<{ ok: boolean; user: import("@/types/auth").AuthUser; oldLevel: number; newLevel: number }> => {
  const response = await api.patch<{ ok: boolean; user: import("@/types/auth").AuthUser; oldLevel: number; newLevel: number }>(
    `/levels/users/${userId}`,
    { level }
  );
  return response.data;
};
