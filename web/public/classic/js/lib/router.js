import { state } from "./state.js";
import {
  escapeHtml,
  parseRoute,
  isInstructor,
  navigateApp,
  notifyParentReady
} from "./util.js?v=95";
import { shell } from "./shell.js";


/** View modules load on demand so the embed boot stays tiny. */
const loaders = {
  login: () => import("../views/login.js"),
  dashboard: () => import("../views/dashboard.js"),
  tickets: () => import("../views/tickets.js?v=95"),
  portals: () => import("../views/portals.js"),
  kb: () => import("../views/kb-docs.js"),
  team: () => import("../views/team.js"),
  map: () => import("../map-lab.js?v=101")
};

const cache = new Map();
function load(name) {
  if (!cache.has(name)) cache.set(name, loaders[name]());
  return cache.get(name);
}

/** Kick module downloads early (APIs are warmed separately). */
export function prefetchViewModules() {
  load("portals");
  load("map");
  load("kb");
  load("team");
}

async function leaveMapIfNeeded(view) {
  if (view === "map" || !cache.has("map")) return;
  try {
    const mod = await cache.get("map");
    mod.stopMapPresence?.();
    mod.closeDeviceConsole?.();
  } catch {
    /* ignore */
  }
}

async function render() {
  try {
    if (!state.user) {
      const { renderLogin } = await load("login");
      return renderLogin();
    }
    const { parts, query } = parseRoute();
    const view = parts[0] || "dashboard";
    await leaveMapIfNeeded(view);
    try {
      if (view === "dashboard") {
        const { renderDashboard } = await load("dashboard");
        return await renderDashboard();
      }
      if (view === "progress") {
        const { renderProgress } = await load("dashboard");
        return await renderProgress();
      }
      if (view === "tickets" && parts[1] === "new") {
        if (!isInstructor()) {
          navigateApp("#/tickets");
          return;
        }
        const { renderNewTicket } = await load("tickets");
        return await renderNewTicket();
      }
      if (view === "tickets" && parts[1]) {
        const { renderTicket } = await load("tickets");
        return await renderTicket(parts[1]);
      }
      if (view === "tickets") {
        const { renderTickets } = await load("tickets");
        return await renderTickets(query);
      }
      if (view === "map") {
        const mod = await load("map");
        return await mod.renderMap(query);
      }
      if (view === "portals") {
        const { renderPortals } = await load("portals");
        return await renderPortals(parts[1]);
      }
      if (view === "kb") {
        const { renderKb } = await load("kb");
        return await renderKb(query.id);
      }
      if (view === "team") {
        const { renderTeam } = await load("team");
        return await renderTeam();
      }
      const { renderDashboard } = await load("dashboard");
      return await renderDashboard();
    } catch (err) {
      if (err.message === "auth") {
        const { renderLogin } = await load("login");
        return renderLogin();
      }
      shell(
        "Something went wrong",
        "The console could not load this view.",
        `<div class="card"><p class="error">${escapeHtml(err.message)}</p></div>`
      );
    }
  } finally {
    // After paint so the host can drop the page loader with content visible.
    requestAnimationFrame(() => notifyParentReady());
  }
}

export { render };
