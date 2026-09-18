const fs = require("fs");
const path = require("path");
const d1Store = require("./d1-store");
const { cfEnv } = require("../lib/cf-env");
const { requesters, kbArticles } = require("./seed-data");
const domain = require("./store-domain");
const {
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
  createClassWithInstructor,
  addStudent,
  publicUser,
  enrichTicket,
  slaState,
  computeKpis
} = domain;

const { splitHotCold, mergeTicketLists } = require("../lib/ticket-hot");
const credentials = require("./credentials");

/** Lazy so the Cloudflare Worker bundle can drop Postgres when CF_WORKER=1. */
let sqlStore = null;
function getSqlStore() {
  if (process.env.CF_WORKER === "1") return null;
  if (!sqlStore) sqlStore = require("./sql-store");
  return sqlStore;
}

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(typeof __dirname !== "undefined" ? __dirname : "/tmp", "..", "var");
const dbPath = path.join(dataDir, "db.json");

/** In-memory ticket archives when no durable side-doc backend is available. */
const memoryTicketArchives = new Map();

/** Process-local DB when backend is ephemeral (e.g. Vercel, Workers without D1). */
let memoryDb = null;
/** Last document actually persisted, so unchanged state is not rewritten. */
let lastPersisted = null;
/** Warn once per process when writes are going nowhere durable. */
let warnedEphemeral = false;
/**
 * Short-lived isolate cache of the last durable read. On D1/SQL a brief TTL
 * (default 750ms) collapses boot storms (me + dashboard + tickets) onto one
 * download/parse. Writes always bypass this cache and merge via CoreGate/CAS,
 * so a stale GET cannot wipe another isolate's ticket save.
 */
let readCache = null;
/** Per-class lab JSON cache (map/devices/portals) — same short TTL idea. */
const labReadCache = new Map();

function effectiveReadCacheMs() {
  const raw = process.env.DB_READ_CACHE_MS;
  if (raw != null && String(raw).trim() !== "") return Math.max(0, Number(raw));
  // Multi-writer: short burst cache. Edge Cache API covers cross-isolate;
  // this covers repeated reads inside one warm isolate (me+dashboard+tickets).
  if (useD1() || useSql()) return 2000;
  return 2500;
}

/** Backends shared by multiple isolates/instances — never skip the latest read. */
function isMultiWriterStore() {
  return useD1() || useSql();
}

function credentialsDeps() {
  return {
    docBackend,
    useAzure,
    azureFetch,
    azureBlobUrl,
    dataDir,
    readCacheMs: effectiveReadCacheMs
  };
}

/**
 * Prefer D1 on Cloudflare, then Postgres when DATABASE_URL is set, unless
 * PERSIST_BACKEND forces a legacy blob/file path.
 */
function useD1() {
  const force = String(process.env.PERSIST_BACKEND || "").trim().toLowerCase();
  if (force === "d1") return d1Store.enabled();
  if (force) return false;
  return d1Store.enabled();
}

function useSql() {
  if (useD1()) return false;
  if (process.env.CF_WORKER === "1") return false;
  const force = String(process.env.PERSIST_BACKEND || "").trim().toLowerCase();
  if (force === "json" || force === "azure" || force === "blob" || force === "file") return false;
  const sql = getSqlStore();
  if (!sql) return false;
  if (force === "sql") return sql.enabled();
  return sql.enabled();
}

function useAzure() {
  return !useD1() && !useSql() && Boolean(process.env.AZURE_BLOB_SAS_URL);
}

function docBackend() {
  if (useD1()) return d1Store;
  if (useSql()) return getSqlStore();
  return null;
}

/**
 * Where writes actually land. "memory" means this instance is the only copy
 * and anything a user saves dies with it — the state to shout about.
 */
function storageMode() {
  if (useD1()) return "d1";
  if (useSql()) return "sql";
  if (useAzure()) return "azure";
  if (!process.env.VERCEL) return "file";
  return "memory";
}

function warnIfEphemeral() {
  if (warnedEphemeral || storageMode() !== "memory") return;
  warnedEphemeral = true;
  console.warn(
    "[store] No durable storage configured. Every save lives in " +
      "memory only and will appear to revert on cold starts. " +
      "Set up D1 (Cloudflare) or another persistent backend to fix."
  );
}

/** Container SAS URL in, URL for the single state document out. */
function azureBlobUrl(name = "db.json") {
  const url = new URL(process.env.AZURE_BLOB_SAS_URL);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${String(name).replace(/^\/+/, "")}`;
  return url.toString();
}

function azureLabUrl(classId) {
  return azureBlobUrl(`lab/${encodeURIComponent(classId)}.json`);
}

/** Peel map/devices/portals into side docs so ticket GETs stay small. */
function splitLabsEnabled() {
  return useD1() || useSql() || useAzure();
}

/** Milliseconds the last storage call took, for the slow-request log. */
let lastStorageMs = 0;

function storageTiming() {
  return lastStorageMs;
}

/**
 * Storage calls get a deadline. Without one a stalled request would sit here
 * until the platform kills the whole function, holding an instance hostage and
 * making every other request queue behind it.
 */
async function azureFetch(url, init = {}) {
  const started = Date.now();
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  } finally {
    lastStorageMs = Date.now() - started;
  }
}

async function readAzureDb() {
  const res = await azureFetch(azureBlobUrl());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Azure read failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  if (!text) return null;
  return { text, db: JSON.parse(text) };
}

async function writeAzureDb(doc) {
  const res = await azureFetch(azureBlobUrl(), {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": "application/json"
    },
    body: doc
  });
  if (!res.ok) throw new Error(`Azure write failed: ${res.status} ${await res.text()}`);
}

async function readAzureLab(classId) {
  const res = await azureFetch(azureLabUrl(classId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Azure lab read failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function writeAzureLab(classId, lab) {
  const res = await azureFetch(azureLabUrl(classId), {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(lab)
  });
  if (!res.ok) throw new Error(`Azure lab write failed: ${res.status} ${await res.text()}`);
}

/**
 * Load one class's map/devices/portals. Ticket APIs never call this, so the
 * hot path stays on the slim core document after labs are peeled out.
 */
async function loadClassLab(db, classId) {
  if (!classId || !db) return db;
  db.__labsLoaded = db.__labsLoaded || {};
  if (db.__labsLoaded[classId]) return db;

  const hasEmbedded =
    (db.mapByClass?.[classId] && Array.isArray(db.mapByClass[classId].links)) ||
    Boolean(db.devicesByClass?.[classId]?.devices) ||
    Boolean(db.portalsByClass?.[classId]);

  if (hasEmbedded) {
    db.__labsLoaded[classId] = true;
    return db;
  }

  if (splitLabsEnabled()) {
    try {
      // Labs are large and change rarely vs tickets — keep isolate cache warmer.
      const labMsRaw = Number(process.env.LAB_READ_CACHE_MS);
      const ttl =
        Number.isFinite(labMsRaw) && labMsRaw >= 0
          ? labMsRaw
          : Math.max(effectiveReadCacheMs(), 15_000);
      const hit = labReadCache.get(classId);
      let lab = null;
      if (ttl > 0 && hit && Date.now() - hit.at < ttl) {
        lab = hit.lab;
      } else {
        const backend = docBackend();
        lab = backend ? await backend.readLab(classId) : await readAzureLab(classId);
        if (ttl > 0) labReadCache.set(classId, { at: Date.now(), lab });
      }
      if (lab) {
        db.mapByClass = db.mapByClass || {};
        db.devicesByClass = db.devicesByClass || {};
        db.portalsByClass = db.portalsByClass || {};
        if (lab.map) db.mapByClass[classId] = lab.map;
        if (lab.devices) db.devicesByClass[classId] = lab.devices;
        if (lab.portals) db.portalsByClass[classId] = lab.portals;
      }
    } catch (err) {
      console.warn("[store] lab load failed for", classId, err.message);
    }
  }
  db.__labsLoaded[classId] = true;
  return db;
}

function archiveDocKey(classId) {
  return `archive:tickets:${classId}`;
}

function normalizeArchive(body) {
  if (!body || typeof body !== "object") return { tickets: [], updatedAt: null };
  const tickets = Array.isArray(body.tickets) ? body.tickets : [];
  return { tickets, updatedAt: body.updatedAt || null };
}

function fileArchivePath(classId) {
  return path.join(dataDir, `archive-tickets-${classId}.json`);
}

function azureArchiveUrl(classId) {
  return azureBlobUrl(`archive/tickets-${encodeURIComponent(classId)}.json`);
}

async function readTicketArchive(classId) {
  if (!classId) return { tickets: [], updatedAt: null };
  const backend = docBackend();
  if (backend && typeof backend.readDocument === "function") {
    try {
      return normalizeArchive(await backend.readDocument(archiveDocKey(classId)));
    } catch (err) {
      console.warn("[store] ticket archive read failed", classId, err.message);
      return { tickets: [], updatedAt: null };
    }
  }
  if (useAzure()) {
    try {
      const res = await azureFetch(azureArchiveUrl(classId));
      if (res.status === 404) return { tickets: [], updatedAt: null };
      if (!res.ok) throw new Error(`archive read ${res.status}`);
      return normalizeArchive(JSON.parse(await res.text()));
    } catch (err) {
      console.warn("[store] azure ticket archive read failed", classId, err.message);
      return { tickets: [], updatedAt: null };
    }
  }
  if (!process.env.VERCEL) {
    try {
      if (fs.existsSync(fileArchivePath(classId))) {
        return normalizeArchive(JSON.parse(fs.readFileSync(fileArchivePath(classId), "utf8")));
      }
    } catch (err) {
      console.warn("[store] file ticket archive read failed", classId, err.message);
    }
  }
  return normalizeArchive(memoryTicketArchives.get(classId));
}

async function writeTicketArchive(classId, archive) {
  if (!classId) return;
  const body = {
    tickets: Array.isArray(archive?.tickets) ? archive.tickets : [],
    updatedAt: new Date().toISOString()
  };
  const backend = docBackend();
  if (backend && typeof backend.writeDocument === "function") {
    await backend.writeDocument(archiveDocKey(classId), body);
    return;
  }
  if (useAzure()) {
    await azureFetch(azureArchiveUrl(classId), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-ms-blob-type": "BlockBlob" },
      body: JSON.stringify(body)
    });
    return;
  }
  if (!process.env.VERCEL) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(fileArchivePath(classId), JSON.stringify(body));
    return;
  }
  memoryTicketArchives.set(classId, body);
}

/**
 * Move cold (old closed/resolved) tickets out of the hot core into per-class
 * archive documents. Safe to call on every persist — no-op when nothing qualifies.
 */
async function peelColdTicketsIntoArchive(db, opts = {}) {
  if (!db || !Array.isArray(db.tickets) || !db.tickets.length) {
    return { archived: 0, hot: db?.tickets?.length || 0 };
  }
  const { hot, cold } = splitHotCold(db.tickets, Date.now(), opts);
  if (!cold.length) return { archived: 0, hot: hot.length };

  const byClass = new Map();
  for (const t of cold) {
    const cid = t.classId || "_none";
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(t);
  }

  for (const [classId, rows] of byClass) {
    if (classId === "_none") continue;
    const existing = await readTicketArchive(classId);
    const merged = mergeTicketLists(existing.tickets, rows);
    await writeTicketArchive(classId, { tickets: merged });
    if (db.__ticketArchive && db.__ticketArchive[classId]) {
      db.__ticketArchive[classId] = { tickets: merged, updatedAt: new Date().toISOString() };
    }
  }

  db.tickets = hot;
  return { archived: cold.length, hot: hot.length };
}

/**
 * Ops: move every ticket into per-class archives and empty the hot core.
 * Use after load tests / between cohorts when open tickets still bloat core.
 * Also peels password hashes into the credentials side doc.
 */
async function archiveAllTicketsFromHotCore(db) {
  if (!db) return { archived: 0, hot: 0, credentialsPeeled: 0 };
  const all = Array.isArray(db.tickets) ? db.tickets.slice() : [];

  const byClass = new Map();
  for (const t of all) {
    const cid = t.classId || "_none";
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(t);
  }

  for (const [classId, rows] of byClass) {
    if (classId === "_none") continue;
    const existing = await readTicketArchive(classId);
    const merged = mergeTicketLists(existing.tickets, rows);
    await writeTicketArchive(classId, { tickets: merged });
  }

  if (all.length) {
    db.tickets = [];
    db.__allowDeletes = true;
  }
  const activityTrimmed = trimActivityByClass(db, 20);
  const creds = await credentials.peelUserCredentials(db, credentialsDeps());
  // Activity truncations cannot ride CoreGate merge (additive only) — replace.
  db.__forceCoreReplace = true;
  return {
    archived: all.length,
    hot: Array.isArray(db.tickets) ? db.tickets.length : 0,
    activityTrimmed,
    credentialsPeeled: creds.peeled || 0,
    classes: [...byClass.keys()].filter((k) => k !== "_none")
  };
}

/** Lazy-load one class archive onto the request db (not written back to core). */
async function ensureTicketArchive(db, classId) {
  if (!db || !classId) return [];
  db.__ticketArchive = db.__ticketArchive || {};
  if (db.__ticketArchive[classId]) return db.__ticketArchive[classId].tickets || [];
  const archive = await readTicketArchive(classId);
  db.__ticketArchive[classId] = archive;
  return archive.tickets || [];
}

function classTickets(db, classId, opts = {}) {
  const hot = domain.classTickets(db, classId);
  if (!opts.includeArchive) return hot;
  const archived = db.__ticketArchive?.[classId]?.tickets || [];
  if (!archived.length) return hot;
  return mergeTicketLists(
    hot,
    archived.filter((t) => t && t.classId === classId)
  );
}

async function classTicketsWithArchive(db, classId) {
  await ensureTicketArchive(db, classId);
  return classTickets(db, classId, { includeArchive: true });
}

async function findTicketInClass(db, classId, ticketId) {
  const hot = (db.tickets || []).find((t) => t.id === ticketId && t.classId === classId);
  if (hot) return { ticket: hot, fromArchive: false };
  const archived = await ensureTicketArchive(db, classId);
  const cold = archived.find((t) => t.id === ticketId);
  if (!cold) return { ticket: null, fromArchive: false };
  // Promote into the request's hot list so patch/comment can persist normally.
  db.tickets.push(cold);
  db.__ticketArchive[classId].tickets = archived.filter((t) => t.id !== ticketId);
  db.__promotedFromArchive = db.__promotedFromArchive || new Set();
  db.__promotedFromArchive.add(ticketId);
  return { ticket: cold, fromArchive: true };
}

/** After promoting an archived ticket for edit, drop it from the cold doc. */
async function removePromotedFromArchive(db) {
  const promoted = db?.__promotedFromArchive;
  if (!promoted || !promoted.size) return;
  const byClass = new Map();
  for (const t of db.tickets || []) {
    if (!promoted.has(t.id) || !t.classId) continue;
    if (!byClass.has(t.classId)) byClass.set(t.classId, new Set());
    byClass.get(t.classId).add(t.id);
  }
  for (const [classId, ids] of byClass) {
    const existing = await readTicketArchive(classId);
    const next = (existing.tickets || []).filter((t) => !ids.has(t.id));
    await writeTicketArchive(classId, { tickets: next });
    if (db.__ticketArchive?.[classId]) {
      db.__ticketArchive[classId] = { tickets: next, updatedAt: new Date().toISOString() };
    }
  }
  delete db.__promotedFromArchive;
}

async function clearClassTicketArchive(classId) {
  if (!classId) return;
  await writeTicketArchive(classId, { tickets: [] });
  memoryTicketArchives.delete(classId);
}

function collectLabs(db) {
  const ids = new Set([
    ...Object.keys(db.mapByClass || {}),
    ...Object.keys(db.devicesByClass || {}),
    ...Object.keys(db.portalsByClass || {}),
    ...Object.keys(db.__labsLoaded || {})
  ]);
  const labs = {};
  for (const id of ids) {
    if (!id) continue;
    if (!db.mapByClass?.[id] && !db.devicesByClass?.[id] && !db.portalsByClass?.[id]) continue;
    labs[id] = {
      map: db.mapByClass?.[id] || null,
      devices: db.devicesByClass?.[id] || null,
      portals: db.portalsByClass?.[id] || null
    };
  }
  return labs;
}

function persistable(db) {
  const copy = { ...db };
  delete copy.kbArticles;
  delete copy.learning;
  delete copy.__baseText;
  delete copy.__storeDirty;
  delete copy.__labsLoaded;
  delete copy.__labDirty;
  delete copy.__ticketArchive;
  delete copy.__promotedFromArchive;
  return copy;
}

function corePersistable(db) {
  const copy = persistable(db);
  if (splitLabsEnabled()) {
    // Ticket/KPI traffic must not download map+devices every request.
    copy.mapByClass = {};
    copy.devicesByClass = {};
    copy.portalsByClass = {};
    copy.meta = { ...(copy.meta || {}), labsSplit: true };
  }
  // Keep the hot document lean — activity is evidence, not the full year log.
  const activityCap = Number(process.env.ACTIVITY_PERSIST_CAP) > 0 ? Number(process.env.ACTIVITY_PERSIST_CAP) : 40;
  if (copy.activityByClass && typeof copy.activityByClass === "object") {
    const next = {};
    for (const [classId, rows] of Object.entries(copy.activityByClass)) {
      if (!Array.isArray(rows)) continue;
      next[classId] = rows.length > activityCap ? rows.slice(0, activityCap) : rows;
    }
    copy.activityByClass = next;
  }
  // Password hashes live in the credentials side doc — never re-embed them.
  if (Array.isArray(copy.users)) {
    copy.users = copy.users.map((u) => {
      if (!u || !u.passwordHash) return u;
      const { passwordHash, ...rest } = u;
      return rest;
    });
  }
  return copy;
}

/** Ops / shrink: drop activity rows so core is users+classes, not chatty logs. */
function trimActivityByClass(db, keep = 20) {
  if (!db?.activityByClass || typeof db.activityByClass !== "object") return 0;
  let trimmed = 0;
  const cap = Math.max(0, Number(keep) || 0);
  for (const classId of Object.keys(db.activityByClass)) {
    const rows = db.activityByClass[classId];
    if (!Array.isArray(rows)) continue;
    if (rows.length > cap) {
      trimmed += rows.length - cap;
      db.activityByClass[classId] = rows.slice(0, cap);
    }
  }
  return trimmed;
}

function hydrate(db) {
  migrateDb(db);
  ensureBootstrapInstructors(db);
  db.kbArticles = kbArticles;
  db.__labsLoaded = db.__labsLoaded || {};
  // Labs still embedded in a legacy monolith count as already loaded.
  for (const id of Object.keys(db.mapByClass || {})) {
    if (db.mapByClass[id] && Array.isArray(db.mapByClass[id].links)) db.__labsLoaded[id] = true;
  }
  for (const id of Object.keys(db.devicesByClass || {})) {
    if (db.devicesByClass[id]?.devices) db.__labsLoaded[id] = true;
  }
  // Hashes may still sit on a legacy core until the next persist peels them.
  // Keep them on the in-memory row for login fallback; strip on persist.
  return db;
}

async function verifyUserPassword(userId, password, fallbackHash) {
  return credentials.verifyUserPassword(userId, password, credentialsDeps(), fallbackHash);
}

async function setUserPassword(userId, password) {
  return credentials.setUserPassword(userId, password, credentialsDeps());
}

async function deleteUserCredentials(userIds) {
  return credentials.deleteUserCredentials(userIds, credentialsDeps());
}

/** Bring older single-cohort DBs / empty shells up to multi-class shape. */
function migrateDb(db) {
  if (!db.meta) db.meta = {};
  if (!db.meta.slaPolicy) db.meta.slaPolicy = cloneSlaPolicy();
  // Fill missing priority rows only — do not overwrite instructor-edited times/descriptions.
  const slaDefaults = cloneSlaPolicy();
  for (const key of Object.keys(slaDefaults)) {
    if (!db.meta.slaPolicy[key]) db.meta.slaPolicy[key] = { ...slaDefaults[key] };
  }
  if (!db.meta.app || db.meta.app === "CCST Helpdesk") db.meta.app = "CCST Ticketing";
  if (!db.meta.center) db.meta.center = "ProCloud Training Center";
  if (!Array.isArray(db.classes)) db.classes = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.tickets)) db.tickets = [];
  if (!Array.isArray(db.requesters) || !db.requesters.length) db.requesters = requesters;
  if (!db.portalsByClass || typeof db.portalsByClass !== "object") db.portalsByClass = {};
  if (!db.mapByClass || typeof db.mapByClass !== "object") db.mapByClass = {};
  if (!db.devicesByClass || typeof db.devicesByClass !== "object") db.devicesByClass = {};
  if (!db.ticketMixByClass || typeof db.ticketMixByClass !== "object") db.ticketMixByClass = {};
  if (!db.activityByClass || typeof db.activityByClass !== "object") db.activityByClass = {};
  if (!db.nextUser) db.nextUser = db.users.length + 1;
  if (!db.nextClass) db.nextClass = db.classes.length + 1;
  if (!db.nextTicket) db.nextTicket = db.tickets.length + 1;
  if (!db.nextComment) db.nextComment = 1;
  for (const classRow of db.classes) {
    if (!classRow.slaPolicy) classRow.slaPolicy = cloneSlaPolicy(db.meta.slaPolicy);
  }
  if (!db.nextActivity) db.nextActivity = 1;

  // Legacy: one shared portals blob → attach to each known class later as needed
  if (db.portals && !Object.keys(db.portalsByClass).length && db.classes.length) {
    db.portalsByClass[db.classes[0].id] = db.portals;
  }

  // Legacy users/tickets without classId → wrap into one class
  const needsClass = db.users.some((u) => !u.classId) || db.tickets.some((t) => !t.classId);
  if (needsClass && db.users.length) {
    let classRow = db.classes[0];
    if (!classRow) {
      const instructor = db.users.find((u) => u.role === "instructor") || db.users[0];
      classRow = {
        id: nextId("CLS", db.nextClass),
        name: db.meta.cohort || instructor.cohort || "Class 1",
        instructorId: instructor.id,
        createdAt: db.meta.seededAt || new Date().toISOString()
      };
      db.nextClass += 1;
      db.classes.push(classRow);
    }
    db.users.forEach((u) => {
      if (!u.classId) u.classId = classRow.id;
    });
    db.tickets.forEach((t) => {
      if (!t.classId) t.classId = classRow.id;
    });
    if (!db.portalsByClass[classRow.id]) {
      db.portalsByClass[classRow.id] = db.portals || defaultPortals();
    }
  }

  delete db.portals;
}

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

/** Loaded documents carry their raw text, which becomes the write baseline. */
function readFileDb() {
  ensureDir();
  if (!fs.existsSync(dbPath)) return null;
  const text = fs.readFileSync(dbPath, "utf8");
  return { text, db: JSON.parse(text) };
}

function writeFileDb(doc) {
  ensureDir();
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, doc, "utf8");
  fs.renameSync(tmp, dbPath);
}

async function readDb(opts = {}) {
  warnIfEphemeral();
  const bypassCache = Boolean(opts.bypassCache);

  // Only trust the in-process copy when there is nowhere durable to read from.
  // Caching it ahead of the real store would let one serverless instance serve
  // stale data and then overwrite what another instance saved.
  if (memoryDb && storageMode() === "memory") return hydrate(memoryDb);

  if (
    !bypassCache &&
    effectiveReadCacheMs() > 0 &&
    readCache &&
    readCache.text &&
    Date.now() - readCache.at < effectiveReadCacheMs()
  ) {
    lastStorageMs = 0;
    lastPersisted = readCache.text;
    const db = hydrate(JSON.parse(readCache.text));
    db.__baseText = readCache.text;
    memoryDb = db;
    return db;
  }

  let loaded = null;
  if (docBackend()) {
    const backend = docBackend();
    // Writes go through CoreGate (DO). Reads use D1 directly so a class of
    // ~100 concurrent GETs is not serialized on one Durable Object.
    loaded = await backend.readCore();
    lastStorageMs = backend.lastStorageMs || lastStorageMs;
  } else if (useAzure()) {
    loaded = await readAzureDb();
  } else if (!process.env.VERCEL) {
    loaded = readFileDb();
  }

  if (!loaded) {
    const db = buildFresh();
    memoryDb = db;
    lastPersisted = null;
    readCache = null;
    await writeDb(db);
    return db;
  }

  lastPersisted = loaded.text;
  memoryDb = loaded.db;
  readCache = { at: Date.now(), text: loaded.text };
  const db = hydrate(loaded.db);
  db.__baseText = loaded.text;
  return db;
}

function invalidateReadCache() {
  readCache = null;
  labReadCache.clear();
}

function invalidateLabCache(classId) {
  if (classId) labReadCache.delete(classId);
  else labReadCache.clear();
}

function rowUpdatedAt(row) {
  return row?.updatedAt ? String(row.updatedAt) : "";
}

function mergeById(baseList, oursList, theirsList) {
  const base = new Map((baseList || []).map((row) => [row.id, row]));
  const ours = new Map((oursList || []).map((row) => [row.id, row]));
  const theirs = new Map((theirsList || []).map((row) => [row.id, row]));
  const deleted = new Set([...base.keys()].filter((id) => !ours.has(id)));
  const out = new Map(theirs);
  for (const id of deleted) out.delete(id);
  for (const [id, row] of ours) {
    const baseRow = base.get(id);
    if (!baseRow || JSON.stringify(baseRow) !== JSON.stringify(row)) {
      const existing = out.get(id);
      // Prefer the newer stamp when both sides touched the same row.
      if (existing && rowUpdatedAt(existing) && rowUpdatedAt(row) && rowUpdatedAt(existing) > rowUpdatedAt(row)) {
        continue;
      }
      out.set(id, row);
    }
  }
  return [...out.values()];
}

function mergeKeyed(baseObj, oursObj, theirsObj) {
  const base = baseObj || {};
  const ours = oursObj || {};
  const theirs = theirsObj || {};
  const out = { ...theirs };
  for (const key of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const b = base[key];
    const o = ours[key];
    if (o === undefined && b !== undefined) delete out[key];
    else if (o !== undefined && JSON.stringify(o) !== JSON.stringify(b)) out[key] = o;
    else if (o !== undefined && !(key in theirs)) out[key] = o;
  }
  return out;
}

/** If another request saved while we edited, fold their rows into ours instead of clobbering. */
function reconcileAgainstLatest(ours, baseText, latest) {
  if (!latest || !baseText || latest.text === baseText) return ours;
  const base = JSON.parse(baseText);
  const theirs = latest.db;
  ours.users = mergeById(base.users, ours.users, theirs.users);
  ours.tickets = mergeById(base.tickets, ours.tickets, theirs.tickets);
  ours.classes = mergeById(base.classes, ours.classes, theirs.classes);
  ours.requesters = mergeById(base.requesters, ours.requesters, theirs.requesters);
  // Labs live in side files on Azure — never merge empty core stubs over live map state.
  if (!splitLabsEnabled()) {
    ours.portalsByClass = mergeKeyed(base.portalsByClass, ours.portalsByClass, theirs.portalsByClass);
    ours.mapByClass = mergeKeyed(base.mapByClass, ours.mapByClass, theirs.mapByClass);
    ours.devicesByClass = mergeKeyed(base.devicesByClass, ours.devicesByClass, theirs.devicesByClass);
  }
  ours.ticketMixByClass = mergeKeyed(base.ticketMixByClass, ours.ticketMixByClass, theirs.ticketMixByClass);
  const activityKeys = new Set([
    ...Object.keys(base.activityByClass || {}),
    ...Object.keys(ours.activityByClass || {}),
    ...Object.keys(theirs.activityByClass || {})
  ]);
  ours.activityByClass = ours.activityByClass || {};
  for (const key of activityKeys) {
    ours.activityByClass[key] = mergeById(
      (base.activityByClass || {})[key],
      (ours.activityByClass || {})[key],
      (theirs.activityByClass || {})[key]
    ).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  ours.nextUser = Math.max(ours.nextUser || 0, theirs.nextUser || 0, ours.users.length + 1);
  ours.nextClass = Math.max(ours.nextClass || 0, theirs.nextClass || 0, ours.classes.length + 1);
  ours.nextTicket = Math.max(ours.nextTicket || 0, theirs.nextTicket || 0, ours.tickets.length + 1);
  ours.nextComment = Math.max(ours.nextComment || 0, theirs.nextComment || 0);
  ours.nextActivity = Math.max(ours.nextActivity || 0, theirs.nextActivity || 0);
  if (theirs.meta && ours.meta) ours.meta = { ...theirs.meta, ...ours.meta };
  return ours;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function rowFingerprint(row) {
  return JSON.stringify(row);
}

/**
 * Rows this request changed vs its read baseline — re-applied after every
 * multi-isolate reconcile so a concurrent core write cannot drop them.
 * Deletions are opt-in (`db.__allowDeletes`) so a lagging D1 read cannot
 * wipe tickets/users that exist only in the newer CoreGate copy.
 */
function captureLocalEdits(db, baseText) {
  const allowDeletes = Boolean(db.__allowDeletes);
  const edits = {
    tickets: new Map(),
    deletedTickets: [],
    users: new Map(),
    deletedUsers: [],
    classes: new Map(),
    deletedClasses: [],
    requesters: new Map(),
    deletedRequesters: [],
    activityByClass: {},
    ticketMixByClass: {},
    counters: {
      nextUser: db.nextUser || 0,
      nextClass: db.nextClass || 0,
      nextTicket: db.nextTicket || 0,
      nextComment: db.nextComment || 0,
      nextActivity: db.nextActivity || 0
    }
  };
  if (!baseText) {
    for (const t of db.tickets || []) edits.tickets.set(t.id, cloneJson(t));
    for (const u of db.users || []) edits.users.set(u.id, cloneJson(u));
    for (const c of db.classes || []) edits.classes.set(c.id, cloneJson(c));
    for (const r of db.requesters || []) edits.requesters.set(r.id, cloneJson(r));
    edits.activityByClass = cloneJson(db.activityByClass || {});
    edits.ticketMixByClass = cloneJson(db.ticketMixByClass || {});
    return edits;
  }
  let base;
  try {
    base = JSON.parse(baseText);
  } catch {
    for (const t of db.tickets || []) edits.tickets.set(t.id, cloneJson(t));
    return edits;
  }
  const captureList = (oursList, baseList, put, deleted) => {
    const baseMap = new Map((baseList || []).map((row) => [row.id, row]));
    const oursMap = new Map((oursList || []).map((row) => [row.id, row]));
    if (allowDeletes) {
      for (const id of baseMap.keys()) {
        if (!oursMap.has(id)) deleted.push(id);
      }
    }
    for (const [id, row] of oursMap) {
      const prev = baseMap.get(id);
      if (!prev || rowFingerprint(prev) !== rowFingerprint(row)) put.set(id, cloneJson(row));
    }
  };
  captureList(db.tickets, base.tickets, edits.tickets, edits.deletedTickets);
  captureList(db.users, base.users, edits.users, edits.deletedUsers);
  captureList(db.classes, base.classes, edits.classes, edits.deletedClasses);
  captureList(db.requesters, base.requesters, edits.requesters, edits.deletedRequesters);

  const baseMix = base.ticketMixByClass || {};
  for (const [key, value] of Object.entries(db.ticketMixByClass || {})) {
    if (rowFingerprint(baseMix[key]) !== rowFingerprint(value)) {
      edits.ticketMixByClass[key] = cloneJson(value);
    }
  }

  const baseActivity = base.activityByClass || {};
  for (const [classId, list] of Object.entries(db.activityByClass || {})) {
    const baseMap = new Map((baseActivity[classId] || []).map((row) => [row.id, row]));
    const added = [];
    for (const row of list || []) {
      const prev = baseMap.get(row.id);
      if (!prev || rowFingerprint(prev) !== rowFingerprint(row)) added.push(cloneJson(row));
    }
    if (added.length) edits.activityByClass[classId] = added;
  }
  return edits;
}

function applyListEdits(currentList, changedMap, deletedIds) {
  const out = new Map((currentList || []).map((row) => [row.id, row]));
  for (const id of deletedIds || []) out.delete(id);
  for (const [id, row] of changedMap || []) {
    const existing = out.get(id);
    const existingAt = rowUpdatedAt(existing);
    const nextAt = rowUpdatedAt(row);
    // Missing stamp on the incoming row = treat as older; never clobber a stamped row.
    if (existing && existingAt && (!nextAt || existingAt > nextAt)) {
      continue;
    }
    out.set(id, row);
  }
  return [...out.values()];
}

function applyLocalEdits(db, edits) {
  db.tickets = applyListEdits(db.tickets, edits.tickets, edits.deletedTickets);
  db.users = applyListEdits(db.users, edits.users, edits.deletedUsers);
  db.classes = applyListEdits(db.classes, edits.classes, edits.deletedClasses);
  db.requesters = applyListEdits(db.requesters, edits.requesters, edits.deletedRequesters);
  db.ticketMixByClass = { ...(db.ticketMixByClass || {}), ...(edits.ticketMixByClass || {}) };
  db.activityByClass = db.activityByClass || {};
  for (const [classId, rows] of Object.entries(edits.activityByClass || {})) {
    const map = new Map((db.activityByClass[classId] || []).map((row) => [row.id, row]));
    for (const row of rows) map.set(row.id, row);
    db.activityByClass[classId] = [...map.values()].sort((a, b) =>
      String(b.at).localeCompare(String(a.at))
    );
  }
  const c = edits.counters || {};
  db.nextUser = Math.max(db.nextUser || 0, c.nextUser || 0);
  db.nextClass = Math.max(db.nextClass || 0, c.nextClass || 0);
  db.nextTicket = Math.max(db.nextTicket || 0, c.nextTicket || 0);
  db.nextComment = Math.max(db.nextComment || 0, c.nextComment || 0);
  db.nextActivity = Math.max(db.nextActivity || 0, c.nextActivity || 0);
}

function localEditsPresent(latestDb, edits) {
  const tickets = new Map((latestDb.tickets || []).map((row) => [row.id, row]));
  for (const id of edits.deletedTickets || []) {
    if (tickets.has(id)) return false;
  }
  for (const [id, row] of edits.tickets || []) {
    const got = tickets.get(id);
    if (!got || rowFingerprint(got) !== rowFingerprint(row)) return false;
  }
  const users = new Map((latestDb.users || []).map((row) => [row.id, row]));
  for (const id of edits.deletedUsers || []) {
    if (users.has(id)) return false;
  }
  for (const [id, row] of edits.users || []) {
    const got = users.get(id);
    if (!got || rowFingerprint(got) !== rowFingerprint(row)) return false;
  }
  return true;
}

function serializeLocalEdits(edits) {
  return {
    tickets: [...(edits.tickets || new Map()).entries()].map(([id, row]) => ({ id, row })),
    deletedTickets: edits.deletedTickets || [],
    users: [...(edits.users || new Map()).entries()].map(([id, row]) => ({ id, row })),
    deletedUsers: edits.deletedUsers || [],
    classes: [...(edits.classes || new Map()).entries()].map(([id, row]) => ({ id, row })),
    deletedClasses: edits.deletedClasses || [],
    requesters: [...(edits.requesters || new Map()).entries()].map(([id, row]) => ({ id, row })),
    deletedRequesters: edits.deletedRequesters || [],
    activityByClass: edits.activityByClass || {},
    ticketMixByClass: edits.ticketMixByClass || {},
    counters: edits.counters || {}
  };
}

function coreGateStub() {
  const env = cfEnv();
  if (!env?.CORE_GATE) return null;
  try {
    return env.CORE_GATE.get(env.CORE_GATE.idFromName("global"));
  } catch {
    return null;
  }
}

async function readViaCoreGate() {
  const stub = coreGateStub();
  if (!stub || typeof stub.fetch !== "function") return null;
  const res = await stub.fetch("https://core-gate/read", { method: "GET" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json.text) return null;
  return { text: json.text, db: JSON.parse(json.text) };
}

async function applyViaCoreGate(localEdits) {
  const stub = coreGateStub();
  if (!stub) return null;
  // Prefer fetch() (same path as MapRoom) — RPC can be unreliable via node_compat.
  if (typeof stub.fetch === "function") {
    const res = await stub.fetch("https://core-gate/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits: serializeLocalEdits(localEdits) })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.text) {
      throw new Error(json?.error || `Core gate write failed (${res.status})`);
    }
    return json;
  }
  if (typeof stub.applyCoreEdits === "function") {
    const result = await stub.applyCoreEdits({ edits: serializeLocalEdits(localEdits) });
    if (!result?.ok || !result.text) {
      throw new Error("Classroom save gate rejected the write. Try saving again.");
    }
    return result;
  }
  return null;
}

async function replaceViaCoreGate(docText) {
  const stub = coreGateStub();
  if (!stub || typeof stub.fetch !== "function") return null;
  const res = await stub.fetch("https://core-gate/replace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: docText })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json.text) {
    throw new Error(json?.error || `Core gate replace failed (${res.status})`);
  }
  return json;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Persist `db` without taking withDbLock. Callers must already hold the lock
 * (writeDb / withDb). Multi-writer backends always merge via CoreGate/CAS —
 * never a blind full-document overwrite (that silently reverts ticket saves).
 */
async function persistDbUnlocked(db) {
  const started = Date.now();
  try {
    return await persistDbUnlockedBody(db);
  } finally {
    try {
      require("../lib/ops-metrics").noteWrite(Date.now() - started);
    } catch {
      /* ignore */
    }
  }
}

async function persistDbUnlockedBody(db) {
  memoryDb = db;
  // Peel cold tickets before capturing edits so CoreGate deletes them from hot core.
  await peelColdTicketsIntoArchive(db);
  await removePromotedFromArchive(db);
  // Move password hashes to credentials doc before CoreGate sees user rows.
  await credentials.peelUserCredentials(db, credentialsDeps());
  const baseText = db.__baseText || lastPersisted;
  const multi = isMultiWriterStore();
  const localEdits = multi ? captureLocalEdits(db, baseText) : null;
  delete db.__allowDeletes;

  // Single-instance stores can skip a re-read when this process still holds
  // the latest snapshot. Multi-writer stores always re-read + retry below.
  const holdLatest = !multi && Boolean(baseText && baseText === lastPersisted);
  if (docBackend() && !holdLatest && !multi) {
    const backend = docBackend();
    const latest = await backend.readCore({ bypassEdge: true });
    lastStorageMs = backend.lastStorageMs || lastStorageMs;
    reconcileAgainstLatest(db, baseText, latest);
  } else if (useAzure() && !holdLatest) {
    const latest = await readAzureDb();
    reconcileAgainstLatest(db, baseText, latest);
  }

  const labs =
    splitLabsEnabled() && (db.__labDirty || !db.meta?.labsSplit) ? collectLabs(db) : {};

  if (docBackend()) {
    const backend = docBackend();
    if (multi) {
      let savedDoc = null;
      if (db.__forceCoreReplace) {
        delete db.__forceCoreReplace;
        const doc = JSON.stringify(corePersistable(db));
        const replaced = await replaceViaCoreGate(doc);
        savedDoc = replaced?.text || doc;
        try {
          const parsed = JSON.parse(savedDoc);
          db.tickets = parsed.tickets || [];
          db.users = parsed.users || db.users;
          db.classes = parsed.classes || db.classes;
          db.requesters = parsed.requesters || db.requesters;
          db.activityByClass = parsed.activityByClass || {};
          db.ticketMixByClass = parsed.ticketMixByClass || db.ticketMixByClass;
        } catch {
          /* keep local */
        }
        for (const [classId, lab] of Object.entries(labs)) {
          await backend.writeLab(classId, lab);
          invalidateLabCache(classId);
        }
        lastPersisted = savedDoc;
        db.__baseText = savedDoc;
        db.meta = db.meta || {};
        db.meta.labsSplit = true;
        delete db.__labDirty;
        readCache = { at: Date.now(), text: savedDoc };
        return;
      }
      const gated = await applyViaCoreGate(localEdits);
      if (gated?.text) {
        savedDoc = gated.text;
        try {
          const parsed = JSON.parse(savedDoc);
          db.tickets = parsed.tickets || db.tickets;
          db.users = parsed.users || db.users;
          db.classes = parsed.classes || db.classes;
          db.requesters = parsed.requesters || db.requesters;
          db.activityByClass = parsed.activityByClass || db.activityByClass;
          db.ticketMixByClass = parsed.ticketMixByClass || db.ticketMixByClass;
          db.nextUser = Math.max(db.nextUser || 0, parsed.nextUser || 0);
          db.nextClass = Math.max(db.nextClass || 0, parsed.nextClass || 0);
          db.nextTicket = Math.max(db.nextTicket || 0, parsed.nextTicket || 0);
          db.nextComment = Math.max(db.nextComment || 0, parsed.nextComment || 0);
          db.nextActivity = Math.max(db.nextActivity || 0, parsed.nextActivity || 0);
        } catch {
          /* keep local */
        }
      } else {
        const maxAttempts = Math.max(1, Number(process.env.DB_WRITE_RETRIES || 40));
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const latest = await backend.readCore({ bypassEdge: true });
          lastStorageMs = backend.lastStorageMs || lastStorageMs;
          const expectedText = latest?.text || null;
          if (latest?.text) {
            reconcileAgainstLatest(db, db.__baseText || baseText || latest.text, latest);
            applyLocalEdits(db, localEdits);
            db.__baseText = latest.text;
          } else {
            applyLocalEdits(db, localEdits);
          }
          const doc = JSON.stringify(corePersistable(db));
          let landed = false;
          if (typeof backend.writeCoreCas === "function") {
            landed = await backend.writeCoreCas(doc, expectedText);
            lastStorageMs = backend.lastStorageMs || lastStorageMs;
          } else {
            await backend.writeCore(doc);
            lastStorageMs = backend.lastStorageMs || lastStorageMs;
            const verify = await backend.readCore({ bypassEdge: true });
            lastStorageMs = backend.lastStorageMs || lastStorageMs;
            landed = Boolean(verify?.db && localEditsPresent(verify.db, localEdits));
            if (verify?.text) db.__baseText = verify.text;
          }
          if (landed) {
            savedDoc = doc;
            break;
          }
          await sleepMs(20 + Math.floor(Math.random() * (30 + attempt * 25)));
        }
        if (!savedDoc) {
          throw new Error(
            "Could not persist classroom data after concurrent edits. Try saving again."
          );
        }
      }
      for (const [classId, lab] of Object.entries(labs)) {
        await backend.writeLab(classId, lab);
        invalidateLabCache(classId);
      }
      lastPersisted = savedDoc;
      db.__baseText = savedDoc;
      db.meta = db.meta || {};
      db.meta.labsSplit = true;
      delete db.__labDirty;
      readCache = { at: Date.now(), text: savedDoc };
      return;
    }

    const doc = JSON.stringify(corePersistable(db));
    if (doc === lastPersisted && !Object.keys(labs).length) {
      readCache = { at: Date.now(), text: doc };
      delete db.__labDirty;
      return;
    }
    if (doc !== lastPersisted) {
      await backend.writeCore(doc);
      lastStorageMs = backend.lastStorageMs || lastStorageMs;
    }
    for (const [classId, lab] of Object.entries(labs)) {
      await backend.writeLab(classId, lab);
      invalidateLabCache(classId);
    }
    lastPersisted = doc;
    db.__baseText = doc;
    db.meta = db.meta || {};
    db.meta.labsSplit = true;
    delete db.__labDirty;
    readCache = { at: Date.now(), text: doc };
    return;
  }

  const doc = JSON.stringify(corePersistable(db));
  if (doc === lastPersisted && !Object.keys(labs).length) {
    readCache = { at: Date.now(), text: doc };
    delete db.__labDirty;
    return;
  }

  if (useAzure()) {
    if (doc !== lastPersisted) await writeAzureDb(doc);
    for (const [classId, lab] of Object.entries(labs)) {
      await writeAzureLab(classId, lab);
    }
    lastPersisted = doc;
    db.__baseText = doc;
    db.meta = db.meta || {};
    db.meta.labsSplit = true;
    delete db.__labDirty;
    readCache = { at: Date.now(), text: doc };
    return;
  }

  if (!process.env.VERCEL) {
    writeFileDb(doc);
    lastPersisted = doc;
    db.__baseText = doc;
    readCache = { at: Date.now(), text: doc };
    return;
  }
}

async function writeDb(db) {
  return withDbLock(async () => persistDbUnlocked(db));
}

/**
 * Serialize store writes (and withDb transactions) so overlapping requests cannot
 * silently overwrite each other's students, tickets, or cabling.
 */
let dbGate = Promise.resolve();

/**
 * How long a queued write waits for the one in front of it. The gate lives in
 * module scope, so on Workers it is shared by every request an isolate handles:
 * a write whose request was cancelled mid-flight leaves a promise that never
 * settles, and an unbounded wait would hang every later write in that isolate
 * until it was recycled. Giving up on the predecessor is safer than that —
 * writeDb reconciles against the stored document before it saves.
 */
const LOCK_WAIT_MS = Number(process.env.DB_LOCK_WAIT_MS || 6000);

function waitForGate(previous) {
  let timer;
  return Promise.race([
    previous.then(
      () => undefined,
      () => undefined
    ),
    new Promise((resolve) => {
      timer = setTimeout(resolve, LOCK_WAIT_MS);
    })
  ]).finally(() => clearTimeout(timer));
}

function withDbLock(fn) {
  const previous = dbGate;
  const run = waitForGate(previous).then(fn);
  dbGate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function withDb(fn) {
  return withDbLock(async () => {
    // readDb/writeDb nested would deadlock on the same gate — call unlocked paths.
    // Writes always hit durable storage (no GET burst cache) so we merge from fresh.
    const loaded = await (async () => {
      warnIfEphemeral();
      if (memoryDb && storageMode() === "memory") return { text: lastPersisted, db: hydrate(memoryDb) };
      // Writers must not merge on top of a possibly-stale edge snapshot.
      if (docBackend()) return docBackend().readCore({ bypassEdge: true });
      if (useAzure()) return readAzureDb();
      if (!process.env.VERCEL) return readFileDb();
      return null;
    })();

    let db;
    if (!loaded) {
      db = buildFresh();
      memoryDb = db;
      lastPersisted = null;
    } else {
      lastPersisted = loaded.text;
      memoryDb = loaded.db;
      db = hydrate(loaded.db);
      db.__baseText = loaded.text;
      if (loaded.text) readCache = { at: Date.now(), text: loaded.text };
    }

    const result = await fn(db);
    // Same CoreGate/CAS merge path as writeDb — never blind-overwrite core.
    await persistDbUnlocked(db);
    return result;
  });
}

async function reset() {
  return withDbLock(async () => {
    const db = buildFresh();
    memoryDb = db;
    await credentials.peelUserCredentials(db, credentialsDeps());
    const labs = splitLabsEnabled() ? collectLabs(db) : {};
    const doc = JSON.stringify(corePersistable(db));
    if (docBackend()) {
      const backend = docBackend();
      if (useD1()) {
        await replaceViaCoreGate(doc);
      } else {
        await backend.writeCore(doc);
      }
      for (const [classId, lab] of Object.entries(labs)) await backend.writeLab(classId, lab);
    } else if (useAzure()) {
      await writeAzureDb(doc);
      for (const [classId, lab] of Object.entries(labs)) await writeAzureLab(classId, lab);
    } else if (!process.env.VERCEL) writeFileDb(doc);
    lastPersisted = doc;
    readCache = { at: Date.now(), text: doc };
    return db;
  });
}


module.exports = {
  readDb,
  writeDb,
  withDb,
  reset,
  invalidateReadCache,
  invalidateLabCache,
  trimActivityByClass,
  publicUser,
  enrichTicket,
  computeKpis,
  slaState,
  classSlaPolicy,
  ensureClassSlaPolicy,
  updateClassSlaPolicy,
  storageMode,
  storageTiming,
  nextId,
  createTicket,
  getClass,
  classUsers,
  classTickets,
  classInstructor,
  ensureClassPortals,
  ensureClassMap,
  ensureClassDevices,
  loadClassLab,
  peelColdTicketsIntoArchive,
  archiveAllTicketsFromHotCore,
  ensureTicketArchive,
  verifyUserPassword,
  setUserPassword,
  deleteUserCredentials,
  classTicketsWithArchive,
  findTicketInClass,
  clearClassTicketArchive,
  readTicketArchive,
  takeDirty,
  markDirty,
  markLabDirty,
  classTicketMix,
  saveClassTicketMix,
  classActivity,
  logActivity,
  classAttendance,
  bahrainDayKey,
  createClassWithInstructor,
  addStudent,
  normalizeUsername
};
