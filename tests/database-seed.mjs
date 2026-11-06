import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { openDatabase } from "../tools/admin/database.mjs";
import { applyAction } from "../tools/admin/seed-cases.mjs";

test("seed command against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  const client = await openDatabase();
  try {
    await t.test(
      "acting as a staff account goes through the RPC as that person",
      async () => {
        const caseId = await f.readyCase();
        const before = (await client.query("select current_user as u")).rows[0].u;
        await applyAction(client, f.preparerUserId, caseId, "CLAIM_PREPARATION");
        const row = (
          await f.sql("select preparer_id, stage from public.cases where id=$1", [
            caseId,
          ])
        ).rows[0];
        assert.equal(row.preparer_id, f.preparerId);
        assert.equal(row.stage, "preparing");
        const receipts = (
          await f.sql(
            "select operation, actor_person_id from public.action_receipts where target_id=$1 and actor_user_id=$2",
            [caseId, f.preparerUserId],
          )
        ).rows;
        assert.ok(receipts.length >= 1);
        for (const receipt of receipts)
          assert.equal(receipt.actor_person_id, f.preparerId);
        const after = (await client.query("select current_user as u")).rows[0].u;
        assert.equal(after, before);
        assert.notEqual(after, "authenticated");
      },
    );
  } finally {
    await client.end();
    await f.close();
  }
});
