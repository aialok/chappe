import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const PUBLIC_SHELL = [
  "/",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

function cspPlugin(): Plugin {
  return {
    name: "chappe-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

function crawlerFilesPlugin(siteUrl: string): Plugin {
  return {
    name: "chappe-crawler-files",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url><loc>${siteUrl}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n` +
          `</urlset>\n`,
      });
    },
  };
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function serviceWorkerPlugin(): Plugin {
  return {
    name: "chappe-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith(".html") && !file.endsWith(".map"))
        .map((file) => `/${file}`);
      const assets = [...PUBLIC_SHELL, ...built];
      const cache = `chappe-${hash(assets.join("|"))}`;
      const source = `const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = (env.VITE_SITE_URL ?? "").replace(/\/$/, "");
  return {
    plugins: [react(), cspPlugin(), crawlerFilesPlugin(siteUrl), serviceWorkerPlugin()],
  };
});
