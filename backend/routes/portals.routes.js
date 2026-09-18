const express = require("express");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth } = require("../middleware/auth");
const { loadDbWithLab, saveIfDirty } = require("../lib/db-request");
const portalService = require("../services/portal.service");

const router = patchAsyncMethods(express.Router());

router.get("/", requireAuth, async (req, res) => {
  const db = await loadDbWithLab(req);
  const payload = portalService.getPortalsPayload(db, req.user);
  await saveIfDirty(db);
  res.json(payload);
});

router.post("/password", requireAuth, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await portalService.resetPassword(db, req.user, String(req.body.userId || "").trim()));
});

router.post("/cbs", requireAuth, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await portalService.runCbs(db, req.user, req.body || {}));
});

router.post("/vas", requireAuth, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await portalService.runVas(db, req.user, req.body || {}));
});

router.post("/vpn", requireAuth, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await portalService.runVpn(db, req.user, req.body || {}));
});

module.exports = router;
