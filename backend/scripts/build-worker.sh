#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
mkdir -p worker/dist
# CF_WORKER=1 lets store.js drop the Postgres path at bundle time.
# iconv-lite / mime-db stubs drop ~600KB+ of encoding + mime tables unused on Workers.
npx esbuild worker/entry.js \
  --bundle \
  --format=esm \
  --platform=node \
  --target=es2022 \
  --outfile=worker/dist/index.js \
  --conditions=worker,module,import,require,default \
  --main-fields=module,main \
  --define:process.env.CF_WORKER=\"1\" \
  --alias:iconv-lite="$ROOT/worker/stubs/iconv-lite.js" \
  --alias:mime-db="$ROOT/worker/stubs/mime-db.js" \
  --external:cloudflare:node \
  --external:cloudflare:workers \
  --external:cloudflare:sockets \
  --external:pg \
  --external:pdfkit \
  --log-limit=0
wc -c worker/dist/index.js
echo "Bundled worker/dist/index.js"
