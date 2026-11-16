import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const STAGING = "dist-single";
const OUTPUT = "dist";
const FILE = "chappe.html";

await build({ mode: "single", logLevel: "warn" });

const read = (href: string) => readFileSync(join(STAGING, href.replace(/^\//, "")), "utf8");

let html = readFileSync(join(STAGING, "index.html"), "utf8");
let script = "";

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_tag, src: string) => {
  script = read(src).replace(/<\/script/gi, "<\\/script");
  return "<script type=\"module\">__CHAPPE_SCRIPT__</script>";
});
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_tag, href: string) => {
  return `<style>${read(href)}</style>`;
});
html = html.replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, "");
const favicon = `data:image/svg+xml,${encodeURIComponent(readFileSync("public/favicon.svg", "utf8").trim())}`;
html = html.replace(/href="\/favicon\.svg"/, () => `href="${favicon}"`);

if (!script) throw new Error("single-file build: app script not found");

const scriptHash = createHash("sha256").update(script, "utf8").digest("base64");
const csp = [
  "default-src 'none'",
  `script-src 'sha256-${scriptHash}'`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src blob:",
  "connect-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
html = html.replace("</title>", () => `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
html = html.replace("__CHAPPE_SCRIPT__", () => script);

const leftovers = html.match(/(src|href)="\/assets\/[^"]+"/g);
if (leftovers) throw new Error(`single-file build: external assets remain: ${leftovers.join(", ")}`);

mkdirSync(OUTPUT, { recursive: true });
writeFileSync(join(OUTPUT, FILE), html);
const fileHash = createHash("sha256").update(html, "utf8").digest("hex");
writeFileSync(join(OUTPUT, `${FILE}.sha256`), `${fileHash}  ${FILE}\n`);
rmSync(STAGING, { recursive: true, force: true });

console.log(`${FILE}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  sha256 ${fileHash}`);
