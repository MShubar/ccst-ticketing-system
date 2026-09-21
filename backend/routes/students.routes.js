const express = require("express");
const store = require("../data/store");
const ticketAi = require("../domain/tickets/ticket-ai");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDb, loadDbWithLab } = require("../lib/db-request");
const { studentReport, sendPdf } = require("../services/kpi.service");
const { notFound, badRequest } = require("../errors/AppError");
const { parseAddStudentBody, parseResetPasswordBody } = require("../lib/dto/student");
const { toPublicUser } = require("../lib/dto/user");
const { toAiReviewBatchDto } = require("../lib/dto/class");
const router = patchAsyncMethods(express.Router());

router.post("/", requireAuth, requireInstructor, async (req, res) => {
  const fields = parseAddStudentBody(req.body);
  const student = await store.withDb(async (db) => {
    const instructor = db.users.find((u) => u.id === req.user.id) || req.user;
    const created = store.addStudent(db, instructor, fields);
    // Persist will peel hash into credentials; keep on row until then for safety.
    return toPublicUser(created, db);
  });
  res.status(201).json(student);
});

/** Drop every technician whose username starts with `prefix` (one write). */
router.delete("/", requireAuth, requireInstructor, async (req, res) => {
  const prefix = String(req.query.prefix || "").trim().toLowerCase();
  if (prefix.length < 3) throw badRequest("Need a username prefix of at least 3 characters.");
  const result = await store.withDb(async (db) => {
    db.__allowDeletes = true;
    const drop = new Set(
      db.users
        .filter(
          (u) =>
            u.classId === req.user.classId &&
            u.role === "technician" &&
            String(u.username || "")
              .toLowerCase()
              .startsWith(prefix)
        )
        .map((u) => u.id)
    );
    if (!drop.size) return { removed: 0, ticketsRemoved: 0 };
    const beforeTickets = db.tickets.length;
    db.tickets = db.tickets.filter(
      (t) => !(t.classId === req.user.classId && drop.has(t.assigneeId))
    );
    db.users = db.users.filter((u) => !drop.has(u.id));
    await store.deleteUserCredentials([...drop]);
    return { removed: drop.size, ticketsRemoved: beforeTickets - db.tickets.length };
  });
  res.json({ ok: true, ...result });
});

router.delete("/:id", requireAuth, requireInstructor, async (req, res) => {
  await store.withDb(async (db) => {
    db.__allowDeletes = true;
    const student = db.users.find(
      (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
    );
    if (!student) throw notFound("Student not found in your class.");
    db.tickets = db.tickets.filter(
      (t) => !(t.classId === req.user.classId && t.assigneeId === student.id)
    );
    db.users = db.users.filter((u) => u.id !== student.id);
    await store.deleteUserCredentials([student.id]);
  });
  res.json({ ok: true });
});

router.patch("/:id/password", requireAuth, requireInstructor, async (req, res) => {
  const { password } = parseResetPasswordBody(req.body);
  const user = await store.withDb(async (db) => {
    const student = db.users.find(
      (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
    );
    if (!student) throw notFound("Student not found in your class.");
    await store.setUserPassword(student.id, password);
    delete student.passwordHash;
    return toPublicUser(student, db);
  });
  res.json({ ok: true, user });
});

router.patch("/:id/level", requireAuth, requireInstructor, async (req, res) => {
  const { level } = req.body;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 20) {
    throw badRequest("level must be an integer from 1 to 20.");
  }
  let oldLevel;
  const student = await store.withDb(async (db) => {
    const u = db.users.find(
      (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
    );
    if (!u) throw notFound("Student not found in your class.");
    oldLevel = u.level;
    u.level = level;
    u.updatedAt = new Date().toISOString();
    await store.writeDb(db);
    store.logActivity(db, req.user.classId, {
      userId: req.user.id,
      type: "level_change",
      summary: `${req.user.fullName} set ${u.fullName}'s level from ${oldLevel} to ${level}.`,
    });
    return toPublicUser(u, db);
  });
  res.json({ ok: true, user: student, oldLevel, newLevel: level });
});

/** Review every ticket for one student that still needs a mark (or force=all). */
router.post("/:id/review/ai", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  const student = db.users.find(
    (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
  );
  if (!student) throw notFound("Student not found in your class.");
  const force = Boolean(req.body.force);
  const tickets = store
    .classTickets(db, req.user.classId)
    .filter((t) => t.assigneeId === student.id)
    .filter((t) => force || !t.review?.body);
  const mapState = store.ensureClassMap(db, req.user.classId);
  const devices = store.ensureClassDevices(db, req.user.classId);
  let reviewed = 0;
  let warning = null;
  for (const ticket of tickets) {
    const ai = await ticketAi.reviewTicket(ticket, { assignee: student, mapState, devices });
    if (ai.warning) warning = ai.warning;
    ticket.review = ticketAi.toReviewRecord(ai, req.user.id);
    ticket.updatedAt = ticket.review.updatedAt;
    reviewed += 1;
  }
  if (reviewed) {
    store.logActivity(db, req.user.classId, {
      userId: req.user.id,
      type: "ai_review_batch",
      summary: `AI reviewed ${reviewed} ticket(s) for ${student.fullName}`
    });
    await store.writeDb(db);
  }
  res.json(
    toAiReviewBatchDto({
      reviewed,
      skipped:
        store.classTickets(db, req.user.classId).filter((t) => t.assigneeId === student.id).length - reviewed,
      warning,
      ready: ticketAi.aiReady(),
      mode: ticketAi.aiMode()
    })
  );
});

/** One student's KPI PDF — instructor only, same class. */
router.get("/:id/kpis/pdf", requireAuth, requireInstructor, async (req, res) => {
  const kpiPdf = require("../domain/tickets/kpi-pdf");
  const db = await loadDb(req);
  const student = db.users.find(
    (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
  );
  if (!student) throw notFound("Student not found in your class.");
  const classRow = store.getClass(db, req.user.classId);
  const report = studentReport(db, student);
  const buffer = await kpiPdf.buildStudentKpiPdf({
    meta: db.meta,
    className: classRow?.name || student.cohort,
    ...report,
    generatedAt: new Date().toISOString()
  });
  const safe = String(student.username || student.id).replace(/[^\w.-]+/g, "_");
  sendPdf(res, buffer, `kpi-${safe}.pdf`);
});

/** All students in the class — one page each. */

router.get("/:id/activity", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  const student = db.users.find(
    (u) => u.id === req.params.id && u.classId === req.user.classId && u.role === "technician"
  );
  if (!student) throw notFound("Student not found in your class.");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
  const items = store
    .classActivity(db, req.user.classId)
    .filter((a) => a.userId === student.id)
    .slice(0, limit)
    .map((a) => ({
      ...a,
      user: toPublicUser(student, db)
    }));
  res.json({ student: toPublicUser(student, db), items });
});


module.exports = router;
