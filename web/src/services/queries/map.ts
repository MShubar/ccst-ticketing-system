import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import type {
  ConsoleCommandResult,
  LinkOpBody,
  LinkOpResult,
  MapLabelsPayload,
  MapPayload,
  MapPresencePayload,
  MapTopology,
} from "@/types/map";

let cachedTopology: MapTopology | null = null;

export function getCachedMapTopology(): MapTopology | null {
  return cachedTopology;
}

export function setCachedMapTopology(topo: MapTopology | null) {
  cachedTopology = topo;
}

export function useMap() {
  return useQuery({
    queryKey: queryKeys.map.map,
    queryFn: async (): Promise<MapPayload> => {
      if (cachedTopology) {
        const { data } = await api.get<MapPayload>("/map?omitTopology=1");
        return { ...data, topology: cachedTopology };
      }
      const { data } = await api.get<MapPayload>("/map");
      if (data.topology) {
        cachedTopology = data.topology;
      }
      return data;
    },
    staleTime: 60_000,
  });
}

export function useMapOmitTopology() {
  return useQuery({
    queryKey: queryKeys.map.map,
    queryFn: async (): Promise<MapPayload> => {
      const { data } = await api.get<MapPayload>("/map?omitTopology=1");
      return {
        ...data,
        topology: cachedTopology ?? data.topology,
      };
    },
    enabled: false,
    staleTime: 20_000,
  });
}

export async function fetchMapOmitTopology(): Promise<MapPayload> {
  const { data } = await api.get<MapPayload>("/map?omitTopology=1");
  return { ...data, topology: cachedTopology ?? data.topology };
}

export async function fetchMapLabels(): Promise<MapLabelsPayload> {
  const { data } = await api.get<MapLabelsPayload>("/map/labels");
  return data;
}

export function useMapLinks() {
  return useQuery({
    queryKey: queryKeys.map.mapLinks,
    queryFn: async () => {
      const { data } = await api.get<Pick<MapPayload, "links" | "updatedAt" | "mapRev">>(
        "/map/links"
      );
      return data;
    },
    enabled: false,
    staleTime: 5_000,
  });
}

export function useMapLabels(enabled = false) {
  return useQuery({
    queryKey: queryKeys.map.mapLabels,
    queryFn: async () => {
      const { data } = await api.get<MapLabelsPayload>("/map/labels");
      return data;
    },
    enabled,
    staleTime: 10_000,
  });
}

export function useLinkOpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LinkOpBody) => {
      const { data } = await api.post<LinkOpResult>("/map/links/op", body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.map.root });
    },
  });
}

export function useMapPresenceQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.map.mapPresence,
    queryFn: async () => {
      const { data } = await api.get<MapPresencePayload>("/map/presence");
      return data;
    },
    enabled,
    refetchInterval: false,
    staleTime: 0,
  });
}

export async function touchMapPresence(x: number, y: number) {
  const { data } = await api.post<MapPresencePayload>("/map/presence", { x, y });
  return data;
}

export async function fetchMapPresence() {
  const { data } = await api.get<MapPresencePayload>("/map/presence");
  return data;
}

export async function leaveMapPresence() {
  await api.delete("/map/presence");
}

export function useResetMapMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<MapPayload & { refaulted?: unknown[] }>(
        "/map/reset",
        {}
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.map.root });
    },
  });
}

export function useResetDevicesMutation() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ refaulted?: unknown[] }>("/devices/reset", {});
      return data;
    },
  });
}

export function useDevice(id: string | null) {
  return useQuery({
    queryKey: ["device", id] as const,
    queryFn: async () => {
      const { data } = await api.get<{ device: Record<string, unknown> }>(
        `/devices/${encodeURIComponent(id!)}`
      );
      return data.device;
    },
    enabled: Boolean(id),
  });
}

export function useConsoleCommandMutation(deviceId: string | null) {
  return useMutation({
    mutationFn: async (payload: { command: string; session: unknown }) => {
      const { data } = await api.post<ConsoleCommandResult>(
        `/devices/${encodeURIComponent(deviceId!)}/console`,
        payload
      );
      return data;
    },
  });
}
