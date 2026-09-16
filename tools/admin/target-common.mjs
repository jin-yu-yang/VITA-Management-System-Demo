import { readFile } from "node:fs/promises";
export function rejected() {
  return Object.assign(
    new Error(
      "Privileged target rejected; check the approved private manifest and configuration.",
    ),
    { code: "TARGET_REJECTED" },
  );
}
export function requireTarget(condition) {
  if (!condition) throw rejected();
}
export const isLoopback = (host) =>
  host === "127.0.0.1" || host === "[::1]" || host === "::1";
export async function readManifest(env) {
  try {
    const p = env.VITALLY_TARGET_MANIFEST;
    requireTarget(typeof p === "string" && p.length > 0);
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    throw rejected();
  }
}
export function requireFields(env, names) {
  for (const name of names)
    requireTarget(typeof env[name] === "string" && env[name].trim().length > 0);
}
export function parseEndpoint(raw) {
  try {
    return new URL(raw);
  } catch {
    throw rejected();
  }
}
export function validateEndpointPair(
  apiRaw,
  dbRaw,
  approved,
  { local = false, projectRef } = {},
) {
  requireTarget(approved && approved.database);
  const api = parseEndpoint(apiRaw),
    db = parseEndpoint(dbRaw),
    a = approved.database;
  requireTarget(
    api.origin === approved.apiOrigin &&
      api.pathname === "/" &&
      !api.search &&
      !api.hash &&
      !api.username &&
      !api.password,
  );
  requireTarget(
    ["postgres:", "postgresql:"].includes(db.protocol) &&
      db.hostname === a.host &&
      Number(db.port || 5432) === a.port &&
      decodeURIComponent(db.pathname.slice(1)) === a.database &&
      decodeURIComponent(db.username) === a.user &&
      !!db.password &&
      !db.hash,
  );
  requireTarget(
    [...db.searchParams.keys()].every((k) => k === "sslmode") &&
      db.searchParams.getAll("sslmode").length <= 1,
  );
  if (local) {
    requireTarget(
      api.protocol === "http:" &&
        isLoopback(api.hostname) &&
        isLoopback(db.hostname) &&
        a.connectionMode === "direct",
    );
    requireTarget(!db.search || db.searchParams.get("sslmode") === "disable");
  } else {
    requireTarget(
      api.protocol === "https:" &&
        api.origin === `https://${projectRef}.supabase.co` &&
        !isLoopback(db.hostname) &&
        Number(db.port || 5432) !== 6543 &&
        db.searchParams.get("sslmode") === "verify-full",
    );
    requireTarget(
      (a.connectionMode === "session" &&
        a.user === `postgres.${projectRef}` &&
        a.host.endsWith(".pooler.supabase.com") &&
        a.port === 5432) ||
        (a.connectionMode === "direct" &&
          a.ipv6Verified === true &&
          a.host === `db.${projectRef}.supabase.co` &&
          a.user === "postgres" &&
          a.port === 5432),
    );
  }
  return { api, db };
}
