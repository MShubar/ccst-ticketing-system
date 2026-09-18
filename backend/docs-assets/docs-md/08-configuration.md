# Configuration documentation

System settings, versions, and how to change them without losing the ability to roll back.

## Runtime configuration

| Setting | Default | How to change |
| --- | --- | --- |
| HTTP port (local) | `3847` | Environment variable `PORT` |
| Local data folder | `backend/var/` | Environment variable `DATA_DIR` |
| Session cookie | `ccst_session` | `backend/middleware/auth.js` |
| Default instructor | `instructor` / `ProCloud-G18` | `backend/data/seed-data.js`, then `npm run seed` |

Student accounts are not configuration. An instructor signs up, then adds students under **Class & students** with a password they choose. Do not edit hash strings in the JSON store by hand.

## Environment variables (deployed)

Production runs on **Azure App Service** (`ccst-ticketing`, Central India). Set these under **Configuration → Application settings** in the Azure portal, or via `npm run deploy:azure` / `az webapp config appsettings set`.

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | Preferred in production | Postgres connection string. When set, the app stores state in Azure Database for PostgreSQL (`documents` JSONB table) instead of the blob. |
| `PERSIST_BACKEND` | Optional | Force `sql` or `json`. Default: use SQL when `DATABASE_URL` is set, otherwise Azure blob / file. Set `json` to roll back to blob without removing `DATABASE_URL`. |
| `AZURE_BLOB_SAS_URL` | Yes if not on SQL | Container SAS URL for the blob holding `db.json`. Keep it even on SQL for backups / rollback. **Without SQL or blob, the app falls back to memory and every save is silently lost.** |
| `AZURE_STATIC_BASE_URL` | Yes in production | Public base for docs PDFs/images, e.g. `https://ccstticketing.blob.core.windows.net/docsassets`. Upload with `npm run upload:static`. |
| `SESSION_SECRET` | Yes on App Service | Signs session cookies; generate a long random string and keep it stable across redeploys. **Production refuses to start** if this is missing or still the built-in default. |
| `NODE_ENV` | Recommended | Set to `production` on App Service |
| `INSTRUCTOR_SIGNUP_CODE` | Yes, to allow instructor signup | Shared secret instructors must enter on **Instructor signup**. Without it, signup stays closed. Change it anytime in App Service settings; do not publish it in student docs. |
| `BOOTSTRAP_INSTRUCTORS` | Optional | JSON array of instructor accounts to create on first read, so a fresh deployment is not locked out |

## Static docs (PDFs and pictures)

Classroom Documentation PDFs and thumbnail art are stored in Azure Blob container **`docsassets`** (public read), not on the App Service disk.

```bash
npm run upload:static
```

That creates/updates `docs-pdf/` and `docs-art/` under the container and prints `AZURE_STATIC_BASE_URL`. Deploy sets the same setting on the web app.

Source files live in **`backend/docs-assets/`** (docs-md, docs-pdf, docs-art) for rebuild/upload only. The running app loads docs from Azure Blob; it does not need that folder.

### Pre-class checks

- Follow **`backend/docs-assets/docs-md/13-instructor-class-day.md`** (class-day sheet).
- Open `https://ccst.website/api/health` — expect `"ok": true`, `blobOk`, `sessionSecretOk`, `staticOk`, and `classroomAiReady: true`.
- Snapshot blob state: `npm run backup:azure` (copies `db.json` and `lab/*.json` under `state/backups/<timestamp>/`).
- Day-to-day ops (health, deploy, backups, rollback): `backend/docs-assets/docs-md/16-ops.md` (trainer notes — not listed under in-app Documentation).
- Export marks from the app anytime: **Class & students → Export CSV**.
- Default G18 login: `instructor` / `ProCloud-G18`. Hard-refresh once so clients load current JS modules.

### Deployment slots

The current plan is **B1**. Azure deployment slots need **Standard (S1)+** (extra cost). Stay on B1 and deploy outside class hours with `npm run deploy:azure`.

### Instructor accounts and passwords

The seed login `instructor` / `ProCloud-G18` is a **lab convenience**. Change it for any shared or long-lived deployment, and rotate `INSTRUCTOR_SIGNUP_CODE` if it was ever shared. Do not publish the signup code in student handouts.

Keep the App Service and the storage account in the **same Azure region** (Central India) — see `02-infrastructure.md`.



Storage picks itself in this order: Azure blob, then a local file, then memory. Only the last one loses data, and the app puts an orange banner on every page when it lands there.

## Device and cabling state

The Lab map is configuration too, and it is per class:

| What | Reset with | Note |
| --- | --- | --- |
| Cabling | **Reset to design** on the Lab map | Keeps cables unplugged for lab-map tickets that are still open |
| Device configuration | Same button | Hostnames, addresses, VLANs, routes and NAT go back to the shipped design |

Shipped cabling and configuration live in `server/domain/lab/lab-map.js` and `server/domain/lab/net-sim.js`. Both are versioned (`MAP_SCHEMA`, `STATE_SCHEMA`); bumping a version migrates existing classes instead of wiping the work they have done.

## Software versions (lab)

- Node.js 18 or newer.
- Express 4.x.
- cookie-parser 1.x.

There is no separate application version table in a database. The app version in `package.json` is `1.0.0`.

## Ticket numbering

Tickets are `TKT-0001`, `TKT-0002`, … from `nextTicket` in the JSON store. After a seed, numbering starts again at 1.

## SLA numbers (change with care)

Stored in each class as `slaPolicy` (defaults from `server/data/seed-data.js` on first create). Instructors edit response and resolve times under **Class & students → Class SLA**.

| Priority | Response | Resolve |
| --- | --- | --- |
| Critical | 30 minutes | 6 hours |
| High | 1 hour | 12 hours |
| Medium | 2 hours | 24 hours |
| Low | 3 hours | 48 hours |

If you change the policy, re-seed or the dashboard will still use the old copy inside `db.json`.

## Rollback

- **Code:** use git history if the project is under version control. On Azure App Service, redeploy a previous zip or use deployment slots. On Vercel, promote an earlier deployment.
- **Data (deployed):** download the blob before experiments and upload it again to restore. Sessions reset either way.
- **Data (local):** keep a copy of `data/db.json`, replace the file, restart.
- **Bad seed:** delete `data/db.json` and start the server; a fresh one is created automatically.

## Dependencies of a typical ticket

A ticket points at:

- `requesterId` → `requesters[]`
- `assigneeId` → `users[]`
- `comments[].authorId` → `users[]`

Do not delete users from JSON while tickets still reference them. Re-seed instead.
