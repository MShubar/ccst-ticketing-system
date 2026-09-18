/**
 * In-memory session user cache so hot paths (map presence) can auth without
 * JSON-parsing the classroom DB on every poll.
 */
const TTL_MS = Math.max(30_000, Number(process.env.SESSION_USER_CACHE_MS || 300_000));

/** @type {Map<string, { at: number, user: object }>} */
const byId = new Map();

function slimUser(user) {
  if (!user || !user.id) return null;
  return {
    id: user.id,
    classId: user.classId || null,
    fullName: user.fullName || user.username || "",
    username: user.username || "",
    role: user.role || "technician",
    level: user.level || 1
  };
}

function rememberSessionUser(user) {
  const slim = slimUser(user);
  if (!slim) return;
  byId.set(slim.id, { at: Date.now(), user: slim });
}

function forgetSessionUser(userId) {
  if (userId) byId.delete(userId);
}

function getCachedSessionUser(userId) {
  if (!userId) return null;
  const row = byId.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    byId.delete(userId);
    return null;
  }
  return row.user;
}

module.exports = {
  rememberSessionUser,
  forgetSessionUser,
  getCachedSessionUser,
  TTL_MS
};
