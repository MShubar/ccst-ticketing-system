/**
 * Probe CoreGate + D1 for health/ops responses.
 */
const { cfEnv } = require("./cf-env");
const ops = require("./ops-metrics");

async function probeCoreGate() {
  const env = cfEnv();
  if (!env?.CORE_GATE) {
    return { coreGateOk: false, reason: "CORE_GATE binding missing" };
  }
  try {
    const stub = env.CORE_GATE.get(env.CORE_GATE.idFromName("global"));
    if (typeof stub.fetch !== "function") {
      return { coreGateOk: false, reason: "CoreGate stub has no fetch" };
    }
    const res = await stub.fetch("https://core-gate/status", { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return {
        coreGateOk: false,
        reason: json?.error || `status HTTP ${res.status}`
      };
    }
    ops.noteStorageProbe({
      coreGateOk: true,
      d1LagMs: json.d1LagMs,
      d1BehindCore: json.d1BehindCore
    });
    return {
      coreGateOk: true,
      bytes: json.bytes,
      tickets: json.tickets,
      users: json.users,
      lastPersistAt: json.lastPersistAt,
      d1UpdatedAt: json.d1UpdatedAt,
      d1BehindCore: Boolean(json.d1BehindCore),
      d1LagMs: json.d1LagMs
    };
  } catch (err) {
    ops.noteStorageProbe({ coreGateOk: false });
    return { coreGateOk: false, reason: err.message || String(err) };
  }
}

module.exports = { probeCoreGate };
