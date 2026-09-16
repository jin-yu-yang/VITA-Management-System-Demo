import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  requireTarget,
  requireFields,
  readManifest,
  validateEndpointPair,
  rejected,
} from "./target-common.mjs";
const execFileAsync = promisify(execFile);
export function validateTestTarget(env, manifest, inventory = []) {
  requireFields(env, [
    "VITALLY_TEST_MODE",
    "VITALLY_TEST_SUPABASE_URL",
    "VITALLY_TEST_PUBLISHABLE_KEY",
    "VITALLY_TEST_ADMIN_KEY",
    "VITALLY_TEST_DATABASE_URL",
  ]);
  requireTarget(
    manifest?.version === 1 && manifest.test?.mode === env.VITALLY_TEST_MODE,
  );
  const approved = manifest.test,
    mode = env.VITALLY_TEST_MODE;
  requireTarget(mode === "local" || mode === "hosted");
  if (mode === "hosted") {
    requireFields(env, [
      "VITALLY_TEST_PROJECT_REF",
      "VITALLY_CLASSROOM_PROJECT_REF",
    ]);
    requireTarget(
      approved.projectRef === env.VITALLY_TEST_PROJECT_REF &&
        manifest.classroom?.projectRef === env.VITALLY_CLASSROOM_PROJECT_REF &&
        approved.projectRef !== manifest.classroom.projectRef,
    );
    validateEndpointPair(
      env.VITALLY_TEST_SUPABASE_URL,
      env.VITALLY_TEST_DATABASE_URL,
      approved,
      { projectRef: approved.projectRef },
    );
    requireTarget(
      approved.apiOrigin !== manifest.classroom.apiOrigin &&
        JSON.stringify(approved.database) !==
          JSON.stringify(manifest.classroom.database),
    );
  } else {
    requireFields(env, ["VITALLY_TEST_LOCAL_INSTANCE_ID"]);
    requireTarget(
      approved.instanceId === env.VITALLY_TEST_LOCAL_INSTANCE_ID &&
        /^vitally-[a-zA-Z0-9._-]+$/.test(approved.instanceId),
    );
    const { api } = validateEndpointPair(
      env.VITALLY_TEST_SUPABASE_URL,
      env.VITALLY_TEST_DATABASE_URL,
      approved,
      { local: true },
    );
    for (const [kind, prefix, port] of [
      ["api", "supabase_kong_", Number(api.port)],
      ["database", "supabase_db_", approved.database.port],
    ]) {
      const expected = approved.containers?.[kind];
      requireTarget(
        expected?.name === `${prefix}${approved.instanceId}` &&
          expected.containerPort === (kind === "api" ? 8000 : 5432),
      );
      const container = inventory.find((c) => c.Name === `/${expected.name}`);
      requireTarget(
        container?.State?.Running === true &&
          container.Config?.Labels?.["com.supabase.cli.project"] ===
            approved.instanceId,
      );
      const bindings =
        container.NetworkSettings?.Ports?.[`${expected.containerPort}/tcp`];
      const host = kind === "api" ? api.hostname : approved.database.host;
      requireTarget(
        Array.isArray(bindings) &&
          bindings.some(
            (b) =>
              Number(b.HostPort) === port &&
              (b.HostIp === host ||
                b.HostIp === (host === "127.0.0.1" ? "0.0.0.0" : "::") ||
                b.HostIp === (host === "[::1]" ? "::1" : host)),
          ),
      );
    }
  }
  return {
    mode,
    apiUrl: env.VITALLY_TEST_SUPABASE_URL,
    publishableKey: env.VITALLY_TEST_PUBLISHABLE_KEY,
    adminKey: env.VITALLY_TEST_ADMIN_KEY,
    databaseUrl: env.VITALLY_TEST_DATABASE_URL,
  };
}
export async function assertTestTarget({ env = process.env, manifest } = {}) {
  manifest ??= await readManifest(env);
  // Validate all configuration before launching Docker; inventory is exclusively local state.
  let inventory = [];
  if (env.VITALLY_TEST_MODE === "local") {
    const names = ["supabase_kong_", "supabase_db_"].map(
      (p) => p + env.VITALLY_TEST_LOCAL_INSTANCE_ID,
    );
    try {
      const result = await execFileAsync("docker", ["inspect", ...names], {
        maxBuffer: 1024 * 1024,
      });
      inventory = JSON.parse(result.stdout);
    } catch {
      throw rejected();
    }
  }
  return validateTestTarget(env, manifest, inventory);
}
