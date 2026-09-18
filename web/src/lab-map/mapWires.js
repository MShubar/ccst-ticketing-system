/**
 * Map cable layout, bundling, and SVG path helpers.
 */
import { escapeHtml } from "./escapeHtml.js";

const MAP_LANE_WIDTH = 5;
const MAP_CORNER_R = 6;
const MAP_FAN_LEN = 26;
const MAP_BUNDLE_MIN = 4;

function mapPortPoint(node, port, indexOnSide, totalOnSide) {
  const w = node.w || 108;
  const h = node.h || 56;
  const left = node.x;
  const top = node.y;
  const spread = Math.min(w - 18, Math.max(14, totalOnSide * 11));
  const start = left + (w - spread) / 2;
  const step = totalOnSide <= 1 ? 0 : spread / (totalOnSide - 1);
  const along = totalOnSide <= 1 ? left + w / 2 : start + indexOnSide * step;
  const vSpread = Math.min(h - 16, Math.max(14, totalOnSide * 10));
  const vStart = top + (h - vSpread) / 2;
  const vStep = totalOnSide <= 1 ? 0 : vSpread / (totalOnSide - 1);
  const vAlong = totalOnSide <= 1 ? top + h / 2 : vStart + indexOnSide * vStep;
  if (port.side === "top") return { x: along, y: top };
  if (port.side === "left") return { x: left, y: vAlong };
  if (port.side === "right") return { x: left + w, y: vAlong };
  return { x: along, y: top + h };
}

/** Layout-model anchors — never DOM-measured, stable across scroll/paint. */
function computeAnchors(topo) {
  const map = new Map();
  for (const node of topo.nodes || []) {
    const ports = node.ports || [];
    const bySide = {};
    for (const p of ports) {
      if (!bySide[p.side]) bySide[p.side] = [];
      bySide[p.side].push(p);
    }
    for (const p of ports) {
      const sameSide = bySide[p.side] || [p];
      const idx = sameSide.findIndex((x) => x.id === p.id);
      const pt = mapPortPoint(node, p, idx, sameSide.length);
      map.set(`${node.id}:${p.id}`, {
        x: pt.x,
        y: pt.y,
        deviceId: node.id,
        portId: p.id,
        side: p.side,
        node
      });
    }
  }
  return map;
}

function mapEndpointPoint(topo, endpoint, anchors) {
  if (anchors) return anchors.get(endpoint) || null;
  const i = endpoint.indexOf(":");
  if (i < 1) return null;
  const deviceId = endpoint.slice(0, i);
  const portId = endpoint.slice(i + 1);
  const node = topo.nodes.find((n) => n.id === deviceId);
  if (!node) return null;
  const ports = node.ports || [];
  const port = ports.find((p) => p.id === portId);
  if (!port) return null;
  const sameSide = ports.filter((p) => p.side === port.side);
  const idx = sameSide.findIndex((p) => p.id === portId);
  return { ...mapPortPoint(node, port, idx, sameSide.length), deviceId, portId, side: port.side, node };
}

function mapDeviceOf(endpoint) {
  const i = String(endpoint || "").indexOf(":");
  return i > 0 ? endpoint.slice(0, i) : "";
}

function mapWireRole(aKey, bKey) {
  const devices = [mapDeviceOf(aKey), mapDeviceOf(bKey)];
  const has = (id) => devices.includes(id);
  const some = (fn) => devices.some(fn);
  const isAccessSw = (d) => d.startsWith("SW-") && d !== "SW-CLOUD" && d !== "SW-VIRT";
  const isBranchSw = (d) => /^SW-BR[A-Z]$/.test(d);
  const isBranchRt = (d) => /^R\d+-BR[A-Z]$/.test(d);
  const isDistRt = (d) => d.startsWith("RD-");
  const isBatelco = (d) => d.startsWith("BAT-");
  const isEndDevice = (d) => /^(PC|PRN|SRV)-/.test(d);
  // Provider first. Inside Batelco (core ↔ area exchange, and the internet
  // breakout) is backbone; an exchange down to a customer router is a WAN
  // handoff. Both are drawn heavier than anything on the customer side.
  if (has("BAT-HAMALA") || devices.every(isBatelco)) return "backbone";
  if (some(isBatelco)) return "wan";
  if (some(isBranchRt) && some(isBranchSw)) return "branch";
  // Inside HQ there are two tiers: the edge router down to the distribution
  // routers, then each of those down to the switch it is the gateway for.
  if (has("R1-EDGE") && some(isDistRt)) return "core";
  if (some(isDistRt) && some((d) => d.startsWith("SW-"))) return "edge";
  if (has("R1-EDGE") && some(isAccessSw)) return "edge";
  if (has("SW-CLOUD") && some((d) => d.startsWith("CLOUD") || d === "Keratin-Glow" || d === "Safqa")) {
    return "cloud";
  }
  if (has("SW-VIRT") && some((d) => d.startsWith("VM-"))) return "virt";
  // Switch to switch is a VLAN trunk, e.g. SW-SALES ↔ SW-SALES-2 carrying VLAN10.
  if (devices.every((d) => d.startsWith("SW-"))) return "switchtrunk";
  if (some((d) => d.startsWith("SW-")) && some(isEndDevice)) return "access";
  return "access";
}

function mapCableKind(cable, role) {
  if (cable === "crossover") return "crossover";
  if (cable === "console") return "console";
  if (cable === "fiber") return "fiber";
  const trunks = ["edge", "core", "branch", "wan", "backbone", "switchtrunk"];
  if (trunks.includes(role)) return "trunk";
  return "straight-through";
}

/**
 * Same rules as server/domain/lab/cabling.js pick(): the lead that will actually carry
 * traffic between these two box types. Kept here so a click does not need a
 * round-trip before the wire appears.
 */
function mapPickCable(typeA, typeB) {
  const end = new Set(["pc", "server", "printer", "laptop"]);
  const aEnd = end.has(typeA);
  const bEnd = end.has(typeB);
  if (aEnd || bEnd) {
    const straight =
      aEnd !== bEnd &&
      (typeA === "switch" || typeB === "switch" || typeA === "ap" || typeB === "ap");
    return straight ? "copper" : "crossover";
  }
  if (typeA === "switch" && typeB === "switch") return "crossover";
  if (typeA === "cloud" || typeB === "cloud") return "fiber";
  return "copper";
}

function mapDeviceType(topo, endpoint) {
  const id = String(endpoint || "").split(":")[0];
  return (topo.nodes || []).find((n) => n.id === id)?.type || "switch";
}

/**
 * Cables from a switch down to the hosts stacked below it. They share no
 * canvas-wide bus: each column gets its own corridor just under its switch,
 * which is why the on-prem VMs route like a department column.
 */
function mapIsColumnDrop(role) {
  return role === "access" || role === "virt";
}

function mapBusYForRole(role, topo, topPt, bottomPt) {
  const buses = topo.routing || {};
  if (role === "cloud" && buses.cloudBusY != null) return buses.cloudBusY;
  if (role === "edge" && buses.edgeBusY != null) return buses.edgeBusY;
  if (role === "core" && buses.coreBusY != null) return buses.coreBusY;
  if (role === "branch" && buses.branchBusY != null) return buses.branchBusY;
  if ((role === "wan" || role === "backbone") && buses.wanBusY != null) return buses.wanBusY;
  return Math.round((topPt.y + bottomPt.y) / 2);
}

/** Corridor Y always stays between the two port Ys — never above/below the link span. */
function mapCorridorY(a, b, role, topo) {
  const top = a.y <= b.y ? a : b;
  const bottom = a.y <= b.y ? b : a;
  const span = bottom.y - top.y;
  let midY;
  if (mapIsColumnDrop(role)) {
    midY = top.y + Math.max(20, Math.min(span - 20, span * 0.22));
  } else {
    midY = mapBusYForRole(role, topo, top, bottom);
  }
  if (span < 16) {
    // Same-row peers (e.g. SW-VIRT ↔ R1): jog slightly below both boxes, not above.
    const below = Math.max(a.y, b.y) + 36;
    return below;
  }
  const lo = top.y + Math.min(24, span * 0.15);
  const hi = bottom.y - Math.min(24, span * 0.15);
  return Math.max(lo, Math.min(hi, midY));
}

/** Orthogonal waypoints with a shared corridor + lane offset. */
function mapOrthogonalWaypoints(a, b, midY, laneOffset = 0, role = "access") {
  const top = a.y <= b.y ? a : b;
  const bottom = a.y <= b.y ? b : a;
  const yBus = midY + laneOffset;

  if (mapIsColumnDrop(role)) {
    if (Math.abs(top.x - bottom.x) < 8) {
      return [
        { x: bottom.x, y: bottom.y },
        { x: top.x, y: top.y }
      ];
    }
    // Column drop: rise on the lower device's x, short jog near the switch.
    return [
      { x: bottom.x, y: bottom.y },
      { x: bottom.x, y: yBus },
      { x: top.x, y: yBus },
      { x: top.x, y: top.y }
    ];
  }

  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  // Ports standing at the same height already face each other, so go straight
  // across instead of dipping under the boxes. Without this, the HQ edge →
  // Seef handoff (role "wan") drops into the department-uplink corridor and
  // the Batelco side looks disconnected from HQ on the map.
  if (
    Math.abs(ay - by) < 28 &&
    (role === "switchtrunk" || role === "backbone" || role === "wan")
  ) {
    return [
      { x: ax, y: ay },
      { x: bx, y: by }
    ];
  }
  if (Math.abs(ax - bx) < 4 && Math.abs(ay - by) < 4) {
    return [
      { x: ax, y: ay },
      { x: bx, y: by }
    ];
  }

  // Same-row horizontal: drop to corridor, across, back up into the peer.
  if (Math.abs(ay - by) < 28) {
    return [
      { x: ax, y: ay },
      { x: ax, y: yBus },
      { x: bx, y: yBus },
      { x: bx, y: by }
    ];
  }

  return [
    { x: ax, y: ay },
    { x: ax, y: yBus },
    { x: bx, y: yBus },
    { x: bx, y: by }
  ];
}

function mapSimplifyPoints(pts) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const colinear =
        (Math.abs(a.x - prev.x) < 0.5 && Math.abs(prev.x - cur.x) < 0.5) ||
        (Math.abs(a.y - prev.y) < 0.5 && Math.abs(prev.y - cur.y) < 0.5);
      if (colinear) out[out.length - 1] = cur;
      else out.push(cur);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function mapPointsToRoundedPath(pts, radius = MAP_CORNER_R) {
  const points = mapSimplifyPoints(pts);
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const dx1 = cur.x - prev.x;
    const dy1 = cur.y - prev.y;
    const dx2 = next.x - cur.x;
    const dy2 = next.y - cur.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const x1 = cur.x - (dx1 / len1) * r;
    const y1 = cur.y - (dy1 / len1) * r;
    const x2 = cur.x + (dx2 / len2) * r;
    const y2 = cur.y + (dy2 / len2) * r;
    parts.push(`L ${x1} ${y1}`);
    parts.push(`Q ${cur.x} ${cur.y} ${x2} ${y2}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}

function mapCorridorKey(item) {
  if (mapIsColumnDrop(item.role)) {
    const sw =
      mapHubScore(item.a.deviceId) >= mapHubScore(item.b.deviceId)
        ? item.a.deviceId
        : item.b.deviceId;
    return `${item.role}@${sw}@${Math.round(item.midY)}`;
  }
  return `${item.role}@${Math.round(item.midY)}`;
}

function mapAssignLanes(items) {
  const byCorridor = new Map();
  for (const item of items) {
    const key = mapCorridorKey(item);
    if (!byCorridor.has(key)) byCorridor.set(key, []);
    byCorridor.get(key).push(item);
  }
  for (const group of byCorridor.values()) {
    group.sort((a, b) => a.fromX - b.fromX || a.l.id.localeCompare(b.l.id));
    const center = (group.length - 1) / 2;
    group.forEach((item, i) => {
      item.lane = (i - center) * MAP_LANE_WIDTH;
      item.l.lane = item.lane;
    });
  }
}

function mapEnsurePaths(items) {
  for (const item of items) {
    const pts = mapOrthogonalWaypoints(item.a, item.b, item.midY, item.lane || 0, item.role);
    item.path = pts;
    item.l.path = pts.map((p) => ({ x: p.x, y: p.y }));
    item.d = mapPointsToRoundedPath(pts);
  }
}

function mapPairKey(devA, devB) {
  return [devA, devB].sort().join("|");
}

function mapTooltip(item) {
  const kind = mapCableKind(item.l.cable, item.role);
  const vlan = (item.a.node && (item.a.node.ip || item.a.node.role)) || "";
  const vlanBit = /VLAN\d+/i.test(vlan) ? ` — ${vlan.match(/VLAN\d+/i)[0]}` : "";
  return `${item.l.a} ↔ ${item.l.b}${vlanBit} — ${kind}`;
}

function mapHubScore(deviceId) {
  const id = String(deviceId);
  if (id === "BAT-HAMALA") return 110;
  if (id === "R1-EDGE" || id === "BAT-DUBAI" || id === "R-AZURE") return 100;
  if (id === "SW-CLOUD" || id === "SW-VIRT") return 90;
  if (id.startsWith("BAT-") || id.startsWith("RD-")) return 85;
  if (id.startsWith("SW-")) return 80;
  return 10;
}

function mapBuildWireItems(topo, links, anchors) {
  const items = links
    .map((l) => {
      const a = mapEndpointPoint(topo, l.a, anchors);
      const b = mapEndpointPoint(topo, l.b, anchors);
      if (!a || !b) return null;
      const role = mapWireRole(l.a, l.b);
      const midY = mapCorridorY(a, b, role, topo);
      const top = a.y <= b.y ? a : b;
      const hubCandidate =
        mapHubScore(a.deviceId) >= mapHubScore(b.deviceId) ? a.deviceId : b.deviceId;
      const peer = hubCandidate === a.deviceId ? b.deviceId : a.deviceId;
      return {
        l,
        a,
        b,
        role,
        midY,
        fromX: top.x,
        hubCandidate,
        peer,
        sortX: (a.x + b.x) / 2
      };
    })
    .filter(Boolean);
  mapAssignLanes(items);
  mapEnsurePaths(items);
  return items.sort((p, q) => p.sortX - q.sortX);
}

function mapLinkClaimKey(item) {
  // Prefer endpoints over the stored id — duplicate ids from an old migration
  // must not let one cable claim another out of the draw list.
  return mapPairKey(item.a.deviceId + ":" + item.a.portId, item.b.deviceId + ":" + item.b.portId);
}

function mapClassifyBundles(items) {
  const singles = [];
  const bundles = [];
  const claimed = new Set();

  const byPair = new Map();
  for (const item of items) {
    const key = mapPairKey(item.a.deviceId, item.b.deviceId);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(item);
  }
  for (const group of byPair.values()) {
    if (group.length >= MAP_BUNDLE_MIN) {
      bundles.push({ type: "pair", items: group, role: group[0].role });
      group.forEach((g) => claimed.add(mapLinkClaimKey(g)));
    }
  }

  const byHub = new Map();
  for (const item of items) {
    if (claimed.has(mapLinkClaimKey(item))) continue;
    // A bundle shares one corridor, but every cable in a column drop has its
    // own corridor just under the switch, so bundling one would collapse them
    // all onto the first cable's line.
    if (mapIsColumnDrop(item.role)) continue;
    const key = `${item.role}|${item.hubCandidate}`;
    if (!byHub.has(key)) byHub.set(key, []);
    byHub.get(key).push(item);
  }
  for (const group of byHub.values()) {
    const peers = new Set(group.map((g) => g.peer));
    if (group.length >= MAP_BUNDLE_MIN && peers.size >= MAP_BUNDLE_MIN) {
      bundles.push({ type: "hub", items: group, role: group[0].role, hub: group[0].hubCandidate });
      group.forEach((g) => claimed.add(mapLinkClaimKey(g)));
    }
  }

  for (const item of items) {
    if (!claimed.has(mapLinkClaimKey(item))) singles.push(item);
  }
  return { singles, bundles };
}

function mapTowardCorridor(pt, midY, lane, fanLen = MAP_FAN_LEN) {
  const yBus = midY + (lane || 0);
  const dir = yBus >= pt.y ? 1 : -1;
  const stubY = pt.y + dir * Math.min(fanLen, Math.abs(yBus - pt.y) * 0.45);
  return { x: pt.x, y: stubY };
}

function mapBundleSvg(bundle) {
  const items = bundle.items.slice().sort((a, b) => a.fromX - b.fromX);
  const role = bundle.role;
  const midY = items[0].midY;
  const lanes = items.map((it) => it.lane || 0);
  const avgLane = lanes.reduce((s, v) => s + v, 0) / Math.max(lanes.length, 1);
  const yBus = midY + avgLane;

  const hubId = bundle.hub || (mapHubScore(items[0].a.deviceId) >= mapHubScore(items[0].b.deviceId)
    ? items[0].a.deviceId
    : items[0].b.deviceId);

  const hubNode = (items[0].a.deviceId === hubId ? items[0].a : items[0].b).node;
  const hubCenterX = hubNode.x + (hubNode.w || 108) / 2;
  const hubPorts = items.map((it) => (it.a.deviceId === hubId ? it.a : it.b));
  const leafPorts = items.map((it) => (it.a.deviceId === hubId ? it.b : it.a));
  const hubY = hubPorts.reduce((s, p) => s + p.y, 0) / hubPorts.length;
  const towardBus = yBus >= hubY ? 1 : -1;
  const gatherY = hubY + towardBus * MAP_FAN_LEN;

  const fans = [];
  const leafJoinsX = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const hubPt = hubPorts[i];
    const leafPt = leafPorts[i];
    const tip = mapTooltip(it);
    const lane = it.lane || 0;
    const leafJoin = mapTowardCorridor(leafPt, midY, lane);
    leafJoinsX.push(leafJoin.x);

    // Short fan from hub port into the gather rail
    const hubFan = mapPointsToRoundedPath([
      hubPt,
      { x: hubPt.x, y: gatherY },
      { x: hubCenterX, y: gatherY }
    ]);
    // Short fan from leaf into the shared bus
    const leafFan = mapPointsToRoundedPath([
      leafPt,
      leafJoin,
      { x: leafJoin.x, y: yBus }
    ]);
    fans.push(`<g class="map-bundle-fan" data-link="${escapeHtml(it.l.id)}">
      <path class="map-wire-glow" d="${hubFan}" />
      <path class="map-wire map-wire-${escapeHtml(it.l.cable || "copper")}" d="${hubFan}"><title>${escapeHtml(tip)}</title></path>
      <path class="map-wire-glow" d="${leafFan}" />
      <path class="map-wire map-wire-${escapeHtml(it.l.cable || "copper")}" d="${leafFan}"><title>${escapeHtml(tip)}</title></path>
    </g>`);
  }

  const xLeft = Math.min(hubCenterX, ...leafJoinsX);
  const xRight = Math.max(hubCenterX, ...leafJoinsX);
  // Vertical stub from hub gather + full horizontal bus (two subpaths so simplify can't clip one side).
  const spine = `M ${hubCenterX} ${gatherY} L ${hubCenterX} ${yBus} M ${xLeft} ${yBus} L ${xRight} ${yBus}`;
  const cx = (xLeft + xRight) / 2;
  const tipList = items.map((it) => mapTooltip(it)).join("\n");
  const expanded = items
    .map((it) => {
      const tip = mapTooltip(it);
      return `<g class="map-wire-group map-role-${escapeHtml(it.role)}" data-link="${escapeHtml(it.l.id)}">
        <path class="map-wire-glow" d="${it.d}" />
        <path class="map-wire map-wire-${escapeHtml(it.l.cable || "copper")}" d="${it.d}"><title>${escapeHtml(tip)}</title></path>
      </g>`;
    })
    .join("");

  return `<g class="map-bundle map-role-${escapeHtml(role)}" data-bundle="${escapeHtml(role + "-" + hubId)}" data-link-ids="${escapeHtml(items.map((i) => i.l.id).join(","))}">
    <g class="map-bundle-collapsed">
      ${fans.join("")}
      <path class="map-wire-glow map-bundle-spine-glow" d="${spine}" />
      <path class="map-bundle-spine map-wire" d="${spine}"><title>${escapeHtml(tipList)}</title></path>
      <g class="map-bundle-badge" transform="translate(${cx},${yBus})">
        <rect x="-16" y="-9" width="32" height="18" rx="9" />
        <text text-anchor="middle" dy="3.5">×${items.length}</text>
      </g>
    </g>
    <g class="map-bundle-expanded">${expanded}</g>
  </g>`;
}

/**
 * The radio links, drawn as arcs rather than cables because that is what they
 * are: worked out from the settings on the laptop and the access point, not
 * from anything the student plugged. They cannot be clicked or unplugged —
 * the way to break or mend one is in the devices' own settings.
 */
function mapRadioHtml(assocs, anchors) {
  return (assocs || [])
    .map((a) => {
      const from = anchors.get(a.a);
      const to = anchors.get(a.b);
      if (!from || !to) return "";
      const lift = Math.min(from.y, to.y) - 34;
      const d = `M${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${lift} ${to.x} ${to.y}`;
      const client = a.a.slice(0, a.a.indexOf(":"));
      const ap = a.b.slice(0, a.b.indexOf(":"));
      const tip = `${client} is associated to ${ap} — ${a.signal}% signal (wireless, no cable)`;
      return `<g class="map-radio-link" data-radio="${escapeHtml(a.id)}">
        <path class="map-radio-wire" d="${d}"><title>${escapeHtml(tip)}</title></path>
      </g>`;
    })
    .join("");
}

function mapWiresHtml(topo, links, anchors) {
  const items = mapBuildWireItems(topo, links, anchors);
  const { singles, bundles } = mapClassifyBundles(items);
  const singleSvg = singles
    .map((it) => {
      const tip = mapTooltip(it);
      return `<g class="map-wire-group map-role-${escapeHtml(it.role)}" data-link="${escapeHtml(it.l.id)}">
        <path class="map-wire-glow" d="${it.d}" />
        <path class="map-wire map-wire-${escapeHtml(it.l.cable || "copper")}" d="${it.d}"><title>${escapeHtml(tip)}</title></path>
      </g>`;
    })
    .join("");
  return singleSvg + bundles.map(mapBundleSvg).join("");
}

/* ------------------------------------------------------------------ *
 * Device console (PC command prompt / switch + router IOS)
 * ------------------------------------------------------------------ */

const consoleState = {
  deviceId: null,
  session: null,
  history: [],
  historyIndex: -1,
  onClose: null,
  gated: false
};


export { computeAnchors, mapCorridorY, mapDeviceType, mapOrthogonalWaypoints, mapPickCable, mapPointsToRoundedPath, mapRadioHtml, mapWiresHtml };
