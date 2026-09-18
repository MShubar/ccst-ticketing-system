/**
 * Hot vs cold ticket policy — keep the core document small.
 * Terminal tickets (resolved/closed) move to per-class archive docs once
 * they no longer need day-to-day queue access.
 */

const TERMINAL = new Set(["resolved", "closed"]);

function graceMs() {
  const days = Number(process.env.TICKET_HOT_GRACE_DAYS);
  const n = Number.isFinite(days) && days >= 0 ? days : 3;
  return n * 24 * 60 * 60 * 1000;
}

function hotMaxPerClass() {
  const n = Number(process.env.TICKET_HOT_MAX_PER_CLASS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
}

function isTerminal(ticket) {
  return TERMINAL.has(String(ticket?.status || ""));
}

function needsReview(ticket) {
  return isTerminal(ticket) && !(ticket.review && ticket.review.body);
}

function terminalAt(ticket) {
  const raw = ticket.closedAt || ticket.resolvedAt || ticket.updatedAt || ticket.createdAt;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Keep in the hot core when still in the active queue, awaiting review, or
 * freshly closed (grace window for reopen / KPI glances).
 */
function isHotTicket(ticket, now = Date.now()) {
  if (!ticket) return false;
  if (!isTerminal(ticket)) return true;
  if (needsReview(ticket)) return true;
  const age = now - terminalAt(ticket);
  return age >= 0 && age < graceMs();
}

/**
 * Split tickets into hot (core) and cold (archive) buckets.
 * When a class still exceeds the hot cap, force-archive oldest terminal rows
 * even inside the grace window (reviews still stay hot).
 * @param {object} [opts]
 * @param {number} [opts.graceMs] override grace window
 * @param {number} [opts.hotMax] override per-class hot cap
 * @param {boolean} [opts.force] grace=0 and tighter cap for instructor compact
 */
function splitHotCold(tickets, now = Date.now(), opts = {}) {
  const list = Array.isArray(tickets) ? tickets : [];
  const effectiveGrace = opts.force ? 0 : opts.graceMs != null ? opts.graceMs : graceMs();
  const hot = [];
  const cold = [];
  for (const t of list) {
    if (!isTerminal(t)) {
      hot.push(t);
      continue;
    }
    if (needsReview(t)) {
      hot.push(t);
      continue;
    }
    const age = now - terminalAt(t);
    if (age >= 0 && age < effectiveGrace) hot.push(t);
    else cold.push(t);
  }

  const byClass = new Map();
  for (const t of hot) {
    const cid = t.classId || "_";
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(t);
  }

  const max = opts.force
    ? Math.min(hotMaxPerClass(), Number(opts.hotMax) || 80)
    : opts.hotMax != null
      ? opts.hotMax
      : hotMaxPerClass();
  const forced = [];
  for (const [, rows] of byClass) {
    if (rows.length <= max) continue;
    const terminal = rows
      .filter((t) => isTerminal(t) && !needsReview(t))
      .sort((a, b) => terminalAt(a) - terminalAt(b));
    let overflow = rows.length - max;
    for (const t of terminal) {
      if (overflow <= 0) break;
      forced.push(t);
      overflow -= 1;
    }
  }

  if (forced.length) {
    const drop = new Set(forced.map((t) => t.id));
    return {
      hot: hot.filter((t) => !drop.has(t.id)),
      cold: cold.concat(forced)
    };
  }
  return { hot, cold };
}

function mergeTicketLists(primary, extra) {
  const map = new Map();
  for (const t of primary || []) {
    if (t?.id != null) map.set(t.id, t);
  }
  for (const t of extra || []) {
    if (t?.id == null) continue;
    const prev = map.get(t.id);
    if (!prev) {
      map.set(t.id, t);
      continue;
    }
    const prevAt = String(prev.updatedAt || prev.resolvedAt || "");
    const nextAt = String(t.updatedAt || t.resolvedAt || "");
    if (!prevAt || (nextAt && nextAt >= prevAt)) map.set(t.id, t);
  }
  return [...map.values()];
}

module.exports = {
  TERMINAL,
  graceMs,
  hotMaxPerClass,
  isTerminal,
  needsReview,
  isHotTicket,
  splitHotCold,
  mergeTicketLists
};
