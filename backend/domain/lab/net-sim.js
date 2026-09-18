/**
 * Classroom network simulator for the browser lab map.
 *
 * Hosts get a Windows-style command prompt, switches and routers get a
 * Cisco-style console. Reachability is computed from the cabling the student
 * actually plugged on the map, so an unplugged cable or a wrong VLAN really
 * does break ping.
 */

const labMap = require("./lab-map");
const { topology, defaultLinks } = labMap;
const hardware = require("./hardware");
const cabling = require("./cabling");
const wireless = require("./wireless");
const dhcp = require("./dhcp");
const printers = require("./printers");
const {
  isIpv4,
  ipToInt,
  intToIp,
  isValidMask,
  maskToPrefix,
  networkOf,
  sameSubnet,
  firstHost,
  networkAddress,
  broadcastAddress,
  wildcardOf,
  isPrivateIpv4,
  wildcardMatch,
  aclPermits
} = require("./net-ip");
const { longIfName, normalizeIfName } = require("./net-if");
const {
  buildLinkIndex,
  activeLinks,
  linkIndexFor,
  plugged,
  peerOf,
  cableProblemFor,
  portCarriesVlan,
  floodFrom,
  egressPorts,
  addressOfEndpoint,
  localAddresses,
  switchPortsForVlan,
  reachableEndpoints,
  ownsAddress,
  routeLookup,
  neighborOn,
  forwardThroughRouters,
  mediaHint,
  pingCheck,
  wifiFailureText
} = require("./net-sim-reach");
const { hash32s, macFor, linkLocalV6, globalV6 } = require("./net-sim-id");
const {
  showIpIntBrief,
  showVlanBrief,
  showRunningConfig,
  showIpRoute,
  showIpNatTranslations,
  showIpNatStatistics,
  pingLinesWindows,
  pingLinesIos
} = require("./net-sim-show");

/* ------------------------------------------------------------------ *
 * Default device state, derived from the designed topology
 * ------------------------------------------------------------------ */

const HOST_TYPES = new Set(["pc", "server", "printer", "cloud"]);

/* ------------------------------------------------------------------ *
 * The Batelco WAN and the HQ distribution layer
 *
 * Sites do not hang off an HQ switchport. Each has its own edge router
 * handed off to the Batelco area exchange for its district, and the area
 * exchanges all home onto the core in Hamala. Inside HQ there is another
 * layer again: every department sits behind its own distribution router,
 * which meets R1-EDGE over a transit /30. Branch A reaching a Sales desk is
 * therefore a six-router trip:
 *
 *   R2-BRA → BAT-MUHARRAQ → BAT-HAMALA → BAT-SEEF → R1-EDGE → RD-SALES
 *
 * and it only works if every router along the way has a route, which is
 * the whole point of the exercise.
 *
 * Every table below is generated from the company described in lab-map.js,
 * so a department or a branch added there is addressed, routed and
 * translated here without a second edit.
 * ------------------------------------------------------------------ */

/** Bumped when defaults change in a way saved state cannot express. */
const STATE_SCHEMA = 10;

/**
 * Historical: VLAN40 once spanned Reception and Operations and VLAN50 spanned
 * Warehouse and Training, modelled as isolated switches with their own router
 * leg until they were trunked in v3. These four switches needed their designed
 * port modes and a management IP that did not collide with the neighbour they
 * shared a subnet with. (Since v6 every department has its own VLAN and its own
 * router, and the trunks join the two switches within one department.)
 */
const RESEEDED_IN_V3 = new Set(["SW-REC", "SW-OPS", "SW-WH", "SW-TRAIN"]);

/**
 * The same four again: in v8 each of them was given a router and a subnet of
 * its own, so the trunk that joined them and the management address they
 * chose around each other are both wrong now.
 */
const RESEEDED_IN_V8 = new Set(["SW-REC", "SW-OPS", "SW-WH", "SW-TRAIN"]);
/** Cloud path moved off Hamala onto R-AZURE via Dubai — Gi0/9 and NAT change. */
const RESEEDED_IN_V10 = new Set([labMap.ISP_CORE]);

const ISP_CORE = labMap.ISP_CORE;
const HQ_EDGE = labMap.HQ_EDGE;
const DUBAI_TELECOM = labMap.DUBAI_TELECOM;
const AZURE_ROUTER = labMap.AZURE_ROUTER;
const AZURE_SWITCH = labMap.AZURE_SWITCH;
const WAN_MASK = "255.255.255.252";
const DEFAULT_ROUTE = { network: "0.0.0.0", mask: "0.0.0.0" };

/** A /30 out of 203.0.113.0 per leg, numbered in table order. */
const wanPair = (slot) => ({
  a: `203.0.113.${slot * 4 + 1}`,
  b: `203.0.113.${slot * 4 + 2}`
});

/** Batelco backbone: the Hamala core down to each area exchange. */
const BACKBONE = labMap.backboneLegs().map((leg, i) => {
  const pair = wanPair(i);
  return { area: leg.id, corePort: leg.corePort, coreIp: pair.a, areaPort: leg.areaPort, areaIp: pair.b };
});

/**
 * Customer handoffs: an area exchange down to one site it serves. HQ carries
 * no `prefix` because what sits behind its edge router is a whole
 * distribution layer, derived in `sitePrefixes` instead.
 */
const HANDOFF_SLOT0 = 8; // 203.0.113.32 up, clear of the backbone
const HANDOFFS = [
  { site: "HQ", area: "BAT-SEEF", areaPort: "Gi0/2", peer: HQ_EDGE, peerPort: "Gi0/2" },
  ...labMap.branchSites().map((site) => ({
    site: site.name,
    area: site.exchange,
    areaPort: site.exchangePort,
    peer: site.router,
    peerPort: "Gi0/1",
    prefix: { network: `${site.net}.0`, mask: "255.255.255.0" }
  }))
].map((handoff, i) => {
  const pair = wanPair(HANDOFF_SLOT0 + i);
  return { ...handoff, areaIp: pair.a, peerIp: pair.b };
});

/**
 * HQ's distribution transits. Each department router meets the edge router on
 * its own /30 out of 10.10.254.0/24, which keeps every HQ address inside the
 * 10.10.0.0/16 the edge already translates.
 */
const HQ_TRANSIT_MASK = "255.255.255.252";
const HQ_TRANSIT_SUPERNET = { network: "10.10.254.0", mask: "255.255.255.0" };
const HQ_LEGS = labMap.hqUplinks().map((leg) => {
  const base = ipToInt("10.10.254.0") + leg.index * 4;
  return {
    ...leg,
    edgeIp: intToIp((base + 1) >>> 0),
    routerIp: intToIp((base + 2) >>> 0),
    mask: HQ_TRANSIT_MASK
  };
});

/** The internet, hanging off the core rather than off a customer switch. */
const INTERNET = { corePort: "Gi0/0", coreIp: "203.0.113.129", host: "Cloud-ISP", hostIp: "203.0.113.130" };

/**
 * Address translation, so every private host has a public identity to show.
 *
 * Two flavours on purpose, because that contrast is the lesson: each campus
 * and branch hides its whole LAN behind the single public address on its WAN
 * interface (PAT, "overload"), while the Azure cloud publishes each VM 1:1
 * from a provider pool on R-AZURE, since a server nobody can dial into is not a server.
 *
 * Each site's ACL denies the other private sites before it permits the rest,
 * which is the usual NAT exemption: HQ talking to Branch B stays on its real
 * 10.x address, and only internet-bound traffic gets translated.
 */
const CLOUD_NAT_POOL = "203.0.113.160"; // /27 — .161 up are the published halves
const CLOUD_NAT_POOL_SIZE = 30;
const RFC1918_10 = { network: "10.0.0.0", wildcard: "0.255.255.255" };
const NAT_LOG_MAX = 8; // how many live translations a router remembers

const NAT_SITES = [
  // The whole of HQ, department subnets and transits alike, behind one
  // public address on the edge router.
  { router: HQ_EDGE, acl: 101, inside: { network: "10.10.0.0", mask: "255.255.0.0" } },
  ...labMap.branchSites().map((site) => ({
    router: site.router,
    acl: 101,
    inside: { network: `${site.net}.0`, mask: "255.255.255.0" }
  })),
  { router: AZURE_ROUTER, acl: 110, inside: { network: "10.10.70.0", mask: "255.255.255.0" }, publish: AZURE_SWITCH }
];

/**
 * Batelco Hamala → Dubai telecom → Azure cloud router. Slots 6–7 sit between
 * the Bahrain backbone (0–5) and the customer handoffs (8+).
 */
const CLOUD_PATH = [
  {
    west: ISP_CORE,
    westPort: "Gi0/9",
    westIp: wanPair(6).a,
    east: DUBAI_TELECOM,
    eastPort: "Gi0/1",
    eastIp: wanPair(6).b
  },
  {
    west: DUBAI_TELECOM,
    westPort: "Gi0/2",
    westIp: wanPair(7).a,
    east: AZURE_ROUTER,
    eastPort: "Gi0/1",
    eastIp: wanPair(7).b
  }
];
const CLOUD_LAN = { network: "10.10.70.0", mask: "255.255.255.0" };
const CLOUD_PUB = { network: CLOUD_NAT_POOL, mask: "255.255.255.224" };

/** 255.255.0.0 → 0.0.255.255 */

/** The port a translating router points `ip nat outside` at. */
function natOutsidePort(deviceId) {
  if (deviceId === ISP_CORE) return INTERNET.corePort;
  // Azure publishes cloud VMs toward Dubai, not straight onto the internet.
  if (deviceId === AZURE_ROUTER) return "Gi0/1";
  const handoff = HANDOFFS.find((h) => h.peer === deviceId);
  return handoff ? handoff.peerPort : "";
}

/** The seeded `ip nat` config for one router, or null if it does not translate. */
function natConfigFor(deviceId, ifaces) {
  const site = NAT_SITES.find((s) => s.router === deviceId);
  if (!site) return null;
  const outside = natOutsidePort(deviceId);
  if (!outside || !ifaces[outside]) return null;

  const src = { network: site.inside.network, wildcard: wildcardOf(site.inside.mask) };
  const statics = [];
  if (site.publish) {
    const base = ipToInt(CLOUD_NAT_POOL);
    (facts().hostsBySwitch.get(site.publish) || []).forEach((host, i) => {
      if (i >= CLOUD_NAT_POOL_SIZE) return; // pool exhausted; the rest go out by PAT
      statics.push({ local: host.ip, global: intToIp((base + 1 + i) >>> 0) });
    });
  }
  return {
    acl: {
      id: site.acl,
      entries: [
        { action: "deny", src, dst: RFC1918_10 },
        { action: "permit", src, dst: null }
      ]
    },
    overload: { acl: site.acl, viaPort: outside },
    statics,
    translations: []
  };
}

/** portId → {ip, mask} for every WAN interface on `deviceId`. */
function wanIfacesFor(deviceId) {
  const out = new Map();
  if (deviceId === ISP_CORE) {
    out.set(INTERNET.corePort, { ip: INTERNET.coreIp, mask: WAN_MASK });
    for (const b of BACKBONE) out.set(b.corePort, { ip: b.coreIp, mask: WAN_MASK });
  }
  for (const b of BACKBONE) {
    if (b.area === deviceId) out.set(b.areaPort, { ip: b.areaIp, mask: WAN_MASK });
  }
  for (const h of HANDOFFS) {
    if (h.area === deviceId) out.set(h.areaPort, { ip: h.areaIp, mask: WAN_MASK });
    if (h.peer === deviceId) out.set(h.peerPort, { ip: h.peerIp, mask: WAN_MASK });
  }
  for (const leg of CLOUD_PATH) {
    if (leg.west === deviceId) out.set(leg.westPort, { ip: leg.westIp, mask: WAN_MASK });
    if (leg.east === deviceId) out.set(leg.eastPort, { ip: leg.eastIp, mask: WAN_MASK });
  }
  return out;
}

/**
 * The prefixes a site actually owns behind its edge router.
 *
 * HQ's are listed rather than summarised as 10.10.0.0/16, because the Azure
 * cloud is numbered inside that range but hangs off Dubai / R-AZURE. A /16
 * pointed at HQ would swallow VLAN70 and bounce it between BAT-SEEF and
 * R1-EDGE, so the provider routes exactly what HQ fronts: one subnet per
 * department behind the distribution layer, plus the transit range those
 * routers share with the edge.
 */
function sitePrefixes(handoff) {
  if (handoff.prefix) return [handoff.prefix];
  return [...HQ_LEGS.map((leg) => leg.lan), HQ_TRANSIT_SUPERNET].sort(
    (x, y) => ipToInt(x.network) - ipToInt(y.network)
  );
}

/** portId → {ip, mask} for the HQ transit legs on `deviceId`. */
function distIfacesFor(deviceId) {
  const out = new Map();
  if (deviceId === HQ_EDGE) {
    for (const leg of HQ_LEGS) out.set(leg.edgePort, { ip: leg.edgeIp, mask: leg.mask });
    return out;
  }
  const leg = HQ_LEGS.find((l) => l.router === deviceId);
  if (leg) out.set(leg.routerPort, { ip: leg.routerIp, mask: leg.mask });
  return out;
}

/**
 * Inside HQ: the edge router carries one route per department, and each
 * department router sends everything it does not own to the edge.
 */
function distRoutesFor(deviceId) {
  if (deviceId === HQ_EDGE) {
    return HQ_LEGS.map((leg) => ({ network: leg.lan.network, mask: leg.lan.mask, nextHop: leg.routerIp }));
  }
  const leg = HQ_LEGS.find((l) => l.router === deviceId);
  return leg ? [{ ...DEFAULT_ROUTE, nextHop: leg.edgeIp }] : [];
}

/** The static routes the design ships with, per router. */
function wanRoutesFor(deviceId) {
  const dubaiHop = CLOUD_PATH[0]; // Hamala ↔ Dubai
  const azureHop = CLOUD_PATH[1]; // Dubai ↔ Azure router

  // Core: customer prefixes via their exchange, and Azure cloud via Dubai.
  if (deviceId === ISP_CORE) {
    const routes = HANDOFFS.flatMap((h) => {
      const leg = BACKBONE.find((b) => b.area === h.area);
      return sitePrefixes(h).map((p) => ({ network: p.network, mask: p.mask, nextHop: leg.areaIp }));
    });
    routes.push({ network: CLOUD_LAN.network, mask: CLOUD_LAN.mask, nextHop: dubaiHop.eastIp });
    routes.push({ network: CLOUD_PUB.network, mask: CLOUD_PUB.mask, nextHop: dubaiHop.eastIp });
    return routes;
  }

  // Dubai telecom: Azure prefixes east, everything else back to Hamala.
  if (deviceId === DUBAI_TELECOM) {
    return [
      { network: CLOUD_LAN.network, mask: CLOUD_LAN.mask, nextHop: azureHop.eastIp },
      { network: CLOUD_PUB.network, mask: CLOUD_PUB.mask, nextHop: azureHop.eastIp },
      { ...DEFAULT_ROUTE, nextHop: dubaiHop.westIp }
    ];
  }

  // Azure cloud router: LAN is connected; default toward Dubai / Batelco.
  if (deviceId === AZURE_ROUTER) {
    return [{ ...DEFAULT_ROUTE, nextHop: azureHop.westIp }];
  }

  // Area exchange: its own customer directly, everything else up to Hamala.
  const leg = BACKBONE.find((b) => b.area === deviceId);
  if (leg) {
    const routes = HANDOFFS.filter((h) => h.area === deviceId).flatMap((h) =>
      sitePrefixes(h).map((p) => ({ network: p.network, mask: p.mask, nextHop: h.peerIp }))
    );
    routes.push({ ...DEFAULT_ROUTE, nextHop: leg.coreIp });
    return routes;
  }

  // Customer site: everything unknown goes to the provider. An HQ department
  // router has no provider leg of its own, so it defaults to the edge.
  const handoff = HANDOFFS.find((h) => h.peer === deviceId);
  const toProvider = handoff ? [{ ...DEFAULT_ROUTE, nextHop: handoff.areaIp }] : [];
  return [...distRoutesFor(deviceId), ...toProvider];
}

/** A blank NAT block, for a router the design ships without one. */
function ensureNat(state) {
  if (!state.nat) state.nat = { acl: null, overload: null, statics: [], translations: [] };
  return state.nat;
}

/**
 * The overload rule and the ACL it names, but only when that ACL exists.
 * Pointing `ip nat inside source list` at a list nobody defined translates
 * nothing, on a real router and here.
 */
function activeOverload(dev) {
  const ov = dev.nat?.overload;
  if (!ov) return null;
  const outside = dev.ifaces[ov.viaPort];
  if (!outside || !isIpv4(outside.ip) || outside.shutdown || outside.nat !== "outside") return null;
  const acl = dev.nat.acl && dev.nat.acl.id === ov.acl ? dev.nat.acl : null;
  if (!acl) return null;
  return { publicIp: outside.ip, acl };
}

/**
 * The address space a translating router treats as inside: the subnets on its
 * own `ip nat inside` ports, plus anything its routing table reaches through
 * one of them.
 *
 * The second half is what makes HQ work. A Sales desk is a router further
 * away than the edge's own interfaces, so matching only connected subnets
 * would leave every HQ host without a public identity even though the ACL
 * plainly permits it. A default route is never treated as inside reach, or
 * the whole internet would qualify.
 */
function insidePrefixes(dev) {
  const connected = Object.values(dev.ifaces || {}).filter(
    (i) => i.nat === "inside" && isIpv4(i.ip) && !i.shutdown && isValidMask(i.mask)
  );
  const out = connected.map((i) => ({ network: intToIp(networkOf(i.ip, i.mask)), mask: i.mask }));
  for (const route of dev.routes || []) {
    if (!isIpv4(route.network) || !isValidMask(route.mask) || !isIpv4(route.nextHop)) continue;
    if (maskToPrefix(route.mask) === 0) continue;
    if (!connected.some((i) => sameSubnet(route.nextHop, i.ip, i.mask))) continue;
    out.push({ network: route.network, mask: route.mask });
  }
  return out;
}

/** Does `ip` fall inside any of those prefixes? */
function withinPrefixes(prefixes, ip) {
  return prefixes.some((p) => networkOf(ip, p.mask) === networkOf(p.network, p.mask));
}

/**
 * What each private address looks like from the internet, read out of the
 * routers' live config rather than a table.
 *
 * Because it is derived, `no ip nat inside source ...` on R1-EDGE really does
 * change what every HQ device reports when you hover it, which is the point.
 */
function natPublicMap(states) {
  const statics = new Map();
  const pools = [];

  for (const [routerId, dev] of Object.entries(states.devices)) {
    if (dev.kind !== "router" || !dev.nat) continue;
    for (const s of dev.nat.statics || []) {
      if (!statics.has(s.local)) statics.set(s.local, { ip: s.global, via: routerId, how: "static" });
    }
    const ov = activeOverload(dev);
    if (!ov) continue;
    // Only traffic arriving from behind an `ip nat inside` port is a
    // candidate, so the core's backbone ports keep site-to-site traffic out
    // of the pool.
    const inside = insidePrefixes(dev);
    if (inside.length) pools.push({ routerId, publicIp: ov.publicIp, inside, acl: ov.acl });
  }

  return (ip) => {
    if (!isIpv4(ip)) return null;
    if (!isPrivateIpv4(ip)) return { ip, via: "", how: "native" };
    const fixed = statics.get(ip);
    if (fixed) return fixed;
    for (const pool of pools) {
      if (!withinPrefixes(pool.inside, ip)) continue;
      // Judged against an internet destination, so a NAT exemption for the
      // other private sites does not hide the address the host really uses.
      if (!aclPermits(pool.acl, ip, INTERNET.hostIp)) continue;
      return { ip: pool.publicIp, via: pool.routerId, how: "pat" };
    }
    return null;
  };
}

/**
 * Remember a translation the way a real NAT table would, so a student can
 * ping out from a PC and then find their own session on the edge router.
 * Returns the router that translated, or null if nothing did.
 */
function recordTranslation(states, sourceIp, destIp) {
  if (!isPrivateIpv4(sourceIp) || isPrivateIpv4(destIp)) return null;
  for (const [routerId, dev] of Object.entries(states.devices)) {
    if (dev.kind !== "router" || !dev.nat) continue;
    const ov = activeOverload(dev);
    if (!ov) continue;
    if (!withinPrefixes(insidePrefixes(dev), sourceIp)) continue;
    if (!aclPermits(ov.acl, sourceIp, destIp)) continue;

    const fixed = (dev.nat.statics || []).find((s) => s.local === sourceIp);
    const entry = { local: sourceIp, global: fixed ? fixed.global : ov.publicIp, dest: destIp };
    const log = (dev.nat.translations || []).filter((t) => !(t.local === entry.local && t.dest === entry.dest));
    log.unshift(entry);
    dev.nat.translations = log.slice(0, NAT_LOG_MAX);
    return routerId;
  }
  return null;
}

function designFacts() {
  const topo = topology();
  const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
  const design = defaultLinks();

  // Which hosts sit behind each switch in the shipped design?
  const hostsBySwitch = new Map();
  const switchOfHost = new Map();
  for (const l of design) {
    const [aDev] = l.a.split(":");
    const [bDev] = l.b.split(":");
    const aNode = nodes.get(aDev);
    const bNode = nodes.get(bDev);
    if (!aNode || !bNode) continue;
    const pairs = [
      [aNode, bNode],
      [bNode, aNode]
    ];
    for (const [sw, host] of pairs) {
      if (sw.type !== "switch") continue;
      if (!HOST_TYPES.has(host.type)) continue;
      switchOfHost.set(host.id, sw.id);
      if (!isIpv4(host.ip)) continue;
      if (!hostsBySwitch.has(sw.id)) hostsBySwitch.set(sw.id, []);
      hostsBySwitch.get(sw.id).push(host);
    }
  }

  const MASK = "255.255.255.0";
  const switchSubnet = new Map();
  for (const [swId, hosts] of hostsBySwitch) {
    switchSubnet.set(swId, { network: networkOf(hosts[0].ip, MASK), mask: MASK, gateway: firstHost(hosts[0].ip, MASK) });
  }

  // VLAN per switch: "VLAN30" in the node meta, else 1.
  const switchVlan = new Map();
  for (const n of topo.nodes) {
    if (n.type !== "switch") continue;
    const m = /VLAN\s*(\d+)/i.exec(n.ip || "");
    switchVlan.set(n.id, m ? Number(m[1]) : 1);
  }

  // Router interface addressing follows the designed link to each switch.
  const routerIfaces = new Map();
  for (const l of design) {
    const [aDev, aPort] = l.a.split(":");
    const [bDev, bPort] = l.b.split(":");
    const combos = [
      [aDev, aPort, bDev],
      [bDev, bPort, aDev]
    ];
    for (const [devId, portId, peerId] of combos) {
      const node = nodes.get(devId);
      if (!node || node.type !== "router") continue;
      const subnet = switchSubnet.get(peerId);
      if (!subnet) continue;
      if (!routerIfaces.has(devId)) routerIfaces.set(devId, new Map());
      routerIfaces.get(devId).set(portId, { ip: subnet.gateway, mask: subnet.mask });
    }
  }

  // Switch-to-switch cabling in the design is a VLAN trunk, not an access port.
  const trunkPorts = new Map();
  for (const l of design) {
    const [aDev, aPort] = l.a.split(":");
    const [bDev, bPort] = l.b.split(":");
    if (nodes.get(aDev)?.type !== "switch" || nodes.get(bDev)?.type !== "switch") continue;
    for (const [devId, portId] of [
      [aDev, aPort],
      [bDev, bPort]
    ]) {
      if (!trunkPorts.has(devId)) trunkPorts.set(devId, new Set());
      trunkPorts.get(devId).add(portId);
    }
  }

  // A host's gateway is the .1 of its own subnet.
  return { topo, nodes, switchSubnet, switchVlan, routerIfaces, MASK, hostsBySwitch, switchOfHost, trunkPorts };
}

let cachedFacts = null;
function facts() {
  if (!cachedFacts) cachedFacts = designFacts();
  return cachedFacts;
}

function defaultDeviceStates() {
  const { topo, switchVlan, routerIfaces, MASK, switchSubnet, switchOfHost, trunkPorts } = facts();
  const devices = {};
  const takenBySubnet = new Map();

  for (const node of topo.nodes) {
    // An access point is a switch with radios: one uplink into the VLAN it
    // bridges, and a handful of wireless slots instead of desk ports.
    if (node.type === "switch" || node.type === "ap") {
      const vlan = switchVlan.get(node.id) || Number(node.vlan) || 1;
      const trunks = trunkPorts.get(node.id) || new Set();
      const ports = {};
      for (const p of node.ports) {
        ports[p.id] = trunks.has(p.id)
          ? { mode: "trunk", vlan, shutdown: false, description: "Trunk to the neighbouring switch" }
          : { mode: "access", vlan, shutdown: false, description: "" };
      }
      // A switch here is layer 2 and nothing else: it forwards frames, it has
      // no address, and there is nothing on it to ping. Vlan1 exists the way
      // it does on a switch out of the box — created, unaddressed and shut —
      // so `show ip interface brief` shows a student that absence rather than
      // hiding it. Gateways and addresses belong to the department router.
      devices[node.id] = {
        kind: "switch",
        hostname: node.id,
        vlans: vlan === 1 ? { 1: "default" } : { 1: "default", [vlan]: `VLAN${String(vlan).padStart(4, "0")}` },
        ports,
        svi: { 1: { ip: "", mask: "", shutdown: true } },
        gateway: "",
        secret: "",
        saved: true,
        radio: node.type === "ap" ? wireless.defaultRadio(node) : undefined
      };
      continue;
    }
    if (node.type === "router") {
      const addr = routerIfaces.get(node.id) || new Map();
      const wan = wanIfacesFor(node.id);
      const dist = distIfacesFor(node.id);
      const ifaces = {};
      for (const p of node.ports) {
        const a = wan.get(p.id) || dist.get(p.id) || addr.get(p.id);
        ifaces[p.id] = {
          ip: a ? a.ip : "",
          mask: a ? a.mask : "",
          shutdown: false,
          description: wan.has(p.id)
            ? "WAN link to the provider"
            : dist.has(p.id)
              ? node.id === HQ_EDGE
                ? "Transit to a department router"
                : "Transit to the HQ edge router"
              : "",
          nat: ""
        };
      }
      // On a translating router, the provider-facing port is `outside` and
      // every addressed private port is `inside`. Backbone ports on the core
      // are neither, which is what keeps HQ-to-cloud traffic untranslated.
      const nat = natConfigFor(node.id, ifaces);
      if (nat) {
        ifaces[nat.overload.viaPort].nat = "outside";
        for (const [pid, iface] of Object.entries(ifaces)) {
          if (pid !== nat.overload.viaPort && isPrivateIpv4(iface.ip)) iface.nat = "inside";
        }
      }
      devices[node.id] = {
        kind: "router",
        hostname: node.id,
        ifaces,
        routes: wanRoutesFor(node.id),
        nat,
        secret: "",
        saved: true
      };
      continue;
    }
    // Hosts: PCs, printers, servers/VMs, the internet cloud.
    // A node without a literal address gets the top host address of whatever
    // subnet its designed switch serves, so it is still pingable.
    let ip = isIpv4(node.ip) ? node.ip : "";
    if (!ip) {
      const subnet = switchSubnet.get(switchOfHost.get(node.id));
      if (subnet) {
        const used = takenBySubnet.get(subnet.network) || 0;
        ip = intToIp((subnet.network + 254 - used) >>> 0);
        takenBySubnet.set(subnet.network, used + 1);
      }
    }
    // Cloud-ISP sits on a provider /30, so it carries its own mask and
    // gateway instead of the flat /24 the campus hosts share.
    const mask = ip ? (isValidMask(node.mask) ? node.mask : MASK) : "";
    const os =
      node.type === "server"
        ? "server"
        : node.type === "printer"
          ? "printer"
          : node.type === "laptop"
            ? "laptop"
            : "pc";
    devices[node.id] = {
      kind: "host",
      os,
      hostname: node.id,
      ip,
      mask,
      gateway: ip ? (isIpv4(node.gateway) ? node.gateway : firstHost(ip, mask)) : "",
      dns: ip ? "10.10.70.11" : "",
      // Laptops take their address from DHCP, the way a roaming machine does.
      // Everything on a cable is addressed from the design documentation.
      dhcp: os === "laptop",
      lease: os === "laptop" ? { server: "10.10.70.21", hours: dhcp.LEASE_HOURS, tainted: false } : null,
      ipConflict: false,
      // Only desk PCs have parts a student can open up and service.
      hw: os === "pc" ? hardware.defaultHw() : undefined,
      service: os === "pc" ? hardware.defaultService() : undefined,
      // Radio settings for a laptop; the DHCP scope for the DHCP server.
      wifi: os === "laptop" ? wireless.defaultWifi(node) : undefined,
      dhcpService: node.id === dhcp.SERVER_ID ? dhcp.defaultService() : undefined,
      printer: os === "printer" ? printers.defaultState() : undefined
    };
  }
  return { devices, schema: STATE_SCHEMA, updatedAt: new Date().toISOString() };
}

function cleanAclSpec(spec) {
  return spec && isIpv4(spec.network) && isIpv4(spec.wildcard)
    ? { network: spec.network, wildcard: spec.wildcard }
    : null; // `any`
}

/**
 * Keep a student's translation rules, falling back to the designed ones.
 * A router with no NAT in the design can still be given some by hand, so
 * saved rules survive even where `base` is null.
 */
function mergeNat(saved, base) {
  if (!saved || typeof saved !== "object") return base || null;
  const entries = Array.isArray(saved.acl?.entries)
    ? saved.acl.entries
        .filter((e) => e && (e.action === "permit" || e.action === "deny"))
        .map((e) => ({ action: e.action, src: cleanAclSpec(e.src), dst: cleanAclSpec(e.dst) }))
    : null;
  return {
    acl: entries ? { id: Number(saved.acl.id) || 1, entries } : base ? base.acl : null,
    overload:
      saved.overload && typeof saved.overload.viaPort === "string" && saved.overload.viaPort
        ? { acl: Number(saved.overload.acl) || 0, viaPort: saved.overload.viaPort }
        : saved.overload === null || !base
          ? null
          : base.overload,
    statics: Array.isArray(saved.statics)
      ? saved.statics
          .filter((s) => s && isIpv4(s.local) && isIpv4(s.global))
          .map((s) => ({ local: s.local, global: s.global }))
      : base
        ? base.statics
        : [],
    translations: Array.isArray(saved.translations)
      ? saved.translations
          .filter((t) => t && isIpv4(t.local) && isIpv4(t.global) && isIpv4(t.dest))
          .slice(0, NAT_LOG_MAX)
      : []
  };
}

function normalizeDeviceStates(raw) {
  const fresh = defaultDeviceStates();
  if (!raw || typeof raw !== "object" || !raw.devices) return fresh;
  const schema = Number(raw.schema || 0);
  // The Batelco rebuild moved every WAN address and next hop, v5 moved
  // VLAN70's gateway onto the core, v6 added NAT, v8 put a distribution
  // router in front of every HQ department, and v10 moved VLAN70 off Hamala
  // onto R-AZURE via Dubai. A saved router config from before any of that
  // points at circuits and interfaces that no longer exist, so routers
  // start again from the design.
  const preBatelco = schema < 8;
  const out = { devices: {}, schema: STATE_SCHEMA, updatedAt: raw.updatedAt || fresh.updatedAt };
  for (const [id, base] of Object.entries(fresh.devices)) {
    const saved = raw.devices[id];
    if (!saved || typeof saved !== "object" || saved.kind !== base.kind) {
      out.devices[id] = base;
      continue;
    }
    if (
      (schema < 3 && RESEEDED_IN_V3.has(id)) ||
      (schema < 8 && RESEEDED_IN_V8.has(id)) ||
      (schema < 10 && RESEEDED_IN_V10.has(id))
    ) {
      out.devices[id] = base;
      continue;
    }
    if (preBatelco && base.kind === "router") {
      out.devices[id] = { ...base, hostname: String(saved.hostname || base.hostname) };
      continue;
    }
    if (base.kind === "host") {
      out.devices[id] = {
        ...base,
        hostname: String(saved.hostname || base.hostname),
        ip: isIpv4(saved.ip) ? saved.ip : saved.ip === "" ? "" : base.ip,
        mask: isIpv4(saved.mask) ? saved.mask : saved.mask === "" ? "" : base.mask,
        gateway: isIpv4(saved.gateway) ? saved.gateway : saved.gateway === "" ? "" : base.gateway,
        dns: isIpv4(saved.dns) ? saved.dns : base.dns,
        dhcp: Boolean(saved.dhcp),
        ipConflict: Boolean(saved.ipConflict),
        lease: saved.lease && typeof saved.lease === "object"
          ? { server: String(saved.lease.server || ""), hours: Number(saved.lease.hours) || dhcp.LEASE_HOURS, tainted: Boolean(saved.lease.tainted) }
          : null,
        // Keep whatever is broken on this PC across a save. Classes saved
        // before hardware existed simply come back with everything healthy.
        hw: base.hw ? hardware.normalizeHw(saved.hw) : undefined,
        service: base.hw ? hardware.normalizeService(saved.service) : undefined,
        wifi: base.wifi ? wireless.normalizeWifi(saved.wifi, base.wifi) : undefined,
        dhcpService: base.dhcpService ? dhcp.normalizeService(saved.dhcpService) : undefined,
        printer: base.printer ? printers.normalizeState(saved.printer) : undefined
      };
      continue;
    }
    if (base.kind === "switch") {
      const ports = {};
      for (const [pid, pbase] of Object.entries(base.ports)) {
        const ps = (saved.ports || {})[pid] || {};
        ports[pid] = {
          // Fall back to the designed mode, so ports added to the topology
          // after a class saved its state still come up as trunks.
          mode: ps.mode === "trunk" || ps.mode === "access" ? ps.mode : pbase.mode,
          vlan: Number.isFinite(Number(ps.vlan)) ? Number(ps.vlan) : pbase.vlan,
          shutdown: Boolean(ps.shutdown),
          description: String(ps.description || "")
        };
      }
      const vlans = {};
      for (const [vid, name] of Object.entries(saved.vlans || base.vlans)) {
        if (!/^\d+$/.test(vid)) continue;
        vlans[vid] = String(name || `VLAN${vid.padStart(4, "0")}`);
      }
      if (!vlans[1]) vlans[1] = "default";
      const svi = {};
      for (const [vid, cfg] of Object.entries(saved.svi || {})) {
        if (!/^\d+$/.test(vid) || !cfg) continue;
        svi[vid] = {
          ip: isIpv4(cfg.ip) ? cfg.ip : "",
          mask: isIpv4(cfg.mask) ? cfg.mask : "",
          shutdown: Boolean(cfg.shutdown)
        };
      }
      // Until v9 every switch shipped with a management address on its access
      // VLAN. Switches are layer 2 now, so those addresses go — along with the
      // default gateway that only existed to serve them. Ports, VLANs, the
      // hostname and the enable secret are the student's work and stay.
      const layer2Only = schema < 9;
      out.devices[id] = {
        ...base,
        hostname: String(saved.hostname || base.hostname),
        vlans,
        ports,
        svi: layer2Only ? base.svi : Object.keys(svi).length || saved.svi ? svi : base.svi,
        radio: base.radio ? wireless.normalizeRadio(saved.radio, base.radio) : undefined,
        gateway: layer2Only ? "" : isIpv4(saved.gateway) ? saved.gateway : saved.gateway === "" ? "" : base.gateway,
        secret: String(saved.secret || ""),
        saved: saved.saved !== false
      };
      continue;
    }
    // router
    const ifaces = {};
    for (const [pid, pbase] of Object.entries(base.ifaces)) {
      const is = (saved.ifaces || {})[pid] || {};
      ifaces[pid] = {
        ip: isIpv4(is.ip) ? is.ip : is.ip === "" ? "" : pbase.ip,
        mask: isIpv4(is.mask) ? is.mask : is.mask === "" ? "" : pbase.mask,
        shutdown: Boolean(is.shutdown),
        description: String(is.description || ""),
        nat: is.nat === "inside" || is.nat === "outside" || is.nat === "" ? is.nat : pbase.nat
      };
    }
    out.devices[id] = {
      ...base,
      hostname: String(saved.hostname || base.hostname),
      ifaces,
      routes:
        Array.isArray(saved.routes)
          ? saved.routes
              .filter((r) => r && isIpv4(r.network) && isValidMask(r.mask) && isIpv4(r.nextHop))
              .map((r) => ({ network: r.network, mask: r.mask, nextHop: r.nextHop }))
          : base.routes,
      nat: mergeNat(saved.nat, base.nat),
      secret: String(saved.secret || ""),
      saved: saved.saved !== false
    };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * DHCP
 * ------------------------------------------------------------------ */

/**
 * The addressing the design gives each desk, cached. This is the scope the
 * DHCP server hands out from, and the documentation a student compares their
 * own `ipconfig` against.
 */
let cachedDesign = null;

function designedAddress(deviceId) {
  if (!cachedDesign) {
    cachedDesign = {};
    for (const [id, s] of Object.entries(defaultDeviceStates().devices)) {
      if (s.kind !== "host") continue;
      cachedDesign[id] = { ip: s.ip, mask: s.mask, gateway: s.gateway, dns: s.dns };
    }
  }
  return cachedDesign[deviceId] || null;
}

/** Whichever device is currently answering on the DHCP server's address. */
function dhcpServerState(states) {
  return states.devices[dhcp.SERVER_ID] || null;
}

/**
 * Run one DHCP request for real: cable, relay, server, service, scope. Every
 * step is the same check the rest of the simulator uses, so a fault planted
 * anywhere on the path between a desk and the DHCP VM shows up here.
 */
function dhcpRequest(topo, links, states, deviceId) {
  const state = states.devices[deviceId];
  const design = designedAddress(deviceId);
  if (!state || state.kind !== "host") return { ok: false, reason: "no-scope" };

  // 1. Can anything leave this machine at all?
  if (hardware.networkDown(state)) return { ok: false, reason: "media-down" };
  const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
  const node = nodes.get(deviceId);
  const linkIndex = linkIndexFor(topo, links, states);
  const hasLink = (node?.ports || []).some((p) => plugged(linkIndex, `${deviceId}:${p.id}`));
  if (!hasLink) return { ok: false, reason: "media-down" };

  // 2. Does the relay for this subnet — the department gateway — answer?
  if (!design || !design.gateway) return { ok: false, reason: "no-scope" };
  const relay = reachableEndpoints(states, linkIndex, nodes, deviceId, null, null).find((ep) => {
    const addr = addressOfEndpoint(states, ep);
    return addr && addr.ip === design.gateway;
  });
  if (!relay) return { ok: false, reason: "no-relay" };

  // 3. Can the relay reach the DHCP server's address? It forwards from the leg
  // facing this client, so the server answers that address and not the relay's
  // circuit out to the provider.
  const serverIp = designedAddress(dhcp.SERVER_ID)?.ip || "";
  const hop = pingCheck(topo, links, states, relay.deviceId, serverIp, { source: design.gateway });
  if (!hop.ok) return { ok: false, reason: "server-unreachable", detail: hop.detail };

  // 4. Is the service running, with something left in the scope?
  const server = dhcpServerState(states);
  return dhcp.offerFor({
    hostname: state.hostname,
    designed: design,
    service: server?.dhcpService,
    serverIp
  });
}

/**
 * Take the lease the request produced, or fall back the way Windows does.
 * Returns the lines to print; the caller marks the state as changed.
 */
function applyLease(state, offer, adapter = "Ethernet adapter Ethernet0:") {
  const name = adapter.includes("Wi-Fi") ? "Wi-Fi" : "Ethernet0";
  if (offer.ok) {
    state.dhcp = true;
    state.ip = offer.ip;
    state.mask = offer.mask;
    state.gateway = offer.gateway;
    state.dns = offer.dns;
    state.lease = { server: offer.server, hours: offer.leaseHours, tainted: offer.tainted };
    state.ipConflict = false;
    return [
      "",
      "Windows IP Configuration",
      "",
      adapter,
      "",
      `   IPv4 Address. . . . . . . . . . . : ${state.ip}`,
      `   Subnet Mask . . . . . . . . . . . : ${state.mask}`,
      `   Default Gateway . . . . . . . . . : ${state.gateway}`,
      ...(offer.tainted
        ? ["", "   The lease came with options that do not match this subnet — compare them with the documentation."]
        : [])
    ];
  }
  state.dhcp = true;
  state.ip = dhcp.apipaFor(state.hostname);
  state.mask = dhcp.APIPA_MASK;
  state.gateway = "";
  state.lease = null;
  state.ipConflict = false;
  return [
    "",
    `An error occurred while renewing interface ${name}: ${dhcp.failureText(offer.reason)}`,
    "",
    "Windows IP Configuration",
    "",
    adapter,
    "",
    `   Autoconfiguration IPv4 Address. . : ${state.ip}(Preferred)`,
    `   Subnet Mask . . . . . . . . . . . : ${state.mask}`,
    "   Default Gateway . . . . . . . . . : "
  ];
}

/* ------------------------------------------------------------------ *
 * Duplicate and mistyped addresses
 * ------------------------------------------------------------------ */

/**
 * Is another live device already using this address on the same segment?
 * Windows detects this with a gratuitous ARP before it commits the address,
 * and the loser of the argument ends up with no usable address at all.
 */
function addressInUse(topo, links, states, deviceId, ip) {
  if (!isIpv4(ip)) return null;
  const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
  const linkIndex = linkIndexFor(topo, links, states);
  const hit = reachableEndpoints(states, linkIndex, nodes, deviceId, null, null).find((ep) => {
    if (ep.deviceId === deviceId) return false;
    const addr = addressOfEndpoint(states, ep);
    return addr && addr.ip === ip;
  });
  if (!hit) return null;
  const owner = states.devices[hit.deviceId];
  return { deviceId: hit.deviceId, hostname: owner?.hostname || hit.deviceId };
}

/**
 * The things a student most often gets wrong when typing an address by hand,
 * checked against the address itself rather than against the design — a
 * gateway outside your own subnet is wrong whatever the documentation says.
 */
function addressingWarnings(state) {
  const out = [];
  if (!state || state.kind !== "host" || !state.ip) return out;
  if (dhcp.isApipa(state.ip)) {
    out.push("This is a 169.254 link-local address, which means no DHCP server answered.");
    return out;
  }
  if (!isValidMask(state.mask)) {
    out.push(`The subnet mask ${state.mask || "(none)"} is not a valid mask.`);
    return out;
  }
  if (state.gateway && !sameSubnet(state.ip, state.gateway, state.mask)) {
    out.push(
      `The default gateway ${state.gateway} is not inside this PC's own subnet (${networkAddress(state.ip, state.mask)} ${state.mask}), so it can never be reached.`
    );
  }
  if (state.gateway && state.gateway === state.ip) {
    out.push("The default gateway is this PC's own address.");
  }
  if (state.ip === networkAddress(state.ip, state.mask)) {
    out.push("This is the network address of the subnet, not a usable host address.");
  }
  if (state.ip === broadcastAddress(state.ip, state.mask)) {
    out.push("This is the broadcast address of the subnet, not a usable host address.");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * DNS
 * ------------------------------------------------------------------ */

/** Business and service names the class actually uses on tickets. */
const DNS_ZONE = {
  // Customer sites hosted for ProCloud clients
  "keratinglow.bh": "Keratin-Glow",
  "www.keratinglow.bh": "Keratin-Glow",
  "shop.keratinglow.bh": "Keratin-Glow",
  "safqa.bh": "Safqa",
  "www.safqa.bh": "Safqa",
  "shop.safqa.bh": "Safqa",
  // ProCloud public services (cloud VMs)
  "procloud.bh": "CLOUD-VM-WEB",
  "www.procloud.bh": "CLOUD-VM-WEB",
  "mail.procloud.bh": "CLOUD-VM-MAIL",
  "webmail.procloud.bh": "CLOUD-VM-MAIL",
  "vas.procloud.bh": "CLOUD-VM-APP",
  "backup.procloud.bh": "CLOUD-VM-BAK",
  "monitor.procloud.bh": "CLOUD-VM-MON",
  "vdi.procloud.bh": "CLOUD-VM-VDI1",
  "files.procloud.bh": "CLOUD-VM-FILE",
  "ftp.procloud.bh": "CLOUD-VM-FILE",
  // Internal directory / infrastructure
  "ad.procloud.local": "CLOUD-VM-AD",
  "dc.procloud.local": "CLOUD-VM-AD",
  "dns.procloud.local": "CLOUD-VM-DNS",
  "dhcp.procloud.local": "CLOUD-VM-DHCP",
  "sql.procloud.local": "CLOUD-VM-SQL",
  // On-prem VMs behind SW-VIRT
  "dc01.procloud.local": "VM-DC-01",
  "crm.procloud.local": "VM-SQL-CRM",
  "cbs.procloud.local": "VM-SQL-FIN",
  "hr.procloud.local": "VM-SQL-HR",
  "intranet.procloud.local": "VM-WEB",
  "fs.procloud.local": "VM-FS",
  "mail.procloud.local": "VM-MAIL",
  "gateway.procloud.local": "R1-EDGE",
  "isp.procloud.bh": "BAT-HAMALA",
  "batelco.bh": "BAT-HAMALA",
  "www.batelco.bh": "BAT-HAMALA",
  "internet.batelco.bh": "Cloud-ISP"
};

const DNS_SUFFIX = "procloud.local";

function deviceAddress(state) {
  if (!state) return null;
  if (state.kind === "host") return state.ip || null;
  if (state.kind === "router") {
    const first = Object.values(state.ifaces).find((i) => i.ip && !i.shutdown);
    return first ? first.ip : null;
  }
  const first = Object.values(state.svi).find((s) => s.ip && !s.shutdown);
  return first ? first.ip : null;
}

/** Name → address, with no regard for whether DNS itself is reachable. */
function resolveName(states, name) {
  const raw = String(name || "").trim().replace(/\.$/, "");
  if (!raw) return null;
  if (isIpv4(raw)) return raw;
  const wanted = raw.toLowerCase();

  const zoneTarget = DNS_ZONE[wanted];
  if (zoneTarget) {
    const addr = deviceAddress(states.devices[zoneTarget]);
    if (addr) return addr;
  }

  const bare = wanted.endsWith("." + DNS_SUFFIX) ? wanted.slice(0, -(DNS_SUFFIX.length + 1)) : wanted;
  for (const [id, state] of Object.entries(states.devices)) {
    if (id.toLowerCase() === bare || String(state.hostname).toLowerCase() === bare) {
      const addr = deviceAddress(state);
      if (addr) return addr;
    }
  }
  return null;
}

/**
 * Resolve the way a host would: the name server has to answer first.
 * Returns { ip } or { error }.
 */
function resolveForHost(topo, links, states, deviceId, name) {
  const raw = String(name || "").trim().replace(/\.$/, "");
  if (isIpv4(raw)) return { ip: raw };

  const state = states.devices[deviceId];
  if (!state.dns) {
    return { error: `Ping request could not find host ${raw}. No DNS server is configured on this PC.` };
  }
  const dnsUp = pingCheck(topo, links, states, deviceId, state.dns);
  if (!dnsUp.ok) {
    return {
      error: `Ping request could not find host ${raw}. The DNS server ${state.dns} is not answering — ${dnsUp.detail || "check the path to it"}`
    };
  }
  const ip = resolveName(states, raw);
  if (!ip) {
    return { error: `Ping request could not find host ${raw}. Please check the name and try again.` };
  }
  return { ip };
}

function knownNamesFor(states, ip) {
  const names = [];
  for (const [name, deviceId] of Object.entries(DNS_ZONE)) {
    if (deviceAddress(states.devices[deviceId]) === ip) names.push(name);
  }
  return names;
}

/* ------------------------------------------------------------------ *
 * Command execution
 * ------------------------------------------------------------------ */


/**
 * Execute one command line for one device.
 * `session` is UI state (mode, current interface) and is round-tripped.
 */
const {
  promptFor,
  starts,
  hostHelp,
  runHostCommand,
  runIosCommand,
  iosVersion
} = require("./net-sim-cli")({
  dhcpRequest,
  applyLease,
  addressInUse,
  addressingWarnings,
  resolveName,
  resolveForHost,
  knownNamesFor,
  pingCheck,
  cableProblemFor,
  linkIndexFor,
  plugged,
  peerOf,
  wifiFailureText,
  showIpIntBrief,
  showVlanBrief,
  showRunningConfig,
  showIpRoute,
  showIpNatTranslations,
  showIpNatStatistics,
  pingLinesWindows,
  pingLinesIos,
  longIfName,
  normalizeIfName,
  isIpv4,
  isValidMask,
  sameSubnet,
  macFor,
  linkLocalV6,
  globalV6,
  hardware,
  wireless,
  dhcp,
  printers,
  ensureNat,
  recordTranslation,
  DNS_SUFFIX
});

function execute({ topo, links, states, deviceId, session, command }) {
  const state = states.devices[deviceId];
  if (!state) {
    return { output: ["% Unknown device."], session, prompt: ">", changed: false };
  }
  const nextSession = {
    mode: session?.mode || (state.kind === "host" ? "dos" : "user"),
    iface: session?.iface || null,
    vlan: session?.vlan || null
  };
  if (state.kind === "host") nextSession.mode = "dos";

  // A PC that will not power on, boot, show a picture or take a keystroke has
  // no command prompt, so every command gets the same answer until the
  // hardware is fixed. Anything else would let a student ping their way out
  // of a machine that is physically dead.
  const gate = hardware.gateLines(state);
  if (gate) {
    return { output: gate, session: nextSession, prompt: promptFor(state, nextSession), clear: false, close: false, changed: false };
  }

  const ctx = { state, session: nextSession, topo, links, states, deviceId };
  const result = state.kind === "host" ? runHostCommand(ctx, command) : runIosCommand(ctx, command);

  return {
    output: result.output || [],
    session: nextSession,
    prompt: promptFor(state, nextSession),
    clear: Boolean(result.clear),
    close: Boolean(result.close),
    changed: Boolean(result.changed)
  };
}

function publicNote(pub) {
  if (!pub) return "Public address: none (no NAT rule covers this address)";
  if (pub.how === "native") return "This address is already public — nothing translates it";
  if (pub.how === "static") return `Public ${pub.ip} — static 1:1 on ${pub.via}`;
  return `Public ${pub.ip} — PAT via ${pub.via}, shared with the rest of the site`;
}

/** How a host got its address — shown under the name on the map. */
function hostAddressMeta(state) {
  if (!state.ip) return "no IP";
  if (dhcp.isApipa(state.ip)) return "no DHCP lease";
  if (state.dhcp) return `${state.ip} · DHCP`;
  return state.ip;
}

/**
 * Why this host has no link right now — same cases ipconfig reports as
 * "Media disconnected". Returns a short map badge, or null when the NIC
 * can see something.
 */
function hostMediaBadge(topo, links, states, deviceId) {
  const state = states.devices[deviceId];
  if (!state || state.kind !== "host") return null;
  if (hardware.nicDown(state)) return "Media disconnected";

  if (state.os === "laptop") {
    if (state.wifi && !state.wifi.radio) return "wireless off";
    const assoc = wireless.associationFor(topo, states, deviceId);
    if (!assoc.ok) return "Media disconnected";
    return null;
  }

  const badCable = cableProblemFor(topo, links, deviceId);
  if (badCable) return "Media disconnected";

  const node = topo.nodes.find((n) => n.id === deviceId);
  if (!node) return null;
  const linkIndex = linkIndexFor(topo, links, states);
  const hasLink = (node.ports || [])
    .filter((p) => !/^Wlan/i.test(p.id))
    .some((p) => plugged(linkIndex, `${deviceId}:${p.id}`));
  return hasLink ? null : "Media disconnected";
}

/** Per-device text for the map: a live address on every box. */
function deviceLabels(topo, states, links = []) {
  const out = {};
  const publicOf = natPublicMap(states);
  for (const node of topo.nodes) {
    const state = states.devices[node.id];
    if (!state) continue;
    const detail = [];

    if (state.kind === "host") {
      const pub = publicOf(state.ip);
      // A printer's front panel and a laptop's radio are the first thing a
      // technician wants to know about, so they go on the map itself.
      const stop = state.printer ? printers.blocked(state.printer) : null;
      const media = hostMediaBadge(topo, links, states, node.id);
      const badge = stop
        ? stop.short || stop.panel
        : state.printer && state.printer.queue
          ? `${state.printer.queue} job(s) queued`
          : state.dhcpService && !state.dhcpService.enabled
            ? "DHCP service stopped"
            : media
              ? media
              : dhcp.isApipa(state.ip)
                ? "no DHCP lease"
                : state.ipConflict
                  ? "duplicate address"
                  : // A machine with no address at all is broken, whatever
                    // took the address away, so it is flagged like the rest.
                    state.ip
                    ? null
                    : "no IP";
      const addressLine = hostAddressMeta(state);
      // Desk PCs and laptops always show IP / DHCP / no IP on the box.
      // Servers and printers may keep a short role, but still expose the address.
      const isDesk = state.os === "pc" || state.os === "laptop";
      const meta = badge
        ? badge
        : isDesk
          ? addressLine
          : node.role
            ? `${node.role} · ${state.ip || "no IP"}`
            : addressLine;
      const how =
        !state.ip || dhcp.isApipa(state.ip)
          ? "Addressing: none"
          : state.dhcp
            ? "Addressing: DHCP"
            : "Addressing: static";
      out[node.id] = {
        label: state.hostname || node.label,
        meta,
        alert: Boolean(badge),
        tooltip: [
          `${state.hostname}${node.role ? " · " + node.role : ""}`,
          `IP ${state.ip || "unset"}  Mask ${state.mask || "unset"}`,
          `Gateway ${state.gateway || "unset"}`,
          how,
          ...(media
            ? ["Link: Media disconnected — plug a cable (or join Wi-Fi) before trusting the address"]
            : []),
          ...(state.wifi ? [`Wi-Fi ${state.wifi.radio ? state.wifi.ssid || "(no network set)" : "radio off"}`] : []),
          ...(stop ? [stop.say] : []),
          ...(state.ip && !dhcp.isApipa(state.ip) && !media ? [publicNote(pub)] : []),
          "Click to open the command prompt"
        ].join("\n")
      };
      continue;
    }

    if (state.radio) {
      out[node.id] = {
        label: state.hostname || node.label,
        // The box is only wide enough for the network name; the band, the
        // channel and the security are a hover away.
        meta: state.radio.enabled ? state.radio.ssid : "radio off",
        alert: !state.radio.enabled,
        tooltip: [
          `${state.hostname} · access point`,
          `SSID ${state.radio.ssid}`,
          `Radio ${state.radio.enabled ? "on" : "administratively down"} · ${state.radio.band} GHz channel ${state.radio.channel}`,
          `Security ${state.radio.security === "open" ? "open" : "WPA2-PSK"}`,
          "Click to open the console"
        ].join("\n")
      };
      continue;
    }

    if (state.kind === "switch") {
      const vlans = [
        ...new Set(
          Object.values(state.ports)
            .filter((p) => p.mode === "access")
            .map((p) => Number(p.vlan))
        )
      ].sort((a, b) => a - b);
      // A switch carries no address, so the label says what it does carry:
      // the VLAN its desks sit in and how many of its ports are in use.
      const svis = Object.entries(state.svi).filter(([, cfg]) => cfg.ip);
      const vlanText = vlans.length <= 2 ? `VLAN${vlans.join("/")}` : `${vlans.length} VLANs`;
      const pub = svis.length ? publicOf(svis[0][1].ip) : null;
      out[node.id] = {
        label: state.hostname || node.label,
        meta: svis.length ? `${vlanText} · ${svis[0][1].ip}` : vlanText,
        tooltip: [
          state.hostname,
          `Access VLANs: ${vlans.join(", ") || "none"}`,
          svis.length
            ? svis.map(([vid, cfg]) => `Vlan${vid} ${cfg.ip} ${cfg.mask}`).join("\n")
            : "No IP address — a switch passes frames, it does not answer pings. The .1 gateway lives on the department router.",
          ...(svis.length ? [publicNote(pub)] : []),
          "Click to open the IOS console"
        ].join("\n")
      };
      continue;
    }

    const addressed = Object.entries(state.ifaces).filter(([, i]) => i.ip);
    for (const [pid, i] of addressed) {
      const role = i.nat === "inside" ? " · inside" : i.nat === "outside" ? " · outside" : "";
      detail.push(`${longIfName(pid)} ${i.ip}${i.shutdown ? " (shut)" : ""}${role}`);
    }
    // Lead with an inside address, which is the one a student is looking for.
    // A mostly public router — the provider's core, with one cloud-facing leg
    // against five backbone ports — leads with its public address instead, so
    // the ISP tier reads consistently.
    const priv = addressed.filter(([, i]) => isPrivateIpv4(i.ip));
    const primary = (priv.length >= addressed.length - priv.length ? priv[0] : null) || addressed[0];
    const pub = primary ? publicOf(primary[1].ip) : null;
    out[node.id] = {
      label: state.hostname || node.label,
      meta: primary
        ? `${primary[1].ip}${addressed.length > 1 ? ` +${addressed.length - 1} more` : ""}`
        : "no IP",
      tooltip: [
        state.hostname,
        ...detail,
        ...(primary ? [publicNote(pub)] : []),
        "Click to open the IOS console"
      ].join("\n")
    };
  }
  return out;
}

function deviceSummary(topo, links, states, deviceId) {
  const state = states.devices[deviceId];
  const node = topo.nodes.find((n) => n.id === deviceId);
  if (!state || !node) return null;
  const linkIndex = linkIndexFor(topo, links, states);
  // Radio slots are not sockets, so they are left out of the count of what is
  // cabled — an access point with one uplink is fully cabled, not one in seven.
  const sockets = node.ports.filter((p) => !/^Wlan/i.test(p.id));
  const cabled = sockets.filter((p) => linkIndex.has(`${deviceId}:${p.id}`)).length;
  const media = state.kind === "host" ? hostMediaBadge(topo, links, states, deviceId) : null;
  return {
    id: deviceId,
    label: node.label,
    type: node.type,
    kind: state.kind,
    hostname: state.hostname,
    ip: state.kind === "host" ? state.ip : "",
    // True when ipconfig would say Media disconnected — banner must not
    // advertise the configured address as if the link were up.
    mediaDown: Boolean(media),
    mediaLabel: media || null,
    ports: sockets.length,
    cabled,
    prompt: promptFor(state, { mode: state.kind === "host" ? "dos" : "user" }),
    // The parts list travels with the device, so the window can offer a
    // hardware tab without a second round trip.
    hardware: state.os === "printer" ? printers.panelFor(state) : hardware.panelFor(state, deviceId),
    gate: hardware.gateLines(state),
    warnings: hardware.warningLines(state)
  };
}

function dnsNames() {
  return Object.keys(DNS_ZONE);
}

/** deviceId → the published names that point at it. */
function dnsNamesByDevice() {
  const out = {};
  for (const [name, deviceId] of Object.entries(DNS_ZONE)) {
    if (!out[deviceId]) out[deviceId] = [];
    out[deviceId].push(name);
  }
  return out;
}

module.exports = {
  dnsNames,
  dnsNamesByDevice,
  defaultDeviceStates,
  normalizeDeviceStates,
  execute,
  deviceLabels,
  deviceSummary,
  pingCheck,
  isIpv4,
  hardware,
  cabling,
  wireless,
  dhcp,
  printers,
  // The radio links that exist right now, so the map can draw them and the
  // tests can assert on them.
  wirelessLinks: (topo, states) => wireless.associations(topo, states),
  dhcpRequest,
  addressInUse,
  addressingWarnings,
  cableProblemFor,
  macFor,
  linkLocalV6,
  globalV6,
  STATE_SCHEMA
};
