import { app, isEmbedMode, state, syncEmbedFromHash } from "./state.js";
import {
  api,
  escapeHtml,
  formatWhen,
  isInstructor,
  parseRoute
} from "./util.js";

/** Set by app.js so logout can return to the sign-in screen without a circular import. */
let onSignedOut = () => {};
export function setShellSignedOutHandler(fn) {
  onSignedOut = typeof fn === "function" ? fn : () => {};
}

/**
 * Loud warning when the server has nowhere durable to write. Losing a class's
 * work is bad; losing it silently, and blaming the form, is worse.
 */
function storageBanner() {
  if (state.storage !== "memory") return "";
  return `<div class="storage-warning">
    <strong>Nothing is being saved.</strong> The server has no durable storage, so tickets, priorities
    and cabling live in memory only and will revert. Connect a Blob store to the Vercel project (or run
    the app on a host with a disk) and redeploy.
  </div>`;
}

function announcementBanner() {
  const note = state.announcement;
  if (!note?.text) return "";
  return `<div class="class-announcement" role="status">
    <strong>Class note</strong>
    <span>${escapeHtml(note.text)}</span>
    ${note.updatedBy ? `<span class="hint"> · ${escapeHtml(note.updatedBy)}${note.updatedAt ? ` · ${formatWhen(note.updatedAt)}` : ""}</span>` : ""}
  </div>`;
}

function wireLogout(btn) {
  if (!btn) return;
  btn.onclick = async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    try {
      const { clearMeCache } = await import("./boot.js");
      clearMeCache();
    } catch {
      /* ignore */
    }
    try {
      const { invalidateCache } = await import("./data-cache.js");
      invalidateCache();
    } catch {
      /* ignore */
    }
    onSignedOut();
  };
}

export function wireProfileMenu() {
  const root = document.getElementById("profile-menu");
  const toggle = document.getElementById("profile-toggle");
  const panel = document.getElementById("profile-dropdown");
  if (!root || !toggle || !panel) return;

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    root.classList.toggle("open", open);
  };

  const onDocClick = (e) => {
    if (!root.contains(e.target)) {
      setOpen(false);
      document.removeEventListener("click", onDocClick);
    }
  };

  toggle.onclick = (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    setOpen(willOpen);
    document.removeEventListener("click", onDocClick);
    if (willOpen) {
      requestAnimationFrame(() => document.addEventListener("click", onDocClick));
    }
  };
  wireLogout(document.getElementById("logout"));
}

export function profileMenuHtml(route) {
  const extras = [
    ["progress", "My progress"],
    ["team", isInstructor() ? "Class & students" : "Team"],
    ["kb", "Knowledge base"]
  ];
  return `
    <div class="profile" id="profile-menu">
      <button type="button" class="profile-btn" id="profile-toggle" aria-expanded="false" aria-haspopup="true">
        <span class="profile-name">${escapeHtml(state.user.fullName)}</span>
        <span class="profile-meta">L${state.user.level} ${state.user.role} · ${escapeHtml(state.user.username)}</span>
      </button>
      <div class="profile-dropdown" id="profile-dropdown" hidden role="menu">
        ${extras
          .map(
            ([href, label]) =>
              `<a role="menuitem" href="#/${href}" class="${route.path.startsWith("/" + href) ? "active" : ""}">${label}</a>`
          )
          .join("")}
        <div class="profile-sep" role="separator"></div>
        <button type="button" role="menuitem" id="logout">Sign out</button>
      </div>
    </div>`;
}

export function shell(title, subtitle, body) {
  const route = parseRoute();
  syncEmbedFromHash();
  // React hosts the chrome and iframes this app with ?embed=1 — only the view body.
  // Stay in embed for the whole iframe document life so in-app hash links
  // (#/tickets/new, #/portals/cbs, …) do not reintroduce a nested sidebar.
  if (isEmbedMode()) {
    document.body.classList.add("is-embed");
    app.innerHTML = `<main class="embed-root" data-embed-title="${escapeHtml(title)}">${body}</main>`;
    return;
  }
  document.body.classList.remove("is-embed");
  const className = state.user?.className || state.class?.name || "Class";
  const nav = [
    ["dashboard", "Dashboard"],
    ["tickets", "Ticket queue"],
    ["map", "Lab map"],
    ["portals", "Portals"]
  ];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div>
          <div class="brand-kicker">ProCloud</div>
          <div class="brand-title">CCST Ticketing</div>
          <div class="brand-sub">${escapeHtml(className)}</div>
        </div>
        <nav class="nav">
          ${nav.map(([href, label]) => `<a href="#/${href}" class="${route.path.startsWith("/" + href) ? "active" : ""}">${label}</a>`).join("")}
        </nav>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div>
            <h1>${title}</h1>
            ${subtitle ? `<p>${subtitle}</p>` : ""}
          </div>
          ${profileMenuHtml(route)}
        </header>
        <main class="content">${storageBanner()}${announcementBanner()}${body}</main>
      </div>
    </div>`;
  wireProfileMenu();
}
