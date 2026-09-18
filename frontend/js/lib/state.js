export let app = document.getElementById("app");

/** React host binds the mount node before loading classic views (no iframe). */
export function setApp(el) {
  app = el;
}

export const state = {
  user: null,
  class: null,
  announcement: null,
  meta: null,
  requesters: [],
  users: [],
  route: location.hash || "#/dashboard",
  /** Once opened with ?embed=1 (React iframe), stay embed for this document life. */
  embed: false,
  /** Same-document React shell (no iframe). */
  reactHost: false
};

/** Remember embed mode from the current hash (or prior navigations in this iframe). */
export function syncEmbedFromHash(hash = location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const qs = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  const query = Object.fromEntries(new URLSearchParams(qs));
  if (query.embed === "1") state.embed = true;
  return state.embed;
}

export function isEmbedMode() {
  return !!state.embed || !!state.reactHost || syncEmbedFromHash();
}

/** Wire hash routing; pass the app render callback to avoid a circular import. */
export function wireHashChange(onRouteChange) {
  window.addEventListener("hashchange", () => {
    state.route = location.hash || "#/dashboard";
    syncEmbedFromHash(state.route);
    onRouteChange();
  });
}
