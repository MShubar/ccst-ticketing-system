/**
 * Ticket response shapes for the API. Routes/services enrich via store, then
 * pass through here so list vs detail and student vs instructor stay consistent.
 */

/**
 * @param {object} enriched - store.enrichTicket(...) result
 * @param {object|null} viewer - requesting user
 * @param {{ list?: boolean }} [opts]
 */
function toTicketDto(enriched, viewer = null, opts = {}) {
  if (!enriched) return null;
  const list = Boolean(opts.list);
  const out = { ...enriched };

  if (list) delete out.comments;

  if (viewer && viewer.role !== "instructor") {
    delete out.fault;
    delete out.generatedBy;
  }

  if (out.review && typeof out.review === "object") {
    const { authorId, ...review } = out.review;
    out.review = review;
  }

  return out;
}

/**
 * Queue table row — intentionally small. Description, fault keys, comments and
 * full review text stay on the detail endpoint so list payloads stay cheap.
 */
function toTicketListItem(enriched, viewer) {
  if (!enriched) return null;
  const commentCount = Array.isArray(enriched.comments) ? enriched.comments.length : 0;
  const assignee = enriched.assignee
    ? {
        id: enriched.assignee.id,
        fullName: enriched.assignee.fullName,
        username: enriched.assignee.username,
        role: enriched.assignee.role
      }
    : null;
  const requester = enriched.requester
    ? {
        id: enriched.requester.id,
        name: enriched.requester.name,
        department: enriched.requester.department
      }
    : null;
  const sla = enriched.sla
    ? {
        pending: enriched.sla.pending,
        breached: enriched.sla.breached,
        resolveDeadline: enriched.sla.resolveDeadline,
        ackDeadline: enriched.sla.ackDeadline
      }
    : null;
  const review =
    enriched.review && typeof enriched.review === "object"
      ? { mark: enriched.review.mark || null, hasBody: Boolean(enriched.review.body) }
      : null;

  const item = {
    id: enriched.id,
    title: enriched.title,
    category: enriched.category || null,
    subcategory: enriched.subcategory || null,
    priority: enriched.priority || null,
    status: enriched.status,
    createdAt: enriched.createdAt,
    updatedAt: enriched.updatedAt || null,
    resolvedAt: enriched.resolvedAt || null,
    assigneeId: enriched.assigneeId || null,
    assignee,
    requester,
    sla,
    review,
    commentCount,
    tags: Array.isArray(enriched.tags) ? enriched.tags.slice(0, 8) : [],
    difficulty: enriched.difficulty || 1
  };

  if (viewer && viewer.role === "instructor" && enriched.generatedBy) {
    item.generatedBy = {
      kind: enriched.generatedBy.kind || null
    };
  }

  return item;
}

function toTicketDetail(enriched, viewer, comments) {
  const base = toTicketDto(enriched, viewer, { list: false });
  if (!base) return null;
  if (comments !== undefined) {
    base.comments = (comments || []).map((c) => {
      if (!c || typeof c !== "object") return c;
      const { authorId, ...rest } = c;
      return rest;
    });
  }
  return base;
}

module.exports = { toTicketDto, toTicketListItem, toTicketDetail };
