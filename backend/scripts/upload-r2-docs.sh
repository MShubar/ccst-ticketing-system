#!/usr/bin/env bash
# Upload classroom docs into R2 bucket ccstwebsite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
BUCKET="${1:-ccstwebsite}"
SRC="backend/docs-assets"

if [[ ! -d "$SRC" ]]; then
  echo "Missing $SRC"
  exit 1
fi

npx wrangler r2 bucket create "$BUCKET" 2>/dev/null || true

put() {
  local file="$1"
  local key="$2"
  local ctype="$3"
  echo "→ $key"
  npx wrangler r2 object put "$BUCKET/$key" --file="$file" --content-type="$ctype" --remote
}

put "$SRC/docs-catalog.json" "docs-catalog.json" "application/json"

if [[ -d "$SRC/docs-pdf" ]]; then
  find "$SRC/docs-pdf" -type f -name '*.pdf' | while read -r f; do
    put "$f" "docs-pdf/$(basename "$f")" "application/pdf"
  done
fi
if [[ -d "$SRC/docs-art" ]]; then
  find "$SRC/docs-art" -type f | while read -r f; do
    case "$f" in
      *.png) ct=image/png ;;
      *.jpg|*.jpeg) ct=image/jpeg ;;
      *.webp) ct=image/webp ;;
      *.svg) ct=image/svg+xml ;;
      *) ct=application/octet-stream ;;
    esac
    put "$f" "docs-art/$(basename "$f")" "$ct"
  done
fi
if [[ -d "$SRC/docs-md" ]]; then
  find "$SRC/docs-md" -type f -name '*.md' | while read -r f; do
    put "$f" "docs-md/$(basename "$f")" "text/markdown; charset=utf-8"
  done
fi

echo "Done. Docs will be served by the Worker from env.DOCS."
