/**
 * Classroom lab map facade — topology + link operations.
 */
const topo = require("./lab-map-topo");
const ops = require("./lab-map-ops");

module.exports = {
  topology: topo.topology,
  defaultLinks: topo.defaultLinks,
  emptyMapState: ops.emptyMapState,
  normalizeLinks: ops.normalizeLinks,
  applyLinkOp: ops.applyLinkOp,
  migrateLinks: ops.migrateLinks,
  MAP_SCHEMA: ops.MAP_SCHEMA,
  endpointKey: topo.endpointKey,
  parseEndpoint: topo.parseEndpoint,
  HQ_DEPTS: topo.HQ_DEPTS,
  DC: topo.DC,
  BRANCHES: topo.BRANCHES,
  EXCHANGES: topo.EXCHANGES,
  ISP_CORE: topo.ISP_CORE,
  HQ_EDGE: topo.HQ_EDGE,
  DUBAI_TELECOM: topo.DUBAI_TELECOM,
  AZURE_ROUTER: topo.AZURE_ROUTER,
  AZURE_SWITCH: topo.AZURE_SWITCH,
  hqPlan: topo.hqPlan,
  hqUplinks: topo.hqUplinks,
  branchSites: topo.branchSites,
  branchHosts: topo.branchHosts,
  backboneLegs: topo.backboneLegs,
  wifiPlan: topo.wifiPlan,
  STAFF_SSID: topo.STAFF_SSID,
  STAFF_KEY: topo.STAFF_KEY,
  AP_UPLINK_PORT: topo.AP_UPLINK_PORT
};
