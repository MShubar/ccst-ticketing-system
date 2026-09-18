import { app, state } from "./lib/state.js";
import {
  api,
  toast,
  escapeHtml,
  formatWhen,
  isInstructor,
  parseRoute
} from "./lib/util.js";
import { shell, wireProfileMenu, profileMenuHtml } from "./lib/shell.js";
import { computeAnchors, mapCorridorY, mapDeviceType, mapOrthogonalWaypoints, mapPickCable, mapPointsToRoundedPath, mapRadioHtml, mapWiresHtml } from "./map-wires.js";
import { cachedGet, invalidateCache, putCache } from "./lib/data-cache.js";
import { flashOptimistic } from "./lib/optimistic.js";

/** Hardware bench is heavy — load only when a PC/printer console opens. */
let hardwareUiPromise = null;
function loadHardwareUi() {
  if (!hardwareUiPromise) {
    hardwareUiPromise = import("./hardware-ui.js?v=93").then((mod) => {
      mod.setHardwareConsoleHooks({ write: consoleWrite, applyGate });
      return mod;
    });
  }
  return hardwareUiPromise;
}

function mapDeviceKind(nodeOrType) {
  if (!nodeOrType || typeof nodeOrType === "string") {
    return { type: nodeOrType || "pc", cloudVm: false };
  }
  const type = nodeOrType.type || "pc";
  const id = String(nodeOrType.id || "");
  const zone = String(nodeOrType.zone || "");
  const cloudVm =
    type === "server" && (zone === "cloud" || /^CLOUD-VM-/i.test(id) || id === "Safqa" || id === "Keratin-Glow");
  return { type, cloudVm };
}

function mapDeviceClass(nodeOrType) {
  const { type, cloudVm } = mapDeviceKind(nodeOrType);
  if (cloudVm) return "map-cloud-vm";
  if (type === "router") return "map-router";
  if (type === "switch") return "map-switch";
  if (type === "server") return "map-server";
  if (type === "printer") return "map-printer";
  if (type === "cloud") return "map-cloud";
  if (type === "ap") return "map-ap";
  if (type === "laptop") return "map-laptop";
  return "map-pc";
}

/** Text baselines inside a device box: a name over an address. */
function mapTextRows(height) {
  const mid = height / 2;
  return { label: mid - 2, meta: mid + 14 };
}

/**
 * Silhouette glyphs — drawn so each kit reads at a glance on the map.
 * View is roughly a 48×44 pad in the left of the device card.
 */
function mapDeviceIcon(nodeOrType) {
  const { type, cloudVm } = mapDeviceKind(nodeOrType);

  if (type === "router") {
    // Branch router: chunky chassis, twin antennas, WAN/LAN LEDs.
    return `<g class="map-glyph map-glyph-router">
      <rect class="map-icon-fill" x="11" y="24" width="30" height="14" rx="3"/>
      <rect class="map-icon-port" x="15" y="29" width="5" height="5" rx="0.7"/>
      <rect class="map-icon-port" x="23" y="29" width="5" height="5" rx="0.7"/>
      <rect class="map-icon-port" x="31" y="29" width="5" height="5" rx="0.7"/>
      <path class="map-icon-antenna" d="M17 24 V10 M17 10 l-4 5 M17 10 l4 5"/>
      <path class="map-icon-antenna" d="M35 24 V10 M35 10 l-4 5 M35 10 l4 5"/>
      <circle class="map-icon-led is-on" cx="37" cy="27" r="1.5"/>
      <circle class="map-icon-led" cx="14" cy="27" r="1.3"/>
    </g>`;
  }

  if (type === "switch") {
    // Flat 1U Ethernet switch with a dense RJ45 faceplate.
    return `<g class="map-glyph map-glyph-switch">
      <rect class="map-icon-fill" x="9" y="18" width="34" height="20" rx="2.5"/>
      <path class="map-icon-line" d="M11 22.5 H41"/>
      ${[13, 17, 21, 25, 29, 33, 37]
        .map((x) => `<rect class="map-icon-port" x="${x - 1.5}" y="25" width="3" height="9" rx="0.45"/>`)
        .join("")}
      <circle class="map-icon-led is-on" cx="13" cy="21" r="1.25"/>
      <circle class="map-icon-led is-on" cx="17.5" cy="21" r="1.25"/>
      <circle class="map-icon-led is-on" cx="22" cy="21" r="1.25"/>
      <circle class="map-icon-led" cx="26.5" cy="21" r="1.25"/>
    </g>`;
  }

  if (cloudVm) {
    // Hosted VM: cloud backdrop with a mini server badge on top.
    return `<g class="map-glyph map-glyph-cloud-vm">
      <path class="map-icon-cloud" d="M13 38c-5 0-9-2.8-9-6.8 0-3 2.2-5.6 5.2-6.5 0.7-3.8 4.2-6.7 8.4-6.7 4.5 0 8.2 3 8.9 7.1 3.2 0.2 5.5 2.6 5.5 5.6 0 3.7-3.1 7.3-9 7.3z"/>
      <rect class="map-icon-fill" x="19" y="20" width="22" height="16" rx="2.2"/>
      <path class="map-icon-line" d="M22 25 H38 M22 30 H35"/>
      <rect class="map-icon-port" x="22" y="32.5" width="6" height="2.2" rx="0.4"/>
      <circle class="map-icon-led is-on" cx="37" cy="33.5" r="1.3"/>
    </g>`;
  }

  if (type === "server") {
    // On-prem / branch VM host: stacked 1U chassis with drive bays.
    return `<g class="map-glyph map-glyph-server">
      <rect class="map-icon-fill" x="12" y="14" width="28" height="11" rx="1.6"/>
      <rect class="map-icon-fill" x="12" y="27" width="28" height="11" rx="1.6"/>
      <rect class="map-icon-port" x="15" y="16.5" width="10" height="6" rx="0.7"/>
      <rect class="map-icon-port" x="15" y="29.5" width="10" height="6" rx="0.7"/>
      <circle class="map-icon-led is-on" cx="34" cy="19.5" r="1.4"/>
      <circle class="map-icon-led is-on" cx="34" cy="32.5" r="1.4"/>
      <path class="map-icon-line" d="M12 25.5 H40"/>
    </g>`;
  }

  if (type === "printer") {
    // Desktop MFP: paper out the top, control panel, cassette.
    return `<g class="map-glyph map-glyph-printer">
      <rect class="map-icon-paper" x="17" y="12" width="18" height="7" rx="1"/>
      <path class="map-icon-fill" d="M13 21 h26 a3.2 3.2 0 0 1 3.2 3.2 v11 a2.2 2.2 0 0 1-2.2 2.2 H12 a2.2 2.2 0 0 1-2.2-2.2 V24.2 A3.2 3.2 0 0 1 13 21z"/>
      <rect class="map-icon-screen" x="19" y="24" width="14" height="6" rx="1"/>
      <rect class="map-icon-port" x="15" y="34" width="22" height="5.5" rx="1.1"/>
      <circle class="map-icon-led is-on" cx="35" cy="27" r="1.4"/>
    </g>`;
  }

  if (type === "cloud") {
    return `<g class="map-glyph map-glyph-cloud">
      <path class="map-icon-cloud" d="M16 36c-5.5 0-10-3.2-10-7.5 0-3.6 2.8-6.6 6.5-7.2 1.2-4.6 5.6-7.8 10.6-7.8 5.5 0 10.1 3.6 11 8.5 3.6 0.4 6.4 3.2 6.4 6.6 0 4.2-3.6 7.4-9.5 7.4z"/>
    </g>`;
  }

  if (type === "ap") {
    return `<g class="map-glyph map-glyph-ap">
      <rect class="map-icon-fill" x="14" y="28" width="24" height="9" rx="4.5"/>
      <circle class="map-icon-led is-on" cx="26" cy="32.5" r="1.6"/>
      <path class="map-icon-wave" d="M20 24a8 8 0 0 1 12 0"/>
      <path class="map-icon-wave" d="M16 19a14 14 0 0 1 20 0"/>
    </g>`;
  }

  if (type === "laptop") {
    return `<g class="map-glyph map-glyph-laptop">
      <rect class="map-icon-fill" x="15" y="16" width="22" height="15" rx="1.5"/>
      <rect class="map-icon-screen" x="17" y="18" width="18" height="11" rx="1"/>
      <path class="map-icon-fill" d="M12 33 h28 l-3 5 H15 z"/>
      <path class="map-icon-line" d="M22 35.5 H30"/>
    </g>`;
  }

  // Desk PC: monitor + stand + keyboard (classic workstation silhouette).
  return `<g class="map-glyph map-glyph-pc">
    <rect class="map-icon-fill" x="13" y="12" width="26" height="19" rx="2.2"/>
    <rect class="map-icon-screen" x="15.5" y="14.2" width="21" height="13" rx="1.2"/>
    <rect class="map-icon-fill" x="23" y="31" width="6" height="3.2" rx="0.6"/>
    <rect class="map-icon-fill" x="15" y="34.5" width="22" height="4.5" rx="1.1"/>
    <path class="map-icon-line" d="M18 36.8 H34"/>
  </g>`;
}

/** Survives repaints so saving a cable never throws away the user's zoom. */
let mapZoom = null;
/** Stops Lab-map live cursors when leaving the map view. */
let mapPresenceCtl = null;
/** Open device console session (command history + IOS/host mode). */
const consoleState = {
  deviceId: null,
  session: null,
  history: [],
  historyIndex: -1,
  gated: false,
  onClose: null
};

export function stopMapPresence() {
  if (!mapPresenceCtl) return;
  try {
    mapPresenceCtl.stop();
  } catch {
    /* already torn down */
  }
  mapPresenceCtl = null;
}
/**
 * The live "click outside to close the search list" handler. Held here so a
 * repaint can take the old one off the document instead of stacking a new
 * listener on top of it every time the map is opened.
 */
let mapSearchOutside = null;

function consoleKindLabel(device) {
  if (device.kind === "router") return "Console — Cisco IOS";
  if (device.kind === "switch") return "Console — Cisco IOS";
  if (device.type === "server") return "Command Prompt — Server";
  if (device.type === "printer") return "Embedded Web Console";
  return "Command Prompt";
}

function consoleBanner(device) {
  if (device.kind === "host") {
    const address = device.mediaDown
      ? device.mediaLabel || "Media disconnected"
      : device.ip
        ? device.ip
        : "no IP";
    return [
      "Microsoft Windows [Version 10.0.19045.4046]",
      "(c) ProCloud Training Center. Classroom simulation.",
      "",
      `Connected to ${device.label} · ${address}.`,
      "Type help for the command list.",
      ""
    ];
  }
  return [
    `Connected to ${device.label} console (${device.cabled}/${device.ports} ports cabled).`,
    "",
    "Press RETURN to get started. Type ? for the command list.",
    ""
  ];
}

function consoleWrite(lines, className = "") {
  const body = document.getElementById("console-body");
  if (!body) return;
  const block = document.createElement("div");
  if (className) block.className = className;
  block.textContent = (Array.isArray(lines) ? lines : [lines]).join("\n");
  body.appendChild(block);
  body.scrollTop = body.scrollHeight;
}

/**
 * Locks the command line when the PC cannot be used at all. The window stays
 * open on purpose — the way out is the Hardware tab, not closing the dialog.
 */
function applyGate(device) {
  const input = document.getElementById("console-line");
  const prompt = document.getElementById("console-prompt");
  if (!input || !prompt) return;
  const blocked = Boolean(device.gate);
  consoleState.gated = blocked;
  input.disabled = blocked;
  prompt.textContent = blocked ? "(no prompt)" : device.prompt;
  document.getElementById("console-form")?.classList.toggle("is-dead", blocked);
}

function showConsoleTab(name) {
  document.getElementById("pane-console").hidden = name !== "console";
  document.getElementById("pane-hardware").hidden = name !== "hardware";
  document.querySelectorAll(".console-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.getAttribute("data-tab") === name);
  });
  const hint = document.getElementById("console-hint");
  const clear = document.getElementById("console-clear");
  // Neither button means anything while a parts list is on screen.
  if (hint) hint.hidden = name !== "console";
  if (clear) clear.hidden = name !== "console";
  if (name !== "hardware") {
    document.getElementById("hw-spares-menu")?.remove();
    document.querySelector("#console-overlay .console-stage")?.classList.remove("is-spares-open");
  }
  if (name === "console") document.getElementById("console-line")?.focus();
}


export function closeDeviceConsole() {
  const wasOpen = Boolean(document.getElementById("console-overlay"));
  document.getElementById("console-overlay")?.remove();
  consoleState.deviceId = null;
  consoleState.session = null;
  const done = consoleState.onClose;
  consoleState.onClose = null;
  if (wasOpen && typeof done === "function") done();
}

async function openDeviceConsole(deviceId, onClose) {
  let info;
  try {
    info = await api(`/api/devices/${encodeURIComponent(deviceId)}`);
  } catch (err) {
    toast(err.message === "auth" ? "Session expired — sign in again." : err.message, "error");
    return;
  }
  const device = info.device;
  closeDeviceConsole();
  consoleState.deviceId = deviceId;
  consoleState.session = null;
  consoleState.history = [];
  consoleState.historyIndex = -1;
  consoleState.onClose = onClose;

  const overlay = document.createElement("div");
  overlay.className = "console-overlay";
  overlay.id = "console-overlay";
  const hasHardware = Boolean(device.hardware && device.hardware.serviceable);
  overlay.innerHTML = `
    <div class="console-stage">
    <div class="console-window console-${escapeHtml(device.kind)}" role="dialog" aria-label="${escapeHtml(device.label)} console">
      <header class="console-head">
        <div class="console-title">
          <strong>${escapeHtml(device.label)}</strong>
          <span>${escapeHtml(consoleKindLabel(device))}</span>
        </div>
        <div class="console-head-actions">
          ${
            hasHardware
              ? `<div class="console-tabs" role="tablist">
                   <button type="button" class="console-tab is-active" data-tab="console">Command prompt</button>
                   <button type="button" class="console-tab" data-tab="hardware">Hardware</button>
                 </div>`
              : ""
          }
          <button type="button" class="console-btn" id="console-hint">Commands</button>
          <button type="button" class="console-btn" id="console-clear">Clear</button>
          <button type="button" class="console-btn is-close" id="console-close">Close</button>
        </div>
      </header>
      <div class="console-pane" id="pane-console">
        <div class="console-body" id="console-body"></div>
        <form class="console-input" id="console-form" autocomplete="off">
          <span class="console-prompt" id="console-prompt">${escapeHtml(device.prompt)}</span>
          <input id="console-line" spellcheck="false" autocapitalize="off" autocorrect="off" aria-label="Command" />
        </form>
      </div>
      <div class="console-pane hw-pane" id="pane-hardware" hidden></div>
      <div class="toast-host console-toast-host" id="console-toast-host" aria-live="polite"></div>
    </div>
    </div>`;
  document.body.appendChild(overlay);

  // A dead PC shows why instead of a prompt, so the first thing the student
  // reads is the symptom the user reported, not a working cursor.
  consoleWrite(device.gate || consoleBanner(device), device.gate ? "console-error" : "console-banner");
  (device.warnings || []).forEach((line) => consoleWrite(line, "console-warn"));
  const input = document.getElementById("console-line");
  applyGate(device);
  if (hasHardware) {
    loadHardwareUi()
      .then((hw) => hw.renderHardware(device, deviceId))
      .catch((err) => console.warn("[map] hardware UI failed to load", err));
  }
  if (!device.gate) input.focus();

  let busy = false;
  const send = async (command) => {
    if (busy) return;
    busy = true;
    input.disabled = true;
    const promptEl = document.getElementById("console-prompt");
    consoleWrite(`${promptEl.textContent}${command}`, "console-echo");
    try {
      const res = await api(`/api/devices/${encodeURIComponent(deviceId)}/console`, {
        method: "POST",
        body: { command, session: consoleState.session }
      });
      consoleState.session = res.session;
      if (res.clear) {
        document.getElementById("console-body").innerHTML = "";
      } else if (res.output.length) {
        consoleWrite(res.output);
      }
      promptEl.textContent = res.prompt;
      if (res.close) closeDeviceConsole();
    } catch (err) {
      consoleWrite(err.message === "auth" ? "Session expired — sign in again." : err.message, "console-error");
    } finally {
      busy = false;
      if (document.getElementById("console-line") && !consoleState.gated) {
        input.disabled = false;
        input.focus();
      }
    }
  };

  document.getElementById("console-form").addEventListener("submit", async (evt) => {
    evt.preventDefault();
    if (busy) return;
    const command = input.value;
    input.value = "";
    if (command.trim()) {
      consoleState.history.push(command);
      consoleState.historyIndex = consoleState.history.length;
    }
    await send(command);
    input.focus();
  });

  input.addEventListener("keydown", (evt) => {
    if (evt.key === "ArrowUp") {
      evt.preventDefault();
      if (!consoleState.history.length) return;
      consoleState.historyIndex = Math.max(0, consoleState.historyIndex - 1);
      input.value = consoleState.history[consoleState.historyIndex] || "";
    } else if (evt.key === "ArrowDown") {
      evt.preventDefault();
      consoleState.historyIndex = Math.min(consoleState.history.length, consoleState.historyIndex + 1);
      input.value = consoleState.history[consoleState.historyIndex] || "";
    } else if (evt.key === "l" && evt.ctrlKey) {
      evt.preventDefault();
      document.getElementById("console-body").innerHTML = "";
    }
  });

  document.querySelectorAll(".console-tab").forEach((tab) => {
    tab.onclick = () => showConsoleTab(tab.getAttribute("data-tab"));
  });

  document.getElementById("console-close").onclick = closeDeviceConsole;
  document.getElementById("console-clear").onclick = () => {
    document.getElementById("console-body").innerHTML = "";
    input.focus();
  };
  document.getElementById("console-hint").onclick = () => {
    if (consoleState.gated) return;
    send(device.kind === "host" ? "help" : "?");
    input.focus();
  };
  overlay.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") closeDeviceConsole();
  });
  overlay.addEventListener("mousedown", (evt) => {
    if (evt.target === overlay) closeDeviceConsole();
  });
}

function mapSvgCursorPoint(svg, evt) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/** Stable colour per classmate so their pointer is recognisable across the room. */
function mapPresenceColor(userId) {
  let h = 0;
  const s = String(userId || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hues = [168, 24, 210, 42, 320, 195, 8, 255, 280, 130];
  return `hsl(${hues[h % hues.length]} 62% 46%)`;
}

/**
 * Shows everyone else currently on this class's Lab map. Positions are SVG
 * viewBox coordinates, so zoom and scroll stay correct for every viewer.
 * Presence polls also carry the map stamp so a classmate's plug/unplug lands
 * here without anyone hitting Save.
 *
 * Tuned for a full class (~40): one presence request per poll tick.
 * Mouse only marks the cursor dirty — posting on every move stampedes the
 * shared Durable Object and queues the whole room.
 */
function startMapPresence(svg, onMapStamp) {
  stopMapPresence();
  if (!svg || !state.user) return;

  const POLL_MS = 2000;

  let last = null;
  let timer = null;
  let stopped = false;
  let dirtyPos = false;
  let inFlight = false;
  let queued = false;
  let lastMapRev = null;

  const layer = () => svg.querySelector("#map-presence-layer");

  const cursorHtml = (p) => {
    const first = String(p.name || "Peer").trim().split(/\s+/)[0] || "Peer";
    const label = escapeHtml(first);
    const fill = mapPresenceColor(p.userId);
    const tagW = Math.max(28, first.length * 6.4 + 12);
    const role = p.role === "instructor" ? " · instructor" : "";
    return `<g class="map-cursor" transform="translate(${Number(p.x) || 0} ${Number(p.y) || 0})" data-user="${escapeHtml(p.userId)}" data-name="${escapeHtml(first)}">
          <path class="map-cursor-arrow" fill="${fill}" stroke="#0b1a24" stroke-width="1.1"
            d="M0 0 L0 18 L5.5 14 L9.5 23 L13 21.5 L8.5 12.5 L15 12.5 Z" />
          <rect class="map-cursor-tag" x="16" y="-2" rx="3" height="15" width="${tagW}" fill="${fill}" />
          <text class="map-cursor-name" x="22" y="9">${label}</text>
          <title>${escapeHtml(p.name || "")}${role}</title>
        </g>`;
  };

  const paint = (peers) => {
    const g = layer();
    if (!g) return;
    const next = new Map();
    for (const p of peers || []) {
      if (p && p.userId) next.set(String(p.userId), p);
    }
    for (const el of [...g.querySelectorAll(".map-cursor")]) {
      const id = el.getAttribute("data-user");
      if (!next.has(id)) el.remove();
    }
    for (const [id, p] of next) {
      const x = Number(p.x) || 0;
      const y = Number(p.y) || 0;
      let el = g.querySelector(`.map-cursor[data-user="${CSS.escape(id)}"]`);
      const first = String(p.name || "Peer").trim().split(/\s+/)[0] || "Peer";
      if (!el) {
        g.insertAdjacentHTML("beforeend", cursorHtml(p));
        continue;
      }
      el.setAttribute("transform", `translate(${x} ${y})`);
      if (el.getAttribute("data-name") !== first) {
        el.outerHTML = cursorHtml(p);
      }
    }
  };

  const sync = async () => {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      const shouldPost = dirtyPos && last;
      dirtyPos = false;
      const data = shouldPost
        ? await api("/api/map/presence", { method: "POST", body: { x: last.x, y: last.y } })
        : await api("/api/map/presence");
      if (stopped) return;
      paint(data.peers);
      const rev = data.mapRev;
      const stamp = data.mapUpdatedAt;
      if (typeof onMapStamp === "function" && stamp && rev !== lastMapRev) {
        lastMapRev = rev;
        onMapStamp(stamp, rev);
      }
    } catch {
      /* session gone or offline — leave the map quietly */
    } finally {
      inFlight = false;
      if (queued && !stopped) {
        queued = false;
        sync();
      }
    }
  };

  const onMove = (evt) => {
    const pt = mapSvgCursorPoint(svg, evt);
    if (!pt) return;
    last = pt;
    dirtyPos = true;
  };

  const goodbye = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    svg.removeEventListener("mousemove", onMove);
    fetch("/api/map/presence", { method: "DELETE", credentials: "include" }).catch(() => {});
    const g = layer();
    if (g) g.innerHTML = "";
  };

  svg.addEventListener("mousemove", onMove);
  timer = setInterval(sync, POLL_MS);
  sync();
  window.addEventListener("pagehide", goodbye);

  mapPresenceCtl = {
    stop() {
      window.removeEventListener("pagehide", goodbye);
      goodbye();
    }
  };
}

export async function renderMap(query = {}) {
  let data;
  if (window.__ccstMapTopology) {
    data = await cachedGet("/api/map?omitTopology=1", { ttl: 20_000 });
    data = { ...data, topology: window.__ccstMapTopology };
  } else {
    data = await cachedGet("/api/map", { ttl: 60_000 });
    window.__ccstMapTopology = data.topology;
    // Seed the lighter endpoint cache for the next visit.
    putCache("/api/map?omitTopology=1", { ...data, topology: undefined });
  }
  const topo = data.topology;
  const anchors = computeAnchors(topo);
  let links = Array.isArray(data.links) ? data.links.slice() : [];
  let mapVersion = data.updatedAt || null;
  let labels = data.labels || {};
  // Radio associations come from the server with the labels, because both are
  // worked out from the devices' current settings.
  let wirelessLinks = Array.isArray(data.wireless) ? data.wireless : [];
  let pending = null;
  let lastResetBy = data.lastResetBy || null;
  let lastResetAt = data.lastResetAt || null;
  const resetStatus = (refaultedCount, deviceCount) => {
    const who = lastResetBy?.fullName || lastResetBy?.username;
    const when = lastResetAt ? ` · ${formatWhen(lastResetAt)}` : "";
    const by = who ? ` by ${who}${when}` : "";
    if (refaultedCount == null) {
      return who ? `Last reset to the design${by}.` : null;
    }
    const left = [];
    if (refaultedCount) left.push(`${refaultedCount} cable(s) left unplugged`);
    if (deviceCount) left.push(`${deviceCount} device(s) left faulty`);
    return left.length
      ? `Reset to the design${by}; ${left.join(" and ")} for open tickets.`
      : `Cabling and device configs reset to the design${by}.`;
  };
  let status =
    resetStatus(null) ||
    "Click a free port, then another port, to plug a cable — it syncs live for the class. Click a cable to unplug it.";
  let expandedBundles = new Set();
  let pullingMap = false;
  let opChain = Promise.resolve();
  const fullscreen = query.fullscreen === "1" || query.fullscreen === "true";
  const vb = topo.viewBox || "0 0 1900 1780";
  const baseSvgW = Number(vb.split(/\s+/)[2]) || 1900;
  // Low enough that the whole company fits in a laptop pane at one glance.
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.15;
  let zoom = mapZoom != null ? mapZoom : fullscreen ? 1 : 0.85;

  const occupied = () => {
    const set = new Set();
    links.forEach((l) => {
      set.add(l.a);
      set.add(l.b);
    });
    return set;
  };

  const setStatus = (msg) => {
    status = msg;
    const statusEl = document.getElementById("map-status");
    if (statusEl) statusEl.textContent = status;
  };

  const syncSelection = () => {
    setStatus(status);
    document.querySelectorAll(".map-port").forEach((el) => {
      const key = el.getAttribute("data-endpoint");
      el.classList.toggle("is-selected", pending === key);
    });
    const ghost = document.getElementById("map-ghost");
    if (ghost) {
      ghost.setAttribute("d", "");
      ghost.classList.toggle("is-active", Boolean(pending));
    }
    document.getElementById("map-board")?.classList.toggle("is-wiring", Boolean(pending));
  };

  const syncPortsBusy = () => {
    const used = occupied();
    document.querySelectorAll(".map-port").forEach((el) => {
      const key = el.getAttribute("data-endpoint");
      const busy = used.has(key);
      el.classList.toggle("is-busy", busy);
      el.classList.toggle("is-free", !busy);
    });
  };

  const applyZoom = (next, pivot) => {
    const scroller = document.getElementById("map-scroll");
    const svg = document.getElementById("lab-map-svg");
    const label = document.getElementById("map-zoom-label");
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 100) / 100;
    const prev = zoom;
    zoom = clamped;
    mapZoom = zoom;
    if (svg) {
      svg.style.width = `${Math.round(baseSvgW * zoom)}px`;
      svg.removeAttribute("width");
    }
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    if (scroller && prev > 0 && Number.isFinite(prev)) {
      const ratio = zoom / prev;
      if (pivot) {
        const rect = scroller.getBoundingClientRect();
        const px = pivot.clientX - rect.left;
        const py = pivot.clientY - rect.top;
        scroller.scrollLeft = (scroller.scrollLeft + px) * ratio - px;
        scroller.scrollTop = (scroller.scrollTop + py) * ratio - py;
      } else {
        const cx = scroller.clientWidth / 2;
        const cy = scroller.clientHeight / 2;
        scroller.scrollLeft = (scroller.scrollLeft + cx) * ratio - cx;
        scroller.scrollTop = (scroller.scrollTop + cy) * ratio - cy;
      }
    }
  };

  /* ---- Find a device ------------------------------------------- *
   * The company is too wide to scan by eye, so a ticket that names
   * PC-SUP7 should not turn into a hunt across twelve departments.
   * ------------------------------------------------------------- */

  const SEARCH_MAX = 12;
  // Readable enough to see the address under the name once we jump there.
  const SEARCH_ZOOM = 0.45;
  let searchHits = [];
  let searchCursor = -1;

  /** One searchable row per device: name, where it lives, and its address. */
  const searchRow = (n) => {
    const info = labels[n.id] || {};
    const detail = info.meta || n.ip || n.role || n.type;
    return {
      id: n.id,
      label: info.label || n.label || n.id,
      place: n.place || "",
      detail,
      type: n.type,
      zone: n.zone || "",
      // `type` is in here so "sales printer" and "branch d switch" narrow the
      // way a student would say it out loud.
      hay: [n.id, n.label, n.place, n.role, n.ip, n.type, info.meta]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    };
  };

  /**
   * Every word has to appear somewhere in the row, so "sales printer" and
   * "10.10.20" both narrow the list. Ranked so an exact device name wins.
   */
  const searchMatches = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    const scored = [];
    for (const n of topo.nodes) {
      const row = searchRow(n);
      if (!terms.every((t) => row.hay.includes(t))) continue;
      const id = row.id.toLowerCase();
      const place = row.place.toLowerCase();
      let rank = 4;
      if (id === q) rank = 0;
      else if (id.startsWith(q)) rank = 1;
      else if (row.detail.toLowerCase().startsWith(q)) rank = 2;
      else if (place.startsWith(q)) rank = 3;
      scored.push({ ...row, rank });
      if (scored.length > 400) break;
    }
    scored.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id, undefined, { numeric: true }));
    return scored.slice(0, SEARCH_MAX);
  };

  const paintSearchResults = () => {
    const box = document.getElementById("map-search-results");
    if (!box) return;
    if (!searchHits.length) {
      box.innerHTML = "";
      box.classList.remove("is-open");
      return;
    }
    box.innerHTML = searchHits
      .map(
        (h, i) => `<li>
          <button type="button" class="map-search-hit ${i === searchCursor ? "is-cursor" : ""}"
            data-hit="${escapeHtml(h.id)}" data-index="${i}">
            <span class="mh-name"><i class="${mapDeviceClass(h).replace("map-", "lg-")}"></i>${escapeHtml(h.label)}</span>
            <span class="mh-where">${escapeHtml(h.place)}</span>
            <span class="mh-detail">${escapeHtml(h.detail)}</span>
          </button>
        </li>`
      )
      .join("");
    box.classList.add("is-open");
    box.querySelectorAll(".map-search-hit").forEach((btn) => {
      btn.onclick = () => revealDevice(btn.getAttribute("data-hit"));
      btn.onmouseenter = () => {
        searchCursor = Number(btn.getAttribute("data-index"));
        box.querySelectorAll(".map-search-hit").forEach((b, i) => b.classList.toggle("is-cursor", i === searchCursor));
      };
    });
  };

  const closeSearchResults = () => {
    searchHits = [];
    searchCursor = -1;
    paintSearchResults();
  };

  /**
   * Centre a device in the pane and flash it. Zooming in first matters: at the
   * fit-to-pane zoom the boxes are thumbnails, so landing on one without
   * zooming would tell the student nothing.
   */
  const revealDevice = (id) => {
    const nodeEl = Array.from(document.querySelectorAll(".map-device[data-device]")).find(
      (el) => el.getAttribute("data-device") === id
    );
    const n = topo.nodes.find((x) => x.id === id);
    if (!n) return;
    if (zoom < SEARCH_ZOOM) applyZoom(SEARCH_ZOOM);
    const scroller = document.getElementById("map-scroll");
    if (scroller) {
      const cx = (n.x + (n.w || 112) / 2) * zoom;
      const cy = (n.y + (n.h || 58) / 2) * zoom;
      scroller.scrollTo({
        left: Math.max(0, cx - scroller.clientWidth / 2),
        top: Math.max(0, cy - scroller.clientHeight / 2),
        behavior: "smooth"
      });
    }
    document.querySelectorAll(".map-device.is-found").forEach((el) => el.classList.remove("is-found"));
    if (nodeEl) {
      nodeEl.classList.add("is-found");
      // Long enough to catch the eye after the scroll settles, then gone, so
      // the next search is not competing with a stale highlight.
      setTimeout(() => nodeEl.classList.remove("is-found"), 2600);
    }
    const where = n.place ? ` · ${n.place}` : "";
    const opens =
      n.type === "router" || n.type === "switch" || n.type === "ap" ? "console" : "command prompt";
    setStatus(`Found ${id}${where}. Click it to open its ${opens}.`);
    closeSearchResults();
  };

  const nextLinkId = (list) => {
    let max = 0;
    for (const l of list || []) {
      const m = /^L(\d+)$/i.exec(String(l.id || ""));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `L${String(max + 1).padStart(3, "0")}`;
  };

  const cloneLabels = (src) => {
    const out = {};
    for (const [id, info] of Object.entries(src || {})) {
      out[id] = { ...(info || {}) };
    }
    return out;
  };

  const deviceIdOf = (endpoint) => String(endpoint || "").split(":")[0];

  const deviceHasCable = (list, deviceId) =>
    (list || []).some(
      (l) => l.a.startsWith(`${deviceId}:`) || l.b.startsWith(`${deviceId}:`)
    );

  /** Instant map badge so unplug/plug does not wait on /api/map/labels. */
  const patchHostLabels = (prevLinks, nextLinks) => {
    const touched = new Set();
    for (const l of prevLinks || []) {
      touched.add(deviceIdOf(l.a));
      touched.add(deviceIdOf(l.b));
    }
    for (const l of nextLinks || []) {
      touched.add(deviceIdOf(l.a));
      touched.add(deviceIdOf(l.b));
    }
    const next = cloneLabels(labels);
    for (const id of touched) {
      const node = (topo.nodes || []).find((n) => n.id === id);
      if (!node) continue;
      if (!["pc", "laptop", "printer", "server"].includes(node.type)) continue;
      const had = deviceHasCable(prevLinks, id);
      const has = deviceHasCable(nextLinks, id);
      if (had === has) continue;
      const info = { ...(next[id] || {}) };
      if (!has) {
        info.meta = "Media disconnected";
        info.alert = true;
      } else if (info.meta === "Media disconnected" || info.alert) {
        info.meta = node.ip || node.role || node.type;
        info.alert = false;
      }
      next[id] = info;
      const el = document.querySelector(`.map-device[data-device="${CSS.escape(id)}"]`);
      if (el) flashOptimistic(el);
    }
    labels = next;
  };

  const applyLocalLinkOp = (body) => {
    const current = links.slice();
    const action = String(body.action || "").toLowerCase();
    if (action === "unplug" || action === "remove") {
      const id = body.id != null ? String(body.id) : "";
      const a = String(body.a || "").trim();
      const b = String(body.b || "").trim();
      let idx = -1;
      if (id) idx = current.findIndex((l) => l.id === id);
      if (idx < 0 && a && b) {
        idx = current.findIndex(
          (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
        );
      }
      if (idx < 0) return { ok: false, error: "That cable is already gone." };
      current.splice(idx, 1);
      return { ok: true, links: current };
    }
    if (action === "plug" || action === "add") {
      const a = String(body.a || "").trim();
      const b = String(body.b || "").trim();
      if (!a || !b || a === b) return { ok: false, error: "Pick two different ports." };
      const used = occupied();
      if (used.has(a) || used.has(b)) {
        const busy = used.has(a) ? a : b;
        return {
          ok: false,
          error: `${busy} already has a cable. Click a white (free) port, or click that cable to unplug it first.`
        };
      }
      const cable =
        body.cable ||
        mapPickCable(mapDeviceType(topo, a), mapDeviceType(topo, b));
      current.push({ id: nextLinkId(current), a, b, cable });
      return { ok: true, links: current };
    }
    return { ok: false, error: "Unknown map action." };
  };

  /**
   * Plug/unplug paints the wire (and Media disconnected badge) immediately,
   * then confirms with the live class map. Failure rolls the local view back.
   */
  const applyLinkOp = (body) => {
    opChain = opChain
      .then(async () => {
        const prevLinks = links.slice();
        const prevLabels = cloneLabels(labels);
        const local = applyLocalLinkOp(body);
        if (!local.ok) {
          const err = new Error(local.error || "Could not update that cable.");
          throw err;
        }
        links = local.links;
        patchHostLabels(prevLinks, links);
        refreshWires();
        paintLabels();
        syncSelection();

        try {
          const data = await api("/api/map/links/op", { method: "POST", body });
          links = Array.isArray(data.links) ? data.links : links;
          mapVersion = data.updatedAt || mapVersion;
          refreshWires();
          syncSelection();
          await refreshLabels();
          invalidateCache("/api/map");
          putCache("/api/map?omitTopology=1", {
            links,
            updatedAt: mapVersion,
            labels,
            wireless: wirelessLinks
          });
          return data;
        } catch (err) {
          links = prevLinks;
          labels = prevLabels;
          refreshWires();
          paintLabels();
          syncSelection();
          throw err;
        }
      })
      .catch((err) => {
        setStatus(err.message);
        throw err;
      });
    return opChain;
  };

  const pullLinksIfNewer = async (stamp) => {
    if (!stamp || stamp === mapVersion || pullingMap || pending) return;
    pullingMap = true;
    try {
      const fresh = await api("/api/map/links");
      if (pending) return;
      links = Array.isArray(fresh.links) ? fresh.links : links;
      mapVersion = fresh.updatedAt || mapVersion;
      refreshWires();
      syncSelection();
    } catch {
      /* ignore — next presence tick retries */
    } finally {
      pullingMap = false;
    }
  };

  const bindWireClicks = () => {
    const unplug = async (id) => {
      setStatus("Cable unplugged.");
      try {
        await applyLinkOp({ action: "unplug", id });
        pending = null;
        setStatus("Cable unplugged — live for the class.");
      } catch (err) {
        setStatus(err.message || "Could not unplug that cable.");
        toast(err.message || "Could not unplug that cable.", "warn");
      }
    };

    document.querySelectorAll(".map-wire-group[data-link]").forEach((el) => {
      el.onclick = async (evt) => {
        evt.stopPropagation();
        await unplug(el.getAttribute("data-link"));
      };
    });

    document.querySelectorAll(".map-bundle").forEach((el) => {
      const key = el.getAttribute("data-bundle");
      el.classList.toggle("is-expanded", expandedBundles.has(key));
      el.onclick = (evt) => {
        if (evt.target.closest(".map-bundle-expanded .map-wire-group")) return;
        evt.stopPropagation();
        if (expandedBundles.has(key)) expandedBundles.delete(key);
        else expandedBundles.add(key);
        el.classList.toggle("is-expanded", expandedBundles.has(key));
      };
      el.querySelectorAll(".map-bundle-expanded .map-wire-group[data-link]").forEach((wireEl) => {
        wireEl.onclick = async (evt) => {
          evt.stopPropagation();
          await unplug(wireEl.getAttribute("data-link"));
        };
      });
    });
  };

  const refreshWires = () => {
    const layer = document.querySelector(".map-wires");
    if (!layer) return;
    layer.innerHTML = mapWiresHtml(topo, links, anchors);
    const present = new Set(
      [...document.querySelectorAll(".map-bundle")].map((el) => el.getAttribute("data-bundle"))
    );
    for (const key of [...expandedBundles]) {
      if (!present.has(key)) expandedBundles.delete(key);
    }
    document.querySelectorAll(".map-bundle").forEach((el) => {
      el.classList.toggle("is-expanded", expandedBundles.has(el.getAttribute("data-bundle")));
    });
    syncPortsBusy();
    bindWireClicks();
  };

  const refreshRadio = () => {
    const layer = document.querySelector(".map-radio");
    if (layer) layer.innerHTML = mapRadioHtml(wirelessLinks, anchors);
  };

  const paintLabels = () => {
    document.querySelectorAll(".map-device[data-device]").forEach((el) => {
      const info = labels[el.getAttribute("data-device")];
      if (!info) return;
      const full = info.label || "";
      const labelEl = el.querySelector(".map-label");
      const metaEl = el.querySelector(".map-meta");
      const titleEl = el.querySelector("title");
      const height = Number(el.querySelector(".map-device-body")?.getAttribute("height")) || 56;
      const rows = mapTextRows(height);
      // A jammed printer, a stopped service or a radio that is down says so on
      // the box itself, so a student scanning the map can see where to go.
      el.classList.toggle("is-alert", Boolean(info.alert));
      if (labelEl) {
        labelEl.textContent = full.length > 14 ? full.slice(0, 13) + "…" : full;
        labelEl.setAttribute("y", rows.label);
      }
      if (metaEl) {
        metaEl.textContent = info.meta || "";
        metaEl.setAttribute("y", rows.meta);
      }
      if (titleEl) titleEl.textContent = info.tooltip || full;
    });
  };

  const refreshLabels = async () => {
    try {
      const res = await api("/api/map/labels");
      labels = res.labels || labels;
      if (Array.isArray(res.wireless)) {
        wirelessLinks = res.wireless;
        refreshRadio();
      }
    } catch {
      return;
    }
    paintLabels();
  };

  const updateGhost = (cursor) => {
    const ghost = document.getElementById("map-ghost");
    if (!ghost || !pending) {
      if (ghost) ghost.setAttribute("d", "");
      return;
    }
    const start = anchors.get(pending);
    if (!start || !cursor) return;
    const role = "access";
    const midY = mapCorridorY(start, cursor, role, topo);
    const pts = mapOrthogonalWaypoints(start, cursor, midY, 0, role);
    ghost.setAttribute("d", mapPointsToRoundedPath(pts));
  };

  const mapBodyHtml = () => {
    const used = occupied();

    const zones = (topo.zones || [])
      .map(
        (z) => `<g class="map-zone map-zone-${escapeHtml(z.tone || z.id)}">
          <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="18" />
          <text class="map-zone-label" x="${z.x + 18}" y="${z.y + 28}">${escapeHtml(z.label)}</text>
        </g>`
      )
      .join("");

    const devices = topo.nodes
      .map((n) => {
        const w = n.w || 108;
        const h = n.h || 56;
        const ports = n.ports || [];
        const portNodes = ports
          .map((p) => {
            const key = `${n.id}:${p.id}`;
            const pt = anchors.get(key);
            if (!pt) return "";
            // Radio slots are not sockets: there is nothing to plug into them.
            if (/^Wlan/i.test(p.id)) return "";
            const busy = used.has(key);
            return `<g class="map-port ${busy ? "is-busy" : "is-free"}" data-endpoint="${escapeHtml(key)}" transform="translate(${pt.x},${pt.y})">
              <circle r="5.5" />
              <title>${escapeHtml(key)}</title>
            </g>`;
          })
          .join("");
        const info = labels[n.id] || {};
        const fullLabel = info.label || n.label;
        const shortLabel = fullLabel.length > 14 ? fullLabel.slice(0, 13) + "…" : fullLabel;
        const meta = info.meta || n.role || n.ip || n.type;
        const consoleWord =
          n.type === "router" || n.type === "switch" || n.type === "ap" ? "console" : "command prompt";
        const tooltip = info.tooltip || `${fullLabel} — click to open the ${consoleWord}`;
        const rows = mapTextRows(h);
        return `<g class="map-device ${mapDeviceClass(n)}${info.alert ? " is-alert" : ""}" data-device="${escapeHtml(n.id)}" transform="translate(${n.x},${n.y})">
          <rect class="map-device-body" width="${w}" height="${h}" rx="12" />
          <g transform="translate(4,0)">${mapDeviceIcon(n)}</g>
          <text class="map-label" x="${w / 2 + 10}" y="${rows.label}" text-anchor="middle">${escapeHtml(shortLabel)}</text>
          <text class="map-meta" x="${w / 2 + 10}" y="${rows.meta}" text-anchor="middle">${escapeHtml(meta)}</text>
          <title>${escapeHtml(tooltip)}</title>
        </g>${portNodes}`;
      })
      .join("");

    const wires = mapWiresHtml(topo, links, anchors);
    const openFullBtn = fullscreen
      ? `<button class="btn secondary" type="button" id="map-exit-full">Back to app</button>
         <button class="btn secondary" type="button" id="map-browser-full">Browser fullscreen</button>`
      : `<button class="btn secondary" type="button" id="map-open-full" title="Open map in a new tab">Open full screen</button>`;

    return `
      <div class="map-toolbar card">
        <div class="map-search" id="map-search-box">
          <label class="map-search-label" for="map-search">Find a device</label>
          <input id="map-search" type="search" autocomplete="off" spellcheck="false"
            placeholder="PC-S1, 10.10.20.10, Finance, printer…" aria-label="Find a device on the map" />
          <ul class="map-search-results" id="map-search-results" role="listbox"></ul>
        </div>
        ${isInstructor() ? `<button class="btn" type="button" id="map-reset">Reset to design</button>` : ""}
        <div class="map-zoom" role="group" aria-label="Zoom">
          <button class="btn secondary map-zoom-btn" type="button" id="map-zoom-out" title="Zoom out">−</button>
          <button class="btn secondary map-zoom-label" type="button" id="map-zoom-label" title="Reset zoom">${Math.round(zoom * 100)}%</button>
          <button class="btn secondary map-zoom-btn" type="button" id="map-zoom-in" title="Zoom in">+</button>
        </div>
        ${openFullBtn}
        <div class="map-legend">
          <span><i class="lg-pc"></i> PC</span>
          <span><i class="lg-laptop"></i> Laptop</span>
          <span><i class="lg-printer"></i> Printer</span>
          <span><i class="lg-switch"></i> Switch</span>
          <span><i class="lg-router"></i> Router</span>
          <span><i class="lg-server"></i> Server / VM</span>
          <span><i class="lg-cloud-vm"></i> Cloud VM</span>
          <span><i class="lg-ap"></i> Access point</span>
        </div>
        <span class="hint" id="map-status">${escapeHtml(status)}</span>
      </div>
      <div class="map-board card ${fullscreen ? "is-fullscreen" : ""}" id="map-board">
        <div class="map-scroll" id="map-scroll" tabindex="0">
          <svg class="lab-map" id="lab-map-svg" viewBox="${escapeHtml(vb)}" style="width:${Math.round(baseSvgW * zoom)}px" role="img" aria-label="Lab network map">
            <defs>
              <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(22,48,71,0.04)" stroke-width="1"/>
              </pattern>
            </defs>
            <rect class="map-canvas-bg" x="0" y="0" width="100%" height="100%" fill="url(#map-grid)" />
            <g class="map-zones">${zones}</g>
            <g class="map-wires">${wires}</g>
            <g class="map-radio">${mapRadioHtml(wirelessLinks, anchors)}</g>
            <path id="map-ghost" class="map-ghost" d="" />
            <g class="map-devices">${devices}</g>
            <g id="map-presence-layer" class="map-presence" aria-hidden="true"></g>
          </svg>
        </div>
        <p class="hint">Click a device for its console. Click two ports to plug a cable.</p>
      </div>`;
  };

  const paintShell = () => {
    if (fullscreen) {
      const className = state.user?.className || state.class?.name || "Class";
      app.innerHTML = `
        <div class="map-full-shell">
          <header class="map-full-top">
            <div>
              <div class="brand-kicker">ProCloud · ${escapeHtml(className)}</div>
              <h1>Lab map</h1>
            </div>
            ${profileMenuHtml(parseRoute())}
          </header>
          <main class="map-full-main">${mapBodyHtml()}</main>
        </div>`;
      wireProfileMenu();
    } else {
      shell(
        "Lab map",
        "",
        mapBodyHtml()
      );
    }

    document.getElementById("map-reset")?.addEventListener("click", async () => {
      if (
        !confirm(
          "Reset this class to the designed cabling and device configuration?\n\n" +
            "Cables named by open lab-map tickets stay unplugged, so those tickets are still solvable."
        )
      )
        return;
      try {
        const res = await api("/api/map/reset", { method: "POST", body: {} });
        const dev = await api("/api/devices/reset", { method: "POST", body: {} });
        links = res.links;
        mapVersion = res.updatedAt || mapVersion;
        lastResetBy = res.lastResetBy || lastResetBy;
        lastResetAt = res.lastResetAt || lastResetAt;
        pending = null;
        expandedBundles = new Set();
        setStatus(resetStatus((res.refaulted || []).length, (dev?.refaulted || []).length));
        refreshWires();
        syncSelection();
        refreshLabels();
      } catch (err) {
        setStatus(err.message);
      }
    });

    const search = document.getElementById("map-search");
    if (search) {
      search.oninput = () => {
        searchHits = searchMatches(search.value);
        searchCursor = searchHits.length ? 0 : -1;
        paintSearchResults();
      };
      search.onkeydown = (evt) => {
        if (evt.key === "Escape") {
          closeSearchResults();
          search.blur();
          return;
        }
        if (!searchHits.length) return;
        if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
          evt.preventDefault();
          const step = evt.key === "ArrowDown" ? 1 : -1;
          searchCursor = (searchCursor + step + searchHits.length) % searchHits.length;
          paintSearchResults();
          return;
        }
        if (evt.key === "Enter") {
          evt.preventDefault();
          const hit = searchHits[searchCursor >= 0 ? searchCursor : 0];
          if (hit) revealDevice(hit.id);
        }
      };
      search.onfocus = () => {
        if (search.value.trim()) {
          searchHits = searchMatches(search.value);
          searchCursor = searchHits.length ? 0 : -1;
          paintSearchResults();
        }
      };
      // Clicking the map, or anywhere else, should not leave a list hanging.
      if (mapSearchOutside) document.removeEventListener("click", mapSearchOutside);
      mapSearchOutside = (evt) => {
        if (!document.getElementById("map-search-box")?.contains(evt.target)) closeSearchResults();
      };
      document.addEventListener("click", mapSearchOutside);
    }

    document.getElementById("map-zoom-in").onclick = () => applyZoom(zoom + ZOOM_STEP);
    document.getElementById("map-zoom-out").onclick = () => applyZoom(zoom - ZOOM_STEP);
    document.getElementById("map-zoom-label").onclick = () => applyZoom(fullscreen ? 1 : 0.85);

    const openFull = document.getElementById("map-open-full");
    if (openFull) {
      openFull.onclick = () => {
        const url = `${location.origin}${location.pathname}#/map?fullscreen=1`;
        window.open(url, "_blank", "noopener,noreferrer");
      };
    }
    const exitFull = document.getElementById("map-exit-full");
    if (exitFull) {
      exitFull.onclick = () => {
        location.hash = "#/map";
      };
    }
    const browserFull = document.getElementById("map-browser-full");
    if (browserFull) {
      browserFull.onclick = async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            browserFull.textContent = "Exit browser fullscreen";
          } else {
            await document.exitFullscreen();
            browserFull.textContent = "Browser fullscreen";
          }
        } catch {
          setStatus("Fullscreen was blocked by the browser.");
        }
      };
    }

    const scroller = document.getElementById("map-scroll");
    if (scroller) {
      scroller.addEventListener(
        "wheel",
        (evt) => {
          if (!(evt.ctrlKey || evt.metaKey)) return;
          evt.preventDefault();
          const delta = evt.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          applyZoom(zoom + delta, evt);
        },
        { passive: false }
      );

      // The canvas is far wider than tall, so fit it to the pane on first open
      // instead of dropping the user at an arbitrary zoom mid-topology.
      if (mapZoom == null) {
        const fit = (scroller.clientWidth - 6) / baseSvgW;
        if (fit > 0) applyZoom(Math.min(1, fit));
      }
    }

    const svg = document.getElementById("lab-map-svg");
    if (svg) {
      svg.addEventListener("mousemove", (evt) => {
        if (!pending) return;
        updateGhost(mapSvgCursorPoint(svg, evt));
      });
      // Click empty map space (not a port, device or cable) to drop a half-started cable.
      svg.addEventListener("click", (evt) => {
        if (!pending) return;
        if (evt.target.closest(".map-port, .map-device, .map-wire-group, .map-bundle, .map-cursor")) return;
        pending = null;
        setStatus("Selection cleared. Click a free port to start a cable.");
        syncSelection();
        updateGhost(null);
      });
      startMapPresence(svg, (stamp) => {
        pullLinksIfNewer(stamp);
      });
    }

    document.querySelectorAll(".map-device[data-device]").forEach((el) => {
      el.addEventListener("click", (evt) => {
        evt.stopPropagation();
        openDeviceConsole(el.getAttribute("data-device"), refreshLabels);
      });
    });

    document.querySelectorAll(".map-port").forEach((el) => {
      el.addEventListener("click", async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const key = el.getAttribute("data-endpoint");
        const usedNow = occupied();
        if (usedNow.has(key) && pending !== key) {
          // Teal = already cabled. Keep the first free port selected so they
          // can aim at another free circle without starting over.
          toast(`${key} already has a cable — click a white (free) port, or click the cable to unplug.`, "warn");
          setStatus(
            pending
              ? `Still holding ${pending}. Click a free white port — teal means taken.`
              : "That port is taken (teal). Click a white free port, or click the cable to unplug it."
          );
          syncSelection();
          return;
        }
        if (!pending) {
          pending = key;
          setStatus(`Selected ${key}. Click the other end — or empty map space to cancel.`);
          syncSelection();
          return;
        }
        if (pending === key) {
          pending = null;
          setStatus("Selection cleared.");
          syncSelection();
          return;
        }
        if (usedNow.has(pending)) {
          toast(`${pending} was taken meanwhile — pick a free port again.`, "warn");
          pending = null;
          syncSelection();
          try {
            const fresh = await api("/api/map?omitTopology=1");
            links = Array.isArray(fresh.links) ? fresh.links : links;
            mapVersion = fresh.updatedAt || mapVersion;
            refreshWires();
          } catch {
            /* keep local */
          }
          return;
        }
        const cable = mapPickCable(mapDeviceType(topo, pending), mapDeviceType(topo, key));
        const from = pending;
        const to = key;
        pending = null;
        setStatus(`Cable plugged (${cable}) — live for the class.`);
        syncSelection();
        updateGhost(null);
        try {
          await applyLinkOp({ action: "plug", a: from, b: to, cable });
          setStatus("Cable plugged — live for the class.");
        } catch (err) {
          const stillFree = !occupied().has(from);
          if (stillFree) {
            pending = from;
            setStatus(`Still holding ${from}. That other port was taken — click a free white port.`);
          } else {
            setStatus("Plug failed — pick a free white port to try again.");
          }
          toast(err.message || "Could not plug that cable.", "warn");
          syncSelection();
        }
      });
    });

    bindWireClicks();
    syncSelection();
    applyZoom(zoom);
  };

  paintShell();
}
