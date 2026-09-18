/**
 * Classroom lab topology: sites, devices, designed links.
 */
function port(id, side = "bottom") {
  return { id, side };
}

function node(id, label, type, x, y, ports, meta = {}) {
  return { id, label, type, x, y, ports, w: meta.w || 112, h: meta.h || 58, ...meta };
}

function link(a, b, cable = "copper") {
  return { id: `${a}__${b}`, a, b, cable };
}

function portsTop(...ids) {
  return ids.map((id) => port(id, "top"));
}

function portsBottom(...ids) {
  return ids.map((id) => port(id, "bottom"));
}

const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);

/* ------------------------------------------------------------------ *
 * The company
 * ------------------------------------------------------------------ */

/**
 * HQ, department by department.
 *
 * Each department is its own broadcast domain with its own distribution
 * router, so a department reaches the rest of the company through three
 * routers rather than one: its own, the HQ edge, and the provider. A
 * department with two access switches trunks the second one to the first and
 * still has the single router for the subnet, which is how a real floor with
 * more desks than one switch can carry is wired.
 *
 * `pcs` is how many desks hang off that switch. Addresses are handed out from
 * .10 for PCs and .50 for printers inside 10.10.<vlan>.0/24.
 */
const HQ_DEPTS = [
  {
    code: "SALES",
    name: "Sales",
    vlan: 10,
    router: "RD-SALES",
    pcPrefix: "PC-S",
    switches: [
      { id: "SW-SALES", pcs: 5, printers: ["PRN-SALES"] },
      { id: "SW-SALES-2", pcs: 3 }
    ]
  },
  {
    code: "MKT",
    name: "Marketing",
    vlan: 15,
    router: "RD-MKT",
    pcPrefix: "PC-MK",
    switches: [{ id: "SW-MKT", pcs: 4, printers: ["PRN-MKT"] }]
  },
  {
    code: "FIN",
    name: "Finance",
    vlan: 20,
    router: "RD-FIN",
    pcPrefix: "PC-F",
    switches: [
      { id: "SW-FIN", pcs: 5, printers: ["PRN-FIN"] },
      { id: "SW-FIN-2", pcs: 3 }
    ]
  },
  {
    code: "LEGAL",
    name: "Legal",
    vlan: 25,
    router: "RD-LEGAL",
    pcPrefix: "PC-LG",
    switches: [{ id: "SW-LEGAL", pcs: 4, printers: ["PRN-LEGAL"] }]
  },
  {
    code: "HR",
    name: "HR",
    vlan: 30,
    router: "RD-HR",
    pcPrefix: "PC-HR",
    switches: [{ id: "SW-HR", pcs: 5, printers: ["PRN-HR"] }]
  },
  {
    code: "PROC",
    name: "Procurement",
    vlan: 35,
    router: "RD-PROC",
    pcPrefix: "PC-PR",
    switches: [{ id: "SW-PROC", pcs: 4, printers: ["PRN-PROC"] }]
  },
  {
    code: "REC",
    name: "Reception",
    vlan: 40,
    router: "RD-REC",
    pcPrefix: "PC-REC",
    switches: [{ id: "SW-REC", pcs: 4, printers: ["PRN-REC"] }],
    wifi: { ap: "AP-REC", laptops: ["LT-REC1", "LT-REC2"] }
  },
  {
    code: "OPS",
    name: "Operations",
    vlan: 45,
    router: "RD-OPS",
    pcPrefix: "PC-OPS",
    switches: [
      { id: "SW-OPS", pcs: 5, printers: ["PRN-OPS"] },
      { id: "SW-OPS-2", pcs: 3 }
    ],
    wifi: { ap: "AP-OPS", laptops: ["LT-OPS1"] }
  },
  {
    code: "WH",
    name: "Warehouse",
    vlan: 50,
    router: "RD-WH",
    pcPrefix: "PC-WH",
    switches: [
      { id: "SW-WH", pcs: 5, printers: ["PRN-WH"] },
      { id: "SW-WH-2", pcs: 3 }
    ],
    wifi: { ap: "AP-WH", laptops: ["LT-WH1"] }
  },
  {
    code: "TRAIN",
    name: "Training",
    vlan: 55,
    router: "RD-TRAIN",
    pcPrefix: "PC-TR",
    switches: [{ id: "SW-TRAIN", pcs: 6, printers: ["PRN-TRAIN"] }],
    // The training room runs its own network with its own key, so a laptop
    // brought in from a desk hears it but cannot join it.
    wifi: { ap: "AP-TRAIN", ssid: "ProCloud-Training", key: "Train#2024", laptops: ["LT-TRAIN1"] }
  },
  {
    code: "IT",
    name: "IT",
    vlan: 80,
    router: "RD-IT",
    pcPrefix: "PC-IT",
    switches: [
      { id: "SW-IT", pcs: 5, printers: ["PRN-IT"] },
      { id: "SW-IT-2", pcs: 3 }
    ]
  },
  {
    code: "SUP",
    name: "Support",
    vlan: 85,
    router: "RD-SUP",
    pcPrefix: "PC-SUP",
    switches: [
      { id: "SW-SUP", pcs: 6, printers: ["PRN-SUP"] },
      { id: "SW-SUP-2", pcs: 4 }
    ]
  }
];

/** The data centre block: on-prem VMs, wired like a department of its own. */
const DC = {
  code: "DC",
  name: "Data centre",
  vlan: 60,
  router: "RD-DC",
  switch: "SW-VIRT",
  vms: [
    ["VM-DC-01", "10.10.60.2", "DC"],
    ["VM-SQL-CRM", "10.10.60.10", "CRM"],
    ["VM-SQL-FIN", "10.10.60.11", "CBS"],
    ["VM-SQL-HR", "10.10.60.12", "HR"],
    ["VM-WEB", "10.10.60.20", "WEB"],
    ["VM-FS", "10.10.60.3", "FTP"],
    ["VM-MAIL", "10.10.60.22", "MAIL"],
    ["VM-APP-01", "10.10.60.30", "VAS"],
    ["VM-BACKUP", "10.10.60.31", "BAK"],
    ["VM-TEST", "10.10.60.32", "TEST"]
  ]
};

/** Azure hosted cloud VMs — reach Batelco through Dubai, not a direct core hop. */
const CLOUD_VMS = [
  ["CLOUD-VM-AD", "10.10.70.2", "AD"],
  ["CLOUD-VM-SQL", "10.10.70.10", "SQL"],
  ["CLOUD-VM-WEB", "10.10.70.20", "WEB"],
  ["CLOUD-VM-FILE", "10.10.70.3", "FTP"],
  ["CLOUD-VM-MAIL", "10.10.70.22", "MAIL"],
  ["CLOUD-VM-DNS", "10.10.70.11", "DNS"],
  ["CLOUD-VM-DHCP", "10.10.70.21", "DHCP"],
  ["CLOUD-VM-VDI1", "10.10.70.30", "VDI"],
  ["CLOUD-VM-VDI2", "10.10.70.31", "VDI"],
  ["CLOUD-VM-VDI3", "10.10.70.32", "VDI"],
  ["CLOUD-VM-APP", "10.10.70.40", "VAS"],
  ["CLOUD-VM-BAK", "10.10.70.41", "BAK"],
  ["CLOUD-VM-MON", "10.10.70.42", "MON"],
  ["CLOUD-VM-LOG", "10.10.70.43", "LOG"],
  ["Keratin-Glow", "10.10.70.25", "HTTP"],
  ["Safqa", "10.10.70.26", "HTTP"]
];

/**
 * The branches. Each is a site of its own behind its own edge router, handed
 * off to the Batelco exchange for its district.
 */
const BRANCHES = [
  { code: "BRA", name: "Branch A", area: "Muharraq", router: "R2-BRA", sw: "SW-BRA", net: "10.20.10", pcPrefix: "PC-BA", pcs: 5, server: ["SRV-BRA", "20", "FTP"], wifi: { ap: "AP-BRA", laptops: ["LT-BRA1"] } },
  { code: "BRB", name: "Branch B", area: "Arad", router: "R3-BRB", sw: "SW-BRB", net: "10.30.10", pcPrefix: "PC-BB", pcs: 5, wifi: { ap: "AP-BRB", laptops: ["LT-BRB1"] } },
  { code: "BRC", name: "Branch C", area: "Riffa", router: "R4-BRC", sw: "SW-BRC", net: "10.40.10", pcPrefix: "PC-BC", pcs: 5, server: ["SRV-BRC", "20", "FTP"] },
  { code: "BRD", name: "Branch D", area: "Hamad Town", router: "R5-BRD", sw: "SW-BRD", net: "10.50.10", pcPrefix: "PC-BD", pcs: 5 },
  { code: "BRE", name: "Branch E", area: "Isa Town", router: "R6-BRE", sw: "SW-BRE", net: "10.60.10", pcPrefix: "PC-BE", pcs: 5 },
  { code: "BRF", name: "Branch F", area: "Sanad", router: "R7-BRF", sw: "SW-BRF", net: "10.70.10", pcPrefix: "PC-BF", pcs: 5 },
  { code: "BRG", name: "Branch G", area: "Hidd", router: "R8-BRG", sw: "SW-BRG", net: "10.80.10", pcPrefix: "PC-BG", pcs: 5, server: ["SRV-BRG", "20", "FTP"] },
  { code: "BRH", name: "Branch H", area: "Galali", router: "R9-BRH", sw: "SW-BRH", net: "10.90.10", pcPrefix: "PC-BH", pcs: 5 },
  { code: "BRI", name: "Branch I", area: "Sitra", router: "R10-BRI", sw: "SW-BRI", net: "10.100.10", pcPrefix: "PC-BI", pcs: 5 }
];

/**
 * Batelco's area exchanges. Hamala is the core; each exchange homes onto it
 * and serves the sites in its district. Seef serves the head office, the
 * rest serve one or two branches each.
 */
const EXCHANGES = [
  { id: "BAT-SEEF", area: "Seef", serves: [], hq: true },
  { id: "BAT-MUHARRAQ", area: "Muharraq", serves: ["BRA", "BRB"] },
  { id: "BAT-RIFFA", area: "Riffa", serves: ["BRC", "BRD"] },
  { id: "BAT-ISA-TOWN", area: "Isa Town", serves: ["BRE", "BRF"] },
  { id: "BAT-HIDD", area: "Hidd", serves: ["BRG", "BRH"] },
  { id: "BAT-SITRA", area: "Sitra", serves: ["BRI"] }
];

const ISP_CORE = "BAT-HAMALA";
const HQ_EDGE = "R1-EDGE";
/** Dubai telecom peering point between Hamala and the Azure cloud edge. */
const DUBAI_TELECOM = "BAT-DUBAI";
/** Azure-side router that owns VLAN70 (gateway for the hosted cloud VMs). */
const AZURE_ROUTER = "R-AZURE";
const AZURE_SWITCH = "SW-CLOUD";

/* ------------------------------------------------------------------ *
 * Derived plans, shared by the layout, the cabling and the simulator
 * ------------------------------------------------------------------ */

/**
 * Each department expanded into switches, their hosts, and the column each
 * switch stands in. Columns run left to right across the whole HQ band, so a
 * department with two switches simply occupies two of them.
 */
function hqPlan() {
  let col = 0;
  return HQ_DEPTS.map((dept) => {
    const startCol = col;
    let pcN = 0;
    let prnN = 0;
    const switches = dept.switches.map((sw, i) => {
      const hosts = [];
      for (let k = 0; k < sw.pcs; k++) {
        pcN += 1;
        hosts.push({ id: `${dept.pcPrefix}${pcN}`, type: "pc", ip: `10.10.${dept.vlan}.${9 + pcN}` });
      }
      for (const printer of sw.printers || []) {
        hosts.push({ id: printer, type: "printer", ip: `10.10.${dept.vlan}.${50 + prnN++}` });
      }
      return { id: sw.id, col: col + i, hosts, trunkTo: i > 0 ? dept.switches[i - 1].id : null };
    });
    col += dept.switches.length;
    return { ...dept, startCol, cols: dept.switches.length, switches };
  });
}

/* ------------------------------------------------------------------ *
 * Wi-Fi
 * ------------------------------------------------------------------ */

/** The staff network. One key for the company, as a small business would run it. */
const STAFF_SSID = "ProCloud-Staff";
const STAFF_KEY = "Bahrain#2024";

/** The switch port every access point uplinks on. Printers keep Fa0/24. */
const AP_UPLINK_PORT = "Fa0/23";

/**
 * Every access point in the company, with the switch it hangs off, the VLAN
 * it bridges into, and the laptops that belong to it. The layout, the shipped
 * cabling and the simulator all read this one list.
 */
function wifiPlan() {
  const out = [];
  HQ_DEPTS.forEach((dept) => {
    if (!dept.wifi) return;
    out.push({
      ap: dept.wifi.ap,
      ssid: dept.wifi.ssid || STAFF_SSID,
      key: dept.wifi.key || STAFF_KEY,
      channel: dept.wifi.channel || 6,
      switch: dept.switches[0].id,
      vlan: dept.vlan,
      place: dept.name,
      zone: "hq",
      laptops: (dept.wifi.laptops || []).map((id, i) => ({ id, ip: `10.10.${dept.vlan}.${61 + i}` }))
    });
  });
  BRANCHES.forEach((branch) => {
    if (!branch.wifi) return;
    out.push({
      ap: branch.wifi.ap,
      ssid: branch.wifi.ssid || STAFF_SSID,
      key: branch.wifi.key || STAFF_KEY,
      channel: branch.wifi.channel || 11,
      switch: branch.sw,
      vlan: 1,
      place: branch.name,
      zone: "branch",
      laptops: (branch.wifi.laptops || []).map((id, i) => ({ id, ip: `${branch.net}.${61 + i}` }))
    });
  });
  return out;
}

/** How many extra rows a column needs under its desks for Wi-Fi kit. */
function wifiRows(wifi) {
  if (!wifi) return 0;
  return Math.max(1, (wifi.laptops || []).length);
}

/** Branch hosts, in the order they are stacked under the branch switch. */
function branchHosts(branch) {
  const hosts = range(branch.pcs).map((n) => ({
    id: `${branch.pcPrefix}${n}`,
    type: "pc",
    ip: `${branch.net}.${9 + n}`
  }));
  if (branch.server) {
    hosts.push({ id: branch.server[0], type: "server", ip: `${branch.net}.${branch.server[1]}`, role: branch.server[2] });
  }
  hosts.push({ id: `PRN-${branch.code}`, type: "printer", ip: `${branch.net}.50` });
  return hosts;
}

/**
 * Every leg out of the HQ edge router, in port order: the data centre first,
 * then the departments left to right. The simulator numbers a transit /30
 * per entry from this list and writes the matching routes, so the port a
 * cable lands on and the addressing behind it can never disagree.
 */
function hqUplinks() {
  const legs = [
    { router: DC.router, name: DC.name, vlan: DC.vlan, lan: { network: `10.10.${DC.vlan}.0`, mask: "255.255.255.0" } },
    ...hqPlan().map((dept) => ({
      router: dept.router,
      name: dept.name,
      vlan: dept.vlan,
      lan: { network: `10.10.${dept.vlan}.0`, mask: "255.255.255.0" }
    }))
  ];
  return legs.map((leg, i) => ({ ...leg, edgePort: `Fa0/${i + 1}`, routerPort: "Gi0/0", index: i }));
}

/** Branch sites with the exchange that serves them and the port pair used. */
function branchSites() {
  const out = [];
  EXCHANGES.forEach((ex) => {
    ex.serves.forEach((code, i) => {
      const branch = BRANCHES.find((b) => b.code === code);
      if (!branch) return;
      out.push({
        ...branch,
        exchange: ex.id,
        exchangeArea: ex.area,
        // Gi0/1 is the exchange's uplink to Hamala, so customers start at Gi0/2.
        exchangePort: `Gi0/${i + 2}`
      });
    });
  });
  return out;
}

/** The Hamala core's port for each exchange, in table order. */
function backboneLegs() {
  return EXCHANGES.map((ex, i) => ({ ...ex, corePort: `Gi0/${i + 1}`, areaPort: "Gi0/1" }));
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

const COL = 230; // one access switch and the desks stacked under it
const PAD = 48;
const ONPREM_W = 260;
const ONPREM_SUB = 134;

const ROW_ISP = 300; // internet breakout
const ROW_CORE = 430; // Batelco Hamala core and the hosted-cloud switch
const ROW_EDGE = 560; // HQ edge router and the Batelco area exchanges
const ROW_DIST = 690; // distribution routers: one per HQ department, one per branch
const ROW_SW = 830; // every access switch, HQ and branch alike
const ROW_HOST = ROW_SW + 130; // the first row of desks
const HOST_STEP = 95;

/** Spaced-out HQ + cloud + branches — readable columns, not a bird's nest. */
function topology() {
  const depts = hqPlan();
  const sites = branchSites();
  const hqCols = depts.reduce((n, d) => n + d.cols, 0);
  const hqX0 = PAD + ONPREM_W + 72;
  const hqRight = hqX0 + hqCols * COL;

  // The Seef exchange takes the first slot past HQ, then one slot per branch.
  const seefX = hqRight + 40;
  const branchX = (k) => seefX + COL + k * COL;
  const branchRight = branchX(sites.length);

  const nodes = [];
  const wifiBySwitch = new Map(wifiPlan().map((w) => [w.switch, w]));

  /* ---- HQ departments ------------------------------------------- */
  const swPorts = (hostCount, trunkSide) => [
    port("Gi0/1", "top"),
    port(trunkSide === "left" ? "Gi0/3" : "Gi0/2", trunkSide === "left" ? "left" : "right"),
    ...portsBottom(...range(Math.max(6, hostCount)).map((n) => `Fa0/${n}`)),
    port(AP_UPLINK_PORT, "bottom"),
    port("Fa0/24", "bottom")
  ];

  /**
   * An access point and its laptops, tucked under the last desk of the column
   * it serves: the access point on the left where the uplink cable lands, the
   * laptops beside it with no cable at all.
   */
  const wifiNodes = (wifi, x, firstRow) => {
    if (!wifi) return;
    nodes.push(
      node(wifi.ap, wifi.ap, "ap", x + 12, firstRow, [port("Gi0/1", "top"), ...portsBottom(...range(6).map((n) => `Wlan${n}`))], {
        ip: `${wifi.ssid} · VLAN${wifi.vlan}`,
        role: `access point · ${wifi.place}`,
        zone: wifi.zone,
        place: wifi.place,
        ssid: wifi.ssid,
        wifiKey: wifi.key,
        channel: wifi.channel,
        vlan: wifi.vlan,
        w: 112,
        h: 54
      })
    );
    wifi.laptops.forEach((laptop, i) => {
      nodes.push(
        node(laptop.id, laptop.id, "laptop", x + 134, firstRow + i * HOST_STEP, [port("Wlan0", "top")], {
          ip: laptop.ip,
          // No role on the box: the label has room for the address and nothing
          // else, and the department is already the column it sits in.
          zone: wifi.zone,
          place: wifi.place,
          ssid: wifi.ssid,
          wifiKey: wifi.key,
          w: 96,
          h: 54
        })
      );
    });
  };

  depts.forEach((dept) => {
    // The router stands centred over the switches it serves.
    const routerX = hqX0 + dept.startCol * COL + ((dept.cols - 1) * COL) / 2 + 4;
    nodes.push(
      node(dept.router, dept.router, "router", routerX, ROW_DIST, [port("Gi0/0", "top"), port("Gi0/1", "bottom")], {
        ip: `${dept.name} gateway · 10.10.${dept.vlan}.1`,
        role: `distribution · ${dept.name}`,
        zone: "hq",
        place: dept.name,
        w: 132,
        h: 62
      })
    );
    dept.switches.forEach((sw, i) => {
      const x = hqX0 + sw.col * COL;
      nodes.push(
        node(sw.id, sw.id, "switch", x, ROW_SW, swPorts(sw.hosts.length, i > 0 ? "left" : "right"), {
          ip: `VLAN${dept.vlan}`,
          role: dept.name,
          zone: "hq",
          place: dept.name,
          w: 140,
          h: 64
        })
      );
      sw.hosts.forEach((host, j) => {
        nodes.push(
          node(host.id, host.id, host.type, x + 12, ROW_HOST + j * HOST_STEP, [port("Fa0", "top")], {
            ip: host.ip,
            zone: "hq",
            place: dept.name,
            w: 116,
            h: 58
          })
        );
      });
      wifiNodes(wifiBySwitch.get(sw.id), x, ROW_HOST + sw.hosts.length * HOST_STEP);
    });
  });

  /* ---- Data centre --------------------------------------------- */
  nodes.push(
    node(DC.router, DC.router, "router", PAD + 64, ROW_DIST, [port("Gi0/0", "top"), port("Gi0/1", "bottom")], {
      ip: `Data centre gateway · 10.10.${DC.vlan}.1`,
      role: "distribution · data centre",
      zone: "onprem",
      place: "Data centre",
      w: 132,
      h: 62
    }),
    node(
      DC.switch,
      DC.switch,
      "switch",
      PAD,
      ROW_SW,
      [port("Gi0/1", "top"), ...portsBottom(...range(10).map((n) => `Fa0/${n}`))],
      { ip: `VLAN${DC.vlan} · On-prem`, zone: "onprem", place: "Data centre", w: ONPREM_W, h: 72 }
    )
  );
  DC.vms.forEach(([id, ip, role], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    nodes.push(
      node(id, id, "server", PAD + 4 + col * ONPREM_SUB, ROW_HOST + row * HOST_STEP, [port("Fa0", "top")], {
        ip,
        role,
        zone: "onprem",
        place: "Data centre",
        w: 118,
        h: 58
      })
    );
  });

  /* ---- HQ edge -------------------------------------------------- */
  const uplinks = hqUplinks();
  // Sit on the right of HQ, hard against the Seef exchange — that is the
  // handoff to Batelco, and a centred box left a long empty run that read as
  // "HQ and Batelco are not connected" on the map.
  const edgeX = seefX - 300 - 48;
  nodes.push(
    node(
      HQ_EDGE,
      HQ_EDGE,
      "router",
      edgeX,
      ROW_EDGE,
      [
        port("Gi0/0", "top"),
        port("Gi0/1", "left"),
        port("Gi0/2", "right"),
        ...portsBottom(...uplinks.map((u) => u.edgePort))
      ],
      { ip: "HQ edge · transit to every department", role: "HQ edge", zone: "core", place: "HQ edge", w: 300, h: 78 }
    )
  );

  /* ---- Batelco -------------------------------------------------- */
  const exchangeX = {};
  EXCHANGES.forEach((ex) => {
    if (ex.hq) {
      exchangeX[ex.id] = seefX;
      return;
    }
    const cols = ex.serves.map((code) => sites.findIndex((s) => s.code === code)).filter((i) => i >= 0);
    const mid = (Math.min(...cols) + Math.max(...cols)) / 2;
    exchangeX[ex.id] = branchX(mid) + 9;
  });

  const hamalaX = (seefX + exchangeX[EXCHANGES[EXCHANGES.length - 1].id]) / 2;
  // East of Hamala: Dubai telecom, then the Azure edge router, then the Azure switch.
  const dubaiX = hamalaX + 240;
  const azureRouterX = dubaiX + 220;
  const swCloudX = azureRouterX + 240;
  // The VM rows start just left of their switch and run right, clear of the
  // internet breakout that stands above the core.
  const cloudX0 = swCloudX - 60;

  nodes.push(
    node("Cloud-ISP", "Cloud-ISP", "cloud", hamalaX + 12, ROW_ISP, [port("Eth0", "bottom")], {
      ip: "203.0.113.130",
      mask: "255.255.255.252",
      gateway: "203.0.113.129",
      role: "Internet",
      zone: "wan",
      place: "Internet",
      w: 150,
      h: 64
    }),
    node(
      ISP_CORE,
      ISP_CORE,
      "router",
      hamalaX,
      ROW_CORE,
      [
        port("Gi0/0", "top"),
        // Well clear of Gi0/1-6, which the backbone legs below take.
        port("Gi0/9", "right"),
        ...portsBottom(...backboneLegs().map((b) => b.corePort))
      ],
      { ip: "Batelco core · Hamala", role: "ISP core", zone: "wan", place: "Batelco core · Hamala", w: 175, h: 68 }
    ),
    node(
      DUBAI_TELECOM,
      DUBAI_TELECOM,
      "router",
      dubaiX,
      ROW_CORE,
      [port("Gi0/1", "left"), port("Gi0/2", "right")],
      {
        ip: "Dubai telecom · peering",
        role: "Dubai telecom",
        zone: "wan",
        place: "Dubai telecom",
        w: 170,
        h: 68
      }
    ),
    node(
      AZURE_ROUTER,
      AZURE_ROUTER,
      "router",
      azureRouterX,
      ROW_CORE,
      [port("Gi0/1", "left"), port("Gi0/2", "right")],
      {
        ip: "Azure cloud router · 10.10.70.1",
        role: "Azure cloud router",
        zone: "cloud",
        place: "Azure cloud",
        w: 190,
        h: 68
      }
    ),
    node(
      AZURE_SWITCH,
      AZURE_SWITCH,
      "switch",
      swCloudX,
      ROW_CORE,
      [
        ...portsTop(...range(CLOUD_VMS.length).map((n) => `Fa0/${n}`)),
        port("Gi0/1", "bottom"),
        port("Gi0/2", "left")
      ],
      { ip: "Azure cloud switch · VLAN70", zone: "cloud", place: "Azure cloud", w: 300, h: 72 }
    )
  );

  CLOUD_VMS.forEach(([id, ip, role], i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const label = id === "Safqa" ? "Safqa-Bahrain" : id;
    nodes.push(
      node(id, label, "server", cloudX0 + col * 170, 150 + row * 100, [port("Fa0", "bottom")], {
        ip,
        role,
        zone: "cloud",
        place: "Azure cloud",
        w: 130,
        h: 60
      })
    );
  });

  EXCHANGES.forEach((ex) => {
    const customerPorts = ex.hq ? [port("Gi0/2", "left")] : ex.serves.map((_, i) => port(`Gi0/${i + 2}`, "bottom"));
    nodes.push(
      node(ex.id, ex.id, "router", exchangeX[ex.id], ROW_EDGE, [port("Gi0/1", "top"), ...customerPorts], {
        ip: `Area exchange · ${ex.area}`,
        role: ex.hq ? "serves HQ" : `serves ${ex.serves.map((c) => c.replace("BR", "Branch ")).join(", ")}`,
        zone: "wan",
        place: `Batelco · ${ex.area}`,
        w: 132,
        h: 62
      })
    );
  });

  /* ---- Branches ------------------------------------------------- */
  sites.forEach((site, k) => {
    const x = branchX(k);
    const hosts = branchHosts(site);
    nodes.push(
      node(site.router, site.router, "router", x, ROW_DIST, [port("Gi0/1", "top"), port("Gi0/0", "bottom")], {
        ip: `${site.name} · ${site.net}.1`,
        role: `branch edge · ${site.area}`,
        zone: "wan",
        place: site.name,
        w: 150,
        h: 64
      }),
      node(
        site.sw,
        site.sw,
        "switch",
        x,
        ROW_SW,
        [
          port("Gi0/1", "top"),
          ...portsBottom(...range(6).map((n) => `Fa0/${n}`)),
          port(AP_UPLINK_PORT, "bottom"),
          port("Fa0/24", "bottom")
        ],
        { ip: `${site.net}.0/24`, role: site.name, zone: "branch", place: site.name, w: 150, h: 64 }
      )
    );
    hosts.forEach((host, j) => {
      nodes.push(
        node(host.id, host.id, host.type, x + 17, ROW_HOST + j * HOST_STEP, [port("Fa0", "top")], {
          ip: host.ip,
          role: host.role,
          zone: "branch",
          place: site.name,
          w: 116,
          h: 58
        })
      );
    });
    wifiNodes(wifiBySwitch.get(site.sw), x + 5, ROW_HOST + hosts.length * HOST_STEP);
  });

  /* ---- Canvas and zones ---------------------------------------- */
  // A column with an access point under it is two rows deeper than its desks.
  const deepest = Math.max(
    ...depts.flatMap((d) => d.switches.map((s) => s.hosts.length + (wifiBySwitch.has(s.id) ? wifiRows(wifiBySwitch.get(s.id)) : 0))),
    ...sites.map((s) => branchHosts(s).length + (wifiBySwitch.has(s.sw) ? wifiRows(wifiBySwitch.get(s.sw)) : 0)),
    DC.vms.length / 2
  );
  const bandTop = ROW_EDGE - 40;
  const bandBottom = ROW_HOST + (deepest - 1) * HOST_STEP + 58 + 40;
  const width = Math.max(branchRight, cloudX0 + 8 * 170) + 60;
  const height = bandBottom + 40;

  return {
    viewBox: `0 0 ${width} ${height}`,
    title: "ProCloud enterprise map",
    subtitle: "",
    routing: {
      cloudBusY: 380,
      wanBusY: 630,
      coreBusY: 670,
      edgeBusY: 790,
      branchBusY: 780
    },
    zones: [
      {
        id: "cloud",
        label: "Azure cloud VMs · VLAN70 · via Dubai · gateway on R-AZURE",
        x: cloudX0 - 30,
        y: 110,
        w: 8 * 170 + 20,
        h: 260,
        tone: "cloud"
      },
      {
        id: "onprem",
        label: "Data centre · VLAN60 · behind RD-DC",
        x: 20,
        y: bandTop,
        w: PAD + ONPREM_W + 12 - 20,
        h: bandBottom - bandTop,
        tone: "onprem"
      },
      {
        id: "hq",
        label: "HQ departments — one router and one subnet each, all transiting R1-EDGE",
        x: hqX0 - 30,
        y: bandTop,
        w: hqCols * COL - 30,
        h: bandBottom - bandTop,
        tone: "hq"
      },
      {
        id: "core",
        label: "HQ edge",
        x: edgeX - 40,
        y: ROW_EDGE - 30,
        w: 380,
        h: 140,
        tone: "core"
      },
      {
        id: "wan",
        label: "Batelco WAN · Hamala core · Dubai telecom · Bahrain area exchanges · 203.0.113.0/24",
        x: seefX - 30,
        y: ROW_CORE - 40,
        w: width - seefX - 20,
        h: ROW_DIST + 64 + 30 - ROW_CORE + 40,
        tone: "wan"
      },
      {
        id: "branch",
        label: "Nine branches · one site each behind its own edge router",
        x: branchX(0) - 30,
        y: ROW_SW - 40,
        w: sites.length * COL + 20,
        h: bandBottom - ROW_SW + 40,
        tone: "branch"
      }
    ],
    nodes,
    cableTypes: [
      { id: "copper", label: "Copper straight-through" },
      { id: "crossover", label: "Copper crossover" },
      { id: "fiber", label: "Fiber" },
      { id: "console", label: "Console" }
    ]
  };
}

/* ------------------------------------------------------------------ *
 * The shipped cabling
 * ------------------------------------------------------------------ */

function defaultLinks() {
  const depts = hqPlan();
  const sites = branchSites();
  const out = [];

  // Azure cloud: VMs on the Azure switch, which reaches Batelco through the
  // Azure cloud router and Dubai telecom — not a direct Hamala hop.
  CLOUD_VMS.forEach(([id], i) => out.push(link(`${id}:Fa0`, `${AZURE_SWITCH}:Fa0/${i + 1}`)));
  out.push(link(`${AZURE_SWITCH}:Gi0/2`, `${AZURE_ROUTER}:Gi0/2`, "fiber"));
  out.push(link(`${AZURE_ROUTER}:Gi0/1`, `${DUBAI_TELECOM}:Gi0/2`, "fiber"));
  out.push(link(`${DUBAI_TELECOM}:Gi0/1`, `${ISP_CORE}:Gi0/9`, "fiber"));
  out.push(link(`Cloud-ISP:Eth0`, `${ISP_CORE}:Gi0/0`, "fiber"));

  // Data centre
  DC.vms.forEach(([id], i) => out.push(link(`${id}:Fa0`, `${DC.switch}:Fa0/${i + 1}`)));
  out.push(link(`${DC.switch}:Gi0/1`, `${DC.router}:Gi0/1`));

  // HQ: desks onto their switch, second switch trunked to the first, the
  // department switch up to its own router, and the router to the HQ edge.
  depts.forEach((dept) => {
    dept.switches.forEach((sw, i) => {
      sw.hosts.forEach((host, j) => {
        const swPort = host.type === "printer" ? "Fa0/24" : `Fa0/${j + 1}`;
        out.push(link(`${host.id}:Fa0`, `${sw.id}:${swPort}`));
      });
      if (i === 0) out.push(link(`${sw.id}:Gi0/1`, `${dept.router}:Gi0/1`));
      else out.push(link(`${dept.switches[i - 1].id}:Gi0/2`, `${sw.id}:Gi0/3`, "crossover"));
    });
  });
  hqUplinks().forEach((leg) => out.push(link(`${HQ_EDGE}:${leg.edgePort}`, `${leg.router}:${leg.routerPort}`)));

  // Batelco: the core down to each area exchange, then each exchange out to
  // the sites in its district.
  backboneLegs().forEach((leg) => out.push(link(`${ISP_CORE}:${leg.corePort}`, `${leg.id}:${leg.areaPort}`, "fiber")));
  out.push(link("BAT-SEEF:Gi0/2", `${HQ_EDGE}:Gi0/2`));

  // Branches
  sites.forEach((site) => {
    out.push(link(`${site.exchange}:${site.exchangePort}`, `${site.router}:Gi0/1`));
    out.push(link(`${site.router}:Gi0/0`, `${site.sw}:Gi0/1`));
    branchHosts(site).forEach((host, j) => {
      const swPort = host.type === "printer" ? "Fa0/24" : `Fa0/${j + 1}`;
      out.push(link(`${host.id}:Fa0`, `${site.sw}:${swPort}`));
    });
  });

  // Access points: one copper uplink each into the switch for their VLAN. The
  // laptops have no cable — their link is made by the radio at run time.
  wifiPlan().forEach((w) => out.push(link(`${w.ap}:Gi0/1`, `${w.switch}:${AP_UPLINK_PORT}`)));

  return out.map((l, i) => ({ ...l, id: `L${String(i + 1).padStart(3, "0")}` }));
}

function endpointKey(deviceId, portId) {
  return `${deviceId}:${portId}`;
}

function parseEndpoint(key) {
  const i = String(key || "").indexOf(":");
  if (i < 1) return null;
  return { deviceId: key.slice(0, i), portId: key.slice(i + 1) };
}

function knownEndpoints(topo) {
  const set = new Set();
  for (const n of topo.nodes) {
    for (const p of n.ports) set.add(endpointKey(n.id, p.id));
  }
  return set;
}

module.exports = {
  topology,
  defaultLinks,
  HQ_DEPTS,
  DC,
  BRANCHES,
  EXCHANGES,
  ISP_CORE,
  HQ_EDGE,
  DUBAI_TELECOM,
  AZURE_ROUTER,
  AZURE_SWITCH,
  hqPlan,
  hqUplinks,
  branchSites,
  branchHosts,
  backboneLegs,
  wifiPlan,
  STAFF_SSID,
  STAFF_KEY,
  AP_UPLINK_PORT,
  endpointKey,
  parseEndpoint,
  knownEndpoints,
  port,
  node,
  link
};
