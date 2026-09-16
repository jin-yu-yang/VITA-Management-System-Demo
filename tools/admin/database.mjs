import pg from "pg";
import { assertTestTarget } from "./test-target.mjs";
import { assertClassroomTarget } from "./classroom-target.mjs";
import { requireTarget } from "./target-common.mjs";
import { SQLSTATE_ERROR_CODES } from "../../src/contracts.mjs";
import { createAppError } from "../../src/errors.mjs";
export function databaseError(error) {
  // Application codes use the one shared mapper; tooling codes (40001,
  // MIGRATION_CHANGED, TARGET_REJECTED, …) stay as the operator sees them.
  if (SQLSTATE_ERROR_CODES[error?.code] || error?.code === "42501")
    return createAppError(error);
  const code = error?.code || "SERVER_ERROR";
  return Object.assign(
    new Error(`Database operation failed (${code}).`, { cause: error }),
    { code },
  );
}
export async function assertTarget(target = { kind: "test" }) {
  requireTarget(target.kind === "test" || target.kind === "classroom");
  return target.kind === "test"
    ? assertTestTarget(target)
    : assertClassroomTarget(target);
}
export async function openDatabase(target = { kind: "test" }) {
  const approved = await assertTarget(target);
  const url = new URL(approved.databaseUrl);
  url.search = "";
  const client = new pg.Client({
    connectionString: url.href,
    ssl: approved.mode === "local" ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => {});
    throw Object.assign(new Error("Approved database connection failed."), {
      code: "CONNECTION_FAILED",
    });
  }
  return client;
}
export async function serializable(client, operation) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await client.query("begin isolation level serializable");
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      if (error.code !== "40001" || attempt === 2) throw databaseError(error);
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
