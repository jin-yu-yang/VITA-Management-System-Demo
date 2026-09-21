import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The local demo server. It serves the browser files and one public
// configuration document, and nothing else: the repository also holds
// migrations, privileged tooling, test fixtures and ignored private
// environment files, none of which is reachable over this port.
//
// The allowlist is matched against the **raw** request path, before any dot
// segment or percent escape is resolved. Normalising first and then checking
// would let `/src/vendor/../app.mjs` slip through as a tidy path; refusing
// anything that is not literally one of these shapes cannot.
const PAGE = "/index.html";
const ASSET = /^\/src\/[a-z-]+\.(?:mjs|css|svg)$/;
const VENDOR = /^\/src\/vendor\/[a-z-]+\.mjs$/;
const CONFIG = "/public-config.json";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const JSON_TYPE = "application/json; charset=utf-8";
const DEFAULT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COOLDOWN_SECONDS = 65;

const value = (env, name) => String(env[name] ?? "").trim();

// The published resend cooldown is the server's own minimum interval plus five
// seconds. It is not a secret, but it must be a sane number: anything that is
// not a positive whole number of seconds falls back to the documented default
// rather than disabling the cooldown.
function cooldownSeconds(raw) {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return DEFAULT_COOLDOWN_SECONDS;
  const seconds = Number(text);
  return Number.isSafeInteger(seconds) && seconds > 0
    ? seconds
    : DEFAULT_COOLDOWN_SECONDS;
}

// Exactly four keys, and never any other environment value. Everything else in
// the process environment — administrative keys, database URLs, SMTP
// credentials — stays on the server side of this function.
export function publicConfig(env) {
  const supabaseUrl = value(env, "SUPABASE_URL");
  const supabasePublishableKey = value(env, "SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabasePublishableKey) return { configured: false };
  return {
    configured: true,
    supabaseUrl,
    supabasePublishableKey,
    authResendCooldownSeconds: cooldownSeconds(
      value(env, "AUTH_RESEND_COOLDOWN_SECONDS"),
    ),
  };
}

const served = (requested) =>
  requested === PAGE ||
  requested === CONFIG ||
  ASSET.test(requested) ||
  VENDOR.test(requested);

export function createAppServer({ env = process.env, root = DEFAULT_ROOT } = {}) {
  return http.createServer(async (req, res) => {
    const requested = req.url.split("?", 1)[0];
    const file = requested === "/" ? PAGE : requested;
    const head = req.method === "HEAD";
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      });
      res.end(head || body === undefined ? undefined : body);
    };
    const notFound = () => send(404, "text/plain; charset=utf-8", "Not found");
    if (!served(file)) return notFound();
    // A refused method on a served path says so; on any other path it still
    // says only that there is nothing there.
    if (!(req.method === "GET" || head))
      return send(405, "text/plain; charset=utf-8", "Method not allowed", {
        Allow: "GET, HEAD",
      });
    if (file === CONFIG)
      return send(200, JSON_TYPE, JSON.stringify(publicConfig(env)));
    try {
      const body = await readFile(path.join(root, file));
      send(200, TYPES[path.extname(file)], body);
    } catch {
      notFound();
    }
  });
}

if (import.meta.filename === process.argv[1]) {
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, "127.0.0.1", () =>
    console.log(`ViTally demo ready: http://127.0.0.1:${port}`),
  );
}
