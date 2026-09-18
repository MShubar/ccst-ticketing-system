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
