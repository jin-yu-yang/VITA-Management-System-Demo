import test from "node:test";
import assert from "node:assert/strict";
import { validateTestTarget } from "../tools/admin/test-target.mjs";
import { assertClassroomTarget } from "../tools/admin/classroom-target.mjs";
import { parseMigrateArgs } from "../tools/admin/migrate.mjs";
const db = {
  host: "aws-0-test.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.testref",
  connectionMode: "session",
};
const classroom = {
  projectRef: "classref",
  apiOrigin: "https://classref.supabase.co",
  database: {
    ...db,
    host: "aws-0-class.pooler.supabase.com",
    user: "postgres.classref",
  },
};
const hosted = {
  version: 1,
  test: {
    mode: "hosted",
    projectRef: "testref",
    apiOrigin: "https://testref.supabase.co",
    database: db,
  },
  classroom,
};
const hostedEnv = {
  VITALLY_TEST_MODE: "hosted",
  VITALLY_TEST_PROJECT_REF: "testref",
  VITALLY_CLASSROOM_PROJECT_REF: "classref",
  VITALLY_TEST_SUPABASE_URL: "https://testref.supabase.co",
  VITALLY_TEST_DATABASE_URL:
    "postgresql://postgres.testref:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=verify-full",
  VITALLY_TEST_PUBLISHABLE_KEY: "public",
  VITALLY_TEST_ADMIN_KEY: "secret",
};
const local = {
  version: 1,
  test: {
    mode: "local",
    instanceId: "vitally-test-owned",
    apiOrigin: "http://127.0.0.1:57321",
    database: {
      host: "127.0.0.1",
      port: 57322,
      database: "postgres",
      user: "postgres",
      connectionMode: "direct",
    },
    containers: {
      api: { name: "supabase_kong_vitally-test-owned", containerPort: 8000 },
      database: { name: "supabase_db_vitally-test-owned", containerPort: 5432 },
    },
  },
};
const localEnv = {
  VITALLY_TEST_MODE: "local",
  VITALLY_TEST_LOCAL_INSTANCE_ID: "vitally-test-owned",
  VITALLY_TEST_SUPABASE_URL: "http://127.0.0.1:57321",
  VITALLY_TEST_DATABASE_URL:
    "postgresql://postgres:secret@127.0.0.1:57322/postgres",
  VITALLY_TEST_PUBLISHABLE_KEY: "public",
  VITALLY_TEST_ADMIN_KEY: "secret",
};
const inventory = Object.entries(local.test.containers).map(([kind, c]) => ({
  Name: `/${c.name}`,
  State: { Running: true },
  Config: { Labels: { "com.supabase.cli.project": "vitally-test-owned" } },
  NetworkSettings: {
    Ports: {
      [`${c.containerPort}/tcp`]: [
        { HostIp: "127.0.0.1", HostPort: kind === "api" ? "57321" : "57322" },
      ],
    },
  },
}));
test("hosted guard accepts independently approved session targets and rejects identity/TLS confusion", () => {
  assert.equal(validateTestTarget(hostedEnv, hosted).mode, "hosted");
  for (const patch of [
    { VITALLY_CLASSROOM_PROJECT_REF: "" },
    { VITALLY_CLASSROOM_PROJECT_REF: "testref" },
    { VITALLY_TEST_PROJECT_REF: "wrong" },
    { VITALLY_TEST_MODE: "local" },
    {
      VITALLY_TEST_DATABASE_URL: hostedEnv.VITALLY_TEST_DATABASE_URL.replace(
        "testref:",
        "classref:",
      ),
    },
    {
      VITALLY_TEST_DATABASE_URL: hostedEnv.VITALLY_TEST_DATABASE_URL.replace(
        "5432",
        "6543",
      ),
    },
    {
      VITALLY_TEST_DATABASE_URL: hostedEnv.VITALLY_TEST_DATABASE_URL.replace(
        "verify-full",
        "disable",
      ),
    },
    { VITALLY_TEST_SUPABASE_URL: "https://testref.supabase.co/other" },
  ])
    assert.throws(
      () => validateTestTarget({ ...hostedEnv, ...patch }, hosted),
      { code: "TARGET_REJECTED" },
    );
  assert.throws(() => validateTestTarget(hostedEnv, null), {
    code: "TARGET_REJECTED",
  });
});
test("local guard requires exact loopback endpoints and running stack port ownership", () => {
  assert.equal(validateTestTarget(localEnv, local, inventory).mode, "local");
  for (const patch of [
    { VITALLY_TEST_LOCAL_INSTANCE_ID: "unowned" },
    {
      VITALLY_TEST_DATABASE_URL: localEnv.VITALLY_TEST_DATABASE_URL.replace(
        "57322",
        "5432",
      ),
    },
    { VITALLY_TEST_SUPABASE_URL: "http://localhost:57321" },
    {
      VITALLY_TEST_DATABASE_URL: localEnv.VITALLY_TEST_DATABASE_URL.replace(
        "127.0.0.1",
        "example.com",
      ),
    },
    { VITALLY_TEST_ADMIN_KEY: "" },
  ])
    assert.throws(
      () => validateTestTarget({ ...localEnv, ...patch }, local, inventory),
      { code: "TARGET_REJECTED" },
    );
  for (const alter of [
    (x) => [],
    (x) => {
      x[0].State.Running = false;
      return x;
    },
    (x) => {
      x[1].Config.Labels["com.supabase.cli.project"] = "other";
      return x;
    },
    (x) => {
      x[0].NetworkSettings.Ports["8000/tcp"][0].HostPort = "1234";
      return x;
    },
  ])
    assert.throws(
      () =>
        validateTestTarget(localEnv, local, alter(structuredClone(inventory))),
      { code: "TARGET_REJECTED" },
    );
});
test("classroom guard requires explicit confirmation and rejects test, loopback and transaction targets", async () => {
  const env = {
    VITALLY_ADMIN_SUPABASE_URL: classroom.apiOrigin,
    VITALLY_ADMIN_AUTH_KEY: "secret",
    VITALLY_ADMIN_DATABASE_URL:
      "postgresql://postgres.classref:secret@aws-0-class.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    VITALLY_CLASSROOM_PROJECT_REF: "classref",
    VITALLY_ADMIN_CONFIRMED_PROJECT_REF: "classref",
  };
  assert.equal(
    (await assertClassroomTarget({ env, manifest: hosted })).mode,
    "classroom",
  );
  const shared = structuredClone(hosted);
  shared.test.database.host = classroom.database.host;
  assert.equal(
    (await assertClassroomTarget({ env, manifest: shared })).mode,
    "classroom",
  );
  assert.equal(
    (await assertClassroomTarget({ env, manifest: { ...local, classroom } }))
      .mode,
    "classroom",
  );
  for (const patch of [
    { VITALLY_ADMIN_CONFIRMED_PROJECT_REF: "" },
    { VITALLY_ADMIN_CONFIRMED_PROJECT_REF: "testref" },
    { VITALLY_ADMIN_SUPABASE_URL: hosted.test.apiOrigin },
    {
      VITALLY_ADMIN_DATABASE_URL: env.VITALLY_ADMIN_DATABASE_URL.replace(
        "5432",
        "6543",
      ),
    },
    {
      VITALLY_ADMIN_DATABASE_URL: env.VITALLY_ADMIN_DATABASE_URL.replace(
        "verify-full",
        "require",
      ),
    },
    { VITALLY_ADMIN_SUPABASE_URL: "http://127.0.0.1:57321" },
  ])
    await assert.rejects(
      () =>
        assertClassroomTarget({ env: { ...env, ...patch }, manifest: hosted }),
      { code: "TARGET_REJECTED" },
    );
  await assert.rejects(
    () => assertClassroomTarget({ env, manifest: { version: 1, classroom } }),
    { code: "TARGET_REJECTED" },
  );
});
test("guards reject missing config without fallback to application variables", () => {
  assert.throws(
    () =>
      validateTestTarget(
        {
          SUPABASE_URL: localEnv.VITALLY_TEST_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: "secret",
        },
        local,
        inventory,
      ),
    { code: "TARGET_REJECTED" },
  );
  const wildcards = structuredClone(inventory);
  for (const c of wildcards)
    for (const bindings of Object.values(c.NetworkSettings.Ports))
      bindings[0].HostIp = "0.0.0.0";
  assert.equal(validateTestTarget(localEnv, local, wildcards).mode, "local");
});

test("the migrator runs on the test stack by default and on the classroom only by name", () => {
  assert.deepEqual(parseMigrateArgs([]), { kind: "test" });
  assert.deepEqual(parseMigrateArgs(["--target", "test"]), { kind: "test" });
  assert.deepEqual(parseMigrateArgs(["--target", "classroom"]), {
    kind: "classroom",
  });
  for (const argv of [
    ["--target"],
    ["--target", "production"],
    ["classroom"],
    ["--target", "classroom", "--force"],
  ])
    assert.throws(
      () => parseMigrateArgs(argv),
      (error) => error.code === "MIGRATE_USAGE",
    );
});
