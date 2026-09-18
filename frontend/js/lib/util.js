import { state, isEmbedMode } from "./state.js";

export function toast(message, type = "ok") {
  // While a device window is open, keep feedback inside that workspace —
  // not down in the corner of the map behind the blur.
  const host =
    document.getElementById("console-toast-host") || document.getElementById("toast-host");
  if (!host) {
    window.alert(message);
    return;
  }
  const el = document.createElement("div");
  el.className = `toast is-${type === "error" ? "error" : type === "warn" ? "warn" : "ok"}`;
  el.textContent = String(message || "");
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms";
    setTimeout(() => el.remove(), 220);
  }, type === "error" ? 5200 : 3200);
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function api(path, options = {}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401) {
    state.user = null;
    throw new Error("auth");
  }
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Too many attempts. Wait a moment and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  const ms =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
  const method = String(options.method || "GET").toUpperCase();
  // Ticket/class saves that take a long time — not every POST (hardware/console
  // also write the lab and would spam this warning while using the bench).
  if (method !== "GET" && method !== "HEAD" && ms >= 1600) {
    const p = String(path || "");
    const isTicketOrClassSave =
      p.startsWith("/api/tickets") ||
      p.startsWith("/api/class") ||
      p.startsWith("/api/students") ||
      p === "/api/login" ||
      p.startsWith("/api/portals");
    if (isTicketOrClassSave) {
      toast("Save is slow (storage lag). Keep this tab open — your change should still land.", "warn");
    }
  }
  return data;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mdInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:)])/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Knowledge-base markdown. A student reads these while a caller waits, so the
 * structure that makes a procedure skimmable — numbered steps, tables, command
 * blocks — has to survive into the page rather than flattening into prose.
 */
export function mdLite(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;

  const heading = (l) => /^(#{1,3})\s+(.+)$/.exec(l.trim());
  const step = (l) => /^(\d+)\.\s+(.+)$/.exec(l.trim());
  const bullet = (l) => /^[-*]\s+(.+)$/.exec(l.trim());
  const subBullet = (l) => /^\s{2,}[-*]\s+(.+)$/.exec(l);
  const tableRow = (l) => /^\|.*\|\s*$/.test(l.trim());
  const tableDivider = (l) => /^\|[\s:|-]+\|\s*$/.test(l.trim());
  const fence = (l) => /^```/.test(l.trim());
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const blockStart = (l) => !l.trim() || heading(l) || step(l) || bullet(l) || tableRow(l) || fence(l);

  const items = (list, tag, attrs = "") =>
    `<${tag}${attrs}>${list
      .map((it) => `<li>${it.text}${it.subs.length ? `<ul>${it.subs.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}</li>`)
      .join("")}</${tag}>`;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (fence(line)) {
      const body = [];
      i++;
      while (i < lines.length && !fence(lines[i])) { body.push(lines[i]); i++; }
      i++;
      out.push(`<pre class="kb-command"><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const head = heading(line);
    if (head) {
      const level = head[1].length === 1 ? 2 : 3;
      out.push(`<h${level}>${mdInline(head[2])}</h${level}>`);
      i++;
      continue;
    }

    if (tableRow(line)) {
      const head = cells(line);
      i++;
      if (i < lines.length && tableDivider(lines[i])) i++;
      const rows = [];
      while (i < lines.length && tableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(
        `<div class="kb-table-wrap"><table class="kb-table">` +
          `<thead><tr>${head.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` +
        `</table></div>`
      );
      continue;
    }

    if (step(line)) {
      // A command block between two steps splits the list, so the second half
      // carries on counting from where the first one stopped.
      const start = Number(step(line)[1]);
      const list = [];
      while (i < lines.length) {
        const m = step(lines[i]);
        if (m) { list.push({ text: mdInline(m[2]), subs: [] }); i++; continue; }
        const sub = subBullet(lines[i]);
        if (sub && list.length) { list[list.length - 1].subs.push(mdInline(sub[1])); i++; continue; }
        break;
      }
      out.push(items(list, "ol", start === 1 ? ` class="kb-steps"` : ` class="kb-steps" start="${start}"`));
      continue;
    }

    if (bullet(line)) {
      const list = [];
      while (i < lines.length && bullet(lines[i]) && !subBullet(lines[i])) {
        list.push({ text: mdInline(bullet(lines[i])[1]), subs: [] });
        i++;
      }
      out.push(items(list, "ul"));
      continue;
    }

    // Anything else is a paragraph, and a single newline inside it is a wrap
    // in the source rather than a break the reader should see.
    const para = [];
    while (i < lines.length && !blockStart(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${mdInline(para.join(" "))}</p>`);
  }

  return out.join("");
}

export function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function minutesLabel(n) {
  if (n == null) return "—";
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)}h ${n % 60}m`;
}

export function priorityLabel(priority) {
  return priority || "unassigned";
}

export async function downloadPdf(url, fallbackName) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) {
    state.user = null;
    throw new Error("auth");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not download file.");
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/i.exec(res.headers.get("Content-Disposition") || "");
  const name = match?.[1] || fallbackName || "download";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function priorityClass(priority) {
  return priority ? `p-${priority}` : "p-none";
}

export function slaLine(sla) {
  if (!sla || sla.pending) return "Set priority to start SLA";
  const ack = sla.acknowledgeMinutes >= 60
    ? `${sla.acknowledgeMinutes / 60}h`
    : `${sla.acknowledgeMinutes}m`;
  return `Response ${ack} · Resolve ${sla.resolveHours}h`;
}

export function slaResolveCell(sla) {
  if (!sla || sla.pending) return "Awaiting priority";
  return formatWhen(sla.resolveDeadline);
}

export function isInstructor() {
  return state.user && (state.user.role === "instructor" || state.user.level === 3);
}

export function reviewLabel(mark) {
  if (mark === "good") return "Good work";
  if (mark === "incomplete") return "Incomplete";
  if (mark === "needs-work") return "Needs work";
  return "Not reviewed";
}

export function reviewClass(mark) {
  if (mark === "good") return "r-good";
  if (mark === "incomplete") return "r-incomplete";
  if (mark === "needs-work") return "r-needs";
  return "r-none";
}

export function commentAuthor(comment) {
  const name = comment.author?.fullName || "Unknown";
  const username = comment.author?.username ? ` · ${comment.author.username}` : "";
  return `${name}${username}`;
}

/**
 * In-app path helper. Inside the React iframe we keep navigation in-hash and
 * ask the parent to sync via postMessage — never window.top.assign (that made
 * the warm iframe yank the dashboard away on boot).
 */
export function appPath(hashOrPath) {
  let raw = String(hashOrPath || "");
  if (raw.startsWith("#")) raw = raw.slice(1);
  if (!raw.startsWith("/")) raw = `/${raw}`;
  const [path, queryString = ""] = raw.split("?");
  const params = new URLSearchParams(queryString);
  params.delete("embed");
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function embedHashFor(path) {
  return path.includes("?") ? `#${path}&embed=1` : `#${path}?embed=1`;
}

export function appHref(hashOrPath) {
  const path = appPath(hashOrPath);
  if (isEmbedMode()) return embedHashFor(path);
  return `#${path}`;
}

export function appLinkAttrs(hashOrPath) {
  const path = appPath(hashOrPath);
  if (isEmbedMode()) {
    return `href="${embedHashFor(path)}" data-ccst-nav="${path}"`;
  }
  return `href="#${path}"`;
}

function wireEmbedNavClicks() {
  if (window.__ccstNavWired) return;
  window.__ccstNavWired = true;
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a[data-ccst-nav]");
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigateApp(a.getAttribute("data-ccst-nav"));
    },
    true
  );
}

/**
 * @param {string} hashOrPath
 * @param {{ syncParent?: boolean }} [opts] syncParent=false for silent in-iframe
 *   redirects (e.g. restoring ticket filters while the host is warming).
 */
export function navigateApp(hashOrPath, opts = {}) {
  const syncParent = opts.syncParent !== false;
  const path = appPath(hashOrPath);
  if (isEmbedMode()) {
    wireEmbedNavClicks();
    const next = embedHashFor(path);
    state.route = next;
    if (location.hash !== next) location.hash = next;
    else window.dispatchEvent(new HashChangeEvent("hashchange"));
    if (syncParent && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "ccst-classic-nav", path },
          window.location.origin
        );
      } catch {
        /* ignore */
      }
    }
    return;
  }
  location.hash = `#${path}`;
}

/** Tell the React host the classic view has painted (gates the page loader). */
export function notifyParentReady() {
  if (!isEmbedMode()) return;
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage(
      {
        type: "ccst-classic-ready",
        path: appPath(location.hash || state.route || "#/")
      },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

function wireHostReadyPing() {
  if (window.__ccstReadyPingWired) return;
  window.__ccstReadyPingWired = true;
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "ccst-host-await-ready") return;
    notifyParentReady();
  });
}

wireHostReadyPing();


export function parseRoute() {
  const raw = (state.route || "#/dashboard").replace(/^#/, "");
  const [path, queryString] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryString || ""));
  return { parts, query, path: "/" + parts.join("/") };
}
