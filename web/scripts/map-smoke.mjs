/**
 * Run from web/: node --experimental-strip-types scripts/map-smoke.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const linkOpsUrl = pathToFileURL(path.join(root, "src/lab-map/linkOps.ts")).href;

const { applyLocalLinkOp, nextLinkId, occupied } = await import(linkOpsUrl);

const topo = {
  nodes: [
    { id: "PC-A", type: "pc", x: 0, y: 0, ports: [{ id: "Eth0" }] },
    { id: "SW-1", type: "switch", x: 100, y: 0, ports: [{ id: "Gi0/1" }] },
  ],
};

const links = [];
assert.equal(occupied(links).size, 0);

const plug = applyLocalLinkOp(
  { action: "plug", a: "PC-A:Eth0", b: "SW-1:Gi0/1" },
  links,
  topo
);
assert.equal(plug.ok, true);
assert.equal(plug.links.length, 1);
assert.equal(plug.links[0].id, nextLinkId([]));

const busy = applyLocalLinkOp(
  { action: "plug", a: "PC-A:Eth0", b: "SW-1:Gi0/1" },
  plug.links,
  topo
);
assert.equal(busy.ok, false);

const unplug = applyLocalLinkOp(
  { action: "unplug", id: plug.links[0].id },
  plug.links,
  topo
);
assert.equal(unplug.ok, true);
assert.equal(unplug.links.length, 0);

console.log("map-smoke: ok");
