const express = require("express");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireAuthLight, requireInstructor } = require("../middleware/auth");
const { loadDbWithLab, saveIfDirty } = require("../lib/db-request");
const mapService = require("../services/map.service");
const { badRequest, AppError } = require("../errors/AppError");
const { toMapPayload } = require("../lib/dto/map");

const router = patchAsyncMethods(express.Router());

router.get("/", requireAuthLight, async (req, res) => {
  const db = await loadDbWithLab(req);
  const payload = await mapService.getMapPayload(db, req.user, {
    omitTopology: req.query.omitTopology === "1",
    linksOnly: req.query.linksOnly === "1"
  });
  await saveIfDirty(db);
  res.json(toMapPayload(payload));
});

router.get("/labels", requireAuthLight, async (req, res) => {
  const db = await loadDbWithLab(req);
  const payload = mapService.getLabels(db, req.user);
  await saveIfDirty(db);
  res.json(toMapPayload(payload));
});

/** Live cable snapshot for classmates — memory/DO first, no DB when warm. */
router.get("/links", requireAuthLight, async (req, res) => {
  const live = await mapService.getLiveLinks(req.user);
  if (live) return res.json(toMapPayload(live));
  const db = await loadDbWithLab(req);
  const payload = await mapService.getMapPayload(db, req.user, { linksOnly: true });
  await saveIfDirty(db);
  res.json(toMapPayload(payload));
});

// Presence: Durable Object on Cloudflare, in-memory on Azure/local.
// Touch already returns the peer snapshot — one DO round-trip, not two.
router.post("/presence", requireAuthLight, async (req, res) => {
  const payload = await mapService.touchPresence(req.user, req.body?.x, req.body?.y);
  if (!payload) throw badRequest("Need a map position (x, y).");
  res.json(payload);
});

router.get("/presence", requireAuthLight, async (req, res) => {
  res.json(await mapService.mapPresencePayload(req.user));
});

router.delete("/presence", requireAuthLight, async (req, res) => {
  await mapService.leavePresence(req.user);
  res.json({ ok: true });
});

/**
 * Plug or unplug one cable without replacing the whole map. Concurrent edits
 * to different ports both stick; the same busy port returns 409.
 */
router.post("/links/op", requireAuth, async (req, res) => {
  const result = await mapService.applyLinkOp(req.user.classId, req.body || {});
  if (!result.ok) {
    throw new AppError(result.status || 400, result.error, {
      links: result.links,
      updatedAt: result.updatedAt
    });
  }
  res.json(result);
});

router.put("/links", requireAuth, async (_req, res) => {
  return res.status(410).json({
    error: "Save the whole map is no longer used — plugs and unplugs sync live."
  });
});

router.post("/reset", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await mapService.resetMap(db, req.user));
});

module.exports = router;
