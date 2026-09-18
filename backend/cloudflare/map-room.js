/**
 * Durable Object: one room per class for map presence + live link snapshot.
 * Keeps classmates on the same cursors across Worker isolates.
 */
import { DurableObject } from "cloudflare:workers";

const TTL_MS = 10_000;

export class MapRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.peers = new Map();
    this.mapRev = 0;
    this.mapUpdatedAt = null;
    this.links = null;
  }

  /** RPC — preferred from the Worker fast path. */
  async touch(body) {
    const now = Date.now();
    this.prune(now);
    this.peers.set(String(body.userId), {
      x: body.x,
      y: body.y,
      at: now,
      name: String(body.name || "Someone").slice(0, 48),
      role: body.role === "instructor" ? "instructor" : "technician"
    });
    return { ok: true, ...this.payload(body.userId) };
  }

  async list(excludeUserId) {
    this.prune(Date.now());
    return this.payload(excludeUserId || "");
  }

  async leave(userId) {
    if (userId) this.peers.delete(String(userId));
    return { ok: true };
  }

  async bump(body) {
    this.mapRev += 1;
    this.mapUpdatedAt = String(body.updatedAt || new Date().toISOString());
    if (Array.isArray(body.links)) this.links = body.links;
    return {
      rev: this.mapRev,
      updatedAt: this.mapUpdatedAt,
      links: this.links
    };
  }

  async ensure(body) {
    const stamp = String(body.updatedAt || "");
    if (!this.mapUpdatedAt && stamp) {
      this.mapRev = 1;
      this.mapUpdatedAt = stamp;
      if (Array.isArray(body.links)) this.links = body.links;
    } else if (stamp && this.mapUpdatedAt !== stamp) {
      this.mapRev += 1;
      this.mapUpdatedAt = stamp;
      if (Array.isArray(body.links)) this.links = body.links;
    } else if (Array.isArray(body.links) && !this.links) {
      this.links = body.links;
    }
    return {
      rev: this.mapRev,
      updatedAt: this.mapUpdatedAt,
      links: this.links
    };
  }

  async snapshot() {
    return {
      rev: this.mapRev,
      updatedAt: this.mapUpdatedAt,
      links: this.links
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/touch") {
      return Response.json(await this.touch(await request.json()));
    }

    if (request.method === "GET" && path === "/list") {
      const exclude = url.searchParams.get("exclude") || "";
      return Response.json(await this.list(exclude));
    }

    if (request.method === "DELETE" && path === "/leave") {
      const body = await request.json().catch(() => ({}));
      return Response.json(await this.leave(body.userId));
    }

    if (request.method === "POST" && path === "/bump") {
      return Response.json(await this.bump(await request.json()));
    }

    if (request.method === "POST" && path === "/ensure") {
      return Response.json(await this.ensure(await request.json()));
    }

    if (request.method === "GET" && path === "/snapshot") {
      return Response.json(await this.snapshot());
    }

    return new Response("Not found", { status: 404 });
  }

  prune(now) {
    for (const [id, row] of this.peers) {
      if (now - row.at > TTL_MS) this.peers.delete(id);
    }
  }

  payload(excludeUserId) {
    const peers = [];
    for (const [id, row] of this.peers) {
      if (id === excludeUserId) continue;
      peers.push({
        userId: id,
        name: row.name,
        role: row.role,
        x: row.x,
        y: row.y,
        at: row.at
      });
    }
    return {
      peers,
      mapUpdatedAt: this.mapUpdatedAt,
      mapRev: this.mapRev
    };
  }
}
