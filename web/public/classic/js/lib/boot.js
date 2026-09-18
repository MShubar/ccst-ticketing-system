import { state, syncEmbedFromHash } from "./state.js";
import { api } from "./util.js";
import { render, prefetchViewModules } from "./router.js?v=94";
import { prefetchPortalsAndMap } from "./data-cache.js";

const ME_CACHE_KEY = "ccst.me.cache";
const ME_CACHE_MS = 5 * 60_000;

function readMeCache() {
  try {
    const raw = sessionStorage.getItem(ME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.me || Date.now() - Number(parsed.at || 0) > ME_CACHE_MS) return null;
    return parsed.me;
  } catch {
    return null;
  }
}

function writeMeCache(me) {
  try {
    sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify({ at: Date.now(), me }));
  } catch {
    /* private browsing */
  }
}

function clearMeCache() {
  try {
    sessionStorage.removeItem(ME_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function applyMe(me) {
  state.user = me.user;
  state.class = me.class;
  state.announcement = me.announcement || me.class?.announcement || null;
  state.meta = me.meta;
  state.requesters = me.requesters;
  state.storage = me.storage;
}

function warmSecondaryViews() {
  // In the React embed, the host already fetched dashboard/me — don't pile on
  // portals/map/tickets until the student actually opens those views.
  if (typeof location !== "undefined" && /[?&]embed=1/.test(location.hash || "")) {
    return;
  }
  prefetchViewModules();
  prefetchPortalsAndMap();
}

/** Load /api/me into state and paint the app. Throws/returns false-ish via catch in callers that need login UI. */
async function boot() {
  syncEmbedFromHash();
  const cached = readMeCache();
  if (cached?.user) {
    applyMe(cached);
    const paint = render();
    api("/api/me")
      .then((me) => {
        writeMeCache(me);
        applyMe(me);
      })
      .catch(() => {
        clearMeCache();
      });
    await paint;
    warmSecondaryViews();
    return;
  }
  const me = await api("/api/me");
  writeMeCache(me);
  applyMe(me);
  await render();
  warmSecondaryViews();
}

export { boot, clearMeCache };
