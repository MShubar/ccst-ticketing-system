/**
 * IPv4 helpers for the classroom network simulator.
 */

function isIpv4(value) {
  return (
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(String(value || "")) &&
    String(value)
      .split(".")
      .every((o) => Number(o) >= 0 && Number(o) <= 255)
  );
}

function ipToInt(ip) {
  return (
    String(ip)
      .split(".")
      .reduce((acc, o) => ((acc << 8) >>> 0) + Number(o), 0) >>> 0
  );
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** A mask is valid when its host bits are one contiguous run of low 1s. */
function isValidMask(mask) {
  if (!isIpv4(mask)) return false;
  const hostBits = ~ipToInt(mask) >>> 0;
  return ((hostBits + 1) & hostBits) === 0;
}

function maskToPrefix(mask) {
  let n = ipToInt(mask);
  let bits = 0;
  while (n & 0x80000000) {
    bits++;
    n = (n << 1) >>> 0;
  }
  return bits;
}

function networkOf(ip, mask) {
  return (ipToInt(ip) & ipToInt(mask)) >>> 0;
}

function sameSubnet(ipA, ipB, mask) {
  return networkOf(ipA, mask) === networkOf(ipB, mask);
}

function firstHost(ip, mask) {
  return intToIp((networkOf(ip, mask) + 1) >>> 0);
}

/** The subnet and broadcast addresses, printable. */
function networkAddress(ip, mask) {
  return intToIp(networkOf(ip, mask));
}

function broadcastAddress(ip, mask) {
  return intToIp((networkOf(ip, mask) | (~ipToInt(mask) >>> 0)) >>> 0);
}


/** 255.255.0.0 → 0.0.255.255 */
function wildcardOf(mask) {
  return intToIp(~ipToInt(mask) >>> 0);
}

/** RFC 1918 space: the addresses that need translating to leave the site. */
function isPrivateIpv4(ip) {
  if (!isIpv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Does `ip` fall inside an ACL entry's address/wildcard pair? */
function wildcardMatch(ip, spec) {
  if (!spec) return true; // `any`
  if (!isIpv4(ip)) return false;
  const wild = ipToInt(spec.wildcard);
  return (ipToInt(ip) & ~wild) >>> 0 === (ipToInt(spec.network) & ~wild) >>> 0;
}

/** Would this ACL translate a packet from `src` heading out to `dst`? */
function aclPermits(acl, src, dst) {
  if (!acl || !Array.isArray(acl.entries)) return false;
  for (const e of acl.entries) {
    if (!wildcardMatch(src, e.src)) continue;
    if (!wildcardMatch(dst, e.dst)) continue;
    return e.action === "permit";
  }
  return false;
}

module.exports = {
  isIpv4,
  ipToInt,
  intToIp,
  isValidMask,
  maskToPrefix,
  networkOf,
  sameSubnet,
  firstHost,
  networkAddress,
  broadcastAddress,
  wildcardOf,
  isPrivateIpv4,
  wildcardMatch,
  aclPermits
};
