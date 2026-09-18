/**
 * Hardware bench SVG diagrams, spare parts, and cable/screw drag wiring.
 */
import { escapeHtml } from "./lib/util.js";

function hwPartNeutral(id, byId, shapes, hit, index) {
  const c = byId[id];
  if (!c) return "";
  const [hx, hy, hw_, hh] = hit;
  const stateClass = c.revealed ? `is-${c.status}` : "is-unknown";
  // A part lifted out leaves an empty bay behind; CSS hides its body and
  // shows the outline instead, so the case really does look half-built.
  const absent = c.present === false ? " is-absent" : "";
  const proud = c.seated === "proud" ? " is-proud" : "";
  const open = c.clips === "open" ? " is-clips-open" : "";
  const bay = c.present === false && c.removable ? " data-bay=\"1\"" : "";
  const matchAttr = c.match ? ` data-match="${escapeHtml(c.match)}"` : "";
  return `
    <g class="hw-part ${stateClass}${absent}${proud}${open}" data-part="${id}"${bay}${matchAttr} role="button" tabindex="0"
       style="--i:${index || 0}" aria-label="${escapeHtml(c.name)}">
      <rect class="hw-hit" x="${hx}" y="${hy}" width="${hw_}" height="${hh}" rx="9" />
      <rect class="hw-bay" x="${hx + 4}" y="${hy + 4}" width="${hw_ - 8}" height="${hh - 8}" rx="6" />
      ${shapes}
    </g>`;
}

/**
 * The leads, drawn where they really run and clickable like everything else.
 * Each one has a route for when it is plugged in and a shorter, drooping route
 * for when it is hanging out of its socket.
 */
const HW_CABLE_ART = {
  open: {
    "psu:mains": {
      in: "M712 82 H 752",
      out: "M752 82 C 740 84, 734 100, 740 116",
      anchor: [752, 82],
      socket: [704, 74, 12, 16],
      plugOut: [734, 108, 12, 16],
      label: "Mains lead"
    },
    "psu:atx": {
      in: "M560 118 C 540 118, 536 156, 512 156",
      out: "M560 118 C 542 118, 538 134, 546 146",
      anchor: [560, 118],
      socket: [500, 148, 16, 17],
      plugOut: [538, 138, 16, 17],
      label: "24-pin board connector"
    },
    "psu:aux": {
      in: "M560 138 C 546 138, 542 182, 518 182",
      out: "M560 138 C 548 140, 546 156, 554 166",
      anchor: [560, 138],
      socket: [508, 175, 14, 15],
      plugOut: [547, 159, 14, 15],
      label: "Drive power lead"
    },
    "disk:data": {
      in: "M560 256 C 540 256, 536 232, 512 232",
      out: "M512 232 C 528 242, 538 258, 530 274",
      anchor: [512, 232],
      socket: [554, 248, 13, 16],
      plugOut: [524, 266, 13, 16],
      label: "SATA data cable"
    },
    "disk:power": {
      in: "M724 258 C 740 258, 744 210, 730 180",
      out: "M730 180 C 742 192, 746 208, 736 222",
      anchor: [730, 180],
      socket: [717, 251, 13, 14],
      plugOut: [730, 215, 13, 14],
      label: "SATA power lead"
    },
    "fan:header": {
      in: "M322 137 C 334 137, 338 134, 348 133",
      out: "M322 137 C 332 142, 336 154, 328 164",
      anchor: [322, 137],
      socket: [346, 126, 14, 14],
      plugOut: [321, 157, 14, 14],
      label: "Fan header lead"
    },
    "gpu:power": {
      /* Drop down the gap between the board and the PSU, then in to the card —
         stays clear of the 24-pin and drive-power leads. */
      in: "M565 164 H 542 V 260 H 470",
      out: "M470 260 C 490 272, 508 288, 498 302",
      anchor: [470, 260],
      socket: [558, 156, 14, 16],
      plugOut: [490, 290, 14, 16],
      label: "PCIe power lead"
    },
    "display:video": {
      in: "M116 100 C 132 100, 130 108, 150 108",
      out: "M116 100 C 130 100, 134 118, 124 130",
      anchor: [116, 100],
      socket: [150, 96, 26, 24],
      plugOut: [111, 118, 26, 24],
      label: "Display cable"
    },
    "input:usb": {
      in: "M130 268 C 142 268, 140 176, 150 176",
      out: "M130 268 C 142 268, 148 286, 138 296",
      anchor: [130, 268],
      socket: [150, 164, 26, 22],
      plugOut: [125, 285, 26, 22],
      label: "Keyboard and mouse lead"
    }
  },
  closed: {
    "psu:mains": {
      in: "M680 101 C 710 101, 730 88, 756 88",
      out: "M756 88 C 730 92, 716 110, 722 128",
      anchor: [756, 88],
      socket: [676, 93, 10, 16],
      plugOut: [717, 120, 10, 16],
      label: "Mains lead"
    },
    "display:video": {
      in: "M116 96 C 150 96, 160 112, 192 112",
      out: "M116 96 C 144 96, 154 114, 146 132",
      anchor: [116, 96],
      socket: [190, 100, 24, 24],
      plugOut: [134, 120, 24, 24],
      label: "Display cable"
    },
    "input:usb": {
      in: "M130 288 C 160 288, 168 200, 192 200",
      out: "M130 288 C 158 288, 164 306, 154 320",
      anchor: [130, 288],
      socket: [190, 190, 24, 32],
      plugOut: [142, 306, 24, 28],
      label: "Keyboard and mouse lead"
    }
  }
};

/** How close the plug has to get to its socket before it will seat. */
const HW_SNAP = 26;

function hwBoxCentre(box) {
  return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
}

function hwDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A lead being held: it runs from its captive end to your hand, and sags. */
function hwSagPath(anchor, tip) {
  const ax = anchor[0];
  const ay = anchor[1];
  const mx = (ax + tip.x) / 2;
  const my = (ay + tip.y) / 2 + Math.min(18, hwDistance({ x: ax, y: ay }, tip) * 0.22);
  return `M${ax} ${ay} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
}

/**
 * Timestamp of the last completed drag. A pointer drag is followed by a click
 * on the same element, and that click must not toggle the lead a second time.
 */
let hwDragEndedAt = 0;

/** True for a short window after a lead/spare drag so the follow-up click is ignored. */
export function hwDragJustEnded(ms = 350) {
  return Date.now() - hwDragEndedAt < ms;
}

/**
 * Leads come off by hand. Grab one and pull it away from its socket to unplug
 * it; drag it back until the socket lights up to seat it. A tap without any
 * movement still falls through to the click handler, which keeps the panel
 * usable by keyboard and on a trackpad.
 */
function wireCableDrag(pane, view, run) {
  const svg = pane.querySelector(".hw-svg");
  if (!svg || typeof svg.createSVGPoint !== "function") return;
  const art = HW_CABLE_ART[view] || {};

  const toUser = (evt) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  // Otherwise the browser starts its own drag of the artwork halfway through.
  if (!svg.dataset.hwDragGuard) {
    svg.dataset.hwDragGuard = "1";
    svg.addEventListener("dragstart", (evt) => evt.preventDefault());
  }

  svg.querySelectorAll(".hw-cable").forEach((group) => {
    if (group.dataset.hwDragBound) return;
    group.dataset.hwDragBound = "1";
    const spec = art[group.getAttribute("data-component") + ":" + group.getAttribute("data-cable")];
    const plug = group.querySelector(".hw-plug");
    const line = group.querySelector(".hw-cable-line");
    const hit = group.querySelector(".hw-cable-hit");
    if (!spec || !spec.anchor || !plug || !line) return;

    const out = group.classList.contains("is-out");
    const home = hwBoxCentre(out ? spec.plugOut : spec.socket);
    const target = hwBoxCentre(spec.socket);
    const restPath = out ? spec.out : spec.in;
    let from = null;
    let moved = false;

    const draw = (d) => {
      line.setAttribute("d", d);
      if (hit) hit.setAttribute("d", d);
    };
    const settle = () => {
      plug.removeAttribute("transform");
      draw(restPath);
      group.classList.remove("is-dragging", "is-on-target", "is-pulled");
    };

    // The pointer leaves the lead the moment it starts moving, so the drag is
    // tracked on the window rather than on the element itself.
    const onMove = (evt) => {
      if (!from) return;
      const p = toUser(evt);
      if (!p) return;
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      if (!moved && Math.hypot(dx, dy) > 3) moved = true;
      if (!moved) return;
      evt.preventDefault();
      const tip = { x: home.x + dx, y: home.y + dy };
      plug.setAttribute("transform", `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      draw(hwSagPath(spec.anchor, tip));
      const near = hwDistance(tip, target) <= HW_SNAP;
      group.classList.toggle("is-on-target", out && near);
      group.classList.toggle("is-pulled", !out && !near);
    };

    const onUp = (evt) => {
      if (!from) return;
      const p = toUser(evt);
      const tip = p ? { x: home.x + (p.x - from.x), y: home.y + (p.y - from.y) } : home;
      const wasDrag = moved;
      from = null;
      moved = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!wasDrag) {
        settle();
        return;
      }
      hwDragEndedAt = Date.now();
      const near = hwDistance(tip, target) <= HW_SNAP;
      const component = group.getAttribute("data-component");
      const cable = group.getAttribute("data-cable");
      if (out && near) run("plug", { component, cable }, component);
      else if (!out && !near) run("unplug", { component, cable }, component);
      else settle();
    };

    group.addEventListener("pointerdown", (evt) => {
      if (evt.pointerType === "mouse" && evt.button !== 0) return;
      const p = toUser(evt);
      if (!p) return;
      evt.preventDefault();
      // Leads are always a hands job — switch tool so the drag is not rejected.
      run("select-tool", { tool: "hands" });
      from = p;
      moved = false;
      group.classList.add("is-dragging");
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  });
}

/**
 * Which silhouette to draw for a spare on the rack.
 */
function hwSpareFamily(spare) {
  const fit = spare && spare.fits && spare.fits[0];
  if (fit === "ram1" || fit === "ram2") return "ram";
  if (fit === "psu" || fit === "disk" || fit === "nic" || fit === "fan" || fit === "cpu" || fit === "gpu") {
    return fit;
  }
  const id = String((spare && spare.id) || "");
  if (id.startsWith("ram")) return "ram";
  if (id.startsWith("psu")) return "psu";
  if (id.startsWith("disk")) return "disk";
  if (id.startsWith("nic")) return "nic";
  if (id.startsWith("fan")) return "fan";
  if (id.startsWith("cpu")) return "cpu";
  if (id.startsWith("gpu")) return "gpu";
  return "disk";
}

/**
 * Mini hardware drawing for the spare-parts rack. The capacity sits on the
 * part itself so the rack reads as a shelf of kit, not a list of buttons.
 */
function hwSpareStamp(name) {
  const raw = String(name || "Spare").trim();
  // Split "450 W power supply" into a bold capacity line + type line on the part.
  const m = raw.match(/^(\d+(?:\.\d+)?\s*(?:GB|TB|W|mm))\b\s*(.*)$/i);
  if (m) {
    return { primary: escapeHtml(m[1]), secondary: escapeHtml(m[2] || "") };
  }
  if (/^2\.5\s+Gigabit/i.test(raw)) {
    return { primary: "2.5 GbE", secondary: escapeHtml(raw.replace(/^2\.5\s+Gigabit\s*/i, "")) };
  }
  if (/^Gigabit/i.test(raw)) {
    return { primary: "1 GbE", secondary: escapeHtml(raw.replace(/^Gigabit\s*/i, "")) };
  }
  const cpu = raw.match(/^((?:Core\s+i\d|Ryzen\s+\d+))\b\s*(.*)$/i);
  if (cpu) {
    return { primary: escapeHtml(cpu[1]), secondary: escapeHtml(cpu[2] || "processor") };
  }
  const gpu = raw.match(/^((?:GTX|RTX)\s+\d+)\b\s*(.*)$/i);
  if (gpu) {
    return { primary: escapeHtml(gpu[1]), secondary: escapeHtml(gpu[2] || "graphics card") };
  }
  return { primary: escapeHtml(raw), secondary: "" };
}

function hwSpareArt(spare) {
  const family = hwSpareFamily(spare);
  const stamp = hwSpareStamp(spare.name);
  const dual = stamp.secondary
    ? `<text class="hw-spare-onpart hw-spare-onpart-lg" x="0" y="0" text-anchor="middle">${stamp.primary}</text>
       <text class="hw-spare-onpart hw-spare-onpart-sm" x="0" y="11" text-anchor="middle">${stamp.secondary}</text>`
    : `<text class="hw-spare-onpart hw-spare-onpart-lg" x="0" y="4" text-anchor="middle">${stamp.primary}</text>`;

  if (family === "psu") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-shell" x="6" y="10" width="136" height="66" rx="7" />
      <rect class="hw-spare-face" x="12" y="16" width="124" height="54" rx="4" />
      <circle class="hw-spare-fan" cx="44" cy="43" r="20" />
      <circle class="hw-spare-hub" cx="44" cy="43" r="6" />
      <path class="hw-spare-blade" d="M44 43 L44 27 A16 16 0 0 1 56 31 Z M44 43 L60 43 A16 16 0 0 1 56 55 Z M44 43 L44 59 A16 16 0 0 1 32 55 Z M44 43 L28 43 A16 16 0 0 1 32 31 Z" />
      <path class="hw-spare-vent" d="M76 22 h52 M76 30 h52 M76 38 h52" />
      <rect class="hw-spare-plate" x="72" y="44" width="58" height="22" rx="3" />
      <g transform="translate(101 52)">${dual}</g>
    </svg>`;
  }
  if (family === "ram") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-shell" x="12" y="18" width="124" height="50" rx="3" />
      <rect class="hw-spare-chip" x="20" y="24" width="20" height="16" rx="1.5" />
      <rect class="hw-spare-chip" x="46" y="24" width="20" height="16" rx="1.5" />
      <rect class="hw-spare-chip" x="72" y="24" width="20" height="16" rx="1.5" />
      <rect class="hw-spare-chip" x="98" y="24" width="20" height="16" rx="1.5" />
      <path class="hw-spare-edge" d="M12 68 H136" />
      <path class="hw-spare-notch" d="M64 68 h20 v5 h-20 z" />
      <g transform="translate(74 54)">${dual}</g>
    </svg>`;
  }
  if (family === "disk") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-shell" x="10" y="18" width="128" height="52" rx="6" />
      <circle class="hw-spare-fan" cx="44" cy="44" r="18" />
      <circle class="hw-spare-hub" cx="44" cy="44" r="5" />
      <rect class="hw-spare-plate" x="72" y="28" width="56" height="32" rx="3" />
      <g transform="translate(100 40)">${dual}</g>
    </svg>`;
  }
  if (family === "nic") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-bracket" x="8" y="16" width="12" height="54" rx="2" />
      <rect class="hw-spare-shell" x="20" y="24" width="118" height="40" rx="3" />
      <rect class="hw-spare-chip" x="28" y="32" width="18" height="24" rx="2" />
      <rect class="hw-spare-port" x="120" y="32" width="14" height="24" rx="1.5" />
      <g transform="translate(80 42)">${dual}</g>
    </svg>`;
  }
  if (family === "cpu") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-shell" x="34" y="12" width="80" height="62" rx="4" />
      <rect class="hw-spare-chip" x="44" y="22" width="60" height="42" rx="3" />
      <rect class="hw-spare-plate" x="54" y="30" width="40" height="26" rx="2" />
      <g transform="translate(74 70)">${dual}</g>
    </svg>`;
  }
  if (family === "gpu") {
    return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
      <rect class="hw-spare-bracket" x="8" y="18" width="12" height="50" rx="2" />
      <rect class="hw-spare-shell" x="20" y="22" width="118" height="44" rx="4" />
      <circle class="hw-spare-fan" cx="48" cy="44" r="14" />
      <circle class="hw-spare-hub" cx="48" cy="44" r="4" />
      <circle class="hw-spare-fan" cx="82" cy="44" r="14" />
      <circle class="hw-spare-hub" cx="82" cy="44" r="4" />
      <rect class="hw-spare-port" x="112" y="30" width="18" height="28" rx="2" />
      <g transform="translate(74 72)">${dual}</g>
    </svg>`;
  }
  return `<svg class="hw-spare-svg" viewBox="0 0 148 86" aria-hidden="true">
    <rect class="hw-spare-shell" x="34" y="6" width="80" height="58" rx="5" />
    <path class="hw-spare-fin" d="M42 12 V58 M50 10 V60 M58 10 V60 M66 10 V60 M74 10 V60 M82 10 V60 M90 10 V60 M98 12 V58" />
    <circle class="hw-spare-fan" cx="74" cy="35" r="18" />
    <circle class="hw-spare-hub" cx="74" cy="35" r="5" />
    <path class="hw-spare-blade" d="M74 35 L74 21 A14 14 0 0 1 85 25 Z M74 35 L88 35 A14 14 0 0 1 84 46 Z M74 35 L74 49 A14 14 0 0 1 63 45 Z M74 35 L60 35 A14 14 0 0 1 64 24 Z" />
    <rect class="hw-spare-plate" x="36" y="66" width="76" height="16" rx="3" />
    <g transform="translate(74 73)">${dual}</g>
  </svg>`;
}

function hwSpareButton(spare, selected) {
  const family = hwSpareFamily(spare);
  const kind = escapeHtml((spare.kind || "part").toLowerCase());
  return `<button type="button" class="hw-spare hw-spare-${family} ${selected ? "is-selected" : ""}"
    data-hw-action="select-spare" data-spare="${escapeHtml(spare.id)}" data-match="${escapeHtml(spare.match || "")}"
    data-family="${family}"
    title="Must match the ${kind} label on the bay" aria-label="${escapeHtml(spare.name)}">
    ${hwSpareArt(spare)}
  </button>`;
}

/**
 * Spare-parts rack beside the device window.
 * Stays pinned while you switch to Hands / Screwdriver so the shelf does not
 * jump away mid-job; Put down or Close rack dismisses it. If it is already
 * open, only the selection highlight updates — never tear it down (that reset
 * scroll and replayed the slide-in animation on every click).
 */
let spareRackPinned = false;

function mountSpareMenu(hw, svc, run) {
  const stage = document.querySelector("#console-overlay .console-stage");
  const existing = document.getElementById("hw-spares-menu");
  if (svc?.tool === "spares") spareRackPinned = true;
  if (!svc?.tool) spareRackPinned = false;
  const wantOpen = Boolean(stage) && (svc?.tool === "spares" || spareRackPinned);
  if (stage) stage.classList.toggle("is-spares-open", wantOpen);
  if (!wantOpen) {
    existing?.remove();
    return null;
  }

  if (existing) {
    const rack = existing.querySelector(".hw-spares");
    const rackScroll = rack ? rack.scrollTop : 0;
    existing.querySelectorAll(".hw-spare[data-spare]").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.getAttribute("data-spare") === svc.holding);
    });
    const headBtn = existing.querySelector(".hw-spares-head .hw-tool");
    if (headBtn) {
      if (svc.holding) {
        headBtn.setAttribute("data-hw-action", "select-spare");
        headBtn.setAttribute("data-spare", "");
        headBtn.removeAttribute("data-tool");
        headBtn.textContent = "Put back";
      } else {
        headBtn.setAttribute("data-hw-action", "close-spares");
        headBtn.removeAttribute("data-tool");
        headBtn.removeAttribute("data-spare");
        headBtn.textContent = "Close rack";
      }
    }
    if (rack) rack.scrollTop = rackScroll;
    const pane = document.getElementById("pane-hardware");
    if (pane) wireSpareDrag(pane, hw.spares || [], run);
    return existing;
  }

  if (svc.tool !== "spares") {
    // Pinned but never built (should not happen) — only open via Spare parts.
    spareRackPinned = false;
    stage?.classList.remove("is-spares-open");
    return null;
  }

  const groups = [];
  const seen = new Map();
  for (const s of hw.spares || []) {
    if (!seen.has(s.kind)) {
      seen.set(s.kind, []);
      groups.push([s.kind, seen.get(s.kind)]);
    }
    seen.get(s.kind).push(s);
  }

  const menu = document.createElement("aside");
  menu.id = "hw-spares-menu";
  menu.className = "hw-spares-menu";
  menu.setAttribute("role", "complementary");
  menu.setAttribute("aria-label", "Spare parts rack");
  menu.innerHTML = `
    <header class="hw-spares-head">
      <div>
        <strong>Spare parts</strong>
        <p class="hw-spares-hint">Drag a matching size onto an empty bay</p>
      </div>
      ${
        svc.holding
          ? `<button type="button" class="hw-tool is-putdown" data-hw-action="select-spare" data-spare="">Put back</button>`
          : `<button type="button" class="hw-tool is-putdown" data-hw-action="close-spares">Close rack</button>`
      }
    </header>
    <div class="hw-spares" role="list">
      ${groups
        .map(
          ([kind, items]) =>
            `<section class="hw-spares-group">
              <h3 class="hw-spares-kind">${escapeHtml(kind)}</h3>
              <div class="hw-spares-row">${items.map((s) => hwSpareButton(s, svc.holding === s.id)).join("")}</div>
            </section>`
        )
        .join("")}
    </div>`;

  menu.addEventListener("click", (evt) => {
    const el = evt.target.closest("[data-hw-action]");
    if (!el || !menu.contains(el)) return;
    evt.preventDefault();
    evt.stopPropagation();
    const action = el.getAttribute("data-hw-action");
    if (action === "close-spares") {
      spareRackPinned = false;
      const liveTool = document
        .querySelector("#pane-hardware .hw-tray .hw-tool.is-selected[data-tool]")
        ?.getAttribute("data-tool");
      if (liveTool === "spares") run("select-tool", { tool: null });
      else {
        menu.remove();
        stage?.classList.remove("is-spares-open");
      }
      return;
    }
    if (action === "select-spare") run("select-spare", { spare: el.getAttribute("data-spare") || null });
    else if (action === "select-tool") run("select-tool", { tool: el.getAttribute("data-tool") || null });
  });

  stage.appendChild(menu);
  const pane = document.getElementById("pane-hardware");
  if (pane) wireSpareDrag(pane, hw.spares || [], run);
  return menu;
}

/**
 * Spare parts come off the rack by hand. Grab one and drop it on an empty bay
 * that it fits — and that matches the capacity the bay expects.
 */
function wireSpareDrag(pane, spares, run) {
  const rack = document.querySelector("#hw-spares-menu .hw-spares") || pane.querySelector(".hw-spares");
  if (!rack) return;
  const byId = {};
  (spares || []).forEach((s) => {
    byId[s.id] = s;
  });

  let ghost = null;
  let spareId = null;
  let from = null;
  let moved = false;
  let sourceBtn = null;

  const clearHints = () => {
    pane.querySelectorAll(".hw-part.is-drop-ok, .hw-part.is-drop-no").forEach((g) => {
      g.classList.remove("is-drop-ok", "is-drop-no");
    });
  };

  const spareOkForBay = (spare, bayEl) => {
    if (!spare || !bayEl) return false;
    const part = bayEl.getAttribute("data-part");
    if (!(spare.fits || []).includes(part)) return false;
    const need = bayEl.getAttribute("data-match");
    if (need && spare.match && spare.match !== need) return false;
    return true;
  };

  const markBays = (id) => {
    const spare = byId[id];
    clearHints();
    if (!spare) return;
    pane.querySelectorAll(".hw-part[data-bay]").forEach((g) => {
      g.classList.add(spareOkForBay(spare, g) ? "is-drop-ok" : "is-drop-no");
    });
  };

  const bayUnder = (x, y, spare) => {
    // Geometry, not paint order: the cooler sits on top of the processor, so
    // elementsFromPoint would always prefer the fan bay for anything dropped
    // in that corner.
    const candidates = [];
    pane.querySelectorAll(".hw-part[data-bay]").forEach((g) => {
      const hit = g.querySelector(".hw-hit") || g;
      const r = hit.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
      candidates.push({
        g,
        area: Math.max(1, r.width * r.height)
      });
    });
    if (!candidates.length) return null;
    const matched = spare
      ? candidates.filter(({ g }) => spareOkForBay(spare, g))
      : [];
    const pool = matched.length ? matched : candidates;
    pool.sort((a, b) => a.area - b.area);
    return pool[0].g.getAttribute("data-part");
  };

  const placeGhost = (x, y) => {
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  };

  const endGhost = () => {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    sourceBtn?.classList.remove("is-dragging");
    sourceBtn = null;
    clearHints();
    spareId = null;
    from = null;
    moved = false;
  };

  rack.querySelectorAll(".hw-spare[data-spare]").forEach((btn) => {
    if (!btn.getAttribute("data-spare") || btn.dataset.hwSpareBound) return;
    btn.dataset.hwSpareBound = "1";

    const onMove = (evt) => {
      if (!from) return;
      const dx = evt.clientX - from.x;
      const dy = evt.clientY - from.y;
      if (!moved && Math.hypot(dx, dy) > 2) {
        moved = true;
        markBays(spareId);
        sourceBtn?.classList.add("is-dragging");
        ghost = document.createElement("div");
        ghost.className = "hw-spare-ghost hw-spare-ghost-part";
        const fam = btn.getAttribute("data-family") || "";
        if (fam) ghost.classList.add("hw-spare-" + fam);
        const art = btn.querySelector(".hw-spare-svg");
        if (art) ghost.appendChild(art.cloneNode(true));
        else ghost.textContent = btn.getAttribute("aria-label") || btn.textContent;
        document.body.appendChild(ghost);
      }
      if (!ghost) return;
      evt.preventDefault();
      placeGhost(evt.clientX, evt.clientY);
      const spare = byId[spareId];
      const over = bayUnder(evt.clientX, evt.clientY, spare);
      const bayEl = over ? pane.querySelector(`.hw-part[data-part="${over}"][data-bay]`) : null;
      const ok = Boolean(over && spareOkForBay(spare, bayEl));
      ghost.classList.toggle("is-ok", ok);
      ghost.classList.toggle("is-no", Boolean(over && spare && !ok));
    };

    const onUp = (evt) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        btn.releasePointerCapture?.(evt.pointerId);
      } catch {
        /* ignore */
      }
      if (!from) return;
      const wasDrag = moved;
      const id = spareId;
      const spare = byId[id];
      const over = wasDrag ? bayUnder(evt.clientX, evt.clientY, spare) : null;
      endGhost();
      if (!wasDrag) return; // a plain click still picks the spare via onclick
      hwDragEndedAt = Date.now();
      if (!over) return;
      const bayEl = pane.querySelector(`.hw-part[data-part="${CSS.escape(over)}"][data-bay]`);
      if (!spareOkForBay(spare, bayEl)) return;
      const bay = pane.querySelector(`.hw-part[data-part="${CSS.escape(over)}"]`);
      bay?.classList.add("is-drop-flash");
      window.setTimeout(() => bay?.classList.remove("is-drop-flash"), 450);
      run("fit", { component: over, spare: id }, over);
    };

    btn.addEventListener("pointerdown", (evt) => {
      if (evt.pointerType === "mouse" && evt.button !== 0) return;
      const id = btn.getAttribute("data-spare");
      if (!id) return;
      evt.preventDefault();
      // Dragging a spare implies the rack tool — keep Hands/Screwdriver from blocking the fit.
      run("select-tool", { tool: "spares" });
      run("select-spare", { spare: id });
      spareId = id;
      sourceBtn = btn;
      from = { x: evt.clientX, y: evt.clientY };
      moved = false;
      try {
        btn.setPointerCapture?.(evt.pointerId);
      } catch {
        /* ignore */
      }
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  });
}

/** One lead. Dragging it in or out is the main way; clicking it also works. */
function hwCable(componentId, cableId, byId, view) {
  const c = byId[componentId];
  if (!c) return "";
  const cable = (c.cables || []).find((x) => x.id === cableId);
  const art = (HW_CABLE_ART[view] || {})[componentId + ":" + cableId];
  if (!cable || !art) return "";
  const out = cable.state === "out";
  const d = out ? art.out : art.in;
  const plugBox = out ? art.plugOut : art.socket;
  const action = out ? "plug" : "unplug";
  const verb = out ? "Plug in" : "Unplug";
  const rect = (cls, box, extra) =>
    box
      ? `<rect class="${cls}" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" rx="3"${extra || ""} />`
      : "";
  // The socket is always drawn behind the plug. While the lead is home the plug
  // covers it exactly; pull the lead and the empty hole is revealed underneath,
  // which is the target to aim back at.
  const hide = out && c.present === false;
  const socket = hide ? "" : rect("hw-socket-open", art.socket);
  const grab = plugBox
    ? rect("hw-plug-pad", [
        hwBoxCentre(plugBox).x - 15,
        hwBoxCentre(plugBox).y - 15,
        30,
        30
      ])
    : "";
  return `
    <g class="hw-cable is-${cable.state}" data-hw-action="${action}"
       data-component="${escapeHtml(componentId)}" data-cable="${escapeHtml(cableId)}"
       role="button" tabindex="0"
       aria-label="${escapeHtml(verb + " " + art.label.toLowerCase() + " — drag it, or press Enter")}">
      ${socket}
      <path class="hw-cable-hit" d="${d}" />
      <path class="hw-cable-line" d="${d}" />
      ${hide ? "" : rect("hw-plug", plugBox)}
      ${hide ? "" : grab}
    </g>`;
}

/** A panel screw: a real head while it is in, an empty threaded hole once out. */
function hwScrew(cx, cy, r, action, component, index, label) {
  const attrs =
    (component ? ` data-component="${escapeHtml(component)}"` : "") +
    (index == null ? "" : ` data-screw="${index}"`);
  return `
    <g class="hw-screw is-in" data-hw-action="${action}"${attrs} role="button" tabindex="0"
       aria-label="${escapeHtml(label)}">
      <circle class="hw-screw-head" cx="${cx}" cy="${cy}" r="${r}" />
      <path class="hw-screw-slot" d="M${cx - r * 0.6} ${cy} H${cx + r * 0.6} M${cx} ${cy - r * 0.6} V${cy + r * 0.6}" />
    </g>`;
}

/** An empty threaded hole — clickable so you can put that exact screw back. */
function hwScrewHole(cx, cy, r, action, component, index, label) {
  if (!action) return `<circle class="hw-screw-hole" cx="${cx}" cy="${cy}" r="${r * 0.72}" />`;
  const attrs =
    (component ? ` data-component="${escapeHtml(component)}"` : "") +
    (index == null ? "" : ` data-screw="${index}"`);
  return `
    <g class="hw-screw is-out" data-hw-action="${action}"${attrs} role="button" tabindex="0"
       aria-label="${escapeHtml(label || "Empty screw hole")}">
      <circle class="hw-screw-hole" cx="${cx}" cy="${cy}" r="${r * 0.72}" />
      <circle class="hw-screw-hit" cx="${cx}" cy="${cy}" r="${r * 1.35}" />
    </g>`;
}

/**
 * Each mounting hole keeps its own state. Clicking the top screw removes the
 * top screw — not whichever one the count would have dropped next.
 */
function hwScrewColumn(points, mask, r, outAction, inAction, component, label) {
  const bits = Array.isArray(mask) ? mask : points.map((_, i) => i < Number(mask) || 0);
  return points
    .map(([cx, cy], i) =>
      bits[i]
        ? hwScrew(cx, cy, r, outAction, component, i, label)
        : hwScrewHole(cx, cy, r, inAction, component, i, "Empty " + (label || "screw hole").toLowerCase())
    )
    .join("");
}

/** Shared lighting / depth for the tower diagrams (matches the printer bench look). */
function hwSvgDefs() {
  return `
    <defs>
      <linearGradient id="hwShell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1c3648"/>
        <stop offset="45%" stop-color="#132735"/>
        <stop offset="100%" stop-color="#0a1822"/>
      </linearGradient>
      <linearGradient id="hwPanelFace" x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0%" stop-color="#1a3344"/>
        <stop offset="55%" stop-color="#122836"/>
        <stop offset="100%" stop-color="#0d1e2a"/>
      </linearGradient>
      <linearGradient id="hwSide" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#152838"/>
        <stop offset="100%" stop-color="#08141c"/>
      </linearGradient>
      <linearGradient id="hwTop" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#243b4c"/>
        <stop offset="50%" stop-color="#2f4d61"/>
        <stop offset="100%" stop-color="#1a3040"/>
      </linearGradient>
      <linearGradient id="hwBoardGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#145044"/>
        <stop offset="50%" stop-color="#0e3a32"/>
        <stop offset="100%" stop-color="#0a2a24"/>
      </linearGradient>
      <linearGradient id="hwIoGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#1a2c38"/>
        <stop offset="100%" stop-color="#0a151d"/>
      </linearGradient>
      <filter id="hwShadow" x="-6%" y="-6%" width="112%" height="118%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#02080c" flood-opacity="0.55"/>
      </filter>
      <filter id="hwSoft" x="-4%" y="-4%" width="108%" height="112%">
        <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#02080c" flood-opacity="0.35"/>
      </filter>
    </defs>`;
}

/** The case as it sits on the desk: panel on, screws down the rear edge. */
function hwDiagramClosed(byId, svc) {
  const live = svc.powered ? " is-live" : "";
  const panelMask =
    Array.isArray(svc.screwIn) && svc.screwIn.length
      ? svc.screwIn
      : [0, 1, 2, 3].map((i) => i < (Number(svc.screws) || 0));
  const panelScrews = hwScrewColumn(
    [
      [726, 150],
      [726, 210],
      [726, 270],
      [726, 330]
    ],
    panelMask,
    9,
    "unscrew",
    "screw",
    null,
    "Side panel screw"
  );

  // Louvres over the vent, so the fan is glimpsed rather than drawn in full.
  const louvres = [-36, -24, -12, 0, 12, 24, 36]
    .map((dy) => `<path class="hw-louvre" d="M368 ${210 + dy} H472" />`)
    .join("");

  return `
  <div class="hw-figure is-closed is-3d">
    <svg viewBox="0 0 800 420" class="hw-svg" role="group" aria-label="PC case, side panel on">
      ${hwSvgDefs()}

      <!-- Desk shadow -->
      <ellipse class="hw-desk-shadow" cx="430" cy="392" rx="250" ry="16"/>

      <!-- Right depth / rear cheek -->
      <path class="hw-case-depth" d="M694 42 L748 68 L748 372 L694 356 Z" filter="url(#hwShadow)"/>

      <!-- Main chassis -->
      <rect class="hw-case" x="196" y="42" width="498" height="314" rx="14" fill="url(#hwShell)" filter="url(#hwShadow)"/>
      <!-- Top deck -->
      <path class="hw-case-top" d="M210 42 H680 L734 68 H196 Z" fill="url(#hwTop)"/>
      <!-- Side panel face -->
      <rect class="hw-panel" x="214" y="58" width="466" height="282" rx="10" fill="url(#hwPanelFace)"/>
      <rect class="hw-panel-inset" x="226" y="70" width="442" height="258" rx="8"/>
      <!-- Front bezel strip -->
      <rect class="hw-front-bezel" x="196" y="58" width="22" height="282" rx="4"/>
      <circle class="hw-power-btn" cx="207" cy="300" r="7"/>
      <circle class="hw-led ${svc.powered ? "is-on" : ""}" cx="207" cy="322" r="4"/>
      <text class="hw-label hw-led-label" x="232" y="326" text-anchor="start">Power</text>

      <!-- Brand plate -->
      <text class="hw-brand" x="250" y="96">CCST</text>
      <text class="hw-brand-sub" x="250" y="110">Tower</text>

      <g class="hw-vent">
        <circle class="hw-vent-well" cx="420" cy="210" r="58"/>
        <g class="hw-vent-fan${svc.powered ? " is-spinning" : ""}">
          <circle class="hw-vent-hub" cx="420" cy="210" r="12"/>
          <path class="hw-vent-blade" d="M420 210 L420 164 A46 46 0 0 1 452 177 Z"/>
          <path class="hw-vent-blade" d="M420 210 L466 210 A46 46 0 0 1 453 242 Z"/>
          <path class="hw-vent-blade" d="M420 210 L420 256 A46 46 0 0 1 388 243 Z"/>
          <path class="hw-vent-blade" d="M420 210 L374 210 A46 46 0 0 1 387 178 Z"/>
        </g>
        ${louvres}
        <circle class="hw-vent-ring" cx="420" cy="210" r="58"/>
      </g>

      <!-- Feet -->
      <rect class="hw-foot" x="220" y="356" width="40" height="8" rx="2"/>
      <rect class="hw-foot" x="620" y="356" width="40" height="8" rx="2"/>
      <rect class="hw-foot" x="720" y="372" width="28" height="8" rx="2"/>

      <text class="hw-caption" x="450" y="408">side panel on — power off, undo the rear screws, then remove the panel</text>

      ${hwPartNeutral(
        "display",
        byId,
        `<path class="hw-mon-depth" d="M110 60 L124 70 L124 138 L110 128 Z"/>
         <rect class="hw-body" x="18" y="54" width="98" height="68" rx="6"/>
         <rect class="hw-screen" x="26" y="62" width="82" height="52" rx="3"/>
         <rect class="hw-detail" x="57" y="122" width="20" height="10"/>
         <rect class="hw-detail" x="42" y="132" width="50" height="7" rx="3"/>
         <text class="hw-label" x="66" y="158">Display cable</text>`,
        [12, 48, 196, 118],
        0
      )}

      ${hwPartNeutral(
        "input",
        byId,
        `<rect class="hw-body" x="18" y="272" width="112" height="42" rx="5"/>
         <rect class="hw-key" x="26" y="280" width="96" height="10" rx="2"/>
         <rect class="hw-key" x="26" y="294" width="66" height="10" rx="2"/>
         <ellipse class="hw-body" cx="112" cy="342" rx="14" ry="19"/>
         <ellipse class="hw-mouse-depth" cx="118" cy="348" rx="10" ry="14"/>
         <text class="hw-label" x="70" y="378">Keyboard and mouse</text>`,
        [12, 182, 196, 184],
        1
      )}

      ${hwPartNeutral(
        "nic",
        byId,
        `<rect class="hw-body" x="560" y="84" width="46" height="30" rx="3"/>
         <path class="hw-port-notch" d="M574 84 h18 v7 h-18 Z"/>
         <circle class="hw-port-led" cx="566" cy="120" r="3"/>
         <circle class="hw-port-led" cx="600" cy="120" r="3"/>
         <text class="hw-label" x="583" y="138">Network port</text>`,
        [552, 76, 62, 52],
        2
      )}

      ${hwPartNeutral(
        "psu",
        byId,
        `<rect class="hw-detail" x="640" y="84" width="40" height="34" rx="3"/>
         <path class="hw-psu-pin" d="M650 94 V108 M660 94 V108 M670 94 V108"/>
         <text class="hw-label" x="646" y="142" text-anchor="start">Power cable</text>`,
        [630, 72, 100, 58],
        3
      )}

      <g class="hw-cables${live}">
        ${hwCable("psu", "mains", byId, "closed")}
        ${hwCable("display", "video", byId, "closed")}
        ${hwCable("input", "usb", byId, "closed")}
      </g>

      ${panelScrews}
    </svg>
    <p class="hw-legend-note">Rear leads and ports can be worked with the panel on — drag a lead out of its socket, or drag it back on until the socket lights up. Anything inside needs the case open.</p>
  </div>`;
}

/** Inside the case. Mounting screws are drawn where a real tower has them. */
function hwDiagramOpen(byId) {
  const screwsFor = (id, points, label) => {
    const c = byId[id];
    if (!c || !c.screwsTotal) return "";
    const mask =
      Array.isArray(c.screwIn) && c.screwIn.length === c.screwsTotal
        ? c.screwIn
        : points.map((_, i) => i < (Number(c.screws) || 0));
    return hwScrewColumn(points, mask, 6, "unscrew-part", "screw-part", id, label);
  };

  return `
  <div class="hw-figure is-open is-3d">
    <svg viewBox="0 0 800 420" class="hw-svg" role="group" aria-label="Inside the PC">
      ${hwSvgDefs()}

      <ellipse class="hw-desk-shadow" cx="430" cy="400" rx="260" ry="14"/>

      <!-- Chassis depth -->
      <path class="hw-case-depth" d="M728 36 L772 58 L772 372 L728 358 Z" filter="url(#hwShadow)"/>
      <rect class="hw-case" x="140" y="28" width="588" height="330" rx="14" fill="url(#hwShell)" filter="url(#hwShadow)"/>
      <path class="hw-case-top" d="M154 28 H714 L758 58 H140 Z" fill="url(#hwTop)"/>
      <!-- Inner bay floor -->
      <rect class="hw-bay" x="156" y="48" width="556" height="292" rx="8"/>
      <rect class="hw-board" x="196" y="56" width="330" height="276" rx="8" fill="url(#hwBoardGrad)" filter="url(#hwSoft)"/>
      <!-- Trace accents on the board -->
      <g class="hw-traces" aria-hidden="true">
        <path d="M220 90 H360 M360 90 V140 M240 200 H340 M280 220 V300"/>
        <path d="M400 80 V180 H460 M420 220 H500"/>
      </g>
      <rect class="hw-io" x="148" y="52" width="34" height="182" rx="5" fill="url(#hwIoGrad)"/>
      <text class="hw-caption" x="450" y="408">side panel off — drag its leads out, undo its screws, then lift the part out</text>

      ${hwPartNeutral(
        "psu",
        byId,
        `<path class="hw-part-depth" d="M708 52 L728 64 L728 168 L708 158 Z"/>
         <rect class="hw-body hw-psu-shell" x="560" y="52" width="160" height="120" rx="8"/>
         <rect class="hw-psu-face" x="568" y="60" width="144" height="104" rx="5"/>
         <circle class="hw-psu-fan" cx="612" cy="112" r="32"/>
         <circle class="hw-psu-hub" cx="612" cy="112" r="10"/>
         <path class="hw-psu-blade" d="M612 112 L612 86 A26 26 0 0 1 632 94 Z M612 112 L638 112 A26 26 0 0 1 630 132 Z M612 112 L612 138 A26 26 0 0 1 592 130 Z M612 112 L586 112 A26 26 0 0 1 594 92 Z"/>
         <path class="hw-psu-vent" d="M656 68 h44 M656 78 h44 M656 88 h44 M656 98 h44"/>
         <rect class="hw-psu-plate" x="652" y="108" width="52" height="40" rx="3"/>
         <text class="hw-label" x="640" y="190">Power supply</text>`,
        [552, 46, 176, 140],
        0
      )}

      <!-- Processor on the board — cooler mounts over it and lifts away to reveal it. -->
      ${hwPartNeutral(
        "cpu",
        byId,
        `<rect class="hw-cpu-socket" x="244" y="100" width="74" height="74" rx="5"/>
         <rect class="hw-cpu-pad" x="250" y="106" width="62" height="62" rx="3"/>
         <rect class="hw-cpu hw-body" x="254" y="110" width="54" height="54" rx="3"/>
         <rect class="hw-cpu-lid" x="262" y="118" width="38" height="38" rx="2"/>
         <text class="hw-cpu-mark" x="281" y="136" text-anchor="middle">CPU</text>
         <path class="hw-cpu-pins" d="M258 116 h3 v3 h-3 z M268 116 h3 v3 h-3 z M278 116 h3 v3 h-3 z M288 116 h3 v3 h-3 z M298 116 h3 v3 h-3 z
           M258 156 h3 v3 h-3 z M268 156 h3 v3 h-3 z M278 156 h3 v3 h-3 z M288 156 h3 v3 h-3 z M298 156 h3 v3 h-3 z
           M256 126 h3 v3 h-3 z M256 136 h3 v3 h-3 z M256 146 h3 v3 h-3 z
           M300 126 h3 v3 h-3 z M300 136 h3 v3 h-3 z M300 146 h3 v3 h-3 z"/>
         <path class="hw-clip" d="M246 102 h14 M300 102 h14 M246 172 h14 M300 172 h14"/>
         <text class="hw-label hw-cpu-label" x="281" y="194">Processor</text>`,
        [238, 94, 86, 108],
        1
      )}

      ${hwPartNeutral(
        "fan",
        byId,
        `<g class="hw-cooler-assy">
           <rect class="hw-coldplate" x="248" y="104" width="66" height="66" rx="3"/>
           <g class="hw-fins" aria-hidden="true">
             <path class="hw-fin" d="M236 92 V182 M245 90 V184 M254 88 V186 M263 88 V186 M272 88 V186 M281 88 V186 M290 88 V186 M299 88 V186 M308 88 V186 M317 90 V184 M326 92 V182"/>
           </g>
           <rect class="hw-heatsink" x="230" y="86" width="102" height="102" rx="5"/>
           <circle class="hw-body" cx="281" cy="137" r="40"/>
           <circle class="hw-detail" cx="281" cy="137" r="11"/>
           <g class="hw-fan-blades">
             <path class="hw-blade" d="M281 137 L281 101 A36 36 0 0 1 307 110 Z"/>
             <path class="hw-blade" d="M281 137 L317 137 A36 36 0 0 1 308 163 Z"/>
             <path class="hw-blade" d="M281 137 L281 173 A36 36 0 0 1 255 164 Z"/>
             <path class="hw-blade" d="M281 137 L245 137 A36 36 0 0 1 254 111 Z"/>
           </g>
           <text class="hw-label hw-cooler-label" x="281" y="210">CPU fan</text>
         </g>
         <g class="hw-cooler-mounts" aria-hidden="true">
           <circle class="hw-mount" cx="236" cy="92" r="5"/>
           <circle class="hw-mount" cx="326" cy="92" r="5"/>
           <circle class="hw-mount" cx="236" cy="182" r="5"/>
           <circle class="hw-mount" cx="326" cy="182" r="5"/>
         </g>`,
        [220, 76, 122, 122],
        2
      )}

      <text class="hw-group-label" x="406" y="66">Memory</text>
      ${hwPartNeutral(
        "ram1",
        byId,
        `<rect class="hw-slot" x="372" y="72" width="28" height="148" rx="4"/>
         <rect class="hw-body hw-ram-stick" x="375" y="76" width="22" height="140" rx="3"/>
         <rect class="hw-ram-chip" x="378" y="84" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="378" y="104" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="378" y="124" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="378" y="144" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="378" y="164" width="16" height="14" rx="1.5"/>
         <path class="hw-clip" d="M375 72 h22 M375 220 h22"/>
         <text class="hw-label" x="386" y="236">A</text>`,
        [368, 68, 36, 156],
        3
      )}
      ${hwPartNeutral(
        "ram2",
        byId,
        `<rect class="hw-slot" x="412" y="72" width="28" height="148" rx="4"/>
         <rect class="hw-body hw-ram-stick" x="415" y="76" width="22" height="140" rx="3"/>
         <rect class="hw-ram-chip" x="418" y="84" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="418" y="104" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="418" y="124" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="418" y="144" width="16" height="14" rx="1.5"/>
         <rect class="hw-ram-chip" x="418" y="164" width="16" height="14" rx="1.5"/>
         <path class="hw-clip" d="M415 72 h22 M415 220 h22"/>
         <text class="hw-label" x="426" y="236">B</text>`,
        [408, 68, 36, 156],
        4
      )}

      ${hwPartNeutral(
        "gpu",
        byId,
        `<rect class="hw-slot" x="212" y="278" width="264" height="11" rx="3"/>
         <path class="hw-part-depth" d="M464 234 L476 242 L476 274 L464 268 Z"/>
         <rect class="hw-body hw-gpu-shell" x="212" y="238" width="264" height="40" rx="4"/>
         <circle class="hw-gpu-fan" cx="248" cy="258" r="14"/>
         <circle class="hw-gpu-hub" cx="248" cy="258" r="4.5"/>
         <path class="hw-gpu-blade" d="M248 258 L248 246 A12 12 0 0 1 257 249 Z M248 258 L260 258 A12 12 0 0 1 257 267 Z M248 258 L248 270 A12 12 0 0 1 239 267 Z M248 258 L236 258 A12 12 0 0 1 239 249 Z"/>
         <circle class="hw-gpu-fan" cx="286" cy="258" r="14"/>
         <circle class="hw-gpu-hub" cx="286" cy="258" r="4.5"/>
         <path class="hw-gpu-blade" d="M286 258 L286 246 A12 12 0 0 1 295 249 Z M286 258 L298 258 A12 12 0 0 1 295 267 Z M286 258 L286 270 A12 12 0 0 1 277 267 Z M286 258 L274 258 A12 12 0 0 1 277 249 Z"/>
         <rect class="hw-gpu-block" x="312" y="246" width="52" height="24" rx="3"/>
         <rect class="hw-gpu-port" x="448" y="246" width="18" height="24" rx="2"/>
         <rect class="hw-bracket" x="188" y="234" width="14" height="48" rx="3"/>
         <text class="hw-label" x="380" y="264">Graphics card</text>`,
        [206, 230, 276, 62],
        5
      )}

      ${hwPartNeutral(
        "nic",
        byId,
        `<rect class="hw-slot" x="212" y="334" width="264" height="11" rx="3"/>
         <path class="hw-part-depth" d="M464 296 L476 304 L476 334 L464 328 Z"/>
         <rect class="hw-body hw-nic-shell" x="212" y="300" width="264" height="38" rx="4"/>
         <rect class="hw-nic-chip" x="222" y="308" width="28" height="22" rx="2"/>
         <rect class="hw-nic-chip" x="258" y="312" width="36" height="14" rx="2"/>
         <path class="hw-nic-trace" d="M300 319 H 430"/>
         <rect class="hw-nic-port" x="448" y="308" width="18" height="22" rx="2"/>
         <rect class="hw-bracket" x="188" y="296" width="14" height="46" rx="3"/>
         <text class="hw-label" x="360" y="324">Network card</text>`,
        [206, 294, 276, 58],
        6
      )}

      ${hwPartNeutral(
        "disk",
        byId,
        `<path class="hw-part-depth" d="M708 218 L728 230 L728 312 L708 302 Z"/>
         <rect class="hw-body hw-disk-shell" x="560" y="218" width="160" height="98" rx="6"/>
         <circle class="hw-disk-platter" cx="612" cy="267" r="28"/>
         <circle class="hw-disk-hub" cx="612" cy="267" r="8"/>
         <path class="hw-disk-arm" d="M640 254 L 668 242 L 672 248 L 646 262 Z"/>
         <rect class="hw-disk-plate" x="656" y="256" width="52" height="36" rx="3"/>
         <text class="hw-label" x="640" y="336">Storage drive</text>`,
        [552, 212, 176, 132],
        7
      )}

      ${hwPartNeutral(
        "display",
        byId,
        `<path class="hw-mon-depth" d="M110 60 L124 70 L124 138 L110 128 Z"/>
         <rect class="hw-body" x="18" y="54" width="98" height="68" rx="6"/>
         <rect class="hw-screen" x="26" y="62" width="82" height="52" rx="3"/>
         <text class="hw-label" x="66" y="158">Display cable</text>`,
        [12, 48, 172, 118],
        8
      )}

      ${hwPartNeutral(
        "input",
        byId,
        `<rect class="hw-body" x="18" y="252" width="112" height="42" rx="5"/>
         <rect class="hw-key" x="26" y="260" width="96" height="10" rx="2"/>
         <ellipse class="hw-body" cx="110" cy="320" rx="14" ry="19"/>
         <text class="hw-label" x="66" y="356">Keyboard and mouse</text>`,
        [12, 246, 172, 100],
        9
      )}

      <g class="hw-cables">
        ${hwCable("psu", "mains", byId, "open")}
        ${hwCable("gpu", "power", byId, "open")}
        ${hwCable("psu", "atx", byId, "open")}
        ${hwCable("psu", "aux", byId, "open")}
        ${hwCable("disk", "data", byId, "open")}
        ${hwCable("disk", "power", byId, "open")}
        ${hwCable("fan", "header", byId, "open")}
        ${hwCable("display", "video", byId, "open")}
        ${hwCable("input", "usb", byId, "open")}
      </g>

      <g class="hw-part-screws">
        ${screwsFor(
          "psu",
          [
            [574, 66],
            [706, 66],
            [574, 158],
            [706, 158]
          ],
          "Power supply mounting screw"
        )}
        ${screwsFor(
          "disk",
          [
            [574, 232],
            [706, 232],
            [574, 302],
            [706, 302]
          ],
          "Drive cage screw"
        )}
        ${screwsFor("gpu", [[195, 228]], "Graphics card bracket screw")}
        ${screwsFor("nic", [[195, 290]], "Card bracket screw")}
        ${screwsFor(
          "fan",
          [
            [236, 92],
            [326, 92],
            [236, 182],
            [326, 182]
          ],
          "Fan mounting screw"
        )}
      </g>
    </svg>
    <p class="hw-legend-note">Drag leads in and out by hand. Memory and the processor are held by clips; the fan, drive, cards and power supply are screwed down. Lift the cooler before you can work on the CPU.</p>
  </div>`;
}

export { hwDiagramClosed, hwDiagramOpen, mountSpareMenu, wireCableDrag, wireSpareDrag, hwScrew, hwScrewHole, hwCable };
