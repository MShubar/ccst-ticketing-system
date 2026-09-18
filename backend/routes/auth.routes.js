const { toPublicUser, toPublicUserList } = require("../lib/dto/user");
const { toMeDto } = require("../lib/dto/session");
const {
  createSession,
  requireAuth,
  instructorSignupCodeOk,
  rememberSessionUser,
  forgetSessionUser,
  sessionUserId
} = require("../middleware/auth");
const { peekMeDto, putMeDto, forgetMeDto } = require("../middleware/me-dto-cache");
const { rateLimit } = require("../middleware/rateLimit");
const { isHttps } = require("../config");
const { loadDb } = require("../lib/db-request");
const store = require("../data/store");
const express = require("express");
const { patchAsyncMethods } = require("../middleware/asyncHandlers");
const { forbidden, unauthorized } = require("../errors/AppError");
const router = patchAsyncMethods(express.Router());

const authLimit = rateLimit({ windowMs: 60_000, max: 12 });
const signupLimit = rateLimit({ windowMs: 60_000, max: 6 });

router.post("/register/instructor", signupLimit, async (req, res) => {
  if (!String(process.env.INSTRUCTOR_SIGNUP_CODE || "").trim()) {
    throw forbidden("Instructor signup is closed. Ask the trainer for a signup code.");
  }
  if (!instructorSignupCodeOk(req.body.signupCode)) {
    throw forbidden("Signup code is not correct.");
  }
  const payload = await store.withDb(async (db) => {
    const created = store.createClassWithInstructor(db, {
      className: req.body.className,
      username: req.body.username,
      fullName: req.body.fullName,
      password: req.body.password
    });
    return {
      user: toPublicUser(created.user, db),
      class: created.class,
      userId: created.user.id
    };
  });
  rememberSessionUser(payload.user);
  forgetMeDto(payload.userId);
  const sid = createSession(payload.user);
  res.cookie("ccst_session", sid, { httpOnly: true, sameSite: "lax", secure: isHttps });
  res.status(201).json({ user: payload.user, class: payload.class });
});

router.post("/login", authLimit, async (req, res) => {
  const username = store.normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const db = await loadDb(req);
  const user = db.users.find((u) => u.username === username);
  const ok = user && (await store.verifyUserPassword(user.id, password, user.passwordHash));
  if (!ok) {
    throw unauthorized("Username or password is not correct.");
  }
  const now = Date.now();
  const lastSeenMs = user.lastSeenAt ? Date.parse(user.lastSeenAt) : 0;
  const LAST_SEEN_MIN_MS = Number(process.env.LAST_SEEN_MIN_MS) || 15 * 60_000;
  const shouldTouch = !Number.isFinite(lastSeenMs) || now - lastSeenMs >= LAST_SEEN_MIN_MS;
  if (shouldTouch) {
    user.lastSeenAt = new Date(now).toISOString();
    if (user.classId) {
      store.logActivity(db, user.classId, {
        userId: user.id,
        type: "login",
        summary: `${user.fullName} signed in`
      });
    }
    await store.writeDb(db);
  }
  rememberSessionUser(user);
  forgetMeDto(user.id);
  const sid = createSession(user);
  res.cookie("ccst_session", sid, { httpOnly: true, sameSite: "lax", secure: isHttps });
  res.json({ user: toPublicUser(user, db) });
});

router.post("/logout", async (req, res) => {
  const uid = sessionUserId(req.cookies.ccst_session);
  if (uid) {
    forgetSessionUser(uid);
    forgetMeDto(uid);
  }
  res.clearCookie("ccst_session", { httpOnly: true, sameSite: "lax", secure: isHttps });
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const cached = peekMeDto(req.user.id);
  if (cached) {
    res.json(cached);
    return;
  }
  const db = await loadDb(req);
  const full = db.users.find((u) => u.id === req.user.id) || req.user;
  const dto = toMeDto(db, full);
  putMeDto(req.user.id, dto);
  res.json(dto);
});

router.get("/users", requireAuth, async (req, res) => {
  const db = await loadDb(req);
  res.json(toPublicUserList(store.classUsers(db, req.user.classId), db));
});


module.exports = router;
