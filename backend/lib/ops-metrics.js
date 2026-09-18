/**
 * Lightweight in-process ops counters for classroom health.
 * Worker isolates do not share memory — treat as a best-effort signal, not a
 * global dashboard. Aggregated enough for /api/health and instructor /api/ops.
 */

const MAX_SLOW = 24;
const MAX_ERRORS = 24;

const state = {
  startedAt: new Date().toISOString(),
  requests: 0,
  slow: 0,
  errors5xx: 0,
  writes: 0,
  writeMsTotal: 0,
  lastWriteMs: 0,
  lastSlow: [],
  lastErrors: [],
  lastPersistAt: null,
  coreGateOk: null,
  d1LagMs: null,
  d1BehindCore: null
};

function clientIp(req) {
  const xf = String(req?.headers?.["cf-connecting-ip"] || req?.headers?.["x-forwarded-for"] || "");
  if (xf) return xf.split(",")[0].trim();
  return req?.ip || "unknown";
}

function noteRequest({ method, path, ms, status }) {
  state.requests += 1;
  if (ms >= 700) {
    state.slow += 1;
    state.lastSlow.unshift({
      at: new Date().toISOString(),
      method,
      path,
      ms,
      status
    });
    if (state.lastSlow.length > MAX_SLOW) state.lastSlow.length = MAX_SLOW;
  }
  if (status >= 500) {
    state.errors5xx += 1;
    state.lastErrors.unshift({
      at: new Date().toISOString(),
      method,
      path,
      status
    });
    if (state.lastErrors.length > MAX_ERRORS) state.lastErrors.length = MAX_ERRORS;
  }
}

function noteWrite(ms) {
  state.writes += 1;
  state.writeMsTotal += ms;
  state.lastWriteMs = ms;
  state.lastPersistAt = new Date().toISOString();
}

function noteStorageProbe({ coreGateOk, d1LagMs, d1BehindCore }) {
  if (coreGateOk != null) state.coreGateOk = coreGateOk;
  if (d1LagMs != null) state.d1LagMs = d1LagMs;
  if (d1BehindCore != null) state.d1BehindCore = d1BehindCore;
}

function snapshot() {
  const avgWriteMs = state.writes ? Math.round(state.writeMsTotal / state.writes) : 0;
  return {
    startedAt: state.startedAt,
    requests: state.requests,
    slow: state.slow,
    errors5xx: state.errors5xx,
    writes: state.writes,
    avgWriteMs,
    lastWriteMs: state.lastWriteMs,
    lastPersistAt: state.lastPersistAt,
    coreGateOk: state.coreGateOk,
    d1LagMs: state.d1LagMs,
    d1BehindCore: state.d1BehindCore,
    lastSlow: state.lastSlow.slice(0, 8),
    lastErrors: state.lastErrors.slice(0, 8)
  };
}

module.exports = {
  clientIp,
  noteRequest,
  noteWrite,
  noteStorageProbe,
  snapshot
};
