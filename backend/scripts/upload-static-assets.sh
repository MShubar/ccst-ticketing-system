#!/usr/bin/env bash
# Upload docs markdown, PDFs, and art to Azure Blob container `docsassets` (public read).
# Usage: npm run upload:static
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RG="${AZURE_RESOURCE_GROUP:-ccst-ticketing}"
STORAGE="${AZURE_STORAGE_ACCOUNT:-ccstticketing}"
CONTAINER="${AZURE_STATIC_CONTAINER:-docsassets}"
PDF_DIR="${ROOT}/backend/docs-assets/docs-pdf"
ART_DIR="${ROOT}/backend/docs-assets/docs-art"
MD_DIR="${ROOT}/backend/docs-assets/docs-md"
BASE="https://${STORAGE}.blob.core.windows.net/${CONTAINER}"

echo "==> Static assets → ${STORAGE}/${CONTAINER}"

if [[ ! -d "$PDF_DIR" || ! -d "$ART_DIR" || ! -d "$MD_DIR" ]]; then
  echo "Missing backend/docs-assets (docs-pdf, docs-art, or docs-md)."
  exit 1
fi

if [[ -z "${AZURE_STORAGE_KEY:-}" ]]; then
  AZURE_STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)"
fi

if ! az storage container show --account-name "$STORAGE" --account-key "$AZURE_STORAGE_KEY" --name "$CONTAINER" &>/dev/null; then
  echo "==> Creating public container $CONTAINER"
  az storage container create \
    --account-name "$STORAGE" \
    --account-key "$AZURE_STORAGE_KEY" \
    --name "$CONTAINER" \
    --public-access blob \
    -o none
else
  az storage container set-permission \
    --account-name "$STORAGE" \
    --account-key "$AZURE_STORAGE_KEY" \
    --name "$CONTAINER" \
    --public-access blob \
    -o none
fi

echo "==> Building docs-catalog.json"
AZURE_STATIC_BASE_URL="$BASE" node "${ROOT}/backend/scripts/build-docs-catalog.js"

echo "==> Uploading docs-md/"
az storage blob upload-batch \
  --account-name "$STORAGE" \
  --account-key "$AZURE_STORAGE_KEY" \
  --destination "$CONTAINER" \
  --destination-path docs-md \
  --source "$MD_DIR" \
  --overwrite true \
  --content-type "text/markdown; charset=utf-8" \
  -o none

echo "==> Uploading docs-pdf/"
az storage blob upload-batch \
  --account-name "$STORAGE" \
  --account-key "$AZURE_STORAGE_KEY" \
  --destination "$CONTAINER" \
  --destination-path docs-pdf \
  --source "$PDF_DIR" \
  --overwrite true \
  --content-type application/pdf \
  -o none

echo "==> Uploading docs-art/"
az storage blob upload-batch \
  --account-name "$STORAGE" \
  --account-key "$AZURE_STORAGE_KEY" \
  --destination "$CONTAINER" \
  --destination-path docs-art \
  --source "$ART_DIR" \
  --overwrite true \
  -o none

while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  az storage blob update \
    --account-name "$STORAGE" \
    --account-key "$AZURE_STORAGE_KEY" \
    --container-name "$CONTAINER" \
    --name "docs-art/${name}" \
    --content-type "image/png" \
    -o none 2>/dev/null || true
done < <(basename -a "$ART_DIR"/*.png)

echo "==> Uploading docs-catalog.json"
az storage blob upload \
  --account-name "$STORAGE" \
  --account-key "$AZURE_STORAGE_KEY" \
  --container-name "$CONTAINER" \
  --name docs-catalog.json \
  --file "${ROOT}/backend/docs-assets/docs-catalog.json" \
  --overwrite true \
  --content-type "application/json; charset=utf-8" \
  -o none

echo ""
echo "Uploaded markdown + PDF + art + catalog."
echo "  ${BASE}"
echo "  ${BASE}/docs-catalog.json"
echo "Set on App Service: AZURE_STATIC_BASE_URL=${BASE}"
