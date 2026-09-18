/**
 * Shape for class SLA updates. Keeps route handlers free of field parsing.
 * @param {unknown} body
 * @returns {{ critical?: object, high?: object, medium?: object, low?: object }}
 */
function parseSlaPolicyBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const policy = raw.slaPolicy && typeof raw.slaPolicy === "object" ? raw.slaPolicy : raw;
  const out = {};
  for (const key of ["critical", "high", "medium", "low"]) {
    const row = policy[key];
    if (!row || typeof row !== "object") continue;
    out[key] = {
      acknowledgeMinutes: row.acknowledgeMinutes,
      resolveHours: row.resolveHours,
      description: row.description
    };
  }
  return out;
}

module.exports = { parseSlaPolicyBody };
