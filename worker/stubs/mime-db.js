/** Tiny mime-db stand-in used by `mime` / express static on CF Workers. */
module.exports = {
  "application/json": { extensions: ["json"], charset: "UTF-8" },
  "application/javascript": { extensions: ["js", "mjs"], charset: "UTF-8" },
  "text/html": { extensions: ["html", "htm"], charset: "UTF-8" },
  "text/css": { extensions: ["css"], charset: "UTF-8" },
  "text/plain": { extensions: ["txt", "text"], charset: "UTF-8" },
  "text/markdown": { extensions: ["md"], charset: "UTF-8" },
  "image/png": { extensions: ["png"] },
  "image/jpeg": { extensions: ["jpg", "jpeg"] },
  "image/gif": { extensions: ["gif"] },
  "image/svg+xml": { extensions: ["svg"] },
  "image/webp": { extensions: ["webp"] },
  "application/pdf": { extensions: ["pdf"] },
  "application/octet-stream": { extensions: ["bin"] },
  "font/woff": { extensions: ["woff"] },
  "font/woff2": { extensions: ["woff2"] }
};
