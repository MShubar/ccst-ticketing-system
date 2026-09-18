# G18 class lab — the browser Lab map

Everything happens in the app. Open **Lab map** in the left navigation — there is nothing to install and no file to open.

![You are the technician. Open the same company network.](../docs-art/docs-hero.png)

You are the **helpdesk**. The PCs on the map belong to Sales, Finance, HR, and the branches — not to you.

![Ticket name = device on the map](../docs-art/docs-find-pc.png)

## How you work

1. Sign in with the username and password your instructor gave you.
2. Open **Ticket queue** → **Assigned to me**.
3. Open **Lab map** and type the device from the ticket into **Find a device**.
4. **Click the device** to open it — a `C:\>` prompt on a PC, laptop, printer or VM, and an IOS console on a switch, router or access point. A desk PC also has a **Hardware** tab.
5. Run `ipconfig`, then `ping` the gateway, then `tracert`. Plug a cable if one is missing. Write what you did on the ticket.
6. Escalate **VAS**, **VPN**, **CBS**, or software updates. **Resolve** when the work is finished.

![Find a device: typing a department lists every desk in it, with its address](../docs-art/docs-map-search.png)

## Working the map

| To do this | Do that |
| --- | --- |
| Find one device among hundreds | Type its name, address or department into **Find a device** |
| Open a command prompt or IOS console | Click the device box |
| Look inside a PC at its parts | Click the PC, then the **Hardware** tab, then a part |
| Plug a cable | Click a free port, then the other free port (syncs live for the class) |
| Unplug a cable | Click the cable (syncs live for the class) |
| Cancel a half-started cable | Click empty space on the map |
| Zoom | `+` / `−` buttons, or Ctrl+scroll |
| See it bigger | **Open full screen** |
| Reset cabling to design | **Reset to design** (instructor only) |

Each device box shows its name and its address. Hover a device or a cable for the full detail, including the public address it uses on the internet.

**Reset to design** puts the cabling and every device configuration back to the shipped design. Faults named by lab-map tickets that are still open are left in place — cables stay unplugged and broken PC parts stay broken — so those tickets remain solvable.

Some hardware faults take the command prompt away. A PC with no power, or one that will not boot, cannot be typed into: the window says what it is doing instead of giving you a cursor, and the **Hardware** tab is how you get it back.

## What is in the lab

![The Lab map: the data centre on the left, twelve HQ departments in columns behind their own routers, Batelco and the nine branches on the right](../docs-art/docs-map.png)

Where things sit:

| Zone | Location on map | What is there |
| --- | --- | --- |
| Data centre | Left | `SW-VIRT` and `VM-*` on VLAN 60, behind `RD-DC` |
| HQ departments | Middle (twelve columns) | Sales through Support — each with its own `RD-*` router, switch(es), desks and printer |
| HQ edge | Above department routers | `R1-EDGE` |
| Batelco WAN | Upper right | `BAT-HAMALA` plus area exchanges |
| Hosted cloud | Top right via Dubai | `BAT-DUBAI` → `R-AZURE` → `SW-CLOUD` → `CLOUD-VM-*` |
| Branches | Bottom right | Branch A–I, each behind its own router |
| Wireless | Selected sites | APs under Reception, Operations, Warehouse, Training, and Branches A–B |

239 cables in the shipped design. A missing cable is the whole fault on a wiring ticket: no line on the map, and `ping` fails from that device. Click two free ports to plug a cable — the change syncs for the class. Hover a cable to see which kind it is.

## Laptops, Wi-Fi and DHCP

A laptop is not a desk PC with a battery. It has no address typed into it — it asks `CLOUD-VM-DHCP` for one — and it has no cable, so it has to be associated with an access point first.

- `wifi status` says whether you are on the air and how strong the signal is; `wifi scan` lists what the laptop can hear, which may include an access point in the next department that is too weak to use.
- `wifi join ProCloud-Staff Bahrain#2024` joins the staff network. The Training room is `ProCloud-Training` / `Train#2024`.
- `ipconfig` showing `169.254.x.x` means the laptop asked for an address and got no answer. That is a DHCP fault, not a Wi-Fi fault — work out which of the four steps failed: the link, the department router that relays the request, the path to `10.10.70.21`, or the service on the VM itself.
- `ipconfig /release` and `ipconfig /renew` do what they do on Windows. `/renew` on a PC with a typed-in address is an error, not a repair.

## Printers have a front panel

A printer on this map is no longer only an address. Click it and you get its panel: `status` tells you what it is complaining about, and `clear`, `paper`, `toner`, `cancel`, `online` and `offline` are the things you would do standing in front of it. `print PRN-FIN` from a user's PC is the test page.

A jam is not a network fault, and `restart` will not clear one — that is the point of these tickets. Ping the printer first: if it answers, stop looking at the network and go and read the panel.

## The three ways out of a department

1. Your gateway (the `.1` on your floor) is your **department's own router**, the `RD-*` box directly above your switch. Sales talking to Finance is already three routers: `RD-SALES`, `R1-EDGE`, `RD-FIN`.
2. Branches reach HQ through their own router, then their **area exchange**, then the **Hamala core**, then HQ's exchange, then `R1-EDGE`, then the department router.
3. Anything on the internet leaves through `R1-EDGE`, which translates the whole site to one public address (`203.0.113.34`). The hosted cloud VMs each have their own public address instead.

Use this when a ticket says "Sales cannot reach the CRM" or "Branch B cannot open the shop site": find the device, check its address, then follow that path hop by hop with `tracert`.
