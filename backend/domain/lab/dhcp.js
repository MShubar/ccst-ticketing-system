/**
 * The lab's DHCP service.
 *
 * `ipconfig /renew` used to hand the PC back its designed address no matter
 * what state the lab was in, which taught the wrong lesson: a student could
 * "fix" a broken network by renewing. Now a lease is only issued when a
 * request could really have reached the server and back:
 *
 *   1. the PC's own cable and network card are good,
 *   2. something in its subnet answers as the relay (its default gateway),
 *   3. that relay can reach CLOUD-VM-DHCP,
 *   4. the DHCP service on that VM is running and its scope is not full.
 *
 * Anything else ends the way Windows ends it — a 169.254 address and no
 * gateway — which is the symptom the tickets describe.
 *
 * The address handed out is the one the design gives that desk. The lab is a
 * teaching topology with fixed documentation, so a lease that moved a PC to a
 * different address every renew would make every other exercise unreadable.
 * The parts of DHCP the exam asks about — does a lease exist, is the server
 * reachable, are the options right — are all still real.
 */

const SERVER_ID = "CLOUD-VM-DHCP";
const LEASE_HOURS = 8;

/** The service as it ships: running, scope free, options correct. */
function defaultService() {
  return {
    enabled: true,
    // Set by the scope-exhaustion fault: the server answers, but has nothing
    // left to give.
    poolFull: false,
    // Set by the wrong-option fault: the lease arrives with a gateway or DNS
    // server that does not belong to this subnet.
    badGateway: "",
    badDns: ""
  };
}

function normalizeService(saved) {
  const base = defaultService();
  if (!saved || typeof saved !== "object") return base;
  return {
    enabled: saved.enabled !== false,
    poolFull: Boolean(saved.poolFull),
    badGateway: typeof saved.badGateway === "string" ? saved.badGateway : "",
    badDns: typeof saved.badDns === "string" ? saved.badDns : ""
  };
}

/**
 * Windows' link-local fallback. Derived from the host name so the same PC
 * always shows the same useless address, which makes it recognisable in
 * screenshots and in a student's notes.
 */
function apipaFor(hostname) {
  let h = 0x811c9dc5;
  const text = String(hostname || "PC");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const a = (h >>> 8) & 255;
  const b = (h & 255) || 7;
  return `169.254.${a === 255 ? 254 : a}.${b}`;
}

const APIPA_MASK = "255.255.0.0";

function isApipa(ip) {
  return /^169\.254\./.test(String(ip || ""));
}

/** The lease itself, once the request has been shown to be possible. */
function offerFor({ hostname, designed, service, serverIp }) {
  const svc = normalizeService(service);
  if (!svc.enabled) return { ok: false, reason: "service-down" };
  if (svc.poolFull) return { ok: false, reason: "scope-full" };
  if (!designed || !designed.ip) return { ok: false, reason: "no-scope" };
  return {
    ok: true,
    ip: designed.ip,
    mask: designed.mask,
    gateway: svc.badGateway || designed.gateway,
    dns: svc.badDns || designed.dns,
    server: serverIp || "",
    hostname,
    leaseHours: LEASE_HOURS,
    // True when the address is fine but the options are not, which is the
    // fault a student finds by comparing ipconfig with the documentation.
    tainted: Boolean(svc.badGateway || svc.badDns)
  };
}

/** The failure, said the way a technician would say it. */
const FAILURE_TEXT = {
  "media-down": "The network cable is unplugged or the network card is disabled, so no DHCP request left this PC.",
  "no-relay": "No DHCP server or relay answered on this subnet — the request never reached one.",
  "server-unreachable": "The DHCP request reached the local router, but the DHCP server did not answer.",
  "service-down": "The DHCP server is reachable but its DHCP service is not running.",
  "scope-full": "The DHCP server answered that its scope for this subnet has no addresses left.",
  "no-scope": "The DHCP server has no scope for this subnet.",
  static: "This adapter has a static address, so there is no lease to renew."
};

function failureText(reason) {
  return FAILURE_TEXT[reason] || "No DHCP server responded to the request.";
}

module.exports = {
  SERVER_ID,
  LEASE_HOURS,
  APIPA_MASK,
  defaultService,
  normalizeService,
  apipaFor,
  isApipa,
  offerFor,
  failureText
};
