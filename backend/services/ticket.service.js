const store = require("../data/store");
const ticketAi = require("../domain/tickets/ticket-ai");
const labFaults = require("../domain/lab/lab-faults");
const { classPortals, findClassTicket, findClassTicketAsync } = require("../lib/db-request");
const { undoTicketFaults } = require("./ticket-faults");
const { badRequest, notFound } = require("../errors/AppError");
const { toTicketDto, toTicketListItem, toTicketDetail } = require("../lib/dto/ticket");

/**
 * Column sorts for the queue table. Paging happens on the server, so the sort
 * has to as well. Blank cells land at the bottom of an ascending sort.
 */
const SORT_COLUMNS = {
  id: (t) => String(t.id).toLowerCase(),
  title: (t) => String(t.title || "").toLowerCase(),
  category: (t) => String(t.category || "\uffff").toLowerCase(),
  priority: (t) => ({ critical: 0, high: 1, medium: 2, low: 3 }[t.priority] ?? 4),
  status: (t) => ["new", "open", "pending", "escalated", "resolved", "closed"].indexOf(t.status),
  sla: (t) => (t.sla?.resolveDeadline ? new Date(t.sla.resolveDeadline).getTime() : Infinity),
  assignee: (t) => String(t.assignee?.fullName || "\uffff").toLowerCase(),
  review: (t) => (!t.review?.body ? 0 : { incomplete: 1, "needs-work": 2, good: 3 }[t.review.mark] ?? 1)
};

function mixSummary(mix) {
  const resolved = ticketAi.resolveMix(mix);
  return {
    mix: resolved,
    perStudent: ticketAi.mixTotal(resolved),
    mixLines: ticketAi.mixLines(resolved),
    labFaults: ticketAi.labFaultCount(resolved),
    cableFaults: ticketAi.labFaultCount(resolved, ticketAi.CABLE_FAULT_KINDS),
    hardwareFaults: ticketAi.labFaultCount(resolved, ticketAi.HARDWARE_FAULT_KINDS),
    deviceFaults: ticketAi.labFaultCount(resolved, ticketAi.DEVICE_FAULT_KINDS)
  };
}

async function listTickets(db, user, query) {
  const status = query.status ? String(query.status) : "";
  const wantsArchive =
    query.archive === "1" ||
    query.includeArchive === "1" ||
    status === "resolved" ||
    status === "closed" ||
    status === "done";

  if (wantsArchive) await store.ensureTicketArchive(db, user.classId);

  let tickets = store.classTickets(db, user.classId, { includeArchive: wantsArchive });

  // Level-based visibility: a student sees only tickets at or below their level.
  // Instructors and technicians at level 3+ (instructorRole) see everything.
  const isRestricted = user.role === "technician" && user.level < 3;
  if (isRestricted) {
    tickets = tickets.filter((t) => (t.difficulty || 1) <= user.level);
  }

  const { priority, category, assignee, mine, q, review, sla } = query;
  if (mine === "1") tickets = tickets.filter((t) => t.assigneeId === user.id);
  if (review === "pending") tickets = tickets.filter((t) => !t.review || !t.review.body);
  if (review === "done") tickets = tickets.filter((t) => t.review && t.review.body);
  if (status && status !== "done") tickets = tickets.filter((t) => t.status === status);
  if (status === "done") tickets = tickets.filter((t) => ["resolved", "closed"].includes(t.status));
  if (priority === "unassigned") tickets = tickets.filter((t) => !t.priority);
  else if (priority) tickets = tickets.filter((t) => t.priority === priority);
  if (category) tickets = tickets.filter((t) => t.category === category);
  if (assignee === "unassigned") tickets = tickets.filter((t) => !t.assigneeId);
  if (assignee && assignee !== "unassigned") tickets = tickets.filter((t) => t.assigneeId === assignee);

  const sortKey = String(query.sort || "");
  const needsEnrichEarly = Boolean(sla) || sortKey === "sla" || sortKey === "assignee" || sortKey === "review" || Boolean(q);
  if (needsEnrichEarly) {
    tickets = tickets.map((t) => store.enrichTicket(db, t, user));
    if (sla === "past") tickets = tickets.filter((t) => t.sla && t.sla.breached);
    else if (sla === "ok") tickets = tickets.filter((t) => t.sla && !t.sla.pending && !t.sla.breached);
    else if (sla === "pending") tickets = tickets.filter((t) => t.sla && t.sla.pending);
    if (q) {
      const needle = String(q).toLowerCase();
      tickets = tickets.filter((t) =>
        [t.id, t.title, t.description, t.category, (t.tags || []).join(" "), t.requester?.name, t.assignee?.fullName]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
  }

  const column = SORT_COLUMNS[sortKey];
  if (column) {
    const dir = query.dir === "desc" ? -1 : 1;
    tickets.sort((a, b) => {
      const left = column(a);
      const right = column(b);
      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  } else {
    tickets.sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      const aRank = a.priority && rank[a.priority] !== undefined ? rank[a.priority] : -1;
      const bRank = b.priority && rank[b.priority] !== undefined ? rank[b.priority] : -1;
      if (aRank !== bRank) return aRank - bRank;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const total = tickets.length;
  const start = (page - 1) * limit;
  const pageRows = tickets.slice(start, start + limit);
  const enriched = needsEnrichEarly ? pageRows : pageRows.map((t) => store.enrichTicket(db, t, user));
  return {
    items: enriched.map((t) => toTicketListItem(t, user)),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    hotOnly: !wantsArchive
  };
}

async function generateForStudent(db, user, body) {
  store.markLabDirty(db);
  const students = store
    .classUsers(db, user.classId)
    .filter((u) => u.role === "technician")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.id.localeCompare(b.id));

  if (!students.length) throw badRequest("Add students to the class first.");

  const student = students.find((u) => u.id === body.studentId);
  if (!student) throw badRequest("Pick a student in your class.");

  const mix = ticketAi.resolveMix(body.mix || body.count || store.classTicketMix(db, user.classId) || null);
  const existing = store
    .classTickets(db, user.classId)
    .filter((t) => t.generatedBy && t.assigneeId === student.id);

  if (existing.length && body.replace !== true && body.force !== true) {
    return {
      skipped: true,
      student: student.fullName,
      existing: existing.length,
      created: 0,
      message: `${student.fullName} already has ${existing.length} generated tickets.`
    };
  }

  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const mapState = store.ensureClassMap(db, user.classId);
  const deviceStates = store.ensureClassDevices(db, user.classId);

  if (existing.length && body.replace === true) {
    undoTicketFaults(db, user.classId, existing);
    const drop = new Set(existing.map((t) => t.id));
    db.tickets = db.tickets.filter((t) => !drop.has(t.id));
    db.__allowDeletes = true;
  }

  const index = students.findIndex((u) => u.id === student.id);
  const { drafts, aiCount, fallbackCount, error } = await ticketAi.draftsForStudent(
    student,
    index,
    mix,
    classPortals(db, user)
  );

  const unplugDevice = (deviceId) => {
    const touches = (endpoint) => String(endpoint).split(":")[0] === deviceId;
    const pulled = mapState.links.filter((l) => touches(l.a) || touches(l.b));
    if (!pulled.length) return [];
    mapState.links = mapState.links.filter((l) => !pulled.includes(l));
    return pulled;
  };

  const unplugged = [];
  const broken = [];
  const misconfigured = [];
  const created = drafts.map((draft) => {
    let fault = null;
    if (ticketAi.CABLE_FAULT_KINDS.includes(draft.item.kind)) {
      const links = unplugDevice(draft.item.subject);
      if (links.length) {
        unplugged.push(draft.item.subject);
        fault = { type: "cable-unplugged", device: draft.item.subject, links };
      }
    }
    if (ticketAi.HARDWARE_FAULT_KINDS.includes(draft.item.kind)) {
      const spot = netSim.hardware.plant(
        deviceStates.devices[draft.item.subject],
        draft.item.detail.fault,
        draft.item.detail.slot
      );
      if (spot) {
        broken.push(draft.item.subject);
        fault = { type: "hardware", device: draft.item.subject, component: spot.component, fault: spot.fault };
      }
    }
    if (ticketAi.DEVICE_FAULT_KINDS.includes(draft.item.kind)) {
      const planted = labFaults.plant(draft.item.kind, draft.item.detail, deviceStates, draft.item.subject);
      if (planted) {
        misconfigured.push(draft.item.subject);
        fault = planted;
      }
    }

    return store.createTicket(db, user.classId, {
      title: draft.title,
      description: draft.description,
      category: draft.item.category,
      channel: draft.channel,
      tags: draft.tags,
      requesterId: draft.item.requesterId,
      assigneeId: student.id,
      priority: null,
      generatedBy: {
        source: "classroom",
        kind: draft.item.kind
      },
      fault: fault || null
    });
  });

  mapState.links = labMap.normalizeLinks(mapState.links, labMap.topology());
  mapState.updatedAt = new Date().toISOString();
  if (broken.length) deviceStates.updatedAt = new Date().toISOString();

  store.saveClassTicketMix(db, user.classId, mix);
  await store.writeDb(db);
  return {
    status: 201,
    body: {
      student: student.fullName,
      created: created.length,
      ai: aiCount,
      templates: fallbackCount,
      replaced: body.replace === true ? existing.length : 0,
      unplugged,
      broken,
      misconfigured,
      mix,
      model: ticketAi.MODEL,
      warning: error || null
    }
  };
}

async function clearClassTickets(db, user) {
  const labMap = require("../domain/lab/lab-map");
  store.markLabDirty(db);
  await store.ensureTicketArchive(db, user.classId);
  const tickets = store.classTickets(db, user.classId, { includeArchive: true });
  if (!tickets.length) {
    await store.clearClassTicketArchive(user.classId);
    return { removed: 0, replugged: 0, repaired: 0, restored: 0 };
  }

  const { replugged, repaired, restored } = undoTicketFaults(db, user.classId, tickets);
  const mapState = store.ensureClassMap(db, user.classId);
  mapState.links = labMap.normalizeLinks(mapState.links, labMap.topology());
  mapState.updatedAt = new Date().toISOString();
  if (repaired || restored) store.ensureClassDevices(db, user.classId).updatedAt = new Date().toISOString();

  const drop = new Set(tickets.map((t) => t.id));
  db.tickets = db.tickets.filter((t) => !drop.has(t.id));
  db.__allowDeletes = true;
  await store.clearClassTicketArchive(user.classId);
  if (db.__ticketArchive) delete db.__ticketArchive[user.classId];
  await store.writeDb(db);

  return { removed: drop.size, replugged, repaired, restored };
}

function generateStatus(db, user) {
  const students = store.classUsers(db, user.classId).filter((u) => u.role === "technician");
  const generated = store.classTickets(db, user.classId).filter((t) => t.generatedBy);
  return {
    ready: ticketAi.aiReady(),
    mode: ticketAi.aiMode(),
    model: ticketAi.MODEL,
    families: ticketAi.families(),
    maxTotal: ticketAi.MAX_TOTAL,
    ...mixSummary(store.classTicketMix(db, user.classId)),
    students: students.length,
    generated: generated.length
  };
}

function saveMix(db, user, mixBody) {
  const mix = ticketAi.resolveMix(mixBody || null);
  store.saveClassTicketMix(db, user.classId, mix);
  return mixSummary(mix);
}

async function requireTicket(db, user, ticketId) {
  const ticket = await findClassTicketAsync(db, user, ticketId);
  if (!ticket) throw notFound("Ticket not found.");
  return ticket;
}

async function createTicket(db, user, body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (!title || !description) throw badRequest("Title and description are required.");
  const assigneeId = body.assigneeId || null;
  if (assigneeId) {
    const assignee = db.users.find((u) => u.id === assigneeId && u.classId === user.classId);
    if (!assignee) throw badRequest("Assignee must be in your class.");
  }
  const ticket = store.createTicket(db, user.classId, { ...body, title, description, assigneeId });
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

async function getTicketDetail(db, user, ticketId) {
  const ticket = await requireTicket(db, user, ticketId);
  const comments = (ticket.comments || []).map((c) => ({
    ...c,
    author: store.publicUser(db.users.find((u) => u.id === c.authorId), db)
  }));
  return toTicketDetail(store.enrichTicket(db, ticket, user), user, comments);
}

const ALLOWED_STATUS = ["new", "open", "pending", "escalated", "resolved", "closed"];

async function patchTicket(db, user, ticketId, body) {
  const ticket = await requireTicket(db, user, ticketId);
  const now = new Date().toISOString();
  const prevStatus = ticket.status;
  const fields = ["title", "description", "category", "subcategory", "channel"];
  fields.forEach((field) => {
    if (body[field] !== undefined) ticket[field] = body[field];
  });
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      throw badRequest("Status must be new, open, pending, escalated, resolved, or closed.");
    }
    ticket.status = body.status;
  }
  if (body.priority !== undefined) {
    const allowedPriority = ["critical", "high", "medium", "low"];
    ticket.priority = allowedPriority.includes(body.priority) ? body.priority : null;
  }
  if (body.tags !== undefined) {
    ticket.tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
  }
  if (body.assigneeId !== undefined) {
    const assigneeId = body.assigneeId || null;
    const prevAssignee = ticket.assigneeId || null;
    if (assigneeId) {
      const assignee = db.users.find((u) => u.id === assigneeId && u.classId === user.classId);
      if (!assignee) throw badRequest("Assignee must be in your class.");
    }
    if (String(assigneeId || "") !== String(prevAssignee || "")) {
      const handoff = String(body.handoffNote || body.internalNote || "").trim();
      if (!handoff) {
        throw badRequest(
          "A hand-off note is required when reassigning. Tell the next technician what you already checked."
        );
      }
      const fromUser = prevAssignee ? db.users.find((u) => u.id === prevAssignee) : null;
      const toUser = assigneeId ? db.users.find((u) => u.id === assigneeId) : null;
      ticket.comments.push({
        id: store.nextId("cmt", db.nextComment),
        authorId: user.id,
        createdAt: now,
        kind: "internal",
        body: `Hand-off${toUser ? ` → ${toUser.fullName}` : " (unassigned)"}: ${handoff}`
      });
      db.nextComment += 1;
      store.logActivity(db, user.classId, {
        userId: user.id,
        type: "reassign",
        summary: `Reassigned ${ticket.id}${fromUser ? ` from ${fromUser.fullName}` : ""}${
          toUser ? ` to ${toUser.fullName}` : " (unassigned)"
        }`,
        ticketId: ticket.id
      });
    }
    ticket.assigneeId = assigneeId;
  }
  if (body.csat !== undefined && body.csat !== null && body.csat !== "") {
    const csat = Number(body.csat);
    ticket.csat = csat >= 1 && csat <= 5 ? csat : null;
  }

  if (!ticket.firstResponseAt && user.role === "technician" && body.status && body.status !== "new") {
    ticket.firstResponseAt = now;
  }
  if (["open", "pending", "escalated"].includes(ticket.status) && !ticket.firstResponseAt) {
    ticket.firstResponseAt = now;
  }
  if (ticket.status === "resolved" && !ticket.resolvedAt) ticket.resolvedAt = now;
  if (ticket.status === "closed") {
    if (!ticket.resolvedAt) ticket.resolvedAt = now;
    ticket.closedAt = ticket.closedAt || now;
  }
  if (!["resolved", "closed"].includes(ticket.status)) {
    ticket.resolvedAt = null;
    ticket.closedAt = null;
  }
  if (["resolved", "closed"].includes(ticket.status) && !["resolved", "closed"].includes(prevStatus)) {
    store.logActivity(db, user.classId, {
      userId: user.id,
      type: "resolve",
      summary: `Marked ${ticket.id} ${ticket.status}`,
      ticketId: ticket.id
    });
  }
  ticket.updatedAt = now;
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

async function addComment(db, user, ticketId, bodyText) {
  const ticket = await requireTicket(db, user, ticketId);
  const body = String(bodyText || "").trim();
  if (!body) throw badRequest("Comment cannot be empty.");
  const now = new Date().toISOString();
  const comment = {
    id: store.nextId("cmt", db.nextComment),
    authorId: user.id,
    createdAt: now,
    kind: "comment",
    body
  };
  db.nextComment += 1;
  ticket.comments.push(comment);
  if (!ticket.firstResponseAt) ticket.firstResponseAt = now;
  if (ticket.status === "new") ticket.status = "open";
  ticket.updatedAt = now;
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

async function escalateTicket(db, user, ticketId, reason) {
  const ticket = await requireTicket(db, user, ticketId);
  const now = new Date().toISOString();
  ticket.escalationLevel = Math.min(3, (ticket.escalationLevel || 1) + 1);
  ticket.status = "escalated";
  ticket.updatedAt = now;
  if (!ticket.firstResponseAt) ticket.firstResponseAt = now;
  if (ticket.escalationLevel >= 3) {
    const instructor = store.classInstructor(db, user.classId);
    if (instructor) ticket.assigneeId = instructor.id;
  }
  ticket.comments.push({
    id: store.nextId("cmt", db.nextComment),
    authorId: user.id,
    createdAt: now,
    kind: "comment",
    body: `Escalated to L${ticket.escalationLevel}. ${String(reason || "Beyond current expertise — passing on early rather than spending hours past the limit.").trim()}`
  });
  db.nextComment += 1;
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "escalate",
    summary: `Escalated ${ticket.id} to L${ticket.escalationLevel}`,
    ticketId: ticket.id
  });
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

async function saveReview(db, user, ticketId, body) {
  const ticket = await requireTicket(db, user, ticketId);
  const allowed = ["good", "needs-work", "incomplete"];
  const mark = allowed.includes(body.mark) ? body.mark : "needs-work";
  const text = String(body.body || "").trim();
  if (!text) throw badRequest("Write the review before you save.");

  const parseCheck = (value) => {
    if (value === true || value === "yes" || value === "true") return true;
    if (value === false || value === "no" || value === "false") return false;
    return null;
  };

  const now = new Date().toISOString();
  ticket.review = {
    mark,
    body: text,
    authorId: user.id,
    updatedAt: now,
    priorityOk: parseCheck(body.priorityOk),
    processOk: parseCheck(body.processOk),
    source: "instructor",
    checks: {
      assessedImpact: Boolean(body.assessedImpact),
      usedLabOrPortals: Boolean(body.usedLabOrPortals),
      leftClearRecord: Boolean(body.leftClearRecord),
      escalatedAppropriately: Boolean(body.escalatedAppropriately),
      closedCleanly: Boolean(body.closedCleanly)
    }
  };
  ticket.updatedAt = now;
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

async function aiReviewTicket(db, user, ticketId) {
  const ticket = await requireTicket(db, user, ticketId);
  const assignee = ticket.assigneeId ? db.users.find((u) => u.id === ticket.assigneeId) : null;
  const mapState = store.ensureClassMap(db, user.classId);
  const devices = store.ensureClassDevices(db, user.classId);
  const ai = await ticketAi.reviewTicket(ticket, { assignee, mapState, devices });
  ticket.review = ticketAi.toReviewRecord(ai, user.id);
  ticket.updatedAt = ticket.review.updatedAt;
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "ai_review",
    summary: `AI reviewed ${ticket.id} → ${ticket.review.mark}`,
    ticketId: ticket.id
  });
  await store.writeDb(db);
  return {
    ticket: store.enrichTicket(db, ticket, user),
    source: ai.source,
    warning: ai.warning || null,
    ready: ticketAi.aiReady(),
    mode: ticketAi.aiMode()
  };
}

async function claimTicket(db, user, ticketId) {
  const ticket = await requireTicket(db, user, ticketId);
  ticket.assigneeId = user.id;
  ticket.status = ticket.status === "new" ? "open" : ticket.status;
  ticket.updatedAt = new Date().toISOString();
  if (!ticket.firstResponseAt) ticket.firstResponseAt = ticket.updatedAt;
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "claim",
    summary: `Claimed ${ticket.id}`,
    ticketId: ticket.id
  });
  await store.writeDb(db);
  return toTicketDto(store.enrichTicket(db, ticket, user), user);
}

/**
 * Force-peel cold tickets from the hot core into archive docs.
 * Instructor ops — also runs automatically on every persist.
 */
async function compactClassTickets(db, user, body = {}) {
  const before = store.classTickets(db, user.classId).length;
  const force = body.force === true || body.force === "1";
  const result = await store.peelColdTicketsIntoArchive(db, { force });
  db.__allowDeletes = true;
  await store.writeDb(db);
  const after = store.classTickets(db, user.classId).length;
  const archive = await store.readTicketArchive(user.classId);
  return {
    ok: true,
    force,
    hotBefore: before,
    hotAfter: after,
    archivedThisPass: result.archived,
    archiveTotal: (archive.tickets || []).length
  };
}

module.exports = {
  SORT_COLUMNS,
  mixSummary,
  listTickets,
  generateForStudent,
  clearClassTickets,
  compactClassTickets,
  generateStatus,
  saveMix,
  getTicketDetail,
  createTicket,
  patchTicket,
  addComment,
  escalateTicket,
  saveReview,
  aiReviewTicket,
  claimTicket
};
