#!/usr/bin/env node
/**
 * Build backend/docs-assets/docs-catalog.json from docs-md (+ pdf/art presence).
 * Uploaded with the docs; /api/health probes it to check the static assets.
 */
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const mdDir = path.join(backendRoot, "docs-assets", "docs-md");
const pdfDir = path.join(backendRoot, "docs-assets", "docs-pdf");
const outFile = path.join(backendRoot, "docs-assets", "docs-catalog.json");

const DOC_THUMBS = {
  "01-system": "docs-lifecycle",
  "02-infrastructure": "docs-map",
  "03-process": "docs-process",
  "04-incident-response": "docs-incident",
  "05-user-guide": "docs-hero",
  "06-compliance": "docs-privacy",
  "07-knowledge-base": "docs-kb",
  "08-configuration": "docs-class-setup",
  "09-sla-kpis": "docs-sla",
  "10-accounts": "docs-accounts",
  "11-simple-fixes": "docs-ipconfig",
  "12-class-lab": "docs-map",
  "13-instructor-class-day": "docs-class-setup",
  "14-instructor-guide": "docs-class-setup"
};

const base = String(process.env.AZURE_STATIC_BASE_URL || "").trim().replace(/\/+$/, "") || null;

function pdfUrl(name) {
  return base ? `${base}/docs-pdf/${name}` : `/docs-pdf/${name}`;
}
function artUrl(name) {
  return base ? `${base}/docs-art/${name}` : `/docs-art/${name}`;
}
function mdUrl(name) {
  return base ? `${base}/docs-md/${name}` : `/docs-md/${name}`;
}

const files = fs.readdirSync(mdDir).filter((f) => f.endsWith(".md")).sort();
const items = files.map((file) => {
  const id = file.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(mdDir, file), "utf8");
  const title = (raw.match(/^#\s+(.+)$/m) || [null, file])[1];
  const pdfFile = `${id}.pdf`;
  const hasPdf = fs.existsSync(path.join(pdfDir, pdfFile));
  const thumb = `${DOC_THUMBS[id] || "docs-hero"}.png`;
  return {
    id,
    file,
    title,
    hasPdf,
    md: mdUrl(file),
    pdf: hasPdf ? pdfUrl(pdfFile) : null,
    thumb: artUrl(thumb)
  };
});

const catalog = {
  generatedAt: new Date().toISOString(),
  staticBase: base,
  artBase: base ? `${base}/docs-art` : "/docs-art",
  items,
  // In-app Documentation list: guides that have a printable PDF.
  appItems: items.filter((i) => i.hasPdf)
};

fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${path.relative(backendRoot, outFile)} (${items.length} md, ${catalog.appItems.length} with PDF)`);
