/**
 * The faults that are planted as device state.
 *
 * A cable fault is planted by pulling a cable off the map and a hardware
 * fault by breaking a part inside a PC. This file covers the third kind: the
 * ones that live in a device's own settings — a stopped DHCP service, an
 * address somebody typed in by hand, a jammed printer, a laptop that will not
 * join its network.
 *
 * Every plant keeps a small snapshot of what it changed, so throwing a ticket
 * away puts the lab back exactly as it was, the same way replugging a cable
 * does. Nothing here reaches for the map: these faults are true wherever the
 * student has cabled things.
 */

const labMap = require("./lab-map");
const printers = require("./printers");
const dhcp = require("./dhcp");

/** A gateway that belongs to a different department: off-subnet and wrong. */
const STRAY_GATEWAY = "10.10.55.1";

/** Fields worth remembering before a fault is written over them. */
const HOST_FIELDS = ["ip", "mask", "gateway", "dns", "dhcp", "ipConflict", "lease"];

function snapshot(state, fields) {
  const out = {};
  for (const f of fields) out[f] = state[f] && typeof state[f] === "object" ? { ...state[f] } : state[f];
  return out;
}

function restore(state, before) {
  if (!state || !before) return false;
  for (const [k, v] of Object.entries(before)) state[k] = v;
  return true;
}

/** The access point that serves a given laptop, from the design tables. */
function apForLaptop(laptopId) {
  const plan = labMap.wifiPlan().find((w) => w.laptops.some((l) => l.id === laptopId));
  return plan || null;
}

/** Another live address in the same subnet, for the duplicate-address fault. */
function neighbourAddress(states, deviceId, ip) {
  const prefix = String(ip).split(".").slice(0, 3).join(".");
  for (const [id, s] of Object.entries(states.devices)) {
    if (id === deviceId || s.kind !== "host" || !s.ip) continue;
    if (s.ip.startsWith(`${prefix}.`) && s.ip !== ip) return s.ip;
  }
  return null;
}

/**
 * Plant one device fault. Returns the record to store on the ticket, or null
 * when this lab cannot carry that fault (a device that is not on the map, a
 * laptop with no access point).
 */
function plant(kind, detail, states, deviceId) {
  const state = states.devices[deviceId];
  if (!state) return null;
  const variant = detail?.variant || null;

  if (kind === "printer-fault") {
    if (!state.printer) return null;
    const before = { printer: { ...state.printer } };
    state.printer = printers.applyFault(state.printer, detail.fault);
    return { type: "device", kind, device: deviceId, variant: detail.fault, before };
  }

  if (kind === "dhcp-no-address") {
    const server = states.devices[dhcp.SERVER_ID];
    if (!server || !server.dhcpService) return null;
    const before = {
      host: snapshot(state, HOST_FIELDS),
      service: { ...server.dhcpService }
    };
    // Whatever is wrong on the path, the desk shows the same thing: the
    // machine gave up waiting and configured itself.
    state.dhcp = true;
    state.ip = dhcp.apipaFor(state.hostname);
    state.mask = dhcp.APIPA_MASK;
    state.gateway = "";
    state.lease = null;
    state.ipConflict = false;
    if (variant === "scope-full") server.dhcpService.poolFull = true;
    else if (variant === "bad-gateway-option") server.dhcpService.badGateway = STRAY_GATEWAY;
    else server.dhcpService.enabled = false;
    return { type: "device", kind, device: deviceId, variant: variant || "service-stopped", target: dhcp.SERVER_ID, before };
  }

  if (kind === "pc-misconfigured") {
    if (!state.ip) return null;
    const before = { host: snapshot(state, HOST_FIELDS) };
    const octets = state.ip.split(".");
    state.dhcp = false;
    state.lease = null;
    if (variant === "wrong-subnet") {
      // The address of the same desk number in a department it does not
      // belong to — the classic result of copying settings from a note.
      state.ip = `10.10.55.${octets[3]}`;
    } else if (variant === "wrong-mask") {
      state.mask = "255.255.255.240";
    } else if (variant === "duplicate") {
      const taken = neighbourAddress(states, deviceId, state.ip);
      if (!taken) return null;
      state.ip = taken;
      state.ipConflict = true;
    } else {
      state.gateway = `${octets[0]}.${octets[1]}.${octets[2]}.254`;
    }
    return { type: "device", kind, device: deviceId, variant: variant || "bad-gateway", before };
  }

  if (kind === "wifi-offline") {
    if (!state.wifi) return null;
    const plan = apForLaptop(deviceId);
    if (!plan) return null;
    const ap = states.devices[plan.ap];
    if (!ap || !ap.radio) return null;
    const before = { wifi: { ...state.wifi }, radio: { ...ap.radio }, host: snapshot(state, HOST_FIELDS) };
    if (variant === "wrong-key") state.wifi.key = "Bahrain#2023";
    else if (variant === "wrong-ssid") state.wifi.ssid = "ProCloud-Guest";
    else if (variant === "ap-radio-down") ap.radio.enabled = false;
    else state.wifi.radio = false;
    // A laptop that cannot associate has no lease either.
    state.ip = "";
    state.mask = "";
    state.gateway = "";
    state.lease = null;
    return { type: "device", kind, device: deviceId, variant: variant || "radio-off", target: plan.ap, before };
  }

  return null;
}

/**
 * Put back whatever this fault changed. Called when a ticket is deleted, so
 * the lab never keeps a fault no ticket explains.
 */
function undo(fault, states) {
  if (!fault || fault.type !== "device") return false;
  const state = states.devices[fault.device];
  if (!state) return false;
  const before = fault.before || {};
  let done = false;

  if (before.printer && state.printer) {
    state.printer = printers.normalizeState(before.printer);
    done = true;
  }
  if (before.host) done = restore(state, before.host) || done;
  if (before.wifi && state.wifi) done = restore(state.wifi, before.wifi) || done;
  if (before.service) {
    const server = states.devices[dhcp.SERVER_ID];
    if (server && server.dhcpService) {
      server.dhcpService = dhcp.normalizeService(before.service);
      done = true;
    }
  }
  if (before.radio && fault.target) {
    const ap = states.devices[fault.target];
    if (ap && ap.radio) done = restore(ap.radio, before.radio) || done;
  }
  return done;
}

/**
 * Plant this fault again. A class reset wipes every device back to the design,
 * which would quietly retire the tickets that are still open, so those faults
 * are written back on — the same reasoning as re-pulling their cables.
 */
function reapply(fault, states) {
  if (!fault || fault.type !== "device") return false;
  const detail = fault.kind === "printer-fault" ? { fault: fault.variant } : { variant: fault.variant };
  return Boolean(plant(fault.kind, detail, states, fault.device));
}

module.exports = { plant, undo, reapply, apForLaptop, STRAY_GATEWAY };
