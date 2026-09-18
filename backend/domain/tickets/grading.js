/**
 * Classroom grading for a student's assigned tickets.
 * FCR is intentionally not part of the grade.
 * Open / unresolved work is weighted heavily — leaving tickets open tanks the score.
 */
const REVIEW_SCORES = { good: 100, "needs-work": 55, incomplete: 20 };
const WEIGHTS = { resolution: 45, sla: 20, reviews: 20, priority: 10, process: 5 };

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function bandFor(score) {
  if (score == null) return { key: "insufficient", label: "Insufficient data", color: "#8a97a3" };
  if (score >= 70) return { key: "pass", label: "Pass", color: "#1f7a4c" };
  if (score >= 40) return { key: "needs-work", label: "Needs work", color: "#c98a00" };
  return { key: "incomplete", label: "Incomplete", color: "#b42318" };
}

function reviewAverage(tickets) {
  const marks = tickets
    .map((t) => t.review?.mark)
    .filter((m) => REVIEW_SCORES[m] != null)
    .map((m) => REVIEW_SCORES[m]);
  if (!marks.length) return null;
  return Math.round(marks.reduce((a, b) => a + b, 0) / marks.length);
}

function boolCheckScore(tickets, field) {
  const judged = tickets.filter((t) => t.review && (t.review[field] === true || t.review[field] === false));
  if (!judged.length) return null;
  const ok = judged.filter((t) => t.review[field] === true).length;
  return Math.round((ok / judged.length) * 100);
}

/**
 * Share of assigned tickets that are resolved/closed, with a steep curve so
 * leftover open work hurts more than a flat percentage would.
 * Example: 50% resolved → ~18, 75% → ~49, 100% → 100.
 */
function resolutionScore(kpis) {
  const total = Number(kpis?.total) || 0;
  if (!total) return null;
  const resolved = Number(kpis?.resolved) || 0;
  const rate = clamp(resolved / total, 0, 1);
  return Math.round(Math.pow(rate, 2.5) * 100);
}

/**
 * @param {object} kpis from computeKpis(..., "mine")
 * @param {object[]} tickets enriched or raw assigned tickets
 */
function gradeStudent(kpis, tickets = []) {
  const parts = [];
  const push = (key, label, weight, raw) => {
    if (raw == null) {
      parts.push({ key, label, weight, raw: null, points: null, note: "No data yet" });
      return;
    }
    const points = Math.round((clamp(raw) / 100) * weight * 10) / 10;
    parts.push({ key, label, weight, raw: clamp(raw), points, note: null });
  };

  push("resolution", "Tickets resolved", WEIGHTS.resolution, resolutionScore(kpis));
  push("sla", "SLA compliance", WEIGHTS.sla, kpis.slaCompliance);
  push("reviews", "Overall review mark", WEIGHTS.reviews, reviewAverage(tickets));
  push("priority", "Correct priority", WEIGHTS.priority, boolCheckScore(tickets, "priorityOk"));
  push("process", "Correct process", WEIGHTS.process, boolCheckScore(tickets, "processOk"));

  const usable = parts.filter((p) => p.points != null);
  if (!usable.length) {
    return {
      score: null,
      band: bandFor(null),
      weights: WEIGHTS,
      parts,
      summary: "Not enough ticket work yet to grade."
    };
  }

  const weightSum = usable.reduce((s, p) => s + p.weight, 0);
  const score = Math.round(
    usable.reduce((s, p) => s + (p.raw / 100) * p.weight, 0) * (100 / weightSum)
  );
  const band = bandFor(score);
  const open = Number(kpis?.backlog) || 0;
  const summary =
    open > 0 && band.key !== "pass"
      ? `Open tickets left (${open}) — resolve or close them; unresolved work hits the grade hard.`
      : band.key === "pass"
        ? "Pass — tickets closed, priority, process and SLA look solid."
        : band.key === "needs-work"
          ? "Needs work — close open tickets, or check priority, process, or SLA."
          : "Incomplete — too little closed / reviewed work on the queue yet.";

  return { score, band, weights: WEIGHTS, parts, summary };
}

module.exports = {
  gradeStudent,
  bandFor,
  resolutionScore,
  WEIGHTS,
  REVIEW_SCORES
};
