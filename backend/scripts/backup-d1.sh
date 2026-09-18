#!/usr/bin/env bash
# Snapshot the Cloudflare D1 `core` (+ lab docs) document into state/backups/<stamp>/.
# Requires wrangler auth and a local D1 binding name matching wrangler.toml.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="state/backups/d1-${STAMP}"
mkdir -p "$DEST"

DB_NAME="${D1_DATABASE_NAME:-}"
if [[ -z "$DB_NAME" ]]; then
  # Prefer the first [[d1_databases]] database_name from wrangler.toml
  DB_NAME="$(
    node -e "
      const fs=require('fs');
      const t=fs.readFileSync('wrangler.toml','utf8');
      const m=t.match(/database_name\\s*=\\s*\"([^\"]+)\"/);
      if(!m) process.exit(2);
      process.stdout.write(m[1]);
    "
  )"
fi

echo "Backing up D1 database: $DB_NAME → $DEST"
npx wrangler d1 export "$DB_NAME" --remote --output "$DEST/d1-export.sql"
echo "$STAMP" > "$DEST/stamp.txt"
echo "ok — D1 backup written to $DEST"
echo "Restore drill: npm run drill:restore -- $DEST"
