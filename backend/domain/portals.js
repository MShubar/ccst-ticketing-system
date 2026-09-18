function makeInvoices() {
  const shops = [
    "Safqa",
    "Keratin Glow",
    "Head office",
    "Branch A",
    "Branch B",
    "Branch C",
    "Branch D",
    "Branch E",
    "Branch F",
    "Branch G",
    "Branch H",
    "Branch I",
    "Sales",
    "Warehouse",
    "Procurement",
    "Marketing"
  ];
  const days = ["today", "yesterday", "2 days ago", "last week"];
  const statuses = ["posted", "pending", "posted", "refunded"];
  const special = {
    1001: { shop: "Safqa", amount: "12.500 BHD", day: "yesterday", status: "posted" },
    1002: { shop: "Keratin Glow", amount: "8.000 BHD", day: "today", status: "pending" },
    1003: { shop: "Head office", amount: "21.000 BHD", day: "today", status: "pending" },
    1004: { shop: "Branch A", amount: "6.250 BHD", day: "today", status: "pending" }
  };
  const list = [];
  let i;
  for (i = 0; i < 100; i++) {
    const num = 1001 + i;
    if (special[num]) {
      list.push({ id: "INV-" + num, ...special[num] });
      continue;
    }
    const fils = ((num * 17) % 9000) + 250;
    const amount = (fils / 1000).toFixed(3) + " BHD";
    list.push({
      id: "INV-" + num,
      shop: shops[i % shops.length],
      amount,
      day: days[i % days.length],
      status: statuses[i % statuses.length]
    });
  }
  return list;
}

function mailboxFrom(name, used) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
  let mailbox = base;
  let n = 2;
  while (used.has(mailbox)) {
    mailbox = base + n;
    n += 1;
  }
  used.add(mailbox);
  return mailbox;
}

/**
 * Every desk in the company, with the department or branch it stands in.
 * Read from the lab map so a person in the password portal always sits at a
 * PC a student can actually open, in the place the ticket says they are.
 */
function desks() {
  const labMap = require("./lab/lab-map");
  const out = [];
  labMap.hqPlan().forEach((dept) => {
    dept.switches.forEach((sw) => {
      sw.hosts.forEach((host) => {
        if (host.type === "pc") out.push({ pc: host.id, department: dept.name });
      });
    });
  });
  labMap.branchSites().forEach((site) => {
    labMap.branchHosts(site).forEach((host) => {
      if (host.type === "pc") out.push({ pc: host.id, department: site.name });
    });
  });
  return out;
}

function makePasswordPeople() {
  const seats = desks();
  const named = [
    { name: "Fatima Al-Kuwari", department: "Sales", pc: "PC-S1" },
    { name: "Omar Hassan", department: "Finance", pc: "PC-F1" },
    { name: "Noor Al-Mannai", department: "HR", pc: "PC-HR1" },
    { name: "Yusuf Ibrahim", department: "Operations", pc: "PC-OPS1" },
    { name: "Layla Mahmood", department: "IT", pc: "PC-IT1" },
    { name: "Khalid Al-Dosari", department: "Warehouse", pc: "PC-WH1" },
    { name: "Hessa Fakhro", department: "Reception", pc: "PC-REC1" },
    { name: "Rashid Nasser", department: "Branch A", pc: "PC-BA1" },
    { name: "Amina Saleh", department: "Branch B", pc: "PC-BB1" },
    { name: "Hassan Jassim", department: "Branch C", pc: "PC-BC1" },
    { name: "Maryam Yusuf", department: "Training", pc: "PC-TR1" }
  ];
  const first = [
    "Ali", "Ahmed", "Sara", "Reem", "Hamad", "Isa", "Malka", "Marwan",
    "Mohamed", "Zain", "Thamer", "Hasan", "Athraa", "Saqib", "Dana",
    "Noura", "Abdulla", "Salman", "Hanan", "Lulwa", "Mariam", "Bader",
    "Faisal", "Jassim", "Latifa", "Nasser", "Shaikha", "Yousef", "Aisha",
    "Khalifa", "Muneera", "Tariq", "Waleed", "Zahra", "Ebrahim", "Huda",
    "Majed", "Rania", "Saeed", "Dalal"
  ];
  const last = [
    "Al-Kuwari", "Hassan", "Al-Mannai", "Ibrahim", "Mahmood", "Al-Dosari",
    "Fakhro", "Nasser", "Saleh", "Jassim", "Yusuf", "Al-Zayani", "Hubail",
    "Alabdulla", "Qureshi", "Bahar", "Hussein", "Alhusaini", "Tajdin",
    "Albahairi", "Saad", "Ebrahim", "Abdulla", "Lashari", "Hashem",
    "Al-Arrayed", "Al-Jalahma", "Al-Binali", "Al-Noaimi", "Al-Rumaihi"
  ];
  const usedNames = new Set(named.map((p) => p.name));
  const usedMail = new Set();
  const list = named.map((p, i) => ({
    id: "MBX-" + String(i + 1).padStart(4, "0"),
    name: p.name,
    department: p.department,
    pc: p.pc,
    mailbox: mailboxFrom(p.name, usedMail),
    lastReset: null
  }));
  let fi = 0;
  let li = 0;
  while (list.length < 200) {
    const name = first[fi % first.length] + " " + last[li % last.length];
    fi += 1;
    if (fi % first.length === 0) li += 1;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const n = list.length;
    // Walk the desks in order rather than pairing a department and a PC
    // independently, so nobody ends up filed in Marketing at a Warehouse desk.
    const seat = seats[n % seats.length];
    list.push({
      id: "MBX-" + String(n + 1).padStart(4, "0"),
      name,
      department: seat.department,
      pc: seat.pc,
      mailbox: mailboxFrom(name, usedMail),
      lastReset: null
    });
  }
  return list;
}

function makeVasConnections() {
  const companies = [
    { key: "STC", name: "stc" },
    { key: "BAT", name: "Batelco" },
    { key: "ZAIN", name: "Zain" }
  ];
  const services = ["SMS", "MMS", "BMS", "USSD"];
  const down = new Set([
    "VAS-STC-SMS-1",
    "VAS-STC-SMS-2",
    "VAS-BAT-SMS-1",
    "VAS-BAT-SMS-2",
    "VAS-ZAIN-SMS-1",
    "VAS-ZAIN-SMS-2",
    "VAS-BAT-MMS-1",
    "VAS-STC-BMS-2",
    "VAS-ZAIN-USSD-1"
  ]);
  const list = [];
  companies.forEach((co) => {
    services.forEach((svc) => {
      [1, 2, 3].forEach((n) => {
        const id = "VAS-" + co.key + "-" + svc + "-" + n;
        list.push({
          id,
          company: co.name,
          service: svc,
          name: svc + "-" + n,
          status: down.has(id) ? "down" : "up"
        });
      });
    });
  });
  return list;
}

function makeVpnConnections() {
  const labMap = require("./lab/lab-map");
  // One site-to-site tunnel set per branch on the map, so the portal grows with
  // the company instead of stopping at the three branches it started with.
  const sites = [
    ...labMap.branchSites().map((site) => ({ key: site.code.replace(/^BR/, "B"), name: site.name })),
    { key: "HO", name: "Head office" },
    { key: "SAFQA", name: "Safqa" },
    { key: "KER", name: "Keratin Glow" }
  ];
  const types = ["IPsec", "SSL", "Remote"];
  const down = new Set([
    "VPN-BA-IPSEC-1",
    "VPN-BA-REMOTE-2",
    "VPN-BB-IPSEC-1",
    "VPN-BB-SSL-1",
    "VPN-BC-SSL-1",
    "VPN-HO-REMOTE-1",
    "VPN-SAFQA-IPSEC-2",
    "VPN-KER-SSL-1"
  ]);
  const list = [];
  sites.forEach((site) => {
    types.forEach((type) => {
      [1, 2, 3].forEach((n) => {
        const id = "VPN-" + site.key + "-" + type.toUpperCase() + "-" + n;
        list.push({
          id,
          site: site.name,
          type,
          name: type + "-" + n,
          status: down.has(id) ? "down" : "up"
        });
      });
    });
  });
  return list;
}

function defaultPortals() {
  return {
    passwordResets: [],
    passwordPeople: makePasswordPeople(),
    cbs: {
      invoices: makeInvoices(),
      tills: [{ id: "TILL-1", shop: "Safqa", name: "Till 1" }],
      log: []
    },
    vas: {
      host: "CLOUD-VM-APP",
      ip: "10.10.70.40",
      connections: makeVasConnections(),
      messages: [],
      log: []
    },
    vpn: {
      host: "R1-EDGE",
      ip: "203.0.113.34",
      connections: makeVpnConnections(),
      log: []
    }
  };
}

function ensurePortals(db) {
  const fresh = defaultPortals();
  if (!db.portals) {
    db.portals = fresh;
    return db;
  }
  if (!Array.isArray(db.portals.passwordResets)) db.portals.passwordResets = [];
  if (!Array.isArray(db.portals.passwordPeople) || db.portals.passwordPeople.length < 200) {
    db.portals.passwordPeople = fresh.passwordPeople;
  }
  if (!db.portals.cbs) db.portals.cbs = fresh.cbs;
  if (!db.portals.cbs.invoices || db.portals.cbs.invoices.length < 80) {
    db.portals.cbs.invoices = fresh.cbs.invoices;
  }
  if (!db.portals.vas) db.portals.vas = fresh.vas;
  if (
    !db.portals.vas.connections ||
    db.portals.vas.connections.length < 20 ||
    !db.portals.vas.connections[0] ||
    !db.portals.vas.connections[0].company
  ) {
    db.portals.vas.connections = fresh.vas.connections;
    db.portals.vas.host = fresh.vas.host;
    db.portals.vas.ip = fresh.vas.ip;
  }
  if (!db.portals.vpn) db.portals.vpn = fresh.vpn;
  if (
    !db.portals.vpn.connections ||
    db.portals.vpn.connections.length < 20 ||
    !db.portals.vpn.connections[0] ||
    !db.portals.vpn.connections[0].site
  ) {
    db.portals.vpn.connections = fresh.vpn.connections;
    db.portals.vpn.host = fresh.vpn.host;
    db.portals.vpn.ip = fresh.vpn.ip;
  }
  // Retired portals, cleared out of saved state on load.
  delete db.portals.lab; // Packet Tracer multiuser host
  delete db.portals.cloud; // cloud service checklist
  return db;
}

function canChangeSystems(user) {
  return Boolean(user && (user.role === "instructor" || user.level >= 2));
}

function pushLog(list, user, action) {
  list.unshift({
    at: new Date().toISOString(),
    who: user.fullName,
    action
  });
  if (list.length > 12) list.length = 12;
}

module.exports = {
  defaultPortals,
  ensurePortals,
  canChangeSystems,
  pushLog
};
