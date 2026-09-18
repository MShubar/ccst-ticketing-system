/**
 * Classroom ticket review: priority expectations, lab-fix checks, marks.
 */
const hardware = require("../lab/hardware");
const printers = require("../lab/printers");
const wireless = require("../lab/wireless");
const dhcp = require("../lab/dhcp");
const { topology } = require("../lab/lab-map");
const { defaultDeviceStates } = require("../lab/net-sim");
const {
  LAB_FAULT_KINDS,
  CABLE_FAULT_KINDS,
  HARDWARE_FAULT_KINDS,
  DEVICE_FAULT_KINDS
} = require("./ticket-gen");

function expectedPriorityFor(ticket) {
  const cat = String(ticket.category || "").toLowerCase();
  const text = `${ticket.title || ""} ${ticket.description || ""}`.toLowerCase();
  const kind = String(ticket.generatedBy?.kind || ticket.fault?.type || "").toLowerCase();
  const deptWide =
    /all (the )?(pcs?|computers?|machines?|desktops?)|entire (department|dept|floor|office|team)|whole (department|dept|floor|office|team)|every (pc|computer|machine)|department.?wide|everyone in/.test(
      text
    );

  // Generated ticket families first — most reliable signal.
  if (kind === "cloud-unreachable" || kind === "cloud") return "critical";
  if (kind === "cbs-invoice") return "high";
  if (kind === "password-reset") return "low";
  if (kind === "pc-offline" || kind === "pc-hardware" || kind === "hardware") {
    return deptWide ? "high" : "medium";
  }
  // One desk with no address or the wrong settings is one desk. A shared
  // printer or an access point is a room full of people, so it rates higher.
  if (kind === "dhcp-no-address" || kind === "pc-misconfigured") return deptWide ? "high" : "medium";
  if (kind === "printer-fault" || kind === "wifi-offline") return "medium";

  // Free-text / manual tickets.
  if (/(cloud|vm|virtual machine|batelco)/.test(text) && /(unreachable|down|cannot|won'?t|will not|offline|timeout|not responding)/.test(text)) {
    return "critical";
  }
  if (deptWide) return "high";
  if (/invoice|cbs|billing|refund|\bpost(ed|ing)?\b/.test(text) || cat.includes("billing")) return "high";
  if (/password|locked out|sign.?in|reset password|account (locked|reset)/.test(text) || cat.includes("access")) {
    return "low";
  }
  if (
    /no (network|internet|connection)|offline|blank screen|will not power|dead pc|hardware|one (pc|computer|machine)/.test(text) ||
    cat.includes("hardware") ||
    cat.includes("network")
  ) {
    return "medium";
  }
  if (/printer|toner|jam/.test(text)) return "low";
  return "medium";
}

function commentBlob(ticket) {
  return (ticket.comments || [])
    .map((c) => `${c.kind || "comment"}: ${c.body || ""}`)
    .join("\n");
}

function ticketKind(ticket) {
  const gb = ticket.generatedBy;
  if (gb && typeof gb === "object" && gb.kind) return String(gb.kind).toLowerCase();
  const device = String(ticket.fault?.device || ticket.title || "").toUpperCase();
  if (device.includes("CLOUD-VM") || device.startsWith("CLOUD")) return "cloud-unreachable";
  if (ticket.fault?.type === "hardware") return "pc-hardware";
  if (ticket.fault?.type === "cable-unplugged") return "pc-offline";
  if (ticket.fault?.type === "device") return String(ticket.fault.kind || "").toLowerCase();
  return String(typeof gb === "string" ? "" : gb?.kind || "").toLowerCase();
}

/** True when this ticket is meant to be fixed on the Lab map. */
function isLabMapTicket(ticket) {
  const kind = ticketKind(ticket);
  return (
    CABLE_FAULT_KINDS.includes(kind) ||
    HARDWARE_FAULT_KINDS.includes(kind) ||
    DEVICE_FAULT_KINDS.includes(kind) ||
    ticket.fault?.type === "cable-unplugged" ||
    ticket.fault?.type === "hardware" ||
    ticket.fault?.type === "device"
  );
}

function isPortalTicket(ticket) {
  const kind = ticketKind(ticket);
  return kind === "password-reset" || kind === "cbs-invoice";
}

/**
 * Whether the planted lab fault is gone on the live map.
 * null = no lab fault to check (portal / manual ticket).
 */
function labFaultFixed(ticket, mapState, devices) {
  const fault = ticket.fault;
  if (!fault) return null;
  if (fault.type === "cable-unplugged") {
    if (!mapState || !Array.isArray(mapState.links)) return null;
    const device = fault.device;
    const touches = (endpoint) => String(endpoint).split(":")[0] === device;
    return mapState.links.some((l) => touches(l.a) || touches(l.b));
  }
  if (fault.type === "hardware") {
    const hw = devices?.devices?.[fault.device]?.hw;
    if (!hw) return null;
    return hw[fault.component] !== fault.fault;
  }
  if (fault.type === "device") return deviceFaultFixed(fault, devices);
  return null;
}

/**
 * Has the student put the device back in a working state? Each family is
 * judged on the outcome the user cares about, not on the exact keystrokes:
 * the PC has a real address, the printer prints, the laptop is on the air.
 */
function deviceFaultFixed(fault, devices) {
  const state = devices?.devices?.[fault.device];
  if (!state) return null;

  if (fault.kind === "printer-fault") {
    return printers.healthy(state.printer);
  }

  if (fault.kind === "dhcp-no-address") {
    const server = devices.devices[dhcp.SERVER_ID];
    const svc = server?.dhcpService;
    const serviceWell = Boolean(svc && svc.enabled && !svc.poolFull && !svc.badGateway && !svc.badDns);
    return serviceWell && addressLooksRight(fault.device, state);
  }

  if (fault.kind === "pc-misconfigured") {
    return addressLooksRight(fault.device, state);
  }

  if (fault.kind === "wifi-offline") {
    const topo = topology();
    const assoc = wireless.associationFor(topo, devices, fault.device);
    return Boolean(assoc.ok) && addressLooksRight(fault.device, state);
  }
  return null;
}

/** The addressing this device is documented to have, computed once. */
let designedStates = null;
function designedFor(deviceId) {
  if (!designedStates) designedStates = defaultDeviceStates().devices;
  return designedStates[deviceId] || null;
}

/**
 * Is this machine addressed in a way that works? The documented address is
 * the answer, but a student who gives a PC a different free address in the
 * right subnet with the right mask and gateway has also fixed the ticket.
 */
function addressLooksRight(deviceId, state) {
  const want = designedFor(deviceId);
  if (!want || !want.ip) return null;
  if (state.ipConflict) return false;
  if (!state.ip || /^169\.254\./.test(state.ip)) return false;
  if (state.mask !== want.mask) return false;
  if (state.gateway !== want.gateway) return false;
  const net = (ip, mask) =>
    ip
      .split(".")
      .map((o, i) => Number(o) & Number(mask.split(".")[i]))
      .join(".");
  return net(state.ip, want.mask) === net(want.ip, want.mask);
}

function portalWorkEvidence(ticket, comments) {
  const kind = ticketKind(ticket);
  if (kind === "password-reset") {
    return /password|locked|reset|portal|sign.?in|account/.test(comments);
  }
  if (kind === "cbs-invoice") {
    return /cbs|invoice|billing|portal|escalat|hand.?off|refund|post/.test(comments);
  }
  return /portal|password|cbs|vas|vpn/.test(comments);
}

/**
 * Did the student actually clear the problem (or correctly escalate portal work)?
 * Closing the ticket alone is not enough.
 */
function solveEvidence(ticket, { mapState = null, devices = null } = {}) {
  const comments = commentBlob(ticket).toLowerCase();
  const closed = ["resolved", "closed"].includes(ticket.status);
  const escalated = (ticket.escalationLevel || 1) > 1 || ticket.status === "escalated";
  const labFixed = labFaultFixed(ticket, mapState, devices);
  const usedTools = /ping|ipconfig|tracert|cable|portal|password|cbs|vas|vpn|map|vlan|gateway|hardware|console|plug|reseat|repair/.test(
    comments
  );

  if (isLabMapTicket(ticket)) {
    if (labFixed === true) return { solved: true, usedLabOrPortals: true, detail: "Lab fault is cleared on the map." };
    if (labFixed === false) {
      return {
        solved: false,
        usedLabOrPortals: usedTools,
        detail: "Ticket was closed but the lab fault is still on the map — not actually fixed."
      };
    }
    return {
      solved: closed && usedTools,
      usedLabOrPortals: usedTools,
      detail: usedTools
        ? "Comments show lab work, but the map was not checked by the judge."
        : "No evidence the Lab map was used to fix this fault."
    };
  }

  if (ticketKind(ticket) === "cbs-invoice") {
    const ok = escalated || (closed && portalWorkEvidence(ticket, comments));
    return {
      solved: ok,
      usedLabOrPortals: portalWorkEvidence(ticket, comments) || escalated,
      detail: ok
        ? "Billing work was escalated or closed with a portal/hand-off record."
        : "CBS/billing tickets need portal notes or a proper escalation — closing alone is not enough."
    };
  }

  if (ticketKind(ticket) === "password-reset") {
    const ok = portalWorkEvidence(ticket, comments) && closed;
    return {
      solved: ok,
      usedLabOrPortals: portalWorkEvidence(ticket, comments),
      detail: ok
        ? "Password work shows portal evidence and was closed."
        : "Password reset needs Portals evidence before it counts as solved."
    };
  }

  return {
    solved: closed && (ticket.comments || []).length > 0,
    usedLabOrPortals: usedTools,
    detail: closed ? "Closed with a written record." : "Still open."
  };
}

/** Deterministic judge used when Gemini is off or fails. */
function heuristicReview(ticket, ctx = {}) {
  const expected = expectedPriorityFor(ticket);
  const priority = ticket.priority || null;
  const priorityOk = Boolean(priority) && priority === expected;
  const evidence = solveEvidence(ticket, ctx);
  const usedLabOrPortals = evidence.usedLabOrPortals;
  const leftClearRecord = (ticket.comments || []).length > 0;
  const closed = ["resolved", "closed"].includes(ticket.status);
  const escalated = (ticket.escalationLevel || 1) > 1 || ticket.status === "escalated";
  const needsEscalate =
    ticketKind(ticket) === "cbs-invoice" ||
    /cbs|billing|invoice|vas|vpn/.test(`${ticket.category} ${ticket.title} ${ticket.description}`.toLowerCase());
  const escalatedAppropriately = needsEscalate ? escalated || (closed && evidence.solved) : !escalated || closed;
  const assessedImpact = Boolean(priority);
  // "Closed cleanly" means fixed then closed — not just flipped to resolved.
  const closedCleanly = closed && evidence.solved && leftClearRecord;
  const checks = {
    assessedImpact,
    usedLabOrPortals,
    leftClearRecord,
    escalatedAppropriately,
    closedCleanly
  };
  const needsTools = isLabMapTicket(ticket) || isPortalTicket(ticket);
  const processOk =
    Object.values(checks).filter(Boolean).length >= 4 &&
    (!needsTools || usedLabOrPortals) &&
    (!closed || evidence.solved);

  let mark = "needs-work";
  if (!priority && !closed && !leftClearRecord) mark = "incomplete";
  else if (closed && !evidence.solved) mark = "needs-work";
  else if (priorityOk && processOk && closedCleanly && evidence.solved) mark = "good";
  else if (!closed && !leftClearRecord) mark = "incomplete";

  const bits = [];
  bits.push(
    priority
      ? priorityOk
        ? `Priority ${priority} matches the expected ${expected} for this kind of call.`
        : `Priority was ${priority}; for this impact the classroom expectation is closer to ${expected}.`
      : `No priority was set. Expectation for this call is ${expected}.`
  );
  bits.push(evidence.detail);
  if (usedLabOrPortals) bits.push("Comments or the live map show lab/portal work.");
  else if (needsTools) bits.push("Little evidence that the Lab map or Portals were used.");
  if (leftClearRecord) bits.push("There is a written record on the ticket.");
  else bits.push("No useful comment trail for the next technician.");
  if (needsEscalate) {
    bits.push(
      escalatedAppropriately
        ? "CBS/VAS/VPN-style work was escalated or handed off appropriately."
        : "This looks like work that usually needs escalation; that step is missing."
    );
  }
  if (closed && evidence.solved) bits.push("Ticket was closed after a real fix.");
  else if (closed && !evidence.solved) {
    bits.push("Marked resolved without proving the fault was fixed — that is not good work.");
  } else if (!closed) bits.push("Ticket is still open.");

  return {
    mark,
    priorityOk,
    processOk,
    expectedPriority: expected,
    ...checks,
    body: bits.join(" "),
    source: "rules"
  };
}

/**
 * Hard classroom rules that always override a soft model mark.
 * Closing without fixing is never "good".
 */
function enforceClassroomMark(review, ticket, ctx = {}) {
  const expected = expectedPriorityFor(ticket);
  const priorityOk = Boolean(ticket.priority) && ticket.priority === expected;
  const evidence = solveEvidence(ticket, ctx);
  const closed = ["resolved", "closed"].includes(ticket.status);
  const usedLabOrPortals = Boolean(review.usedLabOrPortals) || evidence.usedLabOrPortals;
  const closedCleanly = closed && evidence.solved && Boolean(review.leftClearRecord);
  const needsTools = isLabMapTicket(ticket) || isPortalTicket(ticket);
  let processOk = Boolean(review.processOk);
  if (closed && !evidence.solved) processOk = false;
  if (needsTools && !usedLabOrPortals) processOk = false;

  let mark = ["good", "needs-work", "incomplete"].includes(review.mark) ? review.mark : "needs-work";
  if (closed && !evidence.solved && mark === "good") mark = "needs-work";
  if (mark === "good" && !(priorityOk && processOk && closedCleanly && evidence.solved)) mark = "needs-work";

  let body = String(review.body || "").trim();
  if (closed && !evidence.solved && !/not actually fixed|without proving|still on the map/i.test(body)) {
    body = `${body} ${evidence.detail}`.trim().slice(0, 1200);
  }

  return {
    ...review,
    mark,
    priorityOk,
    processOk,
    expectedPriority: expected,
    usedLabOrPortals,
    closedCleanly,
    body: body || heuristicReview(ticket, ctx).body
  };
}

/**
 * Classroom rule judge for priority, process and overall mark.
 */
async function reviewTicket(ticket, { assignee = null, mapState = null, devices = null } = {}) {
  const ctx = { mapState, devices };
  return { ...heuristicReview(ticket, ctx), warning: null };
}

function toReviewRecord(ai, authorId) {
  const now = new Date().toISOString();
  return {
    mark: ai.mark,
    body: ai.body,
    authorId,
    updatedAt: now,
    priorityOk: ai.priorityOk,
    processOk: ai.processOk,
    expectedPriority: ai.expectedPriority,
    source: ai.source || "ai",
    checks: {
      assessedImpact: Boolean(ai.assessedImpact),
      usedLabOrPortals: Boolean(ai.usedLabOrPortals),
      leftClearRecord: Boolean(ai.leftClearRecord),
      escalatedAppropriately: Boolean(ai.escalatedAppropriately),
      closedCleanly: Boolean(ai.closedCleanly)
    }
  };
}

module.exports = {
  expectedPriorityFor,
  reviewTicket,
  toReviewRecord,
  labFaultFixed,
  isLabMapTicket,
  isPortalTicket,
  ticketKind,
  commentBlob,
  solveEvidence,
  heuristicReview,
  enforceClassroomMark
};
