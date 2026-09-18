/**
 * Helpers kept for sessionStorage me-cache (classic map boot) and hash utils
 * used by MapPage.
 */

/** Ensure `embed=1` is present on a classic hash. */
export function withEmbedHash(hash: string): string {
  const h = hash.startsWith("#") ? hash : `#${hash}`;
  if (/(?:\?|&)embed=1(?:&|$)/.test(h)) return h;
  return h.includes("?") ? `${h}&embed=1` : `${h}?embed=1`;
}

const ME_CACHE_KEY = "ccst.me.cache";

/** Share /api/me with classic map boot so it can skip a network round-trip. */
export function cacheMeForClassic(me: unknown) {
  try {
    sessionStorage.setItem(
      ME_CACHE_KEY,
      JSON.stringify({ at: Date.now(), me })
    );
  } catch {
    /* private mode */
  }
}

export function clearMeCache() {
  try {
    sessionStorage.removeItem(ME_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
