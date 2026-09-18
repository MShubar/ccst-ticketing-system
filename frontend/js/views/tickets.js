import { state } from "../lib/state.js";
import {
  toast,
  debounce,
  api,
  escapeHtml,
  formatWhen,
  minutesLabel,
  priorityLabel,
  priorityClass,
  slaLine,
  slaResolveCell,
  isInstructor,
  reviewLabel,
  reviewClass,
  commentAuthor,
  appLinkAttrs,
  navigateApp
} from "../lib/util.js";
import { shell } from "../lib/shell.js";
import { cachedGet, invalidateCache } from "../lib/data-cache.js";
import { flashOptimistic, restoreHtml, runOptimistic, snapshotHtml } from "../lib/optimistic.js";

/** Re-run the router without importing it (avoids a circular module load). */
function rerender() {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function afterTicketWrite() {
  invalidateCache("/api/tickets");
  return rerender();
}

/** Filters/sort keys persisted in the hash + sessionStorage for the queue view. */
const TICKET_VIEW_KEYS = ["q", "priority", "status", "mine", "review", "category", "assignee", "sla", "sort", "dir"];

function ticketViewStoreKey() {
  return "ccst.ticket-view." + (state.user?.id || "anon");
}

function savedTicketView() {
  try {
    return sessionStorage.getItem(ticketViewStoreKey()) || "";
  } catch {
    return "";
  }
}

function saveTicketView(value) {
  try {
    if (value) sessionStorage.setItem(ticketViewStoreKey(), value);
    else sessionStorage.removeItem(ticketViewStoreKey());
  } catch {
    /* private browsing — the hash still carries the view */
  }
}

async function renderTickets(query) {
  const hasView = TICKET_VIEW_KEYS.some((k) => query[k]);
  if (!hasView) {
    const saved = savedTicketView();
    const target = "#/tickets?" + saved;
    if (saved && location.hash !== target && !location.hash.startsWith(target + "&")) {
      // Keep the React parent put — warm iframe must not yank /dashboard → /tickets.
      navigateApp(target, { syncParent: false });
      return;
    }
  } else {
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "limit") keep.set(k, v);
    saveTicketView(keep.toString());
  }
  const params = new URLSearchParams(query);
  if (!params.get("page")) params.set("page", "1");
  if (!params.get("limit")) params.set("limit", "25");
  const listPath = "/api/tickets?" + params.toString();
  const result = await cachedGet(listPath, { ttl: 20_000 });
  const tickets = result.items || [];
  const page = result.page || 1;
  const pages = result.pages || 1;
  const filterParams = new URLSearchParams(query);
  filterParams.delete("page");
  const filterQuery = filterParams.toString();
  const pageHref = (nextPage) => {
    const p = new URLSearchParams(filterQuery);
    p.set("page", String(nextPage));
    return "#/tickets?" + p.toString();
  };
  const sortDir = query.dir === "desc" ? "desc" : "asc";
  const sortHref = (key, dir) => {
    const p = new URLSearchParams(filterQuery);
    if (query.sort === key && sortDir === dir) {
      p.delete("sort");
      p.delete("dir");
    } else {
      p.set("sort", key);
      p.set("dir", dir);
    }
    const q = p.toString();
    return "#/tickets" + (q ? "?" + q : "");
  };
  const sortHead = (key, label) => {
    const arrow = (dir, glyph) => {
      const on = query.sort === key && sortDir === dir;
      const word = dir === "asc" ? "ascending" : "descending";
      return `<a class="sort-arrow${on ? " is-active" : ""}" href="${sortHref(key, dir)}"
        title="${on ? `Stop sorting by ${label.toLowerCase()}` : `Sort ${label.toLowerCase()} ${word}`}"
        aria-label="Sort ${label} ${word}">${glyph}</a>`;
    };
    return `<th class="th-sort${query.sort === key ? " is-sorted" : ""}">
      <span class="th-label">${label}</span>
      <span class="sort-arrows">${arrow("asc", "▲")}${arrow("desc", "▼")}</span>
    </th>`;
  };
  shell(
    "Ticket queue",
    `${result.total} ticket${result.total === 1 ? "" : "s"}`,
    `
    <form class="filters" id="filter-form">
      <input name="q" placeholder="Search title, tag, requester…" value="${escapeHtml(query.q || "")}" />
      <select name="priority">
        <option value="">All priorities</option>
        <option value="unassigned" ${query.priority==="unassigned"?"selected":""}>Unassigned</option>
        ${["critical","high","medium","low"].map((p) => `<option ${query.priority===p?"selected":""} value="${p}">${p}</option>`).join("")}
      </select>
      <select name="status">
        <option value="">All statuses</option>
        ${["new","open","pending","escalated","resolved","closed"].map((s) => `<option ${query.status===s?"selected":""} value="${s}">${s}</option>`).join("")}
      </select>
      <select name="mine">
        <option value="">Whole queue</option>
        <option value="1" ${query.mine==="1"?"selected":""}>Assigned to me</option>
      </select>
      <select name="sla">
        <option value="">All SLAs</option>
        <option value="past" ${query.sla==="past"?"selected":""}>Past SLA</option>
        <option value="ok" ${query.sla==="ok"?"selected":""}>On track</option>
        <option value="pending" ${query.sla==="pending"?"selected":""}>Awaiting priority</option>
      </select>
      ${isInstructor() ? `
      <select name="review">
        <option value="">All reviews</option>
        <option value="pending" ${query.review==="pending"?"selected":""}>Needs review</option>
        <option value="done" ${query.review==="done"?"selected":""}>Reviewed</option>
      </select>` : ""}
      <input type="hidden" name="sort" value="${escapeHtml(query.sort || "")}" />
      <input type="hidden" name="dir" value="${escapeHtml(query.sort ? sortDir : "")}" />
      <button class="btn secondary" type="submit">Apply</button>
      <button class="btn secondary btn-reset" type="button" id="reset-filters">Reset filters</button>
      ${isInstructor() ? `<a class="btn teal" ${appLinkAttrs("#/tickets/new")}>New ticket</a>` : ""}
    </form>
    <div class="card" style="padding:0">
      <table>
        <thead><tr>
          ${sortHead("id", "ID")}
          ${sortHead("title", "Title")}
          ${sortHead("category", "Category")}
          ${sortHead("priority", "Priority")}
          ${sortHead("status", "Status")}
          ${sortHead("sla", "SLA resolve")}
          ${sortHead("assignee", "Assignee")}
          ${sortHead("review", "Review")}
        </tr></thead>
        <tbody>
          ${tickets.length ? tickets.map((t) => `
            <tr class="ticket-row" data-id="${t.id}">
              <td class="mono">${t.id}</td>
              <td>${escapeHtml(t.title)}<div class="hint">${escapeHtml(t.requester?.department || "")} · ${escapeHtml(t.channel)}</div></td>
              <td>${escapeHtml(t.category)}</td>
              <td><span class="badge ${priorityClass(t.priority)}">${priorityLabel(t.priority)}</span></td>
              <td><span class="badge s-${t.status}">${t.status}</span></td>
              <td class="${t.sla.resolveBreached ? "sla-bad" : ""}">${slaResolveCell(t.sla)}</td>
              <td>${t.assignee ? escapeHtml(t.assignee.fullName) : "—"}</td>
              <td><span class="badge ${reviewClass(t.review?.mark)}">${reviewLabel(t.review?.mark)}</span></td>
            </tr>`).join("") : `
            <tr><td colspan="8">
              <div class="empty-state">
                <h3>${isInstructor() ? "No tickets in this view" : "No tickets yet"}</h3>
                <p></p>
                ${isInstructor()
                  ? `<a class="btn teal" ${appLinkAttrs("#/team")}>Class &amp; students</a> <a class="btn secondary" ${appLinkAttrs("#/tickets/new")}>New ticket</a>`
                  : `<a class="btn teal" ${appLinkAttrs("#/dashboard")}>Dashboard</a>`}
              </div>
            </td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="pager">
      ${page > 1 ? `<a class="btn secondary" ${appLinkAttrs(pageHref(page - 1))}>Previous</a>` : `<span></span>`}
      <span>Page ${page} of ${pages} · ${result.total} tickets</span>
      ${page < pages ? `<a class="btn secondary" ${appLinkAttrs(pageHref(page + 1))}>Next</a>` : `<span></span>`}
    </div>`
  );
  document.getElementById("filter-form").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v) next.set(k, v);
    // Apply is the user's word on the view, empty boxes included, so it writes
    // the copy itself instead of leaving the old one to be restored.
    saveTicketView(next.toString());
    const target = "#/tickets?" + next.toString();
    if (location.hash === target) rerender();
    else navigateApp(target);
  };
  document.getElementById("reset-filters").onclick = () => {
    saveTicketView("");
    if (location.hash === "#/tickets" || location.hash.startsWith("#/tickets?")) {
      if (location.hash === "#/tickets") rerender();
      else navigateApp("#/tickets");
    } else navigateApp("#/tickets");
  };
  // Column arrows carry the same weight as Apply: clicking the arrow already in
  // use clears the sort, so the saved copy has to be overwritten, not restored.
  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    arrow.onclick = (e) => {
      e.preventDefault();
      const target = arrow.getAttribute("href");
      saveTicketView(target.split("?")[1] || "");
      if (location.hash === target) rerender();
      else navigateApp(target);
    };
  });
  bindTicketRows();
}

function bindTicketRows() {
  document.querySelectorAll("[data-id]").forEach((row) => {
    row.onclick = () => { navigateApp("#/tickets/" + row.dataset.id); };
  });
}

async function renderTicket(id) {
  const [ticket, users] = await Promise.all([api("/api/tickets/" + id), api("/api/users")]);
  const technicians = users.filter((u) => u.role === "technician" || u.role === "instructor");
  shell(
    ticket.id,
    "",
    `
    <div class="meta-row">
      <span class="badge ${priorityClass(ticket.priority)}">${priorityLabel(ticket.priority)}</span>
      <span class="badge s-${ticket.status}">${ticket.status}</span>
      <span class="badge s-escalated">L${ticket.escalationLevel}</span>
      ${ticket.tags.map((tag) => `<span class="badge s-new">${escapeHtml(tag)}</span>`).join("")}
      <span class="${ticket.sla.pending ? "" : ticket.sla.breached ? "sla-bad" : "sla-ok"}">${slaLine(ticket.sla)}</span>
    </div>
    <div class="grid-2">
      <div>
        <div class="card">
          <h2>${escapeHtml(ticket.title)}</h2>
          <p>${escapeHtml(ticket.description)}</p>
          <p class="hint">Requester ${escapeHtml(ticket.requester?.name)} · ${escapeHtml(ticket.requester?.department)} · ${escapeHtml(ticket.channel)} · opened ${formatWhen(ticket.createdAt)}</p>
        </div>
        <form class="card" id="ticket-form" style="margin-top:14px">
          <div class="grid-2">
            <div class="field"><label>Status</label>
              <select name="status">${["new","open","pending","escalated","resolved","closed"].map((s)=>`<option value="${s}" ${ticket.status===s?"selected":""}>${s}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Priority</label>
              <select name="priority">
                <option value="" ${ticket.priority ? "" : "selected"}>Unassigned</option>
                ${["critical","high","medium","low"].map((s)=>`<option value="${s}" ${ticket.priority===s?"selected":""}>${s}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field"><label>Assignee</label>
            <select name="assigneeId">
              <option value="">Unassigned</option>
              ${technicians.map((u)=>`<option value="${u.id}" ${ticket.assigneeId===u.id?"selected":""}>${escapeHtml(u.fullName)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Tags</label><input name="tags" value="${escapeHtml(ticket.tags.join(", "))}" /></div>
          <div class="field" style="max-width:160px"><label>CSAT (1–5)</label>
            <select name="csat">
              <option value="">—</option>
              ${[1,2,3,4,5].map((n)=>`<option value="${n}" ${ticket.csat===n?"selected":""}>${n}</option>`).join("")}
            </select>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn teal" type="submit">Save</button>
            <button class="btn secondary" id="claim" type="button">Claim ticket</button>
            <button class="btn danger" id="escalate" type="button">Escalate</button>
          </div>
        </form>
      </div>
      <div>
        <div class="card review-card">
          <h3>Instructor review</h3>
          ${ticket.review?.body ? `
            <p><span class="badge ${reviewClass(ticket.review.mark)}">${reviewLabel(ticket.review.mark)}</span>
            <span class="hint"> · ${escapeHtml(ticket.review.author?.fullName || "Instructor")} · ${formatWhen(ticket.review.updatedAt)}</span></p>
            <p class="hint" style="margin:8px 0">
              Priority: <strong>${ticket.review.priorityOk === true ? "Correct" : ticket.review.priorityOk === false ? "Incorrect" : "Not judged"}</strong>
              · Process: <strong>${ticket.review.processOk === true ? "Correct" : ticket.review.processOk === false ? "Incorrect" : "Not judged"}</strong>
              ${ticket.review.expectedPriority ? ` · Expected: <strong>${escapeHtml(ticket.review.expectedPriority)}</strong>` : ""}
              ${ticket.review.source && ticket.review.source !== "instructor" ? ` · <span class="mono">${escapeHtml(ticket.review.source)}</span>` : ""}
            </p>
            <p>${escapeHtml(ticket.review.body)}</p>
          ` : (isInstructor() ? "" : `<p class="hint">Not reviewed yet.</p>`)}
          ${isInstructor() ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
            <button class="btn teal" type="button" id="ai-review">Ask AI to review</button>
            <span class="hint" id="ai-review-msg" style="margin:0;align-self:center"></span>
          </div>
          <form id="review-form" style="margin-top:4px">
            <div class="field"><label>Overall mark</label>
              <select name="mark">
                <option value="good" ${ticket.review?.mark==="good"?"selected":""}>Good work</option>
                <option value="needs-work" ${!ticket.review?.mark || ticket.review?.mark==="needs-work"?"selected":""}>Needs work</option>
                <option value="incomplete" ${ticket.review?.mark==="incomplete"?"selected":""}>Incomplete</option>
              </select>
            </div>
            <div class="grid-2">
              <div class="field"><label>Was the priority correct?</label>
                <select name="priorityOk">
                  <option value="" ${ticket.review?.priorityOk == null ? "selected" : ""}>Not judged</option>
                  <option value="yes" ${ticket.review?.priorityOk === true ? "selected" : ""}>Yes — correct priority</option>
                  <option value="no" ${ticket.review?.priorityOk === false ? "selected" : ""}>No — wrong priority</option>
                </select>
              </div>
              <div class="field"><label>Was the process correct?</label>
                <select name="processOk">
                  <option value="" ${ticket.review?.processOk == null ? "selected" : ""}>Not judged</option>
                  <option value="yes" ${ticket.review?.processOk === true ? "selected" : ""}>Yes — right steps</option>
                  <option value="no" ${ticket.review?.processOk === false ? "selected" : ""}>No — missed steps</option>
                </select>
              </div>
            </div>
            <fieldset class="mix-panel" style="margin:0 0 12px">
              <legend>Process checklist</legend>
              <label class="hint" style="display:flex;gap:8px;align-items:center;margin:4px 0">
                <input type="checkbox" name="assessedImpact" ${ticket.review?.checks?.assessedImpact ? "checked" : ""} />
                Assessed impact before setting priority
              </label>
              <label class="hint" style="display:flex;gap:8px;align-items:center;margin:4px 0">
                <input type="checkbox" name="usedLabOrPortals" ${ticket.review?.checks?.usedLabOrPortals ? "checked" : ""} />
                Used Lab map / Portals for the fault
              </label>
              <label class="hint" style="display:flex;gap:8px;align-items:center;margin:4px 0">
                <input type="checkbox" name="leftClearRecord" ${ticket.review?.checks?.leftClearRecord ? "checked" : ""} />
                Left a clear comment / hand-off
              </label>
              <label class="hint" style="display:flex;gap:8px;align-items:center;margin:4px 0">
                <input type="checkbox" name="escalatedAppropriately" ${ticket.review?.checks?.escalatedAppropriately ? "checked" : ""} />
                Escalated only when needed (or not at all)
              </label>
              <label class="hint" style="display:flex;gap:8px;align-items:center;margin:4px 0">
                <input type="checkbox" name="closedCleanly" ${ticket.review?.checks?.closedCleanly ? "checked" : ""} />
                Resolved/closed cleanly when fixed
              </label>
            </fieldset>
            <div class="field"><label>Feedback for the technician</label>
              <textarea name="body" rows="4" required>${escapeHtml(ticket.review?.body || "")}</textarea>
            </div>
            <div><button class="btn teal" type="submit">Save review</button></div>
          </form>` : ""}
        </div>
        <div class="card" style="margin-top:14px">
          <h3>Comments</h3>
          <div class="comments">
            ${(ticket.comments||[]).map((c)=>`
              <div class="comment ${c.kind === "internal" ? "comment-internal" : ""}">
                <strong>${escapeHtml(commentAuthor(c))}</strong>
                <span class="hint"> · ${formatWhen(c.createdAt)}${c.kind === "internal" ? " · hand-off" : ""}</span>
                <div>${escapeHtml(c.body)}</div>
              </div>`).join("") || "<p class='hint'>No comments yet.</p>"}
          </div>
          <form id="comment-form" style="margin-top:12px">
            <div class="field"><label>Add a comment</label><textarea name="body" rows="4" required></textarea></div>
            <div><button class="btn teal" type="submit">Post comment</button></div>
          </form>
        </div>
      </div>
    </div>`
  );

  document.getElementById("ticket-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const newAssignee = fd.get("assigneeId") || null;
    const oldAssignee = ticket.assigneeId || null;
    const body = {
      status: fd.get("status"),
      priority: fd.get("priority"),
      assigneeId: newAssignee,
      tags: fd.get("tags"),
      csat: fd.get("csat") || null
    };
    if (String(newAssignee || "") !== String(oldAssignee || "")) {
      const handoffNote = prompt(
        "Hand-off note (required): what should the next technician know? What you already checked, and the next step."
      );
      if (handoffNote == null) return;
      if (!String(handoffNote).trim()) {
        toast("A hand-off note is required when reassigning.", "warn");
        return;
      }
      body.handoffNote = String(handoffNote).trim();
    }

    const meta = document.querySelector(".meta-row");
    const snaps = snapshotHtml(meta);
    const nextStatus = String(body.status || ticket.status);
    const nextPriority = body.priority ? String(body.priority) : "";
    const saveBtn = form.querySelector('button[type="submit"]');

    await runOptimistic({
      busy: saveBtn,
      apply: () => {
        if (meta) {
          const pri = meta.querySelector(".badge");
          const st = meta.querySelectorAll(".badge")[1];
          if (pri) {
            pri.className = `badge ${priorityClass(nextPriority || null)}`;
            pri.textContent = priorityLabel(nextPriority || null);
          }
          if (st) {
            st.className = `badge s-${nextStatus}`;
            st.textContent = nextStatus;
          }
          flashOptimistic(meta);
        }
      },
      request: () => api("/api/tickets/" + id, { method: "PATCH", body }),
      rollback: () => restoreHtml(snaps),
      onSuccess: () => afterTicketWrite(),
      okToast: "Ticket updated"
    }).catch(() => {});
  };
  document.getElementById("claim").onclick = async () => {
    const claimBtn = document.getElementById("claim");
    const assignee = document.querySelector('#ticket-form select[name="assigneeId"]');
    const prev = assignee ? assignee.value : "";
    const meId = state.user?.id || "";
    await runOptimistic({
      busy: claimBtn,
      apply: () => {
        if (assignee && meId) assignee.value = meId;
        flashOptimistic(document.querySelector(".meta-row"));
      },
      request: () => api("/api/tickets/" + id + "/claim", { method: "POST" }),
      rollback: () => {
        if (assignee) assignee.value = prev;
      },
      onSuccess: () => afterTicketWrite(),
      okToast: "Ticket claimed"
    }).catch(() => {});
  };
  document.getElementById("escalate").onclick = async () => {
    const reason = prompt("Why are you escalating? Topic 1.1: recognise the limit of your knowledge early.");
    if (reason == null) return;
    const escBtn = document.getElementById("escalate");
    const meta = document.querySelector(".meta-row");
    const levelBadge = meta?.querySelectorAll(".badge")[2];
    const prevLevel = levelBadge?.textContent || "";
    const prevStatus = document.querySelector('#ticket-form select[name="status"]')?.value;
    await runOptimistic({
      busy: escBtn,
      apply: () => {
        const statusSel = document.querySelector('#ticket-form select[name="status"]');
        if (statusSel) statusSel.value = "escalated";
        if (levelBadge) {
          const n = Number(String(prevLevel).replace(/\D/g, "")) || ticket.escalationLevel || 1;
          levelBadge.textContent = `L${n + 1}`;
        }
        const st = meta?.querySelectorAll(".badge")[1];
        if (st) {
          st.className = "badge s-escalated";
          st.textContent = "escalated";
        }
        flashOptimistic(meta);
      },
      request: () =>
        api("/api/tickets/" + id + "/escalate", { method: "POST", body: { reason } }),
      rollback: () => {
        if (levelBadge) levelBadge.textContent = prevLevel;
        const statusSel = document.querySelector('#ticket-form select[name="status"]');
        if (statusSel && prevStatus != null) statusSel.value = prevStatus;
      },
      onSuccess: () => afterTicketWrite(),
      okToast: "Escalated"
    }).catch(() => {});
  };
  document.getElementById("comment-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const body = String(fd.get("body") || "").trim();
    if (!body) return;
    const list = document.querySelector(".comments");
    const empty = list?.querySelector("p.hint");
    const temp = document.createElement("div");
    temp.className = "comment is-optimistic";
    temp.innerHTML = `<strong>${escapeHtml(state.user?.fullName || "You")}</strong>
      <span class="hint"> · just now</span>
      <div>${escapeHtml(body)}</div>`;
    const postBtn = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector("textarea");
    await runOptimistic({
      busy: postBtn,
      apply: () => {
        empty?.remove();
        list?.prepend(temp);
        if (textarea) textarea.value = "";
        flashOptimistic(temp);
      },
      request: () =>
        api("/api/tickets/" + id + "/comments", {
          method: "POST",
          body: { body }
        }),
      rollback: () => {
        temp.remove();
        if (textarea) textarea.value = body;
        if (list && !list.children.length) {
          list.innerHTML = "<p class='hint'>No comments yet.</p>";
        }
      },
      onSuccess: () => afterTicketWrite()
    }).catch(() => {});
  };
  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    reviewForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const saveBtn = reviewForm.querySelector('button[type="submit"]');
      await runOptimistic({
        busy: saveBtn,
        apply: () => flashOptimistic(reviewForm.closest(".review-card") || reviewForm),
        request: () =>
          api("/api/tickets/" + id + "/review", {
            method: "POST",
            body: {
              mark: fd.get("mark"),
              body: fd.get("body"),
              priorityOk: fd.get("priorityOk"),
              processOk: fd.get("processOk"),
              assessedImpact: fd.get("assessedImpact") === "on",
              usedLabOrPortals: fd.get("usedLabOrPortals") === "on",
              leftClearRecord: fd.get("leftClearRecord") === "on",
              escalatedAppropriately: fd.get("escalatedAppropriately") === "on",
              closedCleanly: fd.get("closedCleanly") === "on"
            }
          }),
        onSuccess: () => afterTicketWrite(),
        okToast: "Review saved"
      }).catch(() => {});
    };
  }

  const aiReviewBtn = document.getElementById("ai-review");
  if (aiReviewBtn) {
    aiReviewBtn.onclick = async () => {
      const msg = document.getElementById("ai-review-msg");
      const prev = msg?.textContent || "";
      await runOptimistic({
        busy: aiReviewBtn,
        apply: () => {
          if (msg) msg.textContent = "Judging priority and process…";
        },
        request: () => api("/api/tickets/" + id + "/review/ai", { method: "POST", body: {} }),
        rollback: () => {
          if (msg) msg.textContent = prev;
        },
        onSuccess: async (res) => {
          if (msg) {
            msg.textContent = res.warning
              ? res.warning
              : "Classroom AI review saved — edit below if you disagree.";
          }
          await rerender();
        }
      }).catch(() => {});
    };
  }
}

async function renderNewTicket() {
  if (!state.requesters.length) {
    const me = await api("/api/me");
    state.requesters = me.requesters;
  }
  const users = await api("/api/users");
  shell(
    "Create a ticket",
    "",
    `
    <form class="card" id="new-ticket" style="max-width:760px">
      <div class="field"><label>Title</label><input name="title" required /></div>
      <div class="field"><label>Reported issue</label><textarea name="description" rows="5" required></textarea></div>
      <div class="grid-2">
        <div class="field"><label>Category</label>
          <select name="category">${["Access & Identity","Hardware","Software","Network","Printer","Virtualization","Cloud","Email"].map((c)=>`<option>${c}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Priority</label>
          <select name="priority">
            <option value="" selected>Unassigned</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Requester (simulated staff)</label>
          <select name="requesterId">${state.requesters.map((r)=>`<option value="${r.id}">${escapeHtml(r.name)} · ${escapeHtml(r.department)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Channel</label>
          <select name="channel">${["portal","phone","email","chat","walk-in","monitoring"].map((c)=>`<option>${c}</option>`).join("")}</select>
        </div>
      </div>
      <div class="field"><label>Assignee</label>
        <select name="assigneeId">
          <option value="" selected>Unassigned</option>
          ${users.map((u)=>`<option value="${u.id}">${escapeHtml(u.fullName)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Tags</label><input name="tags" placeholder="printer, driver, finance" /></div>
      <button class="btn teal" type="submit">Log ticket</button>
    </form>`
  );
  document.getElementById("new-ticket").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    await runOptimistic({
      busy: submitBtn,
      apply: () => flashOptimistic(form),
      request: () =>
        api("/api/tickets", {
          method: "POST",
          body: Object.fromEntries(fd.entries())
        }),
      onSuccess: (created) => navigateApp("#/tickets/" + created.id),
      okToast: "Ticket logged"
    }).catch(() => {});
  };
}


export { renderTickets, renderTicket, renderNewTicket };
