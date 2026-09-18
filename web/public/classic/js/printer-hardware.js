/**
 * Interactive printer service bench — open covers, clear jams, load paper, swap toner.
 */
import { api, toast, escapeHtml } from "./lib/util.js";

let prnDevice = null;
let prnDeviceId = null;
let prnChain = Promise.resolve();
let prnGen = 0;
let prnConsoleWrite = () => {};
let prnApplyGate = () => {};

export function setPrinterConsoleHooks({ write, applyGate }) {
  if (typeof write === "function") prnConsoleWrite = write;
  if (typeof applyGate === "function") prnApplyGate = applyGate;
}

function clone(device) {
  return device ? JSON.parse(JSON.stringify(device)) : null;
}

function applyOptimisticPrinter(device, body = {}) {
  const hw = device?.hardware;
  if (!hw || hw.kind !== "printer" || !hw.serviceable) return null;
  const action = String(body.action || "").toLowerCase();

  if (action === "open-cover") {
    if (hw.coverOpen) return null;
    hw.coverOpen = true;
  } else if (action === "close-cover") {
    if (!hw.coverOpen || hw.status === "jam") return null;
    hw.coverOpen = false;
  } else if (action === "open-tray") {
    if (hw.trayOut) return null;
    hw.trayOut = true;
  } else if (action === "close-tray") {
    if (!hw.trayOut) return null;
    hw.trayOut = false;
  } else if (action === "open-door") {
    if (hw.doorOpen) return null;
    hw.doorOpen = true;
  } else if (action === "close-door") {
    if (!hw.doorOpen || !hw.cartridgeIn) return null;
    hw.doorOpen = false;
  } else if (action === "pull-toner") {
    if (!hw.doorOpen || !hw.cartridgeIn) return null;
    hw.cartridgeIn = false;
    hw.toner = 0;
    if (hw.status === "ready" || hw.status === "held") hw.status = "no-toner";
  } else if (action === "clear") {
    if (hw.status !== "jam" || !hw.coverOpen) return null;
    hw.status = "ready";
    hw.blocked = null;
    hw.panel = "Ready";
    hw.say = "The printer is ready.";
  } else if (action === "paper") {
    if (!hw.trayOut) return null;
    if (hw.tray > 0 && hw.status !== "no-paper") return null;
    hw.tray = 500;
    if (hw.status === "no-paper") hw.status = "ready";
    hw.blocked = null;
    hw.panel = "Ready";
    hw.say = "The printer is ready.";
  } else if (action === "toner") {
    if (!hw.doorOpen) return null;
    if (hw.cartridgeIn && hw.toner > 0 && hw.status !== "no-toner") return null;
    hw.cartridgeIn = true;
    hw.toner = 100;
    if (hw.status === "no-toner") hw.status = "ready";
    hw.blocked = null;
    hw.panel = "Ready";
    hw.say = "The printer is ready.";
  } else {
    return null;
  }

  hw.hint =
    hw.status === "jam"
      ? "Open the access cover, pull the jammed sheet out, then close the cover."
      : hw.status === "no-paper" || hw.tray <= 0
        ? "Pull tray 1 out, load a ream, then push the tray home."
        : hw.status === "no-toner" || hw.toner <= 0 || !hw.cartridgeIn
          ? "Open the toner door, pull the spent cartridge, fit a new one, then close the door."
          : "Front panel and paper path look fine.";
  return device;
}

function printerDiagram(hw) {
  const jam = hw.status === "jam";
  const emptyTray = hw.tray <= 0 || hw.status === "no-paper";
  const spent = !hw.cartridgeIn || hw.toner <= 0 || hw.status === "no-toner";
  const tonerH = Math.max(4, Math.round((Math.max(0, hw.toner) / 100) * 28));
  const panel = escapeHtml((hw.panel || "Ready").slice(0, 18));

  return `
  <div class="prn-figure">
    <svg viewBox="0 0 560 380" class="prn-svg" role="img" aria-label="Printer service bench">
      <defs>
        <linearGradient id="prnShell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1c3648"/>
          <stop offset="55%" stop-color="#132735"/>
          <stop offset="100%" stop-color="#0c1a24"/>
        </linearGradient>
        <linearGradient id="prnTop" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#243b4c"/>
          <stop offset="50%" stop-color="#2f4d61"/>
          <stop offset="100%" stop-color="#1e3545"/>
        </linearGradient>
        <linearGradient id="prnFaceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#152838"/>
          <stop offset="100%" stop-color="#0a1620"/>
        </linearGradient>
        <linearGradient id="prnBezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0e1c26"/>
          <stop offset="100%" stop-color="#061018"/>
        </linearGradient>
        <filter id="prnShadow" x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#02080c" flood-opacity="0.55"/>
        </filter>
      </defs>

      <!-- Desk shadow -->
      <ellipse cx="280" cy="352" rx="196" ry="14" fill="#040a10" opacity="0.45"/>

      <!-- Chassis depth / side -->
      <path class="prn-depth" d="M428 78 L468 98 L468 278 L428 298 Z" filter="url(#prnShadow)"/>
      <!-- Main body -->
      <rect class="prn-body" x="88" y="78" width="340" height="220" rx="18" fill="url(#prnShell)" filter="url(#prnShadow)"/>
      <!-- Top deck -->
      <path class="prn-deck" d="M100 78 H416 L456 98 H88 Z" fill="url(#prnTop)"/>
      <!-- Output tray (top) -->
      <path class="prn-out-slot" d="M150 70 H350 L358 88 H142 Z"/>
      <rect class="prn-out-paper" x="168" y="58" width="160" height="14" rx="2"/>
      <text class="prn-tiny" x="248" y="69" text-anchor="middle">Output</text>

      <!-- Face plate -->
      <rect class="prn-face" x="112" y="108" width="292" height="128" rx="10" fill="url(#prnFaceGrad)"/>
      <rect class="prn-face-inset" x="120" y="116" width="276" height="112" rx="7"/>

      <!-- LCD bezel + screen -->
      <rect class="prn-bezel" x="198" y="124" width="128" height="44" rx="6" fill="url(#prnBezel)"/>
      <rect class="prn-screen ${hw.blocked ? "is-alert" : "is-ok"}" x="206" y="130" width="112" height="32" rx="3"/>
      <text class="prn-screen-text" x="262" y="151" text-anchor="middle">${panel}</text>

      <!-- Soft keys -->
      <g class="prn-keys" aria-hidden="true">
        <circle cx="352" cy="140" r="5"/><circle cx="368" cy="140" r="5"/>
        <circle cx="352" cy="156" r="5"/><circle cx="368" cy="156" r="5"/>
      </g>
      <circle class="prn-led ${hw.blocked ? "is-warn" : "is-on"}" cx="384" cy="128" r="4.5"/>

      <!-- Brand plate -->
      <text class="prn-brand" x="136" y="140">CCST</text>
      <text class="prn-brand-sub" x="136" y="152">LaserJet</text>

      <!-- Toner door / cartridge -->
      <g class="prn-zone prn-toner ${hw.doorOpen ? "is-open" : ""} ${spent ? "is-attention" : ""}"
         data-prn-zone="toner" role="button" tabindex="0"
         aria-label="Toner door">
        <rect class="prn-door" x="128" y="168" width="148" height="52" rx="6"/>
        <path class="prn-door-grip" d="M190 190 h24"/>
        <text class="prn-zone-label" x="202" y="184" text-anchor="middle">Toner</text>
        ${
          hw.doorOpen
            ? hw.cartridgeIn
              ? `<g class="prn-cartridge" data-prn-action="pull-toner">
                   <rect class="prn-cart-body" x="142" y="186" width="120" height="24" rx="4"/>
                   <rect class="prn-cart-window" x="148" y="190" width="18" height="16" rx="2"/>
                   <rect class="prn-cart-fill" x="150" y="${204 - tonerH}" width="14" height="${tonerH}" rx="1"/>
                   <text class="prn-cart-label" x="212" y="202" text-anchor="middle">${hw.toner}%</text>
                 </g>`
              : `<g class="prn-cart-bay" data-prn-action="toner">
                   <rect class="prn-bay" x="142" y="186" width="120" height="24" rx="4"/>
                   <text class="prn-bay-label" x="202" y="202" text-anchor="middle">Fit cartridge</text>
                 </g>`
            : `<text class="prn-zone-hint" x="202" y="204" text-anchor="middle">${
                spent ? "Open door" : hw.toner + "%"
              }</text>`
        }
      </g>

      <!-- Access cover / jam -->
      <g class="prn-zone prn-cover ${hw.coverOpen ? "is-open" : ""} ${jam ? "is-attention" : ""}"
         data-prn-zone="cover" role="button" tabindex="0"
         aria-label="Access cover">
        <path class="prn-cover-lid" d="${
          hw.coverOpen
            ? "M292 168 H410 V220 H292 Z"
            : "M292 168 H410 V220 H292 Z"
        }"/>
        ${
          hw.coverOpen
            ? `<path class="prn-cover-hinge" d="M292 168 L318 148 H436 L410 168 Z"/>`
            : ""
        }
        <text class="prn-zone-label" x="351" y="184" text-anchor="middle">Cover</text>
        ${
          hw.coverOpen && jam
            ? `<g class="prn-jam" data-prn-action="clear">
                 <path class="prn-jam-sheet" d="M304 194 C 322 184, 340 206, 358 192 C 370 184, 380 200, 368 206 C 350 216, 330 188, 310 202 Z"/>
                 <text class="prn-bay-label" x="351" y="214" text-anchor="middle">Pull jam</text>
               </g>`
            : hw.coverOpen
              ? `<text class="prn-zone-hint" x="351" y="204" text-anchor="middle">Path clear</text>`
              : `<text class="prn-zone-hint" x="351" y="204" text-anchor="middle">${jam ? "Open cover" : "Closed"}</text>`
        }
      </g>

      <!-- Paper tray -->
      <g class="prn-zone prn-tray ${hw.trayOut ? "is-open" : ""} ${emptyTray ? "is-attention" : ""}"
         data-prn-zone="tray" role="button" tabindex="0"
         aria-label="Paper tray">
        <rect class="prn-tray-slot" x="128" y="248" width="260" height="38" rx="6"/>
        <g class="prn-tray-drawer" transform="translate(0 ${hw.trayOut ? 34 : 0})">
          <rect class="prn-tray-body" x="136" y="254" width="244" height="26" rx="4"/>
          <rect class="prn-tray-handle" x="236" y="262" width="44" height="10" rx="3"/>
          ${
            hw.trayOut
              ? emptyTray || hw.tray <= 0
                ? `<g data-prn-action="paper">
                     <rect class="prn-paper-bay" x="150" y="258" width="216" height="18" rx="2"/>
                     <text class="prn-bay-label" x="258" y="271" text-anchor="middle">Load paper ream</text>
                   </g>`
                : `<g>
                     <rect class="prn-paper" x="150" y="258" width="216" height="18" rx="2"/>
                     <text class="prn-cart-label" x="258" y="271" text-anchor="middle">${hw.tray} sheets</text>
                   </g>`
              : `<text class="prn-zone-hint" x="258" y="271" text-anchor="middle">${
                  emptyTray ? "Pull tray" : "Tray 1 · " + hw.tray
                }</text>`
          }
        </g>
      </g>

      <!-- Feet -->
      <rect class="prn-foot" x="118" y="298" width="36" height="8" rx="2"/>
      <rect class="prn-foot" x="362" y="298" width="36" height="8" rx="2"/>
      <rect class="prn-foot" x="448" y="278" width="28" height="8" rx="2"/>
    </svg>
    <p class="prn-legend">${escapeHtml(hw.hint || "")}</p>
  </div>`;
}

function actionButtons(hw) {
  const btns = [];
  if (hw.status === "jam") {
    if (!hw.coverOpen) btns.push({ action: "open-cover", label: "Open access cover" });
    else {
      btns.push({ action: "clear", label: "Pull jammed sheet out" });
      btns.push({ action: "close-cover", label: "Close cover", quiet: true });
    }
  } else if (hw.coverOpen) {
    btns.push({ action: "close-cover", label: "Close access cover" });
  }

  if (hw.status === "no-paper" || hw.tray <= 0) {
    if (!hw.trayOut) btns.push({ action: "open-tray", label: "Pull tray 1 out" });
    else {
      btns.push({ action: "paper", label: "Load 500 sheets" });
      btns.push({ action: "close-tray", label: "Push tray in", quiet: true });
    }
  } else if (hw.trayOut) {
    btns.push({ action: "close-tray", label: "Push tray 1 in" });
  } else {
    btns.push({ action: "open-tray", label: "Pull tray 1 out", quiet: true });
  }

  if (hw.status === "no-toner" || hw.toner <= 0 || !hw.cartridgeIn) {
    if (!hw.doorOpen) btns.push({ action: "open-door", label: "Open toner door" });
    else if (hw.cartridgeIn) btns.push({ action: "pull-toner", label: "Remove spent cartridge" });
    else {
      btns.push({ action: "toner", label: "Fit new toner cartridge" });
      btns.push({ action: "close-door", label: "Close toner door", quiet: true });
    }
  } else if (hw.doorOpen) {
    if (hw.cartridgeIn) btns.push({ action: "close-door", label: "Close toner door" });
    else btns.push({ action: "toner", label: "Fit new toner cartridge" });
  } else {
    btns.push({ action: "open-door", label: "Open toner door", quiet: true });
  }

  return btns;
}

function zoneClickAction(hw, zone) {
  if (zone === "cover") {
    if (!hw.coverOpen) return "open-cover";
    if (hw.status === "jam") return "clear";
    return "close-cover";
  }
  if (zone === "tray") {
    if (!hw.trayOut) return "open-tray";
    if (hw.tray <= 0 || hw.status === "no-paper") return "paper";
    return "close-tray";
  }
  if (zone === "toner") {
    if (!hw.doorOpen) return "open-door";
    if (hw.cartridgeIn && (hw.toner <= 0 || hw.status === "no-toner")) return "pull-toner";
    if (!hw.cartridgeIn) return "toner";
    return "close-door";
  }
  return null;
}

export function renderPrinterHardware(device, deviceId) {
  const pane = document.getElementById("pane-hardware");
  if (!pane) return;
  prnDevice = device;
  prnDeviceId = deviceId;
  const hw = device.hardware || {};
  if (!hw.serviceable || hw.kind !== "printer") {
    pane.innerHTML = `<p class="hw-note">${escapeHtml(hw.note || "Nothing to service here.")}</p>`;
    return;
  }

  const btns = actionButtons(hw);
  pane.innerHTML = `
    <div class="prn-head">
      <div>
        <strong>${escapeHtml(device.label)} — printer bench</strong>
        <p class="hw-note">${escapeHtml(hw.say || "")}</p>
      </div>
      <div class="prn-meters" aria-label="Supplies">
        <div class="prn-meter">
          <span>Toner</span>
          <div class="prn-meter-bar"><i style="width:${Math.max(0, Math.min(100, hw.toner))}%"></i></div>
          <em>${hw.toner}%</em>
        </div>
        <div class="prn-meter">
          <span>Tray 1</span>
          <div class="prn-meter-bar is-paper"><i style="width:${Math.max(0, Math.min(100, (hw.tray / 500) * 100))}%"></i></div>
          <em>${hw.tray}</em>
        </div>
        <div class="prn-meter">
          <span>Queue</span>
          <em>${hw.queue || 0}</em>
        </div>
      </div>
    </div>
    ${printerDiagram(hw)}
    <div class="prn-actions">
      ${btns
        .map(
          (b) =>
            `<button type="button" class="hw-fix ${b.quiet ? "is-quiet" : ""}" data-prn-action="${escapeHtml(
              b.action
            )}">${escapeHtml(b.label)}</button>`
        )
        .join("")}
    </div>
    <p class="prn-footnote">Work the machine by hand: open the cover for a jam, pull the tray to load paper, open the toner door to swap the cartridge. Front-panel commands only cover status, queue, online/offline, cancel and restart.</p>`;

  const run = async (action) => {
    try {
      await prnAction(deviceId, { action });
    } catch (err) {
      toast(err.message === "auth" ? "Session expired — sign in again." : err.message, "error");
    }
  };

  pane.onclick = (evt) => {
    const actEl = evt.target.closest("[data-prn-action]");
    if (actEl && pane.contains(actEl)) {
      evt.preventDefault();
      run(actEl.getAttribute("data-prn-action"));
      return;
    }
    const zone = evt.target.closest("[data-prn-zone]");
    if (zone && pane.contains(zone)) {
      evt.preventDefault();
      const live = prnDevice?.hardware || hw;
      const next = zoneClickAction(live, zone.getAttribute("data-prn-zone"));
      if (next) run(next);
    }
  };

  pane.onkeydown = (evt) => {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    const zone = evt.target.closest && evt.target.closest("[data-prn-zone]");
    if (!zone) return;
    evt.preventDefault();
    zone.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };
}

function paintPrinter(device, deviceId, body = {}) {
  const pane = document.getElementById("pane-hardware");
  if (!pane) return;
  const prevScroll = pane.scrollTop;
  prnDevice = device;
  prnDeviceId = deviceId;
  renderPrinterHardware(device, deviceId);
  requestAnimationFrame(() => {
    const p = document.getElementById("pane-hardware");
    if (p) p.scrollTop = prevScroll;
  });
}

async function prnAction(deviceId, body) {
  const prev = prnDevice && prnDeviceId === deviceId ? clone(prnDevice) : null;
  const optimistic = prev ? applyOptimisticPrinter(clone(prev), body) : null;
  const gen = ++prnGen;
  if (optimistic) {
    prnApplyGate(optimistic);
    paintPrinter(optimistic, deviceId, body);
  }

  const run = async () => {
    try {
      const res = await api(`/api/devices/${encodeURIComponent(deviceId)}/hardware`, {
        method: "POST",
        body
      });
      if (res.message) prnConsoleWrite(`[hardware] ${res.message}`, "console-ok");
      if (gen === prnGen) {
        prnApplyGate(res.device);
        paintPrinter(res.device, deviceId, body);
      }
      return res;
    } catch (err) {
      if (gen === prnGen) {
        try {
          const info = await api(`/api/devices/${encodeURIComponent(deviceId)}`);
          prnApplyGate(info.device);
          paintPrinter(info.device, deviceId, body);
        } catch {
          if (prev) {
            prnApplyGate(prev);
            paintPrinter(prev, deviceId, body);
          }
        }
      }
      throw err;
    }
  };

  const queued = prnChain.then(run, run);
  prnChain = queued.catch(() => {});
  return queued;
}
