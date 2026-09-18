/**
 * Interface name helpers for the classroom network simulator.
 */

function longIfName(id) {
  if (/^Fa/i.test(id)) return id.replace(/^Fa/i, "FastEthernet");
  if (/^Gi/i.test(id)) return id.replace(/^Gi/i, "GigabitEthernet");
  if (/^Eth?/i.test(id)) return id.replace(/^Eth?/i, "Ethernet");
  if (/^Vlan/i.test(id)) return id;
  return id;
}

function normalizeIfName(raw, deviceState) {
  const text = String(raw || "").trim().replace(/\s+/g, "");
  if (!text) return null;
  const vlanMatch = /^(vlan|vl)(\d+)$/i.exec(text);
  if (vlanMatch) return `Vlan${Number(vlanMatch[2])}`;
  const m = /^([a-z]+)(\d+(?:\/\d+)*)$/i.exec(text);
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  const num = m[2];
  let short;
  if (prefix.startsWith("fa") || prefix === "f" || prefix === "fastethernet") short = "Fa";
  else if (prefix.startsWith("gi") || prefix === "g" || prefix === "gigabitethernet") short = "Gi";
  else if (prefix.startsWith("et") || prefix === "e" || prefix === "ethernet") short = "Eth";
  else return null;
  const candidate = short + num;
  const pool = deviceState
    ? Object.keys(deviceState.ifaces || deviceState.ports || {})
    : [];
  const hit = pool.find((p) => p.toLowerCase() === candidate.toLowerCase());
  return hit || candidate;
}

module.exports = { longIfName, normalizeIfName };
