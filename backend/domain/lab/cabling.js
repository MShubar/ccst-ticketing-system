/**
 * Which cable belongs between which two things.
 *
 * The map picks the cable itself when a student clicks two ports. The rules
 * are the ones the course teaches, applied only where they are not arguable:
 *
 *   - A console cable is management only. It never carries data, so the map
 *     will not run one as a network link.
 *   - Desk equipment (PC, printer, on-prem server, laptop) has an RJ45 port,
 *     so fiber cannot go into it.
 *   - Unlike devices — PC to switch, PC to access point — take a straight
 *     through cable. Like devices — PC to PC, PC to router — take a crossover.
 *   - Between switches, routers, access points and the provider's kit, copper,
 *     crossover or fiber all come up (gigabit auto-MDIX). The map defaults to
 *     copper there, or crossover between two switches, matching the shipped
 *     design; fiber already on the map is left alone.
 */

/** Cable ids the simulator recognises. */
const CABLE_IDS = ["copper", "crossover", "fiber", "console"];

const CABLE_LABELS = {
  copper: "copper straight-through",
  crossover: "copper crossover",
  fiber: "fiber",
  console: "console",
  wireless: "wireless"
};

/** Node types that are somebody's desk equipment rather than infrastructure. */
const END_DEVICES = new Set(["pc", "server", "printer", "laptop"]);

/**
 * Node types that carry a network rather than sit on the end of one. The
 * provider handoff ("cloud") counts as infrastructure: it is Batelco's
 * equipment on the far side of a fiber circuit, not a PC.
 */
const INFRASTRUCTURE = new Set(["switch", "router", "ap", "cloud"]);

function label(cable) {
  return CABLE_LABELS[cable] || String(cable || "cable");
}

function roleOf(type) {
  if (END_DEVICES.has(type)) return "end";
  if (INFRASTRUCTURE.has(type)) return "infra";
  return "infra";
}

/**
 * The cable the map should run between these two node types. Always a lead
 * that will carry traffic, so a student who clicks two free ports gets a
 * working link without first picking from a list.
 */
function pick(typeA, typeB) {
  const a = roleOf(typeA);
  const b = roleOf(typeB);

  if (a === "end" || b === "end") {
    // PC to switch (or to an access point) is unlike equipment: straight
    // through. PC to PC and PC to router are like equipment: crossover.
    const straight =
      (a === "end") !== (b === "end") &&
      (typeA === "switch" || typeB === "switch" || typeA === "ap" || typeB === "ap");
    return straight ? "copper" : "crossover";
  }

  if (typeA === "switch" && typeB === "switch") return "crossover";
  if (typeA === "cloud" || typeB === "cloud") return "fiber";
  return "copper";
}

/**
 * Is this cable allowed between these two node types? Returns
 * `{ ok }` or `{ ok: false, error, want }` where `want` is the cable that
 * should have been used, so the caller can name it in a message.
 */
function check(typeA, typeB, cable) {
  const kind = String(cable || "copper");

  // Wireless associations are made by the radio, not by a patch lead.
  if (kind === "wireless") return { ok: true };

  if (kind === "console") {
    return {
      ok: false,
      error: "A console cable is for management access only — it does not carry network traffic.",
      want: pick(typeA, typeB)
    };
  }

  const a = roleOf(typeA);
  const b = roleOf(typeB);

  if (a === "end" || b === "end") {
    if (kind === "fiber") {
      return {
        ok: false,
        error: "Fiber cannot plug into an RJ45 port — desk equipment needs a copper cable.",
        want: pick(typeA, typeB)
      };
    }
    const want = pick(typeA, typeB);
    if (kind !== want) {
      return {
        ok: false,
        error:
          want === "copper"
            ? "A PC into a switch port needs a straight-through cable, not a crossover."
            : "Two like devices need a crossover cable, not a straight-through.",
        want
      };
    }
    return { ok: true };
  }

  // Infrastructure to infrastructure: copper, crossover and fiber all come up.
  return { ok: true };
}

/** Does this link pass frames at all? */
function carriesData(typeA, typeB, cable) {
  return check(typeA, typeB, cable).ok;
}

module.exports = { CABLE_IDS, CABLE_LABELS, END_DEVICES, INFRASTRUCTURE, label, roleOf, pick, check, carriesData };
