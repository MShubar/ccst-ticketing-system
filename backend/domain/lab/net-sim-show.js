/**
 * IOS / Windows show and ping output formatters for the lab CLI.
 */
const { longIfName } = require("./net-if");
const { plugged } = require("./net-sim-reach");
const { maskToPrefix, intToIp, networkOf } = require("./net-ip");

function padRight(text, width) {
  const s = String(text);
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function showIpIntBrief(state, node, linkIndex) {
  const lines = [
    padRight("Interface", 23) + padRight("IP-Address", 16) + "OK? Method Status                Protocol"
  ];
  if (state.kind === "router") {
    for (const [pid, iface] of Object.entries(state.ifaces)) {
      const live = plugged(linkIndex, `${node.id}:${pid}`);
      const status = iface.shutdown ? "administratively down" : live ? "up" : "down";
      const proto = iface.shutdown || !live ? "down" : "up";
      lines.push(
        padRight(longIfName(pid), 23) +
          padRight(iface.ip || "unassigned", 16) +
          "YES " +
          padRight(iface.ip ? "manual" : "unset", 7) +
          padRight(status, 22) +
          proto
      );
    }
    return lines;
  }
  for (const [pid, port] of Object.entries(state.ports)) {
    const live = plugged(linkIndex, `${node.id}:${pid}`);
    const status = port.shutdown ? "administratively down" : live ? "up" : "down";
    lines.push(
      padRight(longIfName(pid), 23) +
        padRight("unassigned", 16) +
        "YES " +
        padRight("unset", 7) +
        padRight(status, 22) +
        (port.shutdown || !live ? "down" : "up")
    );
  }
  for (const [vlanId, svi] of Object.entries(state.svi)) {
    lines.push(
      padRight(`Vlan${vlanId}`, 23) +
        padRight(svi.ip || "unassigned", 16) +
        "YES " +
        padRight(svi.ip ? "manual" : "unset", 7) +
        padRight(svi.shutdown ? "administratively down" : "up", 22) +
        (svi.shutdown ? "down" : "up")
    );
  }
  return lines;
}

function showVlanBrief(state) {
  const lines = [
    "VLAN Name                             Status    Ports",
    "---- -------------------------------- --------- -------------------------------"
  ];
  const ids = Object.keys(state.vlans)
    .map(Number)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const members = Object.entries(state.ports)
      .filter(([, p]) => p.mode === "access" && Number(p.vlan) === id)
      .map(([pid]) => pid);
    const first = members.slice(0, 6).join(", ");
    lines.push(padRight(id, 5) + padRight(state.vlans[id], 33) + padRight("active", 10) + first);
    for (let i = 6; i < members.length; i += 6) {
      lines.push(" ".repeat(48) + members.slice(i, i + 6).join(", "));
    }
  }
  const trunks = Object.entries(state.ports).filter(([, p]) => p.mode === "trunk");
  if (trunks.length) {
    lines.push("");
    lines.push("Trunk ports: " + trunks.map(([pid]) => pid).join(", "));
  }
  return lines;
}

function showRunningConfig(state, node) {
  const lines = ["Building configuration...", "", "!", `hostname ${state.hostname}`, "!"];
  if (state.secret) lines.push(`enable secret ${state.secret}`, "!");
  if (state.kind === "switch") {
    for (const id of Object.keys(state.vlans).map(Number).sort((a, b) => a - b)) {
      if (id === 1) continue;
      lines.push(`vlan ${id}`, ` name ${state.vlans[id]}`, "!");
    }
    for (const [pid, port] of Object.entries(state.ports)) {
      lines.push(`interface ${longIfName(pid)}`);
      if (port.description) lines.push(` description ${port.description}`);
      if (port.mode === "trunk") lines.push(" switchport mode trunk");
      else lines.push(" switchport mode access", ` switchport access vlan ${port.vlan}`);
      if (port.shutdown) lines.push(" shutdown");
      lines.push("!");
    }
    for (const [vlanId, svi] of Object.entries(state.svi)) {
      lines.push(`interface Vlan${vlanId}`);
      if (svi.ip) lines.push(` ip address ${svi.ip} ${svi.mask}`);
      if (svi.shutdown) lines.push(" shutdown");
      lines.push("!");
    }
    if (state.gateway) lines.push(`ip default-gateway ${state.gateway}`, "!");
  } else {
    for (const [pid, iface] of Object.entries(state.ifaces)) {
      lines.push(`interface ${longIfName(pid)}`);
      if (iface.description) lines.push(` description ${iface.description}`);
      if (iface.ip) lines.push(` ip address ${iface.ip} ${iface.mask}`);
      else lines.push(" no ip address");
      if (iface.nat === "inside") lines.push(" ip nat inside");
      if (iface.nat === "outside") lines.push(" ip nat outside");
      if (iface.shutdown) lines.push(" shutdown");
      lines.push("!");
    }
    const nat = state.nat;
    if (nat) {
      for (const s of nat.statics || []) lines.push(`ip nat inside source static ${s.local} ${s.global}`);
      if (nat.overload) {
        lines.push(
          `ip nat inside source list ${nat.overload.acl} interface ${longIfName(nat.overload.viaPort)} overload`
        );
      }
      if (nat.statics?.length || nat.overload) lines.push("!");
    }
    for (const r of state.routes) lines.push(`ip route ${r.network} ${r.mask} ${r.nextHop}`);
    if (state.routes.length) lines.push("!");
    if (nat?.acl) {
      for (const e of nat.acl.entries) {
        const src = e.src ? `${e.src.network} ${e.src.wildcard}` : "any";
        const dst = e.dst ? `${e.dst.network} ${e.dst.wildcard}` : "any";
        lines.push(`access-list ${nat.acl.id} ${e.action} ip ${src} ${dst}`);
      }
      lines.push("!");
    }
  }
  lines.push("end");
  return lines;
}

function showIpRoute(state) {
  if (state.kind !== "router") return ["% This command is available on routers."];
  const lines = [
    "Codes: C - connected, S - static",
    ""
  ];
  for (const [pid, iface] of Object.entries(state.ifaces)) {
    if (!iface.ip || iface.shutdown) continue;
    const net = intToIp(networkOf(iface.ip, iface.mask));
    lines.push(`C    ${net}/${maskToPrefix(iface.mask)} is directly connected, ${longIfName(pid)}`);
  }
  for (const r of state.routes) {
    lines.push(`S    ${r.network}/${maskToPrefix(r.mask)} [1/0] via ${r.nextHop}`);
  }
  if (lines.length === 2) lines.push("% No routes are up.");
  return lines;
}

function showIpNatTranslations(state) {
  if (state.kind !== "router") return ["% This command is available on routers."];
  const nat = state.nat;
  if (!nat || (!nat.statics?.length && !nat.overload)) {
    return ["% No NAT is configured. See: ip nat inside source list <n> interface <if> overload"];
  }
  const lines = [
    "Pro  Inside global        Inside local         Outside local        Outside global"
  ];
  for (const s of nat.statics || []) {
    lines.push("--- " + padRight(s.global, 21) + padRight(s.local, 21) + padRight("---", 21) + "---");
  }
  for (const t of nat.translations || []) {
    lines.push(
      "icmp " +
        padRight(`${t.global}:1`, 20) +
        padRight(`${t.local}:1`, 21) +
        padRight(`${t.dest}:1`, 21) +
        `${t.dest}:1`
    );
  }
  if (lines.length === 1) {
    lines.push("(no active translations — ping something public from a PC inside, then look again)");
  }
  return lines;
}

function showIpNatStatistics(state) {
  if (state.kind !== "router") return ["% This command is available on routers."];
  const nat = state.nat;
  const inside = Object.entries(state.ifaces).filter(([, i]) => i.nat === "inside").map(([pid]) => longIfName(pid));
  const outside = Object.entries(state.ifaces).filter(([, i]) => i.nat === "outside").map(([pid]) => longIfName(pid));
  const statics = nat?.statics?.length || 0;
  const active = nat?.translations?.length || 0;
  const lines = [
    `Total active translations: ${statics + active} (${statics} static, ${active} dynamic; ${active} extended)`,
    `Outside interfaces:`,
    `  ${outside.join(", ") || "none"}`,
    `Inside interfaces:`,
    `  ${inside.join(", ") || "none"}`,
    `Hits: ${(statics + active) * 37}  Misses: 0`
  ];
  if (nat?.overload) {
    lines.push(
      "Dynamic mappings:",
      "-- Inside Source",
      `[Id: 1] access-list ${nat.overload.acl} interface ${longIfName(nat.overload.viaPort)} refcount ${active}`
    );
  }
  return lines;
}

function pingLinesWindows(target, verdict) {
  const out = [`Pinging ${target} with 32 bytes of data:`, ""];
  if (verdict.ok) {
    for (let i = 0; i < 4; i++) out.push(`Reply from ${target}: bytes=32 time<1ms TTL=128`);
    out.push("", `Ping statistics for ${target}:`, "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),");
  } else {
    const line = verdict.reason === "no-gateway" || verdict.reason === "no-route"
      ? "Destination host unreachable."
      : "Request timed out.";
    for (let i = 0; i < 4; i++) out.push(line);
    out.push("", `Ping statistics for ${target}:`, "    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),");
    if (verdict.detail) out.push("", verdict.detail);
  }
  return out;
}

function pingLinesIos(target, verdict) {
  const out = [
    "Type escape sequence to abort.",
    `Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`
  ];
  if (verdict.ok) {
    out.push("!!!!!", "Success rate is 100 percent (5/5), round-trip min/avg/max = 1/2/8 ms");
  } else {
    out.push(".....", "Success rate is 0 percent (0/5)");
    if (verdict.detail) out.push("", verdict.detail);
  }
  return out;
}


module.exports = {
  padRight,
  showIpIntBrief,
  showVlanBrief,
  showRunningConfig,
  showIpRoute,
  showIpNatTranslations,
  showIpNatStatistics,
  pingLinesWindows,
  pingLinesIos
};
