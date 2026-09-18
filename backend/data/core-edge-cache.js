/**
 * Colo-shared Cache API for hot core + per-class lab JSON.
 * Cold Worker isolates in the same colo can skip D1 when another isolate
 * filled the cache moments ago. Writes must bust before rewriting.
 */
const CORE_CACHE_URL = "https://ccst-core.internal/documents/core";
const LAB_CACHE_URL = (classId) =>
  `https://ccst-core.internal/documents/lab/${encodeURIComponent(classId)}`;

function coreTtlSec() {
  const raw = Number(process.env.CORE_EDGE_CACHE_SEC);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 8;
}

/** Labs change less often than tickets — keep them warm across a class wave. */
function labTtlSec() {
  const raw = Number(process.env.LAB_EDGE_CACHE_SEC);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 45;
}

function cacheApi() {
  try {
    if (typeof caches !== "undefined" && caches?.default) return caches.default;
  } catch {
    /* node / tests */
  }
  return null;
}

async function getCoreTextFromEdge() {
  const cache = cacheApi();
  if (!cache || coreTtlSec() <= 0) return null;
  try {
    const hit = await cache.match(new Request(CORE_CACHE_URL));
    if (!hit || !hit.ok) return null;
    return await hit.text();
  } catch {
    return null;
  }
}

async function putCoreTextInEdge(text) {
  const cache = cacheApi();
  const ttl = coreTtlSec();
  if (!cache || ttl <= 0 || !text) return;
  try {
    await cache.put(
      new Request(CORE_CACHE_URL),
      new Response(text, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

async function bustCoreEdgeCache() {
  const cache = cacheApi();
  if (!cache) return;
  try {
    await cache.delete(new Request(CORE_CACHE_URL));
  } catch {
    /* ignore */
  }
}

async function getLabFromEdge(classId) {
  const cache = cacheApi();
  if (!cache || !classId || labTtlSec() <= 0) return null;
  try {
    const hit = await cache.match(new Request(LAB_CACHE_URL(classId)));
    if (!hit || !hit.ok) return null;
    return JSON.parse(await hit.text());
  } catch {
    return null;
  }
}

async function putLabInEdge(classId, lab) {
  const cache = cacheApi();
  const ttl = labTtlSec();
  if (!cache || ttl <= 0 || !classId || !lab) return;
  try {
    await cache.put(
      new Request(LAB_CACHE_URL(classId)),
      new Response(JSON.stringify(lab), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

async function bustLabEdgeCache(classId) {
  const cache = cacheApi();
  if (!cache || !classId) return;
  try {
    await cache.delete(new Request(LAB_CACHE_URL(classId)));
  } catch {
    /* ignore */
  }
}

module.exports = {
  getCoreTextFromEdge,
  putCoreTextInEdge,
  bustCoreEdgeCache,
  getLabFromEdge,
  putLabInEdge,
  bustLabEdgeCache,
  coreTtlSec,
  labTtlSec
};
