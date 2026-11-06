import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { openDatabase } from "../tools/admin/database.mjs";
import {
  applyAction,
  deletePreviousRun,
  readRun,
  recordRun,
  resolveSeedTargets,
  runFilePath,
} from "../tools/admin/seed-cases.mjs";

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

    await t.test("resolves the role accounts and client A", async () => {
      const targets = await resolveSeedTargets(client, {
        workspaceId: f.workspaceId,
        clientAEmail: f.applicantAEmail,
      });
      assert.equal(targets.workspaceId, f.workspaceId);
      assert.deepEqual(targets.siteCoordinator, {
        userId: f.siteCoordinatorUserId,
        personId: f.siteCoordinatorId,
      });
      assert.deepEqual(targets.preparer, {
        userId: f.preparerUserId,
        personId: f.preparerId,
      });
      assert.deepEqual(targets.reviewer, {
        userId: f.reviewerUserId,
        personId: f.reviewerId,
      });
      assert.deepEqual(targets.clientA, { userId: f.applicantAUserId });
    });

    await t.test("refuses a missing role key", async () => {
      const workspaceId = randomUUID();
      await f.initializeOwned({
        workspaceId,
        presenterUserIds: [],
        applicantUserIds: [],
        fixtureClientBindings: {},
      });
      await f.staff({
        key: "preparer",
        name: "Pat Preparer",
        capabilities: ["prepare"],
        workspaceId,
      });
      await assert.rejects(
        resolveSeedTargets(client, {
          workspaceId,
          clientAEmail: f.applicantAEmail,
        }),
        (error) =>
          error.code === "SEED_SETUP" && error.message.includes("site_coordinator"),
      );
    });

    await t.test("refuses missing ids", async () => {
      for (const args of [
        { clientAEmail: f.applicantAEmail },
        { workspaceId: f.workspaceId },
      ])
        await assert.rejects(
          resolveSeedTargets(client, args),
          (error) => error.code === "SEED_SETUP" && !error.message.includes("@"),
        );
    });

    await t.test(
      "refuses when the default follow-up person is not the site coordinator",
      async () => {
        await f.sql(
          "update public.workspaces set default_followup_person_id=$2 where id=$1",
          [f.workspaceId, f.sam],
        );
        try {
          await assert.rejects(
            resolveSeedTargets(client, {
              workspaceId: f.workspaceId,
              clientAEmail: f.applicantAEmail,
            }),
            (error) =>
              error.code === "SEED_SETUP" && !error.message.includes("@"),
          );
        } finally {
          await f.sql(
            "select vitally_private.set_default_followup($1,$2)",
            [f.workspaceId, "site_coordinator"],
          );
        }
      },
    );

    await t.test("refuses when the first applicant has no account", async () => {
      await assert.rejects(
        resolveSeedTargets(client, {
          workspaceId: f.workspaceId,
          clientAEmail: "nobody@example.org",
        }),
        (error) =>
          error.code === "SEED_SETUP" && !error.message.includes("nobody"),
      );
    });

    await t.test(
      "deletePreviousRun deletes only listed rows in its own workspace",
      async () => {
        const own = await f.createCase(f.applicantA, randomUUID());
        const foreign = await f.createCase(f.outsider, randomUUID());
        const result = await deletePreviousRun(client, {
          workspaceId: f.workspaceId,
          caseIds: [own.caseId, foreign.caseId, randomUUID()],
          assistanceIds: [randomUUID()],
        });
        assert.equal(result.casesRemoved, 1);
        const left = (
          await f.sql("select id from public.cases where id = any($1::uuid[])", [
            [own.caseId, foreign.caseId],
          ])
        ).rows.map((r) => r.id);
        assert.deepEqual(left, [foreign.caseId]);
      },
    );

    await t.test("readRun returns empty lists when there is no file", async () => {
      const runDir = await mkdtemp(path.join(tmpdir(), "seed-run-"));
      try {
        const workspaceId = randomUUID();
        assert.deepEqual(await readRun(workspaceId, runDir), {
          workspaceId,
          caseIds: [],
          assistanceIds: [],
        });
        assert.equal(
          runFilePath(workspaceId, runDir),
          `${runDir}/seed-${workspaceId}.json`,
        );
      } finally {
        await rm(runDir, { recursive: true, force: true });
      }
    });

    await t.test("recordRun then readRun round-trips", async () => {
      const base = await mkdtemp(path.join(tmpdir(), "seed-run-"));
      const runDir = path.join(base, "nested");
      try {
        const run = {
          workspaceId: randomUUID(),
          caseIds: [randomUUID(), randomUUID()],
          assistanceIds: [randomUUID()],
        };
        await recordRun(run, runDir);
        assert.deepEqual(await readRun(run.workspaceId, runDir), run);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    });
  } finally {
    await client.end();
    await f.close();
  }
});
