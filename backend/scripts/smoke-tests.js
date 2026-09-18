#!/usr/bin/env node
/**
 * Classroom judge / grade smoke tests — run with: npm test
 */
const assert = require("assert");
const ticketAi = require("../domain/tickets/ticket-ai");
const grading = require("../domain/tickets/grading");

async function test(name, fn) {
  try {
    await fn();
    console.log("ok —", name);
  } catch (err) {
    console.error("FAIL —", name);
    console.error(err);
    process.exitCode = 1;
  }
}

(async () => {
  await test("priority: cloud VM → critical", () => {
    assert.strictEqual(
      ticketAi.expectedPriorityFor({ generatedBy: { kind: "cloud-unreachable" }, title: "VM down" }),
      "critical"
    );
  });

  await test("priority: billing → high", () => {
    assert.strictEqual(
      ticketAi.expectedPriorityFor({ generatedBy: { kind: "cbs-invoice" }, title: "Invoice" }),
      "high"
    );
  });

  await test("priority: one PC offline → medium", () => {
    assert.strictEqual(
      ticketAi.expectedPriorityFor({ generatedBy: { kind: "pc-offline" }, title: "PC-S1 offline" }),
      "medium"
    );
  });

  await test("priority: password → low", () => {
    assert.strictEqual(
      ticketAi.expectedPriorityFor({ generatedBy: { kind: "password-reset" }, title: "Locked out" }),
      "low"
    );
  });

  await test("priority: all PCs in department → high", () => {
    assert.strictEqual(
      ticketAi.expectedPriorityFor({
        title: "All PCs in Sales have no network",
        description: "entire department is down"
      }),
      "high"
    );
  });

  await test("closed without lab fix is not good work", async () => {
    const ticket = {
      id: "TKT-TEST",
      title: "CLOUD-VM-WEB not responding",
      description: "cannot get to intranet",
      category: "Network",
      priority: "critical",
      status: "resolved",
      generatedBy: { kind: "cloud-unreachable" },
      fault: {
        type: "cable-unplugged",
        device: "CLOUD-VM-WEB",
        links: [{ a: "CLOUD-VM-WEB:Fa0", b: "SW-CLOUD:Fa1" }]
      },
      comments: [{ body: "Resolved." }],
      escalationLevel: 1
    };
    const bad = await ticketAi.reviewTicket(ticket, {
      mapState: { links: [] },
      devices: { devices: {} }
    });
    assert.strictEqual(bad.mark, "needs-work");
    assert.strictEqual(bad.processOk, false);

    const good = await ticketAi.reviewTicket(ticket, {
      mapState: { links: [{ a: "CLOUD-VM-WEB:Fa0", b: "SW-CLOUD:Fa1" }] },
      devices: { devices: {} }
    });
    assert.strictEqual(good.mark, "good");
  });

  await test("grading weights include resolution heavily, not FCR", () => {
    assert.strictEqual(grading.WEIGHTS.resolution, 45);
    assert.strictEqual(grading.WEIGHTS.sla, 20);
    assert.strictEqual(grading.WEIGHTS.reviews, 20);
    assert.strictEqual(grading.WEIGHTS.priority, 10);
    assert.strictEqual(grading.WEIGHTS.process, 5);
    assert.strictEqual(grading.WEIGHTS.fcr, undefined);
  });

  await test("gradeStudent returns pass band for strong scores", () => {
    const tickets = [
      { status: "resolved", review: { mark: "good", priorityOk: true, processOk: true, body: "ok" } },
      { status: "closed", review: { mark: "good", priorityOk: true, processOk: true, body: "ok" } }
    ];
    const grade = grading.gradeStudent(
      { slaCompliance: 100, total: 2, resolved: 2, backlog: 0 },
      tickets
    );
    assert.ok(grade.score >= 70);
    assert.strictEqual(grade.band.key, "pass");
  });

  await test("unresolved tickets drop the grade heavily", () => {
    const tickets = [
      { status: "resolved", review: { mark: "good", priorityOk: true, processOk: true, body: "ok" } },
      { status: "open", review: { mark: "good", priorityOk: true, processOk: true, body: "ok" } }
    ];
    const grade = grading.gradeStudent(
      { slaCompliance: 100, total: 2, resolved: 1, backlog: 1 },
      tickets
    );
    assert.ok(grade.score < 70, `expected score < 70, got ${grade.score}`);
    const resPart = grade.parts.find((p) => p.key === "resolution");
    assert.ok(resPart.raw < 50, `expected steep resolution score, got ${resPart.raw}`);
  });

  await test("hardware panel does not reveal the fault before inspection", () => {
    const hardware = require("../domain/lab/hardware");
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    hardware.plant(state, "disk-failed");
    const part = hardware.panelFor(state, "PC-T").components.find((c) => c.id === "disk");
    assert.strictEqual(part.status, "unknown");
    assert.strictEqual(part.revealed, false);
    assert.strictEqual(part.found, "");
  });

  await test("replacing a part takes the whole bench sequence, not one button", () => {
    const hardware = require("../domain/lab/hardware");
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    hardware.plant(state, "disk-failed");
    const act = (body) => hardware.act(state, body);

    // A failed drive cannot even be seen, let alone swapped, from outside.
    assert.strictEqual(act({ action: "inspect", component: "disk" }).ok, false);
    assert.strictEqual(act({ action: "extract", component: "disk" }).ok, false);

    act({ action: "power", on: false });
    act({ action: "select-tool", tool: "screwdriver" });
    for (let i = 0; i < hardware.SCREW_COUNT; i++) act({ action: "unscrew" });
    act({ action: "remove-panel" });
    assert.strictEqual(act({ action: "inspect", component: "disk" }).ok, true);

    // Leads first, then screws, then the part itself.
    act({ action: "select-tool", tool: "hands" });
    assert.match(act({ action: "extract", component: "disk" }).error, /data cable/i);
    act({ action: "unplug", component: "disk", cable: "data" });
    assert.match(act({ action: "extract", component: "disk" }).error, /power lead/i);
    act({ action: "unplug", component: "disk", cable: "power" });
    assert.match(act({ action: "extract", component: "disk" }).error, /screw/i);
    act({ action: "select-tool", tool: "screwdriver" });
    for (let i = 0; i < 4; i++) act({ action: "unscrew-part", component: "disk" });
    act({ action: "select-tool", tool: "hands" });
    assert.strictEqual(act({ action: "extract", component: "disk" }).ok, true);

    // A spare only goes in from the rack, only into a bay it fits, and only
    // when the capacity matches what that machine was built with.
    assert.strictEqual(act({ action: "fit", component: "disk" }).ok, false);
    act({ action: "select-tool", tool: "spares" });
    assert.strictEqual(act({ action: "fit", component: "disk" }).ok, false);
    assert.match(act({ action: "fit", component: "disk", spare: "psu-450" }).error, /does not fit/i);
    const need = state.service.parts.disk.match;
    const wrongDisk = hardware.SPARES.find((s) => s.fits.includes("disk") && s.match !== need);
    const rightDisk = hardware.SPARES.find((s) => s.match === need);
    assert.ok(wrongDisk && rightDisk, "expected multiple disk spares");
    assert.match(act({ action: "fit", component: "disk", spare: wrongDisk.id }).error, /wrong size/i);
    assert.strictEqual(act({ action: "fit", component: "disk", spare: rightDisk.id }).ok, true);

    // The case will not close on a half-built machine.
    assert.strictEqual(act({ action: "fit-panel" }).ok, false);
    act({ action: "select-tool", tool: "screwdriver" });
    for (let i = 0; i < 4; i++) act({ action: "screw-part", component: "disk" });
    act({ action: "select-tool", tool: "hands" });
    act({ action: "plug", component: "disk", cable: "data" });
    act({ action: "plug", component: "disk", cable: "power" });
    assert.strictEqual(act({ action: "fit-panel" }).ok, true);
    assert.strictEqual(act({ action: "power", on: true }).ok, true);
    assert.strictEqual(hardware.block(state), null);
  });

  await test("a loose lead has to come out before it will seat", () => {
    const hardware = require("../domain/lab/hardware");
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    hardware.plant(state, "display-loose");
    hardware.act(state, { action: "inspect", component: "display" });
    hardware.act(state, { action: "select-tool", tool: "hands" });
    // Pushing a half-seated plug harder is not a fix.
    assert.strictEqual(hardware.act(state, { action: "plug", component: "display", cable: "video" }).ok, false);
    hardware.act(state, { action: "unplug", component: "display", cable: "video" });
    assert.strictEqual(hardware.act(state, { action: "plug", component: "display", cable: "video" }).ok, true);
    assert.strictEqual(state.hw.display, null);
  });

  await test("pulling the mains on a running machine is refused", () => {
    const hardware = require("../domain/lab/hardware");
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    hardware.act(state, { action: "select-tool", tool: "hands" });
    const res = hardware.act(state, { action: "unplug", component: "psu", cable: "mains" });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /shut the machine down/i);
  });

  await test("the screw you click is the screw that comes out", () => {
    const hardware = require("../domain/lab/hardware");
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    hardware.act(state, { action: "power", on: false });
    hardware.act(state, { action: "select-tool", tool: "screwdriver" });
    // Top screw is index 0 — it must leave a hole at the top, not the bottom.
    assert.strictEqual(hardware.act(state, { action: "unscrew", index: 0 }).ok, true);
    assert.deepStrictEqual(state.service.panelScrews, [false, true, true, true]);
    assert.strictEqual(hardware.act(state, { action: "unscrew", index: 0 }).ok, false);
    assert.strictEqual(hardware.act(state, { action: "unscrew", index: 2 }).ok, true);
    assert.deepStrictEqual(state.service.panelScrews, [false, true, false, true]);
    // Putting a screw back goes into the hole you clicked.
    assert.strictEqual(hardware.act(state, { action: "screw", index: 0 }).ok, true);
    assert.deepStrictEqual(state.service.panelScrews, [true, true, false, true]);
  });

  await test("memory is held by clips, so it has no mounting screws", () => {
    const hardware = require("../domain/lab/hardware");
    assert.strictEqual(hardware.PART_SCREWS.ram1, undefined);
    assert.strictEqual(hardware.PART_SCREWS.nic, 1);
    assert.strictEqual(hardware.PART_SCREWS.psu, 4);
  });

  await test("map presence shares classmates and hides yourself", () => {
    const presence = require("../domain/map/map-presence");
    const a = { id: "u-a", fullName: "Ava Student", role: "technician" };
    const b = { id: "u-b", fullName: "Ben Student", role: "technician" };
    assert.strictEqual(presence.touch("class-1", a, 100, 200), true);
    assert.strictEqual(presence.touch("class-1", b, 300, 400), true);
    const forA = presence.list("class-1", a.id);
    assert.strictEqual(forA.length, 1);
    assert.strictEqual(forA[0].userId, b.id);
    assert.strictEqual(forA[0].x, 300);
    assert.strictEqual(forA[0].y, 400);
    presence.leave("class-1", b.id);
    assert.strictEqual(presence.list("class-1", a.id).length, 0);
    presence.leave("class-1", a.id);
  });

  await test("map presence rejects bad coords and stays class-scoped", () => {
    const presence = require("../domain/map/map-presence");
    const a = { id: "u-a", fullName: "Ava", role: "technician" };
    const b = { id: "u-b", fullName: "Ben", role: "technician" };
    assert.strictEqual(presence.touch("class-1", a, Number.NaN, 10), false);
    assert.strictEqual(presence.touch("class-1", a, 50, 60), true);
    assert.strictEqual(presence.touch("class-2", b, 70, 80), true);
    assert.strictEqual(presence.list("class-1", "nobody").length, 1);
    assert.strictEqual(presence.list("class-1", "nobody")[0].userId, a.id);
    presence.leave("class-1", a.id);
    presence.leave("class-2", b.id);
  });

  await test("spare rack has several sizes and only the matching one seats", () => {
    const hardware = require("../domain/lab/hardware");
    const disks = hardware.SPARES.filter((s) => s.fits.includes("disk"));
    const rams = hardware.SPARES.filter((s) => s.fits.includes("ram1"));
    const psus = hardware.SPARES.filter((s) => s.fits.includes("psu"));
    assert.ok(disks.length >= 3, `expected several disk spares, got ${disks.length}`);
    assert.ok(rams.length >= 3, `expected several RAM spares, got ${rams.length}`);
    assert.ok(psus.length >= 3, `expected several PSU spares, got ${psus.length}`);
    const state = {
      kind: "host",
      os: "pc",
      hostname: "PC-T",
      hw: hardware.defaultHw(),
      service: hardware.defaultService()
    };
    // Open the case and empty the bay so fit matching can be checked.
    const act = (body) => hardware.act(state, body);
    act({ action: "power", on: false });
    act({ action: "select-tool", tool: "screwdriver" });
    for (let i = 0; i < hardware.SCREW_COUNT; i++) act({ action: "unscrew" });
    act({ action: "remove-panel" });
    act({ action: "select-tool", tool: "hands" });
    act({ action: "unplug", component: "disk", cable: "data" });
    act({ action: "unplug", component: "disk", cable: "power" });
    act({ action: "select-tool", tool: "screwdriver" });
    for (let i = 0; i < 4; i++) act({ action: "unscrew-part", component: "disk" });
    act({ action: "select-tool", tool: "hands" });
    act({ action: "extract", component: "disk" });
    act({ action: "select-tool", tool: "spares" });
    const need = state.service.parts.disk.match;
    const panel = hardware.panelFor(state, "PC-T");
    const disk = panel.components.find((c) => c.id === "disk");
    assert.strictEqual(disk.match, need);
    assert.ok(disk.neededSpare);
    assert.strictEqual(hardware.spareMatchesBay(disks.find((s) => s.match !== need).id, "disk", need), false);
    assert.strictEqual(hardware.spareMatchesBay(disks.find((s) => s.match === need).id, "disk", need), true);
  });

  /* ---------------------------------------------------------------- *
   * The networking that was added for CCST IT Support: DHCP, cables,
   * duplicate addressing, printers, Wi-Fi and IPv6.
   * ---------------------------------------------------------------- */

  const lab = () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const topo = labMap.topology();
    const links = labMap.defaultLinks();
    const states = net.defaultDeviceStates();
    const sessions = {};
    const run = (deviceId, command) => {
      const res = net.execute({ topo, links: lab.links || links, states, deviceId, session: sessions[deviceId], command });
      sessions[deviceId] = res.session;
      return res.output.join("\n");
    };
    return { labMap, net, topo, links, states, run };
  };

  await test("the shipped design uses a cable that works on every link", () => {
    const labMap = require("../domain/lab/lab-map");
    const cabling = require("../domain/lab/cabling");
    const topo = labMap.topology();
    const typeOf = new Map(topo.nodes.map((n) => [n.id, n.type]));
    const bad = labMap.defaultLinks().filter((l) => {
      const a = String(l.a).split(":")[0];
      const b = String(l.b).split(":")[0];
      return !cabling.check(typeOf.get(a), typeOf.get(b), l.cable).ok;
    });
    assert.deepStrictEqual(bad.map((l) => `${l.a}->${l.b} (${l.cable})`), []);
  });

  await test("a class carried forward from an old schema still reaches the hosted cloud", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const topo = labMap.topology();
    // How a long-running class was actually cabled: SW-CLOUD still plugged
    // straight into the Batelco core on the port the design used at v4, and
    // the VMs added since sitting on ports that were already taken.
    const stale = labMap
      .defaultLinks()
      .filter((l) => !/^(SW-CLOUD|CLOUD-VM-|Keratin-Glow|Safqa|R-AZURE|BAT-DUBAI)/.test(`${l.a} ${l.b}`))
      .filter((l) => l.a !== "BAT-HAMALA:Gi0/5" && l.b !== "BAT-HAMALA:Gi0/5")
      .concat([
        { a: "SW-CLOUD:Gi0/2", b: "BAT-HAMALA:Gi0/5", cable: "fiber" },
        { a: "CLOUD-VM-AD:Fa0", b: "SW-CLOUD:Fa0/1", cable: "copper" }
      ]);

    const migrated = labMap.normalizeLinks(labMap.migrateLinks(stale, 4).links, topo);
    const states = net.defaultDeviceStates();
    const verdict = net.pingCheck(topo, migrated, states, "PC-F1", "10.10.70.21");
    assert.strictEqual(verdict.ok, true, `cloud unreachable after migration: ${verdict.reason}`);
    // And by the documented path, not by whatever happened to be left plugged.
    assert.deepStrictEqual(verdict.hops.slice(-4), ["203.0.113.1", "203.0.113.26", "203.0.113.30", "10.10.70.21"]);
    assert.strictEqual(net.dhcpRequest(topo, migrated, states, "LT-REC1").ok, true);
    // Migrations that splice design cables back in used to reuse L0xx numbers
    // the class already had, and the map then dropped one of the two — usually
    // the HQ↔Seef handoff. Every id must be unique after normalize.
    assert.strictEqual(migrated.length, new Set(migrated.map((l) => l.id)).size);
    assert.ok(
      migrated.some(
        (l) =>
          (l.a === "BAT-SEEF:Gi0/2" && l.b === "R1-EDGE:Gi0/2") ||
          (l.b === "BAT-SEEF:Gi0/2" && l.a === "R1-EDGE:Gi0/2")
      ),
      "HQ edge must still reach Batelco through Seef"
    );
  });

  await test("two students can plug different cables without wiping each other", () => {
    const labMap = require("../domain/lab/lab-map");
    const topo = labMap.topology();
    let links = labMap.defaultLinks().filter((l) => !/^PC-S1:|^PC-S2:/.test(l.a) && !/^PC-S1:|^PC-S2:/.test(l.b));
    const a = labMap.applyLinkOp(links, topo, { action: "plug", a: "PC-S1:Fa0", b: "SW-SALES:Fa0/1" });
    assert.strictEqual(a.ok, true, a.error);
    links = a.links;
    const b = labMap.applyLinkOp(links, topo, { action: "plug", a: "PC-S2:Fa0", b: "SW-SALES:Fa0/2" });
    assert.strictEqual(b.ok, true, b.error);
    links = b.links;
    assert.ok(links.some((l) => l.a === "PC-S1:Fa0" || l.b === "PC-S1:Fa0"));
    assert.ok(links.some((l) => l.a === "PC-S2:Fa0" || l.b === "PC-S2:Fa0"));
    const clash = labMap.applyLinkOp(links, topo, { action: "plug", a: "PC-S3:Fa0", b: "SW-SALES:Fa0/1" });
    assert.strictEqual(clash.ok, false);
    const pull = labMap.applyLinkOp(links, topo, { action: "unplug", a: "PC-S1:Fa0", b: "SW-SALES:Fa0/1" });
    assert.strictEqual(pull.ok, true, pull.error);
    assert.ok(!pull.links.some((l) => l.a === "PC-S1:Fa0" || l.b === "PC-S1:Fa0"));
    assert.ok(pull.links.some((l) => l.a === "PC-S2:Fa0" || l.b === "PC-S2:Fa0"));
  });

  await test("a console cable carries no traffic and a fiber lead will not go in a PC", () => {
    const cabling = require("../domain/lab/cabling");
    assert.strictEqual(cabling.check("pc", "switch", "copper").ok, true);
    assert.strictEqual(cabling.check("pc", "switch", "console").ok, false);
    assert.strictEqual(cabling.check("switch", "switch", "console").ok, false);
    assert.strictEqual(cabling.check("pc", "switch", "fiber").ok, false);
    assert.strictEqual(cabling.check("pc", "switch", "crossover").ok, false);
    // Like devices take a crossover; infrastructure ports are auto-MDIX.
    assert.strictEqual(cabling.check("pc", "router", "crossover").ok, true);
    assert.strictEqual(cabling.check("switch", "switch", "crossover").ok, true);
    assert.strictEqual(cabling.check("router", "router", "copper").ok, true);
    assert.strictEqual(cabling.check("switch", "router", "fiber").ok, true);
    // The map picks these itself — no toolbar — so every common pair must
    // land on a lead that actually carries traffic.
    assert.strictEqual(cabling.pick("pc", "switch"), "copper");
    assert.strictEqual(cabling.pick("printer", "switch"), "copper");
    assert.strictEqual(cabling.pick("pc", "router"), "crossover");
    assert.strictEqual(cabling.pick("switch", "switch"), "crossover");
    assert.strictEqual(cabling.pick("cloud", "router"), "fiber");
    assert.strictEqual(cabling.pick("router", "router"), "copper");
    assert.strictEqual(cabling.check("pc", "switch", cabling.pick("pc", "switch")).ok, true);
  });

  await test("the wrong cable reads as media disconnected, not as an addressing fault", () => {
    const { labMap, net, topo, states } = lab();
    const links = labMap
      .defaultLinks()
      .map((l) => (l.a.startsWith("PC-F2:") || l.b.startsWith("PC-F2:") ? { ...l, cable: "console" } : l));
    const verdict = net.pingCheck(topo, links, states, "PC-F2", "10.10.20.1");
    assert.strictEqual(verdict.ok, false);
    assert.strictEqual(verdict.reason, "wrong-cable");
    assert.match(verdict.detail, /console cable/i);
    const out = net.execute({ topo, links, states, deviceId: "PC-F2", session: null, command: "ipconfig" }).output.join("\n");
    assert.match(out, /Media disconnected/);
  });

  await test("ipconfig /renew only gets an address when the DHCP server can really answer", () => {
    const { net, topo, links, states, run } = lab();
    const dhcp = require("../domain/lab/dhcp");
    // As designed: the lease is the documented address.
    assert.match(run("LT-REC1", "ipconfig /renew"), /10\.10\.40\.61/);

    // Service stopped: the request gets to the server and is refused.
    states.devices[dhcp.SERVER_ID].dhcpService.enabled = false;
    const stopped = run("LT-REC1", "ipconfig /renew");
    assert.match(stopped, /169\.254\./);
    assert.match(stopped, /service is not running/i);
    assert.strictEqual(net.pingCheck(topo, links, states, "LT-REC1", "10.10.70.20").ok, false);

    // Started again from the server's own console: a real lease comes back.
    run(dhcp.SERVER_ID, "dhcp start");
    assert.match(run("LT-REC1", "ipconfig /renew"), /10\.10\.40\.61/);
    assert.strictEqual(net.pingCheck(topo, links, states, "LT-REC1", "10.10.70.20").ok, true);
  });

  await test("every desk, printer and laptop on the map can get a lease, branches included", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const topo = labMap.topology();
    const links = labMap.defaultLinks();
    const states = net.defaultDeviceStates();
    // A DHCP ticket planted at a branch has to be solvable, which means the
    // branch router has to relay from the leg facing the client rather than
    // from its circuit out to the provider.
    const stuck = topo.nodes
      .filter((n) => ["pc", "printer", "laptop"].includes(n.type))
      .filter((n) => {
        const state = states.devices[n.id];
        const was = state.dhcp;
        state.dhcp = true;
        const offer = net.dhcpRequest(topo, links, states, n.id);
        state.dhcp = was;
        return !offer.ok;
      })
      .map((n) => n.id);
    assert.deepStrictEqual(stuck, []);
  });

  await test("a DHCP server that cannot be reached gives a link-local address", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const topo = labMap.topology();
    const states = net.defaultDeviceStates();
    // Pull the DHCP VM's cable: the relay is up, the server is not.
    const links = labMap.defaultLinks().filter((l) => !l.a.startsWith("CLOUD-VM-DHCP:") && !l.b.startsWith("CLOUD-VM-DHCP:"));
    const offer = net.dhcpRequest(topo, links, states, "PC-F1");
    assert.strictEqual(offer.ok, false);
    assert.strictEqual(offer.reason, "server-unreachable");
    const out = net
      .execute({ topo, links, states, deviceId: "LT-REC1", session: null, command: "ipconfig /renew" })
      .output.join("\n");
    assert.match(out, /169\.254\./);
  });

  await test("a duplicate address is refused and a bad gateway is explained", () => {
    const { net, topo, links, states, run } = lab();
    const clash = run("PC-F3", "ip 10.10.20.10 255.255.255.0 10.10.20.1");
    assert.match(clash, /already in use by PC-F1/);
    assert.strictEqual(states.devices["PC-F3"].ipConflict, true);
    const verdict = net.pingCheck(topo, links, states, "PC-F3", "10.10.20.1");
    assert.strictEqual(verdict.ok, false);
    assert.strictEqual(verdict.reason, "address-conflict");

    const warned = run("PC-F4", "ip 10.10.20.44 255.255.255.0 10.10.99.1");
    assert.match(warned, /not inside this PC's own subnet/);
    assert.match(run("PC-F4", "ip 10.10.20.44 255.255.255.129"), /not a valid subnet mask/);
  });

  await test("an address from another floor reaches nothing, not even the router next to it", () => {
    const { net, topo, links, states } = lab();
    const pc = states.devices["PC-WH6"];
    pc.dhcp = false;
    pc.ip = "10.10.55.15";
    pc.gateway = "10.10.50.1";
    // The gateway is on the wire and will answer an ARP, so the temptation is
    // to let the ping through. It must not: the reply is addressed to a subnet
    // that lives in another department and is routed there.
    for (const target of ["10.10.50.1", "10.10.50.10", "10.10.70.20"]) {
      const verdict = net.pingCheck(topo, links, states, "PC-WH6", target);
      assert.strictEqual(verdict.ok, false, `${target} should not answer`);
      assert.strictEqual(verdict.reason, "wrong-subnet");
    }
    pc.ip = "10.10.50.15";
    assert.strictEqual(net.pingCheck(topo, links, states, "PC-WH6", "10.10.70.20").ok, true);
  });

  await test("a printer says what is wrong, and a restart does not mend a jam", () => {
    const { states, run } = lab();
    const printers = require("../domain/lab/printers");
    states.devices["PRN-FIN"].printer = printers.applyFault(states.devices["PRN-FIN"].printer, "jam");
    assert.match(run("PRN-FIN", "status"), /PAPER JAM/);
    // The network is fine, which is the point: the test page reaches it.
    const page = run("PC-F1", "print PRN-FIN");
    assert.match(page, /not a network fault/);
    assert.match(run("PRN-FIN", "restart"), /does not fix something physical/);
    assert.match(run("PRN-FIN", "clear"), /Hardware-tab/);
    const printersMod = printers;
    let prn = states.devices["PRN-FIN"].printer;
    prn = printersMod.act("PRN-FIN", prn, "open-cover").state;
    const cleared = printersMod.act("PRN-FIN", prn, "clear");
    states.devices["PRN-FIN"].printer = cleared.state;
    assert.match(cleared.output.join("\n"), /jam cleared/);
    assert.match(cleared.output.join("\n"), /have printed/);
    assert.strictEqual(printersMod.healthy(states.devices["PRN-FIN"].printer), true);
    assert.match(run("PC-F1", "print PRN-FIN"), /The page printed/);
  });

  await test("a laptop is on the network through its access point, and off it when the key is wrong", () => {
    const { net, topo, links, states, run } = lab();
    assert.strictEqual(net.pingCheck(topo, links, states, "LT-WH1", "10.10.70.20").ok, true);
    const assoc = net.wirelessLinks(topo, states).find((a) => a.a.startsWith("LT-WH1:"));
    assert.strictEqual(assoc.b.startsWith("AP-WH:"), true);

    states.devices["LT-WH1"].wifi.key = "wrong-key";
    assert.strictEqual(net.wirelessLinks(topo, states).some((a) => a.a.startsWith("LT-WH1:")), false);
    assert.match(run("LT-WH1", "wifi"), /wireless key does not match/);
    assert.match(run("LT-WH1", "wifi join ProCloud-Staff Bahrain#2024"), /Connected to/);
    assert.strictEqual(net.pingCheck(topo, links, states, "LT-WH1", "10.10.70.20").ok, true);

    // An access point with its radio down takes its room off the air.
    states.devices["AP-WH"].radio.enabled = false;
    assert.strictEqual(net.wirelessLinks(topo, states).some((a) => a.a.startsWith("LT-WH1:")), false);
  });

  await test("each Wi-Fi fault has a repair that ends with a real address", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const labFaults = require("../domain/lab/lab-faults");
    const topo = labMap.topology();
    const links = labMap.defaultLinks();

    const repairs = {
      "radio-off": [["LT-OPS1", "wifi on"]],
      "wrong-key": [["LT-OPS1", "wifi join ProCloud-Staff Bahrain#2024"]],
      "wrong-ssid": [["LT-OPS1", "wifi join ProCloud-Staff Bahrain#2024"]],
      "ap-radio-down": [
        ["AP-OPS", "enable"],
        ["AP-OPS", "configure terminal"],
        ["AP-OPS", "dot11 enable"],
        ["LT-OPS1", "ipconfig /renew"]
      ]
    };

    for (const [variant, steps] of Object.entries(repairs)) {
      const states = net.defaultDeviceStates();
      const fault = labFaults.plant("wifi-offline", { variant }, states, "LT-OPS1");
      const ticket = { fault, status: "open", generatedBy: { kind: "wifi-offline" } };
      assert.strictEqual(ticketAi.labFaultFixed(ticket, { links }, states), false, `${variant} starts broken`);
      const sessions = {};
      for (const [deviceId, command] of steps) {
        const res = net.execute({ topo, links, states, deviceId, session: sessions[deviceId], command });
        sessions[deviceId] = res.session;
      }
      assert.strictEqual(ticketAi.labFaultFixed(ticket, { links }, states), true, `${variant} was not repaired`);
      // Switching a radio back on has to leave the laptop with a lease, not
      // just an association, or it reads as a second fault.
      assert.strictEqual(states.devices["LT-OPS1"].ip, "10.10.45.61", `${variant} left no address`);
    }
  });

  await test("a wireless slot cannot be cabled into", () => {
    const labMap = require("../domain/lab/lab-map");
    const topo = labMap.topology();
    const kept = labMap.normalizeLinks(
      [
        { a: "LT-REC1:Wlan0", b: "SW-REC:Fa0/6", cable: "copper" },
        { a: "PC-REC1:Fa0", b: "SW-REC:Fa0/1", cable: "copper" }
      ],
      topo
    );
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0].a, "PC-REC1:Fa0");
  });

  await test("ipconfig /all shows a MAC address and both IPv6 addresses", () => {
    const { run, net } = lab();
    const out = run("PC-F1", "ipconfig /all");
    assert.match(out, /Physical Address.*: [0-9A-F]{2}(-[0-9A-F]{2}){5}/);
    assert.match(out, /Link-local IPv6 Address.*: fe80::/);
    assert.match(out, /IPv6 Address.*: 2001:db8:10:20::10/);
    // Stable per device, and no link-local global address for an APIPA host.
    assert.strictEqual(net.macFor("PC-F1", "Fa0"), net.macFor("PC-F1", "Fa0"));
    assert.notStrictEqual(net.macFor("PC-F1", "Fa0"), net.macFor("PC-F2", "Fa0"));
    assert.strictEqual(net.globalV6("169.254.3.4"), "");
  });

  await test("every device fault plants, reads true on the device and can be undone", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const labFaults = require("../domain/lab/lab-faults");
    const topo = labMap.topology();
    const links = labMap.defaultLinks();

    const cases = [
      { kind: "dhcp-no-address", device: "PC-F5", detail: { variant: "service-stopped" } },
      { kind: "dhcp-no-address", device: "PC-F5", detail: { variant: "scope-full" } },
      { kind: "pc-misconfigured", device: "PC-HR2", detail: { variant: "wrong-subnet" } },
      { kind: "pc-misconfigured", device: "PC-HR2", detail: { variant: "duplicate" } },
      { kind: "printer-fault", device: "PRN-OPS", detail: { fault: "no-paper" } },
      { kind: "wifi-offline", device: "LT-BRA1", detail: { variant: "ap-radio-down" } }
    ];

    for (const c of cases) {
      const states = net.defaultDeviceStates();
      const before = JSON.stringify(states.devices[c.device]);
      const fault = labFaults.plant(c.kind, c.detail, states, c.device);
      assert.ok(fault, `${c.kind}/${c.detail.variant || c.detail.fault} did not plant`);
      const ticket = { fault, status: "open", generatedBy: { kind: c.kind } };
      assert.strictEqual(ticketAi.isLabMapTicket(ticket), true);
      assert.strictEqual(
        ticketAi.labFaultFixed(ticket, { links }, states),
        false,
        `${c.kind}/${c.detail.variant || c.detail.fault} should read as unfixed`
      );
      assert.strictEqual(labFaults.undo(fault, states), true);
      assert.strictEqual(JSON.stringify(states.devices[c.device]), before, `${c.kind} did not undo cleanly`);
      assert.strictEqual(ticketAi.labFaultFixed(ticket, { links }, states), true);
      // A cable fault on the same device is unaffected by all of this.
      assert.strictEqual(net.pingCheck(topo, links, states, c.device === "PRN-OPS" ? "PC-OPS1" : c.device, "10.10.70.11").ok, true);
    }
  });

  await test("every variant a ticket can plant has a repair a student can type", () => {
    const labMap = require("../domain/lab/lab-map");
    const net = require("../domain/lab/net-sim");
    const labFaults = require("../domain/lab/lab-faults");
    const topo = labMap.topology();
    const links = labMap.defaultLinks();

    // One row per variant the planner can deal, with the commands a student
    // would work out from the Knowledge base. If a variant ever loses its
    // repair the ticket becomes unsolvable, which is the worst failure here.
    const cases = [
      ["pc-misconfigured", { variant: "wrong-subnet" }, "PC-HR2", [["PC-HR2", "ip 10.10.30.11 255.255.255.0 10.10.30.1"]]],
      ["pc-misconfigured", { variant: "bad-gateway" }, "PC-HR2", [["PC-HR2", "ip 10.10.30.11 255.255.255.0 10.10.30.1"]]],
      ["pc-misconfigured", { variant: "wrong-mask" }, "PC-HR2", [["PC-HR2", "ip 10.10.30.11 255.255.255.0 10.10.30.1"]]],
      ["pc-misconfigured", { variant: "duplicate" }, "PC-HR2", [["PC-HR2", "ip 10.10.30.11 255.255.255.0 10.10.30.1"]]],
      ["dhcp-no-address", { variant: "service-stopped" }, "PC-F5", [["CLOUD-VM-DHCP", "dhcp start"], ["PC-F5", "ipconfig /renew"]]],
      ["dhcp-no-address", { variant: "scope-full" }, "PC-F5", [["CLOUD-VM-DHCP", "dhcp reset"], ["PC-F5", "ipconfig /renew"]]],
      ["dhcp-no-address", { variant: "bad-gateway-option" }, "PC-F5", [["CLOUD-VM-DHCP", "dhcp reset"], ["PC-F5", "ipconfig /renew"]]],
      ["printer-fault", { fault: "jam" }, "PRN-OPS", { hardware: ["open-cover", "clear"] }],
      ["printer-fault", { fault: "no-paper" }, "PRN-OPS", { hardware: ["open-tray", "paper"] }],
      ["printer-fault", { fault: "no-toner" }, "PRN-OPS", { hardware: ["open-door", "pull-toner", "toner"] }],
      ["printer-fault", { fault: "offline" }, "PRN-OPS", [["PRN-OPS", "online"]]],
      ["printer-fault", { fault: "queue" }, "PRN-OPS", [["PRN-OPS", "cancel"]]]
    ];

    for (const [kind, detail, device, steps] of cases) {
      const name = `${kind}/${detail.variant || detail.fault}`;
      const states = net.defaultDeviceStates();
      const fault = labFaults.plant(kind, detail, states, device);
      const ticket = { fault, status: "open", generatedBy: { kind } };
      assert.strictEqual(ticketAi.labFaultFixed(ticket, { links }, states), false, `${name} starts broken`);
      if (steps && steps.hardware) {
        const printers = require("../domain/lab/printers");
        for (const action of steps.hardware) {
          const result = printers.act(device, states.devices[device].printer, action);
          states.devices[device].printer = result.state;
          assert.ok(result.changed !== false || /already|no jam|already has/i.test((result.output || []).join(" ")), `${name} ${action} applied`);
        }
      } else {
        const sessions = {};
        for (const [deviceId, command] of steps) {
          const res = net.execute({ topo, links, states, deviceId, session: sessions[deviceId], command });
          sessions[deviceId] = res.session;
        }
      }
      assert.strictEqual(ticketAi.labFaultFixed(ticket, { links }, states), true, `${name} was not repaired`);
    }
  });

  await test("the new families are in the default mix and keep their own priority", () => {
    const mix = ticketAi.defaultMix();
    for (const kind of ticketAi.DEVICE_FAULT_KINDS) {
      assert.ok(mix[kind] >= 1, `${kind} is not in the default mix`);
    }
    assert.strictEqual(ticketAi.expectedPriorityFor({ generatedBy: { kind: "printer-fault" }, title: "PRN-FIN" }), "medium");
    assert.strictEqual(ticketAi.expectedPriorityFor({ generatedBy: { kind: "wifi-offline" }, title: "LT-REC1" }), "medium");
    // Every family the planner can deal must have a subject pool behind it.
    const plan = ticketAi.planFor(0);
    for (const kind of ticketAi.DEVICE_FAULT_KINDS) {
      assert.ok(plan.some((p) => p.kind === kind), `${kind} was not dealt to student 0`);
    }
  });

  await test("seed data has no built-in student roster", () => {
    const seed = require("../data/seed-data");
    assert.strictEqual(seed.students, undefined);
    assert.strictEqual(seed.STUDENT_PASSWORD, undefined);
    assert.ok(seed.slaPolicy.critical.acknowledgeMinutes > 0);
    assert.ok(Array.isArray(seed.requesters) && seed.requesters.length > 0);
  });

  await test("fresh class has SLA and instructor can change it without wiping students", () => {
    const store = require("../data/store");
    const db = {
      meta: { slaPolicy: require("../data/seed-data").slaPolicy },
      classes: [],
      users: [],
      tickets: [],
      nextUser: 1,
      nextTicket: 1,
      nextClass: 1
    };
    // Minimal shape for createClassWithInstructor
    if (!db.portals) db.portals = {};
    const created = store.createClassWithInstructor(db, {
      className: "SLA Test Class",
      username: "sla.teacher",
      fullName: "SLA Teacher",
      password: "teach123"
    });
    assert.ok(created.class.slaPolicy.high.resolveHours);
    const before = created.class.slaPolicy.high.resolveHours;
    store.addStudent(db, created.user, {
      username: "sla.student",
      fullName: "SLA Student",
      password: "stud1234"
    });
    const updated = store.updateClassSlaPolicy(db, created.class.id, {
      ...created.class.slaPolicy,
      high: {
        acknowledgeMinutes: created.class.slaPolicy.high.acknowledgeMinutes,
        resolveHours: before === 4 ? 8 : 4,
        description: created.class.slaPolicy.high.description || ""
      }
    });
    assert.notStrictEqual(updated.high.resolveHours, before);
    assert.strictEqual(
      db.users.filter((u) => u.role === "technician" && u.classId === created.class.id).length,
      1
    );
    // Second create must not invent a default student roster
    assert.strictEqual(
      db.users.filter((u) => u.role === "technician").length,
      1
    );
  });

  await test("updateClassSlaPolicy rejects out-of-range times", () => {
    const store = require("../data/store");
    const seed = require("../data/seed-data");
    const db = {
      meta: { slaPolicy: seed.slaPolicy },
      classes: [],
      users: [],
      tickets: [],
      nextUser: 1,
      nextTicket: 1,
      nextClass: 1,
      portals: {}
    };
    const created = store.createClassWithInstructor(db, {
      className: "Bad SLA",
      username: "bad.sla",
      fullName: "Bad SLA",
      password: "teach123"
    });
    assert.throws(
      () =>
        store.updateClassSlaPolicy(db, created.class.id, {
          critical: { acknowledgeMinutes: 0, resolveHours: 1, description: "" }
        }),
      /response time/
    );
  });

  await test("ticket DTOs strip lab spoilers for students and comments on list", () => {
    const { toTicketListItem, toTicketDetail } = require("../lib/dto/ticket");
    const enriched = {
      id: "T-1",
      title: "PC down",
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
      comments: [{ id: "c1", body: "note", authorId: "U1", author: { id: "U1", fullName: "A" } }],
      fault: { kind: "disk-failed" },
      generatedBy: { kind: "pc-offline" },
      review: { body: "ok", mark: "good", authorId: "U2", author: { id: "U2", fullName: "Inst" } }
    };
    const student = toTicketListItem(enriched, { role: "technician" });
    assert.strictEqual(student.fault, undefined);
    assert.strictEqual(student.generatedBy, undefined);
    assert.strictEqual(student.comments, undefined);
    assert.strictEqual(student.description, undefined);
    assert.strictEqual(student.review.authorId, undefined);
    assert.strictEqual(student.review.body, undefined);
    assert.strictEqual(student.review.mark, "good");
    assert.strictEqual(student.review.hasBody, true);
    assert.strictEqual(student.commentCount, 1);

    const instructor = toTicketDetail(enriched, { role: "instructor" }, enriched.comments);
    assert.deepStrictEqual(instructor.fault, { kind: "disk-failed" });
    assert.ok(instructor.generatedBy);
    assert.strictEqual(instructor.comments.length, 1);
    assert.strictEqual(instructor.comments[0].authorId, undefined);
  });

  await test("session and dashboard DTOs keep stable keys", () => {
    const { toDashboardDto } = require("../lib/dto/dashboard");
    const dash = toDashboardDto({
      focus: "desk",
      mine: { total: 1 },
      queue: { total: 2 },
      breachedCount: 0,
      health: { open: 1 },
      progress: { assigned: 1 }
    });
    assert.deepStrictEqual(Object.keys(dash).sort(), [
      "breachedCount",
      "focus",
      "health",
      "mine",
      "progress",
      "queue"
    ]);
    const { wildcardOf, aclPermits } = require("../domain/lab/net-ip");
    assert.strictEqual(wildcardOf("255.255.255.0"), "0.0.0.255");
    assert.strictEqual(
      aclPermits(
        { entries: [{ action: "permit", src: null, dst: null }] },
        "10.0.0.1",
        "8.8.8.8"
      ),
      true
    );
  });

  await test("net-sim CLI and identity modules stay wired", () => {
    const net = require("../domain/lab/net-sim");
    const id = require("../domain/lab/net-sim-id");
    const show = require("../domain/lab/net-sim-show");
    assert.strictEqual(typeof net.execute, "function");
    assert.ok(id.macFor("PC-F1").startsWith("02-"));
    assert.ok(Array.isArray(show.pingLinesWindows("10.0.0.1", { ok: false, detail: "down" })));
    const { toLiveboardDto, toAiReviewBatchDto } = require("../lib/dto/class");
    const board = toLiveboardDto({
      day: "2026-01-01",
      presentCount: 1,
      absentCount: 0,
      openClass: 2,
      breachedClass: 0,
      rows: []
    });
    assert.strictEqual(board.day, "2026-01-01");
    assert.deepStrictEqual(toAiReviewBatchDto({ reviewed: 3, warning: null, ready: true, mode: "classroom" }), {
      reviewed: 3,
      warning: null,
      ready: true,
      mode: "classroom"
    });
  });

  await test("CoreGate merge keeps newer updatedAt and drops stale writes", () => {
    const { applyListEdits } = require("../lib/core-merge");
    const base = [
      { id: "TKT-1", title: "A", updatedAt: "2026-01-01T10:00:00.000Z" },
      { id: "TKT-2", title: "B", updatedAt: "2026-01-01T10:00:00.000Z" }
    ];
    const merged = applyListEdits(
      base,
      [
        { id: "TKT-1", row: { id: "TKT-1", title: "stale", updatedAt: "2026-01-01T09:00:00.000Z" } },
        { id: "TKT-1", row: { id: "TKT-1", title: "fresh", updatedAt: "2026-01-01T11:00:00.000Z" } },
        { id: "TKT-3", row: { id: "TKT-3", title: "new", updatedAt: "2026-01-01T11:00:00.000Z" } }
      ],
      ["TKT-2"]
    );
    const byId = Object.fromEntries(merged.map((t) => [t.id, t]));
    assert.strictEqual(byId["TKT-1"].title, "fresh");
    assert.ok(!byId["TKT-2"]);
    assert.strictEqual(byId["TKT-3"].title, "new");
  });

  await test("hardware bench has no compressed-air tool", () => {
    const { TOOLS } = require("../domain/lab/hardware-parts");
    assert.ok(!TOOLS.some((t) => /air|compressed/i.test(t.id + t.name)));
    assert.ok(TOOLS.some((t) => t.id === "screwdriver"));
    assert.ok(TOOLS.some((t) => t.id === "hands"));
  });

  await test("printer CLI refuses jam/paper/toner — Hardware tab only", () => {
    const { states, run } = lab();
    const printers = require("../domain/lab/printers");
    states.devices["PRN-FIN"].printer = printers.applyFault(states.devices["PRN-FIN"].printer, "jam");
    for (const cmd of ["clear", "paper", "toner", "load"]) {
      assert.match(run("PRN-FIN", cmd), /Hardware-tab/i);
    }
    assert.strictEqual(states.devices["PRN-FIN"].printer.status, "jam");
  });

  await test("rate limit middleware trips after the window max", () => {
    const { rateLimit } = require("../middleware/rateLimit");
    const mw = rateLimit({ windowMs: 60_000, max: 2, keyFn: () => "test-key" });
    let lastErr = null;
    const next = (err) => {
      lastErr = err || null;
    };
    const req = { path: "/login", headers: {}, ip: "1.2.3.4" };
    const res = { setHeader() {} };
    mw(req, res, next);
    assert.strictEqual(lastErr, null);
    mw(req, res, next);
    assert.strictEqual(lastErr, null);
    mw(req, res, next);
    assert.strictEqual(lastErr?.status, 429);
  });

  await test("ops metrics snapshot records slow and write notes", () => {
    const ops = require("../lib/ops-metrics");
    ops.noteRequest({ method: "GET", path: "/api/health", ms: 12, status: 200 });
    ops.noteRequest({ method: "PATCH", path: "/api/tickets/x", ms: 900, status: 200 });
    ops.noteWrite(120);
    const snap = ops.snapshot();
    assert.ok(snap.requests >= 2);
    assert.ok(snap.slow >= 1);
    assert.ok(snap.writes >= 1);
    assert.ok(snap.lastWriteMs === 120 || snap.avgWriteMs >= 0);
  });

  await test("hot/cold ticket split archives old closed work", () => {
    const { splitHotCold, isHotTicket } = require("../lib/ticket-hot");
    const now = Date.parse("2026-09-16T12:00:00.000Z");
    const open = { id: "T1", classId: "c1", status: "open", createdAt: "2026-09-16T10:00:00.000Z" };
    const freshClosed = {
      id: "T2",
      classId: "c1",
      status: "closed",
      resolvedAt: "2026-09-15T12:00:00.000Z",
      review: { body: "ok", mark: "good" }
    };
    const oldClosed = {
      id: "T3",
      classId: "c1",
      status: "resolved",
      resolvedAt: "2026-01-01T12:00:00.000Z",
      review: { body: "ok", mark: "good" }
    };
    const needsMark = {
      id: "T4",
      classId: "c1",
      status: "closed",
      resolvedAt: "2026-01-01T12:00:00.000Z"
    };
    assert.strictEqual(isHotTicket(open, now), true);
    assert.strictEqual(isHotTicket(oldClosed, now), false);
    assert.strictEqual(isHotTicket(needsMark, now), true);
    const { hot, cold } = splitHotCold([open, freshClosed, oldClosed, needsMark], now, { force: true });
    assert.ok(hot.some((t) => t.id === "T1"));
    assert.ok(hot.some((t) => t.id === "T4"));
    assert.ok(cold.some((t) => t.id === "T3"));
    assert.ok(cold.some((t) => t.id === "T2"));
  });

  await test("ticket list DTO drops heavy fields", () => {
    const { toTicketListItem } = require("../lib/dto/ticket");
    const item = toTicketListItem(
      {
        id: "TKT-1",
        title: "Down",
        description: "long text",
        comments: [{ id: 1 }, { id: 2 }],
        fault: { type: "x" },
        generatedBy: { kind: "pc-offline" },
        review: { mark: "good", body: "secret notes", authorId: "u1" },
        status: "open",
        priority: "high",
        category: "Network",
        createdAt: "2026-01-01T00:00:00.000Z",
        assignee: { id: "u1", fullName: "Ada", username: "ada", role: "technician", passwordHash: "x" },
        requester: { id: "r1", name: "Bob", department: "Sales", email: "b@x" },
        sla: { pending: false, breached: false, resolveDeadline: "x", ackDeadline: "y", description: "nope" },
        tags: ["a", "b"]
      },
      { role: "instructor" }
    );
    assert.strictEqual(item.description, undefined);
    assert.strictEqual(item.comments, undefined);
    assert.strictEqual(item.fault, undefined);
    assert.strictEqual(item.commentCount, 2);
    assert.strictEqual(item.review.mark, "good");
    assert.strictEqual(item.review.body, undefined);
    assert.strictEqual(item.generatedBy.kind, "pc-offline");
    assert.ok(!item.assignee.passwordHash);
  });

  process.exit(process.exitCode || 0);
})();
