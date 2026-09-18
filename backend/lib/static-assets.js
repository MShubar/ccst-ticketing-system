/**
 * Classroom docs (md/pdf/art).
 *
 * Sources (first match wins for public URLs):
 *   R2_PUBLIC_BASE_URL — public R2 / CDN base
 *   AZURE_STATIC_BASE_URL — Azure Blob base
 *   CF_WORKER=1 + DOCS binding — served from R2 via /docs-* routes
 *   backend/docs-assets/ — local files
 *   else DEFAULT_STATIC_BASE (Azure) so prod-like envs still work without the folder
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const { cfEnv } = require("./cf-env");

const DEFAULT_STATIC_BASE = "https://ccstticketing.blob.core.windows.net/docsassets";
const assetsRoot = path.join(typeof __dirname !== "undefined" ? __dirname : "/tmp", "..", "docs-assets");
const assetsPdfDir = path.join(assetsRoot, "docs-pdf");
const assetsArtDir = path.join(assetsRoot, "docs-art");
const assetsMdDir = path.join(assetsRoot, "docs-md");

function contentTypeFor(key) {
  const lower = String(key || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function usingR2Binding() {
  return process.env.CF_WORKER === "1" || Boolean(cfEnv()?.DOCS);
}

function staticBaseUrl() {
  const r2 = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (r2) return r2;
  const raw = String(process.env.AZURE_STATIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (raw) return raw;
  // On Cloudflare, docs come from the DOCS R2 binding via /docs-* routes.
  if (usingR2Binding()) return null;
  if (!fs.existsSync(assetsRoot)) return DEFAULT_STATIC_BASE;
  return null;
}

function usingBlobStatic() {
  return Boolean(staticBaseUrl()) || usingR2Binding();
}

function pdfUrl(fileName) {
  const name = String(fileName || "").replace(/^\/+/, "");
  const base = staticBaseUrl();
  if (base) return `${base}/docs-pdf/${name}`;
  return `/docs-pdf/${name}`;
}

function artUrl(fileName) {
  const name = String(fileName || "").replace(/^\/+/, "");
  const base = staticBaseUrl();
  if (base) return `${base}/docs-art/${name}`;
  return `/docs-art/${name}`;
}

function mdUrl(fileName) {
  const name = String(fileName || "").replace(/^\/+/, "");
  const base = staticBaseUrl();
  if (base) return `${base}/docs-md/${name}`;
  return `/docs-md/${name}`;
}

function artBaseUrl() {
  const base = staticBaseUrl();
  if (base) return `${base}/docs-art`;
  return "/docs-art";
}

function catalogUrl() {
  const base = staticBaseUrl();
  if (base) return `${base}/docs-catalog.json`;
  if (usingR2Binding()) return "/docs-catalog.json";
  return null;
}

function localCatalogPath() {
  return path.join(assetsRoot, "docs-catalog.json");
}

function localPdfPath(fileName) {
  return path.join(assetsPdfDir, fileName);
}

function localArtPath(fileName) {
  return path.join(assetsArtDir, fileName);
}

function localPdfExists(fileName) {
  try {
    return fs.existsSync(localPdfPath(fileName));
  } catch {
    return false;
  }
}

/**
 * Serve docs from the Worker DOCS R2 binding (request-scoped — look up lazily).
 */
function mountR2Docs(app) {
  if (process.env.CF_WORKER !== "1" && !cfEnv()?.DOCS) return false;

  const bucket = () => cfEnv()?.DOCS || null;

  const sendObject = async (res, key) => {
    const docs = bucket();
    if (!docs) return res.status(503).json({ error: "R2 DOCS binding not available" });
    const obj = await docs.get(key);
    if (!obj) return res.status(404).end();
    const headers = {
      "Content-Type": contentTypeFor(key),
      "Cache-Control": "public, max-age=300"
    };
    const buf = Buffer.from(await obj.arrayBuffer());
    res.set(headers);
    res.send(buf);
  };

  app.get("/docs-catalog.json", async (_req, res) => {
    await sendObject(res, "docs-catalog.json");
  });
  app.use("/docs-pdf", async (req, res) => {
    const file = String(req.path || "").replace(/^\/+/, "");
    if (!file || file.includes("..")) return res.status(400).end();
    await sendObject(res, `docs-pdf/${file}`);
  });
  app.use("/docs-art", async (req, res) => {
    const file = String(req.path || "").replace(/^\/+/, "");
    if (!file || file.includes("..")) return res.status(400).end();
    await sendObject(res, `docs-art/${file}`);
  });
  app.use("/docs-md", async (req, res) => {
    const file = String(req.path || "").replace(/^\/+/, "");
    if (!file || file.includes("..")) return res.status(400).end();
    await sendObject(res, `docs-md/${file}`);
  });
  return true;
}

/**
 * Blob mode: redirect /docs-* to Azure/R2 public URL.
 * Cloudflare: serve from DOCS binding.
 * Local mode: serve from backend/docs-assets.
 */
function mountStaticRedirects(app) {
  if (mountR2Docs(app)) return;

  const base = staticBaseUrl();
  if (base) {
    const redirectTo = (prefix) => (req, res) => {
      const file = String(req.path || "").replace(/^\/+/, "");
      if (!file || file.includes("..")) return res.status(400).end();
      res.redirect(302, `${base}/${prefix}/${file}`);
    };
    app.use("/docs-pdf", redirectTo("docs-pdf"));
    app.use("/docs-art", redirectTo("docs-art"));
    app.use("/docs-md", redirectTo("docs-md"));
    return;
  }

  app.use("/docs-pdf", express.static(assetsPdfDir, { fallthrough: false }));
  app.use("/docs-art", express.static(assetsArtDir, { fallthrough: false }));
  app.use("/docs-md", express.static(assetsMdDir, { fallthrough: false }));
}

module.exports = {
  staticBaseUrl,
  usingBlobStatic,
  usingR2Binding,
  pdfUrl,
  artUrl,
  mdUrl,
  artBaseUrl,
  catalogUrl,
  localCatalogPath,
  localPdfExists,
  localPdfPath,
  localArtPath,
  assetsPdfDir,
  assetsArtDir,
  assetsMdDir,
  mountR2Docs,
  mountStaticRedirects
};
