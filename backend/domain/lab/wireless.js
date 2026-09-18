/**
 * Wi-Fi for the lab map.
 *
 * An access point is a switch with radio ports: one uplink cable into its
 * department switch, and a handful of wireless slots. A laptop has no cable
 * at all — it is associated to an access point, or it is not on the network.
 *
 * Associations are worked out fresh every time the simulator looks at the
 * lab, from three things a student can see and change: the SSID and key on
 * the laptop, the SSID, key and radio state on the access point, and how far
 * apart the two are on the map. Everything downstream — VLANs, DHCP, routing,
 * ping — then treats the association as an ordinary link, so a laptop on
 * Wi-Fi is troubleshot exactly like a PC on a cable.
 */

/** Below this, the laptop sees the network listed but cannot hold a link. */
const MIN_SIGNAL = 28;

/** Map units at which signal has fallen to nothing. Roughly two departments. */
const DEFAULT_RANGE = 430;

const CLIENT_PORT = "Wlan0";

/** Security modes an access point can be set to. */
const SECURITY = ["wpa2", "open"];

function apNodes(topo) {
  return (topo?.nodes || []).filter((n) => n.type === "ap");
}

function clientNodes(topo) {
  return (topo?.nodes || []).filter((n) => n.type === "laptop");
}

/** The radio as the design ships it. */
function defaultRadio(node) {
  return {
    ssid: String(node.ssid || "ProCloud-Staff"),
    key: String(node.wifiKey || ""),
    security: node.security === "open" ? "open" : "wpa2",
    band: node.band === "5" ? "5" : "2.4",
    channel: Number(node.channel) || 6,
    range: Number(node.range) || DEFAULT_RANGE,
    enabled: true
  };
}

function normalizeRadio(saved, base) {
  if (!saved || typeof saved !== "object") return base;
  return {
    ssid: typeof saved.ssid === "string" ? saved.ssid.slice(0, 32) : base.ssid,
    key: typeof saved.key === "string" ? saved.key.slice(0, 63) : base.key,
    security: SECURITY.includes(saved.security) ? saved.security : base.security,
    band: saved.band === "5" || saved.band === "2.4" ? saved.band : base.band,
    channel: Number.isFinite(Number(saved.channel)) ? Number(saved.channel) : base.channel,
    range: Number.isFinite(Number(saved.range)) ? Math.max(0, Number(saved.range)) : base.range,
    enabled: saved.enabled !== false
  };
}

/** What the laptop is configured to look for. */
function defaultWifi(node) {
  return {
    ssid: String(node.ssid || "ProCloud-Staff"),
    key: String(node.wifiKey || ""),
    // A laptop with its radio switched off is a real ticket, so it is a state
    // a student can see and change rather than something implied.
    radio: true
  };
}

function normalizeWifi(saved, base) {
  if (!saved || typeof saved !== "object") return base;
  return {
    ssid: typeof saved.ssid === "string" ? saved.ssid.slice(0, 32) : base.ssid,
    key: typeof saved.key === "string" ? saved.key.slice(0, 63) : base.key,
    radio: saved.radio !== false
  };
}

function distance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * How much signal is lost getting into another department. Two desks either
 * side of a wall are close together on the map and a long way apart on the
 * radio, which is why an access point in the next office is something a
 * laptop can hear but not use.
 */
const WALL_LOSS = 55;

/** 100% on top of the access point, 0% at the edge of its range. */
function signalBetween(clientNode, apNode, radio) {
  const range = radio.range || DEFAULT_RANGE;
  if (!range) return 0;
  const d = distance(clientNode, apNode);
  const walls = clientNode.place && apNode.place && clientNode.place !== apNode.place ? WALL_LOSS : 0;
  return Math.max(0, Math.round(100 - (d / range) * 100) - walls);
}

function bars(signal) {
  if (signal >= 70) return "▮▮▮▮";
  if (signal >= 50) return "▮▮▮_";
  if (signal >= MIN_SIGNAL) return "▮▮__";
  if (signal > 0) return "▮___";
  return "____";
}

/**
 * Every network this laptop can hear, strongest first, whether or not its own
 * settings match. This is what `wifi scan` prints.
 */
function scan(topo, states, clientId) {
  const client = (topo?.nodes || []).find((n) => n.id === clientId);
  if (!client) return [];
  const out = [];
  for (const ap of apNodes(topo)) {
    const state = states?.devices?.[ap.id];
    const radio = state?.radio || defaultRadio(ap);
    if (!radio.enabled) continue;
    const signal = signalBetween(client, ap, radio);
    if (signal <= 0) continue;
    out.push({
      apId: ap.id,
      ssid: radio.ssid,
      security: radio.security,
      band: radio.band,
      channel: radio.channel,
      signal,
      bars: bars(signal),
      usable: signal >= MIN_SIGNAL
    });
  }
  return out.sort((a, b) => b.signal - a.signal);
}

/**
 * Why this laptop is or is not on the air. Returns the chosen access point
 * plus a reason code the CLI turns into an explanation.
 */
function associationFor(topo, states, clientId) {
  const client = (topo?.nodes || []).find((n) => n.id === clientId);
  const clientState = states?.devices?.[clientId];
  if (!client || !clientState) return { ok: false, reason: "unknown" };
  const wifi = clientState.wifi || defaultWifi(client);
  if (!wifi.radio) return { ok: false, reason: "radio-off", wifi };
  if (!wifi.ssid) return { ok: false, reason: "no-ssid", wifi };

  const heard = scan(topo, states, clientId);
  const named = heard.filter((n) => n.ssid === wifi.ssid);
  if (!named.length) {
    return { ok: false, reason: "ssid-not-found", wifi, heard };
  }
  const usable = named.filter((n) => n.usable);
  if (!usable.length) {
    return { ok: false, reason: "weak-signal", wifi, heard, best: named[0] };
  }
  const pick = usable[0];
  const radio = states.devices[pick.apId]?.radio || {};
  if (radio.security !== "open" && String(radio.key || "") !== String(wifi.key || "")) {
    return { ok: false, reason: "bad-key", wifi, heard, best: pick };
  }
  return { ok: true, apId: pick.apId, signal: pick.signal, wifi, heard, best: pick };
}

/**
 * The wireless links that exist right now, in the shape of map links so the
 * forwarding code cannot tell them apart from cables. Each laptop takes one
 * radio slot on its access point; when the slots are full the rest are turned
 * away, which is the wireless version of a switch with no free ports.
 */
function associations(topo, states) {
  if (!states?.devices) return [];
  const out = [];
  const usedSlots = new Map();

  for (const client of clientNodes(topo)) {
    const verdict = associationFor(topo, states, client.id);
    if (!verdict.ok) continue;
    const apNode = (topo.nodes || []).find((n) => n.id === verdict.apId);
    if (!apNode) continue;
    const slots = apNode.ports.filter((p) => /^Wlan/i.test(p.id)).map((p) => p.id);
    const taken = usedSlots.get(verdict.apId) || new Set();
    const free = slots.find((s) => !taken.has(s));
    if (!free) continue;
    taken.add(free);
    usedSlots.set(verdict.apId, taken);
    out.push({
      id: `W-${client.id}`,
      a: `${client.id}:${CLIENT_PORT}`,
      b: `${verdict.apId}:${free}`,
      cable: "wireless",
      signal: verdict.signal
    });
  }
  return out;
}

module.exports = {
  MIN_SIGNAL,
  DEFAULT_RANGE,
  WALL_LOSS,
  CLIENT_PORT,
  SECURITY,
  apNodes,
  clientNodes,
  defaultRadio,
  normalizeRadio,
  defaultWifi,
  normalizeWifi,
  signalBetween,
  bars,
  scan,
  associationFor,
  associations
};
