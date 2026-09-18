/**
 * Password hashes live in a side document (`credentials`), not the hot core.
 * Shape: { byUserId: { "USR-0001": "salt:hash", ... }, updatedAt }
 */
const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword } = require("../lib/passwords");

const DOC_KEY = "credentials";

let memoryCreds = { byUserId: {}, updatedAt: null };
let cache = null; // { at, body }

function normalize(body) {
  if (!body || typeof body !== "object") return { byUserId: {}, updatedAt: null };
  const byUserId =
    body.byUserId && typeof body.byUserId === "object" && !Array.isArray(body.byUserId)
      ? { ...body.byUserId }
      : {};
  return { byUserId, updatedAt: body.updatedAt || null };
}

function filePath(dataDir) {
  return path.join(dataDir, "credentials.json");
}

async function readCredentials(deps) {
  const ttl = deps.readCacheMs?.() ?? 0;
  if (ttl > 0 && cache && Date.now() - cache.at < ttl) return normalize(cache.body);

  const backend = deps.docBackend?.();
  if (backend && typeof backend.readDocument === "function") {
    try {
      const body = normalize(await backend.readDocument(DOC_KEY));
      if (ttl > 0) cache = { at: Date.now(), body };
      return body;
    } catch (err) {
      console.warn("[credentials] read failed", err.message);
      return normalize(memoryCreds);
    }
  }

  if (deps.useAzure?.()) {
    try {
      const res = await deps.azureFetch(deps.azureBlobUrl("credentials.json"));
      if (res.status === 404) return normalize(null);
      if (!res.ok) throw new Error(`credentials read ${res.status}`);
      const body = normalize(JSON.parse(await res.text()));
      if (ttl > 0) cache = { at: Date.now(), body };
      return body;
    } catch (err) {
      console.warn("[credentials] azure read failed", err.message);
      return normalize(memoryCreds);
    }
  }

  if (!deps.onVercel) {
    try {
      const p = filePath(deps.dataDir);
      if (fs.existsSync(p)) {
        const body = normalize(JSON.parse(fs.readFileSync(p, "utf8")));
        if (ttl > 0) cache = { at: Date.now(), body };
        return body;
      }
    } catch (err) {
      console.warn("[credentials] file read failed", err.message);
    }
  }

  return normalize(memoryCreds);
}

async function writeCredentials(body, deps) {
  const next = normalize(body);
  next.updatedAt = new Date().toISOString();
  memoryCreds = next;
  cache = { at: Date.now(), body: next };

  const backend = deps.docBackend?.();
  if (backend && typeof backend.writeDocument === "function") {
    await backend.writeDocument(DOC_KEY, next);
    return next;
  }
  if (deps.useAzure?.()) {
    await deps.azureFetch(deps.azureBlobUrl("credentials.json"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-ms-blob-type": "BlockBlob" },
      body: JSON.stringify(next)
    });
    return next;
  }
  if (!deps.onVercel) {
    fs.mkdirSync(deps.dataDir, { recursive: true });
    fs.writeFileSync(filePath(deps.dataDir), JSON.stringify(next));
    return next;
  }
  return next;
}

function invalidateCache() {
  cache = null;
}

/**
 * Pull passwordHash off every user, merge into credentials doc, strip from core.
 * Safe to call on every persist — no-op when nothing left to peel.
 */
async function peelUserCredentials(db, deps) {
  if (!db || !Array.isArray(db.users)) return { peeled: 0 };
  const found = {};
  for (const user of db.users) {
    if (!user?.id || !user.passwordHash) continue;
    found[user.id] = user.passwordHash;
    delete user.passwordHash;
  }
  const count = Object.keys(found).length;
  if (!count) return { peeled: 0 };

  const existing = await readCredentials(deps);
  const byUserId = { ...existing.byUserId, ...found };
  await writeCredentials({ byUserId }, deps);
  return { peeled: count };
}

async function setUserPassword(userId, password, deps) {
  if (!userId) return;
  const hash = hashPassword(String(password || ""));
  const existing = await readCredentials(deps);
  existing.byUserId[userId] = hash;
  await writeCredentials(existing, deps);
  return hash;
}

async function setUserPasswordHash(userId, hash, deps) {
  if (!userId || !hash) return;
  const existing = await readCredentials(deps);
  existing.byUserId[userId] = hash;
  await writeCredentials(existing, deps);
}

async function deleteUserCredentials(userIds, deps) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ids.length) return;
  const existing = await readCredentials(deps);
  let changed = false;
  for (const id of ids) {
    if (id && existing.byUserId[id]) {
      delete existing.byUserId[id];
      changed = true;
    }
  }
  if (changed) await writeCredentials(existing, deps);
}

async function getCredentialHash(userId, deps, fallbackHash) {
  if (!userId) return fallbackHash || null;
  const creds = await readCredentials(deps);
  return creds.byUserId[userId] || fallbackHash || null;
}

async function verifyUserPassword(userId, password, deps, fallbackHash) {
  const stored = await getCredentialHash(userId, deps, fallbackHash);
  if (!stored) return false;
  try {
    return verifyPassword(String(password || ""), stored);
  } catch {
    return false;
  }
}

/** Defense: never let hashes ride back into a core JSON blob. */
function stripPasswordHashesFromUsers(users) {
  if (!Array.isArray(users)) return 0;
  let n = 0;
  for (const u of users) {
    if (u && u.passwordHash) {
      delete u.passwordHash;
      n += 1;
    }
  }
  return n;
}

module.exports = {
  DOC_KEY,
  readCredentials,
  writeCredentials,
  invalidateCache,
  peelUserCredentials,
  setUserPassword,
  setUserPasswordHash,
  deleteUserCredentials,
  getCredentialHash,
  verifyUserPassword,
  stripPasswordHashesFromUsers
};
