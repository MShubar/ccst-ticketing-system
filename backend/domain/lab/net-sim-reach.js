/**
 * L2/L3 reachability and ping for the classroom network simulator.
 */
const cabling = require("./cabling");
const wireless = require("./wireless");
const hardware = require("./hardware");
const dhcp = require("./dhcp");
const {
  isIpv4,
  sameSubnet,
  networkOf,
  ipToInt,
  intToIp,
  isValidMask,
  maskToPrefix,
  networkAddress
} = require("./net-ip");
const { longIfName } = require("./net-if");

/**
 * Endpoint → what is on the other end of its cable.
 *
 * Each entry carries the cable type and, when the wrong cable was used for
 * that pair of devices, the reason it does not pass frames. A console cable
 * or a fiber lead in a desk PC is a dead link, exactly like an unplugged one,
 * but the sim keeps the reason so the CLI can say which it is.
 */
function buildLinkIndex(links, topo) {
  const index = new Map();
  const typeOf = new Map((topo?.nodes || []).map((n) => [n.id, n.type]));
  const deviceOf = (key) => String(key).slice(0, String(key).indexOf(":"));
  for (const l of links || []) {
    const verdict = cabling.check(typeOf.get(deviceOf(l.a)), typeOf.get(deviceOf(l.b)), l.cable);
    const bad = verdict.ok ? null : verdict.error;
    index.set(l.a, { peer: l.b, cable: l.cable, bad, want: verdict.want });
    index.set(l.b, { peer: l.a, cable: l.cable, bad, want: verdict.want });
  }
  return index;
}

/**
 * Every link the sim should forward over: the student's cables plus the
 * wireless associations the radios have made this instant.
 */
function activeLinks(topo, links, states) {
  return wireless.associations(topo, states).concat(links || []);
}

/** The forwarding index for one look at the lab. */
function linkIndexFor(topo, links, states) {
  return buildLinkIndex(activeLinks(topo, links, states), topo);
}

/** A cable that is both present and able to carry traffic. */
function plugged(linkIndex, endpointKey) {
  const entry = linkIndex.get(endpointKey);
  return Boolean(entry && !entry.bad);
}

/** The peer endpoint key of a usable cable, or null. */
function peerOf(linkIndex, endpointKey) {
  const entry = linkIndex.get(endpointKey);
  return entry && !entry.bad ? entry.peer : null;
}

/**
 * The first wrong cable plugged into this device, described for a person.
 * Used to turn "nothing answered" into "you used a console cable".
 */
function cableProblemFor(topo, links, deviceId) {
  const typeOf = new Map((topo?.nodes || []).map((n) => [n.id, n.type]));
  for (const l of links || []) {
    for (const [near, far] of [
      [l.a, l.b],
      [l.b, l.a]
    ]) {
      if (String(near).slice(0, String(near).indexOf(":")) !== deviceId) continue;
      const verdict = cabling.check(
        typeOf.get(String(near).slice(0, String(near).indexOf(":"))),
        typeOf.get(String(far).slice(0, String(far).indexOf(":"))),
        l.cable
      );
      if (verdict.ok) continue;
      const port = String(near).slice(String(near).indexOf(":") + 1);
      return {
        portId: port,
        peer: far,
        cable: l.cable,
        want: verdict.want,
        detail: `${port} has a ${cabling.label(l.cable)} cable in it. ${verdict.error}`
      };
    }
  }
  return null;
}

function portCarriesVlan(port, vlan) {
  if (!port || port.shutdown) return false;
  if (port.mode === "trunk") return true;
  return Number(port.vlan) === Number(vlan);
}

/**
 * Flood a frame out of one port and collect every L3 endpoint it reaches.
 * Returns [{ deviceId, portId, vlan }].
 */
function floodFrom(states, linkIndex, nodes, startDeviceId, startPortId, startVlan = null) {
  const found = [];
  const seen = new Set();
  const queue = [{ deviceId: startDeviceId, portId: startPortId, vlan: startVlan }];

  while (queue.length) {
    const hop = queue.shift();
    const key = `${hop.deviceId}:${hop.portId}|${hop.vlan}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const peerKey = peerOf(linkIndex, `${hop.deviceId}:${hop.portId}`);
    if (!peerKey) continue; // no cable, or the wrong cable for this pair
    const sep = peerKey.indexOf(":");
    const peerId = peerKey.slice(0, sep);
    const peerPort = peerKey.slice(sep + 1);
    const peerNode = nodes.get(peerId);
    const peerState = states.devices[peerId];
    if (!peerNode || !peerState) continue;

    if (peerState.kind === "host") {
      found.push({ deviceId: peerId, portId: peerPort, vlan: hop.vlan });
      continue;
    }
    if (peerState.kind === "router") {
      const iface = peerState.ifaces[peerPort];
      if (iface && !iface.shutdown) found.push({ deviceId: peerId, portId: peerPort, vlan: hop.vlan });
      continue;
    }

    // Switch: check the ingress port, then flood to the other ports.
    const inPort = peerState.ports[peerPort];
    if (!inPort || inPort.shutdown) continue;
    let vlan;
    if (inPort.mode === "trunk") {
      vlan = hop.vlan == null ? 1 : hop.vlan;
    } else {
      if (hop.vlan != null && Number(hop.vlan) !== Number(inPort.vlan)) continue;
      vlan = Number(inPort.vlan);
    }

    const sviCfg = peerState.svi[String(vlan)];
    if (sviCfg && sviCfg.ip && !sviCfg.shutdown) {
      found.push({ deviceId: peerId, portId: `Vlan${vlan}`, vlan });
    }

    for (const [pid, port] of Object.entries(peerState.ports)) {
      if (pid === peerPort) continue;
      if (!portCarriesVlan(port, vlan)) continue;
      queue.push({ deviceId: peerId, portId: pid, vlan: port.mode === "trunk" ? vlan : null });
    }
  }
  return found;
}

/** Every port a device can send from (hosts have one, routers many). */
function egressPorts(states, nodes, deviceId) {
  const node = nodes.get(deviceId);
  const state = states.devices[deviceId];
  if (!node || !state) return [];
  if (state.kind === "host") return node.ports.map((p) => p.id);
  if (state.kind === "router") {
    return node.ports.filter((p) => !state.ifaces[p.id]?.shutdown).map((p) => p.id);
  }
  return node.ports.filter((p) => !state.ports[p.id]?.shutdown).map((p) => p.id);
}

function addressOfEndpoint(states, endpoint) {
  const state = states.devices[endpoint.deviceId];
  if (!state) return null;
  if (state.kind === "host") {
    // A PC with no power, no operating system or a dead network card is on
    // the end of a good cable and still answers nothing. Neither does one
    // whose address Windows has disabled for being a duplicate.
    if (hardware.networkDown(state)) return null;
    if (state.ipConflict) return null;
    return state.ip ? { ip: state.ip, mask: state.mask, gateway: state.gateway } : null;
  }
  if (state.kind === "router") {
    const iface = state.ifaces[endpoint.portId];
    return iface && iface.ip && !iface.shutdown ? { ip: iface.ip, mask: iface.mask, gateway: "" } : null;
  }
  const vlanId = String(endpoint.portId).replace(/^Vlan/i, "");
  const svi = state.svi[vlanId];
  return svi && svi.ip ? { ip: svi.ip, mask: svi.mask, gateway: "" } : null;
}

/** Where does this device speak IP from, and out of which port? */
function localAddresses(states, nodes, deviceId) {
  const state = states.devices[deviceId];
  const node = nodes.get(deviceId);
  if (!state || !node) return [];
  if (state.kind === "host") {
    if (hardware.networkDown(state)) return [];
    if (state.ipConflict) return [];
    if (!state.ip) return [];
    return [{ ip: state.ip, mask: state.mask, gateway: state.gateway, portId: node.ports[0]?.id }];
  }
  if (state.kind === "router") {
    return Object.entries(state.ifaces)
      .filter(([, i]) => i.ip && !i.shutdown)
      .map(([portId, i]) => ({ ip: i.ip, mask: i.mask, gateway: "", portId }));
  }
  return Object.entries(state.svi)
    .filter(([, cfg]) => cfg.ip && !cfg.shutdown)
    .map(([vlanId, cfg]) => ({
      ip: cfg.ip,
      mask: cfg.mask,
      gateway: state.gateway || "",
      vlan: Number(vlanId)
    }));
}

function switchPortsForVlan(states, nodes, deviceId, vlan) {
  const state = states.devices[deviceId];
  const node = nodes.get(deviceId);
  if (!state || !node) return [];
  return node.ports.map((p) => p.id).filter((pid) => portCarriesVlan(state.ports[pid], vlan));
}

function reachableEndpoints(states, linkIndex, nodes, deviceId, fromPortId, vlan) {
  const state = states.devices[deviceId];
  if (state.kind === "switch" && vlan != null) {
    const out = [];
    for (const pid of switchPortsForVlan(states, nodes, deviceId, vlan)) {
      out.push(...floodFrom(states, linkIndex, nodes, deviceId, pid, state.ports[pid].mode === "trunk" ? vlan : null));
    }
    return out;
  }
  const ports = fromPortId ? [fromPortId] : egressPorts(states, nodes, deviceId);
  const out = [];
  for (const pid of ports) out.push(...floodFrom(states, linkIndex, nodes, deviceId, pid, null));
  return out;
}

/* ------------------------------------------------------------------ *
 * Layer 3 forwarding
 * ------------------------------------------------------------------ */

const MAX_HOPS = 16;

function ownsAddress(state, ip) {
  if (!state) return false;
  if (state.kind === "host") return state.ip === ip;
  if (state.kind === "router") {
    return Object.values(state.ifaces).some((i) => i.ip === ip && !i.shutdown);
  }
  return Object.values(state.svi).some((s) => s.ip === ip && !s.shutdown);
}

/**
 * One router's routing table, longest prefix first: directly connected
 * subnets plus static routes. More than one candidate for the same
 * destination is normal, so callers try them in order.
 */
function routeLookup(router, targetIp) {
  if (!router || router.kind !== "router") return [];
  const cands = [];
  for (const [portId, iface] of Object.entries(router.ifaces)) {
    if (!iface.ip || iface.shutdown || !isValidMask(iface.mask)) continue;
    if (!sameSubnet(iface.ip, targetIp, iface.mask)) continue;
    cands.push({ kind: "connected", portId, iface, prefix: maskToPrefix(iface.mask) });
  }
  for (const route of router.routes || []) {
    if (!isIpv4(route.network) || !isValidMask(route.mask)) continue;
    if (networkOf(targetIp, route.mask) !== networkOf(route.network, route.mask)) continue;
    cands.push({ kind: "static", nextHop: route.nextHop, prefix: maskToPrefix(route.mask) });
  }
  return cands.sort((a, b) => b.prefix - a.prefix);
}

/** Which port of `routerId` reaches `ip`, and what answers there? */
function neighborOn(ctx, routerId, ip) {
  const router = ctx.states.devices[routerId];
  if (!router || router.kind !== "router") return null;
  for (const [portId, iface] of Object.entries(router.ifaces)) {
    if (!iface.ip || iface.shutdown || !isValidMask(iface.mask)) continue;
    if (!sameSubnet(iface.ip, ip, iface.mask)) continue;
    const hit = floodFrom(ctx.states, ctx.linkIndex, ctx.nodes, routerId, portId, null).find((ep) => {
      const addr = addressOfEndpoint(ctx.states, ep);
      return addr && addr.ip === ip;
    });
    if (hit) return { portId, iface, endpoint: hit };
  }
  return null;
}

/**
 * Walk the packet from router to router, making one routing decision per hop,
 * until something owns `targetIp` or the path breaks. `hops` collects the
 * ingress address of each hop so traceroute can print the real path.
 */
function forwardThroughRouters(ctx, startRouterId, targetIp, hops) {
  let currentId = startRouterId;
  const visited = new Set();
  // Failures carry the hops already covered so traceroute can show how far
  // the packet actually got before the path broke.
  const fail = (reason, detail) => ({ ok: false, reason, detail, hops, stoppedAt: currentId });

  for (let i = 0; i < MAX_HOPS; i++) {
    const router = ctx.states.devices[currentId];
    if (!router) return fail("no-route", `${currentId} is not on the map.`);
    if (router.kind !== "router") {
      return fail("not-routing", `${router.hostname} is not a router, so it cannot forward traffic off the subnet.`);
    }
    if (visited.has(currentId)) return fail("routing-loop", `The packet is looping at ${router.hostname}.`);
    visited.add(currentId);

    // A router answers for every address it owns, whichever side it arrives on.
    if (ownsAddress(router, targetIp)) return { ok: true, hops, lastDeviceId: currentId };

    const routes = routeLookup(router, targetIp);
    if (!routes.length) return fail("no-route", `${router.hostname} has no route to ${targetIp}.`);

    // The packet has arrived if the destination's subnet is attached here. A
    // router never falls back to a default route for a subnet it fronts, so a
    // silent host is the end of the line, not a reason to keep forwarding —
    // otherwise an unplugged PC bounces between the site and its provider.
    const connected = routes.filter((r) => r.kind === "connected");
    if (connected.length) {
      for (const route of connected) {
        const hit = floodFrom(ctx.states, ctx.linkIndex, ctx.nodes, currentId, route.portId, null).find((ep) => {
          const addr = addressOfEndpoint(ctx.states, ep);
          return addr && addr.ip === targetIp;
        });
        if (hit) {
          hops.push(targetIp);
          return { ok: true, hops, lastDeviceId: hit.deviceId };
        }
      }
      const legs = connected.map((r) => longIfName(r.portId)).join(", ");
      return fail(
        "dest-unreachable",
        `${targetIp} is on a subnet attached to ${router.hostname} but did not answer on ${legs} — check the cable, the port status and the VLAN.`
      );
    }

    let problem = null;
    let nextRouterId = null;
    for (const route of routes) {
      const neighbor = neighborOn(ctx, currentId, route.nextHop);
      if (!neighbor) {
        problem = problem || fail("next-hop-down", `${router.hostname} cannot reach its next hop ${route.nextHop}.`);
        continue;
      }
      hops.push(route.nextHop);
      nextRouterId = neighbor.endpoint.deviceId;
      break;
    }

    if (!nextRouterId) return problem || fail("dest-unreachable", `${targetIp} is not answering.`);
    currentId = nextRouterId;
  }
  return fail("ttl", "TTL expired in transit — check for a routing loop.");
}

/** Why this machine's link is dead, when the addressing is not the problem. */
function mediaHint(topo, links, states, deviceId) {
  const state = states.devices[deviceId];
  const wrongCable = cableProblemFor(topo, links, deviceId);
  if (wrongCable) return { reason: "wrong-cable", detail: `Media disconnected — ${wrongCable.detail}` };
  if (state?.os === "laptop") {
    const assoc = wireless.associationFor(topo, states, deviceId);
    if (!assoc.ok) return { reason: "not-associated", detail: wifiFailureText(assoc) };
  }
  return null;
}

/**
 * Can `deviceId` reach `targetIp`? Returns a structured verdict the CLI
 * formats for Windows or IOS output.
 */
function pingCheck(topo, links, states, deviceId, targetIp, opts = {}) {
  const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
  const linkIndex = linkIndexFor(topo, links, states);
  const ctx = { nodes, linkIndex, states };
  const state = states.devices[deviceId];
  if (!state) return { ok: false, reason: "unknown-device" };

  const locals = localAddresses(states, nodes, deviceId);
  if (!locals.length) {
    // Say which of these it is. "No usable IP address" sends a student to
    // ipconfig when the real answer is a dead card, the wrong cable, a
    // duplicate address or a radio that never joined anything.
    if (hardware.nicDown(state)) {
      return {
        ok: false,
        reason: "media-disconnected",
        detail: "Media disconnected — this PC's network card is not connected. Check the Hardware tab."
      };
    }
    if (state.ipConflict) {
      return {
        ok: false,
        reason: "address-conflict",
        detail: `${state.ip} is a duplicate address, so Windows has disabled it on this adapter. Give this machine an address nothing else is using, or put it back on DHCP.`
      };
    }
    const hint = mediaHint(topo, links, states, deviceId);
    if (hint) return { ok: false, reason: hint.reason, detail: hint.detail };
    return { ok: false, reason: "no-ip", detail: "This device has no usable IP address." };
  }

  // A link-local address is not an address: the machine never got a lease, so
  // there is nothing to say about routes or gateways yet.
  if (state.kind === "host" && dhcp.isApipa(state.ip) && !dhcp.isApipa(targetIp)) {
    return {
      ok: false,
      reason: "apipa",
      detail: `${state.ip} is a 169.254 link-local address, which means no DHCP server answered. Nothing off this machine is reachable until it has a real lease — try ipconfig /renew and follow what it says.`
    };
  }
  if (locals.some((l) => l.ip === targetIp)) {
    return { ok: true, hops: [targetIp], source: targetIp };
  }

  // Every local address in the target's subnet is a candidate exit, not just
  // the first: R1-EDGE fronts 10.10.40.0/24 on two legs (SW-REC and SW-OPS).
  const directs = locals.filter((l) => l.mask && sameSubnet(l.ip, targetIp, l.mask));
  if (directs.length) {
    for (const direct of directs) {
      const reach = reachableEndpoints(states, linkIndex, nodes, deviceId, direct.portId, direct.vlan);
      const hit = reach.find((ep) => {
        const addr = addressOfEndpoint(states, ep);
        return addr && addr.ip === targetIp;
      });
      if (hit) return { ok: true, hops: [targetIp], source: direct.ip };
    }
    const hint = mediaHint(topo, links, states, deviceId);
    return {
      ok: false,
      reason: hint ? hint.reason : "no-l2-path",
      detail: hint
        ? hint.detail
        : `${targetIp} is in your subnet but nothing answered — check the cable, the port status and the VLAN.`
    };
  }

  // Off-subnet. Routers consult their own table; everything else has to hand
  // the packet to its default gateway first.
  const hops = [];
  let startRouterId;
  let source;

  if (state.kind === "router") {
    startRouterId = deviceId;
    // A router picks the interface it is asked to source from, which is how a
    // DHCP relay behaves: it forwards from the leg facing the client, not from
    // whichever interface happens to be listed first.
    source = (opts.source && locals.find((l) => l.ip === opts.source)?.ip) || locals[0].ip;
  } else {
    const withGw = locals.find((l) => l.gateway);
    if (!withGw) return { ok: false, reason: "no-gateway", detail: "No default gateway is configured." };
    source = withGw.ip;

    // An address that does not belong to the floor this machine is plugged
    // into gets nothing back, even from the router next to it: the reply is
    // addressed to a subnet that lives somewhere else, so it is routed there
    // and never comes here. This is what a hand-typed address usually breaks,
    // and without it the router would answer and the PC would look healthy.
    if (!sameSubnet(withGw.ip, withGw.gateway, withGw.mask)) {
      return {
        ok: false,
        reason: "wrong-subnet",
        detail: `${withGw.ip} ${withGw.mask} does not belong to this floor — its gateway ${withGw.gateway} is in another subnet, so replies to this machine are sent wherever ${networkAddress(withGw.ip, withGw.mask)} lives instead of coming back here. Compare all four settings with the documentation.`,
        source
      };
    }

    const gwEndpoint = reachableEndpoints(states, linkIndex, nodes, deviceId, withGw.portId, withGw.vlan).find(
      (ep) => {
        const addr = addressOfEndpoint(states, ep);
        return addr && addr.ip === withGw.gateway;
      }
    );
    if (!gwEndpoint) {
      const hint = mediaHint(topo, links, states, deviceId);
      const offSubnet = addressingWarnings(state).find((w) => w.includes("not inside this PC's own subnet"));
      return {
        ok: false,
        reason: hint ? hint.reason : "gateway-unreachable",
        detail: hint
          ? hint.detail
          : offSubnet || `The default gateway ${withGw.gateway} did not answer.`,
        source
      };
    }
    hops.push(withGw.gateway);
    startRouterId = gwEndpoint.deviceId;
  }

  const forward = forwardThroughRouters(ctx, startRouterId, targetIp, hops);
  if (!forward.ok) return { ...forward, source };

  // A reply has to find its own way home. Re-run the walk from the far end so
  // a missing return route at any hop shows up as the failure it really is.
  if (!opts.skipReturn) {
    const back = pingCheck(topo, links, states, forward.lastDeviceId, source, { skipReturn: true });
    if (!back.ok) {
      const far = states.devices[forward.lastDeviceId];
      return {
        ok: false,
        reason: "return-path",
        detail: `${far.hostname} received the ping but cannot reply: ${back.detail}`,
        source
      };
    }
  }

  return { ok: true, hops: forward.hops, source, via: startRouterId };
}

/* ------------------------------------------------------------------ *
 * Wi-Fi, in the words a technician would use
 * ------------------------------------------------------------------ */

function wifiFailureText(assoc) {
  const want = assoc?.wifi?.ssid || "(none)";
  switch (assoc?.reason) {
    case "radio-off":
      return "The wireless radio on this machine is switched off. Turn it on with: wifi on";
    case "no-ssid":
      return "This machine is not set to look for any network. Join one with: wifi join <ssid> <key>";
    case "ssid-not-found":
      return assoc.heard && assoc.heard.length
        ? `No network called "${want}" can be heard here. What this machine can hear: ${assoc.heard.map((n) => n.ssid).join(", ")}. Check the name with: wifi scan`
        : `No network called "${want}" can be heard here, and no other network can either — the access point may be unplugged or its radio may be off.`;
    case "weak-signal":
      return `"${want}" is only ${assoc.best ? assoc.best.signal : 0}% here, which is too weak to hold a link. Move closer to the access point, or have the access point looked at.`;
    case "bad-key":
      return `"${want}" answered but would not let this machine on: the wireless key does not match. Set the right one with: wifi join ${want} <key>`;
    default:
      return "This machine is not connected to any wireless network.";
  }
}

/* ------------------------------------------------------------------ *
 * Identity: MAC and IPv6
 *
 * The lab is IPv4 end to end, which is what the exam's addressing questions
 * are about. But a student who has only ever seen `ipconfig` in this lab
 * should still recognise what a real one shows them, so every adapter has a
 * burned-in MAC address, an IPv6 link-local address derived from it, and a
 * documentation-range global address. They are display only: nothing routes
 * over IPv6 here, and the sim says so rather than pretending.
 * ------------------------------------------------------------------ */

module.exports = {
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
};
