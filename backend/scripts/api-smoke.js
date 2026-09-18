#!/usr/bin/env node
/**
 * Thin HTTP API smoke tests against an in-process Express app.
 * Uses a temp JSON store so live SQL/Azure is never touched.
 */
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccst-api-smoke-"));
process.env.DATA_DIR = dataDir;
process.env.PERSIST_BACKEND = "json";
process.env.SESSION_SECRET = "ccst-api-smoke-test-secret-do-not-use-live";
process.env.INSTRUCTOR_SIGNUP_CODE = "SMOKE-SIGNUP";
process.env.DB_LOCK_WAIT_MS = "300";
delete process.env.DATABASE_URL;
delete process.env.WEBSITE_HOSTNAME;
delete process.env.AZURE_BLOB_SAS_URL;
if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";

const store = require("../data/store");
const { createApp } = require("../app");

async function test(name, fn) {
  try {
    await fn();
    console.log("ok —", name);
  } catch (err) {
    console.error("FAIL —", name);
    console.error(err);
    process.exitCode = 1;
  }
}

function request(server, method, urlPath, { body, cookie } = {}) {
  const port = server.address().port;
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...(cookie ? { Cookie: cookie } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          const setCookie = res.headers["set-cookie"] || [];
          resolve({ status: res.statusCode, json, setCookie, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sessionCookie(setCookie) {
  const line = (setCookie || []).find((c) => String(c).startsWith("ccst_session="));
  if (!line) return "";
  return String(line).split(";")[0];
}

(async () => {
  await store.reset();
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await test("GET /api/health returns storageMode json", async () => {
      const res = await request(server, "GET", "/api/health");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.app, "ccst-ticketing");
      assert.strictEqual(res.json.storageMode, "file");
      assert.strictEqual(res.json.classroomAiMode, "classroom");
      assert.strictEqual(res.json.ok, true);
      assert.ok(res.json.metrics);
      assert.ok(res.json.ui?.classicClassroom);
    });

    await test("login → /api/me → /api/dashboard", async () => {
      const login = await request(server, "POST", "/api/login", {
        body: { username: "instructor", password: "ProCloud-G18" }
      });
      assert.strictEqual(login.status, 200, login.raw);
      assert.ok(login.json.user);
      assert.strictEqual(login.json.user.role, "instructor");
      const cookie = sessionCookie(login.setCookie);
      assert.ok(cookie.includes("ccst_session="));

      const me = await request(server, "GET", "/api/me", { cookie });
      assert.strictEqual(me.status, 200, me.raw);
      assert.strictEqual(me.json.user.username, "instructor");
      assert.ok(me.json.class);
      assert.ok(me.json.meta);

      const dash = await request(server, "GET", "/api/dashboard", { cookie });
      assert.strictEqual(dash.status, 200, dash.raw);
      assert.strictEqual(dash.json.focus, "class");
      assert.ok(dash.json.mine);
      assert.ok(dash.json.queue);
      assert.ok(dash.json.health);
      assert.ok(dash.json.progress);
    });

    await test("unauthenticated /api/me is rejected", async () => {
      const res = await request(server, "GET", "/api/me");
      assert.ok(res.status === 401 || res.status === 403, `status ${res.status}`);
    });

    let cookie = "";
    await test("instructor can load tickets, users, kb, map, portals", async () => {
      const login = await request(server, "POST", "/api/login", {
        body: { username: "instructor", password: "ProCloud-G18" }
      });
      assert.strictEqual(login.status, 200, login.raw);
      cookie = sessionCookie(login.setCookie);

      const tickets = await request(server, "GET", "/api/tickets", { cookie });
      assert.strictEqual(tickets.status, 200, tickets.raw);
      assert.ok(Array.isArray(tickets.json?.items), "tickets.items");
      assert.ok(typeof tickets.json.total === "number");

      if (tickets.json.items.length) {
        const id = tickets.json.items[0].id;
        const tech = (await request(server, "GET", "/api/users", { cookie })).json.find(
          (u) => u.role === "technician"
        );
        const patch = await request(server, "PATCH", `/api/tickets/${id}`, {
          cookie,
          body: {
            status: "open",
            priority: "high",
            assigneeId: tech?.id || null,
            handoffNote: tech ? "api-smoke hand-off" : undefined
          }
        });
        assert.strictEqual(patch.status, 200, patch.raw);
        assert.strictEqual(patch.json.priority, "high");
        assert.strictEqual(patch.json.status, "open");
        if (tech) assert.strictEqual(patch.json.assigneeId, tech.id);

        // Clear any process cache and confirm the document still has the save.
        store.invalidateReadCache?.();
        const again = await request(server, "GET", `/api/tickets/${id}`, { cookie });
        assert.strictEqual(again.status, 200, again.raw);
        assert.strictEqual(again.json.priority, "high", "priority must persist after reload");
        assert.strictEqual(again.json.status, "open", "status must persist after reload");
        if (tech) {
          assert.strictEqual(again.json.assigneeId, tech.id, "assignee must persist after reload");
        }
      }

      const users = await request(server, "GET", "/api/users", { cookie });
      assert.strictEqual(users.status, 200, users.raw);
      assert.ok(Array.isArray(users.json));
      assert.ok(users.json.some((u) => u.username === "instructor"));

      const kb = await request(server, "GET", "/api/kb", { cookie });
      assert.strictEqual(kb.status, 200, kb.raw);
      assert.ok(Array.isArray(kb.json));
      assert.ok(kb.json.length > 0);

      const map = await request(server, "GET", "/api/map?omitTopology=1", { cookie });
      assert.strictEqual(map.status, 200, map.raw);
      assert.ok(map.json);

      const portals = await request(server, "GET", "/api/portals", { cookie });
      assert.strictEqual(portals.status, 200, portals.raw);
      assert.ok(portals.json);

      const gen = await request(server, "GET", "/api/tickets/generate/status", { cookie });
      assert.strictEqual(gen.status, 200, gen.raw);
      assert.ok("ready" in gen.json || "perStudent" in gen.json || typeof gen.json === "object");
    });

    await test("a write that never settles does not wedge the writes behind it", async () => {
      // The write gate lives in module scope, so on Workers one isolate shares it
      // across requests: a write whose request was cancelled must not queue every
      // later write behind a promise that will never settle.
      const stalled = store.withDb(() => new Promise(() => {}));
      stalled.catch(() => undefined);
      const outcome = await Promise.race([
        store.withDb(async (db) => db.tickets.length),
        new Promise((resolve) => setTimeout(() => resolve("wedged"), 4000))
      ]);
      assert.notStrictEqual(outcome, "wedged", "the write behind a stalled one never ran");
    });

    await test("seed and lab facades still export expected shapes", async () => {
      const seed = require("../data/seed-data");
      const kb = require("../data/seed-kb");
      assert.strictEqual(seed.kbArticles, kb.kbArticles);
      assert.ok(seed.requesters.length > 0);
      const labMap = require("../domain/lab/lab-map");
      assert.ok(labMap.topology().nodes.length > 50);
      assert.ok(labMap.defaultLinks().length > 50);
      const hardware = require("../domain/lab/hardware");
      assert.ok(hardware.TICKET_FAULTS.length > 0);
      assert.strictEqual(typeof hardware.plant, "function");
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  process.exit(process.exitCode || 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
