# SQL storage (PostgreSQL)

Production can store classroom state in **Azure Database for PostgreSQL** instead of the Azure blob `db.json`.

## How it works

- App setting `DATABASE_URL` points at Postgres.
- Table `documents` holds:
  - `core` — main document (users, tickets, classes, …)
  - `lab:<classId>` — map / devices / portals per class (same split as blob labs)
- Domain code still uses the in-memory document API (`readDb` / `withDb`); only the persistence backend changes.
- Set `PERSIST_BACKEND=json` to force the old blob/file path without removing `DATABASE_URL` (rollback).

## One-time migrate from blob

```bash
export DATABASE_URL='postgresql://ccstadmin:...@ccst-ticketing-pg.postgres.database.azure.com:5432/postgres?sslmode=require'
export AZURE_BLOB_SAS_URL='...'   # from App Service settings
npm run migrate:sql
```

Then on App Service:

```bash
az webapp config appsettings set -g ccst-ticketing -n ccst-ticketing --settings \
  DATABASE_URL="$DATABASE_URL" \
  PERSIST_BACKEND=sql
az webapp restart -g ccst-ticketing -n ccst-ticketing
```

Keep `AZURE_BLOB_SAS_URL` for `npm run backup:azure` and instant rollback.

## Health

`/api/health` should show `"storageMode":"sql"` and `"blobOk":true` (meaning durable store is readable).
