import type { MapLink, MapTopology } from "@/types/map";

export function computeAnchors(topo: MapTopology): Map<string, { x: number; y: number }>;
export function mapCorridorY(
  start: { x: number; y: number },
  end: { x: number; y: number },
  role: string,
  topo: MapTopology
): number;
export function mapDeviceType(topo: MapTopology, endpoint: string): string;
export function mapOrthogonalWaypoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  midY: number,
  lane: number,
  role: string
): Array<{ x: number; y: number }>;
export function mapPickCable(typeA: string, typeB: string): string;
export function mapPointsToRoundedPath(pts: Array<{ x: number; y: number }>): string;
export function mapRadioHtml(
  wireless: unknown[],
  anchors: Map<string, { x: number; y: number }>
): string;
export function mapWiresHtml(
  topo: MapTopology,
  links: MapLink[],
  anchors: Map<string, { x: number; y: number }>
): string;
