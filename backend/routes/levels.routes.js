const express = require("express");
const store = require("../data/store");
const seedData = require("../data/seed-data");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDb } = require("../lib/db-request");
const { badRequest, notFound } = require("../errors/AppError");

const router = patchAsyncMethods(express.Router());

/** GET /api/levels/curriculum — the 1-20 CCST skill progression. */
router.get("/curriculum", requireAuth, async (_req, res) => {
  res.json(seedData.CURRICULUM);
});

/** PATCH /api/levels/users/:id — instructor sets a student's level (1-20). */
router.patch("/users/:id", requireAuth, requireInstructor, async (req, res) => {
  const raw = req.body?.level;
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw badRequest("level must be an integer from 1 to 20.");
  }
  if (!req.body?.userId && !req.params.id) {
    throw badRequest("Need a user id.");
  }
  const targetId = req.body.userId || req.params.id;
  const db = await loadDb(req);
  const user = db.users.find(
    (u) => u.id === targetId && u.classId === req.user.classId && u.role === "technician"
  );
  if (!user) throw notFound("Student not found in your class.");
  const old = user.level;
  user.level = level;
  user.updatedAt = new Date().toISOString();
  await store.writeDb(db);
  store.logActivity(db, req.user.classId, {
    userId: req.user.id,
    type: "level_change",
    summary: `${req.user.fullName} set ${user.fullName}'s level from ${old} to ${level}.`,
    ticketId: null,
    meta: { targetUserId: user.id, oldLevel: old, newLevel: level }
  });
  res.json({ ok: true, user: store.publicUser(user, db), oldLevel: old, newLevel: level });
});

module.exports = router;
