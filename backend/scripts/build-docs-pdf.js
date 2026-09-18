const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const docsDir = path.join(backendRoot, "docs-assets", "docs-md");
const artDir = path.join(backendRoot, "docs-assets", "docs-art");
const outDir = path.join(backendRoot, "docs-assets", "docs-pdf");
const tmpDir = path.join(backendRoot, "..", ".tmp-docs-pdf");
/** Deployment/ops notes stay markdown-only; every other numbered doc prints. */
const MARKDOWN_ONLY = new Set([
  "14-custom-domain",
  "15-sql-storage",
  "16-ops",
  "17-cloudflare"
]);
function isPrintableGuide(file) {
  if (!/^\d{2}-/.test(file)) return false;
  return !MARKDOWN_ONLY.has(file.replace(/\.md$/, ""));
}
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cssPath = path.join(__dirname, "doc-pdf.css");

function titleFromMarkdown(raw, file) {
  return (raw.match(/^#\s+(.+)$/m) || [null, file.replace(/\.md$/, "")])[1];
}

function wrapHtml(title, body) {
  const safe = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safe}</title>
  <link rel="stylesheet" href="${path.basename(cssPath)}" />
</head>
<body>
  <header class="banner">
    <p class="kicker">ProCloud · CCST IT Support G18</p>
    <h1>${safe}</h1>
  </header>
  ${body}
  <p class="foot">Classroom documentation · ProCloud Training Center</p>
</body>
</html>`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function printPdf(htmlPath, pdfPath) {
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  const profile = path.join(tmpDir, "chrome-profile-" + path.basename(pdfPath, ".pdf"));
  const child = spawn(chrome, [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-pdf-header-footer",
    "--virtual-time-budget=8000",
    "--timeout=12000",
    "--user-data-dir=" + profile,
    "--print-to-pdf=" + pdfPath,
    "file://" + htmlPath
  ], { stdio: "ignore" });
  const start = Date.now();
  while (Date.now() - start < 20000) {
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) {
      try { child.kill("SIGTERM"); } catch {}
      return;
    }
    if (child.exitCode !== null && (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000)) {
      throw new Error("Chrome exited before writing " + pdfPath);
    }
    sleep(200);
  }
  try { child.kill("SIGKILL"); } catch {}
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) {
    throw new Error("Timed out writing " + pdfPath);
  }
}

function main() {
  if (!fs.existsSync(chrome)) {
    throw new Error("Google Chrome is required to build the documentation PDFs.");
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.copyFileSync(cssPath, path.join(tmpDir, path.basename(cssPath)));

  // Optional filter so one guide can be rebuilt without touching the other PDFs.
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") && isPrintableGuide(f))
    .filter((f) => !only.length || only.some((pick) => f.includes(pick)))
    .sort();
  if (!files.length) throw new Error("No matching guides to print.");
  files.forEach((file) => {
    const raw = fs.readFileSync(path.join(docsDir, file), "utf8");
    const title = titleFromMarkdown(raw, file);
    const id = file.replace(/\.md$/, "");
    const html = execFileSync("pandoc", [path.join(docsDir, file), "-t", "html5"], {
      encoding: "utf8"
    });
    // Picture paths are relative to docs-md, but the page renders from tmpDir.
    const body = html.replace(/\.\.\/docs-art\//g, "file://" + artDir + "/");
    const htmlPath = path.join(tmpDir, id + ".html");
    const pdfPath = path.join(outDir, id + ".pdf");
    fs.writeFileSync(htmlPath, wrapHtml(title, body));
    printPdf(htmlPath, pdfPath);
    const kb = Math.round(fs.statSync(pdfPath).size / 1024);
    console.log("Wrote " + path.relative(backendRoot, pdfPath) + " (" + kb + " KB) — " + title);
  });
}

main();
