/**
 * Host (Windows) and IOS CLI command runners for the lab simulator.
 * Bound from net-sim.js with shared helpers to avoid circular requires.
 */
module.exports = function createCli(deps) {
  const {
  dhcpRequest,
  applyLease,
  addressInUse,
  addressingWarnings,
  resolveName,
  resolveForHost,
  knownNamesFor,
  pingCheck,
  cableProblemFor,
  linkIndexFor,
  plugged,
  peerOf,
  wifiFailureText,
  showIpIntBrief,
  showVlanBrief,
  showRunningConfig,
  showIpRoute,
  showIpNatTranslations,
  showIpNatStatistics,
  pingLinesWindows,
  pingLinesIos,
  longIfName,
  normalizeIfName,
  isIpv4,
  isValidMask,
  sameSubnet,
  macFor,
  linkLocalV6,
  globalV6,
  hardware,
  wireless,
  dhcp,
  printers,
  ensureNat,
  recordTranslation,
  DNS_SUFFIX
  } = deps;

function promptFor(state, session) {
  if (!state) return ">";
  if (state.kind === "host") return "C:\\>";
  const name = state.hostname;
  switch (session.mode) {
    case "config":
      return `${name}(config)#`;
    case "config-if":
      return `${name}(config-if)#`;
    case "config-vlan":
      return `${name}(config-vlan)#`;
    case "config-line":
      return `${name}(config-line)#`;
    case "enable":
      return `${name}#`;
    default:
      return `${name}>`;
  }
}

function starts(token, full, min) {
  const t = String(token || "").toLowerCase();
  if (!t) return false;
  return t.length >= min && full.startsWith(t);
}

const HOST_HELP = [
  "Available commands:",
  "  ipconfig [/all]            Show IP address, mask, gateway and DNS",
  "  ipconfig /release          Drop a DHCP lease",
  "  ipconfig /renew            Ask DHCP for an address",
  "  ip <addr> <mask> [gw]      Set a static address (lab shortcut)",
  "  dhcp on / dhcp off         Obtain an address automatically, or keep a static one",
  "  dns <addr>                 Set the DNS server",
  "  ping <host|ip> [-n count]  Test reachability",
  "  tracert <host|ip>          Show the path hop by hop",
  "  nslookup <host>            Resolve a name (nslookup on its own lists them)",
  "  arp -a                     Show the ARP cache",
  "  netstat [-an]              Show connections",
  "  hostname                   Show this machine's name",
  "  print <printer>            Send one test page to a network printer",
  "  cls                        Clear the screen",
  "  help / ?                   This list"
];

/** A laptop has a radio to look after; a printer has a front panel. */
const WIFI_HELP = [
  "",
  "Wireless commands:",
  "  wifi                       Radio state, network and signal",
  "  wifi scan                  List the networks this machine can hear",
  "  wifi join <ssid> <key>     Join a network and ask DHCP for an address",
  "  wifi on / wifi off         Switch the radio on or off",
  "  wifi disconnect            Leave the network"
];

const PRINTER_HELP = [
  "Front panel commands:",
  "  status                     Read the front panel",
  "  queue                      List the jobs waiting",
  "  cancel                     Cancel every job in the queue",
  "  online / offline           Put the printer on or off line",
  "  restart                    Restart the printer",
  "",
  "Paper jams, empty trays and toner are fixed on the Hardware tab — open the cover, pull the tray, or swap the cartridge by hand.",
  "",
  "Network commands:",
  "  ipconfig [/all]            Show IP address, mask, gateway and DNS",
  "  ping <host|ip>             Test reachability",
  "  help / ?                   This list"
];

const DHCP_SERVER_HELP = [
  "",
  "DHCP service commands:",
  "  dhcp                       Show the service, the pool and the scope options",
  "  dhcp start / dhcp stop     Start or stop the DHCP Server service",
  "  dhcp reset                 Restore the documented scope options and reclaim the pool"
];

function hostHelp(state) {
  if (state.os === "printer") return PRINTER_HELP;
  if (state.dhcpService) return HOST_HELP.concat(DHCP_SERVER_HELP);
  if (state.os === "laptop") return HOST_HELP.concat(WIFI_HELP);
  return HOST_HELP;
}

const IOS_HELP_USER = [
  "Exec commands:",
  "  enable            Enter privileged mode",
  "  ping <ip>         Send echo requests",
  "  show version      System information",
  "  exit              Close the session",
  "  ?                 This list"
];

const IOS_HELP_ENABLE = [
  "Privileged commands:",
  "  configure terminal          Enter global configuration",
  "  show running-config         Current configuration",
  "  show ip interface brief     Interface address summary",
  "  show interfaces status      Port status (switch)",
  "  show vlan brief             VLAN table (switch)",
  "  show ip route               Routing table (router)",
  "  show ip nat translations    Address translations (router)",
  "  show ip nat statistics      NAT rules and hit counters (router)",
  "  show mac address-table      Learned MAC addresses (switch)",
  "  show version                System information",
  "  ping <ip> / traceroute <ip>",
  "  write memory                Save the configuration",
  "  disable / exit              Leave privileged mode"
];

const IOS_HELP_CONFIG = [
  "Configuration commands:",
  "  hostname <name>",
  "  interface <if>              e.g. interface fa0/1, interface vlan 20",
  "  vlan <id> / name <text>     Create and name a VLAN (switch)",
  "  ip route <net> <mask> <nh>  Static route (router)",
  "  ip nat inside source list <acl> interface <if> overload",
  "  ip nat inside source static <local> <global>",
  "  access-list <n> permit|deny ip <src> <wild> <dst> <wild>",
  "  enable secret <word>",
  "  line console 0",
  "  exit / end"
];

const IF_HELP = [
  "Interface commands:",
  "  ip address <addr> <mask>       Address a routed interface or SVI",
  "  no ip address",
  "  switchport mode access|trunk   Switch ports only",
  "  switchport access vlan <id>",
  "  ip nat inside | ip nat outside Which side of NAT this port faces",
  "  description <text>",
  "  shutdown / no shutdown",
  "  exit / end"
];

function runHostCommand(ctx, raw) {
  const { state, topo, links, states, deviceId } = ctx;
  const parts = raw.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const args = parts.slice(1);

  if (!cmd) return { output: [] };
  if (cmd === "help" || cmd === "?") return { output: hostHelp(state) };

  /* ---- Printers: the front panel, before anything else claims a word ---- */
  if (state.os === "printer") {
    if (["clear", "load", "paper", "toner"].includes(cmd)) {
      return {
        output: [
          "",
          "That is a Hardware-tab job — open the cover, pull the tray, or swap the cartridge by hand.",
          "Front-panel commands here are status, queue, cancel, online, offline and restart."
        ]
      };
    }
    if (["status", "panel", "queue", "cancel", "restart", "online", "offline"].includes(cmd)) {
      const printer = state.printer || printers.defaultState();
      if (cmd === "status" || cmd === "panel") {
        return { output: printers.statusLines(state.hostname, printer) };
      }
      if (cmd === "queue") {
        return { output: printers.queueLines(state.hostname, printer) };
      }
      const result = printers.act(state.hostname, printer, cmd);
      state.printer = result.state;
      return { output: result.output, changed: Boolean(result.changed) };
    }
  }

  if (cmd === "cls" || cmd === "clear") return { output: [], clear: true };
  if (cmd === "exit" || cmd === "quit") return { output: [], close: true };
  if (cmd === "hostname") return { output: [state.hostname] };

  if (cmd === "ipconfig" || cmd === "ifconfig") {
    const flag = (args[0] || "").toLowerCase();
    const wirelessHost = state.os === "laptop";
    const adapter = wirelessHost ? "Wireless LAN adapter Wi-Fi:" : "Ethernet adapter Ethernet0:";
    const port = wirelessHost ? wireless.CLIENT_PORT : "Fa0";

    if (flag === "/release") {
      if (!state.dhcp) {
        return { output: ["", `An error occurred while releasing interface: ${dhcp.failureText("static")}`] };
      }
      state.ip = "";
      state.mask = "";
      state.gateway = "";
      state.lease = null;
      state.ipConflict = false;
      return {
        output: ["", "Windows IP Configuration", "", adapter, "", "   IPv4 Address. . . . . . . . . . . : 0.0.0.0", "   Subnet Mask . . . . . . . . . . . : 0.0.0.0", "   Default Gateway . . . . . . . . . : "],
        changed: true
      };
    }

    if (flag === "/renew") {
      if (!state.dhcp) {
        return {
          output: [
            "",
            `An error occurred while renewing interface ${wirelessHost ? "Wi-Fi" : "Ethernet0"}: ${dhcp.failureText("static")}`,
            "",
            "Put this adapter back on DHCP with:  dhcp on"
          ]
        };
      }
      // A real request: down the cable or the radio link, to the relay, on to
      // the DHCP server, and only then a lease. Anything broken on that path
      // ends in a 169.254 address, the same as it would at a desk.
      const offer = dhcpRequest(topo, links, states, deviceId);
      return { output: applyLease(state, offer, adapter), changed: true };
    }

    const all = flag === "/all";
    const out = ["", "Windows IP Configuration", ""];
    if (all) {
      out.push(
        `   Host Name . . . . . . . . . . . . : ${String(state.hostname).toLowerCase()}`,
        `   Primary Dns Suffix  . . . . . . . : ${DNS_SUFFIX}`,
        "   Node Type . . . . . . . . . . . . : Hybrid",
        "   IP Routing Enabled. . . . . . . . : No",
        ""
      );
    }
    out.push(adapter, "");
    // Windows shows the media state instead of the addresses when the adapter
    // has no link, which is the clue that this is hardware and not addressing.
    const badCable = cableProblemFor(topo, links, deviceId);
    let mediaDown = Boolean(hardware.nicDown(state) || badCable);
    let wifiAssoc = null;
    if (!mediaDown && wirelessHost) {
      wifiAssoc = wireless.associationFor(topo, states, deviceId);
      if (!wifiAssoc.ok) mediaDown = true;
    }
    if (!mediaDown && !wirelessHost) {
      const node = (topo.nodes || []).find((n) => n.id === deviceId);
      const linkIndex = linkIndexFor(topo, links, states);
      const hasLink = (node?.ports || [])
        .filter((p) => !/^Wlan/i.test(p.id))
        .some((p) => plugged(linkIndex, `${deviceId}:${p.id}`));
      if (!hasLink) mediaDown = true;
    }
    if (mediaDown) {
      out.push("   Media State . . . . . . . . . . . : Media disconnected");
      if (all) out.push(`   Physical Address. . . . . . . . . : ${macFor(deviceId, port)}`);
      out.push("");
      if (badCable) out.push(`   ${badCable.detail}`, "");
      else if (hardware.nicDown(state)) {
        out.push("   This PC's network card is not connected. Check the Hardware tab.", "");
      } else if (wirelessHost && wifiAssoc && !wifiAssoc.ok) {
        out.push(`   ${wifiFailureText(wifiAssoc)}`, "");
      } else {
        out.push("   The network cable is unplugged.", "");
      }
      return { output: out };
    }
    if (wirelessHost && all) {
      wifiAssoc = wifiAssoc || wireless.associationFor(topo, states, deviceId);
      out.push(`   SSID  . . . . . . . . . . . . . . : ${wifiAssoc.wifi.ssid}  (${wifiAssoc.signal}%)`);
    }
    if (all) {
      out.push(
        `   Description . . . . . . . . . . . : ${wirelessHost ? "Wireless-AC 9560" : "Intel(R) Ethernet Connection I219-LM"}`,
        `   Physical Address. . . . . . . . . : ${macFor(deviceId, port)}`,
        `   DHCP Enabled. . . . . . . . . . . : ${state.dhcp ? "Yes" : "No"}`,
        "   Autoconfiguration Enabled . . . . : Yes"
      );
      const v6 = globalV6(state.ip);
      if (v6) out.push(`   IPv6 Address. . . . . . . . . . . : ${v6}(Preferred)`);
      out.push(`   Link-local IPv6 Address . . . . . : ${linkLocalV6(deviceId, port)}%12(Preferred)`);
    }
    const apipa = dhcp.isApipa(state.ip);
    out.push(
      `   ${apipa ? "Autoconfiguration IPv4 Address. . " : "IPv4 Address. . . . . . . . . . . "}: ${state.ip || "0.0.0.0"}${state.ipConflict ? "(Duplicate)" : ""}`
    );
    out.push(`   Subnet Mask . . . . . . . . . . . : ${state.mask || "0.0.0.0"}`);
    out.push(`   Default Gateway . . . . . . . . . : ${state.gateway || ""}`);
    if (all) {
      out.push(`   DHCP Server . . . . . . . . . . . : ${state.dhcp ? state.lease?.server || "" : ""}`);
      out.push(`   DNS Servers . . . . . . . . . . . : ${state.dns || ""}`);
      out.push(`   NetBIOS over Tcpip. . . . . . . . : Enabled`);
    }
    // Everything the address itself says is wrong, whatever the documentation
    // claims: an APIPA address, a gateway off-subnet, a duplicate.
    const warn = addressingWarnings(state);
    if (state.ipConflict) {
      warn.unshift(`This address is also in use by another device, so Windows has disabled it on this adapter.`);
    }
    if (warn.length) out.push("", ...warn.map((w) => `   ${w}`));
    return { output: out };
  }

  if (cmd === "ip" || cmd === "setip") {
    if (!isIpv4(args[0]) || !isIpv4(args[1])) {
      return { output: ["Usage: ip <address> <mask> [gateway]", "Example: ip 10.10.20.10 255.255.255.0 10.10.20.1"] };
    }
    if (!isValidMask(args[1])) {
      return { output: [`${args[1]} is not a valid subnet mask — the 1 bits have to be contiguous.`] };
    }
    if (args[2] && !isIpv4(args[2])) return { output: ["The gateway is not a valid IPv4 address."] };

    // Windows checks for a duplicate before it commits the address, and the
    // machine that asks second is the one that loses it.
    const clash = addressInUse(topo, links, states, deviceId, args[0]);
    state.ip = args[0];
    state.mask = args[1];
    state.dhcp = false;
    state.lease = null;
    if (args[2]) state.gateway = args[2];
    state.ipConflict = Boolean(clash);
    if (clash) {
      return {
        output: [
          "",
          `*** Address conflict: ${args[0]} is already in use by ${clash.hostname}.`,
          "",
          "Windows has detected an IP address conflict. This adapter has been",
          "disabled until the address is changed.",
          ""
        ],
        changed: true
      };
    }
    const warn = addressingWarnings(state);
    return {
      output: [
        `Address set: ${state.ip} ${state.mask}${state.gateway ? " gateway " + state.gateway : ""}`,
        ...warn.map((w) => `Warning: ${w}`)
      ],
      changed: true
    };
  }

  /* ---- Static or DHCP, on an ordinary machine ---- */
  if (cmd === "dhcp" && !state.dhcpService) {
    const sub = (args[0] || "").toLowerCase();
    const wirelessHost = state.os === "laptop";
    const adapter = wirelessHost ? "Wireless LAN adapter Wi-Fi:" : "Ethernet adapter Ethernet0:";
    if (sub === "on" || sub === "enable") {
      state.dhcp = true;
      state.ipConflict = false;
      const offer = dhcpRequest(topo, links, states, deviceId);
      return { output: ["", "This adapter is now set to obtain an address automatically.", ...applyLease(state, offer, adapter)], changed: true };
    }
    if (sub === "off" || sub === "disable") {
      state.dhcp = false;
      state.lease = null;
      return { output: ["", "This adapter now keeps whatever address is set on it. Set one with: ip <address> <mask> [gateway]"], changed: true };
    }
    return {
      output: [
        "",
        `   DHCP Enabled. . . . : ${state.dhcp ? "Yes" : "No"}`,
        `   DHCP Server . . . . : ${state.dhcp ? state.lease?.server || "(no lease)" : "n/a"}`,
        "",
        "Usage: dhcp on | dhcp off"
      ]
    };
  }

  /* ---- The DHCP service, on the VM that runs it ---- */
  if (cmd === "dhcp" && state.dhcpService) {
    const svc = state.dhcpService;
    const sub = (args[0] || "status").toLowerCase();
    if (sub === "start") {
      svc.enabled = true;
      return { output: ["", "The DHCP Server service is starting.", "The DHCP Server service was started successfully."], changed: true };
    }
    if (sub === "stop") {
      svc.enabled = false;
      return { output: ["", "The DHCP Server service is stopping.", "The DHCP Server service was stopped successfully."], changed: true };
    }
    if (sub === "reset" || sub === "repair") {
      state.dhcpService = dhcp.defaultService();
      return {
        output: ["", "Scope options restored from the documented design, and the address pool reclaimed.", "The DHCP Server service is running."],
        changed: true
      };
    }
    const out = ["", `${state.hostname} — DHCP Server`, ""];
    out.push(`   Service . . . . . . : ${svc.enabled ? "Running" : "Stopped"}`);
    out.push(`   Address pool  . . . : ${svc.poolFull ? "No addresses available" : "Addresses available"}`);
    out.push(`   Router option (003) : ${svc.badGateway || "as designed (the .1 of each subnet)"}`);
    out.push(`   DNS option (006)  . : ${svc.badDns || "as designed (10.10.70.11)"}`);
    out.push(`   Lease  . . . . . . .: ${dhcp.LEASE_HOURS} hours`);
    if (!svc.enabled || svc.poolFull || svc.badGateway || svc.badDns) {
      out.push("", "   Put this right with: dhcp reset   (or dhcp start)");
    }
    return { output: out };
  }

  /* ---- Wi-Fi (laptops) ---- */
  if (cmd === "wifi" || cmd === "wlan") {
    if (state.os !== "laptop") {
      return { output: ["This machine has no wireless adapter — it is on a cable."] };
    }
    const sub = (args[0] || "status").toLowerCase();
    const wifi = state.wifi || wireless.defaultWifi({ id: deviceId });
    state.wifi = wifi;

    if (sub === "scan" || sub === "list") {
      const heard = wireless.scan(topo, states, deviceId);
      if (!heard.length) return { output: ["", "No wireless networks can be heard from here."] };
      const out = [
        "",
        "Wireless networks in range:",
        "",
        "  SSID                  Signal  Security  Band       Channel  Access point",
        "  --------------------  ------  --------  ---------  -------  ------------"
      ];
      heard.forEach((n) => {
        out.push(
          `  ${padRight(n.ssid, 22)}${padRight(`${n.signal}%`, 8)}${padRight(n.security === "open" ? "Open" : "WPA2", 10)}${padRight(`${n.band} GHz`, 11)}${padRight(n.channel, 9)}${n.apId}${n.usable ? "" : "   (too weak to join)"}`
        );
      });
      return { output: out };
    }

    if (sub === "on" || sub === "off") {
      wifi.radio = sub === "on";
      if (sub === "off") {
        state.ip = "";
        state.gateway = "";
        state.lease = null;
        return { output: ["", "Wireless radio switched off."], changed: true };
      }
      // Switching the radio back on re-associates and then asks for an
      // address, the way a laptop does when it comes out of flight mode. A
      // radio that is on with no address would read as a second fault.
      const assoc = wireless.associationFor(topo, states, deviceId);
      if (!assoc.ok) {
        return {
          output: ["", "Wireless radio switched on.", "", `   ${wifiFailureText(assoc)}`],
          changed: true
        };
      }
      const back = state.dhcp
        ? applyLease(state, dhcpRequest(topo, links, states, deviceId), "Wireless LAN adapter Wi-Fi:")
        : [];
      return {
        output: [
          "",
          "Wireless radio switched on.",
          `Connected to "${wifi.ssid}" on ${assoc.apId} at ${assoc.signal}% signal.`,
          ...back
        ],
        changed: true
      };
    }

    if (sub === "join" || sub === "connect") {
      const ssid = args[1];
      if (!ssid) return { output: ["Usage: wifi join <ssid> [key]"] };
      wifi.ssid = ssid;
      wifi.key = args.slice(2).join(" ");
      wifi.radio = true;
      const assoc = wireless.associationFor(topo, states, deviceId);
      if (!assoc.ok) {
        return { output: ["", `Could not connect to "${ssid}".`, "", `   ${wifiFailureText(assoc)}`], changed: true };
      }
      // An association is not an address. The lease is a separate step, and
      // the same one a PC on a cable goes through.
      const offer = dhcpRequest(topo, links, states, deviceId);
      const lease = applyLease(state, offer, "Wireless LAN adapter Wi-Fi:");
      return {
        output: ["", `Connected to "${ssid}" on ${assoc.apId} at ${assoc.signal}% signal.`, ...lease],
        changed: true
      };
    }

    if (sub === "disconnect" || sub === "leave") {
      wifi.ssid = "";
      state.ip = "";
      state.gateway = "";
      state.lease = null;
      return { output: ["", "Disconnected from the wireless network."], changed: true };
    }

    const assoc = wireless.associationFor(topo, states, deviceId);
    const out = ["", `${state.hostname} — wireless`, ""];
    out.push(`   Radio . . . . . . . : ${wifi.radio ? "on" : "off"}`);
    out.push(`   Network (SSID)  . . : ${wifi.ssid || "(none)"}`);
    out.push(`   Key . . . . . . . . : ${wifi.key ? "*".repeat(Math.min(12, wifi.key.length)) : "(none)"}`);
    if (assoc.ok) {
      out.push(
        `   State . . . . . . . : connected to ${assoc.apId}`,
        `   Signal  . . . . . . : ${assoc.signal}%  ${wireless.bars(assoc.signal)}`,
        `   IPv4 address  . . . : ${state.ip || "(none)"}`
      );
    } else {
      out.push("   State . . . . . . . : not connected", "", `   ${wifiFailureText(assoc)}`);
    }
    return { output: out };
  }

  if (cmd === "print") {
    const target = args[0];
    if (!target) {
      return { output: ["Usage: print <printer name or address>", "Example: print PRN-FIN   (sends one test page)"] };
    }
    const lookup = resolveForHost(topo, links, states, deviceId, target);
    if (lookup.error) return { output: ["", lookup.error] };
    const printerId = Object.keys(states.devices).find(
      (id) => states.devices[id].os === "printer" && states.devices[id].ip === lookup.ip
    );
    if (!printerId) return { output: ["", `${target} is not a printer.`] };
    const verdict = pingCheck(topo, links, states, deviceId, lookup.ip);
    if (!verdict.ok) {
      return {
        output: [
          "",
          `Sending a test page to ${printerId} (${lookup.ip})...`,
          "",
          "The printer could not be reached, so the job is stuck in this PC's queue.",
          ...(verdict.detail ? ["", verdict.detail] : [])
        ]
      };
    }
    const printerState = states.devices[printerId];
    const result = printers.submit(printerState.printer);
    printerState.printer = result.state;
    if (!result.ok) {
      return {
        output: [
          "",
          `Sending a test page to ${printerId} (${lookup.ip})...`,
          "",
          `The printer answered on the network, so this is not a network fault.`,
          `It will not print: ${result.say}`,
          `There are now ${result.queue} job(s) waiting on it.`,
          "",
          `Open ${printerId} on the map and put it right.`
        ],
        changed: true
      };
    }
    return {
      output: ["", `Sending a test page to ${printerId} (${lookup.ip})...`, "", "The page printed."],
      changed: true
    };
  }

  if (cmd === "gateway" || cmd === "gw") {
    if (!isIpv4(args[0])) return { output: ["Usage: gateway <address>"] };
    state.gateway = args[0];
    return { output: [`Default gateway set to ${state.gateway}`], changed: true };
  }

  if (cmd === "dns") {
    if (!isIpv4(args[0])) return { output: ["Usage: dns <address>"] };
    state.dns = args[0];
    return { output: [`DNS server set to ${state.dns}`], changed: true };
  }

  if (cmd === "ping") {
    const targetArg = args.find((a) => !a.startsWith("-") && !/^\d+$/.test(a) || isIpv4(a));
    if (!targetArg) return { output: ["Usage: ping <hostname or address>"] };
    const lookup = resolveForHost(topo, links, states, deviceId, targetArg);
    if (lookup.error) return { output: ["", lookup.error] };
    const target = lookup.ip;
    const verdict = pingCheck(topo, links, states, deviceId, target);
    // A successful trip to a public address leaves an entry in whichever
    // router translated it, so `show ip nat translations` has something real.
    const translated = verdict.ok ? recordTranslation(states, state.ip, target) : null;
    const heading = isIpv4(targetArg) ? "" : `Pinging ${targetArg} [${target}]`;
    const lines = pingLinesWindows(target, verdict);
    if (heading) lines[0] = `${heading} with 32 bytes of data:`;
    return { output: ["", ...lines], changed: Boolean(translated) };
  }

  if (cmd === "tracert" || cmd === "traceroute") {
    const targetArg = args.find((a) => !a.startsWith("-"));
    if (!targetArg) return { output: ["Usage: tracert <hostname or address>"] };
    const lookup = resolveForHost(topo, links, states, deviceId, targetArg);
    if (lookup.error) return { output: ["", lookup.error.replace("Ping request could not find host", "Unable to resolve target system name")] };
    const target = lookup.ip;
    const verdict = pingCheck(topo, links, states, deviceId, target);
    const out = ["", `Tracing route to ${targetArg} [${target}] over a maximum of 30 hops:`, ""];
    const reached = verdict.hops || [];
    reached.forEach((hop, i) => out.push(`  ${i + 1}    <1 ms    <1 ms    <1 ms  ${hop}`));
    if (verdict.ok) {
      out.push("", "Trace complete.");
    } else {
      out.push(`  ${reached.length + 1}     *        *        *     Request timed out.`);
      if (verdict.detail) out.push("", verdict.detail);
    }
    const translated = verdict.ok ? recordTranslation(states, state.ip, target) : null;
    return { output: out, changed: Boolean(translated) };
  }

  if (cmd === "nslookup") {
    const name = args[0];
    const serverLine = `Server:  ${state.dns || "unknown"}`;
    if (!name) {
      return {
        output: [
          "",
          serverLine,
          "",
          "Usage: nslookup <hostname>",
          "",
          "Names published in this lab:",
          ...Object.keys(DNS_ZONE).map((n) => `  ${n}`),
          "  <device>.procloud.local  (any device on the map, e.g. pc-f1.procloud.local)"
        ]
      };
    }
    if (!state.dns) return { output: ["", "*** No DNS server is configured on this PC."] };
    const dnsUp = pingCheck(topo, links, states, deviceId, state.dns);
    if (!dnsUp.ok) {
      return { output: ["", serverLine, "", `*** Request to ${state.dns} timed out.`, dnsUp.detail || ""] };
    }
    const ip = resolveName(states, name);
    if (!ip) return { output: ["", serverLine, "", `*** Can't find ${name}: Non-existent domain`] };
    const aliases = knownNamesFor(states, ip).filter((n) => n !== String(name).toLowerCase());
    return {
      output: [
        "",
        serverLine,
        "",
        `Name:    ${name}`,
        `Address: ${ip}`,
        ...(aliases.length ? [`Aliases: ${aliases.join(", ")}`] : [])
      ]
    };
  }

  if (cmd === "arp") {
    const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
    const linkIndex = linkIndexFor(topo, links, states);
    const neighbours = reachableEndpoints(states, linkIndex, nodes, deviceId, null, null)
      .map((ep) => addressOfEndpoint(states, ep))
      .filter((a) => a && state.mask && sameSubnet(a.ip, state.ip || "0.0.0.0", state.mask));
    const out = ["", `Interface: ${state.ip || "0.0.0.0"} --- 0x2`, "  Internet Address      Physical Address      Type"];
    neighbours.slice(0, 12).forEach((a, i) => {
      out.push(`  ${padRight(a.ip, 22)}00-1a-2b-${padRight(String(i + 16).padStart(2, "0"), 2)}-3c-4d     dynamic`);
    });
    if (!neighbours.length) out.push("  (no entries — nothing has answered on this subnet)");
    return { output: out };
  }

  if (cmd === "netstat") {
    return {
      output: [
        "",
        "Active Connections",
        "",
        "  Proto  Local Address          Foreign Address        State",
        `  TCP    ${state.ip || "0.0.0.0"}:139        0.0.0.0:0              LISTENING`,
        `  TCP    ${state.ip || "0.0.0.0"}:445        0.0.0.0:0              LISTENING`,
        `  TCP    ${state.ip || "0.0.0.0"}:3389       0.0.0.0:0              LISTENING`
      ]
    };
  }

  return { output: [`'${parts[0]}' is not recognized as an internal or external command.`, "Type help for the command list."] };
}

function runIosCommand(ctx, raw) {
  const { state, session, topo, links, states, deviceId } = ctx;
  const node = topo.nodes.find((n) => n.id === deviceId);
  const linkIndex = linkIndexFor(topo, links, states);
  const line = raw.trim();
  if (!line) return { output: [] };

  const tokens = line.split(/\s+/);
  const t0 = tokens[0].toLowerCase();
  const negate = t0 === "no";
  const body = negate ? tokens.slice(1) : tokens;
  const c0 = (body[0] || "").toLowerCase();

  if (line === "?" ) {
    if (session.mode === "user") return { output: IOS_HELP_USER };
    if (session.mode === "enable") return { output: IOS_HELP_ENABLE };
    if (session.mode === "config") return { output: IOS_HELP_CONFIG };
    return { output: IF_HELP };
  }
  if (t0 === "cls" || t0 === "clear" && !body[1]) return { output: [], clear: true };

  /* ---- mode movement ---- */
  if (starts(t0, "enable", 2) && session.mode === "user") {
    session.mode = "enable";
    return { output: [] };
  }
  if (starts(t0, "disable", 4) && session.mode !== "user") {
    session.mode = "user";
    return { output: [] };
  }
  if (starts(t0, "end", 3) && session.mode.startsWith("config")) {
    session.mode = "enable";
    session.iface = null;
    session.vlan = null;
    return { output: [] };
  }
  if (starts(t0, "exit", 4)) {
    if (session.mode === "config-if" || session.mode === "config-vlan" || session.mode === "config-line") {
      session.mode = "config";
      session.iface = null;
      session.vlan = null;
      return { output: [] };
    }
    if (session.mode === "config") {
      session.mode = "enable";
      return { output: [] };
    }
    if (session.mode === "enable") {
      session.mode = "user";
      return { output: [] };
    }
    return { output: [], close: true };
  }

  if (session.mode === "user") {
    if (starts(t0, "ping", 2)) {
      const target = resolveName(states, tokens[1]);
      if (!target) return { output: ["% Unrecognized host or address."] };
      return { output: pingLinesIos(target, pingCheck(topo, links, states, deviceId, target)) };
    }
    if (starts(t0, "show", 2) && starts(tokens[1] || "", "version", 3)) {
      return { output: iosVersion(state, node) };
    }
    return { output: ["% Invalid input detected. Type enable first, then ? for the command list."] };
  }

  /* ---- privileged exec ---- */
  if (session.mode === "enable") {
    if (starts(t0, "configure", 4)) {
      session.mode = "config";
      return { output: ["Enter configuration commands, one per line.  End with CNTL/Z."] };
    }
    if (starts(t0, "ping", 2)) {
      const target = resolveName(states, tokens[1]);
      if (!target) return { output: ["% Unrecognized host or address."] };
      return { output: pingLinesIos(target, pingCheck(topo, links, states, deviceId, target)) };
    }
    if (starts(t0, "traceroute", 4)) {
      const target = resolveName(states, tokens[1]);
      if (!target) return { output: ["% Unrecognized host or address."] };
      const verdict = pingCheck(topo, links, states, deviceId, target);
      const reached = verdict.hops || [];
      return {
        output: [
          "Type escape sequence to abort.",
          `Tracing the route to ${target}`,
          "",
          ...reached.map((h, i) => `  ${i + 1}  ${h}  1 msec  0 msec  0 msec`),
          ...(verdict.ok ? [] : [`  ${reached.length + 1}  * * *`]),
          ...(verdict.ok || !verdict.detail ? [] : ["", verdict.detail])
        ]
      };
    }
    if (starts(t0, "write", 2) || (starts(t0, "copy", 2) && /run/i.test(tokens[1] || ""))) {
      state.saved = true;
      return { output: ["Building configuration...", "[OK]"], changed: true };
    }
    if (starts(t0, "reload", 4)) {
      return { output: ["% Reload is disabled in the classroom simulator."] };
    }
    if (starts(t0, "show", 2)) {
      const s1 = (tokens[1] || "").toLowerCase();
      const s2 = (tokens[2] || "").toLowerCase();
      const s3 = (tokens[3] || "").toLowerCase();
      if (starts(s1, "running-config", 3) || (starts(s1, "run", 3))) return { output: showRunningConfig(state, node) };
      if (starts(s1, "startup-config", 5)) {
        return { output: state.saved ? showRunningConfig(state, node) : ["startup-config is not present"] };
      }
      if (starts(s1, "version", 3)) return { output: iosVersion(state, node) };
      if (starts(s1, "ip", 2) && starts(s2, "interface", 3) && starts(s3, "brief", 2)) {
        return { output: showIpIntBrief(state, node, linkIndex) };
      }
      if (starts(s1, "ip", 2) && starts(s2, "route", 3)) return { output: showIpRoute(state) };
      if (starts(s1, "ip", 2) && starts(s2, "nat", 3)) {
        if (starts(s3, "translations", 5)) return { output: showIpNatTranslations(state) };
        if (starts(s3, "statistics", 4)) return { output: showIpNatStatistics(state) };
        return { output: ["Usage: show ip nat translations  /  show ip nat statistics"] };
      }
      if (starts(s1, "vlan", 4)) {
        if (state.kind !== "switch") return { output: ["% This command is available on switches."] };
        return { output: showVlanBrief(state) };
      }
      if (starts(s1, "interfaces", 3) && starts(s2, "status", 3)) {
        if (state.kind !== "switch") return { output: ["% This command is available on switches."] };
        const lines = ["Port      Name               Status       Vlan       Duplex  Speed Type"];
        for (const [pid, port] of Object.entries(state.ports)) {
          const live = plugged(linkIndex, `${deviceId}:${pid}`);
          const status = port.shutdown ? "disabled" : live ? "connected" : "notconnect";
          lines.push(
            padRight(pid, 10) +
              padRight(port.description.slice(0, 18), 19) +
              padRight(status, 13) +
              padRight(port.mode === "trunk" ? "trunk" : port.vlan, 11) +
              "a-full  a-100 10/100BaseTX"
          );
        }
        return { output: lines };
      }
      if (starts(s1, "mac", 3)) {
        if (state.kind !== "switch") return { output: ["% This command is available on switches."] };
        const nodes = new Map(topo.nodes.map((n) => [n.id, n]));
        const lines = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
        let i = 1;
        for (const [pid, port] of Object.entries(state.ports)) {
          if (port.shutdown) continue;
          const peer = peerOf(linkIndex, `${deviceId}:${pid}`);
          if (!peer) continue;
          const peerId = peer.slice(0, peer.indexOf(":"));
          if (!nodes.has(peerId)) continue;
          lines.push(padRight(port.mode === "trunk" ? "all" : port.vlan, 8) + padRight(`00d0.ba${String(i).padStart(2, "0")}.${String(i * 7).padStart(4, "0")}`, 18) + padRight("DYNAMIC", 12) + pid);
          i++;
        }
        if (i === 1) lines.push("(nothing learned — no cables are up)");
        return { output: lines };
      }
      if (starts(s1, "cdp", 3)) {
        const lines = ["Device ID    Local Intrfce   Holdtme   Capability  Platform  Port ID"];
        const ports = state.kind === "switch" ? Object.keys(state.ports) : Object.keys(state.ifaces);
        for (const pid of ports) {
          const peer = peerOf(linkIndex, `${deviceId}:${pid}`);
          if (!peer) continue;
          const peerId = peer.slice(0, peer.indexOf(":"));
          const peerPort = peer.slice(peer.indexOf(":") + 1);
          lines.push(padRight(peerId, 13) + padRight(pid, 16) + padRight("142", 10) + padRight("S I", 12) + padRight("2960", 10) + peerPort);
        }
        if (lines.length === 1) lines.push("(no neighbours — nothing is cabled to this device)");
        return { output: lines };
      }
      if (starts(s1, "wireless", 4) || starts(s1, "dot11", 5)) {
        if (!state.radio) return { output: ["% This command is available on access points."] };
        const joined = wireless
          .associations(topo, states)
          .filter((a) => a.b.startsWith(`${deviceId}:`))
          .map((a) => ({ id: a.a.slice(0, a.a.indexOf(":")), slot: a.b.slice(a.b.indexOf(":") + 1), signal: a.signal }));
        const out = [
          `Radio0-802.11${state.radio.band === "5" ? "a" : "g"} is ${state.radio.enabled ? "up" : "administratively down"}`,
          `  SSID              : ${state.radio.ssid}`,
          `  Authentication    : ${state.radio.security === "open" ? "Open" : "WPA2-PSK"}`,
          `  Key               : ${state.radio.key ? "*".repeat(Math.min(12, state.radio.key.length)) : "(none)"}`,
          `  Band / channel    : ${state.radio.band} GHz, channel ${state.radio.channel}`,
          `  Bridged to        : VLAN ${Object.values(state.ports)[0]?.vlan ?? 1}`,
          "",
          "Associated stations:"
        ];
        if (!joined.length) out.push("  (none)");
        joined.forEach((c) => out.push(`  ${padRight(c.id, 14)}${padRight(c.slot, 8)}${c.signal}%  ${wireless.bars(c.signal)}`));
        return { output: out };
      }
      return { output: ["% Invalid input detected. Try: show running-config, show ip interface brief, show ip nat translations, show vlan brief."] };
    }
    return { output: ["% Invalid input detected at '^' marker. Type ? for the command list."] };
  }

  /* ---- global configuration ---- */
  if (session.mode === "config") {
    if (starts(c0, "hostname", 4)) {
      if (negate) {
        state.hostname = deviceId;
        return { output: [], changed: true };
      }
      if (!body[1]) return { output: ["% Incomplete command."] };
      state.hostname = body[1];
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "interface", 3)) {
      const name = normalizeIfName(body.slice(1).join(""), state);
      if (!name) return { output: ["% Invalid interface name."] };
      if (/^Vlan/i.test(name)) {
        if (state.kind !== "switch") return { output: ["% VLAN interfaces exist on switches."] };
        const vid = name.replace(/^Vlan/i, "");
        if (!state.vlans[vid]) state.vlans[vid] = `VLAN${vid.padStart(4, "0")}`;
        if (!state.svi[vid]) state.svi[vid] = { ip: "", mask: "", shutdown: false };
        session.mode = "config-if";
        session.iface = name;
        state.saved = false;
        return { output: [], changed: true };
      }
      const pool = state.kind === "switch" ? state.ports : state.ifaces;
      if (!pool[name]) return { output: [`% Invalid interface. This device has: ${Object.keys(pool).join(", ")}`] };
      session.mode = "config-if";
      session.iface = name;
      return { output: [] };
    }
    if (starts(c0, "vlan", 4)) {
      if (state.kind !== "switch") return { output: ["% VLANs are configured on switches."] };
      const vid = String(Number(body[1]));
      if (!/^\d+$/.test(vid) || Number(vid) < 1 || Number(vid) > 4094) return { output: ["% Invalid VLAN id."] };
      if (negate) {
        delete state.vlans[vid];
        return { output: [], changed: true };
      }
      if (!state.vlans[vid]) state.vlans[vid] = `VLAN${vid.padStart(4, "0")}`;
      session.mode = "config-vlan";
      session.vlan = vid;
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "ip", 2) && starts((body[1] || "").toLowerCase(), "default-gateway", 3)) {
      if (state.kind !== "switch") return { output: ["% Routers use ip route, not ip default-gateway."] };
      if (negate) {
        state.gateway = "";
      } else {
        if (!isIpv4(body[2])) return { output: ["Usage: ip default-gateway <address>"] };
        state.gateway = body[2];
      }
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "ip", 2) && starts((body[1] || "").toLowerCase(), "route", 3)) {
      if (state.kind !== "router") return { output: ["% Static routes are configured on routers."] };
      const [, , net, mask, nh] = body;
      if (!isIpv4(net) || !isIpv4(mask) || !isIpv4(nh)) {
        return { output: ["Usage: ip route <network> <mask> <next-hop>"] };
      }
      if (negate) {
        state.routes = state.routes.filter((r) => !(r.network === net && r.mask === mask));
      } else {
        state.routes.push({ network: net, mask, nextHop: nh });
      }
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "ip", 2) && starts((body[1] || "").toLowerCase(), "nat", 3)) {
      if (state.kind !== "router") return { output: ["% NAT is configured on routers."] };
      const usage = [
        "Usage: ip nat inside source static <local> <global>",
        "       ip nat inside source list <acl> interface <if> overload"
      ];
      if (!starts((body[2] || "").toLowerCase(), "inside", 2) || !starts((body[3] || "").toLowerCase(), "source", 3)) {
        return { output: usage };
      }
      const nat = ensureNat(state);
      const what = (body[4] || "").toLowerCase();
      if (starts(what, "static", 4)) {
        const [local, global] = body.slice(5);
        if (!isIpv4(local) || (!negate && !isIpv4(global))) return { output: [usage[0]] };
        nat.statics = (nat.statics || []).filter((s) => s.local !== local);
        if (!negate) nat.statics.push({ local, global });
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(what, "list", 4)) {
        if (negate) {
          nat.overload = null;
          state.saved = false;
          return { output: [], changed: true };
        }
        const aclId = Number(body[5]);
        const ifIdx = body.findIndex((t, i) => i >= 6 && starts(t.toLowerCase(), "interface", 3));
        const ifName = normalizeIfName(
          body.slice(ifIdx + 1).filter((t) => !/^overl/i.test(t)).join(""),
          state
        );
        if (!Number.isFinite(aclId) || ifIdx < 0 || !ifName || !state.ifaces[ifName]) return { output: [usage[1]] };
        if (!body.some((t) => /^overl/i.test(t))) {
          return { output: ["% Only interface overload (PAT) is simulated — add the overload keyword."] };
        }
        nat.overload = { acl: aclId, viaPort: ifName };
        state.saved = false;
        return { output: [], changed: true };
      }
      return { output: usage };
    }
    if (starts(c0, "access-list", 3)) {
      const id = Number(body[1]);
      const usage = ["Usage: access-list <number> permit|deny ip <src> <wildcard> [<dst> <wildcard>|any]"];
      if (!Number.isFinite(id)) return { output: usage };
      const nat = ensureNat(state);
      if (negate) {
        if (nat.acl && nat.acl.id === id) nat.acl = null;
        state.saved = false;
        return { output: [], changed: true };
      }
      const action = (body[2] || "").toLowerCase();
      if (action !== "permit" && action !== "deny") return { output: usage };
      let rest = body.slice(3);
      if ((rest[0] || "").toLowerCase() === "ip") rest = rest.slice(1);
      // Pull one address spec off the front of `rest`; undefined means garbage.
      const takeSpec = () => {
        const head = (rest[0] || "").toLowerCase();
        if (head === "any") {
          rest = rest.slice(1);
          return null;
        }
        if (head === "host" && isIpv4(rest[1])) {
          const network = rest[1];
          rest = rest.slice(2);
          return { network, wildcard: "0.0.0.0" };
        }
        if (isIpv4(rest[0]) && isIpv4(rest[1])) {
          const spec = { network: rest[0], wildcard: rest[1] };
          rest = rest.slice(2);
          return spec;
        }
        return undefined;
      };
      const src = takeSpec();
      if (src === undefined) return { output: ["% Invalid source. Use <address> <wildcard>, host <address>, or any."] };
      const dst = rest.length ? takeSpec() : null;
      if (dst === undefined) return { output: ["% Invalid destination. Use <address> <wildcard>, host <address>, or any."] };
      if (!nat.acl || nat.acl.id !== id) nat.acl = { id, entries: [] };
      nat.acl.entries.push({ action, src, dst });
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "enable", 2) && starts((body[1] || "").toLowerCase(), "secret", 3)) {
      state.secret = negate ? "" : String(body[2] || "");
      state.saved = false;
      return { output: [], changed: true };
    }
    if (starts(c0, "line", 4)) {
      session.mode = "config-line";
      return { output: [] };
    }
    // Access-point radio settings. A real autonomous AP takes these under
    // `dot11 ssid` and `interface dot11radio0`; here they are one level flat,
    // which keeps the number of modes a student has to hold in their head down.
    if (starts(c0, "dot11", 5) || starts(c0, "radio", 5) || starts(c0, "wifi", 4)) {
      if (!state.radio) return { output: ["% Wireless settings are configured on access points."] };
      const what = (body[1] || "").toLowerCase();
      if (starts(what, "ssid", 4)) {
        if (!body[2]) return { output: ["% Incomplete command. Try: dot11 ssid ProCloud-Staff"] };
        state.radio.ssid = String(body[2]).slice(0, 32);
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(what, "key", 3) || starts(what, "wpa-psk", 3) || starts(what, "password", 4)) {
        state.radio.key = negate ? "" : String(body.slice(2).join(" ")).slice(0, 63);
        state.radio.security = state.radio.key ? "wpa2" : "open";
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(what, "channel", 4)) {
        const ch = Number(body[2]);
        if (!Number.isFinite(ch)) return { output: ["% Incomplete command. Try: dot11 channel 6"] };
        state.radio.channel = ch;
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(what, "enable", 2) || starts(what, "up", 2) || starts(what, "on", 2)) {
        state.radio.enabled = !negate;
        state.saved = false;
        return { output: [`Radio0 is ${state.radio.enabled ? "up" : "administratively down"}`], changed: true };
      }
      if (starts(what, "shutdown", 4) || starts(what, "disable", 3) || starts(what, "off", 3)) {
        state.radio.enabled = Boolean(negate);
        state.saved = false;
        return { output: [`Radio0 is ${state.radio.enabled ? "up" : "administratively down"}`], changed: true };
      }
      return {
        output: [
          "% Incomplete command. Wireless commands on this access point:",
          "   dot11 ssid <name>",
          "   dot11 key <passphrase>       (no dot11 key for an open network)",
          "   dot11 channel <1-13>",
          "   dot11 enable / dot11 shutdown",
          "  show wireless                 from privileged mode"
        ]
      };
    }
    if (starts(c0, "banner", 3)) return { output: ["% Banners are not simulated."] };
    return { output: ["% Invalid input detected at '^' marker. Type ? for the command list."] };
  }

  if (session.mode === "config-line") {
    if (starts(c0, "password", 4) || starts(c0, "login", 4) || starts(c0, "logging", 4)) {
      return { output: [] };
    }
    return { output: ["% Invalid input detected at '^' marker."] };
  }

  if (session.mode === "config-vlan") {
    if (starts(c0, "name", 4)) {
      if (!body[1]) return { output: ["% Incomplete command."] };
      state.vlans[session.vlan] = body.slice(1).join(" ");
      state.saved = false;
      return { output: [], changed: true };
    }
    return { output: ["% Invalid input detected at '^' marker."] };
  }

  /* ---- interface configuration ---- */
  if (session.mode === "config-if") {
    const name = session.iface;
    const isSvi = /^Vlan/i.test(name || "");
    const target = isSvi
      ? state.svi[String(name).replace(/^Vlan/i, "")]
      : state.kind === "switch"
        ? state.ports[name]
        : state.ifaces[name];
    if (!target) {
      session.mode = "config";
      return { output: ["% Interface no longer exists."] };
    }

    if (starts(c0, "ip", 2) && starts((body[1] || "").toLowerCase(), "address", 4)) {
      if (state.kind === "switch" && !isSvi) {
        return { output: ["% IP addresses go on VLAN interfaces, not switch ports. Try: interface vlan 1"] };
      }
      if (negate) {
        target.ip = "";
        target.mask = "";
        state.saved = false;
        return { output: [], changed: true };
      }
      const [, , addr, mask] = body;
      if (!isIpv4(addr) || !isIpv4(mask)) return { output: ["Usage: ip address <address> <mask>"] };
      target.ip = addr;
      target.mask = mask;
      state.saved = false;
      return { output: [], changed: true };
    }

    if (starts(c0, "ip", 2) && starts((body[1] || "").toLowerCase(), "nat", 3)) {
      if (state.kind !== "router" || isSvi) return { output: ["% ip nat goes on a router's routed interfaces."] };
      const side = (body[2] || "").toLowerCase();
      if (negate) {
        target.nat = "";
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(side, "inside", 2)) target.nat = "inside";
      else if (starts(side, "outside", 3)) target.nat = "outside";
      else return { output: ["Usage: ip nat inside | ip nat outside"] };
      state.saved = false;
      return { output: [], changed: true };
    }

    if (starts(c0, "switchport", 4)) {
      if (state.kind !== "switch" || isSvi) return { output: ["% switchport is available on switch ports."] };
      const s1 = (body[1] || "").toLowerCase();
      if (starts(s1, "mode", 4)) {
        const mode = (body[2] || "").toLowerCase();
        if (starts(mode, "access", 3)) target.mode = "access";
        else if (starts(mode, "trunk", 2)) target.mode = "trunk";
        else return { output: ["Usage: switchport mode access|trunk"] };
        state.saved = false;
        return { output: [], changed: true };
      }
      if (starts(s1, "access", 3) && starts((body[2] || "").toLowerCase(), "vlan", 4)) {
        const vid = String(Number(body[3]));
        if (!/^\d+$/.test(vid)) return { output: ["Usage: switchport access vlan <id>"] };
        if (!state.vlans[vid]) {
          state.vlans[vid] = `VLAN${vid.padStart(4, "0")}`;
        }
        target.vlan = Number(vid);
        target.mode = "access";
        state.saved = false;
        return { output: [], changed: true };
      }
      return { output: ["Usage: switchport mode access|trunk  /  switchport access vlan <id>"] };
    }

    if (starts(c0, "description", 4)) {
      target.description = negate ? "" : body.slice(1).join(" ");
      state.saved = false;
      return { output: [], changed: true };
    }

    if (starts(c0, "shutdown", 4)) {
      target.shutdown = !negate;
      state.saved = false;
      const status = negate ? "up" : "administratively down";
      return {
        output: [`%LINK-5-CHANGED: Interface ${longIfName(name)}, changed state to ${status}`],
        changed: true
      };
    }

    if (starts(c0, "speed", 4) || starts(c0, "duplex", 3)) return { output: [] };

    return { output: ["% Invalid input detected at '^' marker. Type ? for interface commands."] };
  }

  return { output: ["% Invalid input detected at '^' marker."] };
}

function iosVersion(state, node) {
  const model = state.kind === "router" ? "Cisco 2911/K9" : "Cisco WS-C2960-24TT-L";
  return [
    `Cisco IOS Software, ${state.kind === "router" ? "C2900" : "C2960"} Software, Version 15.1(4)M4, CLASSROOM SIMULATION`,
    "",
    `${state.hostname} uptime is 1 hour, 12 minutes`,
    `System image file is "flash:${state.kind === "router" ? "c2900" : "c2960"}-universalk9-mz.SPA.151-4.M4.bin"`,
    "",
    `${model}`,
    `${(node?.ports || []).length} interfaces`,
    "",
    "Configuration register is 0x2102"
  ];
}

  return { promptFor, starts, hostHelp, runHostCommand, runIosCommand, iosVersion };
};
