# User guide

This guide is for **students** using CCST Ticketing. Language stays plain. You are the technician, not the end user of Sales or Finance — those people are simulated on each ticket.

![You are the technician](../docs-art/docs-hero.png)

![Open the PC named on the ticket](../docs-art/docs-find-pc.png)

![ipconfig, then ping, then tracert](../docs-art/docs-ipconfig.png)

![Write Problem, Actions, Results](../docs-art/docs-par.png)

![Sign in with the firstname.lastname account your instructor created](../docs-art/docs-accounts.png)

## Sign in

1. Open the helpdesk URL your instructor gives you.
2. Username: the one your instructor created for you (first.last style). It is on the **Team** page.
3. Password: the one your instructor gave you. If you lose it, they reset it — nobody else can.

## What you will do in class

1. Open **Dashboard** for backlog, SLA, CSAT, and FCR.
2. Open **Ticket queue** → **Assigned to me**.
3. Read the ticket and **set a priority** (starts the SLA clock).
4. Open **Lab map**, click the device named on the ticket, and work it (`docs/12-class-lab.md`).
5. Fill **Problem / Actions / Results** on the ticket.
6. Use the **Knowledge base** when an article matches the ticket.

## Finding your way around the queue

Filter with the boxes along the top — search words, priority, status, **Past SLA** for tickets already past an acknowledge or resolve deadline, and **Assigned to me** for your own work — then press **Apply**. Sort by clicking the small up or down arrow in any column heading: oldest ID first, worst SLA first, whatever you need. The arrow you are using turns teal, and clicking it again puts the queue back in priority order.

Your filters and sort stay as you left them. Open a ticket and come back, or go to the lab map and click **Ticket queue** again, and the same list is waiting. Only **Reset filters** empties the boxes.

## Buttons that matter

- **Claim ticket** — you own it. The acknowledgement clock can start here.
- **Priority** — unassigned until you judge it. Choosing it starts the resolve deadline.
- **Save record** — writes documentation. Save often.
- **Escalate** — you have reached the edge of L1. Write the reason; that is the graded part.
- **Resolve** — the work is verified and the user confirmed. Not "I am tired of this ticket".

Creating tickets is an instructor job in this lab, so there is no **New ticket** button on a student account. Your queue is handed to you.

## How to write so the next person trusts you

Do:

- Quote error messages.
- Name versions (`driver 4.1.2`, `Windows 11`).
- Say how many people are affected.
- Record what you already ruled out.

Do not:

- "Printer failed."
- "User error."
- Paste a password, CPR, or personal phone number.
- Close with empty Results.

## Working a device on the Lab map

Click the device box. A PC, laptop, printer or VM gives you a `C:\>` prompt; a switch, router or access point gives you an IOS console.

```
ipconfig                 what address am I on?
ping 10.10.10.1          can I reach my gateway?
tracert 10.10.70.20      which hop does the path die on?
nslookup safqa.bh        does the name resolve?
help                     the full list
```

To plug a cable back in, click the device's port, then a free port on its switch. To unplug one, click the cable. If you get lost mid-cable, press **Cancel selection**.

## Checking a PC over

A desk PC has a **Hardware** tab beside its command prompt — a service bench. Turn **power** off before opening the case, select the **screwdriver**, remove the **screws**, then take the side panel off. Parts are **not** colour-coded; inspect them to find what is wrong.

Repairs are physical, not a single button. Every lead on the diagram can be handled: with **Hands** selected, **drag** a plug out of its socket to unplug it, or drag it back until the socket lights up green to seat it. The lead follows your pointer and sags as you pull, and a plug dropped short of its socket falls back where it was. Clicking a lead toggles it instead, which keeps the panel usable by keyboard. A lead that is only half seated has to come right out before it will go back properly. Swapping a part means unplugging its leads, undoing its mounting screws, lifting the old one out, fitting the spare, screwing it down and plugging the leads back on — the inspect panel keeps that checklist for you. The side panel will not go back on while anything inside is loose, and the machine will not power up until it is whole again.

![The Hardware tab: service bench with power, tools, and the case](../docs-art/docs-hardware.png)

Use it when the ticket is about the machine rather than the network — dead, blank screen, beeping, noisy, hot, or a keyboard that does nothing. Some faults mean there is no command prompt at all: a PC with no power or one that never boots cannot be typed into, and the window tells you that instead of giving you a cursor. Repair the part, then go back to the prompt and prove it with `ipconfig` and `ping`.

## If something in the app breaks

Tell the instructor. Typical fixes: sign in again after a restart or a new deployment; if the map says it reloaded because someone else changed it, that is expected — your page had gone stale and took the newer copy.
