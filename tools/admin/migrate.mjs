import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openDatabase, databaseError } from "./database.mjs";
export async function migrate({ target = { kind: "test" } } = {}) {
  const client = await openDatabase(target);
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('vitally-schema-migrations',0))",
    );
    await client.query("create schema if not exists vitally_private");
    await client.query(
      "revoke all on schema vitally_private from public, anon, authenticated, service_role",
    );
    await client.query(
      "create table if not exists vitally_private.schema_migrations(name text primary key, digest text not null)",
    );
    const directory = new URL("../../supabase/migrations/", import.meta.url);
    const { createHash } = await import("node:crypto");
    for (const name of (await readdir(directory))
      .filter((x) => /^\d+_[a-z_]+\.sql$/.test(x))
      .sort()) {
      const sql = await readFile(new URL(name, directory), "utf8"),
        digest = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "select digest from vitally_private.schema_migrations where name=$1",
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].digest !== digest)
          throw Object.assign(new Error("Applied migration differs."), {
            code: "MIGRATION_CHANGED",
          });
        continue;
      }
      await client.query(sql);
      await client.query(
        "insert into vitally_private.schema_migrations values($1,$2)",
        [name, digest],
      );
    }
    await client.query("commit");
    await client.query("notify pgrst,'reload schema'");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw databaseError(error);
  } finally {
    await client.end();
  }
}
// Command line: no arguments or `--target test` for the isolated test stack,
// `--target classroom` for the classroom project. That target's own guard still
// decides whether anything runs.
export function parseMigrateArgs(argv) {
  if (argv.length === 0) return { kind: "test" };
  if (
    argv.length === 2 &&
    argv[0] === "--target" &&
    ["test", "classroom"].includes(argv[1])
  )
    return { kind: argv[1] };
  throw Object.assign(
    new Error("Usage: migrate.mjs [--target test|classroom]"),
    { code: "MIGRATE_USAGE" },
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let target;
  try {
    target = parseMigrateArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  if (target)
    migrate({ target })
      .then(() => console.log(`Approved ${target.kind} migrations applied.`))
      .catch((error) => {
        console.error(`Migration failed (${error.code || "SERVER_ERROR"}).`);
        process.exitCode = 1;
      });
}
