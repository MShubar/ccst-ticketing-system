/**
 * Cloudflare Workers entry (ESM): Express via cloudflare:node HTTP bridge.
 */
import { createRequire } from "node:module";
import { httpServerHandler } from "cloudflare:node";

const require = createRequire("file:///ccst-ticketing/worker/index.js");

process.env.CF_WORKER = "1";
process.env.PERSIST_BACKEND = process.env.PERSIST_BACKEND || "d1";

const { createApp } = require("../backend/app.js");
const app = createApp();
app.listen(3000);

const expressHandler = httpServerHandler({ port: 3000 });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api") || path.startsWith("/docs-")) {
      return expressHandler(request, env, ctx);
    }

    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) return assetRes;
      const indexReq = new Request(new URL("/index.html", url.origin), request);
      return env.ASSETS.fetch(indexReq);
    }

    return expressHandler(request, env, ctx);
  }
};
