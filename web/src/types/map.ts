export interface MapPort {
  id: string;
  side?: "top" | "left" | "right" | "bottom" | string;
}

export interface MapNode {
  id: string;
  label?: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  zone?: string;
  place?: string;
  role?: string;
  ip?: string;
  ports?: MapPort[];
}

export interface MapZone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: string;
}

export interface MapTopology {
  viewBox?: string;
  zones?: MapZone[];
  nodes: MapNode[];
}

export interface MapLink {
  id: string;
  a: string;
  b: string;
  cable?: string;
}

export interface MapLabel {
  label?: string;
  meta?: string;
  alert?: boolean;
  tooltip?: string;
}

export interface MapWirelessLink {
  from?: string;
  to?: string;
  ssid?: string;
  [key: string]: unknown;
}

export interface MapResetBy {
  id?: string;
  fullName?: string;
  username?: string;
}

export interface MapPayload {
  topology?: MapTopology;
  links: MapLink[];
  wireless?: MapWirelessLink[];
  labels: Record<string, MapLabel>;
  updatedAt?: string | null;
  mapRev?: number | null;
  designLinkCount?: number;
  lastResetBy?: MapResetBy | null;
  lastResetAt?: string | null;
  linksOnly?: boolean;
}

export interface MapLabelsPayload {
  labels: Record<string, MapLabel>;
  wireless?: MapWirelessLink[];
}

export interface MapPresencePeer {
  userId: string;
  name: string;
  role?: string;
  x: number;
  y: number;
  at?: number;
}

export interface MapPresencePayload {
  peers: MapPresencePeer[];
  mapRev?: number | null;
  mapUpdatedAt?: string | null;
}

export interface LinkOpBody {
  action: string;
  id?: string;
  a?: string;
  b?: string;
  cable?: string;
}

export interface LinkOpResult {
  ok: boolean;
  error?: string;
  links?: MapLink[];
  updatedAt?: string;
  mapRev?: number;
  action?: string;
}

export interface MapDeviceSummary {
  id?: string;
  label: string;
  kind: string;
  type?: string;
  prompt: string;
  gate?: string | string[];
  warnings?: string[];
  cabled?: number;
  ports?: number;
  mediaDown?: boolean;
  mediaLabel?: string;
  ip?: string;
  hardware?: { serviceable?: boolean };
}

export interface ConsoleCommandResult {
  session: unknown;
  prompt: string;
  output: string[];
  clear?: boolean;
  close?: boolean;
}
