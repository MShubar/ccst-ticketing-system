import { api } from "@/api/client";
import type { MeResponse, CurriculumLevel } from "@/types/auth";

export const getCurrentUserApi = async (): Promise<MeResponse> => {
  const response = await api.get<MeResponse>("/me");
  return response.data;
};

export const fetchCurriculumApi = async (): Promise<CurriculumLevel[]> => {
  const response = await api.get<CurriculumLevel[]>("/levels/curriculum");
  return response.data;
};
