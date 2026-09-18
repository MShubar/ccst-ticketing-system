#!/usr/bin/env bash
# Snapshot Azure Blob state (db.json + lab/*.json) into state/backups/<timestamp>/.
# Run before class or on a schedule (cron / GitHub Action / Azure Automation).
set -euo pipefail

RG="${AZURE_RESOURCE_GROUP:-ccst-ticketing}"
APP="${AZURE_WEBAPP_NAME:-ccst-ticketing}"
STORAGE="${AZURE_STORAGE_ACCOUNT:-ccstticketing}"
CONTAINER="${AZURE_STORAGE_CONTAINER:-state}"
STAMP="$(date -u '+%Y%m%dT%H%MZ')"
DEST_PREFIX="backups/${STAMP}"

echo "==> Backup ${STORAGE}/${CONTAINER} → ${DEST_PREFIX}/"

if [[ -z "${AZURE_STORAGE_KEY:-}" ]]; then
  AZURE_STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)"
fi

copy_blob() {
  local name="$1"
  local dest="${DEST_PREFIX}/${name}"
  az storage blob copy start \
    --account-name "$STORAGE" \
    --account-key "$AZURE_STORAGE_KEY" \
    --destination-container "$CONTAINER" \
    --destination-blob "$dest" \
    --source-container "$CONTAINER" \
    --source-blob "$name" \
    --source-account-name "$STORAGE" \
    --source-account-key "$AZURE_STORAGE_KEY" \
    -o none
  echo "  queued ${name} → ${dest}"
}

copy_blob "db.json"

while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  copy_blob "$name"
done < <(az storage blob list \
  --account-name "$STORAGE" \
  --account-key "$AZURE_STORAGE_KEY" \
  --container-name "$CONTAINER" \
  --prefix "lab/" \
  --query "[].name" -o tsv 2>/dev/null || true)

echo "==> Backup started at ${DEST_PREFIX}/ (async server-side copy)"
echo "    List: az storage blob list -c ${CONTAINER} --account-name ${STORAGE} --prefix ${DEST_PREFIX}/ -o table"
echo "    Marks CSV anytime from the app: Class & students → Export CSV"
