const { unauthorized, forbidden } = require("../errors/AppError");
const crypto = require("crypto");
const store = require("../data/store");
const {
  rememberSessionUser,
  forgetSessionUser,
  getCachedSessionUser
} = require("./session-user-cache");

const SESSION_SECRET = process.env.SESSION_SECRET || "ccst-g18-procloud-helpdesk";

/**
 * Signed session cookie. Prefer passing a user object so hot paths
 * (map presence) can auth from claims without a D1 read on every isolate.
 * `createSession(userId)` still works for older call sites.
 */
function createSession(userOrId) {
  const user = userOrId && typeof userOrId === "object" ? userOrId : { id: userOrId };
  if (!user?.id) throw new Error("createSession requires a user id");
  const claims = {
    u: user.id,
    t: Date.now(),
    c: user.classId || null,
    r: user.role || "technician",
    n: String(user.fullName || user.username || "").slice(0, 48),
    un: String(user.username || "").slice(0, 48),
    lv: user.level || 1
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function parseSessionClaims(raw) {
  if (!raw || typeof raw !== "string" || !raw.includes(".")) return null;
  const dot = raw.lastIndexOf(".");
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function sessionUserId(raw) {
  const data = parseSessionClaims(raw);
  return data?.u || null;
}

/** Slim user from cookie claims when present (new sessions). */
function sessionUserFromCookie(raw) {
  const data = parseSessionClaims(raw);
  if (!data?.u) return null;
  // Legacy cookies only had { u, t } — no class/role claims.
  if (!("c" in data) && !("r" in data)) return null;
  return {
    id: data.u,
    classId: data.c || null,
    fullName: data.n || data.un || "",
    username: data.un || "",
    role: data.r || "technician",
    level: data.lv || 1
  };
}

function attachUser(req, user) {
  rememberSessionUser(user);
  req.user = getCachedSessionUser(user.id) || user;
}

function requireAuth(req, res, next) {
  const cookie = req.cookies.ccst_session;
  const fromCookie = sessionUserFromCookie(cookie);
  // Prefer signed claims — skip a full D1/core read until loadDb needs the doc.
  if (fromCookie) {
    attachUser(req, fromCookie);
    return next();
  }
  const userId = sessionUserId(cookie);
  if (!userId) return next(unauthorized());
  store
    .readDb()
    .then((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) {
        forgetSessionUser(userId);
        return next(unauthorized());
      }
      req.db = db;
      attachUser(req, user);
      next();
    })
    .catch(next);
}

/**
 * Cookie HMAC + slim profile. Prefer signed claims (no D1), then isolate
 * cache, then a single readDb. Used by map presence / live links.
 */
function requireAuthLight(req, res, next) {
  const cookie = req.cookies.ccst_session;
  const fromCookie = sessionUserFromCookie(cookie);
  if (fromCookie) {
    rememberSessionUser(fromCookie);
    req.user = fromCookie;
    return next();
  }
  const userId = sessionUserId(cookie);
  if (!userId) return next(unauthorized());
  const cached = getCachedSessionUser(userId);
  if (cached) {
    req.user = cached;
    return next();
  }
  store
    .readDb()
    .then((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) {
        forgetSessionUser(userId);
        return next(unauthorized());
      }
      attachUser(req, user);
      next();
    })
    .catch(next);
}

function requireInstructor(req, res, next) {
  if (req.user.role !== "instructor" && req.user.level !== 3) {
    return next(forbidden());
  }
  next();
}

function instructorSignupCodeOk(provided) {
  const expected = String(process.env.INSTRUCTOR_SIGNUP_CODE || "").trim();
  if (!expected) return false;
  const got = String(provided || "").trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  SESSION_SECRET,
  createSession,
  sessionUserId,
  sessionUserFromCookie,
  requireAuth,
  requireAuthLight,
  requireInstructor,
  instructorSignupCodeOk,
  rememberSessionUser,
  forgetSessionUser
};
