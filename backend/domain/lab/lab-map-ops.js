/**
 * Lab map link mutations, empty state, and schema migrations.
 */
const {
  topology,
  defaultLinks,
  endpointKey,
  parseEndpoint,
  knownEndpoints
} = require("./lab-map-topo");

function normalizeLinks(rawLinks, topo) {
  const cabling = require("./cabling");
  const known = knownEndpoints(topo);
  const used = new Set();
  const out = [];
  const cables = new Set((topo.cableTypes || []).map((c) => c.id));
  const typeOf = new Map((topo.nodes || []).map((n) => [n.id, n.type]));

  for (const raw of rawLinks || []) {
    const a = String(raw.a || "").trim();
    const b = String(raw.b || "").trim();
    if (!a || !b || a === b) continue;
    if (!known.has(a) || !known.has(b)) continue;
    // A radio slot is not a socket. Wireless links are worked out from the
    // devices' settings, so a cable into one would be a second, silent copy.
    if (/:Wlan/i.test(a) || /:Wlan/i.test(b)) continue;
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    const typeA = typeOf.get(a.split(":")[0]);
    const typeB = typeOf.get(b.split(":")[0]);
    // Keep a valid cable that is already on the map (fiber on the WAN, for
    // example). Anything the pair cannot carry — console, fiber into a PC —
    // is replaced with the lead the map would have picked itself.
    let cable = cables.has(raw.cable) ? raw.cable : "copper";
    if (!cabling.check(typeA, typeB, cable).ok) cable = cabling.pick(typeA, typeB);
    const entry = {
      // Always mint a fresh sequential id. Migrations that splice design
      // cables back in keep the design's L0xx numbers, and a long-running
      // class already had those numbers on older circuits — two cables with
      // the same id then collapse into one wire on the map (the HQ↔Seef
      // handoff was the one that vanished).
      id: `L${String(out.length + 1).padStart(3, "0")}`,
      a,
      b,
      cable
    };
    if (Array.isArray(raw.path) && raw.path.length >= 2) {
      entry.path = raw.path
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (entry.path.length < 2) delete entry.path;
    }
    if (raw.lane != null && Number.isFinite(Number(raw.lane))) entry.lane = Number(raw.lane);
    if (raw.kind) entry.kind = String(raw.kind);
    out.push(entry);
  }
  return out;
}

function nextLinkId(links) {
  let max = 0;
  for (const l of links || []) {
    const m = /^L(\d+)$/i.exec(String(l.id || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${String(max + 1).padStart(3, "0")}`;
}

function endsMatch(link, a, b) {
  return (link.a === a && link.b === b) || (link.a === b && link.b === a);
}

/**
 * Apply one plug or unplug to the live cable list without replacing the rest.
 * Two students can change different cables; fighting over the same ports fails
 * cleanly instead of wiping the other person's work.
 *
 * body: { action: "plug"|"unplug", a?, b?, id? }
 */
function applyLinkOp(links, topo, body = {}) {
  const cabling = require("./cabling");
  const action = String(body.action || body.op || "").toLowerCase();
  const current = Array.isArray(links) ? links.slice() : [];
  const known = knownEndpoints(topo);
  const typeOf = new Map((topo.nodes || []).map((n) => [n.id, n.type]));

  if (action === "unplug" || action === "remove") {
    const id = body.id != null ? String(body.id) : "";
    const a = String(body.a || "").trim();
    const b = String(body.b || "").trim();
    let idx = -1;
    if (id) idx = current.findIndex((l) => l.id === id);
    if (idx < 0 && a && b) idx = current.findIndex((l) => endsMatch(l, a, b));
    if (idx < 0) {
      return { ok: false, error: "That cable is already gone.", status: 409, links: current };
    }
    const [removed] = current.splice(idx, 1);
    return { ok: true, action: "unplug", link: removed, links: current };
  }

  if (action === "plug" || action === "add") {
    const a = String(body.a || "").trim();
    const b = String(body.b || "").trim();
    if (!a || !b || a === b) {
      return { ok: false, error: "Pick two different ports.", status: 400, links: current };
    }
    if (!known.has(a) || !known.has(b)) {
      return { ok: false, error: "One of those ports is not on the map.", status: 400, links: current };
    }
    if (/:Wlan/i.test(a) || /:Wlan/i.test(b)) {
      return { ok: false, error: "A wireless slot is not a cable socket.", status: 400, links: current };
    }
    const used = new Set();
    for (const l of current) {
      used.add(l.a);
      used.add(l.b);
    }
    if (used.has(a) || used.has(b)) {
      const busy = used.has(a) ? a : b;
      return {
        ok: false,
        error: `${busy} already has a cable. Click a white (free) port, or click that cable to unplug it first.`,
        status: 409,
        links: current
      };
    }
    const typeA = typeOf.get(a.split(":")[0]);
    const typeB = typeOf.get(b.split(":")[0]);
    const cable = cabling.pick(typeA, typeB);
    const link = { id: nextLinkId(current), a, b, cable };
    current.push(link);
    return { ok: true, action: "plug", link, links: current };
  }

  return { ok: false, error: "Unknown map action.", status: 400, links: current };
}

/** Bumped when the shipped cabling changes shape, not just its labels. */
const MAP_SCHEMA = 9;

function emptyMapState() {
  return {
    links: defaultLinks(),
    schema: MAP_SCHEMA,
    updatedAt: new Date().toISOString()
  };
}

/**
 * The design's cabling has changed shape several times. Rather than resetting
 * a class's whole map, each step retires only the cables it made wrong and
 * lays in the replacements, leaving every other cable the class has run.
 *
 *   v2  branches plugged straight into R1-EDGE Fa0/9-11; they now reach HQ
 *       through their own routers and the provider.
 *   v3  SW-OPS and SW-TRAIN had their own router legs while sharing a subnet
 *       with SW-REC and SW-WH; they were trunked to those neighbours instead.
 *   v4  the single R-ISP router became the Batelco core plus one area
 *       exchange per district, and the internet moved off SW-CLOUD onto it.
 *   v5  the hosted cloud is the provider's, so SW-CLOUD uplinks to the
 *       Batelco core instead of to the HQ edge router.
 *   v6  the company tripled. Every HQ department now sits behind its own
 *       distribution router instead of a switchport on R1-EDGE, the shared
 *       VLAN pairs were given a subnet each, and six exchanges serve nine
 *       branches. Everything the old shape got wrong is retired, then the
 *       map is topped up with any design cable whose ports are both free.
 *   v7  Azure cloud path: SW-CLOUD no longer uplinks straight to Hamala.
 *       Traffic goes Hamala → Dubai telecom → Azure cloud router → SW-CLOUD.
 *   v8  Wi-Fi. Six access points arrive, each with one uplink into the switch
 *       for its VLAN. Nothing is retired — the laptops have no cabling.
 *   v9  the hosted cloud is re-cabled from the design, because a class carried
 *       all the way from v4 still had SW-CLOUD plugged into the Batelco core
 *       on the port the design used back then.
 */
const LINK_MIGRATIONS = [
  {
    to: 2,
    retire: [
      ["R1-EDGE:Fa0/9", "SW-BRA:Gi0/1"],
      ["R1-EDGE:Fa0/10", "SW-BRB:Gi0/1"],
      ["R1-EDGE:Fa0/11", "SW-BRC:Gi0/1"]
    ],
    add: (l) => /^R\d-BR[ABC]:/.test(l.a) || /^R\d-BR[ABC]:/.test(l.b)
  },
  {
    to: 3,
    retire: [
      ["R1-EDGE:Fa0/5", "SW-OPS:Gi0/1"],
      ["R1-EDGE:Fa0/7", "SW-TRAIN:Gi0/1"]
    ],
    add: (l) => /^SW-(REC|WH):Gi0\/2$/.test(l.a) && /^SW-(OPS|TRAIN):Gi0\/3$/.test(l.b)
  },
  {
    to: 4,
    retire: [["Cloud-ISP:Eth0", "SW-CLOUD:Gi0/2"]],
    // R-ISP no longer exists, so free whatever was plugged into it.
    retireIf: (l) => l.a.startsWith("R-ISP:") || l.b.startsWith("R-ISP:"),
    add: (l) => /^(BAT-[A-Z-]+|Cloud-ISP):/.test(l.a) || /^BAT-[A-Z-]+:/.test(l.b)
  },
  {
    to: 5,
    retire: [["SW-CLOUD:Gi0/1", "R1-EDGE:Gi0/0"]],
    add: (l) => l.a === "SW-CLOUD:Gi0/2" && l.b.startsWith("BAT-HAMALA:")
  },
  {
    to: 6,
    // Every HQ switch that used to be a leg off the edge router, the trunks
    // between switches that no longer share a subnet, and the two branch
    // handoffs that moved to a different exchange.
    retireIf: (l) => {
      const ends = [l.a, l.b];
      const edgeLeg = (e) => /^R1-EDGE:Fa0\/([1-9]|1[01])$/.test(e) && ends.some((x) => /^SW-/.test(x));
      const oldTrunk = (e) => /^SW-(REC|WH):Gi0\/2$/.test(e) || /^SW-(OPS|TRAIN):Gi0\/3$/.test(e);
      const movedHandoff = (e) => /^BAT-(RIFFA|ISA-TOWN):Gi0\/2$/.test(e);
      return ends.some((e) => edgeLeg(e) || oldTrunk(e) || movedHandoff(e)) ||
        ends.some((e) => e === "R1-EDGE:Gi0/1" || e === "SW-VIRT:Gi0/1");
    },
    // Top up: anything the class has not already cabled comes in from the
    // design, which is most of the new company.
    add: () => true
  },
  {
    to: 7,
    retire: [["SW-CLOUD:Gi0/2", "BAT-HAMALA:Gi0/9"]],
    add: (l) =>
      (l.a === "SW-CLOUD:Gi0/2" && l.b === "R-AZURE:Gi0/2") ||
      (l.a === "R-AZURE:Gi0/1" && l.b === "BAT-DUBAI:Gi0/2") ||
      (l.a === "BAT-DUBAI:Gi0/1" && l.b === "BAT-HAMALA:Gi0/9")
  },
  {
    to: 8,
    add: (l) => /^AP-[A-Z]+:/.test(l.a)
  },
  {
    // v9 re-cables the hosted cloud from scratch. Classes carried forward from
    // v4 kept `SW-CLOUD:Gi0/2 → BAT-HAMALA:Gi0/5`, which the v7 step did not
    // catch because by then the design had moved that port to Gi0/9, so the
    // cloud never moved behind R-AZURE and the VMs added since sat on ports
    // already taken. The whole segment comes out and goes back to the design —
    // nothing outside the cloud is touched, so an unplugged desk stays
    // unplugged for the ticket that names it.
    to: 9,
    retireIf: (l) => {
      const cloudEnd = (e) =>
        /^(SW-CLOUD|CLOUD-VM-[A-Z0-9]+|Keratin-Glow|Safqa|R-AZURE|BAT-DUBAI):/.test(e) ||
        e === "BAT-HAMALA:Gi0/5" ||
        e === "BAT-HAMALA:Gi0/9";
      return cloudEnd(l.a) || cloudEnd(l.b);
    },
    add: (l) =>
      /^(SW-CLOUD|CLOUD-VM-[A-Z0-9]+|Keratin-Glow|Safqa|R-AZURE|BAT-DUBAI):/.test(l.a) ||
      /^(SW-CLOUD|CLOUD-VM-[A-Z0-9]+|R-AZURE|BAT-DUBAI):/.test(l.b) ||
      // The core port the stale cloud uplink was sitting on belongs to an area
      // exchange, so that circuit comes back with it.
      (/^BAT-/.test(l.a) && /^BAT-/.test(l.b))
  }
];

function migrateLinks(links, schema) {
  const from = Number(schema || 0);
  if (from >= MAP_SCHEMA) return { links, changed: false };

  let kept = (links || []).slice();
  let changed = false;
  const design = defaultLinks();

  for (const step of LINK_MIGRATIONS) {
    if (from >= step.to) continue;
    changed = true;
    for (const [x, y] of step.retire || []) {
      kept = kept.filter((l) => !((l.a === x && l.b === y) || (l.a === y && l.b === x)));
    }
    if (step.retireIf) kept = kept.filter((l) => !step.retireIf(l));
    const used = new Set();
    for (const l of kept) {
      used.add(l.a);
      used.add(l.b);
    }
    for (const l of design.filter(step.add)) {
      if (used.has(l.a) || used.has(l.b)) continue;
      used.add(l.a);
      used.add(l.b);
      kept.push(l);
    }
  }
  return { links: kept, changed };
}

module.exports = {
  normalizeLinks,
  applyLinkOp,
  emptyMapState,
  migrateLinks,
  MAP_SCHEMA,
  endpointKey,
  parseEndpoint
};
