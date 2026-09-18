/**
 * Live map API smoke — login, fetch map, plug/unplug, labels, presence.
 * Run: node scripts/map-api-smoke.mjs  (from web/, backend on :3847)
 */
const BASE = process.env.API_BASE || "http://localhost:3847";

async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const data = await res.json().catch(() => ({}));
  return { res, data, setCookie };
}

function pickCookie(setCookie) {
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const users = [
  { username: "instructor", password: "ProCloud-G18" },
];

let cookie = "";
let loggedIn = null;
for (const u of users) {
  const { res, data, setCookie } = await req("/api/login", {
    method: "POST",
    body: u,
  });
  if (res.ok && data?.user) {
    cookie = pickCookie(setCookie);
    loggedIn = u.username;
    break;
  }
}
assert(cookie, `login failed for all candidates: ${users.map((u) => u.username).join(", ")}`);
console.log("login ok:", loggedIn);

const map1 = await req("/api/map", { cookie });
assert(map1.res.ok, `GET /api/map ${map1.res.status} ${JSON.stringify(map1.data)}`);
assert(map1.data.topology?.nodes?.length, "map missing topology.nodes");
assert(Array.isArray(map1.data.links), "map missing links");
console.log(
  "map ok:",
  map1.data.topology.nodes.length,
  "nodes,",
  map1.data.links.length,
  "links"
);

const omit = await req("/api/map?omitTopology=1", { cookie });
assert(omit.res.ok, "omitTopology failed");
assert(!omit.data.topology || omit.data.topology === undefined || omit.data.omitTopology, "omit should drop topology");
console.log("omitTopology ok");

const labels = await req("/api/map/labels", { cookie });
assert(labels.res.ok, "labels failed");
console.log("labels ok");

const linksSnap = await req("/api/map/links", { cookie });
assert(linksSnap.res.ok, "links snapshot failed");
console.log("links snapshot ok:", linksSnap.data.links?.length ?? 0);

// Find two free endpoints from topology for a temporary plug test
const nodes = map1.data.topology.nodes;
const occupied = new Set();
for (const l of map1.data.links || []) {
  occupied.add(l.a);
  occupied.add(l.b);
}
const free = [];
for (const n of nodes) {
  for (const p of n.ports || []) {
    if (String(p.id).startsWith("Wlan")) continue;
    const ep = `${n.id}:${p.id}`;
    if (!occupied.has(ep)) free.push(ep);
    if (free.length >= 2) break;
  }
  if (free.length >= 2) break;
}

if (free.length >= 2) {
  const [a, b] = free;
  const plug = await req("/api/map/links/op", {
    method: "POST",
    cookie,
    body: { action: "plug", a, b, cable: "cat6" },
  });
  assert(plug.res.ok, `plug failed ${plug.res.status} ${JSON.stringify(plug.data)}`);
  assert(plug.data.ok, "plug not ok");
  const id = plug.data.link?.id;
  console.log("plug ok:", a, "<->", b, id);

  const unplug = await req("/api/map/links/op", {
    method: "POST",
    cookie,
    body: { action: "unplug", id },
  });
  assert(unplug.res.ok, `unplug failed ${JSON.stringify(unplug.data)}`);
  console.log("unplug ok");
} else {
  console.log("skip plug/unplug — no free port pair");
}

const presence = await req("/api/map/presence", {
  method: "POST",
  cookie,
  body: { x: 100, y: 100 },
});
assert(presence.res.ok, `presence ${presence.res.status}`);
console.log("presence touch ok, peers:", presence.data.peers?.length ?? 0);

await req("/api/map/presence", { method: "DELETE", cookie });
console.log("presence leave ok");

// Open a host device console if any
const host = nodes.find((n) => (n.type || "").toLowerCase().includes("pc") || n.type === "host");
if (host) {
  const dev = await req(`/api/devices/${encodeURIComponent(host.id)}`, { cookie });
  assert(dev.res.ok, `device ${host.id} ${dev.res.status}`);
  const cons = await req(`/api/devices/${encodeURIComponent(host.id)}/console`, {
    method: "POST",
    cookie,
    body: { command: "help", session: null },
  });
  assert(cons.res.ok, `console ${cons.res.status} ${JSON.stringify(cons.data)}`);
  console.log("device console ok:", host.id);
} else {
  console.log("skip console — no pc node");
}

console.log("map-api-smoke: ok");
