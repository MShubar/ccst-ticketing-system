/**
 * Hardware bench catalog: parts, tools, spares, and ticket fault ids.
 */
/**
 * PC hardware for the Lab map.
 *
 * A desk PC is modelled physically, not as a list of booleans. Every part is
 * held in by what really holds it — screws, clips, or nothing — and every lead
 * that plugs into it has its own state: firmly home, hanging loose, or out.
 *
 * Nothing is fixed by pressing one button. A dead drive comes out the way it
 * would on a bench: power down, side panel off, unplug its data and power
 * leads, undo the cage screws, slide it out, fit the spare, screws back in,
 * leads back on, panel on, power up. The simulator refuses anything you could
 * not physically do in that order, and the console only answers again once the
 * machine is genuinely back together.
 */

const BLOCK_ORDER = ["power", "boot", "screen", "input"];
const SCREW_COUNT = 4;

/** One boolean per mounting hole — true while that screw is still in. */
function screwMask(total, inCount) {
  const n = Math.max(0, Math.min(total, Number(inCount) || 0));
  return Array.from({ length: total }, (_, i) => i < n);
}

function countScrews(mask) {
  return Array.isArray(mask) ? mask.filter(Boolean).length : 0;
}

/** Bring a screw mask in line with a known total, migrating from a plain count. */
function normalizeScrewMask(saved, total, countFallback) {
  if (Array.isArray(saved) && saved.length === total) {
    return saved.map((v) => Boolean(v));
  }
  return screwMask(total, countFallback);
}

function parseScrewIndex(body, total) {
  if (body == null || body.index == null || body.index === "") return null;
  const i = Number(body.index);
  if (!Number.isInteger(i) || i < 0 || i >= total) return null;
  return i;
}

/** Cable states, worst first. `loose` is in the socket but not seated. */
const CABLE_OUT = "out";
const CABLE_LOOSE = "loose";
const CABLE_FIRM = "firm";

const COMPONENTS = [
  { id: "psu", name: "Power supply", slot: null, access: "internal" },
  { id: "cpu", name: "Processor", slot: null, access: "internal" },
  { id: "ram1", name: "Memory — slot A", slot: "A", access: "internal" },
  { id: "ram2", name: "Memory — slot B", slot: "B", access: "internal" },
  { id: "disk", name: "Storage drive", slot: null, access: "internal" },
  { id: "gpu", name: "Graphics card", slot: null, access: "internal" },
  { id: "nic", name: "Network card", slot: null, access: "internal" },
  { id: "display", name: "Display cable", slot: null, access: "external" },
  { id: "input", name: "Keyboard and mouse", slot: null, access: "external" },
  { id: "fan", name: "CPU fan", slot: null, access: "internal" }
];

const COMPONENT_IDS = new Set(COMPONENTS.map((c) => c.id));

/**
 * How each part is actually built into the machine: what holds it, and which
 * leads plug into it. Memory has clips and no cables; a drive has four cage
 * screws and two leads; the rear cables have neither.
 */
const PART_BUILD = {
  psu: {
    screws: 4,
    clips: false,
    removable: true,
    cables: [
      { id: "mains", name: "Mains lead", where: "external" },
      { id: "atx", name: "24-pin board connector", where: "internal" },
      { id: "aux", name: "Drive power lead", where: "internal" }
    ]
  },
  disk: {
    screws: 4,
    clips: false,
    removable: true,
    cables: [
      { id: "data", name: "SATA data cable", where: "internal" },
      { id: "power", name: "SATA power lead", where: "internal" }
    ]
  },
  nic: { screws: 1, clips: false, removable: true, cables: [] },
  gpu: {
    screws: 1,
    clips: false,
    removable: true,
    cables: [{ id: "power", name: "PCIe power lead", where: "internal" }]
  },
  cpu: { screws: 0, clips: true, removable: true, cables: [] },
  fan: {
    screws: 4,
    clips: false,
    removable: true,
    cables: [{ id: "header", name: "Fan header lead", where: "internal" }]
  },
  ram1: { screws: 0, clips: true, removable: true, cables: [] },
  ram2: { screws: 0, clips: true, removable: true, cables: [] },
  display: {
    screws: 0,
    clips: false,
    removable: false,
    cables: [{ id: "video", name: "Display cable", where: "external" }]
  },
  input: {
    screws: 0,
    clips: false,
    removable: false,
    cables: [{ id: "usb", name: "Keyboard and mouse lead", where: "external" }]
  }
};

/** Screw counts on their own, kept for callers that only need the number. */
const PART_SCREWS = Object.fromEntries(
  Object.entries(PART_BUILD)
    .filter(([, b]) => b.screws > 0)
    .map(([id, b]) => [id, b.screws])
);

const TOOLS = [
  { id: "screwdriver", name: "Screwdriver", hint: "Undo case and mounting screws" },
  { id: "hands", name: "Hands", hint: "Unplug and seat leads, clips and modules" },
  { id: "spares", name: "Spare parts", hint: "Open the rack — pick the size that matches the part you removed" }
];

const TOOL_IDS = new Set(TOOLS.map((t) => t.id));

/**
 * Capacity / wattage / size options each bay can be built with. The inspect
 * label and the spare that must go back in share the same `match` key.
 */
const SPEC_OPTIONS = {
  psu: [
    { match: "psu-450", label: "450 W 80+ Bronze" },
    { match: "psu-500", label: "500 W 80+ Bronze" },
    { match: "psu-650", label: "650 W 80+ Bronze" },
    { match: "psu-750", label: "750 W 80+ Gold" }
  ],
  ram: [
    { match: "ram-8", label: "8 GB DDR4-3200" },
    { match: "ram-16", label: "16 GB DDR4-3200" },
    { match: "ram-32", label: "32 GB DDR4-3200" }
  ],
  disk: [
    { match: "disk-256", label: "256 GB SATA SSD" },
    { match: "disk-512", label: "512 GB SATA SSD" },
    { match: "disk-1t", label: "1 TB SATA SSD" },
    { match: "disk-2t", label: "2 TB SATA SSD" }
  ],
  nic: [
    { match: "nic-1g", label: "Gigabit Ethernet PCIe card" },
    { match: "nic-2.5g", label: "2.5 Gigabit Ethernet PCIe card" }
  ],
  fan: [
    { match: "fan-92", label: "92 mm CPU cooler" },
    { match: "fan-120", label: "120 mm CPU cooler" }
  ],
  cpu: [
    { match: "cpu-i5", label: "Core i5 desktop processor" },
    { match: "cpu-i7", label: "Core i7 desktop processor" },
    { match: "cpu-ryzen5", label: "Ryzen 5 desktop processor" }
  ],
  gpu: [
    { match: "gpu-1660", label: "GTX 1660 6 GB" },
    { match: "gpu-3060", label: "RTX 3060 12 GB" },
    { match: "gpu-4060", label: "RTX 4060 8 GB" }
  ]
};

/**
 * What is on the spare-parts rack. Several sizes of each kind — you cannot
 * drop a drive into the PSU cage, and a 1 TB SSD will not fix a bay that
 * needs the 512 GB model.
 */
const SPARES = [
  { id: "psu-450", match: "psu-450", name: "450 W power supply", kind: "Power supply", fits: ["psu"] },
  { id: "psu-500", match: "psu-500", name: "500 W power supply", kind: "Power supply", fits: ["psu"] },
  { id: "psu-650", match: "psu-650", name: "650 W power supply", kind: "Power supply", fits: ["psu"] },
  { id: "psu-750", match: "psu-750", name: "750 W power supply", kind: "Power supply", fits: ["psu"] },
  { id: "ram-8", match: "ram-8", name: "8 GB DDR4 module", kind: "Memory", fits: ["ram1", "ram2"] },
  { id: "ram-16", match: "ram-16", name: "16 GB DDR4 module", kind: "Memory", fits: ["ram1", "ram2"] },
  { id: "ram-32", match: "ram-32", name: "32 GB DDR4 module", kind: "Memory", fits: ["ram1", "ram2"] },
  { id: "disk-256", match: "disk-256", name: "256 GB SATA SSD", kind: "Storage drive", fits: ["disk"] },
  { id: "disk-512", match: "disk-512", name: "512 GB SATA SSD", kind: "Storage drive", fits: ["disk"] },
  { id: "disk-1t", match: "disk-1t", name: "1 TB SATA SSD", kind: "Storage drive", fits: ["disk"] },
  { id: "disk-2t", match: "disk-2t", name: "2 TB SATA SSD", kind: "Storage drive", fits: ["disk"] },
  { id: "nic-1g", match: "nic-1g", name: "Gigabit network card", kind: "Network card", fits: ["nic"] },
  { id: "nic-2.5g", match: "nic-2.5g", name: "2.5 Gigabit network card", kind: "Network card", fits: ["nic"] },
  { id: "fan-92", match: "fan-92", name: "92 mm CPU cooler", kind: "CPU fan", fits: ["fan"] },
  { id: "fan-120", match: "fan-120", name: "120 mm CPU cooler", kind: "CPU fan", fits: ["fan"] },
  { id: "cpu-i5", match: "cpu-i5", name: "Core i5 processor", kind: "Processor", fits: ["cpu"] },
  { id: "cpu-i7", match: "cpu-i7", name: "Core i7 processor", kind: "Processor", fits: ["cpu"] },
  { id: "cpu-ryzen5", match: "cpu-ryzen5", name: "Ryzen 5 processor", kind: "Processor", fits: ["cpu"] },
  { id: "gpu-1660", match: "gpu-1660", name: "GTX 1660 graphics card", kind: "Graphics card", fits: ["gpu"] },
  { id: "gpu-3060", match: "gpu-3060", name: "RTX 3060 graphics card", kind: "Graphics card", fits: ["gpu"] },
  { id: "gpu-4060", match: "gpu-4060", name: "RTX 4060 graphics card", kind: "Graphics card", fits: ["gpu"] }
];
const SPARE_IDS = new Set(SPARES.map((s) => s.id));
const SPARE_MATCHES = new Set(SPARES.map((s) => s.match));

function familyKey(componentId) {
  if (componentId === "ram1" || componentId === "ram2") return "ram";
  return componentId;
}

function spareFor(id) {
  return SPARES.find((s) => s.id === id) || null;
}

function spareByMatch(match) {
  return SPARES.find((s) => s.match === match) || null;
}

function spareFits(spareId, componentId) {
  const spare = spareFor(spareId);
  return Boolean(spare && spare.fits.includes(componentId));
}

/** True when the spare seats in that bay *and* matches the capacity it expects. */
function spareMatchesBay(spareId, componentId, expectedMatch) {
  if (!spareFits(spareId, componentId)) return false;
  if (!expectedMatch) return true;
  const spare = spareFor(spareId);
  return Boolean(spare && spare.match === expectedMatch);
}

/**
 * Every fault a PC can have.
 * `kind` says how it is put right: a lead reseated, a module pushed home, a
 * part swapped, dust blown out, or a setting changed in the operating system.
 */
const FAULTS = {
  "psu-unplugged": {
    component: "psu",
    blocks: "power",
    access: "external",
    tool: "hands",
    kind: "cable",
    cable: "mains",
    cableState: CABLE_OUT,
    label: "Power cable unplugged",
    report: "My PC is completely dead — no lights, no fans, nothing on screen",
    found: "No power reaching the unit. The kettle lead has come out of the back of the case.",
    repair: "Plug the mains lead back in",
    fixed: "Mains lead seated — the PC powers up."
  },
  "psu-dead": {
    component: "psu",
    blocks: "power",
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Power supply failed",
    report: "My PC will not turn on. It clicked once and now nothing happens",
    found: "Power supply is not delivering any rail voltage. It has failed and needs replacing.",
    repair: "Fit the replacement power supply",
    fixed: "New power supply fitted — the PC powers up."
  },
  "ram-unseated": {
    component: null,
    blocks: "boot",
    access: "internal",
    tool: "hands",
    kind: "seat",
    label: "Memory module not seated",
    report: "My PC turns on and beeps at me but never gets to Windows",
    found: "Module is sitting proud of the slot — the retaining clips are not closed.",
    repair: "Push the module home",
    fixed: "Module clipped back into the slot — the PC posts and boots."
  },
  "ram-failed": {
    component: null,
    blocks: "boot",
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Memory module failed",
    report: "My PC keeps restarting itself before it gets to the login screen",
    found: "Module fails its memory test. It has to come out.",
    repair: "Fit the replacement module",
    fixed: "New module fitted — the PC posts and boots."
  },
  "disk-cable": {
    component: "disk",
    blocks: "boot",
    access: "internal",
    tool: "hands",
    kind: "cable",
    cable: "data",
    cableState: CABLE_LOOSE,
    label: "Drive cable loose",
    report: "My PC says no boot device found when I switch it on",
    found: "The drive is not detected — its data cable is half out of the board.",
    repair: "Seat the data cable properly",
    fixed: "Drive cable reseated — the drive is detected and the PC boots."
  },
  "disk-failed": {
    component: "disk",
    blocks: "boot",
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Drive failed",
    report: "My PC will not start up any more, it just sits on a black screen with an error",
    found: "Drive is failing its self test and will not read. It needs replacing and restoring.",
    repair: "Fit the replacement drive",
    fixed: "New drive fitted and imaged — the PC boots."
  },
  "nic-disabled": {
    component: "nic",
    blocks: null,
    access: "soft",
    tool: "hands",
    kind: "soft",
    label: "Network adapter disabled",
    report: "I have no internet on this PC. Everything else about it works fine",
    found: "The adapter is administratively disabled in the operating system.",
    repair: "Enable the adapter",
    fixed: "Adapter enabled — the link comes up."
  },
  "nic-failed": {
    component: "nic",
    blocks: null,
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Network card failed",
    report: "This PC cannot get on the network at all. No link light on the back",
    found: "No link light and no adapter detected. The card has failed.",
    repair: "Fit the replacement card",
    fixed: "New network card fitted — the link comes up."
  },
  "display-loose": {
    component: "display",
    blocks: "screen",
    access: "external",
    tool: "hands",
    kind: "cable",
    cable: "video",
    cableState: CABLE_LOOSE,
    label: "Display cable loose",
    report: "My monitor just says no signal, but the PC itself sounds like it is running",
    found: "The display cable has worked loose at the back of the PC.",
    repair: "Seat the display cable properly",
    fixed: "Display cable reseated — the screen comes back."
  },
  "input-unplugged": {
    component: "input",
    blocks: "input",
    access: "external",
    tool: "hands",
    kind: "cable",
    cable: "usb",
    cableState: CABLE_OUT,
    label: "Keyboard unplugged",
    report: "I can see my desktop but I cannot type anything",
    found: "No keyboard detected on any USB port. The lead is unplugged.",
    repair: "Plug the keyboard lead back in",
    fixed: "Keyboard reconnected — it types again."
  },
  "fan-clogged": {
    component: "fan",
    blocks: null,
    access: "internal",
    tool: "hands",
    kind: "clean",
    label: "CPU fan clogged",
    report: "My PC has got very loud and very hot, and it feels slower than it was",
    found: "Fan is choked with dust and the CPU is running hot enough to throttle.",
    repair: "Clear the dust from the fan and vents",
    fixed: "Fan and vents cleaned — temperature back to normal."
  },
  "cpu-failed": {
    component: "cpu",
    blocks: "boot",
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Processor failed",
    report: "My PC will not start — fans spin but there is nothing on the screen",
    found: "Processor is not responding. It has to come out and be replaced.",
    repair: "Fit the replacement processor",
    fixed: "New processor fitted — the PC posts and boots."
  },
  "gpu-unplugged": {
    component: "gpu",
    blocks: "screen",
    access: "internal",
    tool: "hands",
    kind: "cable",
    cable: "power",
    cableState: CABLE_OUT,
    label: "Graphics card power lead unplugged",
    report: "My PC turns on but the monitor stays black — the tower fans are running",
    found: "The graphics card is fitted but its PCIe power lead has come out.",
    repair: "Plug the PCIe power lead back on",
    fixed: "PCIe power seated — the display comes up."
  },
  "gpu-failed": {
    component: "gpu",
    blocks: "screen",
    access: "internal",
    tool: "spares",
    kind: "replace",
    label: "Graphics card failed",
    report: "My PC boots but the screen is full of artefacts and then goes blank",
    found: "Graphics card fails its self test. It needs replacing.",
    repair: "Fit the replacement graphics card",
    fixed: "New graphics card fitted — the display is clean again."
  }
};

const TICKET_FAULTS = [
  "psu-unplugged",
  "psu-dead",
  "ram-unseated",
  "disk-cable",
  "nic-disabled",
  "nic-failed",
  "display-loose",
  "input-unplugged",
  "fan-clogged",
  "cpu-failed",
  "gpu-unplugged",
  "gpu-failed"
];

module.exports = {
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
};
