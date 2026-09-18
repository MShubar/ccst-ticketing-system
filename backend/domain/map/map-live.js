/**
 * Presence / map-sync facade.
 * On Cloudflare → Durable Object MapRoom.
 * On Azure/local → existing in-memory modules.
 */
const { cfEnv } = require("../../lib/cf-env");

function roomStub(classId) {
  const env = cfEnv();
  if (!env?.MAP_ROOM || !classId) return null;
  const id = env.MAP_ROOM.idFromName(String(classId));
  return env.MAP_ROOM.get(id);
}

async function doFetch(classId, path, init) {
  const stub = roomStub(classId);
  if (!stub) return null;
  return stub.fetch(`https://map-room${path}`, init);
}

/** Record cursor; returns presence payload (peers + mapRev) or null if coords bad. */
async function touch(classId, user, x, y) {
  const cx = Number(x);
  const cy = Number(y);
  if (!classId || !user?.id || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const stub = roomStub(classId);
  if (!stub) {
    const presence = require("./map-presence");
    const mapSync = require("./map-sync");
    if (!presence.touch(classId, user, cx, cy)) return null;
    const sync = mapSync.snapshot(classId);
    return {
      ok: true,
      peers: presence.list(classId, user.id),
      mapUpdatedAt: sync.updatedAt,
      mapRev: sync.rev
    };
  }
  const res = await doFetch(classId, "/touch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: user.id,
      name: user.fullName || user.username,
      role: user.role,
      x: cx,
      y: cy
    })
  });
  if (!res?.ok) return null;
  return res.json();
}

async function list(classId, excludeUserId) {
  const stub = roomStub(classId);
  if (!stub) {
    const presence = require("./map-presence");
    return presence.list(classId, excludeUserId);
  }
  const res = await doFetch(classId, `/list?exclude=${encodeURIComponent(excludeUserId || "")}`);
  const data = await res.json();
  return data.peers || [];
}

async function leave(classId, userId) {
  const stub = roomStub(classId);
  if (!stub) {
    const presence = require("./map-presence");
    return presence.leave(classId, userId);
  }
  await doFetch(classId, "/leave", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId })
  });
}

async function presencePayload(user) {
  const stub = roomStub(user.classId);
  if (!stub) {
    const presence = require("./map-presence");
    const mapSync = require("./map-sync");
    const sync = mapSync.snapshot(user.classId);
    return {
      peers: presence.list(user.classId, user.id),
      mapUpdatedAt: sync.updatedAt,
      mapRev: sync.rev
    };
  }
  const res = await doFetch(user.classId, `/list?exclude=${encodeURIComponent(user.id || "")}`);
  return res.json();
}

async function bump(classId, updatedAt, links) {
  const stub = roomStub(classId);
  if (!stub) {
    const mapSync = require("./map-sync");
    return mapSync.bump(classId, updatedAt, links);
  }
  const res = await doFetch(classId, "/bump", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updatedAt, links })
  });
  const data = await res.json();
  return data.rev;
}

async function ensure(classId, updatedAt, links) {
  const stub = roomStub(classId);
  if (!stub) {
    const mapSync = require("./map-sync");
    return mapSync.ensure(classId, updatedAt, links);
  }
  const res = await doFetch(classId, "/ensure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updatedAt, links })
  });
  return res.json();
}

async function snapshot(classId) {
  const stub = roomStub(classId);
  if (!stub) {
    const mapSync = require("./map-sync");
    return mapSync.snapshot(classId);
  }
  const res = await doFetch(classId, "/snapshot");
  return res.json();
}

module.exports = {
  touch,
  list,
  leave,
  presencePayload,
  bump,
  ensure,
  snapshot
};
