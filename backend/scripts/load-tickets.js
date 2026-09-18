#!/usr/bin/env node
/**
 * Concurrent ticket-save load test (~100 students).
 *
 * Checks:
 *  1) Does PATCH lag under load?
 *  2) Does the save stick on the response?
 *  3) After a settle delay (+ background map traffic), does it revert?
 *
 * Usage:
 *   node backend/scripts/load-tickets.js
 *   BASE_URL=https://ccst.website USERS=100 node backend/scripts/load-tickets.js
 */
const BASE = String(process.env.BASE_URL || "https://ccst.website").replace(/\/$/, "");
const USERS = Math.max(1, Number(process.env.USERS || 100));
const SETTLE_MS = Math.max(1000, Number(process.env.SETTLE_MS || 5000));
const NOISE_MS = Math.max(0, Number(process.env.NOISE_MS || 8000));
const INSTRUCTOR_USER = process.env.INSTRUCTOR_USER || "instructor";
const INSTRUCTOR_PASS = process.env.INSTRUCTOR_PASS || "ProCloud-G18";
const STUDENT_PASS = process.env.STUDENT_PASS || "LoadTest-Tickets!";
const PREFIX = process.env.USER_PREFIX || "tkload";
const CREATE_DELAY_MS = Math.max(0, Number(process.env.CREATE_DELAY_MS || 80));
const RUN_ID = `L${Date.now().toString(36)}`;

const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "pending", "escalated"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summary(label, samples) {
  const ok = samples.filter((s) => s.ok);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  const err = samples.length - ok.length;
  return {
    label,
    n: samples.length,
    ok: ok.length,
    err,
    errRate: samples.length ? ((err / samples.length) * 100).toFixed(1) + "%" : "n/a",
    p50: pct(times, 50),
    p95: pct(times, 95),
    p99: pct(times, 99),
    max: times.length ? times[times.length - 1] : null,
    avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
  };
}

async function req(method, path, { body, cookie } = {}) {
  const started = Date.now();
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (body != null) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    const setCookie = res.headers.getSetCookie?.() || [];
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json,
      setCookie,
      ms: Date.now() - started,
      raw: text.slice(0, 240)
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: null,
      setCookie: [],
      ms: Date.now() - started,
      raw: String(err.message || err)
    };
  }
}

function sessionCookie(setCookie) {
  const line = (setCookie || []).find((c) => String(c).startsWith("ccst_session="));
  if (!line) return "";
  return String(line).split(";")[0];
}

function printSummary(s) {
  console.log(
    `${s.label}: n=${s.n} ok=${s.ok} err=${s.err} (${s.errRate}) | ` +
      `p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms avg=${s.avg}ms`
  );
}

async function ensureRoster(instCookie) {
  const existing = await req("GET", "/api/users", { cookie: instCookie });
  const byName = new Map((existing.json || []).map((u) => [u.username, u]));
  const roster = [];
  for (let i = 1; i <= USERS; i++) {
    const username = `${PREFIX}${String(i).padStart(3, "0")}`;
    let user = byName.get(username);
    if (!user) {
      const created = await req("POST", "/api/students", {
        cookie: instCookie,
        body: { username, fullName: `Ticket Load ${i}`, password: STUDENT_PASS }
      });
      if (!created.ok) {
        throw new Error(`Create ${username} failed: ${created.status} ${created.raw}`);
      }
      user = created.json;
    } else {
      await req("PATCH", `/api/students/${encodeURIComponent(user.id)}/password`, {
        cookie: instCookie,
        body: { password: STUDENT_PASS }
      });
    }
    roster.push({ username, id: user.id });
    if (CREATE_DELAY_MS) await sleep(CREATE_DELAY_MS);
  }
  return roster;
}

async function ensureTickets(instCookie, count) {
  const listed = await req("GET", "/api/tickets?status=new&status=open&status=pending", {
    cookie: instCookie
  });
  let items = Array.isArray(listed.json?.items) ? listed.json.items.slice() : [];
  // Fall back to any tickets if filtered list is short.
  if (items.length < count) {
    const all = await req("GET", "/api/tickets", { cookie: instCookie });
    items = Array.isArray(all.json?.items) ? all.json.items.slice() : [];
  }
  // One ticket per concurrent user — duplicate IDs make last-writer-wins look like a persist bug.
  const seen = new Set();
  items = items.filter((t) => {
    if (!t?.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  while (items.length < count) {
    const n = items.length + 1;
    const created = await req("POST", "/api/tickets", {
      cookie: instCookie,
      body: {
        title: `Load-test ticket ${RUN_ID} #${n}`,
        description: `Auto-created for concurrent save test ${RUN_ID}`,
        category: "general",
        channel: "phone",
        status: "new"
      }
    });
    if (!created.ok) {
      throw new Error(`Create ticket failed: ${created.status} ${created.raw}`);
    }
    if (created.json?.id && !seen.has(created.json.id)) {
      seen.add(created.json.id);
      items.push(created.json);
    }
    if (CREATE_DELAY_MS) await sleep(CREATE_DELAY_MS);
  }
  return items.slice(0, count);
}

async function reqWithRetry(method, path, opts = {}, tries = 4) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await req(method, path, opts);
    if (last.ok || (last.status >= 400 && last.status < 500 && last.status !== 429)) return last;
    await sleep(300 + i * 400);
  }
  return last;
}

async function loginAll(roster) {
  const sessions = [];
  const batchSize = 5;
  for (let i = 0; i < roster.length; i += batchSize) {
    const slice = roster.slice(i, i + batchSize);
    const batch = await Promise.all(
      slice.map(async (row) => {
        const login = await reqWithRetry("POST", "/api/login", {
          body: { username: row.username, password: STUDENT_PASS }
        });
        if (!login.ok) {
          throw new Error(`Login ${row.username} failed: ${login.status} ${login.raw}`);
        }
        const cookie = sessionCookie(login.setCookie);
        await reqWithRetry("GET", "/api/me", { cookie });
        return { ...row, cookie };
      })
    );
    sessions.push(...batch);
    await sleep(100);
  }
  return sessions;
}

function expectedFor(i, studentId) {
  return {
    priority: PRIORITIES[i % PRIORITIES.length],
    status: STATUSES[i % STATUSES.length],
    assigneeId: studentId,
    tag: `${RUN_ID}-${i}`
  };
}

function matchesExpected(ticket, expected) {
  const tags = Array.isArray(ticket?.tags) ? ticket.tags : [];
  return (
    ticket?.priority === expected.priority &&
    ticket?.status === expected.status &&
    ticket?.assigneeId === expected.assigneeId &&
    tags.includes(expected.tag)
  );
}

async function main() {
  console.log(`Ticket save load test → ${BASE}`);
  console.log(`Users=${USERS} settle=${SETTLE_MS}ms noise=${NOISE_MS}ms run=${RUN_ID}\n`);

  const loginInst = await req("POST", "/api/login", {
    body: { username: INSTRUCTOR_USER, password: INSTRUCTOR_PASS }
  });
  if (!loginInst.ok) {
    console.error("Instructor login failed:", loginInst.status, loginInst.raw);
    process.exit(1);
  }
  const instCookie = sessionCookie(loginInst.setCookie);
  console.log("Signed in as instructor.");

  console.log("Preparing roster…");
  const roster = await ensureRoster(instCookie);
  console.log(`Roster ready: ${roster.length}`);

  console.log("Ensuring tickets…");
  const tickets = await ensureTickets(instCookie, USERS);
  console.log(`Tickets ready: ${tickets.length}`);

  console.log("Logging students in…");
  const sessions = await loginAll(roster);
  console.log(`Sessions warm: ${sessions.length}\n`);

  const assignments = sessions.map((s, i) => ({
    session: s,
    ticketId: tickets[i].id,
    expected: expectedFor(i, s.id),
    before: {
      priority: tickets[i].priority || null,
      status: tickets[i].status || null,
      assigneeId: tickets[i].assigneeId || null
    }
  }));

  // Background noise: map reads that historically could dirty/write core.
  let noiseStop = false;
  const noiseSamples = [];
  const noise = Promise.all(
    sessions.slice(0, Math.min(20, sessions.length)).map(async (s, idx) => {
      await sleep(idx * 30);
      while (!noiseStop) {
        noiseSamples.push(await req("GET", "/api/map?omitTopology=1", { cookie: s.cookie }));
        noiseSamples.push(await req("GET", "/api/tickets", { cookie: s.cookie }));
        await sleep(150 + Math.floor(Math.random() * 200));
      }
    })
  );

  console.log("Firing concurrent PATCHes…");
  const patchStarted = Date.now();
  const patchSamples = await Promise.all(
    assignments.map(async (a, i) => {
      await sleep(Math.floor(Math.random() * 120));
      const body = {
        status: a.expected.status,
        priority: a.expected.priority,
        assigneeId: a.expected.assigneeId,
        tags: [a.expected.tag, "load-test"],
        handoffNote: `load-test hand-off ${RUN_ID} #${i}`
      };
      const res = await req("PATCH", `/api/tickets/${encodeURIComponent(a.ticketId)}`, {
        cookie: a.session.cookie,
        body
      });
      return { ...res, ticketId: a.ticketId, expected: a.expected, i };
    })
  );
  const patchWallMs = Date.now() - patchStarted;
  printSummary(summary("PATCH /api/tickets/:id", patchSamples));
  console.log(`Wall-clock for ${USERS} concurrent saves: ${patchWallMs}ms\n`);

  let responseMismatches = 0;
  for (const p of patchSamples) {
    if (!p.ok) {
      responseMismatches += 1;
      continue;
    }
    if (!matchesExpected(p.json, p.expected)) responseMismatches += 1;
  }
  console.log(
    `Immediate PATCH body matches expected: ${USERS - responseMismatches}/${USERS}` +
      (responseMismatches ? ` (${responseMismatches} bad/failed)` : "")
  );

  console.log(`\nSettling ${SETTLE_MS}ms (noise still running)…`);
  await sleep(SETTLE_MS);

  async function verifyPass(label) {
    const reads = await Promise.all(
      assignments.map(async (a) => {
        const res = await req("GET", `/api/tickets/${encodeURIComponent(a.ticketId)}`, {
          cookie: a.session.cookie
        });
        return { ...res, ticketId: a.ticketId, expected: a.expected, before: a.before };
      })
    );
    printSummary(summary(label, reads));
    let ok = 0;
    let reverted = 0;
    let other = 0;
    const examples = [];
    for (const r of reads) {
      if (!r.ok) {
        other += 1;
        if (examples.length < 5) {
          examples.push(`${r.ticketId}: GET ${r.status} ${r.raw}`);
        }
        continue;
      }
      if (matchesExpected(r.json, r.expected)) {
        ok += 1;
        continue;
      }
      const looksBefore =
        (r.json.priority || null) === r.before.priority &&
        (r.json.status || null) === r.before.status &&
        (r.json.assigneeId || null) === r.before.assigneeId;
      if (looksBefore) {
        reverted += 1;
        if (examples.length < 8) {
          examples.push(
            `${r.ticketId}: REVERTED want ${r.expected.priority}/${r.expected.status}/${r.expected.assigneeId} got ${r.json.priority}/${r.json.status}/${r.json.assigneeId}`
          );
        }
      } else {
        other += 1;
        if (examples.length < 8) {
          examples.push(
            `${r.ticketId}: MISMATCH want ${r.expected.priority}/${r.expected.status} got ${r.json.priority}/${r.json.status}`
          );
        }
      }
    }
    console.log(`Persist check (${label}): ok=${ok} reverted=${reverted} other=${other} / ${USERS}`);
    if (examples.length) {
      console.log("Examples:");
      for (const e of examples) console.log("  ", e);
    }
    return { ok, reverted, other, reads };
  }

  const pass1 = await verifyPass("GET after settle");

  if (NOISE_MS > 0) {
    console.log(`\nMore background traffic for ${NOISE_MS}ms…`);
    await sleep(NOISE_MS);
  }
  noiseStop = true;
  await Promise.allSettled([noise]);
  printSummary(summary("background noise", noiseSamples));

  const pass2 = await verifyPass("GET after noise");

  console.log("\n—— Verdict ——");
  const patchSum = summary("patch", patchSamples);
  if (patchSum.p95 != null && patchSum.p95 > 2000) {
    console.log("LAG: PATCH p95 > 2s — saves feel slow under this load.");
  } else if (patchSum.p95 != null && patchSum.p95 > 800) {
    console.log("LAG: mild — PATCH p95 between 0.8–2s.");
  } else {
    console.log("LAG: low — PATCH p95 under ~0.8s.");
  }
  if (patchSum.err / Math.max(1, patchSum.n) > 0.05) {
    console.log("ERRORS: more than 5% of saves failed.");
  }

  const reverted = pass2.reverted;
  const stuck = pass2.ok;
  if (reverted > 0) {
    console.log(
      `REVERT BUG: ${reverted}/${USERS} tickets returned to pre-save values after concurrent use.`
    );
  } else if (stuck === USERS) {
    console.log(`PERSIST OK: all ${USERS} ticket saves still present after settle + noise.`);
  } else {
    console.log(
      `PERSIST PARTIAL: ${stuck}/${USERS} still correct; ${pass2.other} mismatched/failed (not clean reverts).`
    );
  }

  if (process.env.SKIP_CLEANUP === "1") {
    console.log("\nSKIP_CLEANUP=1 — leaving load-test students in place.");
  } else {
    console.log("\nCleaning up load-test students…");
    const del = await req("DELETE", `/api/students?prefix=${encodeURIComponent(PREFIX)}`, {
      cookie: instCookie
    });
    if (!del.ok) {
      console.log(`Bulk delete failed (${del.status}); falling back one-by-one.`);
      let deleted = 0;
      for (const row of roster) {
        const one = await req("DELETE", `/api/students/${encodeURIComponent(row.id)}`, {
          cookie: instCookie
        });
        if (one.ok) deleted += 1;
      }
      console.log(`Deleted ${deleted}/${roster.length}.`);
    } else {
      const body = del.json || {};
      console.log(`Deleted ${body.removed ?? "?"} students, ${body.ticketsRemoved ?? 0} tickets.`);
    }
  }

  if (reverted > 0 || stuck < USERS * 0.95) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
