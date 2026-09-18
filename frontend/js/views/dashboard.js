import { state } from "../lib/state.js";
import {
  toast,
  api,
  escapeHtml,
  minutesLabel,
  downloadPdf,
  isInstructor
} from "../lib/util.js";
import { shell } from "../lib/shell.js";
import { renderLogin } from "./login.js";

async function renderDashboard() {
  const data = await api("/api/dashboard");
  const desk = data.focus === "desk";
  const breachedCount = data.breachedCount || 0;
  const mine = data.mine || {};
  const queue = data.queue || {};
  const health = data.health || {};
  const progress = data.progress || {};
  const grade = progress.grade || {};
  const band = grade.band || {};
  const pastSlaHref = "#/tickets?sla=past" + (desk ? "&mine=1" : "");
  const kpis = desk ? mine : queue;
  const pri = kpis.byPriority || {};
  const openTotal = Math.max(1, Number(health.open) || Number(kpis.backlog) || 0);

  const dashStat = (value, label, tone = "teal", href = "") => {
    const inner = `<div class="dash-stat dash-stat-${tone}">
      <div class="dash-stat-value">${value}</div>
      <div class="dash-stat-label">${label}</div>
    </div>`;
    return href ? `<a class="dash-stat-link" href="${href}">${inner}</a>` : inner;
  };

  const dashBar = (label, count, color, href = "") => {
    const n = Number(count) || 0;
    const pct = Math.min(100, Math.round((n / openTotal) * 100));
    const row = `<div class="dash-bar-row">
      <span class="dash-bar-label">${label}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${pct}%;background:${color}"></span></span>
      <span class="dash-bar-count">${n}</span>
    </div>`;
    return href ? `<a class="dash-bar-link" href="${href}">${row}</a>` : row;
  };

  const resolveRate = health.resolveRate != null ? `${health.resolveRate}%` : "—";
  const slaVal = kpis.slaCompliance != null ? `${kpis.slaCompliance}%` : "—";

  if (desk) {
    shell(
      "Your desk",
      "",
      `
      <div class="dash">
        <div class="dash-hero">
          ${dashStat(mine.backlog ?? 0, "Open on my desk", "teal", "#/tickets?mine=1")}
          ${dashStat(mine.resolved ?? 0, "Resolved", "ok")}
          ${dashStat(slaVal, "My SLA", breachedCount ? "warn" : "teal", pastSlaHref)}
          ${dashStat(band.label || "—", "Grade band", "navy", "#/progress")}
          ${dashStat(progress.reviewPending ?? 0, "Awaiting review", "amber")}
          ${dashStat(minutesLabel(mine.avgResponseMinutes), "Avg response", "navy")}
        </div>

        <div class="dash-panels">
          <div class="card dash-panel">
            <div class="dash-panel-head">
              <h2>Priority mix</h2>
              <span class="hint">${health.open || 0} open</span>
            </div>
            ${dashBar("Critical", pri.critical, "#c44b3c", "#/tickets?mine=1&priority=critical")}
            ${dashBar("High", pri.high, "#c9842a", "#/tickets?mine=1&priority=high")}
            ${dashBar("Medium", pri.medium, "#3d7ea6", "#/tickets?mine=1&priority=medium")}
            ${dashBar("Low", pri.low, "#2f7d4a", "#/tickets?mine=1&priority=low")}
            ${dashBar("Unset", pri.unassigned, "#8a97a3", "#/tickets?mine=1&priority=unassigned")}
          </div>

          <div class="card dash-panel">
            <div class="dash-panel-head">
              <h2>Am I on track?</h2>
              <span class="progress-band" style="background:${escapeHtml(band.color || "#8a97a3")};color:#fff">${escapeHtml(band.label || "No grade yet")}</span>
            </div>
            <p class="dash-lead">${grade.score != null ? `<strong>${grade.score}</strong>/100 · ` : ""}${escapeHtml(grade.summary || "Complete and resolve tickets to build a grade.")}</p>
            <div class="dash-chips">
              <span class="dash-chip">Assigned <strong>${progress.assigned || 0}</strong></span>
              <span class="dash-chip">Open <strong>${progress.open || 0}</strong></span>
              <span class="dash-chip">Resolved <strong>${progress.resolved || 0}</strong></span>
              <span class="dash-chip">Avg resolve <strong>${minutesLabel(mine.avgResolutionMinutes)}</strong></span>
            </div>
            <p class="dash-sla ${breachedCount ? "is-bad" : "is-ok"}">${
              breachedCount
                ? `<a href="${pastSlaHref}">${breachedCount} of your tickets past an SLA mark</a>`
                : "None of your tickets are past SLA"
            }</p>
            <div class="dash-actions">
              <a class="btn teal" href="#/tickets?mine=1">My tickets</a>
              <a class="btn secondary" href="#/map">Lab map</a>
              <a class="btn secondary" href="#/progress">My progress</a>
              <button class="btn secondary" type="button" id="kpi-pdf-mine">KPI PDF</button>
            </div>
          </div>
        </div>
      </div>`
    );
  } else {
    shell(
      "Operations board",
      "",
      `
      <div class="dash">
        <div class="dash-hero">
          ${dashStat(queue.backlog ?? 0, "Backlog", "teal", "#/tickets")}
          ${dashStat(queue.resolved ?? 0, "Resolved", "ok")}
          ${dashStat(slaVal, "SLA compliance", breachedCount ? "warn" : "teal", pastSlaHref)}
          ${dashStat(minutesLabel(queue.avgResponseMinutes), "Avg response", "navy")}
          ${dashStat(minutesLabel(queue.avgResolutionMinutes), "Avg resolve", "navy")}
          ${dashStat(resolveRate, "Resolve rate", "ok")}
        </div>

        <div class="dash-panels">
          <div class="card dash-panel">
            <div class="dash-panel-head">
              <h2>Open by priority</h2>
              <span class="hint">${health.open || 0} still open</span>
            </div>
            ${dashBar("Critical", pri.critical, "#c44b3c", "#/tickets?priority=critical")}
            ${dashBar("High", pri.high, "#c9842a", "#/tickets?priority=high")}
            ${dashBar("Medium", pri.medium, "#3d7ea6", "#/tickets?priority=medium")}
            ${dashBar("Low", pri.low, "#2f7d4a", "#/tickets?priority=low")}
            ${dashBar("No priority", pri.unassigned, "#8a97a3", "#/tickets?priority=unassigned")}
          </div>

          <div class="card dash-panel">
            <div class="dash-panel-head">
              <h2>Open by status</h2>
              <span class="hint">Live queue shape</span>
            </div>
            ${dashBar("New", health.new, "#1aa89a", "#/tickets?status=new")}
            ${dashBar("In progress", health.inProgress, "#3d7ea6", "#/tickets?status=open")}
            ${dashBar("Pending", health.pending, "#c9842a", "#/tickets?status=pending")}
            ${dashBar("Escalated", health.escalated, "#c44b3c", "#/tickets?status=escalated")}
          </div>
        </div>

        <div class="dash-panels dash-panels-3">
          <div class="card dash-panel">
            <div class="dash-panel-head"><h2>Coverage</h2></div>
            <div class="dash-metric-stack">
              <div><span class="dash-metric-num">${health.owned ?? 0}</span><span class="dash-metric-cap">Owned</span></div>
              <div><span class="dash-metric-num">${health.unowned ?? 0}</span><span class="dash-metric-cap">Unassigned</span></div>
              <div><span class="dash-metric-num">${pri.unassigned ?? 0}</span><span class="dash-metric-cap">No priority</span></div>
            </div>
          </div>
          <div class="card dash-panel">
            <div class="dash-panel-head"><h2>SLA health</h2></div>
            <p class="dash-sla ${breachedCount ? "is-bad" : "is-ok"}">${
              breachedCount
                ? `<a href="${pastSlaHref}">${breachedCount} ticket(s) past an SLA mark</a>`
                : "0 tickets currently past an SLA mark"
            }</p>
            <div class="dash-chips">
              <span class="dash-chip">Critical <strong>${pri.critical ?? 0}</strong></span>
              <span class="dash-chip">High <strong>${pri.high ?? 0}</strong></span>
              <span class="dash-chip">Total tickets <strong>${queue.total ?? 0}</strong></span>
            </div>
          </div>
          <div class="card dash-panel">
            <div class="dash-panel-head"><h2>Shortcuts</h2></div>
            <div class="dash-actions">
              <a class="btn teal" href="#/team">Class &amp; students</a>
              <a class="btn secondary" href="#/tickets">Ticket queue</a>
              <a class="btn secondary" href="#/map">Lab map</a>
              <button class="btn secondary" type="button" id="kpi-pdf-mine">My KPI PDF</button>
            </div>
          </div>
        </div>
      </div>`
    );
  }

  const kpiBtn = document.getElementById("kpi-pdf-mine");
  if (kpiBtn) {
    kpiBtn.onclick = async () => {
      try {
        kpiBtn.disabled = true;
        await downloadPdf("/api/kpis/pdf", `kpi-${state.user?.username || "me"}.pdf`);
        toast("KPI PDF downloaded.", "ok");
      } catch (err) {
        if (err.message === "auth") return renderLogin();
        toast(err.message, "error");
      } finally {
        kpiBtn.disabled = false;
      }
    };
  }
}

async function renderProgress() {
  const data = await api("/api/dashboard");
  const progress = data.progress || {};
  const grade = progress.grade || {};
  const band = grade.band || {};
  const parts = grade.parts || [];
  shell(
    "My progress",
    "",
    `
    <div class="card">
      <p><span class="progress-band" style="background:${escapeHtml(band.color || "#8a97a3")};color:#fff">${escapeHtml(band.label || "Insufficient data")}</span>
        ${grade.score != null ? ` · <strong>${grade.score}</strong>/100` : ""}</p>
      <p>${escapeHtml(grade.summary || "Not enough ticket work yet to grade.")}</p>
      <div class="progress-grid">
        <div class="card" style="margin:0;box-shadow:none"><div class="kpi-value">${progress.assigned || 0}</div><div class="kpi-label">Assigned</div></div>
        <div class="card" style="margin:0;box-shadow:none"><div class="kpi-value">${progress.open || 0}</div><div class="kpi-label">Still open</div></div>
        <div class="card" style="margin:0;box-shadow:none"><div class="kpi-value">${progress.resolved || 0}</div><div class="kpi-label">Resolved</div></div>
        <div class="card" style="margin:0;box-shadow:none"><div class="kpi-value">${progress.reviewPending || 0}</div><div class="kpi-label">Waiting on review</div></div>
      </div>
      <p class="hint" style="margin-top:14px">Still open: <strong>${progress.open || 0}</strong> · Waiting on review: <strong>${progress.reviewPending || 0}</strong> · Reviewed: <strong>${progress.reviewed || 0}</strong></p>
      <table style="margin-top:12px">
        <thead><tr><th>Component</th><th>Score</th><th>Weight</th></tr></thead>
        <tbody>
          ${parts.map((p) => `
            <tr>
              <td>${escapeHtml(p.label)}${p.note ? ` <span class="hint">· ${escapeHtml(p.note)}</span>` : ""}</td>
              <td>${p.raw == null ? "—" : p.raw + "%"}</td>
              <td>${p.weight}</td>
            </tr>`).join("") || `<tr><td colspan="3" class="hint">No grade components yet.</td></tr>`}
        </tbody>
      </table>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn teal" href="#/tickets?mine=1">My tickets</a>
        <a class="btn secondary" href="#/dashboard">Dashboard</a>
        <button class="btn secondary" type="button" id="kpi-pdf-progress">Download KPI PDF</button>
      </div>
    </div>`
  );
  const btn = document.getElementById("kpi-pdf-progress");
  if (btn) {
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        await downloadPdf("/api/kpis/pdf", `kpi-${state.user?.username || "me"}.pdf`);
        toast("KPI PDF downloaded.", "ok");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
  }
}


/**
 * The queue view keeps its filters, sort and page in the hash, and a copy in
 * session storage. Opening a ticket and coming back, or leaving for the map and
 * clicking Ticket queue again, lands on the same slice of the queue. Only the
 * Reset filters button throws that away.
 */
const TICKET_VIEW_KEYS = ["q", "priority", "status", "mine", "review", "category", "assignee", "sla", "sort", "dir"];


export { renderDashboard, renderProgress };
