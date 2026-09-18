# CCST Ticketing

Classroom ticketing system for **Cisco Certified Support Technician IT Support** at **ProCloud Training Center**. It is built around Chapter 1 topics **1.1** (help desk concepts) and **1.2** (documentation of a customer interaction).

Trainer: Mr. Mohsen Salman

## Layout

| Folder | What it is |
| --- | --- |
| `frontend/` | **Primary UI** — classic classroom shell (live on Azure) |
| `web/` | React + TypeScript + Vite (kept for local work; not the live site root) |
| `backend/` | Express API, domain logic, deploy/upload scripts |

Docs PDFs/markdown/art are served from Azure Blob (not from these folders). Optional rebuild sources live under `backend/docs-assets/` for `npm run upload:static` only — the app runs without that folder.

## Run it

You need Node.js 18 or newer.

```bash
cd "CCST Ticketing system for students"
npm install
npm start
```

Open [http://localhost:3847](http://localhost:3847) (classic UI).

Optional React work (does not replace the live classic shell):

```bash
npm run web:dev
```

(proxies `/api` to `:3847`).

Sign in:

- Instructor: `instructor` / `ProCloud-G18` (default class **CCST IT Support G18**)
- Other instructors: use **Instructor signup** on the login page with the signup code you give them
- Students: accounts the instructor adds under **Class & students** (no shared class password)

**Class day:** use [`backend/docs-assets/docs-md/13-instructor-class-day.md`](backend/docs-assets/docs-md/13-instructor-class-day.md) — health, backup, login, generate workload, liveboard, export. Ops runbook: [`backend/docs-assets/docs-md/16-ops.md`](backend/docs-assets/docs-md/16-ops.md).

There is no pre-seeded ticket queue. Instructors create tickets for their class; each class only sees its own tickets — by hand from **Ticket queue → New ticket**, or in one click with the AI generator below.

Reset to an empty queue with the default instructor account:

```bash
npm run seed
npm start
```

## Deploy to Azure (production)

The live class runs on **Azure App Service** in Central India — one Node process serves the UI, the REST API, and talks to the database in the same region:

| Layer | Azure resource | Notes |
| --- | --- | --- |
| Frontend + backend | App Service `ccst-ticketing` (Linux, Node 22) | Express serves classic `frontend/` and `/api/*` |
| Database | Azure Database for PostgreSQL `ccst-ticketing-pg` (JSONB `documents`) | Blob `db.json` kept for backup / rollback — see `backend/docs-assets/docs-md/15-sql-storage.md` |
| URL | [https://ccst.website](https://ccst.website) | HTTPS enforced (`www` also bound); Azure default still works — see `backend/docs-assets/docs-md/14-custom-domain.md` |

Redeploy after code changes:

```bash
npm run deploy:azure
```

The script packages the project, sets `AZURE_BLOB_SAS_URL` and `SESSION_SECRET` on the web app if they are not already in your shell, and runs `az webapp deploy`. You need the Azure CLI logged in (`az login`) and Contributor access to resource group `ccst-ticketing`.

Optional app settings on the web app: `INSTRUCTOR_SIGNUP_CODE` (required for instructor self-signup), `BOOTSTRAP_INSTRUCTORS` (JSON array for first-run instructor accounts). See `backend/docs-assets/docs-md/08-configuration.md`.

## Where the data lives

Locally the whole database is one JSON file at `backend/var/db.json` (override the folder with `DATA_DIR`). Any hosted copy needs durable storage or **every save silently disappears**.

The app picks its store in this order:

| Condition | Store | Durable |
| --- | --- | --- |
| `DATABASE_URL` set (and not forced to JSON) | Azure Database for PostgreSQL (`documents` table) | yes |
| `AZURE_BLOB_SAS_URL` is set | one `db.json` in an Azure blob container | yes |
| Neither, running locally | `backend/var/db.json` | yes |
| Neither, running on a platform without disk (e.g. Workers without D1) | process memory | **no** |

Production prefers Postgres (`DATABASE_URL` + `PERSIST_BACKEND=sql`). Keep `AZURE_BLOB_SAS_URL` for `npm run backup:azure` and set `PERSIST_BACKEND=json` to roll back to the blob without removing the database.

Two things keep this honest. Saves that would write a byte-identical document are skipped, so reads cost nothing — this matters because several endpoints re-seed class state on every read and used to rewrite the entire database just to show the Lab map. And when the app ends up in the memory-only row, it says so: a warning in the server log and an orange banner across the top of every page, rather than letting a class discover it at the end of a session.

## Generating a class workload with AI

Add your students under **Class & students**, tick the issues you want in **Choose the issues**, then press **Generate**. Each student gets the same mix, assigned to them and left at no priority so they still have to assess each one.

The families are deliberately narrow — nine things a level-1 technician can finish with the tools the app gives them. Each has a checkbox and a count, so a lesson gets exactly the workload it needs:

| Default per student | Fault | Category | Where it is worked |
| --- | --- | --- | --- |
| 4 | Person is locked out and wants a reset | Access & Identity | Portals → Password |
| 2 | PC is not working — no network at all | Network | Lab map |
| 2 | One invoice needs posting or refunding | Software | Portals → CBS |
| 2 | Something physical is wrong with a PC | Hardware | Lab map → Hardware tab |
| 1 | A hosted VM cannot be reached | Cloud | Lab map |
| 1 | PC has given up waiting for an address | Network | Lab map — desk to `CLOUD-VM-DHCP` |
| 1 | Somebody typed the wrong settings into a PC | Network | Lab map |
| 1 | Nothing comes out of a shared printer | Hardware | Lab map → the printer's panel |
| 1 | A laptop will not get onto the wireless | Network | Lab map → laptop, then its access point |

Untick a family and it disappears from the class; raise its count and every student gets that many. Up to 12 of any one family and 40 tickets per student in total. The panel keeps a running count of the tickets and of how many cables and parts the run will break, so the size of the mess is visible before the button is pressed, and the choice is saved against the class the moment it is changed — the next generation run starts from the same settings.

Every subject is real data from that class: the person is one of the 200 rows in its Password portal, the invoice is one of the 100 in its CBS portal, and the PC or VM is a device on its Lab map. The caller on the ticket is either the person themselves or their own department's contact.

**Subjects are dealt one place at a time.** The pools are shuffled, then handed out round-robin across the twenty-one places on the map — twelve HQ departments and nine branches — so the first pass touches every site once before any site is asked for a second desk. That matters because the topology lists all of HQ before any branch: dealing straight down it gave Sales and Finance every fault while Branch F to Branch I went a whole term without one. Each student's own four or five desks now sit in different parts of the company, and no two students are handed the same PC until the class is bigger than the map. Which desk gets the loose cable and which gets the dead part is taken from alternate ends of the student's own hand, so branches get network faults and hardware faults in the same proportion HQ does.

**The Lab map tickets are planted for real.** The network and cloud ones unplug the cable on the PC or VM they name, so `ping` genuinely times out — "10.10.10.1 is in your subnet but nothing answered — check the cable, the port status and the VLAN" — until the student finds the loose cable and plugs it back in. One unplugged cable is the whole fault; nothing else about the device is touched.

The hardware ones break a part inside the PC instead — see [PC hardware](#pc-hardware) below. Either way the planted fault is recorded on the ticket so that re-generating undoes it, and it is stripped from the ticket for anyone who is not an instructor, since reading it out of the API would be the answer key.

The four newer families plant a fault in the **device's own state** rather than in the cabling or the case, and each one is the real thing rather than a flag: a DHCP ticket stops the service on `CLOUD-VM-DHCP`, fills its scope, or corrupts the router option it hands out, and leaves the desk on `169.254`; a misconfiguration ticket types a wrong subnet, a wrong mask, a gateway off the subnet, or a colleague's address into the PC; a printer ticket jams the printer, empties its tray or toner, takes it offline, or wedges its queue; a Wi-Fi ticket turns the laptop's radio off, puts the wrong key or the wrong network name into it, or shuts the radio on the access point that covers that room. Each records what it overwrote, so undoing it puts the device back exactly as it was, and each is judged by looking at the device — a printer ticket is not done until the panel is clear **and** the queue has drained.

**Reset to design** re-cables the map — except for cables named by lab-map tickets that are still open, which stay out. Re-cabling a fault the tickets still describe would quietly turn those tickets into a lie and leave nothing to find, so the reset re-plants them and says how many it left unplugged. It does not touch hardware; **Reset devices**, which wipes every saved config, re-breaks the parts named by hardware tickets that are still open for the same reason.

The CBS pair carries the escalation lesson: a shop asks for an invoice to be posted or refunded, the portal tells an L1 that billing rights are needed, and the student has to escalate rather than guess. Nothing in the ticket says so — that is the decision being marked.

Classroom AI writes the wording from built-in templates; the server decides the facts (person, invoice, device). That stops invented names like `PC-S9` or `INV-9999` that nobody can look up. Templates stay at L1 symptom level — no diagnosis, no portal instructions, no CPR/phone/password.

Pressing **Generate** twice skips students who already have generated tickets; tick **Replace tickets generated earlier** to hand out a fresh set instead.

**Remove all tickets** clears the whole class queue — generated tickets and any you wrote by hand — and plugs back in the cables that the removed lab-map tickets had unplugged, so the map goes back to matching an empty queue instead of keeping faults nothing describes any more. It is instructor-only and cannot be undone: comments, priorities and SLA history go with the tickets. Use it between classes, or when a bad generation run needs starting over from nothing.

## What students practise

- Queue management: priority, category, escalation, a visible SLA clock
- Ticket lifecycle: create, assess, assign, resolve, document
- KPIs: backlog, response, resolution, CSAT, first-contact resolution
- Tickets that match the **Lab map** company layout (PC-S1, CLOUD-VM-WEB, PRN-FIN, Branch A, ping / ipconfig / HTTP)
- Writing **Problem / Actions / Results** with root cause, decision log, tags — not "the printer failed"

## Working the queue

- **Sorting** — every column heading carries an up and a down arrow. Click one and the whole queue reorders on the server, not just the page you are looking at, so page 2 stays in the same order. The arrow in use is inked in teal; click it again to drop back to the default priority-first order. Blank cells go last on the way up: no priority yet, nobody assigned, not reviewed.
- **Past SLA** — the SLA drop-down filters to tickets already past an acknowledge or resolve deadline, or to ones still on track, or to ones waiting for a priority. The dashboard count of past SLA tickets opens that same filter.
- **Filters stay put** — the search box, the drop-downs, the sort and the page number travel in the address and are remembered for the tab. Open a ticket and come back, or leave for the lab map and click **Ticket queue** again, and the same slice of the queue is still there. **Reset filters** is the only thing that clears it.

## Lab map (browser)

**Lab map** in the sidebar is the network lab: a wiring and CLI sandbox for the G18 company layout, and the only one students need. There is no Packet Tracer tab — the browser lab replaced it.

- **Find a device** — type a name, an address or a department into the search box and the map zooms in, centres that box and flashes it. Every word has to match something on the device, so `PC-S1`, `10.10.20.10`, `finance`, `sales printer` and `branch d switch` all narrow the list, and each result shows where the device lives and what its address is. On a map this wide it is the difference between working a ticket and hunting for it.
- **Cabling** — click a port, then another port, to plug a cable. Click a cable to unplug it. Trunks with four or more parallel links collapse to one `×N` line; click to expand. **The kind of cable matters**: a desk device into a switch needs straight-through copper, a PC straight into a router needs a crossover, fiber will not go into an RJ45 desk port, and a console cable carries no data at all — pick the wrong one and the link is drawn but dead, exactly as it would be on a real floor. Switch and router ports are auto-MDIX, so copper and crossover both work between two of them.
- **Consoles** — click a **device** to open it. PCs, printers and VMs get a Windows-style command prompt; switches, routers and access points get a Cisco-style IOS console with user, privileged, global-config and interface modes.
- **Wireless** — six access points cover Reception, Operations, Warehouse, Training and two branches, with seven laptops joined to them over the air. Associations are drawn as dashed arcs with a signal reading, and they are worked out from distance and walls, so a laptop can hear a neighbouring department's access point in `wifi scan` and still not be able to use it. Clients have `wifi scan`, `wifi join <ssid> <key>`, `wifi on|off`, `wifi disconnect` and `wifi status`; the access point has `dot11 ssid|key|channel|enable|shutdown` and `show wireless`.
- **DHCP is a real service** on `CLOUD-VM-DHCP`, not a label. A laptop's request has to cross its own link, reach its department router as relay, reach the server across the WAN, and find the service running with addresses left — and it falls back to `169.254.x.x` when any of those fails. The service is stopped and started from the VM's own console (`dhcp status|start|stop|reset`), and the scope hands out option 003 and option 006 with the address.
- **Printers have front panels** — `status`, `clear`, `paper`, `toner`, `cancel`, `online`, `offline`, `restart`, and a queue that drains once the blockage is gone. `print PRN-FIN` from a user's PC is the test page. A jam does not answer to `restart`, which is the lesson.
- **Bad addressing is caught the way Windows catches it** — a duplicate address is refused and disables the adapter, an invalid mask is rejected, and a gateway outside the host's own subnet is called out in plain English.
- **Hardware** — a desk PC also has a **Hardware** tab next to its command prompt, listing the parts inside the case. See [PC hardware](#pc-hardware).
- **The wiring drives the CLI.** `ping` succeeds only if a real path exists: cable plugged at both ends, port not shut down, VLANs matching, addressing and default gateway correct. Failures explain which of those is wrong.
- **Switches are layer 2.** No switch ships with an address, so there is nothing on one to ping and no switch address to mistake for a desk. `Vlan1` sits there unassigned and shut, the way it does on a switch out of the box, and the `.1` gateway lives on the department router. A student who needs a management address for a lesson can still create one with `interface vlan 20` and `ip address`.
- **Zoom** with `+` / `−` or Ctrl+scroll. **Open full screen** puts the map in its own tab.
- **Reset to design** restores both the cabling and every device configuration for the class.

Commands worth teaching:

| PC / VM | Switch and router |
| --- | --- |
| `ipconfig /all`, `ping`, `tracert` | `enable`, `configure terminal` |
| `nslookup`, `arp -a`, `netstat` | `show ip interface brief`, `show vlan brief` |
| `ip <addr> <mask> [gw]`, `dns <addr>` | `show running-config`, `show ip route`, `show cdp neighbors` |
| `ipconfig /release`, `/renew`, `dhcp on/off` | `interface fa0/1`, `switchport access vlan 30`, `shutdown` |
| `wifi scan/join/status`, `print <printer>` | `show interfaces status`, `show wireless`, `dot11 ssid` |
| `help` | `ip address`, `hostname`, `ip route`, `write memory`, `?` |

Cisco abbreviations work (`conf t`, `int fa0/1`, `sh ip int br`, `no shut`).

The canvas is laid out in bands, and it is big — 247 devices and 239 cables. The Batelco backbone, Dubai telecom, and the Azure cloud sit along the top, `R1-EDGE` below them, then a row of **distribution routers**, then the access switches, then the desks. Reading left to right along the access row: the data centre, the **twelve HQ departments**, and **Branch A to Branch I** on the right. Each HQ department is its own column — a router, one or two switches under it, and its desks and printer below those — so the shape of the company is legible without reading a single label. The path **Hamala → Dubai → R-AZURE → SW-CLOUD → CLOUD-VM-*** is the giveaway that the cloud is hosted, not local. The map fits the pane on first open and remembers your zoom, and it zooms out far enough (10%) to hold the whole thing at once.

### PC hardware

Every desk PC on the map opens a **Hardware** service bench. Click the PC, then the **Hardware** tab. There is a **power** switch and a tool tray (screwdriver, hands, compressed air, spare parts). The case starts closed: turn power off, unscrew the side panel, then open it. Rear leads (display, keyboard, kettle lead) and the network port can be worked with the panel still on.

Repairs are modelled physically. Leads are dragged by hand: pull a plug out of its socket to unplug it, or drag it back until the socket lights up green to seat it, with the cable rubber-banding from its captive end as you go. Each lead has three states — seated, loose in the socket, or out — and a half-seated plug has to come right out before it will go home. Parts are held in by what really holds them: four mounting screws on the power supply, drive and fan, one bracket screw on the network card, clips on the memory. Replacing a part means unplugging its leads, undoing its screws, lifting the old one out, fitting the spare, screwing it back down and reconnecting it. The inspect panel shows that sequence as a checklist, the side panel refuses to go on while anything inside is loose, and the machine will not power up until it is whole — pull the drive and it stops booting.

Parts are **not** colour-coded. You troubleshoot from console symptoms, **inspect** a part to learn what was found, pick the matching tool, repair it, fit the panel, and power on again.

Faults are not labels on a screen. Each one declares what it takes away, and the simulator asks before it opens a console or answers a ping:

| Fault | What the student meets |
| --- | --- |
| Power cable unplugged, power supply failed | The PC will not power on. The command prompt is replaced by "This PC is not powered on" and it answers nothing on the network. |
| Memory not seated or failed, drive cable loose or drive failed | It powers on but never reaches the operating system, so there is still no prompt and still no ping. |
| Display cable loose | The PC is running and the network works, but the monitor shows no signal, so the student cannot work at that machine. |
| Keyboard unplugged | The desktop is on screen and nothing typed arrives. |
| Network adapter disabled or network card failed | The prompt works normally, `ipconfig` shows `Media disconnected` instead of an address, and nothing can reach it. |
| CPU fan clogged | Everything works, with an overheating warning on the console and the panel. |

The "no power" and "no boot" faults deliberately take the command prompt away, because a student who can still type `ipconfig` on a machine that is physically dead learns the wrong lesson. The way out is the Hardware tab, not the console.

Repairs are immediate and reversible in the sense that matters: fix the part and the same PC answers `ping` on the next command, which is how the student proves the ticket is done. The repair is also echoed into the console log, so there is a record to write up.

Hardware tickets never name the part. The user reports only what they can see, hear and touch — "completely dead, no lights, no fans" — and a model draft that mentions a power supply, memory, a drive, a card or a fan is thrown away for a written template instead, because the ticket would otherwise contain its own answer. The tags are neutral for the same reason, and the recorded fault is hidden from everyone who is not an instructor.

### Inside HQ: a router per department

Every HQ department sits behind its own **distribution router** (`RD-SALES`, `RD-FIN`, `RD-HR`, … thirteen of them counting the data centre), and the department's gateway lives on that router rather than on the edge. `R1-EDGE` carries nothing but a `/30` transit link down to each department out of `10.10.254.0/24`, plus the one circuit out to Batelco:

| | |
| --- | --- |
| `R1-EDGE` Fa0/2 `10.10.254.5` | ↔ `RD-SALES` Gi0/0 `10.10.254.6`, whose Gi0/1 is `10.10.10.1` — Sales' gateway |
| `R1-EDGE` Gi0/2 `203.0.113.34` | ↔ `BAT-SEEF` Gi0/2 `203.0.113.33` |

So Sales talking to Finance is already three routers, and the edge holds one route per department. It is two tiers on purpose: a student who deletes a route on `RD-SALES` takes out Sales and nothing else, which is a much sharper lesson than one flat router where every mistake is total.

Six of the twelve departments are large enough to need a second access switch (`SW-SALES` and `SW-SALES-2`, and the same for Finance, Operations, Warehouse, IT and Support). Both switches carry the same VLAN and are joined by a crossover trunk, and only the first one has an uplink to the department router — so the trunk is load-bearing and worth breaking as an exercise. Unplug it, shut the port, or set either end back to `switchport mode access`, and the second half of the department loses its neighbours *and* its default gateway while its own switch keeps working: the classic "half the floor is off" call.

### The Batelco WAN

Branches are not switchports on the HQ router. Every site buys a circuit from **Batelco**, whose network is modelled in three tiers: the main branch in **Hamala**, six area exchanges, and ten customer sites hanging off them. HQ has an exchange to itself; each of the other five carries one or two branches, so an exchange failure takes down a district rather than one office.

| Site | Area exchange | Handoff |
| --- | --- | --- |
| HQ | `BAT-SEEF` (Seef) | `203.0.113.33` ↔ `R1-EDGE` Gi0/2 `203.0.113.34` |
| Branch A | `BAT-MUHARRAQ` (Muharraq) | `203.0.113.37` ↔ `R2-BRA` Gi0/1 `203.0.113.38` |
| Branch B | `BAT-MUHARRAQ` | `203.0.113.41` ↔ `R3-BRB` Gi0/1 `203.0.113.42` |
| Branch C | `BAT-RIFFA` (Riffa) | `203.0.113.45` ↔ `R4-BRC` Gi0/1 `203.0.113.46` |
| Branch D | `BAT-RIFFA` | `203.0.113.49` ↔ `R5-BRD` Gi0/1 `203.0.113.50` |
| Branch E | `BAT-ISA-TOWN` (Isa Town) | `203.0.113.53` ↔ `R6-BRE` Gi0/1 `203.0.113.54` |
| Branch F | `BAT-ISA-TOWN` | `203.0.113.57` ↔ `R7-BRF` Gi0/1 `203.0.113.58` |
| Branch G | `BAT-HIDD` (Hidd) | `203.0.113.61` ↔ `R8-BRG` Gi0/1 `203.0.113.62` |
| Branch H | `BAT-HIDD` | `203.0.113.65` ↔ `R9-BRH` Gi0/1 `203.0.113.66` |
| Branch I | `BAT-SITRA` (Sitra) | `203.0.113.69` ↔ `R10-BRI` Gi0/1 `203.0.113.70` |

The backbone legs up to Hamala are the low `/30`s of the same range, one per exchange: Seef `203.0.113.2` ↔ `.1`, Muharraq `.6` ↔ `.5`, Riffa `.10` ↔ `.9`, Isa Town `.14` ↔ `.13`, Hidd `.18` ↔ `.17`, Sitra `.22` ↔ `.21`. Branch LANs run `10.20.10.0/24` for Branch A up through `10.100.10.0/24` for Branch I.

The internet (`Cloud-ISP`, `203.0.113.130` on Gi0/0) hangs off Hamala. The **Azure cloud** is one hop further east: Hamala peers with **Dubai telecom** (`BAT-DUBAI`), Dubai peers with the **Azure cloud router** (`R-AZURE`), and that router fronts `SW-CLOUD` and the `CLOUD-VM-*` hosts. VLAN70's gateway `10.10.70.1` lives on `R-AZURE` Gi0/2. Reaching a cloud VM from HQ is a trip out through the provider, exactly like reaching one in real Azure:

```
C:\>tracert 10.10.70.20
  1  10.10.10.1      RD-SALES, the department router
  2  10.10.254.5     R1-EDGE, across the transit link
  3  203.0.113.33    BAT-SEEF, the exchange serving HQ
  4  203.0.113.1     BAT-HAMALA, Batelco core
  5  203.0.113.26    BAT-DUBAI, Dubai telecom
  6  203.0.113.30    R-AZURE, Azure cloud router
  7  10.10.70.20     the Azure cloud VM
```

That makes the cloud independent of HQ, which is the useful part: cut HQ's handoff and HQ loses the cloud *and* the branches, but the branches keep the cloud, because their path never touched HQ.

Routing is deliberately layered. A desk's gateway is its department router, which holds nothing but a default route up to `R1-EDGE`. The edge holds one route per department and a default out to its exchange. Each area exchange knows only the prefixes of the sites it serves and defaults up to Hamala. Hamala holds every customer prefix plus a route to VLAN70 via Dubai; Dubai forwards Azure prefixes to `R-AZURE`. Note that HQ is routed as its real /24s rather than as a tidy `10.10.0.0/16`: the Azure cloud is numbered inside that range but lives past Dubai, so a /16 pointed at HQ would swallow VLAN70 and bounce it between `BAT-SEEF` and `R1-EDGE`. The provider routes exactly the subnets each site fronts, and the list is derived from the topology, so adding a department VLAN adds its route automatically.

Nothing in the design lets two sites talk directly, so **every** inter-site packet climbs to Hamala and comes back down, and `tracert` from Branch A to a Reception desk prints six routers:

```
  1    <1 ms  10.20.10.1      R2-BRA, the branch router
  2    <1 ms  203.0.113.37    BAT-MUHARRAQ, its area exchange
  3    <1 ms  203.0.113.5     BAT-HAMALA, the main branch
  4    <1 ms  203.0.113.2     BAT-SEEF, the exchange serving HQ
  5    <1 ms  203.0.113.34    R1-EDGE, the HQ edge
  6    <1 ms  10.10.254.30    RD-REC, Reception's own router
  7    <1 ms  10.10.40.10     the PC
```

Because forwarding is genuinely hop-by-hop across six routers, WAN faults behave like the real thing and are worth staging as tickets:

- Shut `BAT-MUHARRAQ` Gi0/1 or unplug that backbone leg and **both** Branch A and Branch B lose HQ, the other branches *and* the internet, while their own LANs and their shared exchange stay reachable — the "our line is down but the office works" call, and a district-wide one.
- Unplug the HQ handoff and HQ loses all nine branches, but the branches keep reaching each other, because their path never touched HQ.
- Unplug one department's transit link and that department alone goes dark; the other eleven are untouched. Same fault one hop up, at `R1-EDGE`, and all twelve go.
- Delete a site's default route and you get `no route` at the first hop.
- Delete only Hamala's route *back* to one branch and the ping arrives but the reply cannot get home, which the simulator reports as `received the ping but cannot reply` — asymmetric routing, the hardest of the set to spot.
- Shut Hamala Gi0/0 and every site loses the internet while inter-site traffic is untouched.
- Unplug `SW-CLOUD` Gi0/2 and the cloud VMs still talk to each other but nobody can reach them. Because `CLOUD-VM-DNS` lives there, ping-by-name breaks everywhere while ping-by-IP still works within each site — the widest-blast-radius fault in the lab.

### Public addresses and NAT

Hover any box on the map that holds a private address and it names the address the internet would see it as — `Public 203.0.113.34 — PAT via R1-EDGE` under `10.10.20.10`. That line is not a label typed into the topology; it is read out of the routers' live `ip nat` configuration, so it changes when a student changes the config.

Two translation styles, on purpose, because the contrast is the lesson:

| Where | Style | Result |
| --- | --- | --- |
| HQ and the nine branches | PAT (`overload`) on the WAN interface | The whole site shares one address: HQ is `203.0.113.34`, then Branch A `.38` through Branch I `.70` in steps of four |
| Hosted cloud, on the Batelco core | Static 1:1 from `203.0.113.160/27` | Each VM is published individually — `CLOUD-VM-WEB` is `203.0.113.163` |

The provider's own routers report nothing to translate, because their addresses are already public. Each site's ACL denies the other private sites before permitting the rest, which is the usual NAT exemption: HQ talking to Branch B keeps its real `10.x` address, and only internet-bound traffic is translated.

A desk in Sales is two routers away from the one that translates it, and it still reports `203.0.113.34`, because "inside" is worked out by following the edge router's own routing table rather than by looking only at what is directly attached. Delete `RD-SALES`'s route on `R1-EDGE` and Sales stops being inside — every Sales box then reads "no NAT rule covers this address", which is a surprisingly good way to show what a NAT inside interface actually means.

The loop is closed in the console, so the map's claim is checkable. Ping something public from a PC and the translation shows up on the router that made it:

```
C:\>ping 203.0.113.130          (from PC-F1, 10.10.20.10)

R1-EDGE#show ip nat translations
Pro  Inside global        Inside local         Outside local        Outside global
icmp 203.0.113.34:1      10.10.20.10:1        203.0.113.130:1      203.0.113.130:1
```

`show ip nat statistics` lists the inside and outside interfaces, and the rules are editable: `ip nat inside source list 101 interface Gi0/2 overload`, `ip nat inside source static <local> <global>`, `access-list`, and `ip nat inside`/`ip nat outside` per interface. Removing HQ's overload rule strips the public address off every HQ box on the map, which makes for a neat "why did our internet stop" ticket. Note that reachability itself is still modelled on the private addressing — NAT here is real configuration and real display, not a rewriting packet engine.

**DNS** is simulated too. Customer sites (`keratinglow.bh`, `safqa.bh`), ProCloud services (`www.procloud.bh`, `mail.procloud.bh`, `vas.procloud.bh`) and internal names (`crm.procloud.local`, `ad.procloud.local`, any `<device>.procloud.local`) all resolve. Run `nslookup` with no arguments to list them. Name lookups go through the PC's configured DNS server, so unplugging `CLOUD-VM-DNS` breaks ping-by-name while ping-by-IP keeps working — the classic call students need to diagnose.

## Documentation set (Topic 1.2 types)

Also available inside the app under **Documentation** — one PDF per guide.

| PDF | Type |
| --- | --- |
| `01-system.pdf` | System |
| `02-infrastructure.pdf` | Infrastructure |
| `03-process.pdf` | Process |
| `04-incident-response.pdf` | Incident response |
| `05-user-guide.pdf` | User |
| `06-compliance.pdf` | Compliance |
| `07-knowledge-base.pdf` | Knowledge base |
| `08-configuration.pdf` | Configuration |
| `09-sla-kpis.pdf` | SLA / SLO / KPI |
| `10-accounts.pdf` | Classroom logins |
| `11-simple-fixes.pdf` | Simple fixes (read with the ticket) |
| `12-class-lab.pdf` | One class lab + desk assignments |

Trainer-only notes (not listed in the app): `backend/docs-assets/docs-md/14-custom-domain.md`, `backend/docs-assets/docs-md/15-sql-storage.md`, `backend/docs-assets/docs-md/16-ops.md`.

## Privacy

Student **names** are used for accounts. National ID (CPR) numbers and phone numbers from the attendance sheet are **not** stored anywhere in this project.
