/**
 * Live cursors on the Lab map.
 *
 * Kept in process memory only — mouse moves must not hit Azure blob storage.
 * One App Service instance is enough for a class; entries expire if someone
 * leaves the map without a clean goodbye.
 */

const TTL_MS = 10000;

/** @type {Map<string, Map<string, { x: number, y: number, at: number, name: string, role: string }>>} */
const byClass = new Map();

function room(classId) {
  let map = byClass.get(classId);
  if (!map) {
    map = new Map();
    byClass.set(classId, map);
  }
  return map;
}

function prune(map, now) {
  for (const [id, row] of map) {
    if (now - row.at > TTL_MS) map.delete(id);
  }
}

function clampCoord(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(-200, Math.min(12000, Math.round(v * 10) / 10));
}

/**
 * Record where this classmate's pointer is, in SVG viewBox space.
 */
function touch(classId, user, x, y) {
  if (!classId || !user || !user.id) return false;
  const cx = clampCoord(x);
  const cy = clampCoord(y);
  if (cx == null || cy == null) return false;
  const now = Date.now();
  const map = room(classId);
  prune(map, now);
  map.set(user.id, {
    x: cx,
    y: cy,
    at: now,
    name: String(user.fullName || user.username || "Someone").slice(0, 48),
    role: user.role === "instructor" ? "instructor" : "technician"
  });
  return true;
}

/**
 * Everyone else currently on this class's map.
 */
function list(classId, excludeUserId) {
  if (!classId) return [];
  const map = byClass.get(classId);
  if (!map) return [];
  const now = Date.now();
  prune(map, now);
  const out = [];
  for (const [id, row] of map) {
    if (id === excludeUserId) continue;
    out.push({
      userId: id,
      name: row.name,
      role: row.role,
      x: row.x,
      y: row.y,
      at: row.at
    });
  }
  return out;
}

function leave(classId, userId) {
  if (!classId || !userId) return;
  const map = byClass.get(classId);
  if (!map) return;
  map.delete(userId);
  if (!map.size) byClass.delete(classId);
}

module.exports = { touch, list, leave, TTL_MS };
