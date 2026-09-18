export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  dashboard: ["dashboard"] as const,
  tickets: (params: string) => ["tickets", params] as const,
  ticket: (id: string) => ["ticket", id] as const,
  kb: ["kb"] as const,
  users: ["users"] as const,
  portals: ["portals"] as const,
  map: {
    root: ["map"] as const,
    map: ["map", "payload"] as const,
    mapLinks: ["map", "links"] as const,
    mapLabels: ["map", "labels"] as const,
    mapPresence: ["map", "presence"] as const,
  },
} as const;
