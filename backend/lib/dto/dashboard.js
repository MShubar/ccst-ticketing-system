/**
 * Dashboard API payload. Route gathers KPIs; this module owns the JSON shape.
 */

function toDashboardDto({
  focus,
  mine,
  queue,
  breachedCount,
  health,
  progress
}) {
  return {
    focus,
    mine,
    queue,
    breachedCount,
    health,
    progress
  };
}

module.exports = { toDashboardDto };
