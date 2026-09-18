const PORT = process.env.PORT || 3847;
const HOST = process.env.HOST || "0.0.0.0";
const isHttps =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.WEBSITE_HOSTNAME) ||
  process.env.CF_WORKER === "1" ||
  Boolean(process.env.CF_PAGES);

module.exports = { PORT, HOST, isHttps };
