# CCST Ticketing System — Teacher Manual

## What This Is

CCST Ticketing is a classroom help desk for CCST IT Support. Students submit tickets when they have problems. Instructors (teachers) view, manage, and resolve those tickets. The system also includes a lab map showing the computer room layout with live device presence, a knowledge base for common fixes, portal links to external tools, class progress tracking, and team management.

**Live URL:** `https://ccst-ticketing.mohsen-salman099.workers.dev` (also available at `https://ccst.website`)

**Access:** Works in any modern browser — Chrome, Edge, Safari, Firefox. Students can also install it as a web app on their devices (look for the install icon in the browser address bar).

---

## Getting In

### Logging In

1. Open the CCST Ticketing URL in your browser.
2. On the login screen, enter your **username** and **password**.
3. Click **Sign in**.
4. You'll be taken to your dashboard.

If you don't have an account yet, the system administrator (Mohsen) creates instructor accounts. Ask him to set one up for you.

**Your account:** You should have received your username and password separately. Treat them like any other school system login — don't share them with students.

### Who Sees What

| Role | What they can do |
|---|---|
| **Student** | View their own tickets, create new tickets, see the lab map, browse the knowledge base, check portals and progress |
| **Instructor** | Everything a student can do, plus: view and manage all tickets, see the full team list, manage knowledge base articles, manage portals, view KPI progress, access the admin panel |

When you log in as an instructor, you get the full set of tools. Students only see what's relevant to them.

---

## The Dashboard

When you log in, you land on the **Dashboard** (`/dashboard`). This is your overview of what's happening.

### What You'll See

- **Ticket stats** — how many tickets are open, pending, resolved, etc. This gives you a quick sense of the current workload.
- **Recent activity** — a snapshot of recent ticket activity so you can see what's moving.
- **Quick links** — shortcuts to the most-used parts of the system (tickets, map, knowledge base, etc.).

The dashboard updates automatically. If something changes elsewhere in the system, you'll usually see it reflected here without needing to refresh.

### Navigating

The main navigation is in the sidebar (or top bar on smaller screens). From anywhere in the system, you can jump to:

- **Dashboard** — your overview
- **Tickets** — view and manage all tickets
- **New Ticket** — create a ticket on behalf of a student
- **Lab Map** — the computer room layout with live device status
- **Portals** — links to external tools and resources
- **Team** — list of all users (students and instructors)
- **Progress** — KPI tracking and class progress
- **Knowledge Base** — articles with common fixes and how-tos

There's also a **logout** option in the menu.

---

## Tickets

This is the core of the system — where students report problems and instructors resolve them.

### Viewing Tickets

Go to **Tickets** (`/tickets`) to see all tickets. You'll see a list showing:

- Ticket ID
- Student who raised it
- Title / summary
- Status (open, pending, resolved, etc.)
- Priority
- When it was created
- When it was last updated

You can filter and search the list to find specific tickets — by student name, by status, by keyword in the title or description.

### Opening a Ticket

Click on any ticket in the list to open it and see the full details:

- The full description the student wrote
- Any comments or updates
- The current status and priority
- Which instructor is handling it (if assigned)
- The timestamp history

From the ticket detail view, you can:

- **Update the status** — move it from open to pending, resolved, etc.
- **Add notes** — leave internal comments or updates visible to the student
- **Assign it** — if your workflow uses assignments, you can assign a ticket to a specific instructor
- **Close/resolve it** — mark it as done when the issue is fixed

### Creating a Ticket for a Student

Sometimes a student comes to you directly and you want to log the issue on their behalf.

1. Go to **New Ticket** (`/tickets/new`).
2. Select the **student** the ticket is for (from the class list).
3. Fill in the **title** — a short summary of the problem.
4. Write the **description** — what's happening, what they've tried, any error messages.
5. Set the **priority** if needed (low, medium, high, urgent).
6. Click **Submit**.

The ticket is created and the student will see it in their own view. You can then manage it like any other ticket.

### Student Workflow

Students use the same ticket system from their end:

1. They log in with their student account.
2. They go to **New Ticket** and fill in the form — their name is filled in automatically.
3. They submit, and the ticket appears for instructors to see.
4. They can check back to see the status and any updates.

---

## Lab Map

The **Lab Map** (`/map`) shows the computer room layout as an interactive diagram. This is useful for seeing what's happening in the lab at a glance.

### What It Shows

- The physical layout of the lab — tables, devices, stations
- Each device/node on the map
- **Live presence** — which devices are currently active or have users logged in
- Connections between devices (cables, network links, etc.)

### Using the Map

- **Pan and zoom** to explore the layout.
- **Click on a device** to see more details about it.
- The map updates in near-real-time, so you can see who's logged in where.

### The Console

Some devices on the map have a **console** button. Clicking it opens a console panel for that device — this lets you interact with it directly (run commands, check status, etc.). This is the "hardware bench" feature.

The map also has a **classic mode** — if you prefer the older version of the map interface, there's an option to switch. Your preference is remembered.

---

## Knowledge Base

The **Knowledge Base** (`/kb`) is a collection of articles with helpful information — common fixes, how-to guides, troubleshooting steps, and reference material.

### Browsing Articles

Articles are listed on the knowledge base page. You can:

- Scroll through the list to browse
- Search by keyword to find relevant articles
- Click an article to read the full content

Articles are written in a simple format and rendered for easy reading.

### Managing Articles (Instructors)

As an instructor, you can manage the knowledge base:

- **Create new articles** — add helpful guides for students
- **Edit existing articles** — update fixes when things change
- **Delete articles** — remove outdated content

This is useful for building up a library of common solutions so students can often help themselves before needing to raise a ticket.

---

## Portals

**Portals** (`/portals`) are links to external tools and resources that students and staff use. Think of it as a curated starting page — instead of hunting for links, everything is here.

### What's There

Portals typically include links to:

- School systems (learning platform, email, etc.)
- IT tools (software downloads, remote access, etc.)
- Reference sites (documentation, guides, etc.)

The exact portals depend on what's been configured. Instructors can manage these — add new links, update existing ones, remove ones that are no longer needed.

---

## Team

The **Team** page (`/team`) shows everyone who has an account on the system — students and instructors.

### What You Can See

- A list of all users
- Their role (student or instructor)
- Their class (for students)
- Basic info

This is useful for seeing who's in your class, finding a student's account, or checking who else has instructor access.

---

## Progress

The **Progress** page (`/progress`) shows KPI tracking and class progress data. This gives you a view of how things are going — which students are active, which topics or areas are being covered, and how the class is progressing overall.

The exact metrics depend on what's been set up, but the idea is to give you a quick, at-a-glance sense of progress without having to dig through individual tickets or logs.

---

## Common Tasks

### "A student says their computer isn't working — what do I do?"

1. Ask the student to log a ticket (or log one for them from **New Ticket**).
2. Include details: which machine, what happens, any error messages.
3. Check the **Lab Map** to see if the device shows as active or offline.
4. If needed, use the device console from the map to investigate.
5. Once fixed, update the ticket status to resolved and add a note explaining what was done.

### "I want students to be able to fix common problems themselves"

1. Go to **Knowledge Base**.
2. Add an article for the common issue — steps to fix it, screenshots if helpful.
3. Tell students to check the knowledge base before raising a ticket for that type of problem.
4. Over time, build up a library of these articles.

### "How do I see what my class is working on?"

1. Go to **Progress** to see overall class activity.
2. Go to **Tickets** and filter by your class or by student to see individual issues.
3. The **Dashboard** gives a high-level summary when you first log in.

### "A student forgot their password"

Contact the system administrator (Mohsen). Account passwords are managed by the administrator — there's no self-service password reset for students at the moment.

---

## Tips

- **The system works best on a computer with a mouse.** The lab map and some interfaces are easier to use with a pointer than on a touch screen.
- **Knowledge base articles save time.** If you find yourself explaining the same fix repeatedly, write it up as an article. Next time, send students the link.
- **Tickets are the record of what happened.** When you resolve a ticket, add a note about what the problem was and how you fixed it. This helps if the same issue comes up again, and it gives students a reference.
- **The lab map updates live.** If a device disappears from the map or shows as offline, that's reflected in near-real-time. It's a quick way to spot problems before a student reports them.
- **Log in once per session.** You stay logged in while the browser tab is open. If you close it and come back later, you'll need to log in again.

---

## Getting Help

If something isn't working as expected, or you need an account created/reset, or you want to suggest a feature:

- **System administrator:** Mohsen Shubar
- **Email:** mohsen.salman099@gmail.com

For urgent issues during class (e.g., the system is down and students need to log tickets), contact Mohsen directly.

---

*Last updated: September 2026: Loading system overhaul — all pages now show smooth skeleton loading states instead of blank screens or raw text. Service worker enabled for faster repeat visits. Deploy transitions now recover automatically if a student has an old cached version.*
