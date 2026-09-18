import { api, toast, escapeHtml } from "./lib/util.js";
import {
  hwDiagramClosed,
  hwDiagramOpen,
  mountSpareMenu,
  wireCableDrag,
  wireSpareDrag,
  hwDragJustEnded,
  hwScrew,
  hwScrewHole,
  hwCable
} from "./hardware-diagram.js?v=93";
import { renderPrinterHardware, setPrinterConsoleHooks } from "./printer-hardware.js?v=3";

/** Set by map-lab so hardware actions can write to the device console. */
let hwConsoleWrite = () => {};
let hwApplyGate = () => {};
/** Last painted device — base for optimistic bench updates. */
let hwDevice = null;
let hwDeviceId = null;
/** Serialize /hardware calls; bump so a stale response cannot wipe a newer paint. */
let hwChain = Promise.resolve();
let hwGen = 0;
/** Latest run() from the painted bench — spare menu / drag reuse it. */
let hwRun = async () => {};

export function setHardwareConsoleHooks({ write, applyGate }) {
  if (typeof write === "function") hwConsoleWrite = write;
  if (typeof applyGate === "function") hwApplyGate = applyGate;
  setPrinterConsoleHooks({ write, applyGate });
}

/** Pick the right tool for an action so students are not blocked mid-click. */
const TOOL_FOR_ACTION = {
  unscrew: "screwdriver",
  screw: "screwdriver",
  "unscrew-part": "screwdriver",
  "screw-part": "screwdriver",
  unplug: "hands",
  plug: "hands",
  clips: "hands",
  seat: "hands",
  extract: "hands",
  enable: "hands",
  clean: "hands",
  fit: "spares",
  "select-spare": "spares"
};

/** Actions that never rebuild the SVG — patch in place (and no-op if already applied). */
const PATCHABLE = new Set([
  "select-tool",
  "select-spare",
  "power",
  "unscrew",
  "screw",
  "unscrew-part",
  "screw-part",
  "unplug",
  "plug",
  "inspect",
  "clips",
  "seat",
  "fit",
  "extract",
  "enable",
  "clean"
]);

function cloneDevice(device) {
  return device ? JSON.parse(JSON.stringify(device)) : null;
}

function findComponent(hw, id) {
  return (hw.components || []).find((c) => c.id === id) || null;
}

function refreshLooseHint(hw) {
  if (!hw?.service) return;
  hw.service.looseParts = (hw.components || [])
    .filter(
      (c) =>
        c.present === false ||
        (c.cables || []).some((cab) => cab.state === "out" || cab.state === "loose") ||
        (c.screwsTotal && c.screws < c.screwsTotal) ||
        c.clips === "open"
    )
    .map((c) => c.name);
  hw.service.reassembled = hw.service.looseParts.length === 0;
}

/**
 * Patch the hardware DTO locally so the bench redraws before /hardware returns.
 * Returns null when the action needs the server (or would clearly fail).
 */
function applyOptimisticHardware(device, body = {}) {
  const hw = device?.hardware;
  if (!hw?.serviceable || !hw.service) return null;
  const action = String(body.action || "").toLowerCase();
  const svc = hw.service;
  const componentId = body.component == null ? "" : String(body.component);
  const part = componentId ? findComponent(hw, componentId) : null;

  if (action === "select-tool") {
    const tool = body.tool == null || body.tool === "" ? null : String(body.tool);
    svc.tool = tool;
    if (tool !== "spares") svc.holding = null;
    return device;
  }

  if (action === "select-spare") {
    const spareId = body.spare == null || body.spare === "" ? null : String(body.spare);
    if (spareId) {
      const spare = (hw.spares || []).find((s) => s.id === spareId);
      if (!spare) return null;
      svc.tool = "spares";
      svc.holding = spareId;
      return device;
    }
    svc.holding = null;
    return device;
  }

  if (action === "power") {
    const wantOn = body.on === true || body.on === "true" || body.on === 1;
    const wantOff = body.on === false || body.on === "false" || body.on === 0;
    const next = wantOn ? true : wantOff ? false : !svc.powered;
    if (next) {
      if (svc.panelOpen || svc.screws < (svc.screwsTotal || 4)) return null;
      const mains = findComponent(hw, "psu")?.cables?.find((c) => c.id === "mains");
      if (mains?.state === "out") return null;
    }
    svc.powered = next;
    return device;
  }

  if (action === "unscrew" || action === "screw") {
    if (svc.panelOpen || svc.powered || svc.tool !== "screwdriver") return null;
    const mask = Array.isArray(svc.screwIn) ? svc.screwIn.slice() : null;
    if (!mask) return null;
    if (action === "unscrew") {
      const idx = body.index != null ? Number(body.index) : mask.lastIndexOf(true);
      if (idx < 0 || !mask[idx]) return null;
      mask[idx] = false;
    } else {
      const idx = body.index != null ? Number(body.index) : mask.indexOf(false);
      if (idx < 0 || mask[idx]) return null;
      mask[idx] = true;
    }
    svc.screwIn = mask;
    svc.screws = mask.filter(Boolean).length;
    return device;
  }

  if (action === "remove-panel") {
    if (svc.panelOpen || svc.powered || svc.screws > 0) return null;
    svc.panelOpen = true;
    return device;
  }

  if (action === "fit-panel") {
    if (!svc.panelOpen) return null;
    svc.panelOpen = false;
    const total = svc.screwsTotal || 4;
    svc.screwIn = Array.from({ length: total }, () => true);
    svc.screws = total;
    refreshLooseHint(hw);
    return device;
  }

  if (action === "inspect") {
    if (!part || !part.reachable) return null;
    part.inspected = true;
    part.revealed = true;
    if (!part.label || part.label === "Not inspected yet") part.label = "Inspecting…";
    return device;
  }

  if (action === "unplug" || action === "plug") {
    if (!part || svc.tool !== "hands") return null;
    const cableId = String(body.cable || (part.cables?.[0] || {}).id || "");
    const cable = (part.cables || []).find((c) => c.id === cableId);
    if (!cable) return null;
    if (cable.where === "internal" && (!svc.panelOpen || svc.powered)) return null;
    if (action === "unplug") {
      if (cableId === "mains" && svc.powered) return null;
      if (cable.state === "out") return null;
      cable.state = "out";
    } else {
      if (cable.state === "firm") return null;
      if (cable.state === "loose") return null;
      cable.state = "firm";
    }
    refreshLooseHint(hw);
    return device;
  }

  if (action === "clips") {
    if (!part || !svc.panelOpen || svc.powered || svc.tool !== "hands") return null;
    const open = body.open === true || body.open === "true" || String(body.open || "") === "open";
    const wantOpen = body.open === undefined ? part.clips !== "open" : open;
    if (!wantOpen && !part.present) return null;
    part.clips = wantOpen ? "open" : "closed";
    refreshLooseHint(hw);
    return device;
  }

  if (action === "seat") {
    if (!part || !svc.panelOpen || svc.powered || svc.tool !== "hands" || !part.present) return null;
    part.seated = "home";
    return device;
  }

  if (action === "unscrew-part" || action === "screw-part") {
    if (!part || !svc.panelOpen || svc.powered || svc.tool !== "screwdriver") return null;
    const mask = Array.isArray(part.screwIn) ? part.screwIn.slice() : null;
    if (!mask || !part.screwsTotal) return null;
    if (action === "unscrew-part") {
      const idx = body.index != null ? Number(body.index) : mask.lastIndexOf(true);
      if (idx < 0 || !mask[idx]) return null;
      mask[idx] = false;
    } else {
      if (!part.present) return null;
      const idx = body.index != null ? Number(body.index) : mask.indexOf(false);
      if (idx < 0 || mask[idx]) return null;
      mask[idx] = true;
    }
    part.screwIn = mask;
    part.screws = mask.filter(Boolean).length;
    refreshLooseHint(hw);
    return device;
  }

  if (action === "extract") {
    if (!part?.removable || !svc.panelOpen || svc.powered || svc.tool !== "hands" || !part.present) return null;
    if (componentId === "cpu") {
      const fan = findComponent(hw, "fan");
      if (fan?.present !== false) return null;
    }
    if ((part.cables || []).some((c) => c.state !== "out")) return null;
    if (part.clips && part.clips !== "open") return null;
    if (part.screws > 0) return null;
    part.present = false;
    if (componentId === "fan") {
      const cpu = findComponent(hw, "cpu");
      if (cpu) cpu.reachable = svc.panelOpen && !svc.powered;
    }
    refreshLooseHint(hw);
    return device;
  }

  if (action === "fit") {
    if (!part?.removable || part.present || !svc.panelOpen || svc.powered || svc.tool !== "spares") return null;
    if (componentId === "cpu") {
      const fan = findComponent(hw, "fan");
      if (fan?.present !== false) return null;
    }
    if (componentId === "fan") {
      const cpu = findComponent(hw, "cpu");
      if (!cpu?.present) return null;
    }
    const spareId = body.spare != null && body.spare !== "" ? String(body.spare) : svc.holding;
    const spare = (hw.spares || []).find((s) => s.id === spareId);
    if (!spare || !(spare.fits || []).includes(componentId)) return null;
    if (part.match && spare.match && spare.match !== part.match) return null;
    part.present = true;
    part.seated = "home";
    if (part.clips) part.clips = "open";
    if (part.screwsTotal) {
      part.screwIn = Array.from({ length: part.screwsTotal }, () => false);
      part.screws = 0;
    }
    (part.cables || []).forEach((c) => {
      c.state = "out";
    });
    if (componentId === "fan") {
      const cpu = findComponent(hw, "cpu");
      if (cpu) cpu.reachable = false;
    }
    svc.holding = null;
    refreshLooseHint(hw);
    return device;
  }

  if (action === "enable" || action === "clean") {
    if (!part || !part.revealed) return null;
    if (action === "enable" && svc.tool !== "hands") return null;
    if (action === "clean" && svc.tool !== "hands") return null;
    part.status = "ok";
    part.label = "Looks OK so far";
    part.found = action === "enable" ? "Adapter enabled — the link comes up." : "Dust cleared.";
    part.repair = "";
    part.toolNeeded = null;
    part.toolNeededLabel = null;
    part.steps = [];
    part.nextStep = "";
    part.nextTool = null;
    return device;
  }

  return null;
}

function stepHintFor(device) {
  const hw = device?.hardware;
  const svc = hw?.service || {};
  const loose = svc.looseParts || [];
  if (loose.length) {
    return `Left apart by you: ${loose.join(", ")}. Screws back in and leads back on before this machine runs again.`;
  }
  if (svc.panelOpen) {
    return "Case open — inspect parts, and drag a lead out of its socket to unplug it. A part only lifts out once its leads and screws are off.";
  }
  if (svc.powered) {
    return "Start with the symptoms. Rear leads can be pulled out and pushed home with the panel on; turn the power off before opening the case.";
  }
  if (svc.screws > 0) {
    return `Power is off. Select the screwdriver and remove ${svc.screws} screw${svc.screws === 1 ? "" : "s"}, then take the side panel off.`;
  }
  return "All screws out — remove the side panel to see inside.";
}

function syncStepHint(pane, device) {
  const note = pane.querySelector(".hw-head .hw-note");
  if (note) note.textContent = stepHintFor(device);
}

function syncPanelControls(pane, svc) {
  const controls = pane.querySelector(".hw-controls");
  if (!controls) return;
  let panelBtn = controls.querySelector('[data-hw-action="remove-panel"], [data-hw-action="fit-panel"]');
  if (svc.panelOpen) {
    if (!panelBtn || panelBtn.getAttribute("data-hw-action") !== "fit-panel") {
      panelBtn?.remove();
      controls.insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="hw-fix" data-hw-action="fit-panel">Fit side panel</button>`
      );
    }
  } else if (svc.screws === 0) {
    if (!panelBtn || panelBtn.getAttribute("data-hw-action") !== "remove-panel") {
      panelBtn?.remove();
      controls.insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="hw-fix" data-hw-action="remove-panel">Remove side panel</button>`
      );
    }
  } else {
    panelBtn?.remove();
  }
}

function syncToolTray(pane, device) {
  const hw = device.hardware;
  const svc = hw.service;
  pane.dataset.hwTool = svc.tool || "";
  pane.querySelectorAll(".hw-tool[data-tool]").forEach((btn) => {
    if (btn.classList.contains("is-putdown")) return;
    const id = btn.getAttribute("data-tool");
    btn.classList.toggle("is-selected", svc.tool === id);
  });
  let putdown = pane.querySelector(".hw-tool.is-putdown");
  if (svc.tool && !putdown) {
    pane
      .querySelector(".hw-tray")
      ?.insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="hw-tool is-putdown" data-hw-action="select-tool" data-tool="">Put down</button>`
      );
  } else if (!svc.tool && putdown) {
    putdown.remove();
  }
  pane.querySelectorAll(".hw-fix[data-tool-needed]").forEach((btn) => {
    const need = btn.getAttribute("data-tool-needed");
    btn.classList.toggle("is-quiet", Boolean(need && svc.tool !== need));
  });
  mountSpareMenu(hw, svc, hwRun);
}

function syncPower(pane, svc) {
  const btn = pane.querySelector(".hw-power");
  if (btn) {
    btn.classList.toggle("is-on", Boolean(svc.powered));
    btn.classList.toggle("is-off", !svc.powered);
    btn.setAttribute("data-on", svc.powered ? "false" : "true");
    btn.innerHTML = `<span class="hw-power-led"></span>${svc.powered ? "Power on" : "Power off"}`;
  }
  pane.querySelector(".hw-vent-fan")?.classList.toggle("is-spinning", Boolean(svc.powered));
  pane.querySelector(".hw-led")?.classList.toggle("is-on", Boolean(svc.powered));
}

function flipScrewGroup(el, toOut) {
  if (!el) return false;
  const index = el.getAttribute("data-screw");
  const component = el.getAttribute("data-component");
  const head = el.querySelector(".hw-screw-head, .hw-screw-hole");
  const cx = Number(head?.getAttribute("cx"));
  const cy = Number(head?.getAttribute("cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
  const r = toOut
    ? Number(el.querySelector(".hw-screw-head")?.getAttribute("r")) || 9
    : Number(el.querySelector(".hw-screw-hit")?.getAttribute("r")) / 1.35 || 9;
  const label = el.getAttribute("aria-label") || "Screw";
  const html = toOut
    ? hwScrewHole(
        cx,
        cy,
        r,
        component ? "screw-part" : "screw",
        component,
        index == null ? null : Number(index),
        "Empty " + label.toLowerCase()
      )
    : hwScrew(
        cx,
        cy,
        r,
        component ? "unscrew-part" : "unscrew",
        component,
        index == null ? null : Number(index),
        label.replace(/^Empty /i, "") || "Screw"
      );
  el.outerHTML = html.trim();
  return true;
}

/**
 * Make every screw/hole match the authoritative mask on the device.
 * Incremental flips drifted under rapid clicks (count said "all out", heads still in).
 */
function reconcileScrews(pane, device) {
  const hw = device?.hardware;
  const svc = hw?.service;
  if (!hw || !svc || !pane) return false;

  const syncMask = (selector, mask) => {
    if (!Array.isArray(mask) || !mask.length) return;
    // Snapshot first — flipping replaces the node mid-iteration.
    const nodes = [...pane.querySelectorAll(selector)];
    for (const el of nodes) {
      const idx = Number(el.getAttribute("data-screw"));
      if (!Number.isFinite(idx) || idx < 0 || idx >= mask.length) continue;
      const wantIn = Boolean(mask[idx]);
      const isIn = el.classList.contains("is-in");
      if (wantIn === isIn) continue;
      flipScrewGroup(el, !wantIn);
    }
  };

  if (!svc.panelOpen) {
    syncMask(".hw-screw:not([data-component])", svc.screwIn);
  }
  for (const part of hw.components || []) {
    if (!Array.isArray(part.screwIn) || !part.screwIn.length) continue;
    syncMask(`.hw-screw[data-component="${CSS.escape(part.id)}"]`, part.screwIn);
  }
  return true;
}

const CABLE_WORD = { firm: "seated", loose: "loose in the socket", out: "unplugged" };

/** Update only the inspect card + part highlight — never the diagram. */
function showInspectPanel(pane, device, id) {
  if (!pane) return;
  const hw = device?.hardware || {};
  const svc = hw.service || {};
  const byId = {};
  (hw.components || []).forEach((c) => {
    byId[c.id] = c;
  });
  const box = pane.querySelector("#hw-inspect") || document.getElementById("hw-inspect");
  if (!box) return;
  pane.querySelectorAll(".hw-part").forEach((g) =>
    g.classList.toggle("is-selected", Boolean(id) && g.getAttribute("data-part") === id)
  );
  const c = id ? byId[id] : null;
  if (!c) {
    box.innerHTML = `<p class="hw-note">Click a part to inspect it.</p>`;
    return;
  }
  if (!c.reachable) {
    box.innerHTML = `
      <div class="hw-inspect-row">
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <p class="hw-found">That part is inside the case. Power off, undo the rear screws, and take the side panel off first.</p>
        </div>
      </div>`;
    return;
  }
  if (!c.revealed) {
    box.innerHTML = `
      <div class="hw-inspect-row">
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <span class="hw-spec">${escapeHtml(c.spec)}</span>
          <p class="hw-found">Not inspected yet.</p>
        </div>
        <div class="hw-side">
          <button type="button" class="hw-fix" data-hw-action="inspect" data-component="${escapeHtml(c.id)}">Inspect</button>
        </div>
      </div>`;
    return;
  }

  const acts = [];
  (c.cables || []).forEach((cable) => {
    if (cable.state === "out") {
      acts.push({ action: "plug", cable: cable.id, label: `Plug in ${cable.name.toLowerCase()}`, tool: "hands" });
    } else {
      acts.push({ action: "unplug", cable: cable.id, label: `Unplug ${cable.name.toLowerCase()}`, tool: "hands" });
    }
  });
  if (c.screwsTotal && svc.panelOpen) {
    if (c.screws > 0) acts.push({ action: "unscrew-part", label: "Undo a mounting screw", tool: "screwdriver" });
    if (c.present && c.screws < c.screwsTotal) {
      acts.push({ action: "screw-part", label: "Fit a mounting screw", tool: "screwdriver" });
    }
  }
  if (c.clips && svc.panelOpen) {
    acts.push(
      c.clips === "open"
        ? { action: "clips", open: false, label: "Close the clips", tool: "hands" }
        : { action: "clips", open: true, label: "Open the clips", tool: "hands" }
    );
  }
  if (c.seated === "proud" && svc.panelOpen) {
    acts.push({ action: "seat", label: "Push the module home", tool: "hands" });
  }
  if (c.removable && svc.panelOpen) {
    if (c.present) {
      acts.push({ action: "extract", label: `Take the ${c.name.toLowerCase()} out`, tool: "hands" });
    } else {
      const held = (hw.spares || []).find((s) => s.id === svc.holding);
      if (
        held &&
        (held.fits || []).includes(c.id) &&
        (!c.match || !held.match || held.match === c.match)
      ) {
        acts.push({ action: "fit", spare: held.id, label: `Fit ${held.name}`, tool: "spares" });
      }
    }
  }
  if (
    c.status === "warn" &&
    svc.panelOpen &&
    (c.toolNeeded === "air" || c.toolNeeded === "hands") &&
    /dust|clean|vent/i.test(String(c.repair || c.found || ""))
  ) {
    acts.push({ action: "clean", label: c.repair || "Clear the dust", tool: "hands" });
  }
  if (c.toolNeeded === "hands" && c.access === "soft") {
    acts.push({ action: "enable", label: c.repair, tool: "hands" });
  }

  const steps = c.steps || [];
  box.innerHTML = `
    <div class="hw-inspect-row is-${c.status}">
      <div>
        <strong>${escapeHtml(c.name)}</strong>
        <span class="hw-spec">${escapeHtml(c.spec)}</span>
        <p class="hw-found">${escapeHtml(c.found || "Nothing obvious wrong with this part.")}</p>
        ${
          c.present
            ? ""
            : `<p class="hw-tool-hint">Empty bay — needs ${escapeHtml(c.neededSpare || c.spec || "the matching spare")}. Drag that size from the rack.</p>`
        }
        ${
          (c.cables || []).length
            ? `<ul class="hw-cable-list">${c.cables
                .map(
                  (cable) =>
                    `<li class="is-${cable.state}">${escapeHtml(cable.name)} — ${escapeHtml(CABLE_WORD[cable.state] || cable.state)}</li>`
                )
                .join("")}</ul>`
            : ""
        }
        ${
          c.screwsTotal
            ? `<p class="hw-screw-state">${c.screws} of ${c.screwsTotal} mounting screws in${
                c.clips ? ` · clips ${escapeHtml(c.clips)}` : ""
              }</p>`
            : c.clips
              ? `<p class="hw-screw-state">Held by clips — currently ${escapeHtml(c.clips)}</p>`
              : ""
        }
      </div>
      <div class="hw-side">
        <span class="hw-status">${escapeHtml(c.label)}</span>
        ${acts
          .map(
            (a) =>
              `<button type="button" class="hw-fix ${a.tool && svc.tool !== a.tool ? "is-quiet" : ""}"
                 data-hw-action="${escapeHtml(a.action)}" data-component="${escapeHtml(c.id)}"
                 ${a.cable ? `data-cable="${escapeHtml(a.cable)}"` : ""}
                 ${a.open === undefined ? "" : `data-open="${a.open}"`}
                 ${a.tool ? `data-tool-needed="${escapeHtml(a.tool)}"` : ""}>${escapeHtml(a.label)}</button>`
          )
          .join("")}
      </div>
    </div>
    ${
      steps.length
        ? `<ol class="hw-steps">${steps
            .map(
              (s) =>
                `<li class="${s.done ? "is-done" : ""}">${escapeHtml(s.label)}${
                  s.tool ? ` <span class="hw-step-tool">${escapeHtml(s.tool)}</span>` : ""
                }</li>`
            )
            .join("")}</ol>`
        : ""
    }`;
}

function syncScrews(pane, device, body) {
  // Always reconcile from device state — never trust a single flip under races.
  return reconcileScrews(pane, device);
}

function syncCable(pane, device, body) {
  const component = String(body.component || "");
  const cableId = String(body.cable || "");
  const part = findComponent(device.hardware, component);
  const cable = (part?.cables || []).find((c) => c.id === cableId);
  if (!cable || !component || !cableId) return false;
  const view = device.hardware.service?.panelOpen ? "open" : "closed";
  const group = pane.querySelector(
    `.hw-cable[data-component="${CSS.escape(component)}"][data-cable="${CSS.escape(cableId)}"]`
  );
  if (!group) return false;
  const wantOut = cable.state === "out";
  const already =
    group.classList.contains(wantOut ? "is-out" : "is-firm") ||
    group.classList.contains(wantOut ? "is-out" : "is-loose");
  const actionOk =
    group.getAttribute("data-hw-action") === (wantOut ? "plug" : "unplug");
  if (already && actionOk && !group.classList.contains("is-dragging")) {
    showInspectPanel(pane, device, component);
    syncStepHint(pane, device);
    return true;
  }
  const byId = {};
  (device.hardware.components || []).forEach((c) => {
    byId[c.id] = c;
  });
  const html = hwCable(component, cableId, byId, view);
  if (!html) return false;
  const selected = pane.querySelector(".hw-part.is-selected")?.getAttribute("data-part");
  group.outerHTML = html.trim();
  wireCableDrag(pane, view, hwRun);
  if (selected) {
    pane
      .querySelector(`.hw-part[data-part="${CSS.escape(selected)}"]`)
      ?.classList.add("is-selected");
  }
  showInspectPanel(pane, device, selected || component);
  syncStepHint(pane, device);
  return true;
}

function syncClipsOrSeat(pane, device, body) {
  const id = String(body.component || "");
  if (!id) return false;
  // Diagram clip/seat visuals are subtle; refresh the inspect card only.
  showInspectPanel(pane, device, id);
  syncStepHint(pane, device);
  return true;
}

/**
 * Update tray / power / screws / cables / inspect without replacing pane.innerHTML.
 */
function patchHardwareBench(pane, device, body) {
  const hw = device.hardware;
  const svc = hw?.service;
  if (!hw?.serviceable || !svc || !pane.querySelector(".hw-tray")) return false;
  const action = String(body.action || "");

  if (action === "select-tool" || action === "select-spare") {
    syncToolTray(pane, device);
    syncStepHint(pane, device);
    return true;
  }
  if (action === "power") {
    syncPower(pane, svc);
    syncStepHint(pane, device);
    syncPanelControls(pane, svc);
    return true;
  }
  if (action === "unscrew" || action === "screw" || action === "unscrew-part" || action === "screw-part") {
    if (!syncScrews(pane, device, body)) return false;
    const focus = body.component || pane.querySelector(".hw-part.is-selected")?.getAttribute("data-part");
    if (focus) showInspectPanel(pane, device, focus);
    syncStepHint(pane, device);
    syncPanelControls(pane, svc);
    return true;
  }
  if (action === "unplug" || action === "plug") {
    return syncCable(pane, device, body);
  }
  if (action === "inspect") {
    showInspectPanel(pane, device, body.component);
    return true;
  }
  if (action === "clips" || action === "seat") {
    return syncClipsOrSeat(pane, device, body);
  }
  if (action === "fit" || action === "extract") {
    return syncFitOrExtract(pane, device, body);
  }
  if (action === "enable" || action === "clean") {
    showInspectPanel(pane, device, body.component);
    syncStepHint(pane, device);
    return true;
  }
  return false;
}

/**
 * Seat or lift a part by toggling bay classes in place — no SVG remount, no scroll jump.
 */
function syncFitOrExtract(pane, device, body) {
  const hw = device?.hardware;
  const svc = hw?.service;
  const component = String(body.component || "");
  const part = findComponent(hw, component);
  if (!hw || !svc?.panelOpen || !part || !component) return false;
  const g = pane.querySelector(`.hw-part[data-part="${CSS.escape(component)}"]`);
  if (!g) return false;

  const absent = part.present === false;
  g.classList.toggle("is-absent", absent);
  g.classList.toggle("is-proud", part.seated === "proud");
  g.classList.toggle("is-clips-open", part.clips === "open");
  if (absent && part.removable) g.setAttribute("data-bay", "1");
  else g.removeAttribute("data-bay");
  if (part.match) g.setAttribute("data-match", part.match);

  const byId = {};
  (hw.components || []).forEach((c) => {
    byId[c.id] = c;
  });
  (part.cables || []).forEach((cab) => {
    const group = pane.querySelector(
      `.hw-cable[data-component="${CSS.escape(component)}"][data-cable="${CSS.escape(cab.id)}"]`
    );
    if (!group) return;
    const html = hwCable(component, cab.id, byId, "open");
    if (!html) return;
    group.outerHTML = html.trim();
  });
  if ((part.cables || []).length) wireCableDrag(pane, "open", hwRun);

  // Cooler on/off changes whether the processor can be inspected.
  if (component === "fan") {
    const cpu = findComponent(hw, "cpu");
    if (cpu) cpu.reachable = Boolean(svc.panelOpen) && absent;
  }

  showInspectPanel(pane, device, component);
  syncStepHint(pane, device);
  mountSpareMenu(hw, svc, hwRun);
  return true;
}

/** Wire part clicks (idempotent — skips nodes already bound). */
function bindPartClicks(pane, device, deviceId) {
  const hw = device.hardware || {};
  const svc = hw.service || {};
  const byId = {};
  (hw.components || []).forEach((c) => {
    byId[c.id] = c;
  });
  pane.querySelectorAll(".hw-part").forEach((g) => {
    if (g.dataset.hwPartBound) return;
    g.dataset.hwPartBound = "1";
    const id = g.getAttribute("data-part");
    const open = async () => {
      const live = hwDevice?.hardware || hw;
      const liveSvc = live.service || svc;
      const liveById = {};
      (live.components || []).forEach((c) => {
        liveById[c.id] = c;
      });
      const c = liveById[id];
      if (liveSvc.tool === "spares" && liveSvc.holding && c && c.removable && c.present === false) {
        const spare = (live.spares || []).find((s) => s.id === liveSvc.holding);
        if (spare && (spare.fits || []).includes(id) && (!c.match || !spare.match || spare.match === c.match)) {
          await hwRun("fit", { component: id, spare: spare.id }, id);
          return;
        }
      }
      if (c && c.reachable && !c.revealed) {
        try {
          await hwAction(deviceId, { action: "inspect", component: id }, id);
          return;
        } catch (err) {
          toast(err.message === "auth" ? "Session expired — sign in again." : err.message, "error");
          return;
        }
      }
      showInspectPanel(pane, hwDevice || device, id);
    };
    g.addEventListener("click", open);
    g.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });
  });
}

/** Paint device state — patch light actions; full rebuild only when the bench shape changes. */
function paintHardware(device, deviceId, selectId, body = {}) {
  const pane = document.getElementById("pane-hardware");
  if (!pane) return;
  const action = String(body.action || "");
  const prevScroll = pane.scrollTop;
  const prevSelected =
    selectId || pane.querySelector(".hw-part.is-selected")?.getAttribute("data-part");
  const prevPanel = hwDevice?.hardware?.service?.panelOpen;
  const nextPanel = device?.hardware?.service?.panelOpen;
  const canPatch =
    PATCHABLE.has(action) &&
    pane.querySelector(".hw-tray") &&
    prevPanel === nextPanel;

  hwDevice = device;
  hwDeviceId = deviceId;

  if (canPatch && patchHardwareBench(pane, device, body)) {
    pane.scrollTop = prevScroll;
    return;
  }

  // Full rebuild only for structural changes (panel open/close, extract, fit…).
  renderHardware(device, deviceId, prevSelected || selectId);
  requestAnimationFrame(() => {
    const p = document.getElementById("pane-hardware");
    if (p) p.scrollTop = prevScroll;
  });
}

export async function hwAction(deviceId, body, selectId) {
  const keepId = selectId || body.component || null;
  const prev = hwDevice && hwDeviceId === deviceId ? cloneDevice(hwDevice) : null;
  const optimistic = prev ? applyOptimisticHardware(cloneDevice(prev), body) : null;
  const gen = ++hwGen;
  if (optimistic) {
    hwApplyGate(optimistic);
    paintHardware(optimistic, deviceId, keepId, body);
  }

  const run = async () => {
    try {
      const res = await api(`/api/devices/${encodeURIComponent(deviceId)}/hardware`, {
        method: "POST",
        body
      });
      if (res.message) hwConsoleWrite(`[hardware] ${res.message}`, "console-ok");
      // A newer click may already have painted; do not let this response rewind it.
      if (gen === hwGen) {
        hwApplyGate(res.device);
        paintHardware(res.device, deviceId, keepId, body);
      }
      return res;
    } catch (err) {
      if (gen === hwGen) {
        try {
          const info = await api(`/api/devices/${encodeURIComponent(deviceId)}`);
          hwApplyGate(info.device);
          paintHardware(info.device, deviceId, keepId, body);
        } catch {
          if (prev) {
            hwApplyGate(prev);
            paintHardware(prev, deviceId, keepId, body);
          }
        }
      }
      throw err;
    }
  };

  const p = hwChain.then(run, run);
  hwChain = p.catch(() => {});
  return p;
}

export function renderHardware(device, deviceId, selectId) {
  const pane = document.getElementById("pane-hardware");
  if (!pane) return;
  if (device?.hardware?.kind === "printer") {
    renderPrinterHardware(device, deviceId);
    return;
  }
  hwDevice = device;
  hwDeviceId = deviceId;
  const hw = device.hardware || { serviceable: false, components: [] };
  if (!hw.serviceable) {
    pane.innerHTML = `<p class="hw-note">${escapeHtml(hw.note || "Nothing to service here.")}</p>`;
    return;
  }

  const svc = hw.service || { powered: true, screws: 4, screwsTotal: 4, panelOpen: false, tool: null };
  const tools = (hw.tools || []).filter((t) => t && t.id !== "air");
  if (svc.tool === "air") svc.tool = null;
  const byId = {};
  hw.components.forEach((c) => {
    byId[c.id] = c;
  });

  const powerLabel = svc.powered ? "Power on" : "Power off";
  const stepHint = stepHintFor(device);

  pane.innerHTML = `
    <div class="hw-head">
      <div>
        <strong>${escapeHtml(device.label)} — service bench</strong>
        <p class="hw-note">${escapeHtml(stepHint)}</p>
      </div>
      <div class="hw-controls">
        <button type="button" class="hw-power ${svc.powered ? "is-on" : "is-off"}" data-hw-action="power" data-on="${svc.powered ? "false" : "true"}">
          <span class="hw-power-led"></span>${powerLabel}
        </button>
        ${
          svc.panelOpen
            ? `<button type="button" class="hw-fix" data-hw-action="fit-panel">Fit side panel</button>`
            : svc.screws === 0
              ? `<button type="button" class="hw-fix" data-hw-action="remove-panel">Remove side panel</button>`
              : ""
        }
      </div>
    </div>
    <div class="hw-tray" role="toolbar" aria-label="Tool tray">
      <span class="hw-tray-label">Tools</span>
      ${tools
        .map(
          (t) => `<button type="button" class="hw-tool ${svc.tool === t.id ? "is-selected" : ""}" data-hw-action="select-tool" data-tool="${escapeHtml(t.id)}" title="${escapeHtml(t.hint)}">${escapeHtml(t.name)}</button>`
        )
        .join("")}
      ${svc.tool ? `<button type="button" class="hw-tool is-putdown" data-hw-action="select-tool" data-tool="">Put down</button>` : ""}
    </div>
    ${svc.panelOpen ? hwDiagramOpen(byId) : hwDiagramClosed(byId, svc)}
    <div class="hw-inspect" id="hw-inspect"></div>`;
  pane.dataset.hwTool = svc.tool || "";

  const run = async (action, extra = {}, selectIdFor, toolHint) => {
    try {
      const need = toolHint || TOOL_FOR_ACTION[action];
      const current = hwDevice?.hardware?.service?.tool;
      if (need && current !== need) {
        await hwAction(deviceId, { action: "select-tool", tool: need });
      }
      await hwAction(deviceId, { action, ...extra }, selectIdFor);
    } catch (err) {
      toast(err.message === "auth" ? "Session expired — sign in again." : err.message, "error");
    }
  };
  hwRun = run;

  pane.onclick = (evt) => {
    // A lead that was just dragged has already been dealt with.
    if (hwDragJustEnded()) return;
    const el = evt.target.closest("[data-hw-action]");
    if (!el || !pane.contains(el)) return;
    evt.preventDefault();
    evt.stopPropagation();
    const action = el.getAttribute("data-hw-action");
    const component = el.getAttribute("data-component");
    const toolHint = el.getAttribute("data-tool-needed") || undefined;
    if (action === "power") {
      run("power", { on: el.getAttribute("data-on") === "true" });
    } else if (action === "select-tool") {
      run("select-tool", { tool: el.getAttribute("data-tool") || null });
    } else if (action === "select-spare") {
      run("select-spare", { spare: el.getAttribute("data-spare") || null });
    } else if (action === "fit") {
      const spare = el.getAttribute("data-spare");
      run("fit", Object.assign({ component }, spare ? { spare } : {}), component, toolHint);
    } else if (action === "remove-panel" || action === "fit-panel") {
      run(action);
    } else if (action === "unscrew" || action === "screw") {
      const index = el.getAttribute("data-screw");
      run(action, index == null ? {} : { index: Number(index) }, undefined, toolHint);
    } else if (action === "unscrew-part" || action === "screw-part") {
      const index = el.getAttribute("data-screw");
      run(action, Object.assign({ component }, index == null ? {} : { index: Number(index) }), component, toolHint);
    } else if (action === "unplug" || action === "plug") {
      run(action, { component, cable: el.getAttribute("data-cable") }, component, toolHint);
    } else if (action === "clips") {
      run(action, { component, open: el.getAttribute("data-open") === "true" }, component, toolHint);
    } else {
      run(action, { component }, component, toolHint);
    }
  };

  wireCableDrag(pane, svc.panelOpen ? "open" : "closed", run);
  mountSpareMenu(hw, svc, run);
  // Drag is wired when the rack is first created; guarded if already bound.
  wireSpareDrag(pane, hw.spares || [], run);

  // Screws and leads are SVG groups, so Enter and Space have to be wired up.
  pane.onkeydown = (evt) => {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    const el = evt.target.closest && evt.target.closest("[data-hw-action]");
    if (!el || el.tagName === "BUTTON") return;
    evt.preventDefault();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  bindPartClicks(pane, device, deviceId);
  showInspectPanel(pane, device, selectId || null);
}
