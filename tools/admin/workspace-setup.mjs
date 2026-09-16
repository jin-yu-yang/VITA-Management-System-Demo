import { openDatabase, serializable } from "./database.mjs";
export async function initializeWorkspace(
  {
    workspaceId,
    presenterUserIds = [],
    applicantUserIds = [],
    fixtureClientBindings = {},
    target = { kind: "test" },
  },
  { afterInitialize } = {},
) {
  const client = await openDatabase(target);
  try {
    return await serializable(client, async (connection) => {
      const { rows } = await connection.query(
        "select vitally_private.initialize_workspace($1,$2::uuid[],$3::uuid[],$4::jsonb) as result",
        [
          workspaceId,
          presenterUserIds,
          applicantUserIds,
          JSON.stringify(fixtureClientBindings),
        ],
      );
      const result = rows[0].result;
      // Trusted tooling hook: SQL-only, atomic with setup, safe to rerun on serialization failure.
      if (afterInitialize) await afterInitialize(connection, result);
      return result;
    });
  } finally {
    await client.end();
  }
}
