const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const zlib = require("zlib");
const store = require("./data/store");
const ops = require("./lib/ops-metrics");
const { patchAsyncMethods } = require("./middleware/asyncHandlers");
const { errorHandler } = require("./middleware/errorHandler");
const { isHttps } = require("./config");

const ticketsRoutes = require("./routes/tickets.routes");
const mapRoutes = require("./routes/map.routes");
const authRoutes = require("./routes/auth.routes");
const studentsRoutes = require("./routes/students.routes");
const classRoutes = require("./routes/class.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const devicesRoutes = require("./routes/devices.routes");
const portalsRoutes = require("./routes/portals.routes");
const metaRoutes = require("./routes/meta.routes");
const levelsRoutes = require("./routes/levels.routes");
const { mountStaticRedirects } = require("./lib/static-assets");

/**
 * Build the Express app (middleware, static, API routers, error handler).
 * Listen stays in index.js so Vercel can import the app without binding a port.
 */
function createApp() {
  const app = express();
  patchAsyncMethods(app);

  if (
    (process.env.NODE_ENV === "production" ||
      process.env.WEBSITE_HOSTNAME ||
      process.env.CF_WORKER === "1") &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "ccst-g18-procloud-helpdesk")
  ) {
    throw new Error(
      "[security] SESSION_SECRET is missing or still the built-in default. Set a long random secret (Azure App Service or `wrangler secret put SESSION_SECRET`)."
    );
  }

  app.set("trust proxy", 1);
  // Cookie-session JSON must never 304: browsers send If-None-Match, Express
  // answers 304 with an empty body, and axios/fetch treat that as a failed /api/me
  // — which leaves the React shell on the boot spinner forever.
  app.set("etag", false);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  // App-level gzip breaks on Cloudflare Workers: the node HTTP bridge can drop
  // Content-Encoding while leaving a gzip body, so fetch().json() fails after login
  // (/api/me is large enough to trigger compression; /api/login is not). CF edge
  // already compresses responses — skip manual gzip there.
  if (process.env.CF_WORKER !== "1") {
    app.use((req, res, next) => {
      if (!req.path.startsWith("/api")) return next();
      const accept = String(req.headers["accept-encoding"] || "");
      if (!accept.includes("gzip")) return next();
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        let raw;
        try {
          raw = Buffer.from(JSON.stringify(body));
        } catch {
          return originalJson(body);
        }
        if (raw.length < 1500) return originalJson(body);
        zlib.gzip(raw, (err, buf) => {
          if (err) return originalJson(body);
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Vary", "Accept-Encoding");
          res.send(buf);
        });
      };
      next();
    });
  }

  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - started;
      ops.noteRequest({
        method: req.method,
        path: req.path,
        ms,
        status: res.statusCode
      });
      if (ms < 700) return;
      console.warn(`[slow] ${req.method} ${req.path} ${ms}ms (storage ${store.storageTiming()}ms)`);
    });
    next();
  });

  // Docs PDFs/art come from Azure Blob in production; redirect before local static.
  mountStaticRedirects(app);

  const classicDir = path.join(typeof __dirname !== "undefined" ? __dirname : "/tmp", "..", "frontend");
  // Classroom JS/CSS must revalidate after deploys; a leftover PWA SW plus
  // max-age=30m was keeping broken modules (e.g. hardware bench) sticky.
  const staticOpts = {
    maxAge: 0,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(js|mjs|css|html)$/i.test(filePath) || /[/\\]sw\.js$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (isHttps) {
        res.setHeader("Cache-Control", "public, max-age=1800");
      }
    }
  };

  app.use("/api/levels", levelsRoutes);
  app.use("/api", authRoutes);
  app.use("/api", dashboardRoutes);
  app.use("/api", metaRoutes);
  app.use("/api/tickets", ticketsRoutes);
  app.use("/api/map", mapRoutes);
  app.use("/api/students", studentsRoutes);
  app.use("/api/class", classRoutes);
  app.use("/api/devices", devicesRoutes);
  app.use("/api/portals", portalsRoutes);

  // Classic `frontend/` is the live classroom UI. On Cloudflare Workers, static
  // files come from the Assets binding instead of express.static.
  const onCf = process.env.CF_WORKER === "1";
  if (!onCf) {
    app.use(express.static(classicDir, staticOpts));
  }

  app.get(["/classic", "/classic/"], (_req, res) => {
    res.redirect(302, "/");
  });

  if (!onCf) {
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path.startsWith("/docs-")) return next();
      res.sendFile(path.join(classicDir, "index.html"));
    });
  } else {
    // Non-API paths should not hit Express on CF — Assets handles them.
    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/docs-")) return next();
      res.status(404).json({ error: "Not found" });
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
