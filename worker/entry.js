/**
 * Cloudflare Workers entry — Express via cloudflare:node HTTP bridge.
 * Hot path: /api/map/presence bypasses Express (native DO RPC).
 * Static UI is served by Assets with run_worker_first for /api and /docs-*.
 * Cron keeps D1 + CoreGate + edge cache warm so a class walk-in avoids cold wave.
 */
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createApp } from "../backend/app.js";
import { setCfEnv } from "../backend/lib/cf-env.js";
import { tryHandlePresence } from "./presence-fast.js";
export { MapRoom } from "../backend/cloudflare/map-room.js";
export { CoreGate } from "../backend/cloudflare/core-gate.js";

process.env.PERSIST_BACKEND = process.env.PERSIST_BACKEND || "d1";
if (env.SESSION_SECRET) process.env.SESSION_SECRET = env.SESSION_SECRET;
if (env.INSTRUCTOR_SIGNUP_CODE) process.env.INSTRUCTOR_SIGNUP_CODE = env.INSTRUCTOR_SIGNUP_CODE;

setCfEnv(env);

const app = createApp();
app.listen(3000);

const nodeHandler = httpServerHandler({ port: 3000 });

function toNode(request, workerEnv, ctx) {
  if (typeof nodeHandler?.fetch === "function") return nodeHandler.fetch(request, workerEnv, ctx);
  return nodeHandler(request, workerEnv, ctx);
}

async function warmClassroom(workerEnv) {
  setCfEnv(workerEnv);
  try {
    if (workerEnv.DB) {
      await workerEnv.DB.prepare("SELECT 1 AS ok").first();
    }
  } catch {
    /* ignore */
  }
  try {
    if (workerEnv.CORE_GATE) {
      const id = workerEnv.CORE_GATE.idFromName("global");
      const stub = workerEnv.CORE_GATE.get(id);
      const res = await stub.fetch("https://core-gate/read", { method: "GET" });
      const json = await res.json().catch(() => null);
      const text = json?.text;
      if (text && typeof caches !== "undefined" && caches?.default) {
        const ttl = Math.max(0, Number(workerEnv.CORE_EDGE_CACHE_SEC) || 8);
        const req = new Request("https://ccst-core.internal/documents/core");
        await caches.default.delete(req);
        if (ttl > 0) {
          await caches.default.put(
            req,
            new Response(text, {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${ttl}`
              }
            })
          );
        }
      }
    }
  } catch {
    /* ignore */
  }
}

export default {
  async fetch(request, workerEnv, ctx) {
    setCfEnv(workerEnv);
    if (workerEnv.SESSION_SECRET) process.env.SESSION_SECRET = workerEnv.SESSION_SECRET;
    const fast = await tryHandlePresence(request, workerEnv);
    if (fast) return fast;
    return toNode(request, workerEnv, ctx);
  },

  async scheduled(_event, workerEnv, ctx) {
    ctx.waitUntil(warmClassroom(workerEnv));
  }
};
