/* ------------------------------------------------------------------ *
 * Classroom AI ticket generation
 *
 * The instructor presses one button and every student gets a personal
 * workload. Built-in templates write the words; this file decides the facts,
 * because a ticket naming a person, invoice or device that does not exist in
 * the class data is worse than no ticket at all.
 *
 * Eleven tickets per student, in five families a level-1 technician can
 * finish with the tools the app actually gives them:
 *
 *   password-reset      4  Portals → Password, find the person, reset
 *   pc-offline          2  Lab map, the PC has no network
 *   cbs-invoice         2  Portals → CBS, look the invoice up
 *   cloud-unreachable   1  Lab map, a hosted VM cannot be reached
 *   pc-hardware         2  Lab map, open the PC and service the bad part
 *   dhcp-no-address     1  Lab map, follow the DHCP request to the server
 *   pc-misconfigured    1  Lab map, compare ipconfig with the documentation
 *   printer-fault       1  Lab map, read the printer's front panel
 *   wifi-offline        1  Lab map, the laptop's radio, then the access point
 * ------------------------------------------------------------------ */

const { topology } = require("../lab/lab-map");
const { dnsNamesByDevice, defaultDeviceStates } = require("../lab/net-sim");
const hardware = require("../lab/hardware");
const printers = require("../lab/printers");
const wireless = require("../lab/wireless");
const dhcp = require("../lab/dhcp");
const { requesters } = require("../../data/seed-data");
const { defaultPortals } = require("../portals");

const MODEL = "classroom-rules";
const CHANNELS = ["portal", "phone", "email", "chat", "walk-in"];
const PER_STUDENT_DEFAULT = 11;

function cap(text) {
  const s = String(text || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The five fault families, with the share of an eleven-ticket workload each gets. */
const FAMILIES = {
  "password-reset": {
    share: 4,
    category: "Access & Identity",
    one: "password reset",
    many: "password resets",
    brief:
      "The person cannot sign in — locked out after too many attempts, or back from leave having forgotten it. They want their password reset. The technician finds them in Portals → Password and clicks Reset password."
  },
  "pc-offline": {
    share: 2,
    category: "Network",
    one: "PC with no network",
    many: "PCs with no network",
    brief:
      "The PC will not work: no address or a 169.254 address, nothing loads, no shared drives, cannot reach its gateway. The user does not know why and only knows their PC is dead. Do not have them say they checked, reseated or swapped the network cable — finding that is the technician's job."
  },
  "cbs-invoice": {
    share: 2,
    category: "Software",
    one: "CBS billing request",
    many: "CBS billing requests",
    brief:
      "A shop or office is asking for something to be done to one invoice in the CBS billing system. The user states the invoice, the shop and the amount, and what they need done. They do not care who is allowed to do it."
  },
  "cloud-unreachable": {
    share: 1,
    category: "Cloud",
    one: "unreachable cloud VM",
    many: "unreachable cloud VMs",
    brief:
      "One hosted service cannot be reached from the user's PC, while everything else on that PC still works fine."
  },
  "pc-hardware": {
    share: 2,
    category: "Hardware",
    one: "PC hardware fault",
    many: "PC hardware faults",
    brief:
      "Something physical about the PC is wrong. The user describes only what they can see, hear and touch — a dead machine, a blank screen, beeping, noise, heat, a keyboard that does nothing. They have no idea which part it is and they must not guess at one. The technician opens the PC on the Lab map and checks it over part by part."
  },
  "dhcp-no-address": {
    share: 1,
    category: "Network",
    one: "PC with no DHCP address",
    many: "PCs with no DHCP address",
    brief:
      "The PC has given up waiting for an address. Websites and shared drives do nothing, and if the user has been told to run ipconfig they may mention a number starting 169.254. They do not know what DHCP is and must not say the word. The technician follows the request from the desk to the DHCP server."
  },
  "pc-misconfigured": {
    share: 1,
    category: "Network",
    one: "PC with wrong network settings",
    many: "PCs with wrong network settings",
    brief:
      "Somebody typed network settings into this PC by hand — a colleague 'fixing' it, or a machine moved from another desk — and now it reaches nothing, or nothing outside its own floor, while the PC next to it is fine. The user knows only that it stopped working. They must not mention IP addresses, masks or gateways. The technician compares the PC's settings with the documented addressing."
  },
  "printer-fault": {
    share: 1,
    category: "Hardware",
    one: "printer problem",
    many: "printer problems",
    brief:
      "Nothing is coming out of a shared network printer, and other people in that area have noticed too. The user describes only what they can see: nothing prints, jobs sit in the queue, pages come out blank, or there is a message on the printer's little screen. They must not name the cause. The technician opens the printer on the Lab map and reads its front panel."
  },
  "wifi-offline": {
    share: 1,
    category: "Network",
    one: "laptop off the Wi-Fi",
    many: "laptops off the Wi-Fi",
    brief:
      "A laptop will not get onto the wireless network. The user says only what they see — no connection, it asks for something and will not join, or it drops out. Their colleague's laptop in the same room is fine, or was. They must not name the cause. The technician checks the laptop's radio and settings, then the access point."
  }
};

const ORDER = [
  "password-reset",
  "pc-offline",
  "cbs-invoice",
  "cloud-unreachable",
  "pc-hardware",
  "dhcp-no-address",
  "pc-misconfigured",
  "printer-fault",
  "wifi-offline"
];

/**
 * Families whose ticket is made true on the map: generating one unplugs the
 * named device, so the fault is a loose cable the student has to find.
 */
const CABLE_FAULT_KINDS = ["pc-offline", "cloud-unreachable"];

/** Families made true inside the PC instead, by breaking one of its parts. */
const HARDWARE_FAULT_KINDS = ["pc-hardware"];

/**
 * Families made true by writing state onto a device rather than by pulling a
 * cable or breaking a part: a stopped DHCP service, an address typed in by
 * hand, a jammed printer, a laptop that cannot join its network. Each one is
 * fixed from the device's own console.
 */
const DEVICE_FAULT_KINDS = ["dhcp-no-address", "pc-misconfigured", "printer-fault", "wifi-offline"];

/**
 * Which link of the DHCP path is broken. The first is an L1 fix on the map,
 * the other two are found by reading the server's own scope and putting it
 * back to what the documentation says.
 */
const DHCP_VARIANTS = ["service-stopped", "bad-gateway-option", "scope-full"];

/** The four ways a hand-typed address goes wrong. */
const MISCONFIG_VARIANTS = ["wrong-subnet", "bad-gateway", "wrong-mask", "duplicate"];

/** Two faults on the laptop, two on the access point serving it. */
const WIFI_VARIANTS = ["radio-off", "wrong-key", "wrong-ssid", "ap-radio-down"];

/** Everything that plants something real on the lab, for the instructor's count. */
const LAB_FAULT_KINDS = [...CABLE_FAULT_KINDS, ...HARDWARE_FAULT_KINDS, ...DEVICE_FAULT_KINDS];

/**
 * Where every device on the map stands, read from the map itself. A device
 * added to a department or a new branch is placed without an edit here, which
 * matters because a ticket that files a Marketing PC under IT sends the
 * student to the wrong floor.
 */
const PLACE_BY_DEVICE = (() => {
  const labMap = require("../lab/lab-map");
  const places = new Map();
  labMap.hqPlan().forEach((dept) => {
    dept.switches.forEach((sw) => sw.hosts.forEach((host) => places.set(host.id, dept.name)));
  });
  labMap.branchSites().forEach((site) => {
    labMap.branchHosts(site).forEach((host) => places.set(host.id, site.name));
  });
  labMap.DC.vms.forEach(([id]) => places.set(id, "Data centre"));
  // Access points and the laptops on them belong to the room they serve.
  labMap.wifiPlan().forEach((w) => {
    places.set(w.ap, w.place);
    w.laptops.forEach((laptop) => places.set(laptop.id, w.place));
  });
  return places;
})();

/** What a user would call each hosted service, keyed by the node's role. */
const SERVICE_WORDS = {
  WEB: "the company intranet site",
  MAIL: "company email",
  FTP: "the shared file server",
  SQL: "the CRM records database",
  AD: "domain sign-in",
  DNS: "website name lookups",
  DHCP: "automatic PC addressing",
  VDI: "the virtual desktop",
  VAS: "the VAS application",
  BAK: "the nightly backup",
  MON: "the monitoring dashboard",
  LOG: "the log server",
  HTTP: "the customer's website"
};

/**
 * CBS shops and password-portal departments that map onto a known contact.
 * The departments added when the company grew share the contact of the team
 * they sit closest to, because there are only so many staff on the roster and
 * a ticket has to be reported by somebody who exists.
 */
const CONTACT_BY_PLACE = {
  Sales: "req-1",
  Marketing: "req-1",
  Finance: "req-2",
  Legal: "req-2",
  HR: "req-3",
  Operations: "req-4",
  Procurement: "req-4",
  IT: "req-5",
  Support: "req-5",
  "Data centre": "req-5",
  Warehouse: "req-6",
  Reception: "req-7",
  "Branch A": "req-8",
  "Branch D": "req-8",
  "Branch G": "req-8",
  "Branch B": "req-9",
  "Branch E": "req-9",
  "Branch H": "req-9",
  "Branch C": "req-10",
  "Branch F": "req-10",
  "Branch I": "req-10",
  Training: "req-11",
  "Head office": "req-2",
  Safqa: "req-2",
  "Keratin Glow": "req-2"
};

const SERVICE_DESK = "req-5"; // Layla Mahmood, Service Desk Lead — logs the rest

function departmentOf(deviceId) {
  return PLACE_BY_DEVICE.get(deviceId) || "IT";
}

function requesterById(id) {
  return requesters.find((r) => r.id === id) || requesters[0];
}

/**
 * Who is on the phone. Someone reporting their own problem is the most
 * believable, then their department contact, then the service desk lead.
 */
function requesterFor({ name, place }) {
  const byName = name && requesters.find((r) => r.name === name);
  if (byName) return byName;
  const contact = place && CONTACT_BY_PLACE[place];
  return requesterById(contact || SERVICE_DESK);
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * FNV-1a with an avalanche finish, so the scatter below is the same order on
 * every server and run. The finisher matters: plain FNV moves the hash by a
 * fixed step when only the last character changes, so PC-OPS1 and PC-OPS2
 * sort next to each other and a "shuffled" pool comes out in tidy blocks.
 */
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A pool in a fixed but shuffled order. The topology and the portals list
 * things in tidy blocks — every HQ department, then every branch; every Sales
 * name, then every Finance one — and dealing down a list like that hands the
 * same head of the list out class after class. Ordering by a hash of the
 * entry's own name mixes the blocks together without making the deal random:
 * the same class always gets the same tickets.
 */
function scatter(pool, salt = "") {
  return pool
    .map((item, i) => ({ item, key: hash32(salt + "|" + (item.id || item.name || String(i))) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

/**
 * The same pool, but dealt one desk per place before coming back for a second
 * one: Sales, then Branch F, then Legal, then Branch A, and so on. Shuffling
 * alone leaves it to luck whether a small class reaches a nine-branch company
 * at all — the round robin makes the first pass over the pool touch every
 * department and every branch exactly once, so no site sits out the term.
 */
function dealOrder(pool, salt, placeOf = () => "all") {
  const groups = new Map();
  scatter(pool, salt).forEach((item) => {
    const key = placeOf(item) || "-";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const places = scatter([...groups.keys()].map((name) => ({ id: name })), salt + "|places");
  const rounds = Math.max(...[...groups.values()].map((g) => g.length));
  const out = [];
  for (let round = 0; round < rounds; round++) {
    places.forEach(({ id }) => {
      const item = groups.get(id)[round];
      if (item) out.push(item);
    });
  }
  return out;
}

/**
 * Everything the generator is allowed to write about: lab devices from the
 * topology, plus the people and invoices from this class's own portal state,
 * so a student can always find the subject of their ticket.
 */
function roster(portals) {
  const data = portals && portals.passwordPeople && portals.cbs ? portals : defaultPortals();
  const topo = topology();
  const names = dnsNamesByDevice();
  const pcs = [];
  const cloud = [];
  const printerList = [];
  const laptops = [];

  for (const node of topo.nodes) {
    if (node.type === "pc") {
      pcs.push({ id: node.id, ip: node.ip, department: departmentOf(node.id) });
      continue;
    }
    if (node.type === "printer") {
      printerList.push({ id: node.id, ip: node.ip, department: departmentOf(node.id) });
      continue;
    }
    if (node.type === "laptop") {
      laptops.push({ id: node.id, ip: node.ip, department: departmentOf(node.id), ssid: node.ssid });
      continue;
    }
    // Hosted services only: the cloud zone, minus its switch.
    if (node.zone === "cloud" && node.type === "server") {
      cloud.push({
        id: node.id,
        ip: node.ip,
        role: node.role || "HTTP",
        service: SERVICE_WORDS[node.role] || "a hosted service",
        hostname: (names[node.id] || [])[0] || ""
      });
    }
  }

  return {
    pcs,
    cloud,
    printers: printerList,
    laptops,
    people: data.passwordPeople || [],
    invoices: data.cbs?.invoices || []
  };
}

/* ------------------------------------------------------------------ *
 * The mix
 *
 * How many tickets of each family one student gets. The shares above are the
 * default, but an instructor can turn a family off entirely or ask for more
 * of it — a class working on hardware for the afternoon wants eight of those
 * and none of the billing ones.
 * ------------------------------------------------------------------ */

const MAX_PER_FAMILY = 12;
const MAX_TOTAL = 40; // one student's queue, not a semester

function defaultMix() {
  const mix = {};
  for (const kind of ORDER) mix[kind] = FAMILIES[kind].share;
  return mix;
}

function mixTotal(mix) {
  return ORDER.reduce((sum, kind) => sum + (mix[kind] || 0), 0);
}

/**
 * How many of each family one student gets when a plain total is asked for
 * instead of a chosen mix: the shares above, shared out by largest remainder.
 */
function faultMix(count = PER_STUDENT_DEFAULT) {
  const total = ORDER.reduce((sum, kind) => sum + FAMILIES[kind].share, 0);
  const exact = ORDER.map((kind) => ({ kind, want: (count * FAMILIES[kind].share) / total }));
  const mix = {};
  let used = 0;
  exact.forEach(({ kind, want }) => {
    mix[kind] = Math.floor(want);
    used += mix[kind];
  });
  // Hand the leftovers to whoever was rounded down hardest.
  exact
    .sort((a, b) => (b.want % 1) - (a.want % 1))
    .slice(0, Math.max(0, count - used))
    .forEach(({ kind }) => {
      mix[kind] += 1;
    });
  return mix;
}

/**
 * Whatever arrived from the instructor's screen, turned into a mix the
 * generator can act on: a per-family object, a plain total, or nothing.
 *
 * A mix of all zeros is a slip rather than an instruction — nobody presses
 * generate to write no tickets — so it falls back to the default rather than
 * quietly giving the class an empty queue.
 */
function resolveMix(input) {
  if (typeof input === "number" || typeof input === "string") {
    const count = Number(input);
    if (!Number.isFinite(count) || count < 1) return defaultMix();
    return faultMix(Math.min(MAX_TOTAL, Math.floor(count)));
  }
  if (!input || typeof input !== "object") return defaultMix();

  const mix = {};
  for (const kind of ORDER) {
    const want = Number(input[kind]);
    mix[kind] = Number.isFinite(want) ? Math.max(0, Math.min(MAX_PER_FAMILY, Math.floor(want))) : 0;
  }
  if (!mixTotal(mix)) return defaultMix();
  // Trim the largest family first, so a request for 60 tickets comes back as a
  // workload rather than an error.
  while (mixTotal(mix) > MAX_TOTAL) {
    const biggest = ORDER.slice().sort((a, b) => mix[b] - mix[a])[0];
    mix[biggest] -= 1;
  }
  return mix;
}

/** "4 password resets, 2 PCs with no network, …" for the instructor's screen. */
function mixLines(mix = defaultMix()) {
  const resolved = resolveMix(mix);
  return ORDER.filter((kind) => resolved[kind] > 0).map(
    (kind) => `${resolved[kind]} ${resolved[kind] === 1 ? FAMILIES[kind].one : FAMILIES[kind].many}`
  );
}

/** How many of the tickets in a mix plant something real on the lab. */
function labFaultCount(mix, kinds = LAB_FAULT_KINDS) {
  const resolved = resolveMix(mix);
  return kinds.reduce((n, kind) => n + (resolved[kind] || 0), 0);
}

/**
 * What the instructor's screen needs to draw the chooser: one entry per
 * family, in the order they are dealt out.
 */
function families() {
  return ORDER.map((kind) => ({
    kind,
    one: FAMILIES[kind].one,
    many: FAMILIES[kind].many,
    category: FAMILIES[kind].category,
    default: FAMILIES[kind].share,
    max: MAX_PER_FAMILY,
    // What generating one actually does to the lab, so the instructor can see
    // which choices will leave the map broken.
    plants: CABLE_FAULT_KINDS.includes(kind)
      ? "cable"
      : HARDWARE_FAULT_KINDS.includes(kind)
        ? "hardware"
        : DEVICE_FAULT_KINDS.includes(kind)
          ? "device"
          : null
  }));
}

/**
 * Deal subjects to one student. `index` is their position in the class, which
 * walks each pool along so two students rarely share a person or a device.
 */
function planFor(index, wanted = null, portals = null) {
  const { pcs, cloud, people, invoices, printers: printerPool, laptops } = roster(portals);
  const mix = resolveMix(wanted);

  // Deal from a scattered copy of each pool, one student's worth at a time.
  // Walking the pool in order, or in fixed strides from the student's own
  // position, keeps a class inside the first few departments: the topology
  // lists all of HQ before any branch, so whole branches went a term without
  // a single fault. Scattering first means a window of four desks is four
  // different parts of the company, and stepping by `howMany` gives the next
  // student a window nobody else has had.
  const take = (pool, howMany, salt, placeOf) => {
    if (!pool.length || howMany <= 0) return [];
    const order = dealOrder(pool, salt, placeOf);
    return Array.from({ length: howMany }, (_, i) => order[(index * howMany + i) % order.length]);
  };

  const items = [];

  take(people, mix["password-reset"], "people", (person) => person.department).forEach((person) => {
    items.push({
      kind: "password-reset",
      subject: person.name,
      place: person.department,
      mustMention: [person.name],
      detail: { pc: person.pc, mailbox: person.mailbox },
      tags: ["password", "account", slug(person.department)],
      requester: requesterFor({ name: person.name, place: person.department })
    });
  });

  // Cable faults and hardware faults both consume PCs, and they are drawn
  // from one list so no PC is handed out twice. A machine carrying both an
  // unplugged cable and a dead power supply reports one symptom and hides
  // the other, which is not a fault a student can reason about.
  const pcWanted =
    (mix["pc-offline"] || 0) +
    (mix["pc-hardware"] || 0) +
    (mix["dhcp-no-address"] || 0) +
    (mix["pc-misconfigured"] || 0);
  const pcPicks = take(pcs, pcWanted, "pcs", (device) => device.department);

  // Which of the student's desks gets the loose cable, which gets the dead
  // part and which gets the settings somebody typed in by hand is taken from
  // alternate ends of their window. Handing the cables out from the front
  // only meant the desks that landed late in a window — the branches, before
  // the scatter — were always hardware and never a network fault, so a whole
  // site went a term without a `ping` to fix.
  const cablePicks = pcPicks.filter((_, i) => i % 2 === 0).concat(pcPicks.filter((_, i) => i % 2 === 1));
  let cursor = 0;
  const deal = (howMany) => cablePicks.slice(cursor, (cursor += howMany || 0));
  const forCable = deal(mix["pc-offline"]);
  const forDhcp = deal(mix["dhcp-no-address"]);
  const forMisconfig = deal(mix["pc-misconfigured"]);
  const forHardware = cablePicks.slice(cursor);

  forCable.forEach((device) => {
    items.push({
      kind: "pc-offline",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      detail: { ip: device.ip },
      tags: ["network", "no-ip", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  // One fault per ticket, walked along by class position so two students do
  // not both get "the PC is dead" on the same afternoon, and stepped by four
  // so one student's own hardware tickets are different faults rather than
  // neighbouring entries in the list.
  forHardware.forEach((device, i) => {
    const faultId = hardware.TICKET_FAULTS[(index + i * 4) % hardware.TICKET_FAULTS.length];
    const spec = hardware.FAULTS[faultId];
    items.push({
      kind: "pc-hardware",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      detail: { fault: faultId, slot: i % 2 === 0 ? "A" : "B", report: spec.report, ip: device.ip },
      // Deliberately says nothing about which part. Tags are on the ticket
      // the student reads, so "power-supply-failed" would be the answer key.
      tags: ["hardware", "desk-pc", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  // A DHCP ticket is one desk reporting it, and the fault is on the path from
  // that desk to the DHCP server. Which link of that path is broken is
  // walked along by class position, so one class is chasing a stopped service
  // and the next is chasing an option handed out wrong.
  forDhcp.forEach((device, i) => {
    const variant = DHCP_VARIANTS[(index + i) % DHCP_VARIANTS.length];
    items.push({
      kind: "dhcp-no-address",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      detail: { ip: device.ip, variant },
      tags: ["network", "addressing", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  forMisconfig.forEach((device, i) => {
    const variant = MISCONFIG_VARIANTS[(index + i * 3) % MISCONFIG_VARIANTS.length];
    items.push({
      kind: "pc-misconfigured",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      detail: { ip: device.ip, variant },
      tags: ["network", "addressing", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  take(printerPool, mix["printer-fault"], "printers", (device) => device.department).forEach((device, i) => {
    const faultId = printers.TICKET_FAULTS[(index + i * 2) % printers.TICKET_FAULTS.length];
    items.push({
      kind: "printer-fault",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      // The report is what the user can see. The cause is not on the ticket.
      detail: { ip: device.ip, fault: faultId, report: printers.FAULTS[faultId].report },
      tags: ["printer", "peripherals", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  take(laptops, mix["wifi-offline"], "laptops", (device) => device.department).forEach((device, i) => {
    const variant = WIFI_VARIANTS[(index + i) % WIFI_VARIANTS.length];
    items.push({
      kind: "wifi-offline",
      subject: device.id,
      place: device.department,
      mustMention: [device.id],
      detail: { ip: device.ip, ssid: device.ssid, variant },
      tags: ["wireless", "network", slug(device.department)],
      requester: requesterFor({ place: device.department })
    });
  });

  // Pending invoices want posting; anything already posted can be refunded.
  const pending = invoices.filter((i) => i.status === "pending");
  const posted = invoices.filter((i) => i.status === "posted");
  const cbsWanted = mix["cbs-invoice"];
  const cbsPicks = [];
  for (let i = 0; i < cbsWanted; i++) {
    const wantPost = i % 2 === 0;
    const pool = (wantPost ? pending : posted).length ? (wantPost ? pending : posted) : invoices;
    if (!pool.length) break;
    const stride = Math.max(1, Math.floor(pool.length / Math.max(1, Math.ceil(cbsWanted / 2))));
    cbsPicks.push({ invoice: pool[(index + stride * Math.floor(i / 2)) % pool.length], action: wantPost ? "posted" : "refunded" });
  }
  cbsPicks.forEach(({ invoice, action }) => {
    items.push({
      kind: "cbs-invoice",
      subject: invoice.id,
      place: invoice.shop,
      mustMention: [invoice.id],
      detail: { amount: invoice.amount, day: invoice.day, status: invoice.status, action },
      tags: ["cbs", "billing", slug(invoice.shop)],
      requester: requesterFor({ place: invoice.shop })
    });
  });

  take(cloud, mix["cloud-unreachable"], "cloud").forEach((device) => {
    items.push({
      kind: "cloud-unreachable",
      subject: device.id,
      place: null,
      mustMention: [device.id],
      detail: {
        ip: device.ip,
        hostname: device.hostname,
        service: device.service,
        target: device.hostname || device.ip
      },
      tags: ["cloud", slug(device.role)],
      requester: requesterFor({ place: requesters[index % requesters.length].department })
    });
  });

  // Interleave so a student's queue is not four neat blocks of one fault.
  const queues = {};
  ORDER.forEach((kind) => {
    queues[kind] = items.filter((item) => item.kind === kind);
  });
  const woven = [];
  while (woven.length < items.length) {
    for (const kind of ORDER) {
      const next = queues[kind].shift();
      if (next) woven.push(next);
    }
  }

  return woven.map((item, i) => ({
    ...item,
    ref: `t${i + 1}`,
    category: FAMILIES[item.kind].category,
    requesterId: item.requester.id
  }));
}

/** Classroom AI is always available — templates and rule-based review. */
function aiReady() {
  return true;
}

function aiMode() {
  return "classroom";
}

function fallbackDraft(item, seed) {
  const who = item.requester.name;
  const f = item.detail;
  const relayed = who !== item.subject;
  const variants = {
    "password-reset": [
      {
        title: `Password reset for ${item.subject}`,
        description: `${item.subject} in ${item.place} is locked out after too many sign-in attempts and cannot get into ${f.pc}. They are asking for the password to be reset so they can start work.`
      },
      {
        title: `${item.subject} cannot sign in`,
        description: `${item.subject} came back from leave and cannot remember the password for their account in ${item.place}. They have tried twice on ${f.pc} and do not want to lock it.`
      },
      relayed
        ? {
            title: `${item.subject} locked out of their account`,
            description: `${who} reports that ${item.subject} cannot sign in this morning and the account looks locked. They need it back today.`
          }
        : {
            title: `${item.subject} locked out of their account`,
            description: `${item.subject} called from ${item.place} to say sign-in fails on ${f.pc} and the account now looks locked. They need it back today.`
          },
      {
        title: `Account access for ${item.subject} in ${item.place}`,
        description: `${item.subject} is asking for a password reset — sign-in fails on ${f.pc} and their mailbox will not open either.`
      }
    ],
    "pc-offline": [
      {
        title: `${item.subject} has no network connection`,
        description: `${who} says ${item.subject} cannot reach anything this morning — no shared drives and no websites. They have already restarted it once and it still shows no connection.`
      },
      {
        title: `${item.subject} is not working`,
        description: `Nothing loads on ${item.subject} since ${who} came in. They have shut it down and started it again and it made no difference.`
      },
      {
        title: `No network on ${item.subject} in ${item.place}`,
        description: `${who} reports ${item.subject} has lost the network and they cannot open anything. Their neighbour's PC in ${item.place} is working normally.`
      }
    ],
    "pc-hardware": [
      {
        title: `Problem with ${item.subject} in ${item.place}`,
        description: `${who} reports a problem with ${item.subject}: "${f.report}". They have not been able to do any work on it this morning.`
      },
      {
        title: `${item.subject} needs looking at`,
        description: `${who} called about ${item.subject} in ${item.place} and said: "${f.report}". They tried switching it off and on again and it is the same.`
      },
      {
        title: `${item.subject} not usable`,
        description: `${who} says ${item.subject} cannot be used as it is. In their words: "${f.report}". They are asking for someone to come and look at the machine.`
      }
    ],
    "cbs-invoice": [
      {
        title: `${item.subject} needs to be ${f.action} for ${item.place}`,
        description: `${who} is asking about ${item.subject} for ${item.place}, ${f.amount}, dated ${f.day}. It still shows as ${f.status} and they need it ${f.action} today.`
      },
      {
        title: `${item.place} asking about ${item.subject}`,
        description: `${who} called about ${item.subject} (${f.amount}, ${f.day}). The shop says it is wrong as it stands and wants it ${f.action}.`
      },
      {
        title: `Billing query on ${item.subject}`,
        description: `${who} reports ${item.subject} for ${item.place} is ${f.status} at ${f.amount}. They are asking for it to be ${f.action} before the end of the day.`
      }
    ],
    "cloud-unreachable": [
      {
        title: `Cannot reach ${item.subject} — ${f.service}`,
        description: `${who} cannot open ${f.service} (${f.target}). Everything else on their PC works, so they think the server is down.`
      },
      {
        title: cap(`${f.service} on ${item.subject} will not load`),
        description: `${who} says ${f.service} on ${item.subject} (${f.target}) times out for them. They tried again after a restart and it still will not open.`
      },
      {
        title: `${item.subject} not responding`,
        description: `${who} cannot get to ${f.service} at ${f.target}. They have work waiting on it and asked how long it will take.`
      }
    ],
    "dhcp-no-address": [
      {
        title: `${item.subject} cannot get onto the network`,
        description: `${who} says ${item.subject} in ${item.place} has no network at all this morning. Someone told them to run a command and read out a number starting 169.254, which means nothing to them.`
      },
      {
        title: `No network on ${item.subject} after a restart`,
        description: `${who} reports that ${item.subject} came back from a restart with no network. The PC next to it in ${item.place} is working normally.`
      },
      {
        title: `${item.subject} has lost its connection`,
        description: `${who} cannot open anything on ${item.subject} — no shared drives, no websites. They say it worked yesterday and nothing has been changed.`
      }
    ],
    "pc-misconfigured": [
      {
        title: `${item.subject} stopped working after someone looked at it`,
        description: `${who} says a colleague tried to fix ${item.subject} in ${item.place} yesterday and it has been worse since. It reaches nothing now.`
      },
      {
        title: `${item.subject} cannot open anything off this floor`,
        description: `${who} reports that ${item.subject} can see some things in ${item.place} but nothing anywhere else in the company. Their own machine is fine.`
      },
      {
        title: `${item.subject} moved desks and will not connect`,
        description: `${who} says ${item.subject} was brought over from another desk and has not worked since it was plugged in here.`
      }
    ],
    "printer-fault": [
      {
        title: `Nothing printing on ${item.subject}`,
        description: `${who} reports a problem with the printer ${item.subject} in ${item.place}: "${f.report}". Other people in ${item.place} have noticed it too.`
      },
      {
        title: `${item.subject} in ${item.place} will not print`,
        description: `${who} called about ${item.subject} and said: "${f.report}". They have tried sending the document twice.`
      },
      {
        title: `Problem with the printer ${item.subject}`,
        description: `${who} says nobody in ${item.place} can print. In their words: "${f.report}". They have a document they need for a meeting.`
      }
    ],
    "wifi-offline": [
      {
        title: `${item.subject} will not connect to the wireless`,
        description: `${who} says ${item.subject} in ${item.place} cannot get onto the wireless network. It worked last week and they have not changed anything.`
      },
      {
        title: `No wireless on ${item.subject}`,
        description: `${who} reports that ${item.subject} shows no connection in ${item.place}. Their colleague's laptop in the same room is fine.`
      },
      {
        title: `${item.subject} keeps asking to connect`,
        description: `${who} says ${item.subject} will not join the network in ${item.place} — it asks for something and then goes back to nothing.`
      }
    ]
  };
  const pool = variants[item.kind];
  const pick = pool[seed % pool.length];
  return {
    ref: item.ref,
    title: pick.title,
    description: pick.description,
    channel: CHANNELS[hash32(item.subject + item.kind) % CHANNELS.length],
    tags: item.tags
  };
}

/**
 * Ticket drafts for one student from classroom templates.
 */
async function draftsForStudent(student, index, wanted = null, portals = null) {
  const plan = planFor(index, wanted, portals);
  // Templates are picked per family, so a student's four password tickets do
  // not all come out with the same sentence.
  const seen = {};
  const drafts = plan.map((item) => {
    seen[item.kind] = (seen[item.kind] || 0) + 1;
    return { ...fallbackDraft(item, index + seen[item.kind]), item };
  });
  return { drafts, aiCount: 0, fallbackCount: drafts.length, error: null };
}

/**
 * Classroom priority guide for CCST L1 — what the instructor would expect.
 * Cloud VM → critical · billing / whole department → high ·
 * one PC / one PC no internet → medium · password reset → low.
 */

module.exports = {
  draftsForStudent,
  planFor,
  faultMix,
  defaultMix,
  resolveMix,
  mixTotal,
  mixLines,
  labFaultCount,
  families,
  roster,
  aiReady,
  aiMode,
  fallbackDraft,
  LAB_FAULT_KINDS,
  CABLE_FAULT_KINDS,
  HARDWARE_FAULT_KINDS,
  DEVICE_FAULT_KINDS,
  DHCP_VARIANTS,
  MISCONFIG_VARIANTS,
  WIFI_VARIANTS,
  MODEL,
  MAX_PER_FAMILY,
  MAX_TOTAL,
  PER_STUDENT_DEFAULT,
  FAMILIES,
  CHANNELS
};
