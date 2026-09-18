const express = require("express");
const store = require("../data/store");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDb, loadDbWithLab } = require("../lib/db-request");
const ticketService = require("../services/ticket.service");

const router = patchAsyncMethods(express.Router());

router.get("/", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.listTickets(db, req.user, req.query));
});

router.get("/generate/status", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  res.json(ticketService.generateStatus(db, req.user));
});

router.put("/mix", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  const summary = ticketService.saveMix(db, req.user, req.body.mix || null);
  await store.writeDb(db);
  res.json(summary);
});

router.post("/compact", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.compactClassTickets(db, req.user, req.body || {}));
});

router.delete("/", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await ticketService.clearClassTickets(db, req.user));
});

router.get("/:id", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.getTicketDetail(db, req.user, req.params.id));
});

router.post("/", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  res.status(201).json(await ticketService.createTicket(db, req.user, req.body || {}));
});

router.post("/generate", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  const result = await ticketService.generateForStudent(db, req.user, req.body || {});
  if (result.skipped) return res.json(result);
  res.status(result.status || 201).json(result.body);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.patchTicket(db, req.user, req.params.id, req.body || {}));
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.status(201).json(await ticketService.addComment(db, req.user, req.params.id, req.body?.body));
});

router.post("/:id/escalate", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.escalateTicket(db, req.user, req.params.id, req.body?.reason));
});

router.post("/:id/review", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.saveReview(db, req.user, req.params.id, req.body || {}));
});

router.post("/:id/review/ai", requireAuth, requireInstructor, async (req, res) => {
  const db = await loadDbWithLab(req);
  res.json(await ticketService.aiReviewTicket(db, req.user, req.params.id));
});

router.post("/:id/claim", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(await ticketService.claimTicket(db, req.user, req.params.id));
});

module.exports = router;
