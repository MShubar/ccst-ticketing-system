#!/usr/bin/env bash
# Copy the classic SPA into web/public/classic so React can embed the lab map
# (and so /classic remains available after wrangler assets switch to web/dist).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/frontend"
DEST="$ROOT/web/public/classic"
rm -rf "$DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude '.DS_Store' "$SRC/" "$DEST/"
python3 - <<PY
from pathlib import Path
html = Path(r"$DEST") / "index.html"
text = html.read_text(encoding="utf-8")
text = text.replace('href="/css/', 'href="/classic/css/')
text = text.replace('src="/js/', 'src="/classic/js/')
text = text.replace('import("/js/', 'import("/classic/js/')
html.write_text(text, encoding="utf-8")
print("classic index rewritten for /classic prefix")
PY
echo "Prepared $DEST"
