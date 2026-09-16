import {
  requireTarget,
  requireFields,
  readManifest,
  validateEndpointPair,
} from "./target-common.mjs";
export async function assertClassroomTarget({
  env = process.env,
  manifest,
} = {}) {
  manifest ??= await readManifest(env);
  requireFields(env, [
    "VITALLY_ADMIN_SUPABASE_URL",
    "VITALLY_ADMIN_AUTH_KEY",
    "VITALLY_ADMIN_DATABASE_URL",
    "VITALLY_CLASSROOM_PROJECT_REF",
    "VITALLY_ADMIN_CONFIRMED_PROJECT_REF",
  ]);
  const classroom = manifest?.classroom,
    test = manifest?.test,
    ref = env.VITALLY_CLASSROOM_PROJECT_REF;
  requireTarget(
    manifest?.version === 1 &&
      classroom?.projectRef === ref &&
      env.VITALLY_ADMIN_CONFIRMED_PROJECT_REF === ref &&
      test &&
      ["hosted", "local"].includes(test.mode),
  );
  validateEndpointPair(
    env.VITALLY_ADMIN_SUPABASE_URL,
    env.VITALLY_ADMIN_DATABASE_URL,
    classroom,
    { projectRef: ref },
  );
  requireTarget(
    test.apiOrigin &&
      test.database &&
      classroom.apiOrigin !== test.apiOrigin &&
      ["host", "port", "database", "user"].some(
        (key) => classroom.database[key] !== test.database[key],
      ),
  );
  if (test.mode === "hosted")
    requireTarget(
      typeof test.projectRef === "string" &&
        test.projectRef.length > 0 &&
        test.projectRef !== ref,
    );
  else
    requireTarget(
      typeof test.instanceId === "string" && test.instanceId.length > 0,
    );
  return {
    mode: "classroom",
    apiUrl: env.VITALLY_ADMIN_SUPABASE_URL,
    adminKey: env.VITALLY_ADMIN_AUTH_KEY,
    databaseUrl: env.VITALLY_ADMIN_DATABASE_URL,
  };
}
