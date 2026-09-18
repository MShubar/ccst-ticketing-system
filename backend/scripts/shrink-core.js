#!/usr/bin/env node
/**
 * One-shot: shrink production hot core by clearing class ticket queues
 * (and archives) through the normal API so CoreGate stays authoritative.
 *
 * Usage:
 *   BASE_URL=https://ccst.website INSTRUCTOR_PASS='…' node backend/scripts/shrink-core.js
 */
const BASE = (process.env.BASE_URL || "https://ccst-ticketing.mohsen-salman099.workers.dev").replace(/\/$/, "");
const PASS = process.env.INSTRUCTOR_PASS || "ProCloud-G18";

const INSTRUCTORS = [
  "instructor",
  "mohsenshubar",
  "mohsen.salman",
  "mohsen.shubar",
  "hasan.abbas",
  "hasani",
  "hasanie22"
];

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASS })
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    (res.headers.get("set-cookie") || "").split(",").map((p) => p.split(";")[0].trim()).filter((p) => p.includes("=")).join("; ");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${username}: login ${res.status} ${json.error || ""}`);
  return { cookie: cookieHeader, user: json.user };
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error || ""}`);
  return json;
}

async function main() {
  console.log(`Target ${BASE}`);
  const health0 = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("before", {
    coreTickets: health0.coreTickets,
    bytes: health0.coreGate?.bytes,
    ok: health0.ok
  });

  for (const username of INSTRUCTORS) {
    try {
      const { cookie, user } = await login(username);
      console.log(`\n→ ${username} (${user.classId || "?"})`);
      const compact = await api(cookie, "POST", "/api/tickets/compact", { force: true });
      console.log("  compact", compact);
      const cleared = await api(cookie, "DELETE", "/api/tickets");
      console.log("  cleared", cleared);
    } catch (err) {
      console.warn(`  skip ${username}:`, err.message);
    }
  }

  const health1 = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("\nafter", {
    coreTickets: health1.coreTickets,
    bytes: health1.coreGate?.bytes,
    ok: health1.ok
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
