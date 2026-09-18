import { api } from "@/api/client";
import type { MeResponse } from "@/types/auth";

export const getCurrentUserApi = async (): Promise<MeResponse> => {
  const response = await api.get<MeResponse>("/me");
  return response.data;
};
