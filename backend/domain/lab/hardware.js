/**
 * Hardware bench runtime: service state, panel, plant/clear, and actions.
 */
const parts = require("./hardware-parts");
const {
  BLOCK_ORDER,
  SCREW_COUNT,
  COMPONENTS,
  COMPONENT_IDS,
  PART_BUILD,
  PART_SCREWS,
  TOOLS,
  TOOL_IDS,
  SPEC_OPTIONS,
  SPARES,
  SPARE_IDS,
  SPARE_MATCHES,
  FAULTS,
  TICKET_FAULTS,
  CABLE_OUT,
  CABLE_LOOSE,
  CABLE_FIRM,
  screwMask,
  countScrews,
  normalizeScrewMask,
  parseScrewIndex,
  familyKey,
  spareFor,
  spareByMatch,
  spareFits,
  spareMatchesBay
} = parts;

function buildFor(componentId) {
  return PART_BUILD[componentId] || { screws: 0, clips: false, removable: false, cables: [] };
}

function cableSpec(componentId, cableId) {
  return buildFor(componentId).cables.find((c) => c.id === cableId) || null;
}

function componentFor(faultId, slot) {
  const fault = FAULTS[faultId];
  if (!fault) return null;
  if (fault.component) return fault.component;
  return slot === "B" ? "ram2" : "ram1";
}

function serviceable(state) {
  return Boolean(state) && state.kind === "host" && state.os === "pc";
}

function defaultHw() {
  const hw = {};
  for (const c of COMPONENTS) hw[c.id] = null;
  return hw;
}

/** A part as it leaves the factory: screwed in, clipped shut, leads home. */
function defaultPart(componentId) {
  const build = buildFor(componentId);
  const cables = {};
  for (const c of build.cables) cables[c.id] = CABLE_FIRM;
  return {
    screws: build.screws,
    screwIn: screwMask(build.screws, build.screws),
    present: true,
    clips: build.clips ? "closed" : null,
    seated: "home",
    cables,
    /** Capacity / size key shared with the spare that belongs in this bay. */
    match: null
  };
}

function defaultParts() {
  const parts = {};
  for (const c of COMPONENTS) parts[c.id] = defaultPart(c.id);
  return parts;
}

function defaultService() {
  return {
    powered: true,
    screws: SCREW_COUNT,
    panelScrews: screwMask(SCREW_COUNT, SCREW_COUNT),
    panelOpen: false,
    tool: null,
    holding: null,
    inspected: {},
    parts: defaultParts()
  };
}

function normalizeHw(saved) {
  const hw = defaultHw();
  if (!saved || typeof saved !== "object") return hw;
  for (const [id, fault] of Object.entries(saved)) {
    if (!COMPONENT_IDS.has(id)) continue;
    if (typeof fault !== "string" || !FAULTS[fault]) continue;
    const home = FAULTS[fault].component;
    const isRam = id === "ram1" || id === "ram2";
    if (home ? home !== id : !isRam) continue;
    hw[id] = fault;
  }
  return hw;
}

function normalizeService(saved) {
  const svc = defaultService();
  if (!saved || typeof saved !== "object") return svc;
  svc.powered = saved.powered !== false;
  const screws = Number(saved.screws);
  svc.screws = Number.isFinite(screws) ? Math.max(0, Math.min(SCREW_COUNT, Math.floor(screws))) : SCREW_COUNT;
  svc.panelScrews = normalizeScrewMask(saved.panelScrews, SCREW_COUNT, svc.screws);
  svc.screws = countScrews(svc.panelScrews);
  svc.panelOpen = Boolean(saved.panelOpen) && svc.screws === 0;
  svc.tool = TOOL_IDS.has(saved.tool) ? saved.tool : null;
  svc.holding = SPARE_IDS.has(saved.holding) ? saved.holding : null;
  if (svc.tool !== "spares") svc.holding = null;
  svc.inspected = {};
  if (saved.inspected && typeof saved.inspected === "object") {
    for (const id of Object.keys(saved.inspected)) {
      if (COMPONENT_IDS.has(id) && saved.inspected[id]) svc.inspected[id] = true;
    }
  }
  // Older saves carried a flat `partScrews` map and no cable state at all.
  const legacyScrews = saved.partScrews && typeof saved.partScrews === "object" ? saved.partScrews : null;
  for (const c of COMPONENTS) {
    const part = svc.parts[c.id];
    const build = buildFor(c.id);
    const savedPart = saved.parts && typeof saved.parts === "object" ? saved.parts[c.id] : null;
    const rawScrews = savedPart ? savedPart.screws : legacyScrews ? legacyScrews[c.id] : undefined;
    const n = Number(rawScrews);
    if (Number.isFinite(n)) part.screws = Math.max(0, Math.min(build.screws, Math.floor(n)));
    if (savedPart) {
      part.present = savedPart.present !== false;
      if (build.clips) part.clips = savedPart.clips === "open" ? "open" : "closed";
      part.seated = savedPart.seated === "proud" ? "proud" : "home";
      if (savedPart.cables && typeof savedPart.cables === "object") {
        for (const cable of build.cables) {
          const v = savedPart.cables[cable.id];
          part.cables[cable.id] = v === CABLE_OUT || v === CABLE_LOOSE ? v : CABLE_FIRM;
        }
      }
      part.screwIn = normalizeScrewMask(savedPart.screwIn, build.screws, part.screws);
      if (savedPart.match && SPARE_MATCHES.has(savedPart.match)) part.match = savedPart.match;
    } else {
      part.screwIn = normalizeScrewMask(null, build.screws, part.screws);
    }
    part.screws = countScrews(part.screwIn);
  }
  return svc;
}

function ensureService(state) {
  if (!state.service) state.service = defaultService();
  const svc = state.service;
  if (!svc.inspected) svc.inspected = {};
  if (!svc.parts) svc.parts = defaultParts();
  const deviceId = state.hostname || state.id || "PC";
  for (const c of COMPONENTS) {
    if (!svc.parts[c.id]) svc.parts[c.id] = defaultPart(c.id);
    const part = svc.parts[c.id];
    if (!part.cables) part.cables = defaultPart(c.id).cables;
    if (typeof part.present !== "boolean") part.present = true;
    if (!part.seated) part.seated = "home";
    const total = buildFor(c.id).screws;
    part.screwIn = normalizeScrewMask(part.screwIn, total, part.screws == null ? total : part.screws);
    part.screws = countScrews(part.screwIn);
    if (buildFor(c.id).removable) {
      if (!part.match || !SPARE_MATCHES.has(part.match)) {
        part.match = matchKeyFor(deviceId, c.id);
      }
    } else {
      part.match = null;
    }
  }
  svc.panelScrews = normalizeScrewMask(svc.panelScrews, SCREW_COUNT, svc.screws == null ? SCREW_COUNT : svc.screws);
  svc.screws = countScrews(svc.panelScrews);
  if (!SPARE_IDS.has(svc.holding) || svc.tool !== "spares") svc.holding = null;
  // A flat legacy screw map still wins if this is its first load.
  if (svc.partScrews && typeof svc.partScrews === "object") {
    for (const [id, n] of Object.entries(svc.partScrews)) {
      if (svc.parts[id] && Number.isFinite(Number(n))) {
        svc.parts[id].screws = Math.max(0, Math.min(buildFor(id).screws, Math.floor(Number(n))));
      }
    }
    delete svc.partScrews;
  }
  return svc;
}

/**
 * What is not as the factory left it on this part, minus anything the planted
 * fault already accounts for. A mains lead that arrived unplugged is the
 * ticket, not something the student pulled out and forgot.
 */
function disturbed(svc, componentId, faultId) {
  const build = buildFor(componentId);
  const part = partState(svc, componentId);
  const fault = faultId ? FAULTS[faultId] : null;
  const excusedCable = fault && fault.kind === "cable" ? fault.cable : null;
  const excusedSeat = Boolean(fault && fault.kind === "seat");
  const out = [];
  if (!part.present) out.push(nameOf(componentId) + " is out of the machine");
  else if (part.screws < build.screws) out.push(nameOf(componentId) + " is not screwed down");
  if (part.clips === "open" && !excusedSeat) out.push(nameOf(componentId) + " clips are open");
  if (part.seated === "proud" && !excusedSeat) out.push(nameOf(componentId) + " is not seated");
  for (const cable of build.cables) {
    if (cable.id === excusedCable) continue;
    if (part.cables[cable.id] !== CABLE_FIRM) out.push(cable.name + " is not plugged back in");
  }
  return out;
}

function partState(svc, componentId) {
  if (!svc.parts) return defaultPart(componentId);
  return svc.parts[componentId] || (svc.parts[componentId] = defaultPart(componentId));
}

function faultsOn(hw) {
  return Object.entries(hw || {})
    .filter(([, fault]) => fault && FAULTS[fault])
    .map(([id, fault]) => ({ component: id, fault, ...FAULTS[fault] }));
}

function accessFor(componentId, faultId) {
  if (faultId && FAULTS[faultId] && FAULTS[faultId].access) return FAULTS[faultId].access;
  const c = COMPONENTS.find((x) => x.id === componentId);
  return (c && c.access) || "internal";
}

function canReachPart(svc, componentId, faultId) {
  const access = accessFor(componentId, faultId);
  if (access === "soft" || access === "external") return true;
  if (!svc.panelOpen) return false;
  // The cooler sits on the processor — lift it before you can touch the CPU.
  if (componentId === "cpu" && partState(svc, "fan").present) return false;
  return true;
}

function reachHintFor(svc, componentId, faultId) {
  if (canReachPart(svc, componentId, faultId)) return null;
  const access = accessFor(componentId, faultId);
  if (access === "soft" || access === "external") return null;
  if (!svc.panelOpen) {
    return "That part is inside the case. Power off, undo the rear screws, and take the side panel off first.";
  }
  if (componentId === "cpu" && partState(svc, "fan").present) {
    return "The CPU fan is still on the processor. Undo its screws, unplug the fan header, and lift the cooler off first.";
  }
  return "That part is not reachable right now.";
}

function nameOf(componentId) {
  return (COMPONENTS.find((c) => c.id === componentId) || {}).name || "That part";
}

function toolName(id) {
  return (TOOLS.find((t) => t.id === id) || {}).name || "the right tool";
}

/**
 * What is physically wrong with the machine right now, ignoring labels: a
 * missing power supply or an unplugged mains lead is no power, whatever the
 * ticket says. Pull the drive and it will not boot.
 */
function physicalBlock(state) {
  const svc = state.service || defaultService();
  const part = (id) => partState(svc, id);
  if (!part("psu").present || part("psu").cables.mains === CABLE_OUT) {
    return { blocks: "power", label: !part("psu").present ? "No power supply fitted" : "Mains lead unplugged" };
  }
  if (part("psu").cables.atx === CABLE_OUT) {
    return { blocks: "power", label: "Board is not connected to the power supply" };
  }
  if (!part("disk").present || part("disk").cables.data === CABLE_OUT) {
    return { blocks: "boot", label: !part("disk").present ? "No drive fitted" : "Drive data cable unplugged" };
  }
  if (!part("cpu").present) {
    return { blocks: "boot", label: "No processor fitted" };
  }
  if (part("cpu").seated === "proud" || part("cpu").clips === "open") {
    return { blocks: "boot", label: "Processor is not seated" };
  }
  if (!part("ram1").present && !part("ram2").present) {
    return { blocks: "boot", label: "No memory fitted" };
  }
  if (part("ram1").seated === "proud" || part("ram2").seated === "proud") {
    return { blocks: "boot", label: "Memory is not seated" };
  }
  if (!part("gpu").present || part("gpu").cables.power === CABLE_OUT) {
    // Only blocks the screen when the display path needs the discrete card —
    // treated as a screen fault so students check the Hardware tab.
    if (!part("gpu").present) {
      return { blocks: "screen", label: "No graphics card fitted" };
    }
    return { blocks: "screen", label: "Graphics card power lead unplugged" };
  }
  if (part("display").cables.video === CABLE_OUT) {
    return { blocks: "screen", label: "Display cable unplugged" };
  }
  if (part("input").cables.usb === CABLE_OUT) {
    return { blocks: "input", label: "Keyboard lead unplugged" };
  }
  return null;
}

function block(state) {
  if (!serviceable(state)) return null;
  const svc = state.service || defaultService();
  if (!svc.powered) {
    return { component: null, fault: null, blocks: "power", label: "Powered off for service", serviceOff: true };
  }
  if (svc.panelOpen) {
    return { component: null, fault: null, blocks: "power", label: "Case is open", serviceOff: true };
  }
  const candidates = [];
  const physical = physicalBlock(state);
  if (physical) candidates.push({ component: null, fault: null, ...physical });
  for (const f of faultsOn(state.hw)) if (f.blocks) candidates.push(f);
  if (!candidates.length) return null;
  candidates.sort((a, b) => BLOCK_ORDER.indexOf(a.blocks) - BLOCK_ORDER.indexOf(b.blocks));
  return candidates[0];
}

function nicDown(state) {
  if (!serviceable(state)) return false;
  const svc = state.service || defaultService();
  if (!partState(svc, "nic").present) return true;
  return faultsOn(state.hw).some((f) => f.component === "nic");
}

function networkDown(state) {
  if (!serviceable(state)) return false;
  if (block(state)) return true;
  return nicDown(state);
}

function gateLines(state) {
  const blocked = block(state);
  if (!blocked) return null;
  if (blocked.serviceOff) {
    return [
      "",
      "*** " + blocked.label + ". ***",
      "",
      "The machine is down for service, so there is no prompt here.",
      "Put it back together — panel on, power on — and this console returns.",
      "",
      "Open the Hardware tab to carry on working."
    ];
  }
  const head = {
    power: [
      "",
      "*** This PC is not powered on. ***",
      "",
      "No lights, no fan noise, nothing on the screen.",
      "Nothing will run here until it has power."
    ],
    boot: [
      "",
      "*** This PC is not starting up. ***",
      "",
      "It powers on, but it never reaches the operating system,",
      "so there is no command prompt to type into yet."
    ],
    screen: [
      "",
      "*** No signal. ***",
      "",
      "The PC is running — you can hear the fan — but the monitor",
      "is showing nothing, so you cannot work at this machine."
    ],
    input: [
      "",
      "*** No keyboard detected. ***",
      "",
      "The desktop is on screen but nothing you type arrives,",
      "so you cannot run a command here."
    ]
  }[blocked.blocks];
  return [...head, "", "Open the Hardware tab. Troubleshoot — do not expect the fault to be labelled for you."];
}

function warningLines(state) {
  if (!serviceable(state)) return [];
  const svc = state.service || defaultService();
  const out = [];
  if (nicDown(state)) out.push("Warning: this PC has no network link. Check the Hardware tab.");
  if ((state.hw || {}).fan === "fan-clogged") {
    out.push("Warning: CPU temperature is high and the processor is throttling.");
  }
  if (!partState(svc, "fan").present || partState(svc, "fan").cables.header === CABLE_OUT) {
    out.push("Warning: no CPU fan detected. Shut down before the processor cooks.");
  }
  if (!partState(svc, "ram1").present || !partState(svc, "ram2").present) {
    out.push("Warning: running on one memory module.");
  }
  return out;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < String(text).length; i++) h = (h * 31 + String(text).charCodeAt(i)) >>> 0;
  return h;
}

const DISPLAY_SPECS = ["DisplayPort to 24-inch monitor", "HDMI to 24-inch monitor"];
const INPUT_SPECS = ["USB keyboard and mouse"];

function specOptionFor(deviceId, componentId) {
  const key = familyKey(componentId);
  const list = SPEC_OPTIONS[key];
  if (!list || !list.length) return null;
  const salt = componentId === "ram2" ? 7 : 0;
  return list[(hash(String(deviceId || "PC") + key) + salt) % list.length];
}

function matchKeyFor(deviceId, componentId) {
  const opt = specOptionFor(deviceId, componentId);
  return opt ? opt.match : null;
}

function specFor(deviceId, componentId) {
  if (componentId === "display") {
    return DISPLAY_SPECS[hash(String(deviceId || "PC") + "display") % DISPLAY_SPECS.length];
  }
  if (componentId === "input") {
    return INPUT_SPECS[0];
  }
  const opt = specOptionFor(deviceId, componentId);
  return opt ? opt.label : "";
}

/**
 * The strip-and-rebuild sequence for one part, in bench order, each step
 * marked done or not. This is the teaching surface: it never names the fault
 * before the part has been inspected, it just says what the job involves.
 */
function planFor(state, componentId) {
  const svc = ensureService(state);
  const build = buildFor(componentId);
  const part = partState(svc, componentId);
  const faultId = (state.hw || {})[componentId];
  const fault = faultId ? FAULTS[faultId] : null;
  const revealed = Boolean(svc.inspected[componentId]) && canReachPart(svc, componentId, faultId);

  const steps = [];
  const step = (key, label, done, tool) => steps.push({ key, label, done: Boolean(done), tool: tool || null });
  const internal = Boolean(fault) && fault.access === "internal";

  // Read as a checklist: a later step cannot be ticked while an earlier one is
  // outstanding, so refitting screws does not look done before the old part
  // has even come out.
  const sequential = (list) => {
    let blocked = false;
    for (const s of list) {
      if (blocked || !s.done) {
        blocked = true;
        s.done = false;
      }
    }
    return list;
  };

  // A part the student has taken apart still needs putting back, whether or
  // not anything was ever wrong with it. That guidance outlives the fault:
  // fitting a good spare clears the fault but leaves screws and leads to do.
  if (!fault) {
    const assembled =
      part.present &&
      part.screws === build.screws &&
      part.clips !== "open" &&
      build.cables.every((c) => part.cables[c.id] === CABLE_FIRM);
    if (assembled) return [];
    // Only what is actually outstanding, so this reads as a to-do list.
    if (!part.present) {
      const need = spareByMatch(part.match);
      step(
        "fit",
        need ? "Fit the matching " + need.name : "Fit a matching spare",
        false,
        "spares"
      );
    }
    const screwsOut = build.screws - part.screws;
    if (screwsOut > 0) {
      step("screw-part", "Put the " + screwsOut + " mounting screw" + (screwsOut === 1 ? "" : "s") + " back in", false, "screwdriver");
    }
    if (build.clips && part.clips === "open") step("clips-close", "Close the retaining clips", false, "hands");
    for (const cable of build.cables) {
      if (part.cables[cable.id] === CABLE_FIRM) continue;
      step("plug:" + cable.id, "Plug the " + cable.name.toLowerCase() + " back on", false, "hands");
    }
    // Screws and leads can go back in any order, so these do not gate each
    // other — but the panel and the power switch come last either way.
    const outstanding = steps.some((s) => !s.done);
    step("fit-panel", "Fit the side panel", !outstanding && !svc.panelOpen);
    step("power-on", "Power the machine back up", !outstanding && svc.powered);
    return steps;
  }

  if (!revealed) return [];

  if (fault.kind === "cable") {
    const spec = cableSpec(componentId, fault.cable);
    const cableInternal = spec && spec.where === "internal";
    if (cableInternal) {
      step("power", "Turn the power off", !svc.powered);
      step("panel", "Take the side panel off", svc.panelOpen);
    }
    const st = part.cables[fault.cable];
    step("unplug:" + fault.cable, "Unplug the " + (spec ? spec.name.toLowerCase() : "lead"), st === CABLE_OUT || st === CABLE_FIRM, "hands");
    step("plug:" + fault.cable, "Plug it back in and seat it firmly", st === CABLE_FIRM, "hands");
    if (cableInternal) {
      step("fit-panel", "Fit the side panel", !svc.panelOpen);
      step("power-on", "Power the machine back up", svc.powered);
    }
    return sequential(steps);
  }

  if (fault.kind === "seat") {
    step("power", "Turn the power off", !svc.powered);
    step("panel", "Take the side panel off", svc.panelOpen);
    step("clips-open", "Open the retaining clips", part.clips === "open" || part.seated === "home", "hands");
    step("seat", "Push the module down until it clicks", part.seated === "home", "hands");
    step("clips-close", "Close the retaining clips", part.seated === "home" && part.clips === "closed", "hands");
    step("fit-panel", "Fit the side panel", !svc.panelOpen);
    step("power-on", "Power the machine back up", svc.powered);
    return sequential(steps);
  }

  if (fault.kind === "replace") {
    if (internal) {
      step("power", "Turn the power off", !svc.powered);
      if (componentId === "psu") {
        step("unplug:mains", "Unplug the mains lead at the wall", part.cables.mains === CABLE_OUT, "hands");
      }
      step("panel", "Take the side panel off", svc.panelOpen);
    }
    if (componentId === "cpu") {
      step("lift-cooler", "Lift the CPU cooler off the processor", !partState(svc, "fan").present, "hands");
    }
    for (const cable of build.cables.filter((c) => c.where === "internal")) {
      step("unplug:" + cable.id, "Unplug the " + cable.name.toLowerCase(), part.cables[cable.id] === CABLE_OUT, "hands");
    }
    if (build.clips) {
      step("clips-open", "Open the retaining clips", part.clips === "open" || !part.present, "hands");
    }
    if (build.screws) {
      step(
        "unscrew-part",
        "Undo the " + build.screws + " mounting screw" + (build.screws === 1 ? "" : "s"),
        part.screws === 0,
        "screwdriver"
      );
    }
    step("extract", "Take the old " + nameOf(componentId).toLowerCase() + " out", !part.present, "hands");
    step("fit", "Fit the replacement", part.present && !faultId, "spares");
    if (build.screws) {
      step("screw-part", "Screw the new part down", part.screws === build.screws, "screwdriver");
    }
    if (build.clips) step("clips-close", "Close the retaining clips", part.clips === "closed", "hands");
    for (const cable of build.cables) {
      step("plug:" + cable.id, "Plug the " + cable.name.toLowerCase() + " back on", part.cables[cable.id] === CABLE_FIRM, "hands");
    }
    if (internal) {
      step("fit-panel", "Fit the side panel", !svc.panelOpen);
      step("power-on", "Power the machine back up", svc.powered);
    }
    return sequential(steps);
  }

  if (fault.kind === "clean") {
    step("power", "Turn the power off", !svc.powered);
    step("panel", "Take the side panel off", svc.panelOpen);
    step("clean", "Clear the dust from the fan and vents", !faultId, "hands");
    step("fit-panel", "Fit the side panel", !svc.panelOpen);
    step("power-on", "Power the machine back up", svc.powered);
    return sequential(steps);
  }

  // Soft faults are changed in the operating system, with the case shut.
  step("enable", "Enable the adapter in the operating system", !faultId, "hands");
  return sequential(steps);
}

function panelFor(state, deviceId) {
  if (!serviceable(state)) {
    return {
      serviceable: false,
      note:
        state && state.kind === "host"
          ? "This is not a desk PC, so there are no parts to service here."
          : "Network kit has no serviceable parts in this lab — configure it from the console instead.",
      components: [],
      service: null,
      tools: []
    };
  }
  const hw = state.hw || defaultHw();
  const svc = ensureService(state);
  const components = COMPONENTS.map((c) => {
    const build = buildFor(c.id);
    const part = partState(svc, c.id);
    const faultId = hw[c.id];
    const fault = faultId ? FAULTS[faultId] : null;
    const reachable = canReachPart(svc, c.id, faultId);
    const inspected = Boolean(svc.inspected[c.id]);
    const revealed = inspected && reachable;
    const steps = planFor(state, c.id);
    const next = steps.find((s) => !s.done) || null;
    return {
      id: c.id,
      name: c.name,
      spec: (() => {
        const key = familyKey(c.id);
        const list = SPEC_OPTIONS[key];
        if (part.match && list) {
          const hit = list.find((o) => o.match === part.match);
          if (hit) return hit.label;
        }
        return specFor(deviceId || state.hostname, c.id);
      })(),
      match: part.match || null,
      neededSpare: (spareByMatch(part.match) || {}).name || null,
      access: accessFor(c.id, faultId),
      reachable,
      inspected,
      revealed,
      present: part.present,
      screws: part.screws,
      screwIn: part.screwIn.slice(),
      screwsTotal: build.screws,
      clips: part.clips,
      seated: part.seated,
      removable: build.removable,
      cables: build.cables.map((cable) => ({
        id: cable.id,
        name: cable.name,
        where: cable.where,
        state: part.cables[cable.id] || CABLE_FIRM
      })),
      steps,
      nextStep: next ? next.label : "",
      nextTool: next ? next.tool : null,
      status: revealed ? (!fault ? "ok" : fault.blocks || c.id === "nic" ? "fault" : "warn") : "unknown",
      label: revealed
        ? fault
          ? fault.label
          : "Looks OK so far"
        : reachable
          ? "Not inspected yet"
          : "Open the case to reach this",
      found: revealed
        ? fault
          ? fault.found
          : "Nothing obvious wrong with this part on a visual check."
        : "",
      repair: revealed && fault ? fault.repair : "",
      toolNeeded: revealed && fault ? fault.tool : null,
      toolNeededLabel: revealed && fault ? toolName(fault.tool) : null
    };
  });
  const looseParts = COMPONENTS.filter((c) => disturbed(svc, c.id, hw[c.id]).length).map((c) => nameOf(c.id));
  return {
    serviceable: true,
    service: {
      powered: svc.powered,
      screws: svc.screws,
      screwIn: svc.panelScrews.slice(),
      screwsTotal: SCREW_COUNT,
      panelOpen: svc.panelOpen,
      tool: svc.tool,
      holding: svc.holding,
      reassembled: looseParts.length === 0,
      looseParts
    },
    tools: TOOLS,
    spares: SPARES,
    components
  };
}

/**
 * Clears a fault the moment the machine is physically right again, so the
 * student is never asked to press a "done" button the bench would not have.
 */
function settle(state, componentId) {
  const svc = ensureService(state);
  const faultId = (state.hw || {})[componentId];
  const fault = faultId ? FAULTS[faultId] : null;
  if (!fault) return null;
  const part = partState(svc, componentId);
  if (fault.kind === "cable" && part.cables[fault.cable] === CABLE_FIRM) {
    state.hw[componentId] = null;
    return fault.fixed;
  }
  if (fault.kind === "seat" && part.seated === "home" && part.clips === "closed") {
    state.hw[componentId] = null;
    return fault.fixed;
  }
  return null;
}

function requireInside(svc, what) {
  if (svc.powered) return "Turn the power off before " + what + ".";
  if (!svc.panelOpen) return "Take the side panel off before " + what + ".";
  return null;
}

/** One endpoint for every physical action on the bench. */
function act(state, body) {
  body = body || {};
  if (!serviceable(state)) return { ok: false, error: "There is nothing to service on this device." };
  const svc = ensureService(state);
  if (!state.hw) state.hw = defaultHw();

  let action = String(body.action || "").toLowerCase();
  if (!action && body.component) action = "repair";
  const componentId = body.component == null ? "" : String(body.component);
  const part = COMPONENT_IDS.has(componentId) ? partState(svc, componentId) : null;
  const build = COMPONENT_IDS.has(componentId) ? buildFor(componentId) : null;
  const needsPart = [
    "inspect",
    "unplug",
    "plug",
    "clips",
    "seat",
    "extract",
    "fit",
    "clean",
    "enable",
    "unscrew-part",
    "screw-part",
    "repair"
  ];
  if (needsPart.includes(action) && !part) return { ok: false, error: "No such part in this PC." };

  const done = (message, extra) => Object.assign({ ok: true, message, action, component: componentId || null }, extra || {});

  if (action === "power") {
    const wantOn = body.on === true || body.on === "true" || body.on === 1;
    const wantOff = body.on === false || body.on === "false" || body.on === 0;
    const next = wantOn ? true : wantOff ? false : !svc.powered;
    if (next) {
      if (svc.panelOpen) return { ok: false, error: "Fit the side panel before turning the power back on." };
      if (svc.screws < SCREW_COUNT) return { ok: false, error: "Put the side panel screws back in first." };
      if (partState(svc, "psu").cables.mains === CABLE_OUT) {
        return { ok: false, error: "The mains lead is unplugged — plug it back in first." };
      }
      const missing = COMPONENTS.filter((c) => buildFor(c.id).removable && !partState(svc, c.id).present);
      if (missing.some((c) => c.id === "psu" || c.id === "disk")) {
        return { ok: false, error: "Fit the " + nameOf(missing[0].id).toLowerCase() + " before powering up." };
      }
    }
    svc.powered = next;
    return done(next ? "Power is on." : "Power is off — safe to open the case.");
  }

  if (action === "select-tool") {
    const tool = body.tool == null || body.tool === "" ? null : String(body.tool);
    if (tool && !TOOL_IDS.has(tool)) return { ok: false, error: "That is not a tool on this tray." };
    svc.tool = tool;
    if (tool !== "spares") svc.holding = null;
    return done(tool ? toolName(tool) + " selected." : "Tool put down.");
  }

  if (action === "select-spare") {
    const spareId = body.spare == null || body.spare === "" ? null : String(body.spare);
    if (spareId && !SPARE_IDS.has(spareId)) return { ok: false, error: "That is not on the spare-parts rack." };
    if (spareId) {
      // Picking a part from the rack puts Spare parts in your hand even if you
      // were just using the screwdriver or hands a moment ago.
      svc.tool = "spares";
      svc.holding = spareId;
      return done("Holding " + spareFor(spareId).name + " — drag it onto an empty bay.");
    }
    svc.holding = null;
    return done("Spare put back on the rack.");
  }

  if (action === "unscrew" || action === "screw") {
    if (svc.panelOpen) return { ok: false, error: "The side panel is already off." };
    if (svc.powered) return { ok: false, error: "Turn the power off before working the panel screws." };
    if (svc.tool !== "screwdriver") return { ok: false, error: "Select the screwdriver, then click a screw." };
    const idx = parseScrewIndex(body, SCREW_COUNT);
    if (action === "unscrew") {
      if (svc.screws <= 0) return { ok: false, error: "All screws are already out." };
      const which = idx != null ? idx : svc.panelScrews.lastIndexOf(true);
      if (which < 0 || !svc.panelScrews[which]) {
        return { ok: false, error: "That screw is already out — pick one that is still in." };
      }
      svc.panelScrews[which] = false;
      svc.screws = countScrews(svc.panelScrews);
      return done(
        svc.screws === 0 ? "Last screw out — you can remove the side panel." : "Screw removed — " + svc.screws + " left."
      );
    }
    if (svc.screws >= SCREW_COUNT) return { ok: false, error: "All panel screws are already in." };
    const which = idx != null ? idx : svc.panelScrews.indexOf(false);
    if (which < 0 || svc.panelScrews[which]) {
      return { ok: false, error: "That hole already has a screw in it." };
    }
    svc.panelScrews[which] = true;
    svc.screws = countScrews(svc.panelScrews);
    return done("Panel screw fitted — " + (SCREW_COUNT - svc.screws) + " still out.");
  }

  if (action === "unscrew-part" || action === "screw-part") {
    if (!build.screws) return { ok: false, error: nameOf(componentId) + " is not held in by screws." };
    const blocked = requireInside(svc, "undoing anything inside the case");
    if (blocked) return { ok: false, error: blocked };
    if (svc.tool !== "screwdriver") return { ok: false, error: "Select the screwdriver, then click a screw." };
    const idx = parseScrewIndex(body, build.screws);
    if (action === "unscrew-part") {
      if (part.screws <= 0) return { ok: false, error: nameOf(componentId) + " already has all its screws out." };
      const which = idx != null ? idx : part.screwIn.lastIndexOf(true);
      if (which < 0 || !part.screwIn[which]) {
        return { ok: false, error: "That screw is already out — pick one that is still in." };
      }
      part.screwIn[which] = false;
      part.screws = countScrews(part.screwIn);
      return done(
        part.screws === 0
          ? nameOf(componentId) + " is free of its screws."
          : nameOf(componentId) + " screw out — " + part.screws + " left."
      );
    }
    if (!part.present) return { ok: false, error: "Fit a replacement before screwing anything down." };
    if (part.screws >= build.screws) return { ok: false, error: nameOf(componentId) + " is already fully screwed in." };
    const which = idx != null ? idx : part.screwIn.indexOf(false);
    if (which < 0 || part.screwIn[which]) {
      return { ok: false, error: "That hole already has a screw in it." };
    }
    part.screwIn[which] = true;
    part.screws = countScrews(part.screwIn);
    return done(nameOf(componentId) + " screw fitted — " + (build.screws - part.screws) + " still out.");
  }

  if (action === "remove-panel") {
    if (svc.panelOpen) return { ok: false, error: "The side panel is already off." };
    if (svc.powered) return { ok: false, error: "Turn the power off before opening the case." };
    if (svc.screws > 0) return { ok: false, error: "Remove all " + SCREW_COUNT + " screws first (" + svc.screws + " still in)." };
    svc.panelOpen = true;
    return done("Side panel off — you can see inside the case.");
  }

  if (action === "fit-panel") {
    if (!svc.panelOpen) return { ok: false, error: "The side panel is already on." };
    // Only what lives inside the case can stop the panel going on. A rear lead
    // being out is the operator's business, not the panel's. A lead that is
    // merely loose is still in its socket, so it does not foul the panel either.
    const loose = [];
    for (const c of COMPONENTS) {
      const p = partState(svc, c.id);
      const b = buildFor(c.id);
      if (!b.removable && !b.cables.some((cab) => cab.where === "internal")) continue;
      if (!p.present) loose.push(nameOf(c.id) + " is out of the machine");
      else if (p.screws < b.screws) loose.push(nameOf(c.id) + " is not screwed down");
      else if (p.clips === "open") loose.push(nameOf(c.id) + " clips are open");
      else {
        const bad = b.cables.find((cab) => cab.where === "internal" && p.cables[cab.id] === CABLE_OUT);
        if (bad) loose.push(bad.name + " is hanging loose");
      }
    }
    if (loose.length) return { ok: false, error: "Finish the rebuild first — " + loose.join("; ") + "." };
    svc.panelOpen = false;
    svc.panelScrews = screwMask(SCREW_COUNT, SCREW_COUNT);
    svc.screws = SCREW_COUNT;
    return done("Side panel fitted and its screws back in.");
  }

  if (action === "inspect") {
    const faultId = state.hw[componentId];
    if (!canReachPart(svc, componentId, faultId)) {
      return {
        ok: false,
        error: reachHintFor(svc, componentId, faultId) || "That part is inside the case — open the side panel first."
      };
    }
    svc.inspected[componentId] = true;
    return done("Inspected " + nameOf(componentId) + ".");
  }

  if (action === "unplug" || action === "plug") {
    const cableId = String(body.cable || (build.cables[0] || {}).id || "");
    const spec = cableSpec(componentId, cableId);
    if (!spec) return { ok: false, error: "There is no such lead on " + nameOf(componentId).toLowerCase() + "." };
    if (spec.where === "internal") {
      const blocked = requireInside(svc, "touching leads inside the case");
      if (blocked) return { ok: false, error: blocked };
    } else if (action === "unplug" && cableId === "mains" && svc.powered) {
      // Pulling the mains on a running machine is exactly what you do not do.
      return { ok: false, error: "Shut the machine down before pulling the mains lead." };
    }
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to work on leads." };
    const current = part.cables[cableId];
    if (action === "unplug") {
      if (current === CABLE_OUT) return { ok: false, error: spec.name + " is already unplugged." };
      part.cables[cableId] = CABLE_OUT;
      return done(spec.name + " unplugged.");
    }
    if (current === CABLE_FIRM) return { ok: false, error: spec.name + " is already seated firmly." };
    if (current === CABLE_LOOSE) {
      return { ok: false, error: spec.name + " is already in the socket, just not home. Pull it out and seat it properly." };
    }
    part.cables[cableId] = CABLE_FIRM;
    const fixed = settle(state, componentId);
    return done(fixed || spec.name + " plugged back in and seated.");
  }

  if (action === "clips") {
    if (!build.clips) return { ok: false, error: nameOf(componentId) + " has no retaining clips." };
    const blocked = requireInside(svc, "working the memory clips");
    if (blocked) return { ok: false, error: blocked };
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to work the clips." };
    const open = body.open === true || body.open === "true" || String(body.open || "") === "open";
    const wantOpen = body.open === undefined ? part.clips !== "open" : open;
    if (!wantOpen && !part.present) return { ok: false, error: "There is no module in the slot to clip down." };
    part.clips = wantOpen ? "open" : "closed";
    const fixed = wantOpen ? null : settle(state, componentId);
    return done(fixed || (wantOpen ? "Retaining clips opened." : "Retaining clips closed."));
  }

  if (action === "seat") {
    const blocked = requireInside(svc, "seating a module");
    if (blocked) return { ok: false, error: blocked };
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to seat the module." };
    if (!part.present) return { ok: false, error: "There is no module in that slot." };
    if (part.clips === "closed" && part.seated !== "home") {
      return { ok: false, error: "Open the retaining clips before forcing the module down." };
    }
    part.seated = "home";
    const fixed = settle(state, componentId);
    return done(fixed || "Module pushed home.");
  }

  if (action === "extract") {
    if (!build.removable) return { ok: false, error: nameOf(componentId) + " does not come out — it just unplugs." };
    const blocked = requireInside(svc, "taking a part out");
    if (blocked) return { ok: false, error: blocked };
    if (!part.present) return { ok: false, error: nameOf(componentId) + " is already out." };
    if (componentId === "cpu" && partState(svc, "fan").present) {
      return { ok: false, error: "Lift the CPU fan off before taking the processor out." };
    }
    const attached = build.cables.find((cab) => part.cables[cab.id] !== CABLE_OUT);
    if (attached) return { ok: false, error: "Unplug the " + attached.name.toLowerCase() + " first." };
    if (build.clips && part.clips !== "open") return { ok: false, error: "Open the retaining clips first." };
    if (part.screws > 0) {
      return { ok: false, error: "Undo the " + part.screws + " remaining mounting screw" + (part.screws === 1 ? "" : "s") + " first." };
    }
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to lift the part out." };
    part.present = false;
    return done(nameOf(componentId) + " lifted out of the machine.");
  }

  if (action === "fit") {
    if (!build.removable) return { ok: false, error: nameOf(componentId) + " is not a part you fit." };
    const blocked = requireInside(svc, "fitting a part");
    if (blocked) return { ok: false, error: blocked };
    if (svc.tool !== "spares") return { ok: false, error: "Select Spare parts to open the rack." };
    if (part.present) return { ok: false, error: nameOf(componentId) + " is already in the machine." };
    if (componentId === "cpu" && partState(svc, "fan").present) {
      return { ok: false, error: "Lift the CPU fan off before seating a processor." };
    }
    if (componentId === "fan" && !partState(svc, "cpu").present) {
      return { ok: false, error: "Fit a processor before seating the CPU cooler." };
    }
    const spareId = body.spare != null && body.spare !== "" ? String(body.spare) : svc.holding;
    const spare = spareFor(spareId);
    if (!spare) {
      return { ok: false, error: "Pick a spare from the rack and drag it onto the empty bay." };
    }
    if (!spare.fits.includes(componentId)) {
      return {
        ok: false,
        error: "That " + spare.kind.toLowerCase() + " does not fit in the " + nameOf(componentId).toLowerCase() + " bay."
      };
    }
    if (part.match && spare.match !== part.match) {
      const need = spareByMatch(part.match);
      return {
        ok: false,
        error: need
          ? "Wrong size — this bay needs the " + need.name + ", not the " + spare.name + "."
          : "Wrong size — that spare does not match what this bay needs."
      };
    }
    part.present = true;
    if (spare.match) part.match = spare.match;
    part.seated = "home";
    if (build.clips) part.clips = "open";
    part.screwIn = screwMask(build.screws, 0);
    part.screws = 0;
    for (const cab of build.cables) part.cables[cab.id] = CABLE_OUT;
    svc.holding = null;
    const faultId = state.hw[componentId];
    const fault = faultId ? FAULTS[faultId] : null;
    let message =
      spare.name + " fitted into the " + nameOf(componentId).toLowerCase() + " bay. Screw it down and plug its leads back on.";
    if (build.clips && !build.screws) {
      message = spare.name + " dropped into the " + nameOf(componentId).toLowerCase() + " bay. Close the clips to seat it.";
    }
    if (fault && fault.kind === "replace") {
      state.hw[componentId] = null;
      message =
        fault.fixed +
        (build.clips && !build.screws ? " Close the clips." : " Screw it down and reconnect its leads.");
    }
    return done(message);
  }

  if (action === "clean") {
    const blocked = requireInside(svc, "cleaning inside the case");
    if (blocked) return { ok: false, error: blocked };
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to clear the dust." };
    const faultId = state.hw[componentId];
    const fault = faultId ? FAULTS[faultId] : null;
    if (!fault || fault.kind !== "clean") return { ok: false, error: "There is no dust to clear on " + nameOf(componentId).toLowerCase() + "." };
    state.hw[componentId] = null;
    return done(fault.fixed);
  }

  if (action === "enable") {
    if (svc.tool !== "hands") return { ok: false, error: "Select Hands to change a setting on the machine." };
    const faultId = state.hw[componentId];
    const fault = faultId ? FAULTS[faultId] : null;
    if (!fault || fault.kind !== "soft") return { ok: false, error: "There is nothing to enable on " + nameOf(componentId).toLowerCase() + "." };
    if (block(state)) return { ok: false, error: "The machine has to be running before you can change a setting on it." };
    state.hw[componentId] = null;
    return done(fault.fixed);
  }

  // `repair` is the one-press path, and only where a bench really is one press.
  if (action === "repair") {
    const faultId = state.hw[componentId];
    const fault = faultId ? FAULTS[faultId] : null;
    if (!fault) return { ok: false, error: nameOf(componentId) + " looks fine — nothing to repair." };
    if (!svc.inspected[componentId]) return { ok: false, error: "Inspect the part first — look before you touch." };
    if (fault.kind === "clean") return act(state, { action: "clean", component: componentId });
    if (fault.kind === "soft") return act(state, { action: "enable", component: componentId });
    const steps = planFor(state, componentId);
    const next = steps.find((s) => !s.done);
    return {
      ok: false,
      error: next
        ? "That is not a one-press job. Next step: " + next.label + "."
        : "Nothing left to do on that part."
    };
  }

  return {
    ok: false,
    error:
      "Unknown hardware action. Use power, select-tool, select-spare, unscrew, screw, remove-panel, fit-panel, inspect, " +
      "unplug, plug, clips, seat, unscrew-part, screw-part, extract, fit, clean or enable."
  };
}

/** Kept for callers that only want the final step of a single-press fix. */
function repair(state, componentId) {
  return act(state, { action: "repair", component: String(componentId || "") });
}

/** Plants a fault for a ticket, including the physical state that goes with it. */
function plant(state, faultId, slot) {
  if (!serviceable(state) || !FAULTS[faultId]) return null;
  const componentId = componentFor(faultId, slot);
  if (!componentId) return null;
  if (!state.hw) state.hw = defaultHw();
  const svc = ensureService(state);
  state.hw[componentId] = faultId;
  delete svc.inspected[componentId];

  // Put the machine into the shape the symptom describes.
  const fault = FAULTS[faultId];
  const part = partState(svc, componentId);
  const build = buildFor(componentId);
  part.present = true;
  part.screwIn = screwMask(build.screws, build.screws);
  part.screws = build.screws;
  part.seated = "home";
  if (build.clips) part.clips = "closed";
  for (const cab of build.cables) part.cables[cab.id] = CABLE_FIRM;
  if (fault.kind === "cable") part.cables[fault.cable] = fault.cableState || CABLE_LOOSE;
  if (fault.kind === "seat") {
    part.seated = "proud";
    part.clips = "open";
  }
  return { component: componentId, fault: faultId };
}

/** Undoes a planted fault and puts the part physically back together. */
function clear(state, componentId, faultId) {
  if (!serviceable(state) || !state.hw) return false;
  if (!COMPONENT_IDS.has(componentId)) return false;
  if (faultId && state.hw[componentId] !== faultId) return false;
  if (!state.hw[componentId]) return false;
  state.hw[componentId] = null;
  const svc = ensureService(state);
  svc.parts[componentId] = defaultPart(componentId);
  return true;
}

module.exports = {
  FAULTS,
  TICKET_FAULTS,
  TOOLS,
  SPARES,
  SPEC_OPTIONS,
  SCREW_COUNT,
  PART_SCREWS,
  PART_BUILD,
  spareFits,
  spareMatchesBay,
  spareFor,
  spareByMatch,
  matchKeyFor,
  defaultHw,
  defaultService,
  defaultPart,
  normalizeHw,
  normalizeService,
  serviceable,
  block,
  networkDown,
  nicDown,
  gateLines,
  warningLines,
  planFor,
  panelFor,
  repair,
  act,
  plant,
  clear
};
