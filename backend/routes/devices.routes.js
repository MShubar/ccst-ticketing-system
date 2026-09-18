const express = require("express");
const store = require("../data/store");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDbWithLab, saveIfDirty, cachedTopology } = require("../lib/db-request");
const { applyOpenHardwareFaults, applyOpenDeviceFaults } = require("../services/ticket-faults");
const { badRequest, notFound } = require("../errors/AppError");
const { toDeviceDto } = require("../lib/dto/map");
const router = patchAsyncMethods(express.Router());

router.get("/:id", requireAuth, async (req, res) => {
  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const db = await loadDbWithLab(req);
  const mapState = store.ensureClassMap(db, req.user.classId);
  const devices = store.ensureClassDevices(db, req.user.classId);
  await saveIfDirty(db);
  const topo = cachedTopology(labMap);
  const summary = netSim.deviceSummary(topo, mapState.links, devices, req.params.id);
  if (!summary) throw notFound("No such device on the map.");
  res.json({ device: toDeviceDto(summary), state: devices.devices[req.params.id] });
});

router.post("/:id/console", requireAuth, async (req, res) => {
  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const db = await loadDbWithLab(req);
  const mapState = store.ensureClassMap(db, req.user.classId);
  const devices = store.ensureClassDevices(db, req.user.classId);
  const topo = labMap.topology();
  if (!devices.devices[req.params.id]) {
    throw notFound("No such device on the map.");
  }
  const result = netSim.execute({
    topo,
    links: mapState.links,
    states: devices,
    deviceId: req.params.id,
    session: req.body.session,
    command: String(req.body.command || "")
  });
  if (result.changed) {
    devices.updatedAt = new Date().toISOString();
    store.markLabDirty(db);
    await store.writeDb(db);
  }
  res.json(result);
});

/**
 * Hardware service actions: power, tools, screws, open/close panel, inspect, repair.
 * Students troubleshoot — the API never colour-codes the fault for them.
 */
router.post("/:id/hardware", requireAuth, async (req, res) => {
  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const db = await loadDbWithLab(req);
  store.markLabDirty(db);
  const mapState = store.ensureClassMap(db, req.user.classId);
  const devices = store.ensureClassDevices(db, req.user.classId);
  const state = devices.devices[req.params.id];
  if (!state) throw notFound("No such device on the map.");

  const printers = require("../domain/lab/printers");
  const result =
    state.os === "printer"
      ? printers.hardwareAct(state, req.body || {})
      : netSim.hardware.act(state, req.body || {});
  if (!result.ok) throw badRequest(result.error);

  devices.updatedAt = new Date().toISOString();
  await store.writeDb(db);
  const summary = netSim.deviceSummary(labMap.topology(), mapState.links, devices, req.params.id);
  res.json({ ok: true, message: result.message, action: result.action, device: summary });
});

router.post("/reset", requireAuth, requireInstructor, async (req, res) => {
  const netSim = require("../domain/lab/net-sim");
  const db = await loadDbWithLab(req);
  store.markLabDirty(db);
  store.ensureClassDevices(db, req.user.classId);
  db.devicesByClass[req.user.classId] = netSim.defaultDeviceStates();
  // Wiping every config also heals every PC, which would silently retire the
  // hardware tickets that are still open. Break those parts again, the same
  // way the map reset re-pulls the cables its own tickets describe.
  const refaulted = applyOpenHardwareFaults(db, req.user.classId).concat(
    applyOpenDeviceFaults(db, req.user.classId)
  );
  await store.writeDb(db);
  res.json({ ok: true, refaulted });
});


module.exports = router;
