# Cloudflare deployment

This app can run entirely on Cloudflare:

| Piece | Cloudflare product |
| --- | --- |
| API + classroom logic | **Workers** (Express via `nodejs_compat` + `httpServerHandler`) |
| UI (`frontend/`) | **Workers Assets** |
| Database | **D1** (`documents` table, same JSON docs as Postgres) |
| Docs PDFs/images | **R2** (`ccst-docsassets`, served via Worker) |
| Live map cursors | **Durable Object** `MapRoom` |
| Domain | Cloudflare DNS / custom domain on the Worker |

## Cost

- Domain (`ccst.website`): **paid yearly** (registrar at-cost)
- Workers Paid: **~$5/mo** recommended for a 40-student class (Free = 100k req/day is too small)
- D1 + R2: usually within free allowances at class size

## One-time setup

```bash
npx wrangler login
npm run deploy:cloudflare
npx wrangler secret put SESSION_SECRET
npx wrangler secret put INSTRUCTOR_SIGNUP_CODE
```

Migrate existing Azure/Postgres class data:

```bash
DATABASE_URL='postgresql://...' npm run migrate:d1
# or
LOCAL_DB=./export-db.json npm run migrate:d1
```

## Custom domain (`ccst.website`)

1. Add the zone to Cloudflare (or transfer the domain into Cloudflare Registrar).
2. Workers → `ccst-ticketing` → **Triggers → Custom Domains** → add `ccst.website` and `www`.
3. Keep Azure DNS only until the Worker health check passes, then switch the apex.

## Local CF dev

```bash
npm run cf:dev
```

Azure App Service remains deployable with `npm run deploy:azure` until you retire it.
