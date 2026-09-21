/**
 * In-memory classroom domain helpers (classes, users, tickets, SLA, KPIs).
 * Persistence stays in store.js; these functions mutate/read the db document.
 */
const { hashPassword } = require("../lib/passwords");
const { defaultPortals, ensurePortals } = require("../domain/portals");
const {
  requesters,
  slaPolicy,
  kbArticles
} = require("./seed-data");

function cloneSlaPolicy(policy = slaPolicy) {
  return JSON.parse(JSON.stringify(policy));
}

/** SLA for a class — instructor-owned; falls back to app defaults. */
function classSlaPolicy(db, classId) {
  const classRow = getClass(db, classId);
  if (classRow?.slaPolicy && typeof classRow.slaPolicy === "object") return classRow.slaPolicy;
  if (db.meta?.slaPolicy && typeof db.meta.slaPolicy === "object") return db.meta.slaPolicy;
  return cloneSlaPolicy();
}

function ensureClassSlaPolicy(db, classId) {
  const classRow = getClass(db, classId);
  if (!classRow) return cloneSlaPolicy();
  if (!classRow.slaPolicy || typeof classRow.slaPolicy !== "object") {
    classRow.slaPolicy = cloneSlaPolicy(db.meta?.slaPolicy || slaPolicy);
  }
  for (const key of Object.keys(slaPolicy)) {
    if (!classRow.slaPolicy[key]) classRow.slaPolicy[key] = { ...slaPolicy[key] };
  }
  return classRow.slaPolicy;
}

function nextId(prefix, n) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Build and file one ticket. Both the instructor's form and the AI generator
 * come through here, so a ticket has the same shape whoever created it.
 */
function createTicket(db, classId, fields) {
  const now = new Date().toISOString();
  const allowedPriority = ["critical", "high", "medium", "low"];
  const ticket = {
    id: nextId("TKT", db.nextTicket),
    number: db.nextTicket,
    classId,
    title: String(fields.title || "").trim(),
    description: String(fields.description || "").trim(),
    category: String(fields.category || "Software"),
    subcategory: String(fields.subcategory || ""),
    priority: allowedPriority.includes(fields.priority) ? fields.priority : null,
    status: "new",
    tags: Array.isArray(fields.tags)
      ? fields.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(fields.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
    requesterId: fields.requesterId || db.requesters[0].id,
    assigneeId: fields.assigneeId || null,
    createdAt: now,
    updatedAt: now,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    escalationLevel: 1,
    channel: fields.channel || "portal",
    comments: [],
    difficulty: Number(fields.difficulty) || 1
  };
  if (fields.generatedBy != null) ticket.generatedBy = fields.generatedBy;
  // The lab fault this ticket was planted with, so it can be put back.
  if (fields.fault) ticket.fault = fields.fault;
  db.nextTicket += 1;
  db.tickets.push(ticket);
  return ticket;
}

function buildFresh() {
  const now = new Date().toISOString();
  const db = {
    meta: {
      app: "CCST Ticketing",
      center: "ProCloud Training Center",
      createdAt: now,
      slaPolicy: cloneSlaPolicy()
    },
    classes: [],
    users: [],
    requesters: requesters.map((r) => ({ ...r })),
    tickets: [],
    kbArticles,
    portalsByClass: {},
    mapByClass: {},
    devicesByClass: {},
    activityByClass: {},
    nextUser: 1,
    nextClass: 1,
    nextTicket: 1,
    nextComment: 1,
    nextActivity: 1
  };

  // Default classroom instructor so a fresh DB always has a known login.
  // On D1 this survives restarts; on ephemeral platforms it is the fallback.
  createClassWithInstructor(db, {
    className: "CCST IT Support G18",
    username: "instructor",
    fullName: "Mr. Mohsen Salman",
    password: "ProCloud-G18"
  });
  ensureBootstrapInstructors(db);

  return db;
}

/**
 * Extra instructors pinned via BOOTSTRAP_INSTRUCTORS env var (JSON array).
 * These survive D1 restarts so known accounts are never lost on a fresh deploy.
 * Set: [{"username":"name","password":"secret","fullName":"Full Name","className":"Class"}]
 */
function ensureBootstrapInstructors(db) {
  const raw = process.env.BOOTSTRAP_INSTRUCTORS;
  if (!raw || !String(raw).trim()) return;

  let list = [];
  try {
    list = JSON.parse(raw);
  } catch {
    console.warn("[store] BOOTSTRAP_INSTRUCTORS is not valid JSON; ignoring.");
    return;
  }
  if (!Array.isArray(list)) return;

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const username = normalizeUsername(entry.username);
    if (!username) continue;
    if (db.users.some((u) => u.username === username)) continue;
    try {
      createClassWithInstructor(db, {
        className: entry.className || `${entry.fullName || username}'s class`,
        username,
        fullName: entry.fullName || username,
        password: entry.password
      });
    } catch (err) {
      console.warn("[store] bootstrap instructor skipped:", username, err.message);
    }
  }
}

function getClass(db, classId) {
  return (db.classes || []).find((c) => c.id === classId) || null;
}

function classUsers(db, classId) {
  return db.users.filter((u) => u.classId === classId);
}

function classTickets(db, classId) {
  return db.tickets.filter((t) => t.classId === classId);
}

function classInstructor(db, classId) {
  const row = getClass(db, classId);
  if (!row) return null;
  return db.users.find((u) => u.id === row.instructorId) || null;
}

function markDirty(db) {
  if (db) {
    db.__storeDirty = true;
    db.__labDirty = true;
  }
}

function markLabDirty(db) {
  if (db) db.__labDirty = true;
}

function takeDirty(db) {
  const dirty = Boolean(db && db.__storeDirty);
  if (db) delete db.__storeDirty;
  return dirty;
}

function ensureClassPortals(db, classId) {
  if (!classId) return null;
  if (!db.portalsByClass) {
    db.portalsByClass = {};
    markLabDirty(db);
  }
  if (!db.portalsByClass[classId]) {
    db.portalsByClass[classId] = defaultPortals();
    markLabDirty(db);
  }
  const wrap = { portals: db.portalsByClass[classId] };
  ensurePortals(wrap);
  if (wrap.portals !== db.portalsByClass[classId]) {
    db.portalsByClass[classId] = wrap.portals;
    markLabDirty(db);
  }
  return db.portalsByClass[classId];
}

function ensureClassMap(db, classId) {
  const { emptyMapState, normalizeLinks, migrateLinks, topology, MAP_SCHEMA } = require("../domain/lab/lab-map");
  if (!classId) return null;
  if (!db.mapByClass) {
    db.mapByClass = {};
    markLabDirty(db);
  }
  const saved = db.mapByClass[classId];
  if (!saved || !Array.isArray(saved.links)) {
    db.mapByClass[classId] = emptyMapState();
    markLabDirty(db);
    return db.mapByClass[classId];
  }
  // Only rewrite when the schema is behind — normal GETs must not dirty the store.
  // Also rewrite when two cables share an id: that cannot be right, and it makes
  // the map drop one of them when the client bundles by id.
  const idCounts = new Map();
  for (const l of saved.links) idCounts.set(l.id, (idCounts.get(l.id) || 0) + 1);
  const hasDupIds = [...idCounts.values()].some((n) => n > 1);

  if (saved.schema !== MAP_SCHEMA || hasDupIds) {
    const migrated = migrateLinks(saved.links, saved.schema);
    saved.links = normalizeLinks(migrated.links, topology());
    saved.schema = MAP_SCHEMA;
    markLabDirty(db);
  }
  return saved;
}

function ensureClassDevices(db, classId) {
  const { defaultDeviceStates, normalizeDeviceStates, STATE_SCHEMA } = require("../domain/lab/net-sim");
  if (!classId) return null;
  if (!db.devicesByClass) {
    db.devicesByClass = {};
    markLabDirty(db);
  }
  if (!db.devicesByClass[classId]) {
    db.devicesByClass[classId] = defaultDeviceStates();
    markLabDirty(db);
    return db.devicesByClass[classId];
  }
  const current = db.devicesByClass[classId];
  const schema = Number(current.schema || 0);
  const target = typeof STATE_SCHEMA === "number" ? STATE_SCHEMA : schema;
  if (schema !== target) {
    const normalized = normalizeDeviceStates(current);
    current.devices = normalized.devices;
    current.schema = normalized.schema;
    current.updatedAt = normalized.updatedAt;
    markLabDirty(db);
  }
  return current;
}

/**
 * The issue mix this class's instructor last chose for generated workloads,
 * or null when they have never changed it and the default still applies.
 */
function classTicketMix(db, classId) {
  if (!classId) return null;
  return (db.ticketMixByClass || {})[classId] || null;
}

function saveClassTicketMix(db, classId, mix) {
  if (!classId) return null;
  if (!db.ticketMixByClass) db.ticketMixByClass = {};
  db.ticketMixByClass[classId] = mix;
  return mix;
}

const ACTIVITY_CAP = Number(process.env.ACTIVITY_CAP) > 0 ? Number(process.env.ACTIVITY_CAP) : 400;

function classActivity(db, classId) {
  if (!classId) return [];
  if (!db.activityByClass) db.activityByClass = {};
  if (!Array.isArray(db.activityByClass[classId])) db.activityByClass[classId] = [];
  return db.activityByClass[classId];
}

/**
 * Append one timeline row for viva / attendance evidence.
 * Kept short and append-only; oldest rows drop when the class log is full.
 */
function logActivity(db, classId, { userId, type, summary, ticketId = null, meta = null }) {
  if (!classId || !userId || !type) return null;
  const list = classActivity(db, classId);
  if (!db.nextActivity) db.nextActivity = 1;
  const entry = {
    id: nextId("ACT", db.nextActivity),
    at: new Date().toISOString(),
    userId,
    type: String(type),
    summary: String(summary || type).slice(0, 240),
    ticketId: ticketId || null,
    meta: meta || null
  };
  db.nextActivity += 1;
  list.unshift(entry);
  if (list.length > ACTIVITY_CAP) list.length = ACTIVITY_CAP;
  return entry;
}

function bahrainDayKey(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function classAttendance(db, classId, dayKey = bahrainDayKey()) {
  const users = classUsers(db, classId).filter((u) => u.role === "technician");
  const logins = classActivity(db, classId).filter(
    (a) => a.type === "login" && bahrainDayKey(a.at) === dayKey
  );
  const firstByUser = new Map();
  for (const a of logins) {
    if (!firstByUser.has(a.userId)) firstByUser.set(a.userId, a);
  }
  return {
    day: dayKey,
    present: users
      .filter((u) => firstByUser.has(u.id))
      .map((u) => ({
        ...publicUser(u, db),
        signedInAt: firstByUser.get(u.id).at
      })),
    absent: users.filter((u) => !firstByUser.has(u.id)).map((u) => publicUser(u, db))
  };
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
}

function isValidUsername(username) {
  return /^[a-z][a-z0-9._-]{2,31}$/.test(username);
}

function createClassWithInstructor(db, { className, username, fullName, password }) {
  const name = String(className || "").trim();
  const user = normalizeUsername(username);
  const display = String(fullName || "").trim();
  const pass = String(password || "");
  if (!name) throw Object.assign(new Error("Class name is required."), { status: 400 });
  if (!isValidUsername(user)) {
    throw Object.assign(new Error("Username must be 3–32 chars: letters, numbers, . _ -"), { status: 400 });
  }
  if (!display) throw Object.assign(new Error("Full name is required."), { status: 400 });
  if (pass.length < 6) throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
  if (db.users.some((u) => u.username === user)) {
    throw Object.assign(new Error("That username is already taken."), { status: 409 });
  }

  const now = new Date().toISOString();
  const instructorId = nextId("USR", db.nextUser);
  db.nextUser += 1;
  const classId = nextId("CLS", db.nextClass);
  db.nextClass += 1;

  const instructor = {
    id: instructorId,
    username: user,
    fullName: display,
    email: `${user}@procloud.training`,
    role: "instructor",
    level: 3,
    classId,
    cohort: name,
    passwordHash: hashPassword(pass),
    createdAt: now
  };
  const classRow = {
    id: classId,
    name,
    instructorId,
    createdAt: now,
    slaPolicy: cloneSlaPolicy(db.meta?.slaPolicy || slaPolicy)
  };

  db.users.push(instructor);
  db.classes.push(classRow);
  ensureClassPortals(db, classId);
  return { class: classRow, user: instructor };
}

function addStudent(db, instructor, { username, fullName, password }) {
  if (!instructor || instructor.role !== "instructor") {
    throw Object.assign(new Error("Only the instructor can add students."), { status: 403 });
  }
  const user = normalizeUsername(username);
  const display = String(fullName || "").trim();
  const pass = String(password || "");
  if (!isValidUsername(user)) {
    throw Object.assign(new Error("Username must be 3–32 chars: letters, numbers, . _ -"), { status: 400 });
  }
  if (!display) throw Object.assign(new Error("Full name is required."), { status: 400 });
  if (pass.length < 6) throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
  if (db.users.some((u) => u.username === user)) {
    throw Object.assign(new Error("That username is already taken."), { status: 409 });
  }

  const now = new Date().toISOString();
  const student = {
    id: nextId("USR", db.nextUser),
    username: user,
    fullName: display,
    email: `${user}@procloud.training`,
    role: "technician",
    level: 1,
    xp: 0,
    classId: instructor.classId,
    cohort: getClass(db, instructor.classId)?.name || instructor.cohort,
    passwordHash: hashPassword(pass),
    createdAt: now
  };
  db.nextUser += 1;
  db.users.push(student);
  return student;
}

function publicUser(user, db) {
  if (!user) return null;
  const classRow = db ? getClass(db, user.classId) : null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    level: user.level,
    xp: user.xp || 0,
    classId: user.classId || null,
    className: classRow ? classRow.name : user.cohort || null,
    cohort: classRow ? classRow.name : user.cohort || null
  };
}

/** XP system — students earn XP for skills at or above their current level. */
const XP_PER_LEVEL = 100;

function getXpForLevel(level) {
  return (level - 1) * XP_PER_LEVEL;
}

function getUserLevelFromXp(xp) {
  if (xp == null || xp <= 0) return 1;
  return Math.min(20, Math.floor(xp / XP_PER_LEVEL) + 1);
}

function awardXP(db, userId, amount, requiredSkillLevel) {
  const user = db.users.find(u => u.id === userId);
  if (!user) return { ok: false, error: "User not found" };
  if (user.role !== "technician") return { ok: false, error: "Not a student" };
  if (user.level < requiredSkillLevel) {
    return { ok: false, error: `Level ${user.level} < ${requiredSkillLevel}` };
  }
  user.xp = (user.xp || 0) + amount;
  const newLevel = getUserLevelFromXp(user.xp);
  let leveledUp = null;
  if (newLevel > user.level) {
    leveledUp = { from: user.level, to: newLevel };
    user.level = newLevel;
  }
  db.classes.find(c => c.id === user.classId)?.logActivity({
    type: "xp",
    who: user.id,
    summary: `${user.fullName} +${amount} XP (lvl ${user.level}${leveledUp ? " → " + leveledUp.to : ""})`
  });
  return { ok: true, xp: user.xp, level: user.level, leveledUp };
}

/**
 * Ticket plus the bits the UI needs. `forUser` keeps the planted lab fault out
 * of a student's copy — reading it out of the API would be the answer key.
 */
function enrichTicket(db, ticket, forUser = null) {
  const requester = db.requesters.find((r) => r.id === ticket.requesterId);
  const assignee = db.users.find((u) => u.id === ticket.assigneeId);
  const review = ticket.review
    ? {
        ...ticket.review,
        author: publicUser(db.users.find((u) => u.id === ticket.review.authorId), db)
      }
    : null;
  const out = {
    ...ticket,
    review,
    requester,
    assignee: publicUser(assignee, db),
    sla: slaState(ticket, classSlaPolicy(db, ticket.classId))
  };
  if (forUser && forUser.role !== "instructor") delete out.fault;
  return out;
}

function slaState(ticket, policy) {
  const sla = policy[ticket.priority];
  if (!sla) {
    return {
      pending: true,
      acknowledgeMinutes: null,
      resolveHours: null,
      description: "Set a priority to start the SLA clock.",
      ackDeadline: null,
      resolveDeadline: null,
      acknowledged: Boolean(ticket.firstResponseAt),
      resolved: ["resolved", "closed"].includes(ticket.status),
      ackBreached: false,
      resolveBreached: false,
      breached: false
    };
  }
  const created = new Date(ticket.createdAt).getTime();
  const now = Date.now();
  const ackDeadline = created + sla.acknowledgeMinutes * 60 * 1000;
  const resolveDeadline = created + sla.resolveHours * 60 * 60 * 1000;
  const acknowledged = Boolean(ticket.firstResponseAt);
  const resolved = ["resolved", "closed"].includes(ticket.status);
  const ackBreached = !acknowledged && now > ackDeadline;
  const resolveBreached = !resolved && now > resolveDeadline;
  return {
    pending: false,
    acknowledgeMinutes: sla.acknowledgeMinutes,
    resolveHours: sla.resolveHours,
    description: sla.description,
    ackDeadline: new Date(ackDeadline).toISOString(),
    resolveDeadline: new Date(resolveDeadline).toISOString(),
    acknowledged,
    resolved,
    ackBreached,
    resolveBreached,
    breached: ackBreached || resolveBreached
  };
}

function computeKpis(db, user, scope = "queue") {
  const classId = user && user.classId;
  let tickets = classId ? classTickets(db, classId) : [];
  // Include cold archive when it was lazy-loaded onto this request.
  if (classId && db.__ticketArchive?.[classId]?.tickets?.length) {
    const { mergeTicketLists } = require("../lib/ticket-hot");
    tickets = mergeTicketLists(
      tickets,
      db.__ticketArchive[classId].tickets.filter((t) => t && t.classId === classId)
    );
  }
  if (scope === "mine" && user && user.id) {
    tickets = tickets.filter((t) => t.assigneeId === user.id);
  }

  const closedish = tickets.filter((t) => t.resolvedAt);
  const open = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const withResponse = tickets.filter((t) => t.firstResponseAt);
  const csatTickets = tickets.filter((t) => typeof t.csat === "number");

  const avgMinutes = (pairs) => {
    if (!pairs.length) return null;
    const total = pairs.reduce((sum, [a, b]) => sum + (new Date(b) - new Date(a)) / 60000, 0);
    return Math.round(total / pairs.length);
  };

  const policy = classSlaPolicy(db, classId);
  const slaTracked = tickets.filter((t) => policy[t.priority]);
  const slaOk = slaTracked.filter((t) => {
    const sla = slaState(t, policy);
    if (["resolved", "closed"].includes(t.status)) {
      if (!t.resolvedAt || sla.pending) return true;
      const resolvedBy = new Date(t.resolvedAt).getTime();
      const resolveDeadline = new Date(t.createdAt).getTime() + sla.resolveHours * 3600000;
      return resolvedBy <= resolveDeadline;
    }
    return !sla.breached;
  });

  return {
    scope,
    total: tickets.length,
    backlog: open.length,
    resolved: closedish.length,
    avgResponseMinutes: avgMinutes(withResponse.map((t) => [t.createdAt, t.firstResponseAt])),
    avgResolutionMinutes: avgMinutes(closedish.map((t) => [t.createdAt, t.resolvedAt])),
    csat: csatTickets.length
      ? Number((csatTickets.reduce((sum, t) => sum + t.csat, 0) / csatTickets.length).toFixed(2))
      : null,
    csatCount: csatTickets.length,
    slaCompliance: slaTracked.length ? Math.round((slaOk.length / slaTracked.length) * 100) : null,
    byPriority: {
      unassigned: open.filter((t) => !t.priority).length,
      critical: open.filter((t) => t.priority === "critical").length,
      high: open.filter((t) => t.priority === "high").length,
      medium: open.filter((t) => t.priority === "medium").length,
      low: open.filter((t) => t.priority === "low").length
    },
    byStatus: tickets.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {})
  };
}

function updateClassSlaPolicy(db, classId, incoming) {
  const classRow = getClass(db, classId);
  if (!classRow) {
    throw Object.assign(new Error("Class not found."), { status: 404 });
  }
  const current = ensureClassSlaPolicy(db, classId);
  const priorities = ["critical", "high", "medium", "low"];
  const next = cloneSlaPolicy(current);
  for (const key of priorities) {
    const row = incoming && incoming[key];
    if (!row || typeof row !== "object") continue;
    const ack = Number(row.acknowledgeMinutes);
    const resolve = Number(row.resolveHours);
    if (!Number.isFinite(ack) || ack < 1 || ack > 24 * 60) {
      throw Object.assign(
        new Error(`${key}: response time must be between 1 and 1440 minutes.`),
        { status: 400 }
      );
    }
    if (!Number.isFinite(resolve) || resolve < 1 || resolve > 168) {
      throw Object.assign(
        new Error(`${key}: resolve time must be between 1 and 168 hours.`),
        { status: 400 }
      );
    }
    next[key] = {
      acknowledgeMinutes: Math.round(ack),
      resolveHours: Math.round(resolve),
      description: String(row.description != null ? row.description : current[key]?.description || "")
        .trim()
        .slice(0, 200)
    };
  }
  classRow.slaPolicy = next;
  return next;
}


module.exports = {
  cloneSlaPolicy,
  classSlaPolicy,
  ensureClassSlaPolicy,
  updateClassSlaPolicy,
  nextId,
  createTicket,
  buildFresh,
  ensureBootstrapInstructors,
  getClass,
  classUsers,
  classTickets,
  classInstructor,
  markDirty,
  markLabDirty,
  takeDirty,
  ensureClassPortals,
  ensureClassMap,
  ensureClassDevices,
  classTicketMix,
  saveClassTicketMix,
  classActivity,
  logActivity,
  bahrainDayKey,
  classAttendance,
  normalizeUsername,
  isValidUsername,
  createClassWithInstructor,
  addStudent,
  publicUser,
  awardXP,
  getUserLevelFromXp,
  getXpForLevel,
  enrichTicket,
  slaState,
  computeKpis
};
