import {
  api,
  escapeHtml,
  formatWhen,
  isInstructor,
  appLinkAttrs,
  navigateApp
} from "../lib/util.js";
import { shell } from "../lib/shell.js";
import { flashOptimistic, runOptimistic } from "../lib/optimistic.js";
import { cachedGet, putCache } from "../lib/data-cache.js";

function portalBanner(note) {
  if (!note) return "";
  const cls = note.escalate ? "portal-banner warn" : "portal-banner ok";
  return `<p class="${cls}">${escapeHtml(note.message)}</p>`;
}

function portalLog(rows) {
  if (!rows || !rows.length) return `<p class="hint">No activity yet.</p>`;
  return `<ul class="portal-log">${rows.map((r) => `<li><span class="mono">${escapeHtml(formatWhen(r.at))}</span> — ${escapeHtml(r.who)} · ${escapeHtml(r.action || r.mailbox || r.text || "")}</li>`).join("")}</ul>`;
}

async function renderPortals(which, note) {
  let data;
  if (note) {
    data = await api("/api/portals");
    putCache("/api/portals", data);
  } else {
    data = await cachedGet("/api/portals");
  }
  const portals = data.portals;
  const canChange = data.canChange;
  const back = `<p class="hint"><a ${appLinkAttrs("#/portals")}>All portals</a></p>`;

  if (!which) {
    shell(
      "Class portals",
      "",
      `
      <div class="portal-grid">
        <a class="card portal-card" ${appLinkAttrs("#/portals/password")}>
          <h2>Password</h2>
          <p>Company mailboxes</p>
        </a>
        <a class="card portal-card" ${appLinkAttrs("#/portals/cbs")}>
          <h2>CBS</h2>
          <p><code>VM-SQL-FIN</code> · <code>10.10.60.11</code></p>
        </a>
        <a class="card portal-card" ${appLinkAttrs("#/portals/vas")}>
          <h2>VAS</h2>
          <p>SMS, MMS, BMS, USSD</p>
        </a>
        <a class="card portal-card" ${appLinkAttrs("#/portals/vpn")}>
          <h2>VPN</h2>
          <p>IPsec, SSL, Remote</p>
        </a>
      </div>`
    );
    return;
  }

  if (which === "password") {
    const people = portals.passwordPeople || [];
    shell(
      "Password portal",
      "",
      `
      ${back}
      ${portalBanner(note)}
      <div class="field" style="max-width:360px;margin-bottom:12px">
        <label>Search</label>
        <input id="pw-search" type="search" placeholder="Name, mailbox, department, or PC" />
      </div>
      <div class="card cbs-scroll" style="padding:0;margin-bottom:14px">
        <table class="cbs-table">
          <thead><tr><th>Mailbox</th><th>Actions</th><th>Name</th><th>Department</th><th>PC</th><th>Last reset</th></tr></thead>
          <tbody id="pw-rows">
            ${people.map((p) => `<tr data-q="${escapeHtml((p.name + " " + p.mailbox + " " + p.department + " " + p.pc).toLowerCase())}">
              <td class="mono nowrap">${escapeHtml(p.mailbox)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn teal btn-row" data-pw="${escapeHtml(p.id)}">Reset password</button>
                </div>
              </td>
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.department)}</td>
              <td class="mono nowrap">${escapeHtml(p.pc)}</td>
              <td>${p.lastReset ? escapeHtml(formatWhen(p.lastReset)) : "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Recent resets</h3>
        ${portalLog(portals.passwordResets.map((r) => ({ ...r, action: "reset " + (r.name ? r.name + " · " : "") + r.mailbox })))}
      </div>`
    );
    const search = document.getElementById("pw-search");
    const filterRows = () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll("#pw-rows tr").forEach((row) => {
        row.hidden = Boolean(q) && !row.dataset.q.includes(q);
      });
    };
    search.oninput = filterRows;
    document.querySelectorAll("[data-pw]").forEach((btn) => {
      btn.onclick = async () => {
        const q = search.value;
        const row = btn.closest("tr");
        const lastCell = row?.querySelector("td:last-child");
        const prevLast = lastCell?.textContent || "—";
        await runOptimistic({
          busy: btn,
          apply: () => {
            if (lastCell) lastCell.textContent = "just now";
            flashOptimistic(row);
          },
          request: () =>
            api("/api/portals/password", {
              method: "POST",
              body: { userId: btn.dataset.pw }
            }),
          rollback: () => {
            if (lastCell) lastCell.textContent = prevLast;
          },
          onSuccess: async (result) => {
            await renderPortals("password", result);
            const again = document.getElementById("pw-search");
            if (again && q) {
              again.value = q;
              again.dispatchEvent(new Event("input"));
            }
          }
        }).catch(() => {});
      };
    });
    return;
  }

  if (which === "cbs") {
    shell(
      "CBS portal",
      "",
      `
      ${back}
      ${portalBanner(note)}
      <div class="card cbs-scroll" style="padding:0;margin-bottom:14px">
        <table class="cbs-table">
          <thead><tr><th>Invoice</th><th>Actions</th><th>Shop</th><th>Amount</th><th>Day</th><th>Status</th></tr></thead>
          <tbody>
            ${portals.cbs.invoices.map((i) => `<tr>
              <td class="mono nowrap">${escapeHtml(i.id)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn teal btn-row" data-cbs="post" data-id="${escapeHtml(i.id)}">Post</button>
                  <button class="btn secondary btn-row" data-cbs="refund" data-id="${escapeHtml(i.id)}">Refund</button>
                  <button class="btn secondary btn-row" data-cbs="till" data-id="${escapeHtml(i.id)}">Add Safqa till</button>
                  <button class="btn secondary btn-row" data-cbs="export" data-id="${escapeHtml(i.id)}">Export payroll</button>
                </div>
              </td>
              <td>${escapeHtml(i.shop)}</td>
              <td>${escapeHtml(i.amount)}</td>
              <td>${escapeHtml(i.day)}</td>
              <td>${escapeHtml(i.status)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h3>Tills</h3>
        <p>${portals.cbs.tills.map((t) => escapeHtml(t.shop + " · " + t.name + (t.invoiceId ? " · " + t.invoiceId : ""))).join(" · ") || "None"}</p>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>CBS log</h3>
        ${portalLog(portals.cbs.log)}
      </div>`
    );
    document.querySelectorAll("[data-cbs]").forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest("tr");
        const statusCell = row?.querySelector("td:last-child");
        const prev = statusCell?.textContent || "";
        await runOptimistic({
          busy: btn,
          apply: () => {
            if (statusCell) statusCell.textContent = "Updating…";
            flashOptimistic(row);
          },
          request: () =>
            api("/api/portals/cbs", {
              method: "POST",
              body: { action: btn.dataset.cbs, invoiceId: btn.dataset.id }
            }),
          rollback: () => {
            if (statusCell) statusCell.textContent = prev;
          },
          onSuccess: (result) => renderPortals("cbs", result)
        }).catch(() => {});
      };
    });
    return;
  }

  if (which === "vas") {
    const links = portals.vas.connections || [];
    shell(
      "VAS portal",
      "",
      `
      ${back}
      ${portalBanner(note)}
      <p class="hint"><code>${escapeHtml(portals.vas.host)}</code> · <code>${escapeHtml(portals.vas.ip)}</code></p>
      <div class="card cbs-scroll" style="padding:0;margin-bottom:14px">
        <table class="cbs-table">
          <thead><tr><th>Connection</th><th>Actions</th><th>Company</th><th>Service</th><th>Link</th><th>Status</th></tr></thead>
          <tbody>
            ${links.map((c) => `<tr>
              <td class="mono nowrap">${escapeHtml(c.id)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn teal btn-row" data-vas="enable" data-id="${escapeHtml(c.id)}">Enable</button>
                  <button class="btn secondary btn-row" data-vas="disable" data-id="${escapeHtml(c.id)}">Disable</button>
                  <button class="btn secondary btn-row" data-vas="test" data-id="${escapeHtml(c.id)}">Send test</button>
                </div>
              </td>
              <td>${escapeHtml(c.company)}</td>
              <td>${escapeHtml(c.service)}</td>
              <td>${escapeHtml(c.name)}</td>
              <td><strong class="${c.status === "up" ? "sla-ok" : "sla-bad"}">${c.status === "up" ? "Up" : "Down"}</strong></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Test messages</h3>
        ${portalLog(portals.vas.messages)}
        <h3>VAS log</h3>
        ${portalLog(portals.vas.log)}
      </div>`
    );
    document.querySelectorAll("[data-vas]").forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest("tr");
        const statusCell = row?.querySelector("td:last-child");
        const prev = statusCell?.innerHTML || "";
        const action = btn.dataset.vas;
        await runOptimistic({
          busy: btn,
          apply: () => {
            if (statusCell && (action === "enable" || action === "disable")) {
              const up = action === "enable";
              statusCell.innerHTML = `<strong class="${up ? "sla-ok" : "sla-bad"}">${up ? "Up" : "Down"}</strong>`;
            }
            flashOptimistic(row);
          },
          request: () =>
            api("/api/portals/vas", {
              method: "POST",
              body: { action: btn.dataset.vas, connectionId: btn.dataset.id }
            }),
          rollback: () => {
            if (statusCell) statusCell.innerHTML = prev;
          },
          onSuccess: (result) => renderPortals("vas", result)
        }).catch(() => {});
      };
    });
    return;
  }

  if (which === "vpn") {
    const tunnels = portals.vpn.connections || [];
    shell(
      "VPN portal",
      "",
      `
      ${back}
      ${portalBanner(note)}
      <p class="hint"><code>${escapeHtml(portals.vpn.host)}</code> · <code>${escapeHtml(portals.vpn.ip)}</code></p>
      <div class="card cbs-scroll" style="padding:0;margin-bottom:14px">
        <table class="cbs-table">
          <thead><tr><th>Connection</th><th>Actions</th><th>Site</th><th>Type</th><th>Tunnel</th><th>Status</th></tr></thead>
          <tbody>
            ${tunnels.map((c) => `<tr>
              <td class="mono nowrap">${escapeHtml(c.id)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn teal btn-row" data-vpn="enable" data-id="${escapeHtml(c.id)}">Enable</button>
                  <button class="btn secondary btn-row" data-vpn="disable" data-id="${escapeHtml(c.id)}">Disable</button>
                  <button class="btn secondary btn-row" data-vpn="test" data-id="${escapeHtml(c.id)}">Send test</button>
                </div>
              </td>
              <td>${escapeHtml(c.site)}</td>
              <td>${escapeHtml(c.type)}</td>
              <td>${escapeHtml(c.name)}</td>
              <td><strong class="${c.status === "up" ? "sla-ok" : "sla-bad"}">${c.status === "up" ? "Up" : "Down"}</strong></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>VPN log</h3>
        ${portalLog(portals.vpn.log)}
      </div>`
    );
    document.querySelectorAll("[data-vpn]").forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest("tr");
        const statusCell = row?.querySelector("td:last-child");
        const prev = statusCell?.innerHTML || "";
        const action = btn.dataset.vpn;
        await runOptimistic({
          busy: btn,
          apply: () => {
            if (statusCell && (action === "enable" || action === "disable")) {
              const up = action === "enable";
              statusCell.innerHTML = `<strong class="${up ? "sla-ok" : "sla-bad"}">${up ? "Up" : "Down"}</strong>`;
            }
            flashOptimistic(row);
          },
          request: () =>
            api("/api/portals/vpn", {
              method: "POST",
              body: { action: btn.dataset.vpn, connectionId: btn.dataset.id }
            }),
          rollback: () => {
            if (statusCell) statusCell.innerHTML = prev;
          },
          onSuccess: (result) => renderPortals("vpn", result)
        }).catch(() => {});
      };
    });
    return;
  }

  navigateApp("#/portals");
}

export { renderPortals };
