# Instructor class-day sheet

One page for running CCST Ticketing in class. Live URL: **https://ccst.website**

## Before students arrive

1. Open `/api/health` — need `"ok": true`, `blobOk`, `sessionSecretOk`, `classroomAiReady`.
2. Snapshot state: from the project folder run `npm run backup:azure`.
3. Hard-refresh the site once (Cmd/Ctrl+Shift+R) so everyone gets the current JS modules.

## Sign in

| Who | How |
| --- | --- |
| Default G18 instructor | Username `instructor` · password `ProCloud-G18` · class **CCST IT Support G18** |
| Other instructors | **Instructor signup** on the login page + the signup code from Azure App Setting `INSTRUCTOR_SIGNUP_CODE` (do not put that code in student handouts) |
| Students | Accounts you add under **Class & students** — no shared class password |

Other instructor accounts may already exist on the live site (`mohsenshubar`, `mohsen.salman`, `mohsen.shubar`, `hasan.abbas`, etc.). Use the one for your class.

## Class flow

1. **Class & students** → add each student (full name, username, password).
2. Set **Class SLA** if you want different response/resolve times.
3. Optional: class announcement note (shows on every student’s pages).
4. **Generate a workload** — choose issue mix → **Generate**. Or create tickets by hand (**Ticket queue → New ticket**).
5. Students: **Ticket queue → Assigned to me** → set priority → **Lab map** / **Portals** → document → escalate or resolve.
6. You: **Live class board** for who is stuck; review resolved tickets; **Export CSV** / KPI PDF for marks.

## During class

- **Reset to design** on the Lab map (instructor only) restores cabling/config; faults for still-open lab tickets stay so work remains solvable.
- **Remove all tickets** empties the class queue and undoes planted faults — confirm before you click.
- Marks anytime: **Class & students → Export CSV**.

## After class

1. Export CSV / KPI PDFs if you need marks offline.
2. Optional another `npm run backup:azure`.
3. Leave student passwords as-is, or reset individuals from the roster.

## If something looks wrong

| Symptom | Check |
| --- | --- |
| Orange “nothing is being saved” banner | Storage fell back to memory — Azure blob settings |
| Login rejected for `instructor` | Password should be `ProCloud-G18` (reset if someone changed it) |
| Blank / old UI | Hard-refresh; confirm page loads `/js/app.js?v=64` as a module |
| Instructor signup closed | `INSTRUCTOR_SIGNUP_CODE` missing on App Service |
| Students from another class appear | Each class only sees its own roster — you are on the wrong instructor account |
