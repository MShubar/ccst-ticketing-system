/**
 * The network printers.
 *
 * "I can't print" is one of the most common calls a support technician takes,
 * and almost none of it is networking: the printer is reachable, it just has
 * a jam, an empty tray, no toner, or a queue with a dead job at the front.
 * The lab's printers are already on the map with addresses of their own, so
 * they get a small panel a student can read and act on from the printer's own
 * console, and a `print` command on every PC to try a page through it.
 *
 * Everything here is state on the device, so a planted fault is as real as an
 * unplugged cable: the printer keeps the jam until somebody clears it.
 *
 * The Hardware tab is the bench: open the cover to clear a jam, pull the
 * tray to load paper, open the door to swap the toner. The console only
 * reads status / queue and runs online, offline, cancel and restart.
 */

/** How the printer leaves the stockroom. */
function defaultState() {
  return {
    status: "ready", // ready | jam | no-paper | no-toner | offline | held
    queue: 0, // jobs waiting behind whatever is wrong
    toner: 64, // percent
    tray: 380, // sheets
    pagesToday: 0,
    /** Physical access — Hardware tab only. */
    coverOpen: false, // jam path
    trayOut: false, // paper tray
    doorOpen: false, // toner door
    cartridgeIn: true
  };
}

const STATUSES = ["ready", "jam", "no-paper", "no-toner", "offline", "held"];

function normalizeState(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== "object") return base;
  const num = (value, fallback, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : fallback;
  };
  return {
    status: STATUSES.includes(saved.status) ? saved.status : base.status,
    queue: num(saved.queue, base.queue, 99),
    toner: num(saved.toner, base.toner, 100),
    tray: num(saved.tray, base.tray, 2000),
    pagesToday: num(saved.pagesToday, base.pagesToday, 99999),
    coverOpen: Boolean(saved.coverOpen),
    trayOut: Boolean(saved.trayOut),
    doorOpen: Boolean(saved.doorOpen),
    cartridgeIn: saved.cartridgeIn !== false
  };
}

/**
 * Why this printer is not printing, in the words the front panel would use.
 * `short` is the same thing cut down to fit the printer's box on the map.
 * Returns null when it is simply working.
 */
function blocked(state) {
  const p = normalizeState(state);
  if (p.status === "offline") {
    return {
      code: "offline",
      panel: "OFFLINE",
      short: "OFFLINE",
      say: "The printer is offline — its front panel has been taken off line."
    };
  }
  if (p.status === "jam") {
    return {
      code: "jam",
      panel: "PAPER JAM — TRAY 1",
      short: "PAPER JAM",
      say: "There is a paper jam in tray 1."
    };
  }
  if (p.status === "no-paper" || p.tray <= 0) {
    return { code: "no-paper", panel: "LOAD PAPER — TRAY 1", short: "LOAD PAPER", say: "Tray 1 is empty." };
  }
  if (p.status === "no-toner" || p.toner <= 0) {
    return {
      code: "no-toner",
      panel: "REPLACE TONER CARTRIDGE",
      short: "REPLACE TONER",
      say: "The toner cartridge is spent."
    };
  }
  if (p.status === "held") {
    return {
      code: "queue",
      panel: "PAUSED — JOBS HELD",
      short: "JOBS HELD",
      say: "The queue is paused: the job at the front of it failed, and everything behind it is waiting on it."
    };
  }
  return null;
}

/** The front panel, as a student would read it standing at the machine. */
function statusLines(hostname, state) {
  const p = normalizeState(state);
  const stop = blocked(p);
  return [
    "",
    `${hostname} — front panel`,
    "",
    `   Status . . . . . . . : ${stop ? stop.panel : "Ready"}`,
    `   Jobs in queue  . . . : ${p.queue}`,
    `   Toner  . . . . . . . : ${p.toner}%${p.toner <= 10 && p.toner > 0 ? "  (low)" : ""}`,
    `   Paper in tray 1  . . : ${p.tray} sheets`,
    `   Pages today  . . . . : ${p.pagesToday}`,
    ...(stop ? ["", `   ${stop.say}`] : [])
  ];
}

function queueLines(hostname, state) {
  const p = normalizeState(state);
  if (!p.queue) return ["", `${hostname}: the queue is empty.`];
  const stop = blocked(p);
  const out = ["", `${hostname} — print queue`, "", "  Job  Owner          Pages  Status", "  ---  -------------  -----  ------"];
  for (let i = 0; i < Math.min(p.queue, 8); i++) {
    const status = i === 0 ? (stop ? "Error - " + stop.panel : "Printing") : "Waiting";
    out.push(`  ${String(i + 1).padStart(3, " ")}  ${(i === 0 ? "first in queue" : "queued").padEnd(13)}  ${String(1 + (i % 4)).padStart(5)}  ${status}`);
  }
  if (p.queue > 8) out.push(`  ... and ${p.queue - 8} more`);
  return out;
}

/**
 * One maintenance action. Returns the lines to print and whether the device
 * state changed, so the caller can save it.
 */
/**
 * Once whatever was wrong is put right, the jobs that were waiting come out.
 * A student who clears a jam has fixed the call; making them cancel the queue
 * as well would be a lab rule rather than how a printer behaves.
 */
function drain(p) {
  if (!p.queue || blocked(p)) return 0;
  const printed = p.queue;
  p.queue = 0;
  p.pagesToday += printed;
  p.tray = Math.max(0, p.tray - printed);
  p.toner = Math.max(0, p.toner - printed);
  if (p.tray === 0) p.status = "no-paper";
  if (p.toner === 0) p.status = "no-toner";
  return printed;
}

function act(hostname, state, action, opts) {
  const p = normalizeState(state);
  const shortcut = Boolean(opts && opts.shortcut);
  const done = (lines) => ({ state: p, output: ["", ...lines], changed: true });
  const andDrain = (lines) => {
    const printed = drain(p);
    return done(printed ? [...lines, `${printed} job(s) that were waiting have printed.`] : lines);
  };

  if (action === "open-cover") {
    if (p.coverOpen) return { state: p, output: ["", `${hostname}: the access cover is already open.`] };
    p.coverOpen = true;
    return done([`${hostname}: access cover open — clear any jam, then close it.`]);
  }
  if (action === "close-cover") {
    if (!p.coverOpen) return { state: p, output: ["", `${hostname}: the access cover is already shut.`] };
    if (p.status === "jam") {
      return { state: p, output: ["", `${hostname}: clear the paper jam before you close the cover.`] };
    }
    p.coverOpen = false;
    return done([`${hostname}: access cover closed.`]);
  }
  if (action === "open-tray") {
    if (p.trayOut) return { state: p, output: ["", `${hostname}: tray 1 is already pulled out.`] };
    p.trayOut = true;
    return done([`${hostname}: tray 1 pulled out.`]);
  }
  if (action === "close-tray") {
    if (!p.trayOut) return { state: p, output: ["", `${hostname}: tray 1 is already in.`] };
    p.trayOut = false;
    return done([`${hostname}: tray 1 pushed home.`]);
  }
  if (action === "open-door") {
    if (p.doorOpen) return { state: p, output: ["", `${hostname}: the toner door is already open.`] };
    p.doorOpen = true;
    return done([`${hostname}: toner door open.`]);
  }
  if (action === "close-door") {
    if (!p.doorOpen) return { state: p, output: ["", `${hostname}: the toner door is already shut.`] };
    if (!p.cartridgeIn) {
      return { state: p, output: ["", `${hostname}: fit a toner cartridge before you close the door.`] };
    }
    p.doorOpen = false;
    return done([`${hostname}: toner door closed.`]);
  }
  if (action === "pull-toner") {
    if (!p.doorOpen && !shortcut) return { state: p, output: ["", `${hostname}: open the toner door first.`] };
    if (!p.doorOpen) p.doorOpen = true;
    if (!p.cartridgeIn) return { state: p, output: ["", `${hostname}: there is no cartridge in the bay.`] };
    p.cartridgeIn = false;
    p.toner = 0;
    if (p.status === "ready" || p.status === "held") p.status = "no-toner";
    return done([`${hostname}: toner cartridge removed.`]);
  }

  if (action === "clear") {
    if (p.status !== "jam") return { state: p, output: ["", `${hostname}: there is no jam to clear.`] };
    if (!p.coverOpen && !shortcut) {
      return { state: p, output: ["", `${hostname}: open the access cover first, then pull the jammed sheet out.`] };
    }
    if (!p.coverOpen) p.coverOpen = true;
    p.status = "ready";
    return andDrain([`${hostname}: jam cleared. The printer is warming up.`]);
  }
  if (action === "paper") {
    if (!p.trayOut && !shortcut) {
      return { state: p, output: ["", `${hostname}: pull tray 1 out first, then load the paper.`] };
    }
    if (!p.trayOut) p.trayOut = true;
    if (p.tray > 0 && p.status !== "no-paper") {
      return { state: p, output: ["", `${hostname}: tray 1 already has ${p.tray} sheets.`] };
    }
    p.tray = 500;
    if (p.status === "no-paper") p.status = "ready";
    return andDrain([`${hostname}: tray 1 loaded with 500 sheets.`]);
  }
  if (action === "toner") {
    if (!p.doorOpen && !shortcut) {
      return { state: p, output: ["", `${hostname}: open the toner door first.`] };
    }
    if (!p.doorOpen) p.doorOpen = true;
    if (p.cartridgeIn && p.toner > 0 && p.status !== "no-toner") {
      return {
        state: p,
        output: ["", `${hostname}: there is already a cartridge in — pull it out before fitting a new one.`]
      };
    }
    p.cartridgeIn = true;
    p.toner = 100;
    if (p.status === "no-toner") p.status = "ready";
    return andDrain([`${hostname}: new toner cartridge fitted.`]);
  }
  if (action === "cancel") {
    if (!p.queue) return { state: p, output: ["", `${hostname}: the queue is already empty.`] };
    const was = p.queue;
    p.queue = 0;
    if (p.status === "held") p.status = "ready";
    return done([`${hostname}: ${was} job(s) cancelled and the queue cleared.`]);
  }
  if (action === "online") {
    if (p.status !== "offline") return { state: p, output: ["", `${hostname}: the printer is already on line.`] };
    p.status = "ready";
    return andDrain([`${hostname}: back on line.`]);
  }
  if (action === "offline") {
    p.status = "offline";
    return done([`${hostname}: taken off line.`]);
  }
  if (action === "restart") {
    if (p.status === "jam" || p.status === "no-paper" || p.status === "no-toner") {
      return {
        state: p,
        output: [
          "",
          `${hostname}: restarting...`,
          "",
          `The printer came back with the same fault: ${blocked(p).say}`,
          "A restart does not fix something physical.",
          ""
        ],
        changed: true
      };
    }
    p.queue = 0;
    p.status = "ready";
    return done([`${hostname}: restarted. The queue was cleared and the printer is ready.`]);
  }
  return { state: p, output: [] };
}

/** A page sent from a PC. The printer either prints it or says why not. */
function submit(state) {
  const p = normalizeState(state);
  const stop = blocked(p);
  if (stop) {
    p.queue = Math.min(99, p.queue + 1);
    return { ok: false, state: p, reason: stop.code, say: stop.say, queue: p.queue };
  }
  p.tray = Math.max(0, p.tray - 1);
  p.toner = Math.max(0, p.toner - 1);
  p.pagesToday += 1;
  if (p.tray === 0) p.status = "no-paper";
  if (p.toner === 0) p.status = "no-toner";
  return { ok: true, state: p };
}

/** The fault families a ticket can plant on a printer. */
const FAULTS = {
  jam: {
    label: "paper jam",
    report: "It says paper jam and nothing comes out",
    apply: (p) => ({ ...p, status: "jam", queue: Math.max(3, p.queue + 3) }),
    fix: "Clear the jam at the printer, then let the queue print."
  },
  "no-paper": {
    label: "out of paper",
    report: "Nothing prints and there is a message on the little screen",
    apply: (p) => ({ ...p, status: "no-paper", tray: 0, queue: Math.max(2, p.queue + 2) }),
    fix: "Load tray 1."
  },
  "no-toner": {
    label: "toner spent",
    report: "The pages come out blank, or it will not print at all",
    apply: (p) => ({ ...p, status: "no-toner", toner: 0, queue: Math.max(1, p.queue + 1) }),
    fix: "Fit a new toner cartridge."
  },
  offline: {
    label: "taken off line",
    report: "Everyone's jobs just sit there and never print",
    apply: (p) => ({ ...p, status: "offline", queue: Math.max(4, p.queue + 4) }),
    fix: "Put the printer back on line and let the held jobs go."
  },
  queue: {
    label: "queue paused behind a held job",
    report: "My document is stuck in the queue and nobody else can print either",
    apply: (p) => ({ ...p, status: "held", queue: Math.max(6, p.queue + 6) }),
    fix: "Cancel the stuck jobs, or restart the printer to clear the queue."
  }
};

/** The order tickets deal printer faults out in. */
const TICKET_FAULTS = ["jam", "no-paper", "queue", "offline", "no-toner"];

function applyFault(state, faultId) {
  const spec = FAULTS[faultId];
  if (!spec) return normalizeState(state);
  return normalizeState(spec.apply(normalizeState(state)));
}

/** Has this printer been put right? Used to undo a retired ticket. */
function healthy(state) {
  const p = normalizeState(state);
  return !blocked(p) && p.queue === 0;
}

/**
 * Hardware-tab DTO — same shape the PC bench uses for the tab gate
 * (`serviceable`), with printer-specific fields for the interactive bench.
 */
function panelFor(state) {
  if (!state || state.os !== "printer") {
    return {
      serviceable: false,
      kind: "printer",
      note: "This is not a network printer.",
      zones: []
    };
  }
  const p = normalizeState(state.printer);
  const stop = blocked(p);
  const needsPaper = p.status === "no-paper" || p.tray <= 0;
  const needsToner = p.status === "no-toner" || p.toner <= 0 || !p.cartridgeIn;
  const hasJam = p.status === "jam";
  return {
    serviceable: true,
    kind: "printer",
    hostname: state.hostname || "PRINTER",
    status: p.status,
    toner: p.toner,
    tray: p.tray,
    queue: p.queue,
    pagesToday: p.pagesToday,
    coverOpen: p.coverOpen,
    trayOut: p.trayOut,
    doorOpen: p.doorOpen,
    cartridgeIn: p.cartridgeIn,
    blocked: stop,
    panel: stop ? stop.panel : "Ready",
    say: stop ? stop.say : "The printer is ready.",
    hint: hasJam
      ? "Open the access cover, pull the jammed sheet out, then close the cover."
      : needsPaper
        ? "Pull tray 1 out, load a ream, then push the tray home."
        : needsToner
          ? "Open the toner door, pull the spent cartridge, fit a new one, then close the door."
          : "Front panel and paper path look fine. Check the queue from the console if jobs are stuck.",
    zones: [
      {
        id: "cover",
        name: "Access cover",
        open: p.coverOpen,
        attention: hasJam,
        next: hasJam
          ? p.coverOpen
            ? "clear"
            : "open-cover"
          : p.coverOpen
            ? "close-cover"
            : null
      },
      {
        id: "tray",
        name: "Tray 1",
        open: p.trayOut,
        sheets: p.tray,
        attention: needsPaper,
        next: needsPaper
          ? !p.trayOut
            ? "open-tray"
            : p.tray <= 0
              ? "paper"
              : "close-tray"
          : p.trayOut
            ? "close-tray"
            : null
      },
      {
        id: "toner",
        name: "Toner cartridge",
        open: p.doorOpen,
        level: p.toner,
        cartridgeIn: p.cartridgeIn,
        attention: needsToner,
        next: needsToner
          ? !p.doorOpen
            ? "open-door"
            : p.cartridgeIn
              ? "pull-toner"
              : "toner"
          : p.doorOpen
            ? "close-door"
            : null
      }
    ]
  };
}

/**
 * Hardware POST for printers — same { ok, message, action } shape as the PC bench.
 */
function hardwareAct(state, body) {
  if (!state || state.os !== "printer") {
    return { ok: false, error: "This device is not a printer." };
  }
  const action = String((body && body.action) || "").toLowerCase();
  const allowed = new Set([
    "open-cover",
    "close-cover",
    "open-tray",
    "close-tray",
    "open-door",
    "close-door",
    "pull-toner",
    "clear",
    "paper",
    "toner",
    "online",
    "offline",
    "cancel",
    "restart"
  ]);
  if (!allowed.has(action)) {
    return {
      ok: false,
      error:
        "Unknown printer action. Use open-cover, close-cover, open-tray, close-tray, open-door, close-door, pull-toner, clear, paper or toner."
    };
  }
  const hostname = state.hostname || "PRINTER";
  const result = act(hostname, state.printer, action, { shortcut: false });
  const msg = (result.output || []).filter(Boolean).join(" ").trim();
  // act returns guidance lines even when nothing changed — treat "already" as soft ok.
  if (!result.changed && msg && /already|no jam|no cartridge|before you|first/i.test(msg)) {
    return { ok: false, error: msg.replace(/^[^:]+:\s*/, "") || msg };
  }
  state.printer = normalizeState(result.state);
  return {
    ok: true,
    message: msg || "Done.",
    action
  };
}

module.exports = {
  defaultState,
  normalizeState,
  drain,
  STATUSES,
  blocked,
  statusLines,
  queueLines,
  act,
  submit,
  FAULTS,
  TICKET_FAULTS,
  applyFault,
  healthy,
  panelFor,
  hardwareAct
};
