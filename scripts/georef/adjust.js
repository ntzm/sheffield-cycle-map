// Local georeferencing adjustment tool.
//
//   npm run georef   (or: node scripts/georef/adjust.js)
//
// Serves the editor UI at http://localhost:4175 along with the public/
// directory (so plan images resolve), and exposes a tiny API that reads
// and writes public/data/schemes.json in place.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SCHEMES_PATH = path.join(PUBLIC_DIR, "data", "schemes.json");
const PORT = process.env.PORT || 4175;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "not found");
    send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/schemes") {
    if (req.method === "GET") return serveFile(res, SCHEMES_PATH);
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let manifest;
        try {
          manifest = JSON.parse(body);
        } catch {
          return send(res, 400, "invalid JSON");
        }
        if (!Array.isArray(manifest.schemes)) return send(res, 400, "missing schemes array");
        for (const scheme of manifest.schemes) {
          for (const plan of scheme.plans || []) {
            const ok =
              Array.isArray(plan.coordinates) &&
              plan.coordinates.length === 4 &&
              plan.coordinates.every(
                (c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite),
              );
            if (!ok) return send(res, 400, `bad coordinates for plan ${plan.id}`);
          }
        }
        fs.writeFileSync(SCHEMES_PATH, JSON.stringify(manifest, null, 2) + "\n");
        console.log(`saved ${SCHEMES_PATH}`);
        return send(res, 200, "ok");
      });
      return;
    }
    return send(res, 405, "method not allowed");
  }

  if (req.method !== "GET") return send(res, 405, "method not allowed");
  if (url.pathname === "/") return serveFile(res, path.join(__dirname, "adjust.html"));

  // Static files from public/ (plan images, basemap styles, ...)
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "forbidden");
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`georef adjust tool: http://localhost:${PORT}`);
  console.log(`editing: ${SCHEMES_PATH}`);
});
