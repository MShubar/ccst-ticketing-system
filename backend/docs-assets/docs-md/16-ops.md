# Operations runbook

Day-to-day ops for the live CCST Ticketing classroom app.

## URLs

| What | Where |
| --- | --- |
| Class app | https://ccst.website |
| Cloudflare Worker | https://ccst-ticketing.mohsen-salman099.workers.dev |
| Health | `/api/health` |
| Instructor ops | `/api/ops` (signed-in instructor) |

Healthy response includes `"ok":true`, `"storageMode":"d1"` (Cloudflare) or `"sql"` (Azure), CoreGate probe when on D1, and `"classroomAiMode":"classroom"`.

## Ticket storage (hot vs archive)

Closed/resolved tickets older than the grace window (default 3 days), or past the per-class hot cap (default 200), are peeled into D1 docs `archive:tickets:<classId>`. The hot core stays small so every `readDb` stays fast.

| Action | How |
| --- | --- |
| Auto peel | Every ticket save |
| Force compact | Instructor **Class & students → Compact storage**, or `POST /api/tickets/compact` with `{ "force": true }` |
| Browse archived | Ticket list with `status=closed` / `resolved` / `archive=1` |
| Env knobs | `TICKET_HOT_GRACE_DAYS`, `TICKET_HOT_MAX_PER_CLASS` |

Open tickets stay hot until closed/resolved (or the class queue is cleared).


| Signal | Where |
| --- | --- |
| Health + D1 lag warn | `GET /api/health` → `d1LagWarn`, `coreGate` |
| Slow requests / write timings | `GET /api/ops` or `metrics` on health |
| Daily probe | GitHub Actions **Production health** |
| Parallel health drill | `npm run drill:chaos` |

`d1LagWarn: true` means CoreGate (authoritative) and D1 mirror disagree briefly — ticket **writes** still go through CoreGate; students may briefly see slow saves (UI warns after ~1.6s).

## Static docs (PDFs / pictures)

R2 / blob holds docs. Health includes `staticOk` and `staticBase`.

```bash
npm run upload:r2
# or legacy Azure:
npm run upload:static
```

## Before class

1. Open `/api/health` — confirm `ok` and `storageMode` is `d1` or `sql` (not `memory`).
2. On D1: confirm `coreGate.coreGateOk` is not `false`.
3. Sign in as instructor; open **Class & students** and check the roster.
4. Snapshot: `npm run backup:d1` (Cloudflare) or `npm run backup:azure` (legacy).

## Deploy

```bash
npm test
npm run cf:deploy
```

## Backups

| Layer | How |
| --- | --- |
| D1 (Cloudflare) | `npm run backup:d1` → `state/backups/d1-<stamp>/d1-export.sql` |
| Restore drill | `npm run drill:restore` (dry run). Destructive: `CONFIRM_RESTORE=YES npm run drill:restore -- <folder>` |
| Postgres (Azure) | Flexible Server automated backups / PITR |
| Blob (legacy) | `npm run backup:azure` |
| Marks / KPIs | Class & students → Export CSV anytime |

Suggested habit: run `npm run backup:d1` once before a new cohort week.

## Hardening

| Control | Notes |
| --- | --- |
| Login / signup rate limit | 12 / 6 attempts per minute per IP (per Worker isolate) |
| CoreGate | Single-threaded ticket merge — concurrent saves do not clobber |
| SESSION_SECRET | Must not be the built-in default in production |

## Monitoring

GitHub Actions workflow **Production health** curls `/api/health` daily (05:00 UTC). Failures show on the repo Actions tab.

If health is 503:

1. Confirm Worker / D1 bindings in the Cloudflare dashboard.
2. Confirm `SESSION_SECRET` is set (`wrangler secret put SESSION_SECRET`).
3. Check `coreGate` / `blobError` / `staticError` fields on the health JSON.

## Rollback

1. Prefer D1 export restore after a dry-run drill (`npm run drill:restore`).
2. Azure path: Postgres PITR; blob copies under `state/backups/` for the older JSON document path.

## Ops surface (known)

- **Dual UI:** classic `frontend/` is the live classroom; React `web/` shells/embeds it. Do not treat them as two products.
- **Worker bundle:** large because the lab simulator ships in-process — prefer feature cuts over micro-splitting unless cold starts hurt class day.
- **Staging:** optional; use a second Worker name if you want dry-run deploys before cohort week.

## What we intentionally do not do

- Full relational tables for every ticket field (documents + CoreGate are enough for one class).
- PagerDuty / full APM for a classroom lab (health + ops + Actions cover the day-of need).
