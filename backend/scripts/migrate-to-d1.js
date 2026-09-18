#!/usr/bin/env node
/**
 * Copy classroom state into Cloudflare D1 using bound parameters
 * (avoids SQLITE_TOOBIG from giant SQL string literals).
 *
 *   DATABASE_URL=... node backend/scripts/migrate-to-d1.js
 *   LOCAL_DB=./db.json node backend/scripts/migrate-to-d1.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "e5fe5b17fa6c34d26bac4b5afa16db66";
const DATABASE_ID = process.env.CF_D1_ID || "8d820bf0-1990-49b9-aba2-909e84fb7d0f";

function readWranglerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const cfg = path.join(os.homedir(), "Library/Preferences/.wrangler/config/default.toml");
  const text = fs.readFileSync(cfg, "utf8");
  const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("No Cloudflare token — run npx wrangler login or set CLOUDFLARE_API_TOKEN");
  return m[1];
}

async function loadSource() {
  const local = process.env.LOCAL_DB;
  if (local && fs.existsSync(local)) {
    return { text: fs.readFileSync(local, "utf8"), labs: {} };
  }
  if (!process.env.DATABASE_URL) throw new Error("Set LOCAL_DB or DATABASE_URL");
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });
  const core = await pool.query(`SELECT body::text AS text FROM documents WHERE doc_key = 'core' LIMIT 1`);
  const labsRows = await pool.query(`SELECT doc_key, body::text AS text FROM documents WHERE doc_key LIKE 'lab:%'`);
  await pool.end();
  const labs = {};
  for (const row of labsRows.rows) labs[String(row.doc_key).slice(4)] = row.text;
  return { text: core.rows[0]?.text || null, labs };
}

async function d1Query(token, sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql, params })
    }
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }
  return json;
}

async function main() {
  const token = readWranglerToken();
  const { text, labs } = await loadSource();
  if (!text) throw new Error("No core document found");

  console.log(`Core size ${text.length} bytes; labs=${Object.keys(labs).length}`);

  await d1Query(
    token,
    `CREATE TABLE IF NOT EXISTS documents (
      doc_key TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  await d1Query(
    token,
    `INSERT INTO documents (doc_key, body, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`,
    ["core", text]
  );
  console.log("Wrote core");

  for (const [classId, labText] of Object.entries(labs)) {
    const body = typeof labText === "string" ? labText : JSON.stringify(labText);
    await d1Query(
      token,
      `INSERT INTO documents (doc_key, body, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`,
      [`lab:${classId}`, body]
    );
    console.log("Wrote lab", classId, body.length);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
