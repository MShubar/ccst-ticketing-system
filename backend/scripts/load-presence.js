#!/usr/bin/env node
/**
 * Concurrent map-presence load test (simulates ~40 students on the lab map).
 *
 * Usage:
 *   node backend/scripts/load-presence.js
 *   BASE_URL=https://ccst.website USERS=40 DURATION_MS=30000 node backend/scripts/load-presence.js
 *
 * Creates temporary loadtestNN students, hammers presence like the live client
 * (one request per poll tick; POST only when the cursor moved), then deletes them.
 */
const BASE = String(process.env.BASE_URL || "https://ccst.website").replace(/\/$/, "");
const USERS = Math.max(1, Number(process.env.USERS || 40));
const DURATION_MS = Math.max(5000, Number(process.env.DURATION_MS || 30000));
const POLL_MS = Number(process.env.POLL_MS || 2000);
/** Fraction of ticks that POST a new cursor (rest are GET). Real clients ~often move. */
const MOVE_RATE = Math.min(1, Math.max(0, Number(process.env.MOVE_RATE || 0.55)));
const INSTRUCTOR_USER = process.env.INSTRUCTOR_USER || "instructor";
const INSTRUCTOR_PASS = process.env.INSTRUCTOR_PASS || "ProCloud-G18";
const STUDENT_PASS = process.env.STUDENT_PASS || "LoadTest-40!";
const PREFIX = process.env.USER_PREFIX || "loadtest";
const CREATE_DELAY_MS = Math.max(0, Number(process.env.CREATE_DELAY_MS || 250));
const WARM_DELAY_MS = Math.max(0, Number(process.env.WARM_DELAY_MS || 100));

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
      raw: text.slice(0, 200)
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

async function main() {
  console.log(`Load test → ${BASE}`);
  console.log(`Users=${USERS} duration=${DURATION_MS}ms poll=${POLL_MS}ms moveRate=${MOVE_RATE}\n`);

  const loginInst = await req("POST", "/api/login", {
    body: { username: INSTRUCTOR_USER, password: INSTRUCTOR_PASS }
  });
  if (!loginInst.ok) {
    console.error("Instructor login failed:", loginInst.status, loginInst.raw);
    process.exit(1);
  }
  const instCookie = sessionCookie(loginInst.setCookie);
  console.log("Signed in as instructor.");

  const existing = await req("GET", "/api/users", { cookie: instCookie });
  const byName = new Map((existing.json || []).map((u) => [u.username, u]));

  const roster = [];
  for (let i = 1; i <= USERS; i++) {
    const username = `${PREFIX}${String(i).padStart(2, "0")}`;
    let user = byName.get(username);
    if (!user) {
      const created = await req("POST", "/api/students", {
        cookie: instCookie,
        body: {
          username,
          fullName: `Load Test ${i}`,
          password: STUDENT_PASS
        }
      });
      if (!created.ok) {
        console.error(`Create ${username} failed:`, created.status, created.raw);
        process.exit(1);
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
  console.log(`Roster ready: ${roster.length} students.\n`);

  const sessions = [];
  for (const row of roster) {
    const login = await req("POST", "/api/login", {
      body: { username: row.username, password: STUDENT_PASS }
    });
    if (!login.ok) {
      console.error(`Login ${row.username} failed:`, login.status, login.raw);
      process.exit(1);
    }
    const cookie = sessionCookie(login.setCookie);
    // Warm session-user cache the same way a real page does (/api/me).
    await req("GET", "/api/me", { cookie });
    await req("GET", "/api/map?omitTopology=1", { cookie });
    sessions.push({ ...row, cookie, x: 100 + Math.random() * 800, y: 100 + Math.random() * 500 });
    if (WARM_DELAY_MS) await sleep(WARM_DELAY_MS);
  }
  console.log("All sessions warm. Starting concurrent presence…\n");

  const presenceSamples = [];
  const mapSamples = [];
  const linkSamples = [];
  let stopped = false;
  const workers = sessions.map((s, idx) => {
    const run = async () => {
      // Desync classmates the way a real room does (not one lockstep wave).
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * POLL_MS)));
      while (!stopped) {
        if (Math.random() < MOVE_RATE) {
          s.x += (Math.random() - 0.5) * 40;
          s.y += (Math.random() - 0.5) * 40;
          presenceSamples.push(
            await req("POST", "/api/map/presence", {
              cookie: s.cookie,
              body: { x: s.x, y: s.y }
            })
          );
        } else {
          presenceSamples.push(await req("GET", "/api/map/presence", { cookie: s.cookie }));
        }
        if (idx % 10 === 0 && Math.random() < 0.15) {
          mapSamples.push(await req("GET", "/api/map/links", { cookie: s.cookie }));
        }
        const jitter = Math.floor(POLL_MS * (0.75 + Math.random() * 0.5));
        await new Promise((r) => setTimeout(r, jitter));
      }
    };
    return run();
  });

  // One student periodically refreshes full map + links like a cable fan-out.
  const chatter = (async () => {
    const s = sessions[0];
    while (!stopped) {
      linkSamples.push(await req("GET", "/api/map/links", { cookie: s.cookie }));
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();

  // Mid-run: sample how many peers each session sees (DO vs in-memory isolate split).
  await sleep(Math.min(8000, Math.floor(DURATION_MS / 3)));
  const peerSamples = [];
  for (const s of sessions.slice(0, Math.min(10, sessions.length))) {
    const get = await req("GET", "/api/map/presence", { cookie: s.cookie });
    const peers = Array.isArray(get.json?.peers) ? get.json.peers.length : -1;
    peerSamples.push({ user: s.username, ok: get.ok, peers, ms: get.ms });
  }
  console.log("Peer visibility sample (want ~USERS-1 if shared presence):");
  for (const p of peerSamples) {
    console.log(`  ${p.user}: peers=${p.peers} ok=${p.ok} ${p.ms}ms`);
  }
  const peerCounts = peerSamples.map((p) => p.peers).filter((n) => n >= 0);
  const peerAvg = peerCounts.length
    ? Math.round(peerCounts.reduce((a, b) => a + b, 0) / peerCounts.length)
    : null;
  console.log(`  avg peers seen ≈ ${peerAvg} (of ${USERS - 1} possible)\n`);

  await sleep(Math.max(0, DURATION_MS - Math.min(8000, Math.floor(DURATION_MS / 3))));
  stopped = true;
  await Promise.allSettled([...workers, chatter]);

  const presence = summary("presence", presenceSamples);
  const links = summary("map/links", [...mapSamples, ...linkSamples]);
  const all = summary("all", [...presenceSamples, ...mapSamples, ...linkSamples]);

  const print = (s) => {
    console.log(
      `${s.label}: n=${s.n} ok=${s.ok} err=${s.err} (${s.errRate}) | ` +
        `p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms avg=${s.avg}ms`
    );
  };
  print(presence);
  print(links);
  print(all);

  const rps = (all.n / (DURATION_MS / 1000)).toFixed(1);
  console.log(`\nThroughput ≈ ${rps} req/s over ${DURATION_MS / 1000}s`);

  const laggy = (presence.p95 != null && presence.p95 > 500) || (presence.err > 0 && presence.err / presence.n > 0.02);
  if (laggy) {
    console.log("\nVerdict: LAG DETECTED — p95>500ms or error rate>2%.");
  } else if (presence.p95 != null && presence.p95 > 200) {
    console.log("\nVerdict: ACCEPTABLE with some delay — p95 between 200–500ms.");
  } else {
    console.log("\nVerdict: SMOOTH — presence stays under ~200ms p95 with low errors.");
  }
  if (peerAvg != null && peerAvg < Math.max(5, Math.floor((USERS - 1) * 0.5))) {
    console.log(
      "Presence sync: WEAK — classmates mostly invisible to each other (in-memory per isolate; enable Durable Objects / Workers Paid)."
    );
  } else if (peerAvg != null) {
    console.log("Presence sync: OK — peers are visible across clients.");
  }

  console.log("\nCleaning up load-test students…");
  const del = await req("DELETE", `/api/students?prefix=${encodeURIComponent(PREFIX)}`, {
    cookie: instCookie
  });
  if (!del.ok) {
    console.log(`Bulk delete failed (${del.status}); falling back to one-by-one.`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
