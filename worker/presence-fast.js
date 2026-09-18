/**
 * Workers-native map presence — skips Express / node:http bridge.
 * Auth from signed session claims; state via MapRoom Durable Object.
 */
function parseCookie(header, name) {
  if (!header) return "";
  const parts = String(header).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return part.slice(idx + 1).trim();
  }
  return "";
}

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function userFromSession(cookie, secret) {
  if (!cookie || !secret || !cookie.includes(".")) return null;
  const dot = cookie.lastIndexOf(".");
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = await hmacHex(secret, payload);
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (!data?.u) return null;
    if (!("c" in data) && !("r" in data)) return null;
    return {
      id: data.u,
      classId: data.c || null,
      fullName: data.n || data.un || "",
      username: data.un || "",
      role: data.r || "technician"
    };
  } catch {
    return null;
  }
}

function roomStub(env, classId) {
  if (!env?.MAP_ROOM || !classId) return null;
  return env.MAP_ROOM.get(env.MAP_ROOM.idFromName(String(classId)));
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/**
 * @returns {Promise<Response|null>} null → fall through to Express
 */
export async function tryHandlePresence(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/map/presence") return null;

  const secret = env.SESSION_SECRET || process.env.SESSION_SECRET;
  const cookie = parseCookie(request.headers.get("cookie"), "ccst_session");
  const user = await userFromSession(cookie, secret);
  if (!user?.id || !user.classId) {
    // Legacy cookies without claims — Express path can load from D1.
    return null;
  }

  const stub = roomStub(env, user.classId);
  if (!stub) return null;

  const method = request.method.toUpperCase();

  if (method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Need a map position (x, y)." });
    }
    const x = Number(body?.x);
    const y = Number(body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return json(400, { error: "Need a map position (x, y)." });
    }
    const data = await stub.touch({
      userId: user.id,
      name: user.fullName || user.username,
      role: user.role,
      x,
      y
    });
    return json(200, data);
  }

  if (method === "GET") {
    const data = await stub.list(user.id);
    return json(200, data);
  }

  if (method === "DELETE") {
    await stub.leave(user.id);
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
}
