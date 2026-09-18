#!/usr/bin/env bash
# Non-destructive restore *drill*: verifies a D1 backup file exists and that
# /api/health still answers. Does NOT push SQL into production unless
# CONFIRM_RESTORE=YES is set (dangerous — instructor only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${1:-}"
if [[ -z "$BACKUP_DIR" ]]; then
  BACKUP_DIR="$(ls -1dt state/backups/d1-* 2>/dev/null | head -1 || true)"
fi
if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "No backup folder found. Run: npm run backup:d1" >&2
  exit 1
fi
SQL="$BACKUP_DIR/d1-export.sql"
if [[ ! -f "$SQL" ]]; then
  echo "Missing $SQL" >&2
  exit 1
fi

BYTES="$(wc -c < "$SQL" | tr -d ' ')"
echo "Drill backup: $BACKUP_DIR ($BYTES bytes)"
echo "Checking live health…"
HEALTH_URL="${HEALTH_URL:-https://ccst-ticketing.mohsen-salman099.workers.dev/api/health}"
BODY="$(curl -fsS --max-time 30 "$HEALTH_URL")"
echo "$BODY" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    if(!j.ok) { console.error('health not ok', j); process.exit(1); }
    console.log('health ok — storageMode=' + j.storageMode +
      (j.d1LagWarn ? ' (D1 lag WARN)' : '') +
      (j.coreGate?.coreGateOk === false ? ' (CoreGate FAIL)' : ''));
  });
"

if [[ "${CONFIRM_RESTORE:-}" == "YES" ]]; then
  DB_NAME="${D1_DATABASE_NAME:-}"
  if [[ -z "$DB_NAME" ]]; then
    DB_NAME="$(
      node -e "
        const fs=require('fs');
        const t=fs.readFileSync('wrangler.toml','utf8');
        const m=t.match(/database_name\\s*=\\s*\\\"([^\\\"]+)\\\"/);
        if(!m) process.exit(2);
        process.stdout.write(m[1]);
      "
    )"
  fi
  echo "CONFIRM_RESTORE=YES — importing $SQL into remote $DB_NAME"
  npx wrangler d1 execute "$DB_NAME" --remote --file="$SQL"
  echo "Import finished. Re-check /api/health and sign in as instructor."
else
  echo "Dry run only. To actually restore (destructive): CONFIRM_RESTORE=YES npm run drill:restore -- $BACKUP_DIR"
fi
