const store = require("../data/store");
const labFaults = require("../domain/lab/lab-faults");

/**
 * Undoes whatever the given tickets planted: cables go back in, broken parts
 * are made good again. Throwing away a ticket has to undo its fault too, or
 * the lab keeps a dead PC that nothing on the queue explains any more.
 *
 * A student may already have fixed one and plugged something else into that
 * port, so a cable only goes back when both of its ports are still free, and
 * a part is only healed when the exact planted fault is still on it.
 */
function undoTicketFaults(db, classId, tickets) {
  const netSim = require("../domain/lab/net-sim");
  const state = store.ensureClassMap(db, classId);
  const devices = store.ensureClassDevices(db, classId);
  const inUse = new Set(state.links.flatMap((l) => [l.a, l.b]));
  let replugged = 0;
  let repaired = 0;
  let restored = 0;

  for (const ticket of tickets) {
    const fault = ticket.fault;
    if (!fault) continue;
    for (const link of fault.links || []) {
      if (inUse.has(link.a) || inUse.has(link.b)) continue;
      state.links.push(link);
      inUse.add(link.a);
      inUse.add(link.b);
      replugged += 1;
    }
    if (fault.type === "hardware") {
      if (netSim.hardware.clear(devices.devices[fault.device], fault.component, fault.fault)) repaired += 1;
    }
    if (fault.type === "device") {
      if (labFaults.undo(fault, devices)) restored += 1;
    }
  }
  return { replugged, repaired, restored };
}

/**
 * Re-breaks the parts named by hardware tickets that are still open.
 */
function applyOpenHardwareFaults(db, classId) {
  const netSim = require("../domain/lab/net-sim");
  const devices = store.ensureClassDevices(db, classId);
  const broken = [];
  const open = store
    .classTickets(db, classId)
    .filter((t) => t.fault && t.fault.type === "hardware" && !["resolved", "closed"].includes(t.status));

  for (const ticket of open) {
    const spot = netSim.hardware.plant(devices.devices[ticket.fault.device], ticket.fault.fault, null);
    if (spot && ticket.fault.component !== spot.component) {
      netSim.hardware.clear(devices.devices[ticket.fault.device], spot.component, spot.fault);
      devices.devices[ticket.fault.device].hw[ticket.fault.component] = ticket.fault.fault;
    }
    if (spot) broken.push(ticket.fault.device);
  }
  return broken;
}

/**
 * Re-plants the device-state faults of tickets that are still open.
 */
function applyOpenDeviceFaults(db, classId) {
  const devices = store.ensureClassDevices(db, classId);
  const touched = [];
  const open = store
    .classTickets(db, classId)
    .filter((t) => t.fault && t.fault.type === "device" && !["resolved", "closed"].includes(t.status));

  for (const ticket of open) {
    if (labFaults.reapply(ticket.fault, devices)) touched.push(ticket.fault.device);
  }
  return touched;
}

/**
 * Unplugs the cables named by lab-map tickets that are still open.
 */
function applyOpenTicketFaults(db, classId) {
  const state = store.ensureClassMap(db, classId);
  const pulled = [];
  const open = store
    .classTickets(db, classId)
    .filter((t) => t.fault && t.fault.type === "cable-unplugged" && !["resolved", "closed"].includes(t.status));

  for (const ticket of open) {
    const device = ticket.fault.device;
    const touches = (endpoint) => String(endpoint).split(":")[0] === device;
    const before = state.links.length;
    state.links = state.links.filter((l) => !(touches(l.a) || touches(l.b)));
    if (state.links.length !== before) pulled.push(device);
  }
  return pulled;
}

module.exports = {
  undoTicketFaults,
  applyOpenHardwareFaults,
  applyOpenDeviceFaults,
  applyOpenTicketFaults
};
