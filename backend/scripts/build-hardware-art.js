/**
 * Renders the PC hardware diagram to documentation artwork.
 *
 * The panel is built in the browser from live device state, so rather than
 * drawing a second copy by hand this asks a running server for a PC with a
 * planted fault, rebuilds the same SVG from the same layout code, and shoots
 * it with headless Chrome. That way the picture in the guides cannot drift
 * away from the panel the students actually see.
 *
 *   node scripts/build-hardware-art.js [http://localhost:3847]
 *
 * It needs an instructor session, so it signs in with the local default.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = process.argv[2] || "http://localhost:3847";
const out = path.join(__dirname, "..", "docs-assets", "docs-art", "docs-hardware.png");
const tmpDir = path.join(__dirname, "..", "..", ".tmp-docs-pdf");

let cookie = "";
async function call(url, opts = {}) {
  const res = await fetch(base + url, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", cookie },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/**
 * The same layout the panel uses, read straight out of the client bundle:
 * everything from the part helper down to the end of the open-case diagram.
 */
async function diagramSource() {
  const js = await (await fetch(base + "/js/app.js")).text();
  const start = js.indexOf("function hwPartNeutral(");
  const end = js.indexOf("\n}", js.indexOf("function hwDiagramOpen("));
  if (start < 0 || end < 0) throw new Error("Could not find the diagram code in app.js.");
  return js.slice(start, end + 2);
}

/**
 * Opens the case on the bench so the artwork shows the leads and screws.
 * Steps that are already done come back as a 400, which is fine here.
 */
async function openTheCase(deviceId) {
  const act = async (body) => {
    try {
      return await call(`/api/devices/${deviceId}/hardware`, { method: "POST", body });
    } catch {
      return null;
    }
  };
  await act({ action: "power", on: false });
  await act({ action: "select-tool", tool: "screwdriver" });
  for (let i = 0; i < 4; i++) await act({ action: "unscrew" });
  await act({ action: "remove-panel" });
  return act({ action: "select-tool", tool: "hands" });
}

function shoot(htmlPath, width, height) {
  const profile = path.join(tmpDir, "chrome-profile-hardware");
  const child = spawn(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",
    `--window-size=${width},${height}`,
    `--user-data-dir=${profile}`,
    `--screenshot=${out}`,
    "file://" + htmlPath
  ]);
  return new Promise((resolve, reject) => {
    // Chrome does not always exit once the file is written, so poll for it.
    const started = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
        clearInterval(timer);
        child.kill();
        resolve();
      } else if (Date.now() - started > 30000) {
        clearInterval(timer);
        child.kill();
        reject(new Error("Chrome did not write the screenshot."));
      }
    }, 300);
  });
}

(async () => {
  if (!fs.existsSync(chrome)) throw new Error("Google Chrome is required to build the artwork.");
  fs.mkdirSync(tmpDir, { recursive: true });

  // Local dev credentials only; override for any server that has been rotated.
  await call("/api/login", {
    method: "POST",
    body: {
      username: process.env.INSTRUCTOR_USER || "instructor",
      password: process.env.INSTRUCTOR_PASS || "ProCloud-G18"
    }
  });

  // Any PC will do; one with a fault makes a more useful picture.
  const users = await call("/api/users");
  const student = users.find((u) => u.role === "technician");
  if (!student) throw new Error("Add a student to the local class first — the fault comes from a ticket.");
  const gen = await call("/api/tickets/generate", { method: "POST", body: { studentId: student.id, replace: true } });
  const deviceId = (gen.broken || [])[0];
  if (!deviceId) throw new Error("No hardware fault was planted, so there is nothing to photograph.");

  await openTheCase(deviceId);
  const info = await call(`/api/devices/${deviceId}`);
  const css = await (await fetch(base + "/css/app.css")).text();
  const html = `<!doctype html><meta charset="utf-8">
<style>${css}
  html,body { margin:0; background:#0b1720; }
  /* Deliberately not .console-window: its fixed height would crop the legend. */
  .wrap { width: 1000px; padding: 20px 28px; background:#0b1720; }
  .hw-svg { max-height: none; }
  .hw-pane { overflow: visible; padding: 0; }
</style>
<div class="wrap"><div class="hw-pane" id="pane"></div></div>
<script>
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  ${await diagramSource()}
  const device = ${JSON.stringify(info.device)};
  const byId = {};
  device.hardware.components.forEach((c) => { byId[c.id] = c; });
  const svc = device.hardware.service;
  document.getElementById("pane").innerHTML = svc.panelOpen ? hwDiagramOpen(byId) : hwDiagramClosed(byId, svc);
  document.title = "ready";
</script>`;

  const htmlPath = path.join(tmpDir, "hardware.html");
  fs.writeFileSync(htmlPath, html);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  // Tall enough for the diagram plus the legend under it at this width.
  await shoot(htmlPath, 1056, 620);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`Wrote backend/docs-assets/docs-art/docs-hardware.png (${kb} KB) — ${deviceId}, ${info.device.hardware.blockLabel || "fault"}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
