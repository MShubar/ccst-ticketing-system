#!/usr/bin/env node
/**
 * Import live Azure blob state (db.json + lab/*.json) into Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgres://... AZURE_BLOB_SAS_URL=... node scripts/migrate-blob-to-sql.js
 *
 * Safe to re-run: upserts documents.
 */
const sqlStore = require("../data/sql-store");

async function azureFetch(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  return res;
}

function azureBlobUrl(name) {
  const url = new URL(process.env.AZURE_BLOB_SAS_URL);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${String(name).replace(/^\/+/, "")}`;
  return url.toString();
}

async function listLabBlobs() {
  // Flat listing via Azure REST list with prefix=lab/
  const base = new URL(process.env.AZURE_BLOB_SAS_URL);
  const container = base.pathname.replace(/\/+$/, "");
  const list = new URL(base.origin + container);
  list.search = base.search;
  list.searchParams.set("restype", "container");
  list.searchParams.set("comp", "list");
  list.searchParams.set("prefix", "lab/");
  const res = await azureFetch(list.toString());
  if (!res.ok) throw new Error(`list labs failed: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
  return names.filter((n) => n.startsWith("lab/") && n.endsWith(".json"));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.AZURE_BLOB_SAS_URL) throw new Error("AZURE_BLOB_SAS_URL is required");

  await sqlStore.ensureSchema();

  const coreRes = await azureFetch(azureBlobUrl("db.json"));
  if (!coreRes.ok) throw new Error(`core read failed: ${coreRes.status}`);
  const coreText = await coreRes.text();
  const core = JSON.parse(coreText);
  core.meta = core.meta || {};
  core.meta.labsSplit = true;
  // Strip lab blobs from core if present
  core.mapByClass = {};
  core.devicesByClass = {};
  core.portalsByClass = {};
  await sqlStore.writeCore(JSON.stringify(core));
  console.log("Imported core document");

  const labs = await listLabBlobs();
  console.log(`Found ${labs.length} lab blob(s)`);
  for (const name of labs) {
    const classId = decodeURIComponent(name.replace(/^lab\//, "").replace(/\.json$/, ""));
    const res = await azureFetch(azureBlobUrl(name));
    if (!res.ok) {
      console.warn("skip", name, res.status);
      continue;
    }
    const lab = JSON.parse(await res.text());
    await sqlStore.writeLab(classId, lab);
    console.log("Imported lab", classId);
  }

  await sqlStore.ping();
  console.log("Done. Set PERSIST_BACKEND=sql (or leave default with DATABASE_URL) on the web app.");
  await sqlStore.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sqlStore.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
