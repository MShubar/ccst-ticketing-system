import { mapDeviceType, mapPickCable } from "./mapWires.js";
import type { MapLabel, MapLink, MapTopology } from "../types/map";

export function occupied(links: MapLink[]): Set<string> {
  const set = new Set<string>();
  for (const l of links) {
    set.add(l.a);
    set.add(l.b);
  }
  return set;
}

export function nextLinkId(list: MapLink[]): string {
  let max = 0;
  for (const l of list || []) {
    const m = /^L(\d+)$/i.exec(String(l.id || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${String(max + 1).padStart(3, "0")}`;
}

export function cloneLabels(src: Record<string, MapLabel>): Record<string, MapLabel> {
  const out: Record<string, MapLabel> = {};
  for (const [id, info] of Object.entries(src || {})) {
    out[id] = { ...(info || {}) };
  }
  return out;
}

export function deviceIdOf(endpoint: string): string {
  return String(endpoint || "").split(":")[0];
}

export function deviceHasCable(list: MapLink[], deviceId: string): boolean {
  return (list || []).some(
    (l) => l.a.startsWith(`${deviceId}:`) || l.b.startsWith(`${deviceId}:`)
  );
}

/** Instant map badge so unplug/plug does not wait on /api/map/labels. */
export function patchHostLabels(
  labels: Record<string, MapLabel>,
  prevLinks: MapLink[],
  nextLinks: MapLink[],
  topo: MapTopology
): Record<string, MapLabel> {
  const touched = new Set<string>();
  for (const l of prevLinks || []) {
    touched.add(deviceIdOf(l.a));
    touched.add(deviceIdOf(l.b));
  }
  for (const l of nextLinks || []) {
    touched.add(deviceIdOf(l.a));
    touched.add(deviceIdOf(l.b));
  }
  const next = cloneLabels(labels);
  for (const id of touched) {
    const node = (topo.nodes || []).find((n) => n.id === id);
    if (!node) continue;
    if (!["pc", "laptop", "printer", "server"].includes(node.type)) continue;
    const had = deviceHasCable(prevLinks, id);
    const has = deviceHasCable(nextLinks, id);
    if (had === has) continue;
    const info = { ...(next[id] || {}) };
    if (!has) {
      info.meta = "Media disconnected";
      info.alert = true;
    } else if (info.meta === "Media disconnected" || info.alert) {
      info.meta = node.ip || node.role || node.type;
      info.alert = false;
    }
    next[id] = info;
  }
  return next;
}

export function applyLocalLinkOp(
  body: { action?: string; id?: string; a?: string; b?: string; cable?: string },
  links: MapLink[],
  topo: MapTopology
): { ok: true; links: MapLink[] } | { ok: false; error: string } {
  const current = links.slice();
  const action = String(body.action || "").toLowerCase();
  if (action === "unplug" || action === "remove") {
    const id = body.id != null ? String(body.id) : "";
    const a = String(body.a || "").trim();
    const b = String(body.b || "").trim();
    let idx = -1;
    if (id) idx = current.findIndex((l) => l.id === id);
    if (idx < 0 && a && b) {
      idx = current.findIndex(
        (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
      );
    }
    if (idx < 0) return { ok: false, error: "That cable is already gone." };
    current.splice(idx, 1);
    return { ok: true, links: current };
  }
  if (action === "plug" || action === "add") {
    const a = String(body.a || "").trim();
    const b = String(body.b || "").trim();
    if (!a || !b || a === b) return { ok: false, error: "Pick two different ports." };
    const used = occupied(current);
    if (used.has(a) || used.has(b)) {
      const busy = used.has(a) ? a : b;
      return {
        ok: false,
        error: `${busy} already has a cable. Click a white (free) port, or click that cable to unplug it first.`,
      };
    }
    const cable =
      body.cable ||
      mapPickCable(mapDeviceType(topo, a), mapDeviceType(topo, b));
    current.push({ id: nextLinkId(current), a, b, cable });
    return { ok: true, links: current };
  }
  return { ok: false, error: "Unknown map action." };
}
