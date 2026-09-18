/**
 * Durable Object: single-threaded gate for the core classroom document.
 * Authoritative copy lives in DO storage so concurrent Worker isolates cannot
 * lose ticket saves to D1 read-replica lag or blind full-document overwrites.
 */
import { DurableObject } from "cloudflare:workers";
import coreMerge from "../lib/core-merge.js";

const { applyListEdits } = coreMerge;

function emptyCore() {
  return {
    meta: { app: "CCST Ticketing", labsSplit: true },
    classes: [],
    users: [],
    tickets: [],
    requesters: [],
    portalsByClass: {},
    mapByClass: {},
    devicesByClass: {},
    ticketMixByClass: {},
    activityByClass: {},
    nextUser: 1,
    nextClass: 1,
    nextTicket: 1,
    nextComment: 1,
    nextActivity: 1
  };
}

async function ensureDocumentsTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS documents (
        doc_key TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run();
}

/** Colo Cache API — keep Worker isolates from re-hitting D1 for a few seconds. */
async function bustAndFillCoreCache(text) {
  try {
    // eslint-disable-next-line no-undef
    if (typeof caches === "undefined" || !caches?.default || !text) return;
    const ttl = Math.max(0, Number(globalThis?.CORE_EDGE_CACHE_SEC) || 8);
    const req = new Request("https://ccst-core.internal/documents/core");
    // eslint-disable-next-line no-undef
    await caches.default.delete(req);
    if (ttl <= 0) return;
    // eslint-disable-next-line no-undef
    await caches.default.put(
      req,
      new Response(text, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`
        }
      })
    );
  } catch {
    /* Cache API optional outside Workers */
  }
}

export class CoreGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this._ready = null;
  }

  /** Load DO mirror once; seed from D1 if this DO is empty. */
  async ensureLoaded() {
    if (this._ready) return this._ready;
    this._ready = this.ctx.blockConcurrencyWhile(async () => {
      const cached = await this.ctx.storage.get(["coreText", "lastPersistAt"]);
      const text = cached?.get?.("coreText") ?? cached?.coreText;
      if (typeof text === "string" && text) {
        this.coreText = text;
        this.lastPersistAt = cached?.get?.("lastPersistAt") || cached?.lastPersistAt || null;
        return;
      }
      const db = this.env.DB;
      if (!db) {
        this.coreText = JSON.stringify(emptyCore());
        await this.ctx.storage.put("coreText", this.coreText);
        return;
      }
      await ensureDocumentsTable(db);
      const row = await db
        .prepare(`SELECT body AS text FROM documents WHERE doc_key = ? LIMIT 1`)
        .bind("core")
        .first();
      this.coreText = row?.text ? String(row.text) : JSON.stringify(emptyCore());
      await this.ctx.storage.put("coreText", this.coreText);
    });
    return this._ready;
  }

  async readCore() {
    await this.ensureLoaded();
    return { ok: true, text: this.coreText };
  }

  async persist(text, { syncD1 = true } = {}) {
    this.coreText = text;
    const persistedAt = new Date().toISOString();
    this.lastPersistAt = persistedAt;
    await this.ctx.storage.put({ coreText: text, lastPersistAt: persistedAt });
    const db = this.env.DB;
    if (!db) return;
    const writeD1 = async () => {
      await ensureDocumentsTable(db);
      await db
        .prepare(
          `INSERT INTO documents (doc_key, body, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(doc_key) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
        )
        .bind("core", text)
        .run();
    };
    if (syncD1) {
      await writeD1();
      await bustAndFillCoreCache(text);
      return;
    }
    // Optional background mirror (ordered) when callers opt out of sync.
    this._d1Chain = (this._d1Chain || Promise.resolve())
      .then(async () => {
        await writeD1();
        await bustAndFillCoreCache(text);
      })
      .catch(() => {});
    this.ctx.waitUntil(this._d1Chain);
  }

  /** Ops probe: size, ticket count, and optional D1 lag vs DO authority. */
  async status() {
    await this.ensureLoaded();
    let tickets = 0;
    let users = 0;
    try {
      const doc = JSON.parse(this.coreText || "null") || {};
      tickets = Array.isArray(doc.tickets) ? doc.tickets.length : 0;
      users = Array.isArray(doc.users) ? doc.users.length : 0;
    } catch {
      /* ignore parse errors for status */
    }
    const bytes = (this.coreText || "").length;
    let d1UpdatedAt = null;
    let d1BehindCore = false;
    let d1LagMs = null;
    const db = this.env.DB;
    if (db) {
      try {
        await ensureDocumentsTable(db);
        const row = await db
          .prepare(`SELECT updated_at AS updatedAt, length(body) AS bytes FROM documents WHERE doc_key = ? LIMIT 1`)
          .bind("core")
          .first();
        d1UpdatedAt = row?.updatedAt ? String(row.updatedAt) : null;
        const d1Bytes = Number(row?.bytes || 0);
        if (bytes && d1Bytes && d1Bytes !== bytes) d1BehindCore = true;
        if (this.lastPersistAt && d1UpdatedAt) {
          const gateMs = Date.parse(this.lastPersistAt);
          // D1 stores UTC without Z — treat as UTC.
          const d1Ms = Date.parse(/Z$/i.test(d1UpdatedAt) ? d1UpdatedAt : `${d1UpdatedAt}Z`);
          if (Number.isFinite(gateMs) && Number.isFinite(d1Ms) && gateMs > d1Ms + 1500) {
            d1BehindCore = true;
            d1LagMs = gateMs - d1Ms;
          }
        }
      } catch {
        d1BehindCore = true;
      }
    }
    return {
      ok: true,
      bytes,
      tickets,
      users,
      lastPersistAt: this.lastPersistAt || null,
      d1UpdatedAt,
      d1BehindCore,
      d1LagMs
    };
  }

  /**
   * Apply one request's local edits on top of the DO-authoritative core.
   * Calls are serialized by the DO, so concurrent ticket saves cannot clobber
   * each other — and we never re-read a lagging D1 replica mid-merge.
   */
  async applyCoreEdits(body) {
    await this.ensureLoaded();
    const edits = body?.edits || {};

    let doc;
    try {
      doc = JSON.parse(this.coreText || "null") || emptyCore();
    } catch {
      doc = emptyCore();
    }

    doc.tickets = applyListEdits(doc.tickets, edits.tickets, edits.deletedTickets);
    doc.users = applyListEdits(doc.users, edits.users, edits.deletedUsers);
    doc.classes = applyListEdits(doc.classes, edits.classes, edits.deletedClasses);
    doc.requesters = applyListEdits(doc.requesters, edits.requesters, edits.deletedRequesters);

    // Credentials live in the credentials side doc — never keep hashes in hot core.
    if (Array.isArray(doc.users)) {
      for (const u of doc.users) {
        if (u && u.passwordHash) delete u.passwordHash;
      }
    }

    doc.ticketMixByClass = { ...(doc.ticketMixByClass || {}), ...(edits.ticketMixByClass || {}) };
    doc.activityByClass = doc.activityByClass || {};
    for (const [classId, rows] of Object.entries(edits.activityByClass || {})) {
      const map = new Map((doc.activityByClass[classId] || []).map((r) => [r.id, r]));
      for (const r of rows || []) {
        if (r?.id) map.set(r.id, r);
      }
      doc.activityByClass[classId] = [...map.values()].sort((a, b) =>
        String(b.at || "").localeCompare(String(a.at || ""))
      );
    }

    const c = edits.counters || {};
    doc.nextUser = Math.max(Number(doc.nextUser || 0), Number(c.nextUser || 0));
    doc.nextClass = Math.max(Number(doc.nextClass || 0), Number(c.nextClass || 0));
    doc.nextTicket = Math.max(Number(doc.nextTicket || 0), Number(c.nextTicket || 0));
    doc.nextComment = Math.max(Number(doc.nextComment || 0), Number(c.nextComment || 0));
    doc.nextActivity = Math.max(Number(doc.nextActivity || 0), Number(c.nextActivity || 0));
    doc.meta = { ...(doc.meta || {}), labsSplit: true };

    // Core stays lab-light; map/devices/portals live in lab:* docs.
    doc.mapByClass = {};
    doc.devicesByClass = {};
    doc.portalsByClass = {};

    const text = JSON.stringify(doc);
    // Ticket/classroom saves: acknowledge from DO storage immediately and mirror
    // D1 in the background so ~100 concurrent patches are not serialized on D1 I/O.
    await this.persist(text, { syncD1: false });
    return { ok: true, text };
  }

  /** Replace the whole core (reset / admin). Still goes through the DO. */
  async replaceCore(body) {
    await this.ensureLoaded();
    const text = typeof body?.text === "string" ? body.text : JSON.stringify(body?.doc || emptyCore());
    await this.persist(text, { syncD1: true });
    return { ok: true, text };
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/read") {
        return Response.json(await this.readCore());
      }
      if (request.method === "GET" && url.pathname === "/status") {
        return Response.json(await this.status());
      }
      if (request.method === "POST" && url.pathname === "/apply") {
        const body = await request.json();
        return Response.json(await this.applyCoreEdits(body));
      }
      if (request.method === "POST" && url.pathname === "/replace") {
        const body = await request.json();
        return Response.json(await this.replaceCore(body));
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
    }
  }
}
