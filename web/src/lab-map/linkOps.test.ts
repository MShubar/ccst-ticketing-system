import assert from "node:assert/strict";

import { applyLocalLinkOp, nextLinkId, occupied } from "@/lab-map/linkOps";
import type { MapTopology } from "@/types/map";

const topo: MapTopology = {
  nodes: [
    { id: "PC-A", type: "pc", x: 0, y: 0, ports: [{ id: "Eth0" }] },
    { id: "SW-1", type: "switch", x: 100, y: 0, ports: [{ id: "Gi0/1" }] },
  ],
};

export function runLinkOpsTests() {
  const links: { id: string; a: string; b: string }[] = [];
  assert.equal(occupied(links).size, 0);

  const plug = applyLocalLinkOp(
    { action: "plug", a: "PC-A:Eth0", b: "SW-1:Gi0/1" },
    links,
    topo
  );
  assert.equal(plug.ok, true);
  if (!plug.ok) throw new Error("plug failed");
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
  if (!unplug.ok) throw new Error("unplug failed");
  assert.equal(unplug.links.length, 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLinkOpsTests();
  console.log("linkOps.test: ok");
}
