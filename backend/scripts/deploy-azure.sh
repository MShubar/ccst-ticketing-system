#!/usr/bin/env bash
# Deploy CCST Ticketing to Azure App Service (frontend + backend).
# Prerequisites: Azure CLI (`az login`), resource group ccst-ticketing, storage account
# ccstticketing with container `state`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RG="${AZURE_RESOURCE_GROUP:-ccst-ticketing}"
APP="${AZURE_WEBAPP_NAME:-ccst-ticketing}"
PLAN="${AZURE_APP_SERVICE_PLAN:-ccst-ticketing-plan}"
LOC="${AZURE_LOCATION:-centralindia}"
STORAGE="${AZURE_STORAGE_ACCOUNT:-ccstticketing}"
CONTAINER="${AZURE_STORAGE_CONTAINER:-state}"

echo "==> Resource group: $RG  App: $APP  Location: $LOC"

if ! az appservice plan show -g "$RG" -n "$PLAN" &>/dev/null; then
  echo "==> Creating App Service plan $PLAN"
  az appservice plan create -g "$RG" -n "$PLAN" --sku B1 --is-linux --location "$LOC" -o none
fi

if ! az webapp show -g "$RG" -n "$APP" &>/dev/null; then
  echo "==> Creating web app $APP"
  az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:22-lts" -o none
fi

if [[ -z "${AZURE_BLOB_SAS_URL:-}" ]]; then
  EXISTING_SAS="$(az webapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='AZURE_BLOB_SAS_URL'].value" -o tsv 2>/dev/null || true)"
  if [[ -n "$EXISTING_SAS" ]]; then
    export AZURE_BLOB_SAS_URL="$EXISTING_SAS"
  else
    echo "==> Generating container SAS for $STORAGE/$CONTAINER"
    KEY="$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)"
    END="$(date -u -v+5y '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+5 years' '+%Y-%m-%dT%H:%MZ')"
    SAS="$(az storage container generate-sas \
      --account-name "$STORAGE" \
      --account-key "$KEY" \
      --name "$CONTAINER" \
      --permissions racwdl \
      --expiry "$END" \
      -o tsv)"
    export AZURE_BLOB_SAS_URL="https://${STORAGE}.blob.core.windows.net/${CONTAINER}?${SAS}"
  fi
fi

if [[ -z "${SESSION_SECRET:-}" ]]; then
  EXISTING_SECRET="$(az webapp config appsettings list -g "$RG" -n "$APP" --query "[?name=='SESSION_SECRET'].value" -o tsv 2>/dev/null || true)"
  if [[ -n "$EXISTING_SECRET" ]]; then
    export SESSION_SECRET="$EXISTING_SECRET"
  else
    export SESSION_SECRET="$(openssl rand -hex 24)"
  fi
fi

SETTINGS=(
  "AZURE_BLOB_SAS_URL=$AZURE_BLOB_SAS_URL"
  "NODE_ENV=production"
  "SESSION_SECRET=$SESSION_SECRET"
  "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
  "WEBSITE_NODE_DEFAULT_VERSION=~22"
)
STATIC_BASE="${AZURE_STATIC_BASE_URL:-https://${STORAGE}.blob.core.windows.net/docsassets}"
SETTINGS+=("AZURE_STATIC_BASE_URL=$STATIC_BASE")
if [[ -n "${DATABASE_URL:-}" ]]; then
  SETTINGS+=("DATABASE_URL=$DATABASE_URL")
  SETTINGS+=("PERSIST_BACKEND=${PERSIST_BACKEND:-sql}")
fi
if [[ -n "${INSTRUCTOR_SIGNUP_CODE:-}" ]]; then
  SETTINGS+=("INSTRUCTOR_SIGNUP_CODE=$INSTRUCTOR_SIGNUP_CODE")
fi
if [[ -n "${BOOTSTRAP_INSTRUCTORS:-}" ]]; then
  SETTINGS+=("BOOTSTRAP_INSTRUCTORS=$BOOTSTRAP_INSTRUCTORS")
fi

echo "==> App settings"
az webapp config appsettings set -g "$RG" -n "$APP" --settings "${SETTINGS[@]}" -o none
az webapp update -g "$RG" -n "$APP" --https-only true -o none
az webapp config set -g "$RG" -n "$APP" --startup-file "npm start" -o none

echo "==> Installing production Node dependencies for the zip"
(
  cd "$ROOT"
  npm ci --omit=dev 2>/dev/null || npm install --omit=dev
)

ZIP="/tmp/ccst-ticketing-azure-deploy.zip"
echo "==> Packaging $ZIP (classic frontend + backend; React sources kept in web/)"
rm -f "$ZIP"
(
  cd "$ROOT"
  zip -r "$ZIP" . \
    -x "web/node_modules/*" \
    -x "web/dist/*" \
    -x ".git/*" \
    -x "backend/var/*" \
    -x "backend/docs-assets/*" \
    -x ".tmp-docs-pdf/*" \
    -x "*.pkt" \
    -x ".env*" \
    -x ".DS_Store" \
    -x "agent-transcripts/*" \
    -x ".cursor/*" \
    >/dev/null
)

echo "==> Deploying zip (classic UI at /; Oryx build off)"
az webapp deploy -g "$RG" -n "$APP" --src-path "$ZIP" --type zip --async false -o none || \
  az webapp deployment source config-zip -g "$RG" -n "$APP" --src "$ZIP" -o none

az webapp start -g "$RG" -n "$APP" -o none || true
az webapp restart -g "$RG" -n "$APP" -o none || true

HOST="$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
echo ""
echo "Deployed: https://${HOST}"
echo "Classic UI: https://${HOST}/  (and https://ccst.website/)"
echo "React app remains in repo under web/ (npm run web:dev) — not the live site root."
echo "Database: Azure Blob ${STORAGE}/${CONTAINER}/db.json (and Postgres when DATABASE_URL is set)"
