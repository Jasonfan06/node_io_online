import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

export function createStaticFileHandler(publicDir) {
  return async function handleStaticFileRequest(req, res) {
    try {
      const rawPath = new URL(req.url || "/", `http://${req.headers.host}`).pathname;
      const normalized = rawPath === "/" ? "/index.html" : decodeURIComponent(rawPath);
      const filePath = path.normalize(path.join(publicDir, normalized));

      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const data = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  };
}
