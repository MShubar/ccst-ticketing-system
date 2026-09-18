import { api } from "./util.js";

/** Short-lived GET cache so Portals / Map clicks don't wait on the network. */
const mem = new Map();

export function peekCache(path) {
  return mem.get(path)?.data ?? null;
}

export function putCache(path, data) {
  mem.set(path, { at: Date.now(), data });
}

export function invalidateCache(prefix = "") {
  if (!prefix) {
    mem.clear();
    return;
  }
  for (const key of [...mem.keys()]) {
    if (key.startsWith(prefix)) mem.delete(key);
  }
}

/**
 * Return cached GET data immediately (and revalidate), or fetch once.
 * @param {string} path
 * @param {{ ttl?: number, swr?: boolean }} [opts]
 */
export async function cachedGet(path, opts = {}) {
  const ttl = opts.ttl ?? 45_000;
  const swr = opts.swr !== false;
  const hit = mem.get(path);
  if (hit && Date.now() - hit.at < ttl) {
    if (swr) {
      api(path)
        .then((data) => putCache(path, data))
        .catch(() => {});
    }
    return hit.data;
  }
  const data = await api(path);
  putCache(path, data);
  return data;
}

/** Idle-time warmup used after the tickets view paints. */
export function prefetchPortalsAndMap() {
  const run = async () => {
    try {
      const portals = await api("/api/portals");
      putCache("/api/portals", portals);
    } catch {
      /* ignore */
    }
    try {
      // Prefer the slim map first — topology is large and cached separately.
      const map = await api("/api/map?omitTopology=1");
      putCache("/api/map?omitTopology=1", map);
      putCache("/api/map", map);
    } catch {
      /* ignore */
    }
    try {
      const tickets = await api("/api/tickets?limit=25&page=1");
      putCache("/api/tickets?limit=25&page=1", tickets);
    } catch {
      /* ignore */
    }
    // Module graph — first click should not pay import cost.
    try {
      await Promise.all([
        import("../views/portals.js"),
        import("../map-lab.js?v=101")
      ]);
    } catch {
      /* ignore */
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      run();
    }, { timeout: 2500 });
  } else {
    window.setTimeout(run, 600);
  }
}
