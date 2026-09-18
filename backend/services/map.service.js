const store = require("../data/store");
const { cachedTopology } = require("../lib/db-request");
const { applyOpenTicketFaults } = require("./ticket-faults");
const mapLive = require("../domain/map/map-live");

async function mapPresencePayload(user) {
  return mapLive.presencePayload(user);
}

async function getLiveLinks(user) {
  const live = await mapLive.snapshot(user.classId);
  if (!live?.links || !live.updatedAt) return null;
  return {
    links: live.links,
    updatedAt: live.updatedAt,
    mapRev: live.rev,
    linksOnly: true
  };
}

async function getMapPayload(db, user, { omitTopology, linksOnly } = {}) {
  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const state = store.ensureClassMap(db, user.classId);
  const sync = await mapLive.ensure(user.classId, state.updatedAt, state.links);

  if (linksOnly) {
    const live = await mapLive.snapshot(user.classId);
    return {
      links: live.links || state.links,
      updatedAt: live.updatedAt || state.updatedAt,
      mapRev: live.rev || sync.rev,
      linksOnly: true
    };
  }

  const devices = store.ensureClassDevices(db, user.classId);
  const topo = cachedTopology(labMap);
  const payload = {
    links: state.links,
    wireless: netSim.wirelessLinks(topo, devices),
    labels: netSim.deviceLabels(topo, devices, state.links),
    updatedAt: state.updatedAt,
    mapRev: sync.rev,
    designLinkCount: labMap.defaultLinks().length,
    lastResetBy: state.lastResetBy || null,
    lastResetAt: state.lastResetAt || null
  };
  if (!omitTopology) payload.topology = topo;
  return payload;
}

function getLabels(db, user) {
  const labMap = require("../domain/lab/lab-map");
  const netSim = require("../domain/lab/net-sim");
  const devices = store.ensureClassDevices(db, user.classId);
  const mapState = store.ensureClassMap(db, user.classId);
  const topo = cachedTopology(labMap);
  return {
    labels: netSim.deviceLabels(topo, devices, mapState.links),
    wireless: netSim.wirelessLinks(topo, devices)
  };
}

async function touchPresence(user, x, y) {
  return mapLive.touch(user.classId, user, x, y);
}

async function leavePresence(user) {
  return mapLive.leave(user.classId, user.id);
}

async function applyLinkOp(classId, body) {
  const labMap = require("../domain/lab/lab-map");
  return store.withDb(async (db) => {
    await store.loadClassLab(db, classId);
    const state = store.ensureClassMap(db, classId);
    const topo = cachedTopology(labMap);
    const applied = labMap.applyLinkOp(state.links, topo, body || {});
    if (!applied.ok) return applied;
    state.links = applied.links;
    state.updatedAt = new Date().toISOString();
    store.markLabDirty(db);
    const rev = await mapLive.bump(classId, state.updatedAt, state.links);
    return {
      ok: true,
      action: applied.action,
      link: applied.link,
      links: state.links,
      updatedAt: state.updatedAt,
      mapRev: rev
    };
  });
}

async function resetMap(db, user) {
  const labMap = require("../domain/lab/lab-map");
  store.markLabDirty(db);
  const state = store.ensureClassMap(db, user.classId);
  const next = labMap.emptyMapState();
  state.links = next.links;
  state.schema = next.schema;
  const refaulted = applyOpenTicketFaults(db, user.classId);
  state.updatedAt = next.updatedAt;
  state.lastResetAt = next.updatedAt;
  state.lastResetBy = {
    id: user.id,
    fullName: user.fullName,
    username: user.username
  };
  store.logActivity(db, user.classId, {
    userId: user.id,
    type: "map_reset",
    summary: `Reset map to design (${(refaulted || []).length} open-ticket cable(s) left unplugged)`
  });
  await store.writeDb(db);
  const rev = await mapLive.bump(user.classId, state.updatedAt, state.links);
  return {
    links: state.links,
    updatedAt: state.updatedAt,
    mapRev: rev,
    refaulted,
    lastResetBy: state.lastResetBy,
    lastResetAt: state.lastResetAt
  };
}

module.exports = {
  mapPresencePayload,
  getMapPayload,
  getLiveLinks,
  getLabels,
  touchPresence,
  leavePresence,
  applyLinkOp,
  resetMap
};
