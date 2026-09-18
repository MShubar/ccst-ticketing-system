/**
 * Classroom knowledge-base articles shipped with a fresh database.
 */
const kbArticles = [
  {
    slug: "first-checks",
    title: "Read this first — every ticket",
    category: "Network",
    tags: ["kb-internet", "kb-pc", "ipconfig", "tracert"],
    summary: "Do these steps on the PC named in the ticket: ipconfig, ping, then tracert.",
    content: `## What you need
Open **Lab map** in the sidebar. Everything happens in the browser — there is nothing to install.

## Find the device
Type the name from the ticket into **Find a device** at the top left. The map jumps to it and flashes it. The box also takes an address (\`10.10.20.10\`), a department (\`Finance\`), or both (\`sales printer\`), so you can find the desk even when the ticket only says where the caller sits.

## Steps
1. Click that PC. Its \`C:\\>\` command prompt opens.
2. Type \`ipconfig\` and press Enter. Do **not** type any numbers after it.
3. Write down the IP Address and Default Gateway you see.
4. \`ping\` that gateway (the \`.1\` in that department).
5. Then **traceroute**. Type \`tracert\` then a space then the far address. Example: \`tracert 10.10.70.20\`. This lab uses \`tracert\`, not \`traceroute\`.
6. Write hop 1 on the ticket. If hop 1 is wrong, the gateway on the PC is wrong.

## What "good" looks like
You see an address like 10.10.10.11 and a gateway like 10.10.10.1. If you see 0.0.0.0, or an address that is not on the cheat sheet (for example 192.168.50.x or 10.10.99.x), the PC is wrong. Hop 1 of \`tracert\` should be your **department's own router** — every department has one.

## Then
Use only what you have been taught: \`ipconfig\`, \`ping\`, \`tracert\`, \`nslookup\`, setting an address, plugging a cable back in, the **Hardware** tab on a desk PC, and **Portals** for a password reset. Type \`help\` at any prompt for the full list. Anything bigger — **Escalate**.

If more than one desk is down, or the address is already correct and it still fails, or the user offers a CPR or a real password, **Escalate**. Do not guess.`
  },
  {
    slug: "internet-not-working",
    title: "Internet not working",
    category: "Network",
    tags: ["kb-internet", "internet"],
    summary: "User cannot reach anything. Check the cable on the map, then the address, then the gateway.",
    content: `## What the user said
Internet not working.

## Steps
1. Follow **Read this first — every ticket**.
2. Look at the PC on the map. If **no cable is drawn** from it to its switch, that is the fault — see **The cable fell out**.
3. In the PC's prompt, \`ping\` the Default Gateway that \`ipconfig\` showed. Example: \`ping 10.10.10.1\`
4. If \`ipconfig\` showed nothing, \`0.0.0.0\`, or an address that is not on the **Address cheat sheet**, set the right one. Two commands, on the PC:

\`\`\`
ip 10.10.10.11 255.255.255.0 10.10.10.1
dns 10.10.70.11
\`\`\`

5. Run \`ipconfig\` again to confirm it took, then \`ping\` the gateway.
6. Then \`tracert 10.10.70.20\`. Hop 1 must be that department's own router. If it is not, the gateway on the PC is wrong.
7. Last, \`ping procloud.bh\`. A name proves the address, the path and DNS in one command.

## Done when
The gateway replies, \`tracert\` gets out of the department, and a name still pings.

## If you are stuck
Ask the trainer. Do not guess extra commands.`
  },
  {
    slug: "slow-internet",
    title: "Slow internet",
    category: "Network",
    tags: ["kb-slow", "slow-internet"],
    summary: "This lab has no speed to measure. Prove the path with ping and tracert, then read it as another fault.",
    content: `## What the user said
Slow internet.

## Steps
1. Follow **Read this first — every ticket**.
2. Ping the gateway. Four replies is normal.
3. \`tracert 10.10.70.20\`. Write hop 1 on the ticket. If hop 1 is wrong, fix the gateway.
4. \`ping 10.10.70.20\`, then \`ping procloud.bh\` for the same server by name.
5. If the address answers but the name does not, it is DNS, not speed — go to **Website not working**.
6. Check the rest of the department. If one desk is slow and its neighbours are fine, look at that PC's own address and its **Hardware** tab.

## Done when
The gateway, the far address and the name all answer, and you wrote the hop list on the ticket.

## Note
This lab does not model speed. Every path either works or it does not, so a "slow" call is really one of the other articles. If ping fails, treat it as **Internet not working**. On a laptop, check \`wifi status\` as well — a weak signal is a real reading here, and "slow" from someone sitting at the far end of the warehouse is usually coverage.`
  },
  {
    slug: "pc-not-working",
    title: "PC not working",
    category: "Hardware",
    tags: ["kb-pc", "pc-not-working"],
    summary: "No network on the PC. Read ipconfig first — it says whether this is the cable, the address, or the path.",
    content: `## What the user said
PC not working / no network.

## Steps
1. Find the PC with **Find a device** and click it. Its \`C:\\>\` prompt opens.
2. \`ipconfig\`. Three things it can tell you:
   - **Media disconnected** — no link. Either no cable is drawn on the map (**The cable fell out**) or the network card is disabled, which the **Hardware** tab shows in red.
   - **0.0.0.0** or an address that is not on the **Address cheat sheet** — wrong addressing, step 3.
   - The right address — then it is the path, not the PC: \`ping\` the gateway and \`tracert\` out.
3. Set the cheat-sheet address for that department. On the PC:

\`\`\`
ip 10.10.20.11 255.255.255.0 10.10.20.1
dns 10.10.70.11
\`\`\`

4. \`ipconfig\` again. You should see the new address.
5. \`ping\` the gateway.

## Done when
ipconfig shows an address from the cheat sheet and the gateway replies.

## If the PC has no prompt at all
A machine with no power or one that never boots cannot be typed into, and the window says so instead of giving you a cursor. That is a part inside the case — go to **PC is frozen or will not respond** and open the **Hardware** tab.`
  },
  {
    slug: "printer-not-working",
    title: "Printer not working",
    category: "Printer",
    tags: ["kb-printer", "printer"],
    summary: "Ping the printer first. If it answers, the network is fine and the fault is on the printer's own panel.",
    content: `## What the user said
Printer not working. Or: nothing comes out. Or: the printer light is on but I cannot reach it.

## Steps
1. Follow **Read this first — every ticket** on the user's PC.
2. Every department and every branch has exactly one printer, always \`.50\` on that subnet. Search the map for the department and the word printer — \`finance printer\` finds \`PRN-FIN\`.
3. From the user's PC, \`ping\` that printer address. Example: \`ping 10.10.20.50\`. **This one command splits the ticket in two.**
4. **The printer answers** — the network is not your problem, so stop testing it. Click the printer and run \`status\`. The panel tells you what it is complaining about:
   - \`PAPER JAM\` / \`LOAD PAPER\` / \`REPLACE TONER\` → open the **Hardware** tab and fix it by hand (cover, tray, or cartridge). The console cannot clear those.
   - \`OFFLINE\` → \`online\`
   - a queue that is not moving with nothing else wrong → \`cancel\`, then send a page again

   Anything held in the queue prints as soon as the blockage is gone. \`restart\` does **not** clear a jam or fill a tray — it is not that kind of fault.
5. **The printer does not answer** — now it is the network, and it is the same three checks as a PC. Click the printer and run \`ipconfig\`:
   - \`Media disconnected\` → no cable on the map, or the wrong kind of cable. A printer goes to \`Fa0/24\` on its own switch with a **straight-through** copper lead. See **The cable fell out**.
   - wrong or missing address → set the cheat-sheet one on the printer:

\`\`\`
ip 10.10.20.50 255.255.255.0 10.10.20.1
\`\`\`

6. Send a test page from the user's desk: \`print PRN-FIN\`.

## Done when
\`print\` from the user's own PC says the page printed, and \`status\` on the printer is \`Ready\` with an empty queue.

## Addresses
Printer \`.50\` on the department subnet: Sales 10.10.10.50 · Marketing 10.10.15.50 · Finance 10.10.20.50 · Legal 10.10.25.50 · HR 10.10.30.50 · Procurement 10.10.35.50 · Reception 10.10.40.50 · Operations 10.10.45.50 · Warehouse 10.10.50.50 · Training 10.10.55.50 · IT 10.10.80.50 · Support 10.10.85.50. Branches follow the same rule — Branch A 10.20.10.50 through Branch I 10.100.10.50.`
  },
  {
    slug: "website-not-working",
    title: "Website not working",
    category: "Software",
    tags: ["kb-website", "website", "keratinglow.bh", "safqa.bh"],
    summary: "Ping the address first, then the name. If only the name fails, it is DNS.",
    content: `## What the user said
Website not working. Or: Safqa will not open. Or: Keratin Glow will not open.

## The test in this lab
There is no browser window on a lab PC. You prove a site two ways from the PC's prompt: \`ping\` its **address**, then \`ping\` its **name**. Address works and name fails means DNS. Both fail means the path to that server.

## Steps
1. Follow **Read this first — every ticket**.
2. Match the site on the ticket:

| Site | Name to ping | Address to ping |
| --- | --- | --- |
| Keratin Glow | keratinglow.bh | 10.10.70.25 |
| Safqa | safqa.bh | 10.10.70.26 |
| ProCloud public site | www.procloud.bh | 10.10.70.20 |
| Company intranet | intranet.procloud.local | 10.10.60.20 |
| CRM | crm.procloud.local | 10.10.60.10 |

3. \`ping\` the address, then \`ping\` the name.
4. If only the name failed, run \`nslookup\` on it and read what came back:

| nslookup said | What it means | What to do |
| --- | --- | --- |
| No DNS server is configured on this PC | The PC was never told where to ask | \`dns 10.10.70.11\` |
| The DNS server is not answering | The name server itself is cut off | Find \`CLOUD-VM-DNS\` on the map and plug its cable back in |
| Non-existent domain | That name was never published | Check your spelling against the table above |

5. If the address failed too, this is not a website fault. Work it as **Cloud cannot be reached** or **Server cannot be reached**.

Run \`nslookup\` with no name after it to list every name this lab publishes.

## Done when
Both \`ping <name>\` and \`ping <address>\` reply, and you wrote which of the two was broken on the ticket.`
  },
  {
    slug: "email-not-working",
    title: "Email not working",
    category: "Email",
    tags: ["kb-email", "email"],
    summary: "Ping the mail server by address and by name. A sign-in problem is a password reset, not a network one.",
    content: `## What the user said
Email not working, or cannot sign in to email.

## Split the two first
"Mail will not load" is a network question — ping the mail server. "It will not accept my password" is **Reset password** in Portals and has nothing to do with the map.

## Steps
1. Follow **Read this first — every ticket**.
2. \`ping 10.10.70.22\`, then \`ping mail.procloud.bh\` — hosted mail, by address and by name.
3. If the name fails but the address answers, it is DNS: \`dns 10.10.70.11\`, then check \`CLOUD-VM-DNS\` has a cable on the map.
4. If both fail, look at \`CLOUD-VM-MAIL\` on the map. No cable drawn from it means the cable is out — plug it back in.
5. If the ticket says **on-prem** mail instead, the server is \`VM-MAIL\` in the data centre: \`ping 10.10.60.22\` or \`ping mail.procloud.local\`.
6. If it turns out to be the password, open **Portals → Password** and follow **Reset password**. Never ask for a real password or a CPR.

## Done when
The mail server answers by address and by name, or you handed the sign-in half to the password portal — and you wrote which it was.`
  },
  {
    slug: "share-folder",
    title: "Share folder cannot be accessed",
    category: "Access & Identity",
    tags: ["kb-share", "share", "ftp"],
    summary: "The shared folder in this lab is a file server. Ping it by address and by name.",
    content: `## What the user said
I cannot open the shared folder. Or: share folder cannot be accessed.

## Steps
1. Follow **Read this first — every ticket**.
2. Work out which share the ticket means:
   - Hosted files — \`CLOUD-VM-FILE\`, \`10.10.70.3\`, names \`files.procloud.bh\` and \`ftp.procloud.bh\`
   - Office files — \`VM-FS\` in the data centre, \`10.10.60.3\`, name \`fs.procloud.local\`
3. \`ping\` the address, then \`ping\` the name.
4. Name fails but the address answers: set \`dns 10.10.70.11\`, then check the cable on \`CLOUD-VM-DNS\`.
5. Both fail: find that file server on the map. No cable drawn from it means the cable is out — plug it back in and ping again.

## There are no folders to browse
This lab has no share permissions to set. Reaching the file server's address is the whole test at L1, so a genuine permissions complaint is an **Escalate**.

## Done when
The file server answers from the user's own PC by address and by name.`
  },
  {
    slug: "cloud-cannot-reach",
    title: "Cloud cannot be reached",
    category: "Cloud",
    tags: ["kb-cloud", "cloud"],
    summary: "Cloud VMs hang off SW-CLOUD behind R-AZURE and Dubai. Ping one that works, then the one on the ticket.",
    content: `## What the user said
Cloud cannot be reached. Or: one hosted service will not load while everything else on the PC is fine.

## Steps
1. Follow **Read this first — every ticket**.
2. Search the map for the VM named on the ticket. The hosted block is the row on \`SW-CLOUD\`, addresses \`10.10.70.x\`.
3. From the user's PC, ping a **different** cloud VM first — \`ping 10.10.70.11\` (DNS). If that answers, the path to the cloud is fine and the fault is on the one machine.
4. Now \`ping\` the VM on the ticket, by address and by name (\`vas.procloud.bh\`, \`backup.procloud.bh\`, \`monitor.procloud.bh\`, \`vdi.procloud.bh\`, \`files.procloud.bh\`).
5. Look at that VM on the map. If no cable is drawn to \`SW-CLOUD\`, that is the fault — plug its \`Fa0\` into a free \`SW-CLOUD\` port and ping again.
6. If *every* cloud VM is unreachable, the fault is upstream, not on a desk. Write what you pinged and **Escalate**.

## Done when
The VM on the ticket answers from the user's own PC, and the other cloud VMs still do too.

## Remember
These VMs stand in for a real hosted platform. Reachability is what the lab models — there is no service to switch on inside a VM.`
  },
  {
    slug: "server-cannot-reach",
    title: "Server cannot be reached",
    category: "Software",
    tags: ["kb-server", "server"],
    summary: "Office servers sit in the data centre. Ping the server by address, then by name.",
    content: `## What the user said
Server cannot be reached.

## Steps
1. Follow **Read this first — every ticket**.
2. Find the data centre block on the map: \`SW-VIRT\` behind \`RD-DC\`, addresses \`10.10.60.x\`. Search for the VM name from the ticket.
3. From the user's PC, \`ping\` the server on the ticket:

| Server | Address | Name |
| --- | --- | --- |
| CRM database | 10.10.60.10 | crm.procloud.local |
| CBS billing database | 10.10.60.11 | cbs.procloud.local |
| Company intranet | 10.10.60.20 | intranet.procloud.local |
| Office file server | 10.10.60.3 | fs.procloud.local |
| On-prem mail | 10.10.60.22 | mail.procloud.local |
| Domain controller | 10.10.60.2 | dc01.procloud.local |

4. Also \`ping 10.10.60.1\`, the data centre gateway on \`RD-DC\`.
  - It fails while the user's own gateway answers: the path into the data centre is down, not the server. **Escalate** with your \`tracert\`.
5. If only one server fails, look at it on the map. No cable drawn to \`SW-VIRT\` means the cable is out — plug it back in.
6. If the name fails but the address answers, set \`dns 10.10.70.11\` on the PC, then check \`CLOUD-VM-DNS\`.

## Done when
The named server answers from the user's own PC, by address and by name.

## Do not
Configure the VM or the data centre switch. Anything past a loose cable at this end is an **Escalate**.`
  },
  {
    slug: "how-to-ip",
    title: "How to check your IP",
    category: "Access & Identity",
    tags: ["kb-ip", "ipconfig", "how-to"],
    summary: "Type ipconfig alone. Never put an address after it.",
    content: `## What the user said
How do I check my IP?

## Steps
1. Open **Lab map** and find the PC with **Find a device**.
2. Click the PC. Its \`C:\\>\` prompt opens in a window.
3. Type \`ipconfig\`
4. Press Enter.
5. Read **IPv4 Address**, **Subnet Mask** and **Default Gateway**. For the DNS server as well, use \`ipconfig /all\`.

## Wrong
\`ipconfig 10.10.10.11\` does nothing useful — \`ipconfig\` only reports. To **set** an address the lab has its own shortcut: \`ip <address> <mask> [gateway]\`, plus \`dns <address>\`. Type \`help\` for the whole list.

## Done when
You can read the PC's address, mask, gateway and DNS off the screen and compare them with the **Address cheat sheet**.`
  },
  {
    slug: "address-cheat-sheet",
    title: "Address cheat sheet",
    category: "Network",
    tags: ["cheat-sheet", "ipconfig"],
    summary: "Copy these onto the PC if the address is empty. DNS is always 10.10.70.11.",
    content: `## DNS for every PC
\`10.10.70.11\`

Every department is its own subnet. Desks count up from \`.10\`, the printer is always \`.50\`, and the gateway \`.1\` lives on that department's own router.

Switches have no address at all, so there is nothing on one to ping. A switch moves frames between the desks plugged into it; the \`.1\` you ping belongs to the router above it.

## HQ departments
| Department | Desks | Gateway | Printer |
| --- | --- | --- | --- |
| Sales | PC-S1–S8 10.10.10.10–17 | 10.10.10.1 (RD-SALES) | 10.10.10.50 |
| Marketing | PC-MK1–MK4 10.10.15.10–13 | 10.10.15.1 (RD-MKT) | 10.10.15.50 |
| Finance | PC-F1–F8 10.10.20.10–17 | 10.10.20.1 (RD-FIN) | 10.10.20.50 |
| Legal | PC-LG1–LG4 10.10.25.10–13 | 10.10.25.1 (RD-LEGAL) | 10.10.25.50 |
| HR | PC-HR1–HR5 10.10.30.10–14 | 10.10.30.1 (RD-HR) | 10.10.30.50 |
| Procurement | PC-PR1–PR4 10.10.35.10–13 | 10.10.35.1 (RD-PROC) | 10.10.35.50 |
| Reception | PC-REC1–REC4 10.10.40.10–13 | 10.10.40.1 (RD-REC) | 10.10.40.50 |
| Operations | PC-OPS1–OPS8 10.10.45.10–17 | 10.10.45.1 (RD-OPS) | 10.10.45.50 |
| Warehouse | PC-WH1–WH8 10.10.50.10–17 | 10.10.50.1 (RD-WH) | 10.10.50.50 |
| Training | PC-TR1–TR6 10.10.55.10–15 | 10.10.55.1 (RD-TRAIN) | 10.10.55.50 |
| IT | PC-IT1–IT8 10.10.80.10–17 | 10.10.80.1 (RD-IT) | 10.10.80.50 |
| Support | PC-SUP1–SUP10 10.10.85.10–19 | 10.10.85.1 (RD-SUP) | 10.10.85.50 |

## Branches
Same shape at every branch: five desks from \`.10\`, printer on \`.50\`, gateway \`.1\` on the branch router.

Branch A 10.20.10.x · B 10.30.10.x · C 10.40.10.x · D 10.50.10.x · E 10.60.10.x · F 10.70.10.x · G 10.80.10.x · H 10.90.10.x · I 10.100.10.x

## Servers
Data centre (VLAN 60, gateway 10.10.60.1 on RD-DC) — VM-SQL-CRM 10.10.60.10 · VM-SQL-FIN 10.10.60.11 · VM-WEB 10.10.60.20 · VM-FS 10.10.60.3 · VM-MAIL 10.10.60.22

Hosted cloud (VLAN 70, gateway 10.10.70.1 on R-AZURE via Dubai) — CLOUD-VM-DNS 10.10.70.11 · CLOUD-VM-WEB 10.10.70.20 · CLOUD-VM-MAIL 10.10.70.22 · CLOUD-VM-FILE 10.10.70.3

## Names you can ping instead of addresses
procloud.bh · mail.procloud.bh · files.procloud.bh · ad.procloud.local · crm.procloud.local · intranet.procloud.local · keratinglow.bh · safqa.bh

Run \`nslookup\` with no arguments on any PC for the full list.

Mask is always \`255.255.255.0\`.`
  },
  {
    slug: "sla-priority-matrix",
    title: "How we choose priority",
    category: "Process",
    tags: ["sla", "priority"],
    summary: "Count the people who cannot work. A whole floor beats one desk, and a shared printer is more than one desk.",
    content: `## Simple rule
- Whole floor or a main website down → Critical or High
- One person cannot work → Medium
- A shared printer or the wireless in one room → Medium, because it is a few people and they can usually work around it
- How-to question → Low

Set priority on the ticket so the clock starts.

| Priority | Reply in | Fix in |
| --- | --- | --- |
| Critical | 30 min | 6 h |
| High | 1 h | 12 h |
| Medium | 2 h | 24 h |
| Low | 3 h | 48 h |`
  },
  {
    slug: "par-documentation",
    title: "Problem · Actions · Results",
    category: "Process",
    tags: ["par", "documentation"],
    summary: "Write your own record. Do not put it on the ticket.",
    content: `Topic 1.2 is your documentation. Make it yourself. Do not fill Problem · Actions · Results on the ticket.

A ticket stays short: the request, comments for the next technician, and escalate when you must.

## Problem
What the user said, who they are, what they saw.

## Actions
The steps you took, in order.

## Results
What works now.

## Do not write
A CPR, a phone number, or a real password. Do not paste your write-up onto the ticket.`
  },
  {
    slug: "restart-pc",
    title: "PC is frozen or will not respond",
    category: "Hardware",
    tags: ["kb-restart", "restart", "hardware"],
    summary: "Power off, open the case, unplug the leads, undo the screws — the fault is not colour-coded for you.",
    content: `## What the user said
The PC is frozen. Or: it will not respond. Or: it restarts itself. Or: it is dead.

## Read this first
Use the **Hardware** tab as a service bench. There is a **power** switch, a tool tray, leads you can pull out, and screws you can undo. Faults are **not** painted red on the diagram — you troubleshoot from symptoms, then inspect parts. Nothing is fixed by one button: you strip and rebuild the machine the way you would on a bench.

## Steps
1. Find the PC with **Find a device** and click it.
2. Open the **Hardware** tab. Read the console symptom first (no power, no boot, no signal, no keyboard).
3. Rear leads and the network port can be worked with the panel still on. Select **Hands**, then **drag** a lead out of its socket to unplug it, or drag it back on until the socket lights up. Clicking a lead does the same thing if you would rather not drag.
4. For anything inside: **turn power off**, select the **screwdriver**, click each **screw**, then **Remove side panel**.
5. Click a part to **inspect** it. Only then does the bench tell you what you found, and it lists the job as a checklist.
6. Reseating a lead means pulling it right out and pushing it home. Pushing harder on a half-seated plug does nothing.
7. Swapping a part is a sequence: unplug its leads, undo its mounting screws, lift the old part out, select **Spare parts**, drag the matching spare from the rack onto the empty bay, screw it down, plug the leads back on.
8. **Fit side panel** (it refuses while anything inside is loose), turn **power on**, go back to the command prompt, and prove it with \`ipconfig\` and \`ping\`.
9. Write on the ticket which part it was, what you found, and the ping result afterwards.

## What holds what
Memory is held by **clips**, not screws — open the clips, push the module home, close the clips. The power supply, drive and fan each take **four** mounting screws; the network card takes **one** bracket screw. The monitor, keyboard and mains leads just unplug.

## No prompt at all?
A PC with no power, or one that never boots, cannot be typed into — the window tells you that instead of giving you a cursor. That is expected. Repair the part first, then the prompt comes back.

## Done when
The symptom is gone and your ping proves it. If the machine is healthy inside but still has no network, treat it as **Internet not working**.`
  },
  {
    slug: "how-to-ping",
    title: "How to ping",
    category: "Network",
    tags: ["kb-printer", "ping"],
    summary: "Type ping, a space, then the address. Four replies is a pass.",
    content: `## Steps
1. Click the PC named on the ticket to open its \`C:\\>\` prompt.
2. Type \`ping\` then a space then the address. Example: \`ping 10.10.10.1\`
3. Four replies means that device answered.
4. Request timed out means it did not. Read the line underneath: this lab tells you *why*.
  - "in your subnet but nothing answered" — the device is on your network and silent. Check its cable.
  - "no route" — nothing knows how to reach that address. Check the address you typed.
5. If the gateway replies but the far system does not, run \`tracert\` to that far address.
6. A name works too: \`ping crm.procloud.local\`. A name also tests DNS, so try the address first.

## Common addresses
- Department gateway: the \`.1\` on that subnet (Sales \`10.10.10.1\`, Finance \`10.10.20.1\`)
- Department printer: the \`.50\` on that subnet (Finance \`10.10.20.50\`)
- Hosted: DNS \`10.10.70.11\` · web \`10.10.70.20\` · mail \`10.10.70.22\`
- Data centre: CRM \`10.10.60.10\` · intranet \`10.10.60.20\`

## Done when
You wrote the ping result on the ticket — what you pinged, and what came back.`
  },
  {
    slug: "how-to-tracert",
    title: "How to traceroute",
    category: "Network",
    tags: ["kb-cloud", "tracert"],
    summary: "After ping, type tracert then the far address. See where the path stops.",
    content: `## What this is
**Traceroute** shows each hop to a far address. On a Windows prompt the command is \`tracert\`, which is what these lab PCs use. \`traceroute\` is accepted as well, but write \`tracert\` on the ticket.

## Steps
1. First run \`ipconfig\`. If the address is not on the cheat sheet, fix that first.
2. \`ping\` the gateway.
3. Type \`tracert\` then a space then the far address. Example: \`tracert 10.10.70.20\` (hosted web) or the head-office or branch address on the ticket.
4. If hop 1 is wrong or missing, the gateway on the PC is wrong.
5. Write the first hops on the ticket.

## What the hops mean here
Forwarding is genuinely hop by hop, so the list reads like the real path: your **department router**, then \`R1-EDGE\` at the HQ edge, then your area exchange, then Batelco's core at Hamala, then down to the far site. Where the list stops is where to look. Hop 1 missing is the PC's gateway; a list that dies at the edge or beyond is not a desk fix — write it down and **Escalate**.

## Done when
You can say whether the path left the PC.

## If the PC address is already correct and tracert still dies on a router
Escalate. Do not change routers.`
  },
  {
    slug: "cable-unplugged",
    title: "The cable fell out",
    category: "Hardware",
    tags: ["kb-cable", "cable"],
    summary: "No cable drawn on the map means it is out. Click the device's Fa0, then a free port on its own switch.",
    content: `## What the user said
The cable fell out. Or: there is no green light. Or: someone kicked the cable.

## How to be sure
Two clues, and they mean different things:

- **No line drawn** between the device and its switch on the map — the cable is out. This article.
- A cable is drawn but \`ipconfig\` says **Media disconnected** — the link is dead for another reason. Check the **Hardware** tab for a disabled or failed network card.

## Steps
1. Find the device with **Find a device** and look at it on the map. Every desk, printer and VM should have a line running to the switch above it.
2. Click the small port circle marked **Fa0** on the device.
3. Click a **free port** on that device's own switch — a circle that is not already teal.
  - The port it fell out of is free again, and that is the natural one to use.
  - Any free access port on that switch works. They all carry the department's VLAN.
  - The map picks the cable for you (straight-through at a desk).
4. The line appears for everyone on the Lab map. If you pick the wrong port first, click empty space on the map to clear the selection and start again.
5. Prove it on the device: \`ipconfig\`, then \`ping\` the gateway.

## Which switch is "its own"
The one drawn directly above it — the map stacks each department's desks under their switch, and each branch's desks under the branch switch. Printers normally sit on \`Fa0/24\`, desks on the low-numbered ports, access points on \`Fa0/23\`, and hosted VMs on \`SW-CLOUD\`. If the switch shows no free port, unplug nothing: **Escalate**.

## Done when
The cable is drawn on the map and the gateway replies from that device.

## Do not
Change any switch setting, and do not unplug something else to make room.`
  },
  {
    slug: "which-cable",
    title: "Which cable goes where",
    category: "Hardware",
    tags: ["kb-cable-type", "cable"],
    summary: "The map picks the lead when you click two ports. Straight-through at the desk, crossover PC-to-router, fiber on the provider WAN, console for management only.",
    content: `## What the user said
I plugged it back in and it still does not work.

## The rule
You do not pick the cable on the map — click two free ports and the right lead is used. Still know the rule for the exam and for reading a hover tip:

| From → to | Cable |
| --- | --- |
| PC, laptop, printer or server → switch or access point | **Copper straight-through** |
| PC → router directly | **Crossover** |
| Switch → switch | **Crossover** (the design trunks) |
| Switch → router, router → router inside a site | Copper — these ports are auto-MDIX |
| Long runs on the provider WAN / to the internet | **Fiber** |
| Getting a console on a switch or router | **Console** — carries no network traffic at all |

Two things that used to break a student-run cable on older builds, and still matter on a real bench:

- **Console cable to fix a network link.** It is a management lead. It does not carry frames.
- **Fiber into a desk.** A PC, printer or laptop has an RJ45 port. Fiber does not go into it.

## How it shows up
If the line is missing, plug it (this article's neighbour: **Cable unplugged**). If a line is there and \`ipconfig\` still says \`Media disconnected\`, the fault is elsewhere — usually the **Hardware** tab (disabled or failed NIC), not the lead type. Hover the cable on the map — it names the lead that is in it.

## Steps
1. Hover the cable and read its type.
2. If the line should not be there, click it to unplug, then click the two ports again so the map re-runs the lead.
3. Prove it on the device: \`ipconfig\`, then \`ping\` the gateway.

## Done when
\`ipconfig\` shows the address instead of \`Media disconnected\`, and the gateway replies.`
  },
  {
    slug: "no-address-dhcp",
    title: "Laptop has no address (169.254)",
    category: "Network",
    tags: ["kb-dhcp", "dhcp", "apipa"],
    summary: "169.254.x.x means the machine asked for an address and nobody answered. Work the four steps between the laptop and CLOUD-VM-DHCP.",
    content: `## What the user said
No internet on my laptop. Or: it worked yesterday and I have not changed anything.

## How to be sure
\`ipconfig\` on the machine shows an address starting **169.254** with mask \`255.255.0.0\`, and \`Autoconfiguration Enabled\`. That is Windows giving up: the machine asked for an address by DHCP and got no answer. It is not a typing mistake and setting an address by hand is **not** the fix — it hides the fault.

Desk PCs have their address typed in, so a \`169.254\` on a desk PC means someone turned DHCP on. Laptops are on DHCP by design.

## The four steps a request has to survive
Check them in this order, because each one rules out the ones after it.

1. **Its own link.** \`ipconfig\` saying \`Media disconnected\` or \`Not connected\` is not a DHCP fault — go to **The cable fell out**, **Which cable goes where**, or, on a laptop, **Laptop will not join the Wi-Fi**.
2. **Its department router.** That router is the DHCP **relay** for the floor. A desk PC in the same room with a working address proves the segment is fine; if nothing in the room has an address, look at the switch uplink and the router.
3. **The path to the server.** From a working PC in the same department, \`ping 10.10.70.21\`. No reply means the request never gets out of Bahrain — work it as **Internet not working** from that department.
4. **The service itself.** Click \`CLOUD-VM-DHCP\` and run \`dhcp status\`. It says whether the service is running and whether the scope still has addresses. \`dhcp start\` starts it; \`dhcp reset\` puts the scope back to normal.

## Then ask for an address again
On the laptop:

\`\`\`
ipconfig /release
ipconfig /renew
\`\`\`

\`/renew\` tells you which of the four steps failed instead of quietly succeeding. If it comes back with \`169.254\` again, the fault is still out there — do not paper over it.

If the adapter has an address typed into it, \`/renew\` is an error. \`dhcp on\` puts the adapter back on DHCP.

## An address that is wrong rather than missing
A laptop can get a real address and still reach nothing, if the scope hands out the wrong **router** (option 003) or **DNS** (option 006). \`ipconfig /all\` shows what the lease contained and which server gave it. Compare the gateway and DNS against the **Address cheat sheet**; if the scope is wrong, that is the server's fault, not the laptop's.

## Done when
\`ipconfig\` shows an address from the laptop's own department subnet, a gateway on that subnet, and the gateway replies to \`ping\`.`
  },
  {
    slug: "wifi-not-joining",
    title: "Laptop will not join the Wi-Fi",
    category: "Network",
    tags: ["kb-wifi", "wifi", "wireless"],
    summary: "Check association before addressing. wifi status, then wifi scan, then join with the right name and key.",
    content: `## What the user said
No Wi-Fi. Or: it says connected and nothing works. Or: it works in the corridor but not at my desk.

## Order matters
A laptop has to be **associated** with an access point before it can get an address, and it needs an address before it can reach anything. Check them in that order or you will chase the wrong fault.

## Steps
1. Click the laptop and run \`wifi status\`. It tells you whether the radio is on, what it is joined to, and the signal.
2. **Radio off?** \`wifi on\`.
3. \`wifi scan\` lists what the laptop can hear, with a signal reading and whether each network is usable from where it is sitting. You may see the access point from the department next door — it is listed and it is too weak to use, which is the point.
4. **Nothing listed at all?** The access point itself is down. Click the \`AP-*\` box for that room and run \`show wireless\`. If the radio is shut, put it back:

\`\`\`
enable
configure terminal
dot11 enable
\`\`\`

5. **Listed but not joined?** Join it by name and key:

\`\`\`
wifi join ProCloud-Staff Bahrain#2024
\`\`\`

   The Training room has its own network: \`ProCloud-Training\` / \`Train#2024\`. A wrong key gives you a key mismatch, not silence.
6. **Joined and still nothing?** Association is done, so now it is addressing: \`ipconfig\`. A \`169.254\` address is **Laptop has no address (169.254)**.

## The networks
| Network | Key | Where |
| --- | --- | --- |
| \`ProCloud-Staff\` | \`Bahrain#2024\` | Reception, Operations, Warehouse, Branch A, Branch B |
| \`ProCloud-Training\` | \`Train#2024\` | Training room |

## Done when
\`wifi status\` shows the laptop joined to the access point in its own room, \`ipconfig\` shows an address on that room's subnet, and the gateway replies.

## Do not
Move the access point, change its channel, or hand out the key to a user. If the room needs coverage it does not have, **Escalate**.`
  },
  {
    slug: "duplicate-address",
    title: "Duplicate address on the network",
    category: "Network",
    tags: ["kb-duplicate-ip", "duplicate-ip"],
    summary: "Two machines with the same address knock each other off. Windows disables the adapter and says so.",
    content: `## What the user said
It says there is an IP address conflict. Or: my PC dropped off the network after someone else came back from leave.

## How to be sure
\`ipconfig\` on the PC shows the address with the words **Duplicate address detected** or the adapter shown as disabled, and \`ping\` from it fails with a conflict rather than a timeout. Two devices cannot hold the same address.

## Steps
1. Follow **Read this first — every ticket**.
2. \`ipconfig\` on the machine in the ticket and write down the address it is trying to use.
3. Open the **Address cheat sheet**. Desks in a department run from \`.10\` upwards and the printer is \`.50\`. Work out which of the two machines has the address that belongs to it.
4. Fix the **wrong one**, not whichever one the user phoned about. On that PC:

\`\`\`
ip 10.10.20.14 255.255.255.0 10.10.20.1
dns 10.10.70.11
\`\`\`

5. \`ipconfig\` on both machines. Neither should complain now.
6. \`ping\` the gateway from both.

## While you are in there
Two other addressing mistakes look like this from a distance, and the console names them both:

- **A mask that is not a mask.** \`255.255.255.129\` is rejected. Masks are a run of ones — \`255.255.255.0\` is what this company uses everywhere.
- **A gateway outside the PC's own subnet.** \`10.10.99.1\` on a Finance desk cannot be reached, so the PC talks inside Finance and nowhere else. The gateway is always \`.1\` of the PC's own subnet.

## Done when
Both machines show their cheat-sheet address, neither reports a conflict, and the gateway replies from both.

## Do not
Give a machine an address that is not on the cheat sheet to "get it working". You will be back tomorrow.`
  },
  {
    slug: "reset-password",
    title: "Reset password",
    category: "Access & Identity",
    tags: ["kb-password", "password"],
    summary: "Find the person on the ticket and click Reset. Never take a CPR, a phone number, or a real password.",
    content: `## What the user said
Please reset my password. Or: I forgot my password.

## Steps
1. Follow **Read this first — every ticket**.
2. If the user offers a **CPR**, a **phone number**, a **real password**, or **WhatsApp**, stop. Write what they offered → **Escalate**. Do not store it.
3. Open **Portals → Password**. Find the person named on the ticket (or their PC) with the search box. Click **Reset password**.
4. Do **not** write the password on the ticket.
5. Write that you used the password portal. Do not invent a new password for a real person.

## There is nothing to check on the map
A lockout is an account job. If the same person also says mail will not load, that is a second problem — see **Email not working**.

## Done when
You reset that person's account in the portal, and you did not collect personal data.

## Escalate when
They send a CPR, they want you to keep their real password, or they ask you to call a personal number.`
  },
  {
    slug: "when-to-escalate",
    title: "When to escalate",
    category: "Process",
    tags: ["kb-escalate", "escalate"],
    summary: "Check ipconfig, ping, and tracert, write what you saw, then Escalate. Do not guess past L1.",
    content: `## Escalate after you have checked
1. \`ipconfig\` on the named PC.
2. \`ping\` the gateway from the cheat sheet.
3. \`tracert\` to the far address on the ticket (cloud \`10.10.70.20\`, head office, or the branch).
4. Write those results in a comment.

## Escalate when
- More than one PC or a whole floor is down
- The address is already correct and ping still fails
- The user offers a CPR, phone number, or a real password
- They ask for a new account, a new VLAN, or a router change
- They talk about a virus, a USB stick, or a hack
- You would have to change a switch or router
- VAS (SMS, MMS, BMS, USSD) to stc, Batelco, or Zain
- VPN tunnels (IPsec, SSL, or Remote) for a branch or shop
- CBS (billing) — post, refund, or “CBS will not open”
- A software update or change request

## How
Open the ticket → **Escalate** → write why. It goes to L2, then to the instructor at L3.

When L2 finishes the SMS link, the VPN tunnel, the CBS work, or the update — **Resolve**. You do not install the update yourself.

## Do not
Leave the ticket sitting. Do not invent a fix. Do not store personal data.`
  },
  {
    slug: "vas-cbs-updates",
    title: "VAS, VPN, CBS, and software updates",
    category: "Process",
    tags: ["kb-escalate", "escalate", "vas", "vpn", "cbs", "update"],
    summary: "Ping the named PC and the system. Escalate. When the work is done, Resolve.",
    content: `VAS, VPN, CBS, and software updates are **not** L1 fixes. Check the PC, then Escalate.

## VAS
Texts and alerts leave through **CLOUD-VM-APP** (\`10.10.70.40\`) to **stc**, **Batelco**, or **Zain**. Each company has three links for SMS, MMS, BMS, and USSD. Match the connection ID on the ticket (for example \`VAS-STC-SMS-1\`). You cannot enable a telecom link at L1.

1. \`ipconfig\` on the named PC.
2. \`ping 10.10.70.40\`.
3. Open **Portals → VAS**. Find that connection ID. If it is Down, **Escalate**.
4. When that company link is Up again, **Resolve**.

## VPN
Tunnels terminate on **R1-EDGE** (\`203.0.113.34\`, its public address). Sites are Branch A to Branch I, Head office, Safqa, and Keratin Glow. Each site has three IPsec, three SSL, and three Remote tunnels. Match the connection ID on the ticket (for example \`VPN-BA-IPSEC-1\`). You cannot enable a tunnel at L1.

1. \`ipconfig\` on the named PC.
2. \`ping 10.10.10.1\`.
3. Open **Portals → VPN**. Find that connection ID. If it is Down, **Escalate**.
4. When that tunnel is Up again, **Resolve**.

## CBS
**CBS** is the billing system. It sits on **VM-SQL-FIN** (\`10.10.60.11\`). You cannot post invoices, enter refunds, or change CBS.

1. \`ipconfig\` on the named PC.
2. \`ping 10.10.60.11\`.
3. Open **Portals → CBS**. Find the invoice number on the ticket — the portal holds INV-1001 to INV-1100, so use the search box. Do not post or refund.
4. **Escalate**. When CBS work is done, **Resolve**.

## Software update
You do not install updates or put a new version on a server.

1. \`ipconfig\` on the named PC.
2. **Escalate** — this is a change request.
3. When the update is finished, **Resolve**.

## Do not
Close the ticket because the server answers a ping — a reachable box is not a finished change request. Do not call the telecom yourself. Do not enable a VPN tunnel. Do not enter a refund in CBS.`
  }
];

module.exports = { kbArticles };
