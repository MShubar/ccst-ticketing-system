/**
 * Stable MAC / IPv6 identity helpers for lab devices.
 */
const { isIpv4 } = require("./net-ip");
const dhcp = require("./dhcp");

function hash32s(text) {
  let h = 0x811c9dc5;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const hex2 = (n) => ((n >>> 0) & 255).toString(16).padStart(2, "0").toUpperCase();

/** A stable burned-in address per device, in the Windows `ipconfig` format. */
function macFor(deviceId, portId = "") {
  const h = hash32s(`${deviceId}|${portId}`);
  // Locally administered, unicast — the same bit pattern a virtual NIC gets.
  return ["02", "1A", hex2(h >>> 24), hex2(h >>> 16), hex2(h >>> 8), hex2(h)].join("-");
}

/** fe80:: with an interface identifier built from the MAC, EUI-64 style. */
function linkLocalV6(deviceId, portId = "") {
  const p = macFor(deviceId, portId).split("-").map((x) => x.toLowerCase());
  const flipped = hex2(parseInt(p[0], 16) ^ 0x02).toLowerCase();
  // Four hextets, each written the way a real adapter prints it: no leading
  // zeros, ff:fe wedged into the middle.
  const hextets = [`${flipped}${p[1]}`, `${p[2]}ff`, `fe${p[3]}`, `${p[4]}${p[5]}`];
  return `fe80::${hextets.map((h) => h.replace(/^0+(?=.)/, "")).join(":")}`;
}

/**
 * A global address in the documentation prefix 2001:db8::/32, laid out so it
 * reads straight off the IPv4 address: 10.10.20.14 becomes 2001:db8:10:20::14.
 * Decimal digits are valid hex digits, which is the trick every teaching lab
 * uses to keep the two address families readable side by side.
 */
function globalV6(ip) {
  if (!isIpv4(ip) || dhcp.isApipa(ip)) return "";
  const o = String(ip).split(".").map((x) => String(Number(x)));
  return `2001:db8:${o[1]}:${o[2]}::${o[3]}`;
}

module.exports = { hash32s, macFor, linkLocalV6, globalV6 };
