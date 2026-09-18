/**
 * PostgreSQL persistence for the classroom store.
 * Env: DATABASE_URL=postgresql://...
 * Note: `pg` is loaded lazily so Cloudflare Workers builds (D1) do not pull it in.
 */
let pool = null;
let schemaReady = null;
let PoolCtor = null;

function enabled() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function getPool() {
  if (!enabled()) throw new Error("DATABASE_URL is not set.");
  if (!PoolCtor) {
    // Lazy require — avoided on Cloudflare Workers where PERSIST_BACKEND=d1.
    PoolCtor = require("pg").Pool;
  }
  if (!pool) {
    pool = new PoolCtor({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000
    });
  }
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          doc_key TEXT PRIMARY KEY,
          body JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents (updated_at DESC);
      `);
    } finally {
      client.release();
    }
  })();
  try {
    await schemaReady;
  } catch (err) {
    schemaReady = null;
    throw err;
  }
  return schemaReady;
}

async function readCore() {
  await ensureSchema();
  const started = Date.now();
  try {
    const { rows } = await getPool().query(
      `SELECT body::text AS text FROM documents WHERE doc_key = 'core' LIMIT 1`
    );
    if (!rows.length) return null;
    const text = rows[0].text;
    return { text, db: JSON.parse(text) };
  } finally {
    // timing filled by caller via setLastStorageMs if needed
    readCore.lastMs = Date.now() - started;
  }
}

async function writeCore(docText) {
  await ensureSchema();
  const started = Date.now();
  try {
    await getPool().query(
      `INSERT INTO documents (doc_key, body, updated_at)
       VALUES ('core', $1::jsonb, NOW())
       ON CONFLICT (doc_key) DO UPDATE
         SET body = EXCLUDED.body, updated_at = NOW()`,
      [docText]
    );
  } finally {
    writeCore.lastMs = Date.now() - started;
  }
}

async function readLab(classId) {
  await ensureSchema();
  const key = `lab:${classId}`;
  const { rows } = await getPool().query(
    `SELECT body FROM documents WHERE doc_key = $1 LIMIT 1`,
    [key]
  );
  if (!rows.length) return null;
  return rows[0].body;
}

async function writeLab(classId, lab) {
  await ensureSchema();
  const key = `lab:${classId}`;
  await getPool().query(
    `INSERT INTO documents (doc_key, body, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (doc_key) DO UPDATE
       SET body = EXCLUDED.body, updated_at = NOW()`,
    [key, JSON.stringify(lab)]
  );
}

async function listLabKeys() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT doc_key FROM documents WHERE doc_key LIKE 'lab:%'`
  );
  return rows.map((r) => String(r.doc_key).slice(4));
}

async function readDocument(docKey) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT body FROM documents WHERE doc_key = $1 LIMIT 1`,
    [docKey]
  );
  if (!rows.length) return null;
  return rows[0].body;
}

async function writeDocument(docKey, body) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO documents (doc_key, body, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (doc_key) DO UPDATE
       SET body = EXCLUDED.body, updated_at = NOW()`,
    [docKey, typeof body === "string" ? body : JSON.stringify(body)]
  );
}

async function ping() {
  await ensureSchema();
  await getPool().query("SELECT 1");
  return true;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}

module.exports = {
  enabled,
  ensureSchema,
  readCore,
  writeCore,
  readLab,
  writeLab,
  listLabKeys,
  readDocument,
  writeDocument,
  ping,
  close,
  get lastStorageMs() {
    return readCore.lastMs || writeCore.lastMs || 0;
  }
};
