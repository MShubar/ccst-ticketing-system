const store = require("../data/store");

/** Prefer the DB already loaded by requireAuth — halves Azure traffic. */
async function loadDb(req, opts) {
  if (req.db && !(opts && opts.bypassCache)) return req.db;
  req.db = await store.readDb(opts);
  return req.db;
}

/** Map/portals/devices need the per-class lab blob (peeled out of db.json on Azure). */
async function loadDbWithLab(req, opts) {
  const db = await loadDb(req, opts);
  if (req.user?.classId) await store.loadClassLab(db, req.user.classId);
  return db;
}

async function saveIfDirty(db) {
  if (store.takeDirty(db)) await store.writeDb(db);
}

/** Lab topology is fixed for the app version — build it once. */
let topologyCache = null;
function cachedTopology(labMap) {
  if (!topologyCache) topologyCache = labMap.topology();
  return topologyCache;
}

function findClassTicket(db, user, ticketId) {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticket.classId !== user.classId) return null;
  return ticket;
}

async function findClassTicketAsync(db, user, ticketId) {
  const hot = findClassTicket(db, user, ticketId);
  if (hot) return hot;
  const found = await store.findTicketInClass(db, user.classId, ticketId);
  return found.ticket;
}

function classPortals(db, user) {
  return store.ensureClassPortals(db, user.classId);
}

module.exports = {
  loadDb,
  loadDbWithLab,
  saveIfDirty,
  cachedTopology,
  findClassTicket,
  findClassTicketAsync,
  classPortals
};
