#!/usr/bin/env bash
# Deploy CCST Ticketing to Cloudflare (Workers + D1 + R2 + Assets).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! npx wrangler whoami &>/dev/null; then
  echo "Not logged in to Cloudflare. Run: npx wrangler login"
  exit 1
fi

echo "==> Ensure D1 database"
DB_NAME="ccst-ticketing"
if ! npx wrangler d1 list 2>/dev/null | grep -q "$DB_NAME"; then
  npx wrangler d1 create "$DB_NAME"
  echo "Update wrangler.toml database_id with the id printed above, then re-run."
  exit 1
fi

DB_ID="$(npx wrangler d1 list --json 2>/dev/null | node -e "
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8'));
const row=(j.result||j).find(d=>d.name==='ccst-ticketing');
if(!row) process.exit(2);
process.stdout.write(row.uuid||row.id);
")"
if [[ -n "$DB_ID" ]]; then
  node -e "
const fs=require('fs');
let t=fs.readFileSync('wrangler.toml','utf8');
t=t.replace(/database_id = \"REPLACE_AFTER_CREATE\"/g, 'database_id = \"'+process.argv[1]+'\"');
t=t.replace(/preview_database_id = \"REPLACE_AFTER_CREATE\"/g, 'preview_database_id = \"'+process.argv[1]+'\"');
fs.writeFileSync('wrangler.toml', t);
" "$DB_ID"
  echo "D1 id: $DB_ID"
fi

echo "==> Ensure R2 bucket"
npx wrangler r2 bucket create ccst-docsassets 2>/dev/null || true

echo "==> Apply D1 schema (remote)"
npx wrangler d1 execute ccst-ticketing --remote --file=./schemas/d1.sql

echo "==> Upload docs assets to R2 (if local docs-assets exist)"
if [[ -d backend/docs-assets ]]; then
  npx wrangler r2 object put ccst-docsassets/docs-catalog.json --file=backend/docs-assets/docs-catalog.json --content-type=application/json || true
  if [[ -d backend/docs-assets/docs-pdf ]]; then
    find backend/docs-assets/docs-pdf -type f -name '*.pdf' | while read -r f; do
      key="docs-pdf/$(basename "$f")"
      npx wrangler r2 object put "ccst-docsassets/$key" --file="$f" --content-type=application/pdf || true
    done
  fi
  if [[ -d backend/docs-assets/docs-art ]]; then
    find backend/docs-assets/docs-art -type f | while read -r f; do
      key="docs-art/$(basename "$f")"
      npx wrangler r2 object put "ccst-docsassets/$key" --file="$f" || true
    done
  fi
  if [[ -d backend/docs-assets/docs-md ]]; then
    find backend/docs-assets/docs-md -type f -name '*.md' | while read -r f; do
      key="docs-md/$(basename "$f")"
      npx wrangler r2 object put "ccst-docsassets/$key" --file="$f" --content-type=text/markdown || true
    done
  fi
fi

echo "==> Deploy Worker"
npx wrangler deploy

echo ""
echo "Next:"
echo "  1) npx wrangler secret put SESSION_SECRET"
echo "  2) npx wrangler secret put INSTRUCTOR_SIGNUP_CODE"
echo "  3) Point ccst.website DNS to this Worker (Cloudflare dashboard → Workers → Custom Domains)"
echo "  4) Optional: npm run migrate:cf-data   # copy Azure/Postgres state into D1"
echo "  5) Set R2_PUBLIC_BASE_URL in wrangler.toml [vars] once the bucket is public / custom-domained"
