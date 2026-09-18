#!/usr/bin/env node
/**
 * Lightweight chaos/failover drill against a live health URL:
 * parallel health probes + optional concurrent ticket-load pointer.
 * Usage: HEALTH_URL=https://… node backend/scripts/chaos-health.js
 */
const url = process.env.HEALTH_URL || "https://ccst-ticketing.mohsen-salman099.workers.dev/api/health";
const n = Math.max(1, Number(process.env.CHAOS_N || 20));

async function once(i) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const json = await res.json().catch(() => ({}));
    return {
      i,
      ok: res.ok && json.ok === true,
      status: res.status,
      ms: Date.now() - started,
      storageMode: json.storageMode,
      d1LagWarn: Boolean(json.d1LagWarn),
      coreGateOk: json.coreGate?.coreGateOk
    };
  } catch (err) {
    return { i, ok: false, status: 0, ms: Date.now() - started, error: String(err.message || err) };
  }
}

(async () => {
  console.log(`chaos-health: ${n} parallel GETs → ${url}`);
  const rows = await Promise.all(Array.from({ length: n }, (_, i) => once(i)));
  const ok = rows.filter((r) => r.ok).length;
  const fail = rows.length - ok;
  const lag = rows.filter((r) => r.d1LagWarn).length;
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  console.log(JSON.stringify({ ok, fail, lagWarn: lag, p50ms: p50, p95ms: p95 }, null, 2));
  if (fail) {
    console.error("failures:", rows.filter((r) => !r.ok).slice(0, 5));
    process.exitCode = 1;
  }
})();
