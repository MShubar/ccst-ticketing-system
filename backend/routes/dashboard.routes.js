const express = require("express");
const store = require("../data/store");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth } = require("../middleware/auth");
const { loadDb } = require("../lib/db-request");
const { studentReport, sendPdf } = require("../services/kpi.service");
const { toDashboardDto } = require("../lib/dto/dashboard");
const router = patchAsyncMethods(express.Router());

router.get("/dashboard", requireAuth, async (req, res) => {
  const grading = require("../domain/tickets/grading");
  const db = await loadDb(req);
  // Hot-only KPIs for the classroom dashboard. Loading archive:tickets here
  // re-hydrates every closed/load-test row and dominated latency after shrink.
  // Historical KPIs remain on /kpis/pdf and ticket list archive filters.
  const mine = store.computeKpis(db, req.user, "mine");
  const queue = store.computeKpis(db, req.user, "queue");
  const classTickets = store.classTickets(db, req.user.classId);
  const mineTickets = classTickets.filter((t) => t.assigneeId === req.user.id);
  const instructor = req.user.role === "instructor" || req.user.level === 3;
  const openTickets = (instructor ? classTickets : mineTickets).filter(
    (t) => !["resolved", "closed"].includes(t.status)
  );
  const breachedScope = instructor ? classTickets : mineTickets;
  const breachedCount = breachedScope.filter((t) => {
    const sla = store.slaState(t, store.classSlaPolicy(db, req.user.classId));
    return sla && sla.breached && !["resolved", "closed"].includes(t.status);
  }).length;
  const enrichedMine = mineTickets.map((t) => store.enrichTicket(db, t, req.user));
  const grade = grading.gradeStudent(mine, enrichedMine);
  const reviewed = mineTickets.filter((t) => t.review && t.review.body).length;
  const openByStatus = openTickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const unowned = instructor
    ? openTickets.filter((t) => !t.assigneeId).length
    : openTickets.filter((t) => t.assigneeId === req.user.id).length;
  res.json(
    toDashboardDto({
      focus: instructor ? "class" : "desk",
      mine,
      queue,
      breachedCount,
      health: {
        open: openTickets.length,
        unowned: instructor ? openTickets.filter((t) => !t.assigneeId).length : 0,
        owned: instructor ? openTickets.filter((t) => t.assigneeId).length : unowned,
        escalated: openByStatus.escalated || 0,
        pending: openByStatus.pending || 0,
        new: openByStatus.new || 0,
        inProgress: openByStatus.open || 0,
        openByStatus,
        resolveRate:
          (instructor ? queue.total : mine.total) > 0
            ? Math.round(
                (((instructor ? queue.resolved : mine.resolved) || 0) /
                  (instructor ? queue.total : mine.total)) *
                  100
              )
            : null
      },
      progress: {
        assigned: mineTickets.length,
        open: mine.backlog,
        resolved: mine.resolved,
        reviewed,
        reviewPending: Math.max(0, mineTickets.length - reviewed),
        grade
      }
    })
  );
});

router.get("/kpis", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json({
    mine: store.computeKpis(db, req.user, "mine"),
    queue: store.computeKpis(db, req.user, "queue")
  });
});

router.get("/kpis/pdf", requireAuth, async (req, res) => {
  const kpiPdf = require("../domain/tickets/kpi-pdf");
  const db = await loadDb(req);
  await store.ensureTicketArchive(db, req.user.classId);
  const classRow = store.getClass(db, req.user.classId);
  const report = studentReport(db, req.user);
  const buffer = await kpiPdf.buildStudentKpiPdf({
    meta: db.meta,
    className: classRow?.name || req.user.className || req.user.cohort,
    ...report,
    generatedAt: new Date().toISOString()
  });
  const safe = String(req.user.username || "user").replace(/[^\w.-]+/g, "_");
  sendPdf(res, buffer, `kpi-${safe}.pdf`);
});

/** One student's KPI PDF — instructor only, same class. */

module.exports = router;
