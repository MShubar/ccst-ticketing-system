/**
 * Live Lab-map revision per class.
 *
 * Cable ops persist to SQL; this in-memory stamp (+ last links snapshot) lets
 * every open map notice a classmate's plug/unplug within one presence poll
 * (~2.5s) without reloading the lab document for every viewer.
 */

/** @type {Map<string, { rev: number, updatedAt: string, links: array|null }>} */
const byClass = new Map();

function bump(classId, updatedAt, links) {
  if (!classId) return 0;
  const prev = byClass.get(classId);
  const rev = (prev?.rev || 0) + 1;
  const stamp = String(updatedAt || new Date().toISOString());
  byClass.set(classId, {
    rev,
    updatedAt: stamp,
    links: Array.isArray(links) ? links : prev?.links || null
  });
  return rev;
}

function snapshot(classId) {
  if (!classId) return { rev: 0, updatedAt: null, links: null };
  const row = byClass.get(classId);
  if (!row) return { rev: 0, updatedAt: null, links: null };
  return { rev: row.rev, updatedAt: row.updatedAt, links: row.links || null };
}

/**
 * If this process has not seen a bump yet (cold start / other instance wrote
 * the blob), seed from the persisted map stamp so clients still poll correctly.
 */
function ensure(classId, updatedAt, links) {
  if (!classId || !updatedAt) return snapshot(classId);
  const row = byClass.get(classId);
  if (!row) {
    byClass.set(classId, {
      rev: 1,
      updatedAt: String(updatedAt),
      links: Array.isArray(links) ? links : null
    });
    return snapshot(classId);
  }
  if (row.updatedAt !== updatedAt) {
    return {
      rev: bump(classId, updatedAt, links != null ? links : row.links),
      updatedAt: String(updatedAt),
      links: Array.isArray(links) ? links : row.links || null
    };
  }
  if (Array.isArray(links) && !row.links) {
    row.links = links;
  }
  return row;
}

module.exports = { bump, snapshot, ensure };
