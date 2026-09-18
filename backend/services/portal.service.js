const store = require("../data/store");
const { canChangeSystems, pushLog } = require("../domain/portals");
const { classPortals } = require("../lib/db-request");
const { badRequest, notFound } = require("../errors/AppError");

function getPortalsPayload(db, user) {
  return { portals: classPortals(db, user), canChange: canChangeSystems(user) };
}

async function resetPassword(db, user, userId) {
  store.markLabDirty(db);
  const portals = classPortals(db, user);
  const person = (portals.passwordPeople || []).find((p) => p.id === userId);
  if (!person) throw notFound("Mailbox user not found.");
  const at = new Date().toISOString();
  person.lastReset = at;
  portals.passwordResets.unshift({
    at,
    who: user.fullName,
    mailbox: person.mailbox,
    name: person.name
  });
  if (portals.passwordResets.length > 12) portals.passwordResets.length = 12;
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "portal_password",
    summary: `Password reset for ${person.name} (${person.mailbox})`
  });
  await store.writeDb(db);
  return {
    ok: true,
    escalate: false,
    message: "Reset done for " + person.name + " (" + person.mailbox + "). Do not write the password on the ticket.",
    portals
  };
}

async function runCbs(db, user, body) {
  const action = String(body.action || "");
  store.markLabDirty(db);
  const portals = classPortals(db, user);
  if (!canChangeSystems(user)) {
    return {
      ok: false,
      escalate: true,
      message: "CBS needs billing rights. Escalate. When L2 finishes, Resolve.",
      portals
    };
  }
  if (action === "post") {
    const row = portals.cbs.invoices.find((i) => i.id === body.invoiceId);
    if (row) row.status = "posted";
    pushLog(portals.cbs.log, user, "Posted " + (body.invoiceId || "invoice"));
  } else if (action === "refund") {
    const row = portals.cbs.invoices.find((i) => i.id === body.invoiceId);
    if (row) row.status = "refunded";
    pushLog(portals.cbs.log, user, "Refunded " + (body.invoiceId || "invoice"));
  } else if (action === "till") {
    const n = portals.cbs.tills.length + 1;
    const invoiceId = String(body.invoiceId || "");
    portals.cbs.tills.push({
      id: "TILL-" + n,
      shop: "Safqa",
      name: "Till " + n,
      invoiceId
    });
    pushLog(portals.cbs.log, user, "Added a Safqa till for " + (invoiceId || "invoice"));
  } else if (action === "export") {
    pushLog(portals.cbs.log, user, "Exported payroll for " + (body.invoiceId || "invoice"));
  } else {
    throw badRequest("Unknown CBS action.");
  }
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "portal_cbs",
    summary: `CBS ${action}${body.invoiceId ? ` ${body.invoiceId}` : ""}`
  });
  await store.writeDb(db);
  return { ok: true, escalate: false, message: "CBS change saved. The ticket can be Resolved.", portals };
}

async function runVas(db, user, body) {
  const action = String(body.action || "");
  const connectionId = String(body.connectionId || "");
  store.markLabDirty(db);
  const portals = classPortals(db, user);
  const row = (portals.vas.connections || []).find((c) => c.id === connectionId);
  if (!row) throw notFound("VAS connection not found.");
  const label = row.company + " " + row.service + " " + row.name + " (" + row.id + ")";
  if (!canChangeSystems(user)) {
    return {
      ok: false,
      escalate: true,
      message: "VAS to " + label + " is not an L1 fix. Escalate. When the link works, Resolve.",
      portals
    };
  }
  if (action === "enable") {
    row.status = "up";
    pushLog(portals.vas.log, user, "Enabled " + label);
  } else if (action === "disable") {
    row.status = "down";
    pushLog(portals.vas.log, user, "Disabled " + label);
  } else if (action === "test") {
    if (row.status !== "up") {
      return {
        ok: false,
        escalate: false,
        message: label + " is down. Enable it first.",
        portals
      };
    }
    portals.vas.messages.unshift({
      at: new Date().toISOString(),
      text: "Test " + row.service + " on " + label,
      who: user.fullName
    });
    if (portals.vas.messages.length > 12) portals.vas.messages.length = 12;
    pushLog(portals.vas.log, user, "Sent test on " + label);
  } else {
    throw badRequest("Unknown VAS action.");
  }
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "portal_vas",
    summary: `VAS ${action} on ${label}`
  });
  await store.writeDb(db);
  return {
    ok: true,
    escalate: false,
    message: "VAS change saved on " + label + ". The ticket can be Resolved.",
    portals
  };
}

async function runVpn(db, user, body) {
  const action = String(body.action || "");
  const connectionId = String(body.connectionId || "");
  store.markLabDirty(db);
  const portals = classPortals(db, user);
  const row = (portals.vpn.connections || []).find((c) => c.id === connectionId);
  if (!row) throw notFound("VPN connection not found.");
  const label = row.site + " " + row.type + " " + row.name + " (" + row.id + ")";
  if (!canChangeSystems(user)) {
    return {
      ok: false,
      escalate: true,
      message: "VPN " + label + " is not an L1 fix. Escalate. When the tunnel is up, Resolve.",
      portals
    };
  }
  if (action === "enable") {
    row.status = "up";
    pushLog(portals.vpn.log, user, "Enabled " + label);
  } else if (action === "disable") {
    row.status = "down";
    pushLog(portals.vpn.log, user, "Disabled " + label);
  } else if (action === "test") {
    if (row.status !== "up") {
      return {
        ok: false,
        escalate: false,
        message: label + " is down. Enable it first.",
        portals
      };
    }
    pushLog(portals.vpn.log, user, "Sent test on " + label);
  } else {
    throw badRequest("Unknown VPN action.");
  }
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "portal_vpn",
    summary: `VPN ${action} on ${label}`
  });
  await store.writeDb(db);
  return {
    ok: true,
    escalate: false,
    message: "VPN change saved on " + label + ". The ticket can be Resolved.",
    portals
  };
}

module.exports = {
  getPortalsPayload,
  resetPassword,
  runCbs,
  runVas,
  runVpn
};
