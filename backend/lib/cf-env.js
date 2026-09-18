/**
 * Access Cloudflare Worker bindings from Express handlers.
 * Prefer the env injected by worker/entry.js; fall back to cloudflare:workers.
 */
function cfEnv() {
  if (globalThis.__CF_ENV__) return globalThis.__CF_ENV__;
  try {
    // Resolved by Wrangler / workerd only.
    // eslint-disable-next-line import/no-unresolved
    const mod = require("cloudflare:workers");
    if (mod?.env) return mod.env;
  } catch {
    /* not on Workers */
  }
  return null;
}

function onCloudflare() {
  return Boolean(cfEnv()?.DB || process.env.CF_WORKER === "1");
}

function setCfEnv(env) {
  if (env) globalThis.__CF_ENV__ = env;
}

module.exports = { cfEnv, onCloudflare, setCfEnv };
