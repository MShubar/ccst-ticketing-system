import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type { Dashboard, KbArticle } from "@/types/classroom";

export const useDashboard = () =>
  useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => {
      const { data } = await api.get<Dashboard>("/dashboard");
      return data;
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

export const useTickets = (search: string) =>
  useQuery({
    queryKey: queryKeys.tickets(search),
    queryFn: async () => {
      const { data } = await api.get(`/tickets?${search}`);
      return data as {
        items: Array<Record<string, unknown>>;
        page: number;
        pages: number;
        total?: number;
      };
    },
  });

export const useTicket = (id: string) =>
  useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: async () => {
      const { data } = await api.get(`/tickets/${id}`);
      return data as Record<string, unknown>;
    },
    enabled: Boolean(id),
  });

export const useKb = () =>
  useQuery({
    queryKey: queryKeys.kb,
    queryFn: async () => {
      const { data } = await api.get<KbArticle[]>("/kb");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

export const useUsers = () =>
  useQuery({
    queryKey: queryKeys.users,
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data as Array<Record<string, unknown>>;
    },
  });

export const usePortals = () =>
  useQuery({
    queryKey: queryKeys.portals,
    queryFn: async () => {
      const { data } = await api.get("/portals");
      return data;
    },
  });
