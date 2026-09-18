const express = require("express");
const store = require("../data/store");
const ticketAi = require("../domain/tickets/ticket-ai");
const {
  usingBlobStatic,
  usingR2Binding,
  staticBaseUrl,
  catalogUrl
} = require("../lib/static-assets");
const { cfEnv } = require("../lib/cf-env");
const ops = require("../lib/ops-metrics");
const { probeCoreGate } = require("../lib/core-gate-probe");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { requireAuth, requireInstructor } = require("../middleware/auth");
const { loadDb } = require("../lib/db-request");
const router = patchAsyncMethods(express.Router());

router.get("/kb", requireAuth, async (req, res) => {
  res.json((await loadDb(req)).kbArticles);
});

/** Pre-class check: storage mode and whether Gemini / signup are configured. */
router.get("/health", async (_req, res) => {
  const mode = store.storageMode();
  let blobOk = null;
  let blobError = null;
  let labsSplit = true;
  let coreTickets = null;
  let coreUsers = null;

  let coreGate = null;
  if (mode === "d1" && cfEnv()?.CORE_GATE) {
    coreGate = await probeCoreGate();
  }

  if (mode === "memory") {
    blobOk = false;
    blobError = "Ephemeral memory mode — saves will not survive a restart.";
  } else if (mode === "d1") {
    // Cheap path: ping D1 + CoreGate status — avoid downloading the full core body.
    try {
      const d1 = require("../data/d1-store");
      await d1.ping();
      blobOk = coreGate == null ? true : coreGate.coreGateOk !== false;
      if (coreGate?.ok || coreGate?.coreGateOk) {
        coreTickets = coreGate.tickets ?? null;
        coreUsers = coreGate.users ?? null;
        labsSplit = true;
      }
      if (coreGate && coreGate.coreGateOk === false) {
        blobOk = false;
        blobError = coreGate.reason || "CoreGate unavailable";
      }
    } catch (err) {
      blobOk = false;
      blobError = err.message || String(err);
    }
  } else {
    try {
      const db = await store.readDb({ bypassCache: true });
      blobOk = true;
      labsSplit = Boolean(db?.meta?.labsSplit);
      coreTickets = Array.isArray(db?.tickets) ? db.tickets.length : null;
      coreUsers = Array.isArray(db?.users) ? db.users.length : null;
    } catch (err) {
      blobOk = false;
      blobError = err.message || String(err);
    }
  }
  const sessionOk = Boolean(
    process.env.SESSION_SECRET && process.env.SESSION_SECRET !== "ccst-g18-procloud-helpdesk"
  );
  const signupOpen = Boolean(String(process.env.INSTRUCTOR_SIGNUP_CODE || "").trim());
  const classroomAiReady = ticketAi.aiReady();
  let staticOk = !usingBlobStatic();
  let staticError = null;
  if (usingR2Binding() && cfEnv()?.DOCS) {
    try {
      const obj = await cfEnv().DOCS.head("docs-catalog.json");
      staticOk = Boolean(obj);
      if (!staticOk) staticError = "docs-catalog.json missing from R2";
    } catch (err) {
      staticOk = false;
      staticError = err.message || String(err);
    }
  } else if (usingBlobStatic()) {
    try {
      const probe = await fetch(catalogUrl(), { method: "HEAD" });
      staticOk = probe.ok;
      if (!probe.ok) staticError = `catalog probe HTTP ${probe.status}`;
    } catch (err) {
      staticOk = false;
      staticError = err.message || String(err);
    }
  }

  const lagWarn = Boolean(coreGate?.d1BehindCore);
  const ok =
    blobOk === true &&
    sessionOk &&
    mode !== "memory" &&
    staticOk &&
    (coreGate == null || coreGate.coreGateOk !== false);

  res.status(ok ? 200 : 503).json({
    ok,
    app: "ccst-ticketing",
    storageMode: mode,
    blobOk,
    blobError,
    sessionSecretOk: sessionOk,
    instructorSignupOpen: signupOpen,
    classroomAiReady,
    classroomAiMode: ticketAi.aiMode(),
    labsSplit,
    staticBase: staticBaseUrl(),
    staticOk,
    staticError,
    coreGate,
    d1LagWarn: lagWarn,
    coreTickets,
    coreUsers,
    metrics: ops.snapshot(),
    ui: {
      classicClassroom: true,
      reactShell: true,
      note: "Classic frontend is the live classroom UI; React shell hosts / embeds it."
    },
    checkedAt: new Date().toISOString()
  });
});

/** Instructor ops detail — slow requests, CoreGate/D1 lag, write timings. */
router.get("/ops", requireAuth, requireInstructor, async (_req, res) => {
  const mode = store.storageMode();
  const coreGate = mode === "d1" && cfEnv()?.CORE_GATE ? await probeCoreGate() : null;
  res.json({
    ok: true,
    storageMode: mode,
    storageTimingMs: store.storageTiming(),
    coreGate,
    metrics: ops.snapshot(),
    runbooks: {
      health: "/api/health",
      backupD1: "npm run backup:d1",
      restoreDrill: "npm run drill:restore",
      shrinkCore: "POST /api/ops/shrink-core { confirm: \"SHRINK\" }",
      loadTickets: "node backend/scripts/load-tickets.js",
      smoke: "npm test"
    },
    checkedAt: new Date().toISOString()
  });
});

/**
 * Empty the hot ticket list into per-class archives (all classes).
 * Speeds up every read/write. Recover closed history via archive=1 / status filters.
 */
router.post("/ops/shrink-core", requireAuth, requireInstructor, async (req, res) => {
  if (String(req.body?.confirm || "") !== "SHRINK") {
    const { badRequest } = require("../errors/AppError");
    throw badRequest('Pass { "confirm": "SHRINK" } to archive every hot ticket into cold storage.');
  }
  const before = await store.readDb({ bypassCache: true });
  const beforeCount = Array.isArray(before.tickets) ? before.tickets.length : 0;
  const result = await store.withDb(async (db) => {
    const out = await store.archiveAllTicketsFromHotCore(db);
    return out;
  });
  const afterGate = modeIsD1() ? await probeCoreGate() : null;
  res.json({
    ok: true,
    hotTicketsBefore: beforeCount,
    archived: result.archived,
    hotTicketsAfter: result.hot,
    activityTrimmed: result.activityTrimmed || 0,
    credentialsPeeled: result.credentialsPeeled || 0,
    classes: result.classes || [],
    coreGateBytes: afterGate?.bytes ?? null,
    coreGateTickets: afterGate?.tickets ?? null
  });
});

function modeIsD1() {
  return store.storageMode() === "d1";
}

module.exports = router;
