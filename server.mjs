import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const port = Number(process.env.PORT || 4173);
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname === "/" ? "/index.html" : pathname;
    if (
      !["GET", "HEAD"].includes(req.method) ||
      !(file === "/index.html" || /^\/src\/[a-z-]+\.(mjs|css|svg)$/.test(file))
    ) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const body = await readFile(path.join(root, file));
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`PCDC demo ready: http://127.0.0.1:${port}`),
  );
