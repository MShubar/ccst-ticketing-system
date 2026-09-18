import { state } from "../lib/state.js";
import {
  toast,
  debounce,
  api,
  escapeHtml,
  formatWhen,
  downloadPdf,
  isInstructor,
  appLinkAttrs
} from "../lib/util.js";
import { shell } from "../lib/shell.js";

async function renderTeam(flash = "") {
  const users = await api("/api/users");
  state.users = users;
  const className = state.user?.className || state.class?.name || "your class";
  const students = users.filter((u) => u.role === "technician");
  const instructors = users.filter((u) => u.role === "instructor");
  const attendance = isInstructor()
    ? await api("/api/class/attendance").catch(() => ({ day: "", present: [], absent: [] }))
    : null;
  const liveboard = isInstructor()
    ? await api("/api/class/liveboard").catch(() => null)
    : null;
  const genPlan = isInstructor()
    ? (await api("/api/tickets/generate/status").catch(() => null)) || {
        ready: false,
        perStudent: 0,
        labFaults: 0,
        families: [],
        mix: {},
        mixLines: []
      }
    : null;

  const announcementText = state.announcement?.text || "";

  const rosterTable = `
    <div class="card" style="padding:0;margin-bottom:20px" id="class-roster">
      <div style="padding:16px 20px 8px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div>
          <h3 style="margin:0">Class roster</h3>
          <p class="hint" style="margin:4px 0 0">${students.length} student${students.length === 1 ? "" : "s"} · ${instructors.length} instructor${instructors.length === 1 ? "" : "s"}</p>
        </div>
        ${
          isInstructor()
            ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn secondary" type="button" id="ai-review-class" ${students.length ? "" : "disabled"}>AI-review class</button>
                <button class="btn secondary" type="button" id="kpi-csv-class" ${students.length ? "" : "disabled"}>Export CSV</button>
                <button class="btn secondary" type="button" id="kpi-pdf-class" ${students.length ? "" : "disabled"}>Download all KPI PDFs</button>
              </div>`
            : ""
        }
      </div>
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Level</th>${isInstructor() ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${[...instructors, ...students]
            .map(
              (u) => `<tr>
            <td>${escapeHtml(u.fullName)}</td>
            <td class="mono">${escapeHtml(u.username)}</td>
            <td>${u.role}</td>
            <td>L${u.level}</td>
            ${
              isInstructor() && u.role === "technician"
                ? `<td style="white-space:nowrap">
                    <button class="btn" data-ai-review="${u.id}" data-ai-name="${escapeHtml(u.fullName)}" type="button">AI review</button>
                    <button class="btn" data-timeline="${u.id}" data-timeline-name="${escapeHtml(u.fullName)}" type="button">Timeline</button>
                    <button class="btn" data-kpi="${u.id}" data-kpi-name="${escapeHtml(u.username)}" type="button">KPI PDF</button>
                    <button class="btn" data-reset="${u.id}" type="button">Reset password</button>
                    <button class="btn" data-remove="${u.id}" type="button">Remove</button>
                  </td>`
                : isInstructor()
                  ? "<td></td>"
                  : ""
            }
          </tr>`
            )
            .join("")}
          ${!users.length ? `<tr><td colspan="5">No people in this class yet.</td></tr>` : ""}
        </tbody>
      </table>
      <div id="timeline-panel" class="timeline-panel" hidden></div>
    </div>`;

  shell(
    isInstructor() ? "Class & students" : "Team",
    escapeHtml(className),
    `
    ${
      isInstructor()
        ? `<div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 8px">Class announcement</h3>
        <form id="announce-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <div class="field" style="flex:1;min-width:220px;margin:0">
            <label>Message</label>
            <input name="text" maxlength="280" value="${escapeHtml(announcementText)}" />
          </div>
          <button class="btn teal" type="submit">Save note</button>
          <button class="btn secondary" type="button" id="announce-clear">Clear</button>
        </form>
        <p class="hint" id="announce-msg" style="margin:10px 0 0"></p>
      </div>
      <div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 8px">Class SLA</h3>
        <form id="sla-form">
          <table>
            <thead>
              <tr><th>Priority</th><th>Response (minutes)</th><th>Resolve (hours)</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              ${["critical", "high", "medium", "low"]
                .map((key) => {
                  const row = (state.class?.slaPolicy || {})[key] || {};
                  return `<tr>
                    <td style="text-transform:capitalize">${key}</td>
                    <td><input class="mono" name="ack-${key}" type="number" min="1" max="1440" required value="${Number(row.acknowledgeMinutes) || ""}" style="width:6rem" /></td>
                    <td><input class="mono" name="resolve-${key}" type="number" min="1" max="168" required value="${Number(row.resolveHours) || ""}" style="width:6rem" /></td>
                    <td><input name="desc-${key}" maxlength="200" value="${escapeHtml(row.description || "")}" style="width:100%;min-width:12rem" /></td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
          <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn teal" type="submit">Save SLA</button>
            <p class="hint" id="sla-msg" style="margin:0"></p>
          </div>
        </form>
      </div>
      <div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 8px">Live class board</h3>
        <p class="hint" style="margin:0 0 12px">
          ${escapeHtml(liveboard?.day || attendance?.day || "—")} ·
          Present <strong>${liveboard?.presentCount ?? attendance?.present?.length ?? 0}</strong> ·
          Absent <strong>${liveboard?.absentCount ?? attendance?.absent?.length ?? 0}</strong> ·
          Open <strong>${liveboard?.openClass ?? "—"}</strong> ·
          Past SLA <strong>${liveboard?.breachedClass ?? "—"}</strong>
        </p>
        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>In</th>
                <th>Open</th>
                <th>Past SLA</th>
                <th>No priority</th>
                <th>Review left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${(liveboard?.rows || [])
                .map(
                  (row) => `<tr class="${row.stuck ? "liveboard-stuck" : ""}">
                    <td>${escapeHtml(row.student.fullName)}<div class="hint mono">${escapeHtml(row.student.username)}</div></td>
                    <td>${row.present ? "Yes" : "—"}</td>
                    <td>${row.open}</td>
                    <td class="${row.breached ? "sla-bad" : ""}">${row.breached}</td>
                    <td>${row.unprioritized}</td>
                    <td>${row.reviewPending}</td>
                    <td>${row.stuck ? '<span class="badge s-escalated">Needs attention</span>' : row.open ? '<span class="hint">Working</span>' : '<span class="hint">Clear</span>'}</td>
                  </tr>`
                )
                .join("") || `<tr><td colspan="7" class="hint">No students in the class yet.</td></tr>`}
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin:10px 0 0">Needs attention: idle &gt; 45 min or past SLA.</p>
      </div>
      <div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 8px">Attendance today</h3>
        <p class="hint" style="margin:0 0 12px">${escapeHtml(attendance?.day || "—")}</p>
        <div class="grid-2">
          <div>
            <p><strong>Present (${attendance?.present?.length || 0})</strong></p>
            <ul class="attendance-list">
              ${(attendance?.present || [])
                .map(
                  (u) =>
                    `<li>${escapeHtml(u.fullName)} <span class="hint mono">${escapeHtml(u.username)}</span> <span class="hint">· ${formatWhen(u.signedInAt)}</span></li>`
                )
                .join("") || "<li class='hint'>Nobody has signed in yet today.</li>"}
            </ul>
          </div>
          <div>
            <p><strong>Not seen (${attendance?.absent?.length || 0})</strong></p>
            <ul class="attendance-list">
              ${(attendance?.absent || [])
                .map((u) => `<li>${escapeHtml(u.fullName)} <span class="hint mono">${escapeHtml(u.username)}</span></li>`)
                .join("") || "<li class='hint'>All students have signed in.</li>"}
            </ul>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 12px">Add a student</h3>
        <form id="add-student" class="grid-form" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:end">
          <div class="field"><label>Full name</label><input name="fullName" required /></div>
          <div class="field"><label>Username</label><input name="username" required placeholder="firstname.lastname" /></div>
          <div class="field"><label>Password</label><input name="password" type="password" required minlength="6" /></div>
          <button class="btn teal" type="submit">Add student</button>
        </form>
        <p class="hint" id="student-msg" style="margin:12px 0 0${flash ? ";color:var(--ok,#1f7a4c)" : ""}">${escapeHtml(flash)}</p>
      </div>
      ${rosterTable}
      <div class="card" style="margin-bottom:20px;padding:20px">
        <h3 style="margin:0 0 8px">Generate a workload with AI</h3>
        <fieldset class="mix-panel">
          <legend>Choose the issues</legend>
          <ul class="mix-list">
            ${(genPlan.families || [])
              .map((f) => {
                const count = genPlan.mix?.[f.kind] ?? f.default;
                const on = count > 0;
                return `
              <li class="mix-row${on ? "" : " is-off"}">
                <label class="mix-on">
                  <input type="checkbox" data-mix-on="${escapeHtml(f.kind)}" ${on ? "checked" : ""} />
                  <span>${escapeHtml(f.many.charAt(0).toUpperCase() + f.many.slice(1))}</span>
                </label>
                <span class="mix-note">
                  ${escapeHtml(f.category)}${
                    f.plants === "cable"
                      ? " · cable"
                      : f.plants === "hardware"
                        ? " · hardware"
                        : f.plants === "device"
                          ? " · device"
                          : ""
                  }
                </span>
                <input
                  class="mix-count"
                  type="number"
                  min="0"
                  max="${f.max}"
                  value="${on ? count : f.default}"
                  data-mix="${escapeHtml(f.kind)}"
                  ${on ? "" : "disabled"}
                  aria-label="How many ${escapeHtml(f.many)} per student"
                />
              </li>`;
              })
              .join("")}
          </ul>
          <p class="mix-total" id="mix-total"></p>
          <p class="hint" id="gen-faults" style="margin:8px 0 0"></p>
        </fieldset>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px">
          <button class="btn teal" id="gen-tickets" type="button" ${students.length ? "" : "disabled"}>
            Generate ${genPlan.perStudent} tickets per student
          </button>
          <button class="btn danger" id="clear-tickets" type="button" style="margin-left:auto">
            Remove all tickets
          </button>
          <button class="btn secondary" id="compact-tickets" type="button" title="Move old closed tickets out of the hot database">
            Compact storage
          </button>
        </div>
        <p class="hint" id="gen-msg" style="margin:12px 0 0"></p>
      </div>`
        : rosterTable
    }`
  );

  const form = document.getElementById("add-student");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const msg = document.getElementById("student-msg");
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const created = await api("/api/students", {
          method: "POST",
          body: {
            fullName: data.get("fullName"),
            username: data.get("username"),
            password: data.get("password")
          }
        });
        await renderTeam(`Added ${created.fullName} (${created.username}). They can sign in now.`);
        document.getElementById("class-roster")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        if (btn) btn.disabled = false;
        msg.textContent = err.message;
        msg.style.color = "";
      }
    });
  }

  const announceForm = document.getElementById("announce-form");
  if (announceForm) {
    announceForm.onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("announce-msg");
      try {
        const res = await api("/api/class/announcement", {
          method: "PUT",
          body: { text: new FormData(announceForm).get("text") }
        });
        state.announcement = res.announcement;
        if (state.class) state.class.announcement = res.announcement;
        msg.textContent = res.announcement ? "Announcement saved." : "Announcement cleared.";
        await renderTeam(msg.textContent);
      } catch (err) {
        msg.textContent = err.message;
      }
    };
    document.getElementById("announce-clear").onclick = async () => {
      announceForm.querySelector('[name="text"]').value = "";
      announceForm.requestSubmit();
    };
  }

  const slaForm = document.getElementById("sla-form");
  if (slaForm) {
    slaForm.onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("sla-msg");
      const fd = new FormData(slaForm);
      const slaPolicy = {};
      for (const key of ["critical", "high", "medium", "low"]) {
        slaPolicy[key] = {
          acknowledgeMinutes: Number(fd.get(`ack-${key}`)),
          resolveHours: Number(fd.get(`resolve-${key}`)),
          description: String(fd.get(`desc-${key}`) || "")
        };
      }
      try {
        const res = await api("/api/class/sla", { method: "PUT", body: { slaPolicy } });
        if (state.class) state.class.slaPolicy = res.slaPolicy;
        msg.textContent = "SLA saved for this class.";
      } catch (err) {
        msg.textContent = err.message;
      }
    };
  }

  const genBtn = document.getElementById("gen-tickets");

  // The chooser. Reading the panel rather than tracking state separately means
  // the numbers on screen and the ones sent to the server cannot drift apart.
  const readMix = () => {
    const mix = {};
    document.querySelectorAll("[data-mix]").forEach((input) => {
      const kind = input.getAttribute("data-mix");
      mix[kind] = input.disabled ? 0 : Math.max(0, Number(input.value) || 0);
    });
    return mix;
  };

  const refreshMix = (save) => {
    if (!genPlan || !genPlan.families?.length) return;
    const mix = readMix();
    const byKind = {};
    genPlan.families.forEach((f) => {
      byKind[f.kind] = f;
    });
    const sum = (test) =>
      Object.entries(mix).reduce((n, [kind, count]) => n + (test(byKind[kind] || {}) ? count : 0), 0);
    const total = sum(() => true);
    const cable = sum((f) => f.plants === "cable");
    const hardware = sum((f) => f.plants === "hardware");
    const device = sum((f) => f.plants === "device");

    genPlan.mix = mix;
    genPlan.perStudent = total;

    const totalEl = document.getElementById("mix-total");
    if (totalEl) {
      totalEl.textContent = total
        ? `${total} ${total === 1 ? "ticket" : "tickets"} per student · ${students.length} ${
            students.length === 1 ? "student" : "students"
          } · ${total * students.length} tickets in all`
        : "Nothing selected — tick at least one kind of call.";
    }

    const faultsEl = document.getElementById("gen-faults");
    if (faultsEl) {
      const parts = [];
      if (cable) parts.push(`${cable} cable`);
      if (hardware) parts.push(`${hardware} hardware`);
      if (device) parts.push(`${device} device`);
      faultsEl.textContent = parts.length ? `Lab faults: ${parts.join(" · ")}` : "";
    }

    if (genBtn) {
      genBtn.textContent = total ? `Generate ${total} tickets per student` : "Generate tickets per student";
    }

    // Debounced so ticking five families does not fire five Azure writes.
    if (save) scheduleMixSave(mix);
  };
  const scheduleMixSave = debounce((mix) => {
    api("/api/tickets/mix", { method: "PUT", body: { mix } }).catch(() => {});
  }, 700);

  document.querySelectorAll("[data-mix-on]").forEach((box) => {
    box.addEventListener("change", () => {
      const kind = box.getAttribute("data-mix-on");
      const count = document.querySelector(`[data-mix="${kind}"]`);
      if (count) {
        count.disabled = !box.checked;
        // A family ticked back on comes back at the number it had, not zero.
        if (box.checked && Number(count.value) < 1) count.value = 1;
      }
      box.closest(".mix-row")?.classList.toggle("is-off", !box.checked);
      refreshMix(true);
    });
  });
  document.querySelectorAll("[data-mix]").forEach((input) => {
    input.addEventListener("change", () => {
      const max = Number(input.getAttribute("max")) || 12;
      input.value = String(Math.max(0, Math.min(max, Math.floor(Number(input.value) || 0))));
      if (Number(input.value) === 0) {
        const box = document.querySelector(`[data-mix-on="${input.getAttribute("data-mix")}"]`);
        if (box) box.checked = false;
        input.disabled = true;
        input.closest(".mix-row")?.classList.add("is-off");
      }
      refreshMix(true);
    });
  });
  refreshMix(false);

  if (genBtn) {
    genBtn.onclick = async () => {
      const msg = document.getElementById("gen-msg");
      const mix = readMix();
      const perStudent = genPlan?.perStudent || 0;
      if (!perStudent) {
        msg.textContent = "Tick at least one kind of call first.";
        return;
      }
      const total = students.length * perStudent;
      const question = `Write ${perStudent} tickets for each of ${students.length} students (${total} tickets)?`;
      if (!confirm(question)) return;

      genBtn.disabled = true;
      const label = genBtn.textContent;
      let created = 0;
      let aiWritten = 0;
      let unplugged = 0;
      let broken = 0;
      let misconfigured = 0;
      const skipped = [];
      const failed = [];
      let warning = null;

      // One request per student: each is a single model call, so the class
      // never depends on one long-running request.
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        genBtn.textContent = `Generating… ${i + 1}/${students.length}`;
        msg.textContent = `Writing tickets for ${student.fullName}…`;
        try {
          const result = await api("/api/tickets/generate", {
            method: "POST",
            body: { studentId: student.id, mix, replace: false }
          });
          if (result.skipped) skipped.push(student.fullName);
          created += result.created || 0;
          aiWritten += result.ai || 0;
          unplugged += (result.unplugged || []).length;
          broken += (result.broken || []).length;
          misconfigured += (result.misconfigured || []).length;
          if (result.warning) warning = result.warning;
        } catch (err) {
          failed.push(`${student.fullName} (${err.message})`);
        }
      }

      const parts = [`${created} tickets created`];
      if (aiWritten) parts.push(`${aiWritten} written by ${genPlan?.model || "classroom templates"}`);
      if (created - aiWritten > 0) parts.push(`${created - aiWritten} from templates`);
      if (unplugged) parts.push(`${unplugged} cables unplugged on the Lab map`);
      if (broken) parts.push(`${broken} PCs with a broken part`);
      if (misconfigured) parts.push(`${misconfigured} devices left in a faulty state`);
      if (skipped.length) parts.push(`skipped ${skipped.length} student(s) who already had tickets`);
      if (failed.length) parts.push(`failed for ${failed.join(", ")}`);
      if (warning) parts.push(warning);
      msg.textContent = parts.join(" · ");
      genBtn.textContent = label.trim();
      genBtn.disabled = false;
    };
  }

  const clearBtn = document.getElementById("clear-tickets");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const msg = document.getElementById("gen-msg");
      if (!confirm("Remove every ticket in this class? Comments and history go with them and this cannot be undone."))
        return;

      clearBtn.disabled = true;
      const label = clearBtn.textContent;
      clearBtn.textContent = "Removing…";
      try {
        const result = await api("/api/tickets", { method: "DELETE" });
        const parts = [`${result.removed} tickets removed`];
        if (result.replugged) parts.push(`${result.replugged} cables plugged back in`);
        if (result.repaired) parts.push(`${result.repaired} PC parts repaired`);
        if (result.restored) parts.push(`${result.restored} devices put back to the design`);
        msg.textContent = result.removed ? parts.join(" · ") : "There were no tickets to remove.";
      } catch (err) {
        msg.textContent = err.message;
      }
      clearBtn.textContent = label.trim();
      clearBtn.disabled = false;
    };
  }

  const compactBtn = document.getElementById("compact-tickets");
  if (compactBtn) {
    compactBtn.onclick = async () => {
      const msg = document.getElementById("gen-msg");
      compactBtn.disabled = true;
      const label = compactBtn.textContent;
      compactBtn.textContent = "Compacting…";
      try {
        const result = await api("/api/tickets/compact", { method: "POST", body: { force: true } });
        msg.textContent = `Hot tickets ${result.hotBefore} → ${result.hotAfter} (archived ${result.archivedThisPass}; archive holds ${result.archiveTotal}).`;
      } catch (err) {
        msg.textContent = err.message;
      }
      compactBtn.textContent = label.trim();
      compactBtn.disabled = false;
    };
  }

  document.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Remove this student from the class?")) return;
      try {
        await api(`/api/students/${btn.getAttribute("data-remove")}`, { method: "DELETE" });
        await renderTeam();
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });

  document.querySelectorAll("[data-kpi]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-kpi");
      const name = btn.getAttribute("data-kpi-name") || id;
      try {
        btn.disabled = true;
        await downloadPdf(`/api/students/${id}/kpis/pdf`, `kpi-${name}.pdf`);
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
  });

  document.querySelectorAll("[data-ai-review]").forEach((btn) => {
    btn.onclick = async (ev) => {
      const id = btn.getAttribute("data-ai-review");
      const name = btn.getAttribute("data-ai-name") || "student";
      const force = Boolean(ev.shiftKey);
      if (
        !confirm(
          force
            ? `Overwrite AI/instructor reviews for every ticket assigned to ${name}?`
            : `Ask AI to review every unreviewed ticket for ${name}?\n\n(Shift-click to overwrite existing reviews too.)`
        )
      )
        return;
      try {
        btn.disabled = true;
        const res = await api(`/api/students/${id}/review/ai`, { method: "POST", body: { force } });
        toast(
          `Reviewed ${res.reviewed} ticket(s)${res.skipped ? `, skipped ${res.skipped} already reviewed` : ""}.${
            res.warning ? ` ${res.warning}` : ""
          }`,
          res.warning ? "warn" : "ok"
        );
        await renderTeam();
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    };
  });

  const classAiBtn = document.getElementById("ai-review-class");
  if (classAiBtn) {
    classAiBtn.onclick = async (ev) => {
      const force = Boolean(ev.shiftKey);
      if (
        !confirm(
          force
            ? "AI-review ALL tickets in the class, overwriting existing reviews?"
            : "AI-review every unreviewed ticket in the class?\n\n(Shift-click to overwrite existing reviews too.)"
        )
      )
        return;
      try {
        classAiBtn.disabled = true;
        classAiBtn.textContent = "Reviewing…";
        const res = await api("/api/class/review/ai", { method: "POST", body: { force } });
        toast(
          `Reviewed ${res.reviewed} ticket(s).${res.warning ? ` ${res.warning}` : ""}`,
          res.warning ? "warn" : "ok"
        );
        await renderTeam();
      } catch (err) {
        toast(err.message, "error");
        classAiBtn.disabled = !students.length;
        classAiBtn.textContent = "AI-review class";
      }
    };
  }

  document.querySelectorAll("[data-timeline]").forEach((btn) => {
    btn.onclick = async () => {
      const panel = document.getElementById("timeline-panel");
      const id = btn.getAttribute("data-timeline");
      const name = btn.getAttribute("data-timeline-name") || "Student";
      try {
        btn.disabled = true;
        const data = await api(`/api/students/${id}/activity`);
        panel.hidden = false;
        panel.innerHTML = `
          <div style="padding:16px 20px 20px;border-top:1px solid var(--line,#d7e0e6)">
            <h4 style="margin:0 0 8px">Activity · ${escapeHtml(name)}</h4>
            <ul class="timeline-list">
              ${(data.items || [])
                .map(
                  (a) =>
                    `<li><span class="hint">${formatWhen(a.at)}</span> · <span class="mono">${escapeHtml(a.type)}</span> — ${escapeHtml(a.summary)}${
                      a.ticketId ? ` <a ${appLinkAttrs("#/tickets/" + a.ticketId)}>${escapeHtml(a.ticketId)}</a>` : ""
                    }</li>`
                )
                .join("") || "<li class='hint'>No activity logged for this student yet.</li>"}
            </ul>
          </div>`;
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
  });

  const classKpiBtn = document.getElementById("kpi-pdf-class");
  if (classKpiBtn) {
    classKpiBtn.onclick = async () => {
      try {
        classKpiBtn.disabled = true;
        await downloadPdf("/api/class/kpis/pdf", "kpi-class.pdf");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        classKpiBtn.disabled = !students.length;
      }
    };
  }

  const classCsvBtn = document.getElementById("kpi-csv-class");
  if (classCsvBtn) {
    classCsvBtn.onclick = async () => {
      try {
        classCsvBtn.disabled = true;
        await downloadPdf("/api/class/export.csv", "class-kpis.csv");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        classCsvBtn.disabled = !students.length;
      }
    };
  }

  document.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.onclick = async () => {
      const password = prompt("New password (min 6 characters):");
      if (!password) return;
      try {
        await api(`/api/students/${btn.getAttribute("data-reset")}/password`, {
          method: "PATCH",
          body: { password }
        });
        toast("Password updated.", "ok");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  });
}

export { renderTeam };
