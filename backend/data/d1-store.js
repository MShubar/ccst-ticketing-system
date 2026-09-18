/**
 * D1 (SQLite) persistence — same document model as Postgres JSONB.
 * Binding: env.DB
 */
const { cfEnv } = require("../lib/cf-env");

let schemaReady = null;
let lastMs = 0;

/**
 * Every statement gets a deadline. A D1 call belongs to the I/O context of the
 * request that started it; if that request goes away the promise can stay
 * pending forever, and an awaited pending promise reads to the runtime as a
 * Worker that hung rather than as an error we can report.
 */
const OP_TIMEOUT_MS = Number(process.env.D1_TIMEOUT_MS || 10000);

function withDeadline(label, promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`D1 ${label} did not answer within ${OP_TIMEOUT_MS}ms`)),
        OP_TIMEOUT_MS
      );
    })
  ]).finally(() => clearTimeout(timer));
}

function enabled() {
  const force = String(process.env.PERSIST_BACKEND || "").trim().toLowerCase();
  if (force === "d1") return Boolean(cfEnv()?.DB);
  if (force && force !== "d1") return false;
  return Boolean(cfEnv()?.DB);
}

function db() {
  const env = cfEnv();
  if (!env?.DB) throw new Error("D1 binding env.DB is not available.");
  return env.DB;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = withDeadline(
    "schema",
    (async () => {
      await db()
        .prepare(
          `CREATE TABLE IF NOT EXISTS documents (
          doc_key TEXT PRIMARY KEY,
          body TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
        )
        .run();
      await db()
        .prepare(`CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents (updated_at)`)
        .run();
    })()
  );
  try {
    await schemaReady;
  } catch (err) {
    schemaReady = null;
    throw err;
  }
  return schemaReady;
}

async function readCore(opts = {}) {
  await ensureSchema();
  const started = Date.now();
  try {
    const edge = require("./core-edge-cache");
    if (!opts.bypassEdge) {
      const cachedText = await edge.getCoreTextFromEdge();
      if (cachedText) {
        return { text: cachedText, db: JSON.parse(cachedText) };
      }
    }
    const row = await withDeadline(
      "read core",
      db().prepare(`SELECT body AS text FROM documents WHERE doc_key = ? LIMIT 1`).bind("core").first()
    );
    if (!row?.text) return null;
    const text = String(row.text);
    // Do NOT fill the edge cache from reads — a slow GET that started before a
    // write can overwrite the writer's fresher cache entry and make ticket
    // reviews (and other saves) appear to "revert" until the TTL expires.
    return { text, db: JSON.parse(text) };
  } finally {
    lastMs = Date.now() - started;
  }
}

async function writeCore(docText) {
  await ensureSchema();
  const started = Date.now();
  try {
    await withDeadline(
      "write core",
      db()
        .prepare(
          `INSERT INTO documents (doc_key, body, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
        )
        .bind("core", docText)
        .run()
    );
    try {
      await require("./core-edge-cache").bustCoreEdgeCache();
      await require("./core-edge-cache").putCoreTextInEdge(docText);
    } catch {
      /* ignore */
    }
  } finally {
    lastMs = Date.now() - started;
  }
}

/**
 * Compare-and-swap core write. Succeeds only when the stored body still matches
 * `expectedText` (or the row is missing). Stops multi-isolate lost updates.
 * @returns {Promise<boolean>} true when this write landed
 */
async function writeCoreCas(docText, expectedText) {
  await ensureSchema();
  const started = Date.now();
  try {
    if (expectedText == null) {
      const existing = await withDeadline(
        "cas peek",
        db().prepare(`SELECT body FROM documents WHERE doc_key = ? LIMIT 1`).bind("core").first()
      );
      if (existing?.body != null) return false;
      await withDeadline(
        "cas insert",
        db()
          .prepare(
            `INSERT INTO documents (doc_key, body, updated_at)
           VALUES (?, ?, datetime('now'))`
          )
          .bind("core", docText)
          .run()
      );
      try {
        const edge = require("./core-edge-cache");
        await edge.bustCoreEdgeCache();
        await edge.putCoreTextInEdge(docText);
      } catch {
        /* ignore */
      }
      return true;
    }
    const result = await withDeadline(
      "cas update",
      db()
        .prepare(
          `UPDATE documents
         SET body = ?, updated_at = datetime('now')
         WHERE doc_key = ? AND body = ?`
        )
        .bind(docText, "core", expectedText)
        .run()
    );
    const changes = Number(result?.meta?.changes || 0);
    if (changes > 0) {
      try {
        const edge = require("./core-edge-cache");
        await edge.bustCoreEdgeCache();
        await edge.putCoreTextInEdge(docText);
      } catch {
        /* ignore */
      }
    }
    return changes > 0;
  } finally {
    lastMs = Date.now() - started;
  }
}

async function readLab(classId, opts = {}) {
  await ensureSchema();
  const edge = require("./core-edge-cache");
  if (!opts.bypassEdge) {
    const cached = await edge.getLabFromEdge(classId);
    if (cached) return cached;
  }
  const key = `lab:${classId}`;
  const row = await withDeadline(
    "read lab",
    db().prepare(`SELECT body FROM documents WHERE doc_key = ? LIMIT 1`).bind(key).first()
  );
  if (!row?.body) return null;
  const lab = typeof row.body === "string" ? JSON.parse(row.body) : row.body;
  // Same as core: only writers fill the lab edge cache.
  return lab;
}

async function writeLab(classId, lab) {
  await ensureSchema();
  const key = `lab:${classId}`;
  await withDeadline(
    "write lab",
    db()
      .prepare(
        `INSERT INTO documents (doc_key, body, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
      )
      .bind(key, JSON.stringify(lab))
      .run()
  );
  const edge = require("./core-edge-cache");
  await edge.bustLabEdgeCache(classId);
  await edge.putLabInEdge(classId, lab);
}

async function listLabKeys() {
  await ensureSchema();
  const { results } = await withDeadline(
    "list labs",
    db().prepare(`SELECT doc_key FROM documents WHERE doc_key LIKE 'lab:%'`).all()
  );
  return (results || []).map((r) => String(r.doc_key).slice(4));
}

async function readDocument(docKey) {
  await ensureSchema();
  const row = await withDeadline(
    "read doc",
    db().prepare(`SELECT body FROM documents WHERE doc_key = ? LIMIT 1`).bind(docKey).first()
  );
  if (!row?.body) return null;
  return typeof row.body === "string" ? JSON.parse(row.body) : row.body;
}

async function writeDocument(docKey, body) {
  await ensureSchema();
  await withDeadline(
    "write doc",
    db()
      .prepare(
        `INSERT INTO documents (doc_key, body, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
      )
      .bind(docKey, typeof body === "string" ? body : JSON.stringify(body))
      .run()
  );
}

async function ping() {
  await ensureSchema();
  await withDeadline("ping", db().prepare(`SELECT 1 AS ok`).first());
  return true;
}

module.exports = {
  enabled,
  ensureSchema,
  readCore,
  writeCore,
  writeCoreCas,
  readLab,
  writeLab,
  listLabKeys,
  readDocument,
  writeDocument,
  ping,
  get lastStorageMs() {
    return lastMs;
  }
};
