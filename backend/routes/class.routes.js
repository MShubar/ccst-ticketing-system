const express = require("express");
const store = require("../data/store");
const ticketAi = require("../domain/tickets/ticket-ai");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDb, loadDbWithLab } = require("../lib/db-request");
const { studentReport, sendPdf, csvEscape } = require("../services/kpi.service");
const { notFound } = require("../errors/AppError");
const { parseSlaPolicyBody } = require("../lib/dto/sla");
const { toLiveboardDto, toAttendanceDto, toAiReviewBatchDto } = require("../lib/dto/class");
const { toPublicUser } = require("../lib/dto/user");
const router = patchAsyncMethods(express.Router());

router.post("/review/ai", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  const force = Boolean(req.body.force);
  const tickets = store
    .classTickets(db, req.user.classId)
    .filter((t) => force || !t.review?.body);
  const mapState = store.ensureClassMap(db, req.user.classId);
  const devices = store.ensureClassDevices(db, req.user.classId);
  let reviewed = 0;
  let warning = null;
  for (const ticket of tickets) {
    const assignee = ticket.assigneeId ? db.users.find((u) => u.id === ticket.assigneeId) : null;
    const ai = await ticketAi.reviewTicket(ticket, { assignee, mapState, devices });
    if (ai.warning) warning = ai.warning;
    ticket.review = ticketAi.toReviewRecord(ai, req.user.id);
    ticket.updatedAt = ticket.review.updatedAt;
    reviewed += 1;
  }
  if (reviewed) {
    store.logActivity(db, req.user.classId, {
      userId: req.user.id,
      type: "ai_review_batch",
      summary: `AI reviewed ${reviewed} ticket(s) for the class`
    });
    await store.writeDb(db);
  }
  res.json(toAiReviewBatchDto({ reviewed, warning, ready: ticketAi.aiReady(), mode: ticketAi.aiMode() }));
});

router.get("/kpis/pdf", requireAuth, requireInstructor, async (req, res) => {
  const kpiPdf = require("../domain/tickets/kpi-pdf");
  const db = await loadDb(req);
  await store.ensureTicketArchive(db, req.user.classId);
  const classRow = store.getClass(db, req.user.classId);
  const students = store
    .classUsers(db, req.user.classId)
    .filter((u) => u.role === "technician")
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((student) => studentReport(db, student));
  const buffer = await kpiPdf.buildClassKpiPdf({
    meta: db.meta,
    className: classRow?.name || "Class",
    students,
    generatedAt: new Date().toISOString()
  });
  const safe = String(classRow?.name || "class").replace(/[^\w.-]+/g, "_");
  sendPdf(res, buffer, `kpi-class-${safe}.pdf`);
});

router.put("/announcement", requireAuth, requireInstructor, async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 280);
  const db = await loadDb(req);
  const classRow = store.getClass(db, req.user.classId);
  if (!classRow) throw notFound("Class not found.");
  classRow.announcement = text
    ? {
        text,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.fullName
      }
    : null;
  await store.writeDb(db);
  res.json({ announcement: classRow.announcement });
});

router.get("/sla", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json({ slaPolicy: store.ensureClassSlaPolicy(db, req.user.classId) });
});

router.put("/sla", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  const slaPolicy = store.updateClassSlaPolicy(db, req.user.classId, parseSlaPolicyBody(req.body));
  store.logActivity(db, req.user.classId, {
    userId: req.user.id,
    type: "sla_policy",
    summary: "Updated class SLA times"
  });
  await store.writeDb(db);
  res.json({ slaPolicy });
});

router.get("/attendance", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  res.json(toAttendanceDto(store.classAttendance(db, req.user.classId, req.query.day || undefined)));
});

/** Who is in, who is past SLA, who still has open tickets — one instructor board. */
router.get("/liveboard", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  const attendance = store.classAttendance(db, req.user.classId, req.query.day || undefined);
  const presentIds = new Set((attendance.present || []).map((u) => u.id));
  const students = store
    .classUsers(db, req.user.classId)
    .filter((u) => u.role === "technician")
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const tickets = store.classTickets(db, req.user.classId);
  const rows = students.map((student) => {
    const mine = tickets.filter((t) => t.assigneeId === student.id);
    const open = mine.filter((t) => !["resolved", "closed"].includes(t.status));
    const breached = open.filter((t) => store.slaState(t, store.classSlaPolicy(db, req.user.classId)).breached);
    const unprioritized = open.filter((t) => !t.priority);
    const reviewPending = mine.filter((t) => !t.review?.body).length;
    const stuck =
      open.some((t) => {
        const ageMs = Date.now() - new Date(t.updatedAt || t.createdAt).getTime();
        return ageMs > 45 * 60 * 1000;
      }) || breached.length > 0;
    return {
      student: toPublicUser(student, db),
      present: presentIds.has(student.id),
      signedInAt: (attendance.present || []).find((p) => p.id === student.id)?.signedInAt || null,
      lastSeenAt: student.lastSeenAt || null,
      assigned: mine.length,
      open: open.length,
      breached: breached.length,
      unprioritized: unprioritized.length,
      reviewPending,
      stuck
    };
  });
  res.json(
    toLiveboardDto({
      day: attendance.day,
      presentCount: attendance.present.length,
      absentCount: attendance.absent.length,
      openClass: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
      breachedClass: tickets.filter(
        (t) =>
          !["resolved", "closed"].includes(t.status) &&
          store.slaState(t, store.classSlaPolicy(db, req.user.classId)).breached
      ).length,
      rows
    })
  );
});

router.get("/export.csv", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  const classRow = store.getClass(db, req.user.classId);
  const rows = store
    .classUsers(db, req.user.classId)
    .filter((u) => u.role === "technician")
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((student) => {
      const report = studentReport(db, student);
      const reviews = report.tickets.reduce(
        (acc, t) => {
          const m = t.review?.mark;
          if (m === "good") acc.good += 1;
          else if (m === "needs-work") acc.needsWork += 1;
          else if (m === "incomplete") acc.incomplete += 1;
          if (t.review?.priorityOk === true) acc.priorityOk += 1;
          if (t.review?.priorityOk === false) acc.priorityBad += 1;
          if (t.review?.processOk === true) acc.processOk += 1;
          if (t.review?.processOk === false) acc.processBad += 1;
          return acc;
        },
        { good: 0, needsWork: 0, incomplete: 0, priorityOk: 0, priorityBad: 0, processOk: 0, processBad: 0 }
      );
      const priorityPart = report.grade.parts.find((p) => p.key === "priority");
      const processPart = report.grade.parts.find((p) => p.key === "process");
      return [
        student.fullName,
        student.username,
        student.email,
        report.kpis.total,
        report.kpis.backlog,
        report.kpis.resolved,
        report.kpis.slaCompliance ?? "",
        report.kpis.csat ?? "",
        reviews.good,
        reviews.needsWork,
        reviews.incomplete,
        priorityPart?.raw ?? "",
        processPart?.raw ?? "",
        report.grade.score ?? "",
        report.grade.band.label,
        student.lastSeenAt || ""
      ];
    });
  const header = [
    "fullName",
    "username",
    "email",
    "tickets",
    "backlog",
    "resolved",
    "slaCompliancePct",
    "csat",
    "reviewsGood",
    "reviewsNeedsWork",
    "reviewsIncomplete",
    "priorityOkPct",
    "processOkPct",
    "gradeScore",
    "gradeBand",
    "lastSeenAt"
  ];
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(",")).join("\n");
  const safe = String(classRow?.name || "class").replace(/[^\w.-]+/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="class-kpis-${safe}.csv"`);
  res.send(csv);
});


module.exports = router;
