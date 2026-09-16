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
if (process.argv[1] === fileURLToPath(import.meta.url))
  migrate()
    .then(() => console.log("Approved test migrations applied."))
    .catch((error) => {
      console.error(`Migration failed (${error.code || "SERVER_ERROR"}).`);
      process.exitCode = 1;
    });
