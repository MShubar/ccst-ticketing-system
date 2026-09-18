const requesters = [
  { id: "req-1", name: "Fatima Al-Kuwari", department: "Sales", title: "Account Executive" },
  { id: "req-2", name: "Omar Hassan", department: "Finance", title: "Payroll Officer" },
  { id: "req-3", name: "Noor Al-Mannai", department: "HR", title: "Onboarding Coordinator" },
  { id: "req-4", name: "Yusuf Ibrahim", department: "Operations", title: "Shift Supervisor" },
  { id: "req-5", name: "Layla Mahmood", department: "IT", title: "Service Desk Lead" },
  { id: "req-6", name: "Khalid Al-Dosari", department: "Warehouse", title: "Inventory Clerk" },
  { id: "req-7", name: "Hessa Fakhro", department: "Reception", title: "Front Desk" },
  { id: "req-8", name: "Rashid Nasser", department: "Branch A", title: "Branch Coordinator" },
  { id: "req-9", name: "Amina Saleh", department: "Branch B", title: "Branch Coordinator" },
  { id: "req-10", name: "Hassan Jassim", department: "Branch C", title: "Branch Coordinator" },
  { id: "req-11", name: "Maryam Yusuf", department: "Training", title: "Lab Instructor" }
];

const slaPolicy = {
  critical: { acknowledgeMinutes: 30, resolveHours: 6, description: "Unreachable Cloud VM / cloud service" },
  high: { acknowledgeMinutes: 60, resolveHours: 12, description: "Billing/CBS ticket, or all PCs in a department" },
  medium: {
    acknowledgeMinutes: 120,
    resolveHours: 24,
    description: "One PC issue, one PC with no internet, a shared printer, or a laptop off the wireless"
  },
  low: { acknowledgeMinutes: 180, resolveHours: 48, description: "Password reset or minor request" }
};

const CHANNELS = ["portal", "phone", "email", "chat", "walk-in", "monitoring"];

function requesterById(id) {
  return requesters.find((r) => r.id === id);
}

function labPcs() {
  return [
    { name: "PC-S1", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-S2", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-S3", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-S4", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-S5", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-S6", dept: "Sales", req: "req-1", printer: "the Sales printer" },
    { name: "PC-F1", dept: "Finance", req: "req-2", printer: "the Finance printer" },
    { name: "PC-F2", dept: "Finance", req: "req-2", printer: "the Finance printer" },
    { name: "PC-F3", dept: "Finance", req: "req-2", printer: "the Finance printer" },
    { name: "PC-F4", dept: "Finance", req: "req-2", printer: "the Finance printer" },
    { name: "PC-HR1", dept: "HR", req: "req-3", printer: "the HR printer" },
    { name: "PC-HR2", dept: "HR", req: "req-3", printer: "the HR printer" },
    { name: "PC-HR3", dept: "HR", req: "req-3", printer: "the HR printer" },
    { name: "PC-HR4", dept: "HR", req: "req-3", printer: "the HR printer" },
    { name: "PC-REC1", dept: "Reception", req: "req-7", printer: "the Reception printer" },
    { name: "PC-REC2", dept: "Reception", req: "req-7", printer: "the Reception printer" },
    { name: "PC-REC3", dept: "Reception", req: "req-7", printer: "the Reception printer" },
    { name: "PC-OPS1", dept: "Operations", req: "req-4", printer: "the Operations printer" },
    { name: "PC-OPS2", dept: "Operations", req: "req-4", printer: "the Operations printer" },
    { name: "PC-OPS3", dept: "Operations", req: "req-4", printer: "the Operations printer" },
    { name: "PC-OPS4", dept: "Operations", req: "req-4", printer: "the Operations printer" },
    { name: "PC-WH1", dept: "Warehouse", req: "req-6", printer: "the Warehouse printer" },
    { name: "PC-WH2", dept: "Warehouse", req: "req-6", printer: "the Warehouse printer" },
    { name: "PC-WH3", dept: "Warehouse", req: "req-6", printer: "the Warehouse printer" },
    { name: "PC-TR1", dept: "Training", req: "req-11", printer: "the Training printer" },
    { name: "PC-TR2", dept: "Training", req: "req-11", printer: "the Training printer" },
    { name: "PC-TR3", dept: "Training", req: "req-11", printer: "the Training printer" },
    { name: "PC-IT1", dept: "IT", req: "req-5", printer: "the IT printer" },
    { name: "PC-IT2", dept: "IT", req: "req-5", printer: "the IT printer" },
    { name: "PC-IT3", dept: "IT", req: "req-5", printer: "the IT printer" },
    { name: "PC-BA1", dept: "Branch A", req: "req-8", printer: "the Branch A printer", branch: true },
    { name: "PC-BA2", dept: "Branch A", req: "req-8", printer: "the Branch A printer", branch: true },
    { name: "PC-BA3", dept: "Branch A", req: "req-8", printer: "the Branch A printer", branch: true },
    { name: "PC-BA4", dept: "Branch A", req: "req-8", printer: "the Branch A printer", branch: true },
    { name: "PC-BB1", dept: "Branch B", req: "req-9", printer: "the Branch B printer", branch: true },
    { name: "PC-BB2", dept: "Branch B", req: "req-9", printer: "the Branch B printer", branch: true },
    { name: "PC-BB3", dept: "Branch B", req: "req-9", printer: "the Branch B printer", branch: true },
    { name: "PC-BB4", dept: "Branch B", req: "req-9", printer: "the Branch B printer", branch: true },
    { name: "PC-BC1", dept: "Branch C", req: "req-10", printer: "the Branch C printer", branch: true },
    { name: "PC-BC2", dept: "Branch C", req: "req-10", printer: "the Branch C printer", branch: true },
    { name: "PC-BC3", dept: "Branch C", req: "req-10", printer: "the Branch C printer", branch: true },
    { name: "PC-BC4", dept: "Branch C", req: "req-10", printer: "the Branch C printer", branch: true }
  ];
}

function who(pc) {
  const r = requesterById(pc.req);
  return r ? r.name : "A user";
}

function ticket(fields) {
  return {
    title: fields.title,
    description: fields.description,
    category: fields.category,
    subcategory: fields.subcategory,
    tags: fields.tags,
    requesterId: fields.requesterId,
    channel: fields.channel
  };
}

function generatePasswordTickets() {
  const pcs = labPcs();
  const closeVoices = [
    {
      title: (pc) => `Please reset my password on ${pc}`,
      description: (pc, name, dept) =>
        `Please reset my password. I cannot get into email on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `I forgot my password — ${pc}`,
      description: (pc, name, dept) =>
        `I forgot my password. Please reset it so I can open mail on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Need a password reset on ${pc}`,
      description: (pc, name, dept) =>
        `Need my email password reset. I am locked out on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Cannot sign in — please reset password (${pc})`,
      description: (pc, name, dept) =>
        `I keep getting a sign-in error on ${pc}. Can you reset my password? — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Locked out of email on ${pc}`,
      description: (pc, name, dept) =>
        `I am locked out of email on ${pc}. Please reset my password. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Password expired on ${pc}`,
      description: (pc, name, dept) =>
        `It says my password expired on ${pc}. Please reset it. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Reset mailbox password for ${pc}`,
      description: (pc, name, dept) =>
        `Can you reset my mailbox password? I am on ${pc} and it will not let me in. — ${name}, ${dept}.`
    }
  ];
  const escalateVoices = [
    {
      title: (pc) => `Reset my password — I will send my CPR (${pc})`,
      description: (pc, name, dept) =>
        `I forgot my password. I can send my CPR and phone number on this ticket so you can reset it. I am on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Reset my password — I will WhatsApp the real one (${pc})`,
      description: (pc, name, dept) =>
        `Please reset my password. I will WhatsApp you the real one so it is faster. I am on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Here is my current password — please reset it (${pc})`,
      description: (pc, name, dept) =>
        `Please reset my password. My current one is the same as last year if that helps. I am on ${pc}. — ${name}, ${dept}.`
    },
    {
      title: (pc) => `Call my personal number to reset the password (${pc})`,
      description: (pc, name, dept) =>
        `Please reset my password and call my personal number when it is done. I am on ${pc}. — ${name}, ${dept}.`
    }
  ];
  const escalateAt = new Set([3, 9, 15, 21, 27, 33, 39, 47]);
  const list = [];
  let escalateCount = 0;
  let closeCount = 0;
  for (let i = 0; i < 50; i += 1) {
    const pc = pcs[i % pcs.length];
    const r = requesterById(pc.req);
    const name = r ? r.name : "A user";
    const escalate = escalateAt.has(i);
    const voices = escalate ? escalateVoices : closeVoices;
    const voice = escalate
      ? voices[escalateCount % voices.length]
      : voices[closeCount % voices.length];
    if (escalate) escalateCount += 1;
    else closeCount += 1;
    list.push(
      ticket({
        title: voice.title(pc.name),
        description: voice.description(pc.name, name, pc.dept),
        category: "Access & Identity",
        subcategory: "Password",
        tags: escalate
          ? ["password", pc.name.toLowerCase(), "escalate", "kb-escalate"]
          : ["password", pc.name.toLowerCase(), "kb-password"],
        requesterId: pc.req,
        channel: CHANNELS[i % CHANNELS.length]
      })
    );
  }
  return list;
}

function generateCableTickets() {
  const jobs = [
    {
      pc: "PC-S3",
      req: "req-1",
      title: "The cable fell out",
      description:
        "The cable fell out of PC-S3. There is no green light. Can you plug it back? — Fatima Al-Kuwari, Sales.",
      channel: "walk-in"
    },
    {
      pc: "PC-F4",
      req: "req-2",
      title: "No green light on PC-F4",
      description:
        "PC-F4 has no green light on the network cable. I cannot get on anything. — Omar Hassan, Finance.",
      channel: "phone"
    },
    {
      pc: "PC-HR3",
      req: "req-3",
      title: "Someone kicked the cable on PC-HR3",
      description:
        "Someone kicked the cable under PC-HR3. It is hanging and there is no light. — Noor Al-Mannai, HR.",
      channel: "walk-in"
    },
    {
      pc: "PC-REC1",
      req: "req-7",
      title: "The cable is loose on PC-REC1",
      description:
        "The cable on PC-REC1 is loose. No green light. Guests are waiting. — Hessa Fakhro, Reception.",
      channel: "chat"
    },
    {
      pc: "PC-OPS3",
      req: "req-4",
      title: "I unplugged PC-OPS3 to move the desk",
      description:
        "I unplugged PC-OPS3 to move the desk and I cannot get it back in. No green light. — Yusuf Ibrahim, Operations.",
      channel: "portal"
    },
    {
      pc: "PC-WH1",
      req: "req-6",
      title: "The cable fell out of PC-WH1",
      description:
        "The cable fell out of PC-WH1 in the warehouse. There is no green light. — Khalid Al-Dosari, Warehouse.",
      channel: "phone"
    },
    {
      pc: "PC-TR1",
      req: "req-11",
      title: "Training PC-TR1 has no network light",
      description:
        "PC-TR1 has no green light. The cable looks unplugged. Class starts soon. — Maryam Yusuf, Training.",
      channel: "walk-in"
    },
    {
      pc: "PC-BB2",
      req: "req-9",
      title: "The cable came out on PC-BB2",
      description:
        "The cable came out of PC-BB2 at Branch B. No green light. — Amina Saleh, Branch B.",
      channel: "email"
    },
    {
      pc: "PC-BC4",
      req: "req-10",
      title: "No green light on PC-BC4",
      description:
        "PC-BC4 has no green light. I think the cable fell behind the desk. — Hassan Jassim, Branch C.",
      channel: "portal"
    },
    {
      pc: "PRN-OPS",
      req: "req-4",
      title: "The Operations printer cable is on the floor",
      description:
        "The Operations printer has no light. The cable is on the floor. I am next to PC-OPS4. — Yusuf Ibrahim, Operations.",
      channel: "walk-in"
    },
    {
      pc: "CLOUD-VM-WEB",
      req: "req-5",
      title: "The cloud web server has no green light",
      description:
        "CLOUD-VM-WEB has no green light. The cable looks out. www.procloud.bh will not open. — Layla Mahmood, IT.",
      channel: "portal"
    },
    {
      pc: "CLOUD-VM-FILE",
      req: "req-8",
      title: "The file server cable fell out",
      description:
        "CLOUD-VM-FILE has no light. The cable is hanging. We cannot open the share. — Rashid Nasser, Branch A.",
      channel: "phone"
    },
    {
      pc: "CLOUD-VM-MAIL",
      req: "req-4",
      title: "The mail server has no network light",
      description:
        "CLOUD-VM-MAIL has no green light. Nobody can get mail. — Yusuf Ibrahim, Operations.",
      channel: "email"
    },
    {
      pc: "CLOUD-VM-DNS",
      req: "req-5",
      title: "The DNS server cable is out",
      description:
        "CLOUD-VM-DNS has no green light. Names will not resolve. — Layla Mahmood, IT.",
      channel: "chat"
    },
    {
      pc: "CLOUD-VM-APP",
      req: "req-1",
      title: "The app server cable fell out",
      description:
        "CLOUD-VM-APP at the top of the map has no green light. The cable is out. — Fatima Al-Kuwari, Sales.",
      channel: "portal"
    },
    {
      pc: "CLOUD-VM-BAK",
      req: "req-6",
      title: "The backup server has no light",
      description:
        "CLOUD-VM-BAK has no green light. Backup jobs are failing. — Khalid Al-Dosari, Warehouse.",
      channel: "monitoring"
    },
    {
      pc: "Keratin-Glow-Bahrain",
      req: "req-7",
      title: "Keratin Glow server has no green light",
      description:
        "The Keratin Glow server has no green light. The cable looks unplugged. A guest is waiting. — Hessa Fakhro, Reception.",
      channel: "walk-in"
    },
    {
      pc: "Safqa-Bahrain",
      req: "req-9",
      title: "The Safqa server cable is on the rack floor",
      description:
        "Safqa-Bahrain has no light. The cable is on the floor of the rack. The shop page is down. — Amina Saleh, Branch B.",
      channel: "phone"
    }
  ];
  return jobs.map((job) =>
    ticket({
      title: job.title,
      description: job.description,
      category: "Hardware",
      subcategory: "Cable",
      tags: ["cable", job.pc.toLowerCase(), "kb-cable"],
      requesterId: job.req,
      channel: job.channel
    })
  );
}

function generateChangeEscalateTickets() {
  return [
    ticket({
      title: "Customer SMS is not sending — stc VAS-STC-SMS-1",
      description: "Our customer SMS is not leaving on stc SMS-1 (VAS-STC-SMS-1). Please get that link up. — Fatima Al-Kuwari, Sales.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "stc", "vas-stc-sms-1", "escalate", "kb-escalate"],
      requesterId: "req-1",
      channel: "phone"
    }),
    ticket({
      title: "Safqa order SMS failed on Batelco VAS-BAT-SMS-2",
      description: "The shop sent an order SMS and the customer never got it. It goes out on Batelco SMS-2 (VAS-BAT-SMS-2). — Amina Saleh, Branch B.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "batelco", "vas-bat-sms-2", "safqa", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "chat"
    }),
    ticket({
      title: "Enable Zain SMS-1 VAS-ZAIN-SMS-1",
      description: "Please ask Zain to enable SMS-1 (VAS-ZAIN-SMS-1). Appointment texts are queued. — Layla Mahmood, IT.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "zain", "vas-zain-sms-1", "escalate", "kb-escalate"],
      requesterId: "req-5",
      channel: "portal"
    }),
    ticket({
      title: "CBS will not post invoice INV-1002",
      description: "CBS will not post invoice INV-1002 (Keratin Glow, 8.000 BHD). Payroll is waiting on that number. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "inv-1002", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "portal"
    }),
    ticket({
      title: "Please refund invoice INV-1001 in CBS",
      description: "Please enter a refund on invoice INV-1001 (Safqa, 12.500 BHD). I do not have rights. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "inv-1001", "refund", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "email"
    }),
    ticket({
      title: "CBS will not open",
      description: "CBS will not open. I need the billing system for this afternoon. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "walk-in"
    }),
    ticket({
      title: "Please update CRM tonight",
      description: "Please update CRM tonight. Sales was told there is a new version. I am on PC-S6. — Fatima Al-Kuwari, Sales.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "crm", "pc-s6", "escalate", "kb-escalate"],
      requesterId: "req-1",
      channel: "portal"
    }),
    ticket({
      title: "Windows update is waiting on the Training PCs",
      description: "Windows update is waiting on the Training PCs. Please do the update. I am on PC-TR3. — Maryam Yusuf, Training.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "pc-tr3", "batch", "escalate", "kb-escalate"],
      requesterId: "req-11",
      channel: "walk-in"
    }),
    ticket({
      title: "Please put the new Safqa version on the server",
      description: "Please put the new Safqa version on the server. I was told not to install it myself. I am on PC-BB1. — Amina Saleh, Branch B.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "safqa", "pc-bb1", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "email"
    }),
    ticket({
      title: "Please update CBS",
      description: "Please update CBS. Finance was sent a new version. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "cbs", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "portal"
    }),
    ticket({
      title: "Keratin appointment SMS down on stc VAS-STC-SMS-2",
      description: "The appointment SMS for Keratin Glow never left. It uses stc SMS-2 (VAS-STC-SMS-2). — Hessa Fakhro, Reception.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "stc", "vas-stc-sms-2", "escalate", "kb-escalate"],
      requesterId: "req-7",
      channel: "walk-in"
    }),
    ticket({
      title: "Warehouse stock SMS failed on Batelco VAS-BAT-SMS-1",
      description: "The stock SMS to the supplier failed. It should go out on Batelco SMS-1 (VAS-BAT-SMS-1). — Khalid Al-Dosari, Warehouse.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "batelco", "vas-bat-sms-1", "escalate", "kb-escalate"],
      requesterId: "req-6",
      channel: "phone"
    }),
    ticket({
      title: "Branch C receipts failed on Zain VAS-ZAIN-SMS-2",
      description: "Receipt SMS is not sending from Branch C on Zain SMS-2 (VAS-ZAIN-SMS-2). Customers wait for the text. — Hassan Jassim, Branch C.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "zain", "vas-zain-sms-2", "escalate", "kb-escalate"],
      requesterId: "req-10",
      channel: "chat"
    }),
    ticket({
      title: "stc SMS-3 VAS-STC-SMS-3 is sending twice",
      description: "Every customer is getting the SMS twice on stc SMS-3 (VAS-STC-SMS-3). — Fatima Al-Kuwari, Sales.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "stc", "vas-stc-sms-3", "escalate", "kb-escalate"],
      requesterId: "req-1",
      channel: "email"
    }),
    ticket({
      title: "Batelco wants a test SMS on VAS-BAT-SMS-3",
      description: "Batelco asked us to send a test SMS on SMS-3 (VAS-BAT-SMS-3). I cannot do that. — Layla Mahmood, IT.",
      category: "Software",
      subcategory: "VAS SMS",
      tags: ["vas", "sms", "batelco", "vas-bat-sms-3", "escalate", "kb-escalate"],
      requesterId: "req-5",
      channel: "portal"
    }),
    ticket({
      title: "Keratin photo MMS failed on Batelco VAS-BAT-MMS-1",
      description: "The after-photo MMS for Keratin Glow is not leaving on Batelco MMS-1 (VAS-BAT-MMS-1). — Hessa Fakhro, Reception.",
      category: "Software",
      subcategory: "VAS MMS",
      tags: ["vas", "mms", "batelco", "vas-bat-mms-1", "escalate", "kb-escalate"],
      requesterId: "req-7",
      channel: "phone"
    }),
    ticket({
      title: "Billing alerts down on stc BMS VAS-STC-BMS-2",
      description: "CBS billing alerts are not reaching phones on stc BMS-2 (VAS-STC-BMS-2). — Yusuf Ibrahim, Operations.",
      category: "Software",
      subcategory: "VAS BMS",
      tags: ["vas", "bms", "stc", "vas-stc-bms-2", "escalate", "kb-escalate"],
      requesterId: "req-4",
      channel: "portal"
    }),
    ticket({
      title: "Zain USSD menu is down VAS-ZAIN-USSD-1",
      description: "The short-code USSD menu is down on Zain USSD-1 (VAS-ZAIN-USSD-1). Customers cannot check their order. — Fatima Al-Kuwari, Sales.",
      category: "Software",
      subcategory: "VAS USSD",
      tags: ["vas", "ussd", "zain", "vas-zain-ussd-1", "escalate", "kb-escalate"],
      requesterId: "req-1",
      channel: "chat"
    }),
    ticket({
      title: "CBS totals missing invoice INV-1003",
      description: "CBS still shows yesterday's totals. Today's head-office invoice INV-1003 (21.000 BHD) is missing. — Noor Al-Mannai, HR.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "inv-1003", "escalate", "kb-escalate"],
      requesterId: "req-3",
      channel: "portal"
    }),
    ticket({
      title: "Please add a new shop till in CBS for Safqa",
      description: "Please add a new shop till in CBS for Safqa. I do not have CBS rights. — Amina Saleh, Branch B.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "safqa", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "phone"
    }),
    ticket({
      title: "Payroll will not export from CBS",
      description: "Payroll will not export from CBS. I need the file today. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "payroll", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "email"
    }),
    ticket({
      title: "Branch A cannot post invoice INV-1004",
      description: "I cannot post invoice INV-1004 (Branch A, 6.250 BHD) into CBS. — Rashid Nasser, Branch A.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "inv-1004", "escalate", "kb-escalate"],
      requesterId: "req-8",
      channel: "walk-in"
    }),
    ticket({
      title: "Please give Finance CBS report access",
      description: "Please give Finance CBS report access. We cannot open the month-end report. — Omar Hassan, Finance.",
      category: "Software",
      subcategory: "CBS",
      tags: ["cbs", "access", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "portal"
    }),
    ticket({
      title: "Please update the mail server tonight",
      description: "Please update the mail server tonight. I was told there is a new version. I am on PC-OPS4. — Yusuf Ibrahim, Operations.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "mail", "pc-ops4", "escalate", "kb-escalate"],
      requesterId: "req-4",
      channel: "portal"
    }),
    ticket({
      title: "Antivirus update is waiting on every Ops PC",
      description: "Antivirus update is waiting on every Operations PC. Please do the update. I am on PC-OPS2. — Yusuf Ibrahim, Operations.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "pc-ops2", "batch", "escalate", "kb-escalate"],
      requesterId: "req-4",
      channel: "phone"
    }),
    ticket({
      title: "Please update Keratin Glow on the server",
      description: "Please put the new Keratin Glow version on the server. I will not install it myself. I am on PC-HR2. — Noor Al-Mannai, HR.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "update", "keratin", "pc-hr2", "escalate", "kb-escalate"],
      requesterId: "req-3",
      channel: "email"
    }),
    ticket({
      title: "Need a change window on Sunday for CBS",
      description: "We need CBS down for one hour on Sunday for a change. Please raise it. — Layla Mahmood, IT.",
      category: "Software",
      subcategory: "Software update",
      tags: ["change", "cbs", "escalate", "kb-escalate"],
      requesterId: "req-5",
      channel: "portal"
    }),
    ticket({
      title: "Branch A cannot reach head office — VPN-BA-IPSEC-1",
      description: "Branch A cannot reach head office. The IPsec tunnel VPN-BA-IPSEC-1 is down. I am on PC-BA3. — Rashid Nasser, Branch A.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ipsec", "branch-a", "vpn-ba-ipsec-1", "pc-ba3", "escalate", "kb-escalate"],
      requesterId: "req-8",
      channel: "phone"
    }),
    ticket({
      title: "Branch B VPN is down VPN-BB-IPSEC-1",
      description: "The Branch B IPsec tunnel VPN-BB-IPSEC-1 will not come up. Head office files will not open. I am on PC-BB1. — Amina Saleh, Branch B.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ipsec", "branch-b", "vpn-bb-ipsec-1", "pc-bb1", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "portal"
    }),
    ticket({
      title: "Branch C SSL tunnel failed VPN-BC-SSL-1",
      description: "The SSL VPN for Branch C is down (VPN-BC-SSL-1). I cannot get to CBS. I am on PC-BC2. — Hassan Jassim, Branch C.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ssl", "branch-c", "vpn-bc-ssl-1", "pc-bc2", "escalate", "kb-escalate"],
      requesterId: "req-10",
      channel: "chat"
    }),
    ticket({
      title: "Remote staff cannot connect VPN-HO-REMOTE-1",
      description: "People working from home cannot get on the head-office remote VPN (VPN-HO-REMOTE-1). I am on PC-IT2. — Layla Mahmood, IT.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "remote", "vpn-ho-remote-1", "pc-it2", "escalate", "kb-escalate"],
      requesterId: "req-5",
      channel: "email"
    }),
    ticket({
      title: "Safqa shop VPN is down VPN-SAFQA-IPSEC-2",
      description: "The Safqa shop cannot reach head office on IPsec-2 (VPN-SAFQA-IPSEC-2). Till updates are stuck. I am on PC-BB4. — Amina Saleh, Branch B.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ipsec", "safqa", "vpn-safqa-ipsec-2", "pc-bb4", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "phone"
    }),
    ticket({
      title: "Keratin Glow VPN failed VPN-KER-SSL-1",
      description: "Keratin Glow cannot reach our booking system. The SSL tunnel VPN-KER-SSL-1 is down. I am on PC-REC2. — Hessa Fakhro, Reception.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ssl", "keratin", "vpn-ker-ssl-1", "pc-rec2", "escalate", "kb-escalate"],
      requesterId: "req-7",
      channel: "walk-in"
    }),
    ticket({
      title: "Enable Branch A remote VPN-BA-REMOTE-2",
      description: "Please enable the Branch A remote tunnel VPN-BA-REMOTE-2. Two people need to work from home tonight. I am on PC-BA2. — Rashid Nasser, Branch A.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "remote", "branch-a", "vpn-ba-remote-2", "pc-ba2", "escalate", "kb-escalate"],
      requesterId: "req-8",
      channel: "portal"
    }),
    ticket({
      title: "Test Branch B SSL tunnel VPN-BB-SSL-1",
      description: "Please send a test on Branch B SSL-1 (VPN-BB-SSL-1). I cannot do that myself. I am on PC-IT1. — Layla Mahmood, IT.",
      category: "Network",
      subcategory: "VPN",
      tags: ["vpn", "ssl", "branch-b", "vpn-bb-ssl-1", "pc-it1", "escalate", "kb-escalate"],
      requesterId: "req-5",
      channel: "portal"
    })
  ];
}

function generateClassTickets() {
  return [
    ticket({
      title: "Internet not working on PC-S1",
      description: "Hi, I cannot get on the internet from PC-S1. Pages will not open. I need this for client calls. — Fatima Al-Kuwari, Sales.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-s1", "kb-internet", "ipconfig"],
      requesterId: "req-1",
      channel: "portal"
    }),
    ticket({
      title: "Internet not working on PC-S2",
      description: "My browser on PC-S2 will not load anything. Can someone check it please? — Fatima Al-Kuwari, Sales.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-s2", "kb-internet", "ipconfig"],
      requesterId: "req-1",
      channel: "phone"
    }),
    ticket({
      title: "No internet on PC-F1",
      description: "PC-F1 has no internet. I cannot open payroll pages. — Omar Hassan, Finance.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-f1", "kb-internet", "ipconfig"],
      requesterId: "req-2",
      channel: "email"
    }),
    ticket({
      title: "PC-HR1 has no internet",
      description: "I am on PC-HR1 and there is no internet. New-hire forms will not open. — Noor Al-Mannai, HR.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-hr1", "kb-internet", "ipconfig"],
      requesterId: "req-3",
      channel: "chat"
    }),
    ticket({
      title: "Internet down on PC-OPS1",
      description: "PC-OPS1 cannot get on the internet. The shift board will not load. — Yusuf Ibrahim, Operations.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-ops1", "kb-internet", "ipconfig"],
      requesterId: "req-4",
      channel: "walk-in"
    }),
    ticket({
      title: "No internet on PC-BA1",
      description: "I am at Branch A on PC-BA1 and I have no internet. — Rashid Nasser, Branch A.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "pc-ba1", "kb-internet", "ipconfig"],
      requesterId: "req-8",
      channel: "phone"
    }),
    ticket({
      title: "Cannot print from PC-S4",
      description: "I am on PC-S4 and the Sales printer will not print. I have a quote to send. — Fatima Al-Kuwari, Sales.",
      category: "Printer",
      subcategory: "Print",
      tags: ["printer", "pc-s4", "prn-sales", "kb-printer", "ping"],
      requesterId: "req-1",
      channel: "email"
    }),
    ticket({
      title: "Cannot print from PC-F2",
      description: "PC-F2 will not print to the Finance printer. Payslips are waiting. — Omar Hassan, Finance.",
      category: "Printer",
      subcategory: "Print",
      tags: ["printer", "pc-f2", "prn-fin", "kb-printer", "ping"],
      requesterId: "req-2",
      channel: "portal"
    }),
    ticket({
      title: "HR printer not working from PC-HR2",
      description: "Nothing comes out of the HR printer from PC-HR2. — Noor Al-Mannai, HR.",
      category: "Printer",
      subcategory: "Print",
      tags: ["printer", "pc-hr2", "prn-hr", "kb-printer", "ping"],
      requesterId: "req-3",
      channel: "walk-in"
    }),
    ticket({
      title: "Cannot reach the cloud from PC-S5",
      description: "From PC-S5 I cannot reach our cloud systems. It sits and then fails. — Fatima Al-Kuwari, Sales.",
      category: "Cloud",
      subcategory: "Cloud",
      tags: ["cloud", "pc-s5", "kb-cloud", "tracert"],
      requesterId: "req-1",
      channel: "chat"
    }),
    ticket({
      title: "Cannot reach head office from PC-BA2",
      description: "I am on PC-BA2 at Branch A. Head office will not open. — Rashid Nasser, Branch A.",
      category: "Network",
      subcategory: "Branch",
      tags: ["branch", "pc-ba2", "kb-internet", "tracert"],
      requesterId: "req-8",
      channel: "phone"
    }),
    ticket({
      title: "PC-TR2 is frozen",
      description: "The training PC PC-TR2 is frozen. The screen does not move. Can you restart it? — Maryam Yusuf, Training.",
      category: "Hardware",
      subcategory: "PC",
      tags: ["pc-frozen", "pc-tr2", "kb-restart"],
      requesterId: "req-11",
      channel: "walk-in"
    }),
    ticket({
      title: "PC-WH2 will not respond",
      description: "PC-WH2 in the warehouse is stuck. Keyboard and mouse do nothing. — Khalid Al-Dosari, Warehouse.",
      category: "Hardware",
      subcategory: "PC",
      tags: ["pc-frozen", "pc-wh2", "kb-restart"],
      requesterId: "req-6",
      channel: "phone"
    }),
    ticket({
      title: "Company intranet will not open on PC-IT2",
      description: "I cannot open the company intranet on PC-IT2. We need intranet.procloud.local. — Layla Mahmood, IT.",
      category: "Cloud",
      subcategory: "Cloud",
      tags: ["cloud", "pc-it2", "intranet.procloud.local", "kb-cloud"],
      requesterId: "req-5",
      channel: "portal"
    }),
    ticket({
      title: "Cannot sign in to email from PC-OPS2",
      description: "I cannot sign in to email on PC-OPS2. It will not accept me. — Yusuf Ibrahim, Operations.",
      category: "Email",
      subcategory: "Mail",
      tags: ["email", "pc-ops2", "kb-email"],
      requesterId: "req-4",
      channel: "email"
    }),
    ticket({
      title: "Keratin Glow site will not open on PC-REC2",
      description: "I cannot open keratinglow.bh from the reception PC PC-REC2. A guest is waiting. — Hessa Fakhro, Reception.",
      category: "Software",
      subcategory: "Website",
      tags: ["website", "pc-rec2", "keratinglow.bh", "kb-website"],
      requesterId: "req-7",
      channel: "walk-in"
    }),
    ...generateCableTickets(),
    ticket({
      title: "I cannot open the shared folder",
      description: "I cannot open the shared folder from PC-BA3. The files we keep for the branch are gone. — Rashid Nasser, Branch A.",
      category: "Access & Identity",
      subcategory: "Share",
      tags: ["share", "pc-ba3", "kb-share"],
      requesterId: "req-8",
      channel: "portal"
    }),
    ticket({
      title: "Safqa will not open",
      description: "Safqa will not open on PC-BB3. I need the shop page for a customer. — Amina Saleh, Branch B.",
      category: "Software",
      subcategory: "Website",
      tags: ["website", "pc-bb3", "safqa.bh", "kb-website"],
      requesterId: "req-9",
      channel: "chat"
    }),
    ticket({
      title: "The printer light is on but I cannot reach it",
      description: "The printer light is on but I cannot reach it from PC-REC3. Visitors are waiting for badges. — Hessa Fakhro, Reception.",
      category: "Printer",
      subcategory: "Print",
      tags: ["printer", "pc-rec3", "prn-rec", "kb-printer", "ping"],
      requesterId: "req-7",
      channel: "walk-in"
    }),
    ticket({
      title: "No internet on PC-S1, PC-S2 and PC-S3",
      description: "Three of us in Sales have no internet — PC-S1, PC-S2 and PC-S3. The whole side of the floor is down. — Fatima Al-Kuwari, Sales.",
      category: "Network",
      subcategory: "Internet",
      tags: ["internet", "batch", "escalate", "kb-escalate"],
      requesterId: "req-1",
      channel: "phone"
    }),
    ticket({
      title: "All floors are slow — maybe the core",
      description: "Sales, Finance and HR are all slow. People say it might be the core or the edge router. I am writing from PC-F3. — Omar Hassan, Finance.",
      category: "Network",
      subcategory: "Core",
      tags: ["core", "pc-f3", "escalate", "kb-escalate"],
      requesterId: "req-2",
      channel: "monitoring"
    }),
    ticket({
      title: "Need a new user account and a new VLAN",
      description: "Please create a new staff account and put them on a new VLAN. We start Monday. Ask me if you need a CPR. — Noor Al-Mannai, HR.",
      category: "Access & Identity",
      subcategory: "Access request",
      tags: ["access", "vlan", "escalate", "kb-escalate"],
      requesterId: "req-3",
      channel: "portal"
    }),
    ticket({
      title: "Whole of Branch B cannot reach head office",
      description: "Every PC at Branch B failed this morning. I tried PC-BB1. Head office will not open for anyone here. — Amina Saleh, Branch B.",
      category: "Network",
      subcategory: "Branch",
      tags: ["branch", "pc-bb1", "batch", "escalate", "kb-escalate"],
      requesterId: "req-9",
      channel: "phone"
    }),
    ticket({
      title: "Strange files on PC-BC1 after a USB stick",
      description: "Someone plugged a USB into PC-BC1. Now there are strange files and pop-ups. Is the PC infected? — Hassan Jassim, Branch C.",
      category: "Security",
      subcategory: "Malware",
      tags: ["security", "pc-bc1", "escalate", "kb-escalate"],
      requesterId: "req-10",
      channel: "walk-in"
    }),
    ...generateChangeEscalateTickets(),
    ...generatePasswordTickets(),
    ticket({
      title: "Path to the cloud failed from PC-HR4",
      description: "From PC-HR4 the path to the cloud just dies. Our pages will not open. — Noor Al-Mannai, HR.",
      category: "Cloud",
      subcategory: "Cloud",
      tags: ["cloud", "pc-hr4", "kb-cloud", "tracert"],
      requesterId: "req-3",
      channel: "chat"
    }),
    ticket({
      title: "Cannot reach the cloud from PC-OPS4",
      description: "PC-OPS4 cannot reach the cloud. It sits and then fails. — Yusuf Ibrahim, Operations.",
      category: "Cloud",
      subcategory: "Cloud",
      tags: ["cloud", "pc-ops4", "kb-cloud", "tracert"],
      requesterId: "req-4",
      channel: "phone"
    }),
    ticket({
      title: "Path to head office failed from PC-WH3",
      description: "From the warehouse on PC-WH3 I cannot get a path to head office. — Khalid Al-Dosari, Warehouse.",
      category: "Network",
      subcategory: "WAN",
      tags: ["cloud", "pc-wh3", "kb-cloud", "tracert"],
      requesterId: "req-6",
      channel: "portal"
    }),
    ticket({
      title: "Training cannot reach the cloud from PC-TR3",
      description: "The training room PC-TR3 cannot reach the cloud. The path fails. — Maryam Yusuf, Training.",
      category: "Cloud",
      subcategory: "Cloud",
      tags: ["cloud", "pc-tr3", "kb-cloud", "tracert"],
      requesterId: "req-11",
      channel: "walk-in"
    }),
    ticket({
      title: "Path to Branch A failed from PC-IT2",
      description: "From PC-IT2 I cannot get a path to Branch A. It stops on the way. — Layla Mahmood, IT.",
      category: "Network",
      subcategory: "Branch",
      tags: ["branch", "pc-it2", "kb-internet", "tracert"],
      requesterId: "req-5",
      channel: "chat"
    }),
    ticket({
      title: "Branch C cannot reach head office from PC-BC2",
      description: "I am on PC-BC2 at Branch C. Head office will not open. The path fails. — Hassan Jassim, Branch C.",
      category: "Network",
      subcategory: "Branch",
      tags: ["branch", "pc-bc2", "kb-internet", "tracert"],
      requesterId: "req-10",
      channel: "phone"
    })
  ];
}

function sampleTickets() {
  return generateClassTickets();
}

const { kbArticles } = require("./seed-kb");

module.exports = {
  requesters,
  slaPolicy,
  sampleTickets,
  labPcs,
  kbArticles
};
