# Cloudflare deployment

Live:

- Worker: **https://ccst-ticketing.mohsen-salman099.workers.dev**
- Domain: **https://ccst.website** (Cloudflare zone active; Worker routes on apex + `www`)

| Piece | Status |
| --- | --- |
| API + Express | Workers (`nodejs_compat`) |
| UI | Workers Assets (`web/dist` React + `/classic` embed) |
| Database | D1 `ccst-ticketing` |
| Docs PDFs/art | R2 bucket `ccstwebsite` via `DOCS` (`/docs-*`) |
| Map presence DO | **MapRoom** Durable Object enabled (`MAP_ROOM`) |
| Domain `ccst.website` | Zone active; NS → `aspen` / `houston`; routes → `ccst-ticketing` |

## Commands

```bash
npx wrangler login
npm run upload:r2          # sync backend/docs-assets → R2 ccstwebsite
npm run cf:deploy
DATABASE_URL='…' npm run migrate:d1
npx wrangler secret put SESSION_SECRET
npx wrangler secret put INSTRUCTOR_SIGNUP_CODE
```

## Durable Objects (map presence)

Enabled: `MAP_ROOM` → `MapRoom` (SQLite-backed class migration `v1`). Redeploy with `npm run cf:deploy` after config changes.

Azure resource group `ccst-ticketing` was deleted (App Service, Postgres, Blob, certs). Rollback is Cloudflare only.
